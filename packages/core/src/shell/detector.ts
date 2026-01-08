/**
 * Shell Detection Module
 *
 * Detects the current shell environment and provides shell-specific
 * configuration paths and settings.
 *
 * @module shell/detector
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

import type { ShellConfig, ShellDetectionResult, ShellType } from "./types.js";

// =============================================================================
// Constants
// =============================================================================

/**
 * Shell configuration lookup table
 */
const SHELL_CONFIGS: Record<ShellType, () => ShellConfig> = {
  bash: () => ({
    shell: "bash",
    rcFiles: [join(homedir(), ".bashrc")],
    profileFiles: [join(homedir(), ".bash_profile"), join(homedir(), ".profile")],
    completionDir: "/etc/bash_completion.d",
    pathVar: "PATH",
    exportCommand: "export",
    commentPrefix: "#",
  }),

  zsh: () => ({
    shell: "zsh",
    rcFiles: [join(homedir(), ".zshrc")],
    profileFiles: [join(homedir(), ".zprofile"), join(homedir(), ".zshenv")],
    completionDir: join(homedir(), ".zsh/completions"),
    pathVar: "PATH",
    exportCommand: "export",
    commentPrefix: "#",
  }),

  fish: () => ({
    shell: "fish",
    rcFiles: [join(homedir(), ".config", "fish", "config.fish")],
    profileFiles: [],
    completionDir: join(homedir(), ".config", "fish", "completions"),
    pathVar: "PATH",
    exportCommand: "set -gx",
    commentPrefix: "#",
  }),

  powershell: () => ({
    shell: "powershell",
    rcFiles: [getPowerShellProfilePath()],
    profileFiles: [],
    pathVar: "PATH",
    exportCommand: "$env:",
    commentPrefix: "#",
  }),

  pwsh: () => ({
    shell: "pwsh",
    rcFiles: [getPwshProfilePath()],
    profileFiles: [],
    pathVar: "PATH",
    exportCommand: "$env:",
    commentPrefix: "#",
  }),

  cmd: () => ({
    shell: "cmd",
    rcFiles: [],
    profileFiles: [],
    pathVar: "PATH",
    exportCommand: "set",
    commentPrefix: "REM",
  }),
};

/**
 * Get PowerShell (Windows) profile path
 */
function getPowerShellProfilePath(): string {
  if (process.platform === "win32") {
    return join(
      process.env.USERPROFILE ?? homedir(),
      "Documents",
      "WindowsPowerShell",
      "Microsoft.PowerShell_profile.ps1"
    );
  }
  return join(homedir(), ".config", "powershell", "Microsoft.PowerShell_profile.ps1");
}

/**
 * Get pwsh (cross-platform PowerShell) profile path
 */
function getPwshProfilePath(): string {
  if (process.platform === "win32") {
    return join(
      process.env.USERPROFILE ?? homedir(),
      "Documents",
      "PowerShell",
      "Microsoft.PowerShell_profile.ps1"
    );
  }
  return join(homedir(), ".config", "powershell", "Microsoft.PowerShell_profile.ps1");
}

// =============================================================================
// Shell Detection
// =============================================================================

/**
 * Detect the current shell from environment
 *
 * Detection order:
 * 1. $SHELL environment variable (Unix)
 * 2. Parent process name
 * 3. $ComSpec (Windows)
 * 4. Default to bash (Unix) or powershell (Windows)
 *
 * @returns Detected shell information
 */
export function detectShell(): ShellDetectionResult {
  const shellEnv = process.env.SHELL;
  const comSpec = process.env.ComSpec;

  // Check for PowerShell environment variables (set when running inside PowerShell)
  if (process.env.PSModulePath) {
    // Determine if it's pwsh or powershell
    const isPwsh =
      process.env.POWERSHELL_DISTRIBUTION_CHANNEL?.includes("PSCore") ||
      process.env.TERM_PROGRAM === "pwsh";

    const shellType: ShellType = isPwsh ? "pwsh" : "powershell";
    return {
      shell: shellType,
      path: shellType === "pwsh" ? "pwsh" : "powershell.exe",
      isDefault: true,
    };
  }

  // Unix: Check $SHELL
  if (shellEnv) {
    const shellName = basename(shellEnv).toLowerCase();
    const shellType = parseShellName(shellName);
    if (shellType) {
      return {
        shell: shellType,
        path: shellEnv,
        isDefault: true,
      };
    }
  }

  // Windows: Check ComSpec
  if (process.platform === "win32") {
    if (comSpec?.toLowerCase().includes("cmd.exe")) {
      return {
        shell: "cmd",
        path: comSpec,
        isDefault: true,
      };
    }
    // Default to PowerShell on Windows
    return {
      shell: "powershell",
      path: "powershell.exe",
      isDefault: true,
    };
  }

  // Default to bash on Unix
  return {
    shell: "bash",
    path: "/bin/bash",
    isDefault: true,
  };
}

