/**
 * Update Command (Phase 39)
 *
 * CLI command for checking and performing updates to the Vellum CLI.
 *
 * Usage:
 * - `vellum update` - Check and update if available
 * - `vellum update --check` - Only check, don't update
 * - `vellum update --force` - Skip confirmation prompts
 *
 * @module cli/commands/update
 */

import { confirm } from "@inquirer/prompts";
import {
  checkForUpdates,
  detectPackageManager,
  type PackageManager,
  performUpdate,
  type UpdateOptions,
  VersionChecker,
  type VersionCheckResult,
} from "@vellum/core";
import chalk from "chalk";

import { translate } from "../tui/i18n/tui-namespace.js";
import { ICONS } from "../utils/icons.js";
import { EXIT_CODES } from "./exit-codes.js";
import { type CommandResult, error, pending, type SlashCommand, success } from "./types.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Update command options
 */
export interface UpdateCommandOptions {
  /** Only check for updates, don't install */
  check?: boolean;
  /** Skip confirmation prompts */
  force?: boolean;
  /** Target version to update to */
  version?: string;
  /** Package manager to use */
  packageManager?: PackageManager;
  /** Dry-run mode (no actual update) */
  dryRun?: boolean;
}

/**
 * Update command result
 */
export interface UpdateCommandResult {
  /** Whether the command succeeded */
  success: boolean;
  /** Exit code */
  exitCode: number;
  /** Message to display */
  message: string;
  /** Whether an update was available */
  updateAvailable?: boolean;
  /** Whether an update was performed */
  updatePerformed?: boolean;
  /** New version installed */
  newVersion?: string;
}

// =============================================================================
// Output Helpers
// =============================================================================

/**
 * Format version check result for display
 */
function formatCheckResult(result: VersionCheckResult): string {
  if (!result.success || !result.updateInfo) {
    return chalk.red(`✗ Failed to check for updates: ${result.error ?? "Unknown error"}`);
  }

  const info = result.updateInfo;

  if (!info.hasUpdate) {
    return chalk.green(`✓ You're up to date! (v${info.currentVersion})`);
  }

  const lines = [
    chalk.yellow(`⬆ Update available: v${info.currentVersion} → v${info.latestVersion}`),
    "",
    chalk.dim(`  Channel: ${info.channel}`),
  ];

  if (info.releaseDate) {
    lines.push(chalk.dim(`  Released: ${new Date(info.releaseDate).toLocaleDateString()}`));
  }

  if (info.releaseNotesUrl) {
    lines.push(chalk.dim(`  Release notes: ${info.releaseNotesUrl}`));
  }

  return lines.join("\n");
}

/**
 * Display update progress spinner
 */
function displayProgress(pm: PackageManager, version: string): void {
  console.log(chalk.blue(`\n⟳ Updating to v${version} using ${pm}...\n`));
}

// =============================================================================
// Command Implementation
// =============================================================================

/**
 * Execute the update command
 *
 * @param currentVersion - Current installed version
 * @param options - Command options
 * @returns Command result
 */
