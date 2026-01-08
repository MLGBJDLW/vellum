/**
 * Shell Setup Command
 *
 * Configures shell integration for Vellum CLI.
 * Adds Vellum to PATH, installs completions, and configures shell RC files.
 *
 * @module cli/commands/shell/setup
 */

import { existsSync } from "node:fs";

import { confirm, select } from "@inquirer/prompts";
import {
  detectInstalledShells,
  detectShell,
  getPrimaryRcFile,
  getSupportedShells,
  isShellConfigured,
  isShellSupported,
  patchShellConfig,
  removeShellConfig,
  type ShellType,
} from "@vellum/core";
import chalk from "chalk";

import { EXIT_CODES } from "../exit-codes.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Shell setup command options
 */
export interface ShellSetupOptions {
  /** Target shell (auto-detect if not specified) */
  shell?: string;
  /** Remove Vellum configuration instead of adding */
  uninstall?: boolean;
  /** Force overwrite without confirmation */
  force?: boolean;
  /** Skip backup creation */
  noBackup?: boolean;
  /** Dry run - show what would be done */
  dryRun?: boolean;
  /** Non-interactive mode (for CI) */
  nonInteractive?: boolean;
}

/**
 * Shell setup command result
 */
export interface SetupCommandResult {
  /** Whether setup succeeded */
  success: boolean;
  /** Exit code */
  exitCode: number;
  /** Message to display */
  message: string;
  /** Detailed info */
  details?: string[];
}

// =============================================================================
// Setup Implementation
// =============================================================================

/**
 * Get Vellum binary path from process
 *
 * @returns Path to Vellum binary or undefined
 */
function getVellumBinPath(): string | undefined {
  // Try to find vellum in the current process's directory
  const execPath = process.argv[1];
  if (execPath && existsSync(execPath)) {
    return execPath;
  }
  return undefined;
}

/**
 * Run shell setup command
 *
 * @param options - Setup options
 * @returns Setup result
 */
export async function runShellSetup(options: ShellSetupOptions = {}): Promise<SetupCommandResult> {
  const {
    shell: shellArg,
    uninstall = false,
    force = false,
    noBackup = false,
    dryRun = false,
    nonInteractive = false,
  } = options;

  // Validate shell argument if provided
  if (shellArg && !isShellSupported(shellArg)) {
    const supported = getSupportedShells().join(", ");
    return {
      success: false,
      exitCode: EXIT_CODES.USAGE_ERROR,
      message: `Unsupported shell: ${shellArg}`,
      details: [`Supported shells: ${supported}`],
    };
  }

  // Detect or use provided shell
  const targetShell: ShellType = shellArg ? (shellArg as ShellType) : detectShell().shell;

  // Skip CMD as it doesn't have RC file support
  if (targetShell === "cmd") {
    return {
      success: false,
      exitCode: EXIT_CODES.USAGE_ERROR,
      message: "CMD does not support shell integration",
      details: ["Consider using PowerShell instead:", "  vellum shell setup --shell=powershell"],
    };
  }

  const rcFile = getPrimaryRcFile(targetShell);
  const configured = isShellConfigured(targetShell);

  console.log(chalk.bold("\n🐚 Vellum Shell Setup\n"));
  console.log(`Target shell: ${chalk.cyan(targetShell)}`);
  console.log(`Config file:  ${chalk.dim(rcFile)}`);
  console.log(
    `Status:       ${configured ? chalk.green("configured") : chalk.yellow("not configured")}`
  );
  console.log("");

  // Handle uninstall
  if (uninstall) {
    return await handleUninstall(targetShell, { dryRun, noBackup, force, nonInteractive });
  }

  // Handle install
  return await handleInstall(targetShell, { dryRun, noBackup, force, nonInteractive, configured });
}

/**
 * Handle shell uninstallation
 */
async function handleUninstall(
  shell: ShellType,
  options: { dryRun: boolean; noBackup: boolean; force: boolean; nonInteractive: boolean }
): Promise<SetupCommandResult> {
  const { dryRun, force, nonInteractive } = options;

  if (!isShellConfigured(shell)) {
    return {
      success: true,
      exitCode: EXIT_CODES.SUCCESS,
      message: "Vellum is not configured for this shell",
    };
  }

  // Confirm uninstall
  if (!force && !nonInteractive) {
    const confirmed = await confirm({
      message: `Remove Vellum configuration from ${shell}?`,
      default: false,
    });

    if (!confirmed) {
      return {
        success: false,
        exitCode: EXIT_CODES.INTERRUPTED,
        message: "Uninstall cancelled",
      };
    }
  }

  if (dryRun) {
    const rcFile = getPrimaryRcFile(shell);
    console.log(chalk.yellow("\n[Dry Run] Would remove Vellum configuration from:"));
    console.log(`  ${rcFile}`);
    return {
      success: true,
      exitCode: EXIT_CODES.SUCCESS,
      message: "Dry run completed",
    };
  }

  // Remove configuration
  const result = await removeShellConfig(shell);

  if (result.success) {
    console.log(chalk.green("\n✓ Vellum configuration removed"));
    if (result.backupPath) {
      console.log(chalk.dim(`  Backup: ${result.backupPath}`));
    }
    return {
      success: true,
      exitCode: EXIT_CODES.SUCCESS,
      message: "Shell configuration removed",
      details: ["Restart your shell or run:", `  source ${getPrimaryRcFile(shell)}`],
    };
  }

  return {
    success: false,
    exitCode: EXIT_CODES.ERROR,
    message: result.error ?? "Failed to remove configuration",
  };
}