/**
 * Parse shell name to ShellType
 *
 * @param name - Shell name (e.g., "bash", "zsh")
 * @returns ShellType or undefined if not recognized
 */
function parseShellName(name: string): ShellType | undefined {
  const normalized = name.toLowerCase().replace(/\.exe$/, "");

  switch (normalized) {
    case "bash":
      return "bash";
    case "zsh":
      return "zsh";
    case "fish":
      return "fish";
    case "powershell":
      return "powershell";
    case "pwsh":
      return "pwsh";
    case "cmd":
      return "cmd";
    default:
      return undefined;
  }
}

/**
 * Get shell configuration for a specific shell type
 *
 * @param shell - Shell type
 * @returns Shell configuration
 */
export function getShellConfig(shell: ShellType): ShellConfig {
  const configFn = SHELL_CONFIGS[shell];
  if (!configFn) {
    throw new Error(`Unsupported shell: ${shell}`);
  }
  return configFn();
}

/**
 * Get all supported shell types
 *
 * @returns Array of supported shell types
 */
export function getSupportedShells(): readonly ShellType[] {
  return ["bash", "zsh", "fish", "powershell", "pwsh", "cmd"] as const;
}

/**
 * Check if a shell type is supported
 *
 * @param shell - Shell name to check
 * @returns Whether the shell is supported
 */
export function isShellSupported(shell: string): shell is ShellType {
  return getSupportedShells().includes(shell as ShellType);
}

/**
 * Find existing RC file for a shell
 *
 * @param shell - Shell type
 * @returns Path to existing RC file, or first RC file path if none exist
 */
export function findExistingRcFile(shell: ShellType): string {
  const config = getShellConfig(shell);

  // Find first existing RC file
  for (const rcFile of config.rcFiles) {
    if (existsSync(rcFile)) {
      return rcFile;
    }
  }

  // Return first RC file path (will be created)
  return config.rcFiles[0] ?? "";
}

/**
 * Get the primary RC file path for a shell
 *
 * @param shell - Shell type
 * @returns Primary RC file path
 */
export function getPrimaryRcFile(shell: ShellType): string {
  const config = getShellConfig(shell);
  return config.rcFiles[0] ?? "";
}

/**
 * Detect all installed shells on the system
 *
 * @returns Array of detected shells
 */
export function detectInstalledShells(): ShellDetectionResult[] {
  const results: ShellDetectionResult[] = [];
  const defaultShell = detectShell();

  // Common shell paths
  const shellPaths: Record<ShellType, string[]> = {
    bash: ["/bin/bash", "/usr/bin/bash", "/usr/local/bin/bash"],
    zsh: ["/bin/zsh", "/usr/bin/zsh", "/usr/local/bin/zsh"],
    fish: ["/usr/bin/fish", "/usr/local/bin/fish"],
    powershell: ["powershell.exe", "/usr/bin/pwsh"],
    pwsh: ["pwsh", "/usr/bin/pwsh", "/usr/local/bin/pwsh"],
    cmd: ["cmd.exe"],
  };

  for (const [shell, paths] of Object.entries(shellPaths) as [ShellType, string[]][]) {
    for (const shellPath of paths) {
      if (existsSync(shellPath)) {
        results.push({
          shell,
          path: shellPath,
          isDefault: shell === defaultShell.shell,
        });
        break; // Only add first found path for each shell
      }
    }
  }

  // On Windows, PowerShell is always available
  if (process.platform === "win32") {
    if (!results.some((r) => r.shell === "powershell")) {
      results.push({
        shell: "powershell",
        path: "powershell.exe",
        isDefault: defaultShell.shell === "powershell",
      });
    }
    if (!results.some((r) => r.shell === "cmd")) {
      results.push({
        shell: "cmd",
        path: "cmd.exe",
        isDefault: defaultShell.shell === "cmd",
      });
    }
  }

  return results;
}