export async function executeUpdateCommand(
  currentVersion: string,
  options: UpdateCommandOptions = {}
): Promise<UpdateCommandResult> {
  // Step 1: Check for updates
  console.log(chalk.blue("⟳ Checking for updates...\n"));

  const checkResult = await new VersionChecker().check(currentVersion, true);

  // Display check result
  console.log(formatCheckResult(checkResult));
  console.log("");

  // If check failed, exit with error
  if (!checkResult.success) {
    return {
      success: false,
      exitCode: EXIT_CODES.ERROR,
      message: checkResult.error ?? "Failed to check for updates",
      updateAvailable: false,
    };
  }

  // updateInfo is guaranteed to exist because we checked success above
  const info = checkResult.updateInfo;
  if (!info) {
    return {
      success: false,
      exitCode: EXIT_CODES.ERROR,
      message: "Failed to get update info",
      updateAvailable: false,
    };
  }

  // If no update available, we're done
  if (!info.hasUpdate) {
    return {
      success: true,
      exitCode: EXIT_CODES.SUCCESS,
      message: "Already up to date",
      updateAvailable: false,
    };
  }

  // If --check flag, just report and exit
  if (options.check) {
    return {
      success: true,
      exitCode: EXIT_CODES.SUCCESS,
      message: `Update available: v${info.latestVersion}`,
      updateAvailable: true,
      updatePerformed: false,
    };
  }

  // Confirm update unless --force
  if (!options.force && !options.dryRun) {
    const shouldUpdate = await confirm({
      message: `Update to v${options.version ?? info.latestVersion}?`,
      default: true,
    });

    if (!shouldUpdate) {
      console.log(chalk.dim("\nUpdate cancelled."));
      return {
        success: true,
        exitCode: EXIT_CODES.SUCCESS,
        message: "Update cancelled by user",
        updateAvailable: true,
        updatePerformed: false,
      };
    }
  }

  // Step 2: Perform update
  const pm = options.packageManager ?? detectPackageManager();
  const targetVersion = options.version ?? info.latestVersion;

  displayProgress(pm, targetVersion);

  const updateOptions: UpdateOptions = {
    targetVersion,
    packageManager: pm,
    global: true,
    dryRun: options.dryRun,
  };

  const updateResult = await performUpdate(currentVersion, updateOptions);

  if (!updateResult.success) {
    console.log(chalk.red(`\n✗ Update failed: ${updateResult.error}`));
    console.log(chalk.dim("\nYou can try updating manually:"));
    console.log(chalk.dim(`  ${pm} install -g @butlerw/vellum@${targetVersion}`));

    return {
      success: false,
      exitCode: EXIT_CODES.ERROR,
      message: updateResult.error ?? "Update failed",
      updateAvailable: true,
      updatePerformed: false,
    };
  }

  // Success
  if (options.dryRun) {
    console.log(chalk.green(`✓ [Dry run] Would update to v${targetVersion}`));
  } else {
    console.log(chalk.green(`✓ Successfully updated to v${targetVersion}`));

    if (updateResult.requiresRestart) {
      console.log(
        chalk.yellow(`\n${ICONS.warning} Please restart your terminal to use the new version.`)
      );
    }
  }

  return {
    success: true,
    exitCode: EXIT_CODES.SUCCESS,
    message: `Updated to v${targetVersion}`,
    updateAvailable: true,
    updatePerformed: !options.dryRun,
    newVersion: targetVersion,
  };
}

// =============================================================================
// Interactive terminal updates
// =============================================================================

export type ReleaseStatus =
  | { kind: "current" | "unknown" }
  | { kind: "available" | "installed"; version: string };

function releaseStatus(result: VersionCheckResult): ReleaseStatus {
  if (!result.success || !result.updateInfo) return { kind: "unknown" };
  return result.updateInfo.hasUpdate
    ? { kind: "available", version: result.updateInfo.latestVersion }
    : { kind: "current" };
}

export async function checkUpdateOnStartup(current: string): Promise<ReleaseStatus> {
  return releaseStatus(await checkForUpdates(current));
}

export function createUpgradeCommand(
  current: string,
  onStatus: (status: ReleaseStatus) => void
): SlashCommand {
  let installed: string | undefined;
  let installing = false;
  let checking = false;
  async function install(target: string, signal: AbortSignal): Promise<CommandResult> {
    installing = true;
    try {
      const result = await performUpdate(current, { targetVersion: target, global: true, signal });
      if (signal.aborted) return success(translate("update.cancelled"));
      if (!result.success)
        return error("INTERNAL_ERROR", result.error ?? translate("update.failed"));
      installed = target;
      onStatus({ kind: "installed", version: target });
      return success(translate("update.restart", { version: target }));
    } finally {
      installing = false;
    }
  }
  async function check(): Promise<CommandResult> {
    checking = true;
    try {
      const result = await new VersionChecker().check(current, true);
      const status = releaseStatus(result);
      onStatus(status);
      if (status.kind === "unknown")
        return error(
          "NETWORK_ERROR",
          result.error ?? translate("update.unavailable", { version: current })
        );
      if (status.kind !== "available")
        return success(translate("update.upToDate", { version: current }));
      const target = status.version;
      const action = translate("update.action");
      return {
        kind: "interactive",
        prompt: {
          inputType: "select",
          message: translate("update.confirm", { current, version: target }),
          options: [action, translate("input.cancel")],
          handler: async (choice) => {
            if (choice !== action || installing || installed) return success();
            const controller = new AbortController();
            return pending({
              message: translate("update.installing", { version: target }),
              promise: install(target, controller.signal),
              cancel: () => controller.abort(),
            });
          },
        },
      };
    } finally {
      checking = false;
    }
  }
  return {
    name: "upgrade",
    kind: "builtin",
    category: "system",
    get description() {
      return translate("update.description");
    },
    execute: async () => {
      if (installed) return success(translate("update.restart", { version: installed }));
      if (installing || checking) return success();
      return pending({ message: translate("update.checking"), promise: check() });
    },
  };
}