/**
 * Handle shell installation
 */
async function handleInstall(
  shell: ShellType,
  options: {
    dryRun: boolean;
    noBackup: boolean;
    force: boolean;
    nonInteractive: boolean;
    configured: boolean;
  }
): Promise<SetupCommandResult> {
  const { dryRun, noBackup, force, nonInteractive, configured } = options;

  // Check if already configured
  if (configured && !force) {
    if (nonInteractive) {
      return {
        success: true,
        exitCode: EXIT_CODES.SUCCESS,
        message: "Shell is already configured",
      };
    }

    const action = await select({
      message: "Vellum is already configured. What would you like to do?",
      choices: [
        { name: "Update configuration", value: "update" },
        { name: "Keep existing", value: "keep" },
        { name: "Remove configuration", value: "remove" },
      ],
    });

    if (action === "keep") {
      return {
        success: true,
        exitCode: EXIT_CODES.SUCCESS,
        message: "Keeping existing configuration",
      };
    }

    if (action === "remove") {
      return handleUninstall(shell, { dryRun, noBackup, force: true, nonInteractive: true });
    }
  }

  if (dryRun) {
    const rcFile = getPrimaryRcFile(shell);
    console.log(chalk.yellow("\n[Dry Run] Would add Vellum configuration to:"));
    console.log(`  ${rcFile}`);
    console.log("\nConfiguration would include:");
    console.log("  • PATH modification (if needed)");
    console.log("  • Shell completions setup");
    return {
      success: true,
      exitCode: EXIT_CODES.SUCCESS,
      message: "Dry run completed",
    };
  }

  // Apply configuration
  const vellumBinPath = getVellumBinPath();
  const result = await patchShellConfig({
    shell,
    operation: configured ? "update" : "add",
    createBackup: !noBackup,
    vellumBinPath,
  });

  if (result.success) {
    console.log(chalk.green("\n✓ Shell configured successfully"));

    if (result.fileCreated) {
      console.log(chalk.dim(`  Created: ${result.filePath}`));
    } else {
      console.log(chalk.dim(`  Modified: ${result.filePath}`));
    }

    if (result.backupPath) {
      console.log(chalk.dim(`  Backup: ${result.backupPath}`));
    }

    const instructions = getPostInstallInstructions(shell);
    console.log(chalk.cyan("\nTo activate, run:"));
    for (const instruction of instructions) {
      console.log(`  ${instruction}`);
    }

    return {
      success: true,
      exitCode: EXIT_CODES.SUCCESS,
      message: "Shell configured successfully",
      details: instructions,
    };
  }

  return {
    success: false,
    exitCode: EXIT_CODES.ERROR,
    message: result.error ?? "Failed to configure shell",
  };
}

/**
 * Get post-install instructions for a shell
 */
function getPostInstallInstructions(shell: ShellType): string[] {
  const rcFile = getPrimaryRcFile(shell);

  switch (shell) {
    case "bash":
    case "zsh":
      return [`source ${rcFile}`, "# Or restart your terminal"];
    case "fish":
      return [`source ${rcFile}`, "# Or restart your terminal"];
    case "powershell":
    case "pwsh":
      return [`. $PROFILE`, "# Or restart PowerShell"];
    default:
      return ["Restart your terminal"];
  }
}

/**
 * Display all shells status
 */
export async function displayShellsStatus(): Promise<void> {
  console.log(chalk.bold("\n🐚 Shell Integration Status\n"));

  const detected = detectShell();
  console.log(`Current shell: ${chalk.cyan(detected.shell)}`);

  const installed = detectInstalledShells();
  console.log(`\nInstalled shells:`);

  for (const shell of installed) {
    const configured = isShellConfigured(shell.shell);
    const isDefault = shell.isDefault ? chalk.dim(" (default)") : "";
    const status = configured ? chalk.green("✓") : chalk.dim("○");

    console.log(`  ${status} ${shell.shell}${isDefault}`);
    console.log(`    ${chalk.dim(getPrimaryRcFile(shell.shell))}`);
  }

  console.log("");
}

// =============================================================================
// Command Definition
// =============================================================================

/**
 * Create the shell setup command
 *
 * @returns Slash command definition
 */
export function createShellSetupCommand() {
  return {
    name: "shell",
    description: "Configure shell integration (PATH, completions)",
    namedArgs: [
      {
        name: "shell",
        description: "Target shell (bash, zsh, fish, powershell)",
        required: false,
      },
      {
        name: "uninstall",
        description: "Remove Vellum configuration",
        required: false,
      },
      {
        name: "force",
        description: "Force overwrite without confirmation",
        required: false,
      },
      {
        name: "no-backup",
        description: "Skip backup creation",
        required: false,
      },
      {
        name: "dry-run",
        description: "Show what would be done",
        required: false,
      },
      {
        name: "status",
        description: "Show shell integration status",
        required: false,
      },
    ],
    handler: async (args: Record<string, string>): Promise<SetupCommandResult> => {
      // Handle status flag
      if (args.status !== undefined) {
        await displayShellsStatus();
        return {
          success: true,
          exitCode: EXIT_CODES.SUCCESS,
          message: "",
        };
      }

      return runShellSetup({
        shell: args.shell,
        uninstall: args.uninstall !== undefined,
        force: args.force !== undefined,
        noBackup: args["no-backup"] !== undefined,
        dryRun: args["dry-run"] !== undefined,
      });
    },
  };
}
