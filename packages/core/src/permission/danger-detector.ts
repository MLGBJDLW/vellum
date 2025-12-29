/**
 * Dangerous Operation Detector for Vellum
 *
 * Integrates CommandSafetyClassifier and ProtectedFilesManager
 * to detect dangerous operations and provide risk assessments.
 *
 * @module @vellum/core/permission
 */

import { CommandSafetyClassifier } from "./command-safety.js";
import { ProtectedFilesManager } from "./protected-files.js";

// ============================================
// Types
// ============================================

/**
 * Severity level for dangerous operations.
 */
export type DangerSeverity = "low" | "medium" | "high" | "critical";

/**
 * Type of operation being checked.
 */
export type OperationType = "command" | "file" | "network" | "system";

/**
 * Result of a danger check.
 */
export interface DangerCheckResult {
  /** Whether the operation is considered dangerous */
  isDangerous: boolean;
  /** Human-readable reason for the assessment */
  reason: string;
  /** Severity level of the danger */
  severity: DangerSeverity;
  /** Type of operation */
  operationType: OperationType;
  /** Additional details about the detection */
  details?: {
    /** Pattern that matched (if applicable) */
    matchedPattern?: string;
    /** Files involved (if applicable) */
    affectedFiles?: string[];
    /** Specific risk factors identified */
    riskFactors?: string[];
  };
}

/**
 * Options for checking a command.
 */
export interface CommandCheckOptions {
  /** Working directory for the command */
  cwd?: string;
  /** Files that will be affected by the command */
  affectedFiles?: string[];
}

/**
 * Options for checking a file operation.
 */
export interface FileCheckOptions {
  /** Type of file operation */
  operation: "read" | "write" | "delete" | "execute";
}

// ============================================
// Pipe Detection Patterns
// ============================================

/**
 * Patterns for detecting dangerous pipe commands (EC-005).
 * These patterns detect when safe input is piped to dangerous commands.
 */
const DANGEROUS_PIPE_PATTERNS: readonly RegExp[] = [
  // Input piped to destructive commands
  /\|\s*rm\s+(-[a-z]*\s+)*\//i,
  /\|\s*rm\s+(-[a-z]*\s+)*--no-preserve-root/i,
  /\|\s*rm\s+-[a-z]*r[a-z]*\s+-[a-z]*f/i,
  /\|\s*rm\s+-[a-z]*f[a-z]*\s+-[a-z]*r/i,
  /\|\s*rm\s+-rf/i,
  /\|\s*rm\s+-fr/i,

  // Input piped to shell execution
  /\|\s*sh\b/i,
  /\|\s*bash\b/i,
  /\|\s*zsh\b/i,
  /\|\s*ksh\b/i,
  /\|\s*csh\b/i,
  /\|\s*dash\b/i,
  /\|\s*fish\b/i,
  /\|\s*powershell\b/i,
  /\|\s*pwsh\b/i,

  // Input piped to privilege escalation
  /\|\s*sudo\b/i,
  /\|\s*su\b/i,
  /\|\s*doas\b/i,

  // Input piped to file overwrite
  /\|\s*tee\s+(-a\s+)?\/etc\//i,
  /\|\s*dd\s+of=/i,

  // eval/exec patterns
  /\|\s*xargs\s+(-[a-z]*\s+)*rm/i,
  /\|\s*xargs\s+(-[a-z]*\s+)*sh/i,
  /\|\s*xargs\s+(-[a-z]*\s+)*bash/i,
];

/**
 * Patterns for detecting command chaining attacks.
 */
