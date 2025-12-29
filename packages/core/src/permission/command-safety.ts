/**
 * Command Safety Classifier for Vellum
 *
 * Classifies shell commands by safety level using pattern matching.
 * Supports wildcard patterns for flexible command classification.
 *
 * @module @vellum/core/permission
 */

import { Wildcard } from "./wildcard.js";

// ============================================
// Types
// ============================================

/**
 * Safety level for shell commands.
 * - safe: Command can be auto-approved (read-only, informational)
 * - normal: Standard command, may need user confirmation
 * - dangerous: High-risk command, should require explicit approval
 */
export type SafetyLevel = "safe" | "normal" | "dangerous";

/**
 * Result of command classification.
 */
export interface ClassificationResult {
  /** The determined safety level */
  level: SafetyLevel;
  /** The pattern that matched (if any) */
  matchedPattern?: string;
  /** Reason for the classification */
  reason?: string;
}

// ============================================
// Default Patterns
// ============================================

/**
 * Default patterns for safe commands.
 * These are read-only or informational commands that can be auto-approved.
 */
export const SAFE_PATTERNS: readonly string[] = [
  // Listing and viewing
  "ls",
  "ls *",
  "ll",
  "ll *",
  "dir",
  "dir *",
  "cat *",
  "head *",
  "tail *",
  "less *",
  "more *",

  // Information commands
  "pwd",
  "whoami",
  "hostname",
  "date",
  "uptime",
  "uname *",

  // Git read-only
  "git status",
  "git status *",
  "git log",
  "git log *",
  "git diff",
  "git diff *",
  "git show",
  "git show *",
  "git branch",
  "git branch --list",
  "git branch -l",
  "git branch -a",
  "git remote -v",
  "git stash list",
  "git tag",
  "git tag -l",
  "git blame *",

  // Code analysis
  "wc *",
  "grep *",
  "find *",
  "which *",
  "type *",

  // Package info (read-only)
  "npm list",
  "npm list *",
  "npm ls",
  "npm ls *",
  "npm outdated",
  "pnpm list",
  "pnpm list *",
  "pnpm ls",
  "pnpm outdated",
  "yarn list",
  "yarn list *",
  "pip list",
  "pip show *",
  "pip freeze",

  // Environment info
  "node --version",
  "node -v",
  "npm --version",
  "npm -v",
  "pnpm --version",
  "pnpm -v",
  "python --version",
  "python -V",
  "python3 --version",
  "python3 -V",

  // Echo and printing
  "echo *",
  "printf *",
];

/**
 * Default patterns for dangerous commands.
 * These commands can cause significant damage and should require explicit approval.
 */
export const DANGEROUS_PATTERNS: readonly string[] = [
  // Destructive file operations
  "rm -rf *",
  "rm -fr *",
  "rm -r *",
  "rmdir *",
  "shred *",

  // System modification
  "sudo *",
  "su *",
  "doas *",
  "pkexec *",

  // Permission changes
  "chmod 777 *",
  "chmod -R *",
  "chown *",
  "chgrp *",

  // Disk operations
  "mkfs*",
  "mkfs *",
  "dd if=*",
  "fdisk *",
  "parted *",
  "format *",

  // Network risky
  "curl * | sh",
  "curl * | bash",
  "wget * | sh",
  "wget * | bash",
  "wget -O - * | sh",
  "wget -O - * | bash",

  // Process/service control
  "kill -9 *",
  "killall *",
  "pkill *",
  "systemctl stop *",
  "systemctl disable *",
  "service * stop",

  // Git destructive
  "git push --force",
  "git push -f",
  "git reset --hard *",
  "git clean -fd",
  "git clean -fdx",

  // Environment modification
  "export PATH=*",
  "unset *",

  // Package removal (system-wide)
  "npm uninstall -g *",
  "pnpm remove -g *",
  "pip uninstall *",
  "apt remove *",
  "apt purge *",
  "apt-get remove *",
  "yum remove *",
  "dnf remove *",

  // Database destructive
  "drop database *",
  "drop table *",
  "truncate *",

  // Shell history
  "history -c",

  // Dangerous redirects
  "> /dev/*",
  ">> /dev/*",

  // Fork bomb patterns
  ":(){:|:&};:",
];

// ============================================
// CommandSafetyClassifier
// ============================================

