/**
 * Updater (Phase 39)
 *
 * Performs the actual update operation using npm or bun.
 * Handles the update process and provides status feedback.
 *
 * @module core/update/updater
 */

import { spawn } from "node:child_process";

import type { UpdateConfig, UpdateResult } from "./types.js";
import { DEFAULT_UPDATE_CONFIG } from "./types.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Package manager type
 */
export type PackageManager = "npm" | "bun" | "pnpm";

/**
 * Update options
 */
export interface UpdateOptions {
  /** Target version to update to (default: latest) */
  readonly targetVersion?: string;
  /** Whether to install globally */
  readonly global?: boolean;
  /** Package manager to use */
  readonly packageManager?: PackageManager;
  /** Whether to run in dry-run mode (no actual update) */
  readonly dryRun?: boolean;
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Detect the package manager used to install the CLI
 */
export function detectPackageManager(): PackageManager {
  // Check environment variable set by package managers
  const execPath = process.env.npm_execpath ?? "";

  if (execPath.includes("bun")) {
    return "bun";
  }
  if (execPath.includes("pnpm")) {
    return "pnpm";
  }

  // Check if bun is available
  const bunPath = process.env.BUN_INSTALL;
  if (bunPath) {
    return "bun";
  }

  // Default to npm
  return "npm";
}

/**
 * Build the update command for a package manager
 */
function buildUpdateCommand(
  pm: PackageManager,
  packageName: string,
  options: UpdateOptions
): { command: string; args: string[] } {
  const version = options.targetVersion ?? "latest";
  const packageSpec = `${packageName}@${version}`;

  switch (pm) {
    case "bun":
      return {
        command: "bun",
        args: [options.global ? "add" : "install", ...(options.global ? ["-g"] : []), packageSpec],
      };

    case "pnpm":
      return {
        command: "pnpm",
        args: [options.global ? "add" : "install", ...(options.global ? ["-g"] : []), packageSpec],
      };

    case "npm":
    default:
      return {
        command: "npm",
        args: ["install", ...(options.global ? ["-g"] : []), packageSpec],
      };
  }
}

/**
 * Execute a command and return the result
 */
function executeCommand(
  command: string,
  args: string[]
): Promise<{ success: boolean; output: string; error?: string }> {
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve({ success: true, output: stdout });
      } else {
        resolve({
          success: false,
          output: stdout,
          error: stderr || `Process exited with code ${code}`,
        });
      }
    });

    proc.on("error", (err) => {
      resolve({
        success: false,
        output: stdout,
        error: err.message,
      });
    });
  });
}

// =============================================================================
// Updater Class
// =============================================================================

/**
 * Updater for performing package updates
 */
export class Updater {
  private readonly config: UpdateConfig;

  /**
   * Create a new updater
   *
   * @param config - Update configuration
   */
  constructor(config: Partial<UpdateConfig> = {}) {
    this.config = { ...DEFAULT_UPDATE_CONFIG, ...config };
  }

  /**
   * Perform an update
   *
   * @param currentVersion - Current installed version
   * @param options - Update options
   * @returns Update result
   */
  async update(currentVersion: string, options: UpdateOptions = {}): Promise<UpdateResult> {
    const pm = options.packageManager ?? detectPackageManager();
    const { command, args } = buildUpdateCommand(pm, this.config.packageName, {
      ...options,
      global: options.global ?? true, // Default to global install for CLI
    });

    // In dry-run mode, just return what would happen
    if (options.dryRun) {
      return {
        success: true,
        previousVersion: currentVersion,
        newVersion: options.targetVersion ?? "latest",
        requiresRestart: true,
      };
    }

    const result = await executeCommand(command, args);

    if (!result.success) {
      return {
        success: false,
        previousVersion: currentVersion,
        error: result.error ?? "Update failed",
        requiresRestart: false,
      };
    }

    return {
      success: true,
      previousVersion: currentVersion,
      newVersion: options.targetVersion ?? "latest",
      requiresRestart: true,
    };
  }

  /**
   * Check if the package manager is available
   *
   * @param pm - Package manager to check
   * @returns Whether the package manager is available
   */
  async isPackageManagerAvailable(pm: PackageManager): Promise<boolean> {
    const versionArg = pm === "npm" ? "-v" : "--version";
    const result = await executeCommand(pm, [versionArg]);
    return result.success;
  }

  /**
   * Get the recommended package manager
   * Tries to find an available one in order: bun > pnpm > npm
   */
  async getRecommendedPackageManager(): Promise<PackageManager> {
    // Check in order of preference
    const managers: PackageManager[] = ["bun", "pnpm", "npm"];

    for (const pm of managers) {
      if (await this.isPackageManagerAvailable(pm)) {
        return pm;
      }
    }

    // Fall back to npm (it should always be available with Node.js)
    return "npm";
  }
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Perform an update using default configuration
 *
 * @param currentVersion - Current installed version
 * @param options - Update options
 * @returns Update result
 */
export async function performUpdate(
  currentVersion: string,
  options?: UpdateOptions
): Promise<UpdateResult> {
  const updater = new Updater();
  return updater.update(currentVersion, options);
}