const DANGEROUS_CHAIN_PATTERNS: readonly RegExp[] = [
  // Safe command chained with dangerous
  /;\s*rm\s+-[a-z]*r/i,
  /&&\s*rm\s+-[a-z]*r/i,
  /\|\|\s*rm\s+-[a-z]*r/i,

  // Subshell execution
  /\$\(.*rm\s+-[a-z]*r/i,
  /`.*rm\s+-[a-z]*r/i,
];

// ============================================
// DangerousOperationDetector
// ============================================

/**
 * Detects dangerous operations by integrating command safety
 * classification and protected files management.
 *
 * Features:
 * - Command safety classification
 * - Protected file detection
 * - Pipe command detection (EC-005)
 * - Severity assessment
 *
 * @example
 * ```typescript
 * const detector = new DangerousOperationDetector();
 *
 * // Check a command
 * const result = detector.checkCommand('rm -rf /');
 * // { isDangerous: true, reason: '...', severity: 'critical', ... }
 *
 * // Check a file operation
 * const fileResult = detector.checkFile('.env', { operation: 'read' });
 * // { isDangerous: true, reason: 'Protected file', severity: 'high', ... }
 *
 * // Check pipe commands (EC-005)
 * const pipeResult = detector.checkCommand('cat file | rm -rf /');
 * // { isDangerous: true, reason: 'Pipe to dangerous command', severity: 'critical', ... }
 * ```
 */
export class DangerousOperationDetector {
  readonly #commandClassifier: CommandSafetyClassifier;
  readonly #protectedFiles: ProtectedFilesManager;

  /**
   * Creates a new DangerousOperationDetector.
   *
   * @param options - Configuration options
   */
  constructor(
    options: {
      commandClassifier?: CommandSafetyClassifier;
      protectedFilesManager?: ProtectedFilesManager;
    } = {}
  ) {
    this.#commandClassifier = options.commandClassifier ?? new CommandSafetyClassifier();
    this.#protectedFiles = options.protectedFilesManager ?? new ProtectedFilesManager();
  }

  /**
   * Check if a command is dangerous.
   *
   * @param command - Shell command to check
   * @param options - Additional options
   * @returns Danger check result
   */
  checkCommand(command: string, options: CommandCheckOptions = {}): DangerCheckResult {
    const trimmedCommand = command.trim();
    const riskFactors: string[] = [];

    // Check for dangerous pipe patterns (EC-005)
    const pipeCheck = this.#checkPipePatterns(trimmedCommand);
    if (pipeCheck.isDangerous) {
      return pipeCheck;
    }

    // Check for command chaining attacks
    const chainCheck = this.#checkChainPatterns(trimmedCommand);
    if (chainCheck.isDangerous) {
      return chainCheck;
    }

    // Use command classifier for base classification
    const classification = this.#commandClassifier.classify(trimmedCommand);

    // Check if command affects protected files
    const affectedFiles = options.affectedFiles ?? this.#extractFilePaths(trimmedCommand);
    const protectedCheck = this.#checkProtectedFiles(affectedFiles);
    if (protectedCheck.affectedFiles.length > 0) {
      riskFactors.push(`Affects protected files: ${protectedCheck.affectedFiles.join(", ")}`);
    }

    // Determine final result based on classification
    if (classification.level === "dangerous") {
      return {
        isDangerous: true,
        reason: classification.reason ?? "Command matches dangerous pattern",
        severity: this.#classifyCommandSeverity(
          trimmedCommand,
          protectedCheck.affectedFiles.length > 0
        ),
        operationType: "command",
        details: {
          matchedPattern: classification.matchedPattern,
          affectedFiles: protectedCheck.affectedFiles,
          riskFactors: riskFactors.length > 0 ? riskFactors : undefined,
        },
      };
    }

    // If command affects protected files, consider it dangerous
    if (protectedCheck.affectedFiles.length > 0 && this.#isModifyingCommand(trimmedCommand)) {
      return {
        isDangerous: true,
        reason: `Command modifies protected files: ${protectedCheck.affectedFiles.join(", ")}`,
        severity: "high",
        operationType: "command",
        details: {
          affectedFiles: protectedCheck.affectedFiles,
          riskFactors,
        },
      };
    }

    // Command is not dangerous
    return {
      isDangerous: false,
      reason: classification.reason ?? "Command classified as safe or normal",
      severity: "low",
      operationType: "command",
      details: {
        matchedPattern: classification.matchedPattern,
        riskFactors: riskFactors.length > 0 ? riskFactors : undefined,
      },
    };
  }

  /**
   * Check if a file path is dangerous to access.
   *
   * @param filePath - Path to the file
   * @param options - File operation options
   * @returns Danger check result
   */
  checkFile(filePath: string, options: FileCheckOptions): DangerCheckResult {
    const isProtected = this.#protectedFiles.isProtected(filePath);

    if (isProtected) {
      const severity = this.#classifyFileSeverity(filePath, options.operation);
      return {
        isDangerous: true,
        reason: `File "${filePath}" is protected (${options.operation} operation)`,
        severity,
        operationType: "file",
        details: {
          affectedFiles: [filePath],
          riskFactors: [`Protected file pattern match`, `Operation: ${options.operation}`],
        },
      };
    }

    return {
      isDangerous: false,
      reason: "File is not protected",
      severity: "low",
      operationType: "file",
    };
  }

  /**
   * Perform a comprehensive check on an operation.
   *
   * This is a convenience method that routes to the appropriate
   * specific check method based on the operation type.
   *
   * @param operation - Operation details
   * @returns Danger check result
   */
  check(operation: {
    type: OperationType;
    command?: string;
    filePath?: string;
    fileOperation?: "read" | "write" | "delete" | "execute";
    affectedFiles?: string[];
  }): DangerCheckResult {
    switch (operation.type) {
      case "command":
        if (!operation.command) {
          return {
            isDangerous: false,
            reason: "No command provided",
            severity: "low",
            operationType: "command",
          };
        }
        return this.checkCommand(operation.command, {
          affectedFiles: operation.affectedFiles,
        });

      case "file":
        if (!operation.filePath) {
          return {
            isDangerous: false,
            reason: "No file path provided",
            severity: "low",
            operationType: "file",
          };
        }
        return this.checkFile(operation.filePath, {
          operation: operation.fileOperation ?? "read",
        });

      case "network":
        // Network operations are not dangerous by default
        return {
          isDangerous: false,
          reason: "Network operation",
          severity: "low",
          operationType: "network",
        };

      case "system":
        // System operations require specific handling
        return {
          isDangerous: true,
          reason: "System operation requires explicit approval",
          severity: "medium",
          operationType: "system",
        };

      default:
        return {
          isDangerous: false,
          reason: "Unknown operation type",
          severity: "low",
          operationType: operation.type,
        };
    }
  }

  /**
   * Get the underlying command classifier.
   */
  get commandClassifier(): CommandSafetyClassifier {
    return this.#commandClassifier;
  }

  /**
   * Get the underlying protected files manager.
   */
  get protectedFilesManager(): ProtectedFilesManager {
    return this.#protectedFiles;
  }

  // ============================================
  // Private Methods
  // ============================================

  /**
   * Check for dangerous pipe patterns (EC-005).
   */
  #checkPipePatterns(command: string): DangerCheckResult {
    for (const pattern of DANGEROUS_PIPE_PATTERNS) {
      if (pattern.test(command)) {
        return {
          isDangerous: true,
          reason: "Command pipes input to dangerous operation",
          severity: "critical",
          operationType: "command",
          details: {
            matchedPattern: pattern.source,
            riskFactors: ["Pipe to dangerous command detected (EC-005)"],
          },
        };
      }
    }

    return {
      isDangerous: false,
      reason: "No dangerous pipe patterns detected",
      severity: "low",
      operationType: "command",
    };
  }

  /**
   * Check for dangerous command chaining patterns.
   */
  #checkChainPatterns(command: string): DangerCheckResult {
    for (const pattern of DANGEROUS_CHAIN_PATTERNS) {
      if (pattern.test(command)) {
        return {
          isDangerous: true,
          reason: "Command contains dangerous chained operation",
          severity: "critical",
          operationType: "command",
          details: {
            matchedPattern: pattern.source,
            riskFactors: ["Command chaining attack detected"],
          },
        };
      }
    }

    return {
      isDangerous: false,
      reason: "No dangerous chain patterns detected",
      severity: "low",
      operationType: "command",
    };
  }

  /**
   * Check if any files are protected.
   */
  #checkProtectedFiles(filePaths: string[]): { affectedFiles: string[] } {
    const affectedFiles: string[] = [];
    for (const filePath of filePaths) {
      // Skip empty paths and root paths
      if (!filePath || filePath.trim() === "" || filePath === "/") {
        continue;
      }
      if (this.#protectedFiles.isProtected(filePath)) {
        affectedFiles.push(filePath);
      }
    }
    return { affectedFiles };
  }

  /**
   * Extract file paths from a command.
   */
  #extractFilePaths(command: string): string[] {
    const paths: string[] = [];

    // Simple heuristic: extract quoted strings and path-like tokens
    // This is not perfect but covers common cases

    // Match quoted strings
    const quotedMatches = command.match(/["']([^"']+)["']/g);
    if (quotedMatches) {
      for (const match of quotedMatches) {
        const path = match.slice(1, -1);
        if (this.#looksLikePath(path)) {
          paths.push(path);
        }
      }
    }

    // Match path-like tokens (contains / or \ or starts with . or ~)
    const tokens = command.split(/\s+/);
    for (const token of tokens) {
      const cleaned = token.replace(/^["']|["']$/g, "");
      if (this.#looksLikePath(cleaned) && !paths.includes(cleaned)) {
        paths.push(cleaned);
      }
    }

    return paths;
  }

  /**
   * Check if a string looks like a file path.
   */
  #looksLikePath(str: string): boolean {
    if (!str || str.length === 0) return false;

    // Common path patterns
    return (
      str.startsWith("/") ||
      str.startsWith("./") ||
      str.startsWith("../") ||
      str.startsWith("~") ||
      str.includes("/") ||
      str.includes("\\") ||
      /^[a-zA-Z]:\\/.test(str) || // Windows absolute
      /\.[a-zA-Z0-9]+$/.test(str) // Has file extension
    );
  }

  /**
   * Check if a command modifies files.
   */
  #isModifyingCommand(command: string): boolean {
    const modifyingCommands = [
      "rm",
      "mv",
      "cp",
      "touch",
      "mkdir",
      "rmdir",
      "chmod",
      "chown",
      "chgrp",
      "sed",
      "awk",
      "perl",
      "python",
      "echo",
      "cat",
      "tee", // Only when redirecting
      "git",
      "npm",
      "pnpm",
      "yarn",
    ];

    const firstToken = command.split(/\s+/)[0]?.toLowerCase() ?? "";

    // Check for redirects
    if (command.includes(">") || command.includes(">>")) {
      return true;
    }

    return modifyingCommands.some((cmd) => firstToken === cmd || firstToken.endsWith(`/${cmd}`));
  }

  /**
   * Classify the severity of a dangerous command.
   */
  #classifyCommandSeverity(command: string, affectsProtected: boolean): DangerSeverity {
    const lowerCommand = command.toLowerCase();

    // Critical: Root destruction, system wipe
    if (
      /rm\s+(-[a-z]*\s+)*\/($|\s)/.test(lowerCommand) ||
      /rm\s+.*--no-preserve-root/.test(lowerCommand) ||
      /mkfs/.test(lowerCommand) ||
      /dd\s+.*of=\/dev/.test(lowerCommand) ||
      /:.*\(\).*\{.*:.*\|.*:.*&.*\}.*:/.test(command) // Fork bomb
    ) {
      return "critical";
    }

    // High: Destructive operations, privileged access
    if (
      /rm\s+-[a-z]*r/.test(lowerCommand) ||
      /sudo/.test(lowerCommand) ||
      /chmod\s+777/.test(lowerCommand) ||
      affectsProtected
    ) {
      return "high";
    }

    // Medium: Potentially harmful
    if (
      /rm\s+/.test(lowerCommand) ||
      /git\s+(push|reset).*--force/.test(lowerCommand) ||
      /kill/.test(lowerCommand)
    ) {
      return "medium";
    }

    // Low: Minor risk
    return "low";
  }

  /**
   * Classify the severity of a file operation.
   */
  #classifyFileSeverity(
    filePath: string,
    operation: "read" | "write" | "delete" | "execute"
  ): DangerSeverity {
    const lowerPath = filePath.toLowerCase();

    // Critical files (keys, credentials)
    const criticalPatterns = [
      /\.key$/,
      /\.pem$/,
      /id_rsa/,
      /id_ed25519/,
      /credentials/,
      /password/,
    ];
    if (criticalPatterns.some((p) => p.test(lowerPath))) {
      return operation === "read" ? "high" : "critical";
    }

    // High sensitivity (env files, secrets)
    const highPatterns = [/\.env/, /secret/];
    if (highPatterns.some((p) => p.test(lowerPath))) {
      return operation === "read" ? "medium" : "high";
    }

    // Default based on operation
    switch (operation) {
      case "delete":
        return "high";
      case "write":
      case "execute":
        return "medium";
      default:
        return "low";
    }
  }
}
