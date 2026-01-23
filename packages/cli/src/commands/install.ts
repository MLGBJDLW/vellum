/**
 * Install/Uninstall Commands (Phase 37)
 * @module cli/commands/install
 */

import { runShellSetup, type SetupCommandResult } from "./shell/setup.js";
import type { CommandResult, SlashCommand } from "./types.js";
import { error, success } from "./types.js";

export interface InstallCommandOptions {
  shell?: string;
  force?: boolean;
}

export interface InstallCommandResult {
  success: boolean;
  message?: string;
}

export interface UninstallCommandOptions {
  shell?: string;
  force?: boolean;
}

/**
 * Install command
 */
export const installCommand: SlashCommand = {
  name: "install",
  description: "Install shell integration (PATH, completions)",
  kind: "builtin",
  category: "system",
  aliases: ["shell-install"],
  execute: async (): Promise<CommandResult> => {
    try {
      const result = await runShellSetup({ uninstall: false, nonInteractive: true });
      return result.success ? success(result.message) : error("INTERNAL_ERROR", result.message);
    } catch (err) {
      return error(
        "INTERNAL_ERROR",
        `Install failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  },
};

/**
 * Uninstall command
 */
export const uninstallCommand: SlashCommand = {
  name: "uninstall",
  description: "Uninstall shell integration",
  kind: "builtin",
  category: "system",
  aliases: ["shell-uninstall"],
  execute: async (): Promise<CommandResult> => {
    try {
      const result = await runShellSetup({ uninstall: true, nonInteractive: true });
      return result.success ? success(result.message) : error("INTERNAL_ERROR", result.message);
    } catch (err) {
      return error(
        "INTERNAL_ERROR",
        `Uninstall failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  },
};

/**
 * Execute install
 */
export async function executeInstall(
  options?: InstallCommandOptions
): Promise<InstallCommandResult> {
  const result = await runShellSetup({
    shell: options?.shell,
    force: options?.force,
    uninstall: false,
  });
  return { success: result.success, message: result.message };
}

/**
 * Execute uninstall
 */
export async function executeUninstall(
  options?: UninstallCommandOptions
): Promise<InstallCommandResult> {
  const result = await runShellSetup({
    shell: options?.shell,
    force: options?.force,
    uninstall: true,
  });
  return { success: result.success, message: result.message };
}

/**
 * Handle install
 */
export async function handleInstall(options?: InstallCommandOptions): Promise<void> {
  await executeInstall(options);
}

/**
 * Handle uninstall
 */
export async function handleUninstall(options?: UninstallCommandOptions): Promise<void> {
  await executeUninstall(options);
}

/**
 * Print install result
 */
export function printInstallResult(result: InstallCommandResult): void {
  console.log(result.message ?? (result.success ? "Installed" : "Install failed"));
}

/**
 * Print uninstall result
 */
export function printUninstallResult(result: InstallCommandResult): void {
  console.log(result.message ?? (result.success ? "Uninstalled" : "Uninstall failed"));
}

// Re-export SetupCommandResult for convenience
export type { SetupCommandResult };