/**
 * Classifies shell commands by safety level using pattern matching.
 *
 * Classification priority:
 * 1. Dangerous patterns (highest priority)
 * 2. Safe patterns
 * 3. Normal (default for unmatched commands)
 *
 * Features:
 * - Wildcard pattern matching (*, ?)
 * - Add custom patterns
 * - Default patterns for common commands
 * - Classification with reason tracking
 *
 * @example
 * ```typescript
 * const classifier = new CommandSafetyClassifier();
 *
 * classifier.classify('ls -la');           // { level: 'safe', ... }
 * classifier.classify('rm -rf /');         // { level: 'dangerous', ... }
 * classifier.classify('npm install');      // { level: 'normal', ... }
 *
 * classifier.addPattern('safe', 'my-tool *');
 * classifier.classify('my-tool run');      // { level: 'safe', ... }
 * ```
 */
export class CommandSafetyClassifier {
  #safePatterns: Set<string>;
  #dangerousPatterns: Set<string>;

  /**
   * Creates a new CommandSafetyClassifier.
   *
   * @param options - Configuration options
   */
  constructor(
    options: {
      useDefaults?: boolean;
      safePatterns?: string[];
      dangerousPatterns?: string[];
    } = {}
  ) {
    const useDefaults = options.useDefaults ?? true;

    // Initialize pattern sets
    this.#safePatterns = new Set<string>();
    this.#dangerousPatterns = new Set<string>();

    // Add default patterns if enabled
    if (useDefaults) {
      for (const pattern of SAFE_PATTERNS) {
        this.#safePatterns.add(pattern);
      }
      for (const pattern of DANGEROUS_PATTERNS) {
        this.#dangerousPatterns.add(pattern);
      }
    }

    // Add custom patterns
    if (options.safePatterns) {
      for (const pattern of options.safePatterns) {
        this.#safePatterns.add(pattern);
      }
    }
    if (options.dangerousPatterns) {
      for (const pattern of options.dangerousPatterns) {
        this.#dangerousPatterns.add(pattern);
      }
    }
  }

  /**
   * Classify a command by its safety level.
   *
   * @param command - Shell command to classify
   * @returns Classification result with level and matched pattern
   */
  classify(command: string): ClassificationResult {
    const trimmedCommand = command.trim();

    // Check dangerous patterns first (highest priority)
    for (const pattern of this.#dangerousPatterns) {
      if (Wildcard.matches(trimmedCommand, pattern)) {
        return {
          level: "dangerous",
          matchedPattern: pattern,
          reason: `Matches dangerous pattern: ${pattern}`,
        };
      }
    }

    // Check safe patterns
    for (const pattern of this.#safePatterns) {
      if (Wildcard.matches(trimmedCommand, pattern)) {
        return {
          level: "safe",
          matchedPattern: pattern,
          reason: `Matches safe pattern: ${pattern}`,
        };
      }
    }

    // Default to normal
    return {
      level: "normal",
      reason: "No matching pattern found, classified as normal",
    };
  }

  /**
   * Add a pattern to the classifier.
   *
   * @param level - Safety level for the pattern ('safe' or 'dangerous')
   * @param pattern - Wildcard pattern to add
   */
  addPattern(level: "safe" | "dangerous", pattern: string): void {
    if (level === "safe") {
      this.#safePatterns.add(pattern);
    } else {
      this.#dangerousPatterns.add(pattern);
    }
  }

  /**
   * Remove a pattern from the classifier.
   *
   * @param level - Safety level of the pattern
   * @param pattern - Pattern to remove
   * @returns true if the pattern was removed
   */
  removePattern(level: "safe" | "dangerous", pattern: string): boolean {
    if (level === "safe") {
      return this.#safePatterns.delete(pattern);
    } else {
      return this.#dangerousPatterns.delete(pattern);
    }
  }

  /**
   * Get all patterns for a safety level.
   *
   * @param level - Safety level to get patterns for
   * @returns Array of patterns
   */
  getPatterns(level: "safe" | "dangerous"): string[] {
    if (level === "safe") {
      return Array.from(this.#safePatterns);
    } else {
      return Array.from(this.#dangerousPatterns);
    }
  }

  /**
   * Clear all patterns (including defaults).
   */
  clear(): void {
    this.#safePatterns.clear();
    this.#dangerousPatterns.clear();
  }

  /**
   * Reset to default patterns only.
   */
  resetToDefaults(): void {
    this.#safePatterns.clear();
    this.#dangerousPatterns.clear();

    for (const pattern of SAFE_PATTERNS) {
      this.#safePatterns.add(pattern);
    }
    for (const pattern of DANGEROUS_PATTERNS) {
      this.#dangerousPatterns.add(pattern);
    }
  }

  /**
   * Get the count of patterns.
   */
  get size(): { safe: number; dangerous: number } {
    return {
      safe: this.#safePatterns.size,
      dangerous: this.#dangerousPatterns.size,
    };
  }
}
