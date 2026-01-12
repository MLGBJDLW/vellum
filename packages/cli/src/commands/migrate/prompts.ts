/**
 * Migrate Prompts Command
 *
 * Migrates prompts from legacy locations to .vellum/ structure.
 *
 * Usage:
 * - `vellum migrate prompts` - Interactive migration
 * - `vellum migrate prompts --dry-run` - Show migration plan
 * - `vellum migrate prompts --backup` - Create backups before moving
 *
 * @module cli/commands/migrate/prompts
 * @see REQ-017
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import { confirm } from "@inquirer/prompts";
import chalk from "chalk";

import { EXIT_CODES } from "../exit-codes.js";
import type { CommandContext, CommandResult, SlashCommand } from "../types.js";
import { error, pending, success } from "../types.js";

// =============================================================================
// Constants
// =============================================================================

/**
 * Legacy source locations and their target mappings
 */
const LEGACY_MAPPINGS: Array<{
  name: string;
  sources: string[];
  target: string;
  description: string;
}> = [
  {
    name: "skills",
    sources: [".github/skills", ".claude/skills"],
    target: ".vellum/skills",
    description: "Skill definitions",
  },
  {
    name: "prompts",
    sources: [".roo/prompts", ".kilocode/prompts", ".github/prompts", ".claude/prompts"],
    target: ".vellum/prompts",
    description: "Custom prompts",
  },
  {
    name: "commands",
    sources: [".roo/commands", ".kilocode/commands"],
    target: ".vellum/commands",
    description: "Custom commands",
  },
  {
    name: "rules",
    sources: [".roo/rules", ".kilocode/rules", ".github/rules"],
    target: ".vellum/rules",
    description: "Global rules",
  },
];

// =============================================================================
// Types
// =============================================================================

/**
 * Single migration action
 */
export interface MigrationAction {
  /** Source path (relative) */
  source: string;
  /** Target path (relative) */
  target: string;
  /** Type of content being migrated */
  type: string;
  /** Number of files in this migration */
  fileCount: number;
  /** Whether source will be deleted after migration */
  willDelete: boolean;
}

/**
 * Options for migrate prompts command
 */
export interface MigratePromptsOptions {
  /** Show migration plan without executing */
  dryRun?: boolean;
  /** Create .bak copies before moving */
  backup?: boolean;
  /** Non-interactive mode (for CI) */
  nonInteractive?: boolean;
  /** Working directory (defaults to process.cwd()) */
  cwd?: string;
}

/**
 * Result of migration
 */
export interface MigratePromptsResult {
  /** Whether migration succeeded */
  success: boolean;
  /** Actions that were/would be taken */
  actions: MigrationAction[];
  /** Files migrated */
  filesMigrated: number;
  /** Backups created */
  backupsCreated: number;
  /** Error message if failed */
  error?: string;
  /** Exit code */
  exitCode: number;
}

// =============================================================================
// Migration Helpers
// =============================================================================

/**
 * Count files in a directory recursively
 */
function countFiles(dir: string): number {
  if (!existsSync(dir)) return 0;

  let count = 0;
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      count += countFiles(fullPath);
    } else if (stat.isFile()) {
      count++;
    }
  }

  return count;
}

/**
 * Get all files in a directory recursively
 */
function getAllFiles(dir: string, rootDir: string): string[] {
  if (!existsSync(dir)) return [];

  const files: string[] = [];
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      files.push(...getAllFiles(fullPath, rootDir));
    } else if (stat.isFile()) {
      files.push(relative(rootDir, fullPath));
    }
  }

  return files;
}

/**
 * Detect legacy directories that can be migrated
 */
function detectLegacyDirectories(rootDir: string): MigrationAction[] {
  const actions: MigrationAction[] = [];

  for (const mapping of LEGACY_MAPPINGS) {
    for (const source of mapping.sources) {
      const sourcePath = join(rootDir, source);

      if (existsSync(sourcePath)) {
        const fileCount = countFiles(sourcePath);

        if (fileCount > 0) {
          actions.push({
            source,
            target: mapping.target,
            type: mapping.description,
            fileCount,
            willDelete: true,
          });
        }
      }
    }
  }

  return actions;
}

/**
 * Move files from source to target directory
 */
function migrateDirectory(
  rootDir: string,
  source: string,
  target: string,
  backup: boolean
): { migrated: number; backed: number } {
  const sourcePath = join(rootDir, source);
  const targetPath = join(rootDir, target);
  let migrated = 0;
  let backed = 0;

  // Ensure target exists
  mkdirSync(targetPath, { recursive: true });

  // Get all files from source
  const files = getAllFiles(sourcePath, sourcePath);

  for (const relativeFile of files) {
    const sourceFile = join(sourcePath, relativeFile);
    const targetFile = join(targetPath, relativeFile);
    const targetDir = dirname(targetFile);

    // Ensure target directory exists
    mkdirSync(targetDir, { recursive: true });

    // Handle existing file at target
    if (existsSync(targetFile)) {
      if (backup) {
        // Create backup of existing target
        const backupPath = `${targetFile}.bak`;
        copyFileSync(targetFile, backupPath);
        backed++;
      }
    }

    // Create backup of source if requested
    if (backup) {
      const sourceBackup = `${sourceFile}.bak`;
      copyFileSync(sourceFile, sourceBackup);
      backed++;
    }

    // Copy file to target (keeping source for safety)
    copyFileSync(sourceFile, targetFile);
    migrated++;
  }

  return { migrated, backed };
}

// =============================================================================
// Command Execution
// =============================================================================

/**
 * Execute migrate prompts command
 *
 * @param options - Command options
 * @returns Migration result
 */
export async function executeMigratePrompts(
  options: MigratePromptsOptions = {}
): Promise<MigratePromptsResult> {
  const rootDir = options.cwd ?? process.cwd();

  try {
    // Detect legacy directories
    const actions = detectLegacyDirectories(rootDir);

    if (actions.length === 0) {
      console.log(chalk.gray("\n✓ No legacy directories found to migrate."));
      console.log(chalk.gray("  Your project is already using .vellum/ or has no prompts."));
      return {
        success: true,
        actions: [],
        filesMigrated: 0,
        backupsCreated: 0,
        exitCode: EXIT_CODES.SUCCESS,
      };
    }

    // Display migration plan
    console.log(chalk.bold("\n📋 Migration Plan\n"));

    for (const action of actions) {
      console.log(chalk.cyan(`  ${action.source}/`));
      console.log(chalk.gray(`    → ${action.target}/`));
      console.log(chalk.gray(`    ${action.fileCount} file(s) (${action.type})`));
      console.log();
    }

    const totalFiles = actions.reduce((sum, a) => sum + a.fileCount, 0);
    console.log(chalk.gray(`Total: ${totalFiles} file(s) to migrate`));

    // Dry run - stop here
    if (options.dryRun) {
      console.log(chalk.yellow("\n⚠ Dry run mode - no changes made."));
      console.log(chalk.gray("  Run without --dry-run to execute migration."));
      return {
        success: true,
        actions,
        filesMigrated: 0,
        backupsCreated: 0,
        exitCode: EXIT_CODES.SUCCESS,
      };
    }

    // Interactive confirmation
    if (!options.nonInteractive) {
      const shouldProceed = await confirm({
        message: "Proceed with migration?",
        default: true,
      });

      if (!shouldProceed) {
        console.log(chalk.gray("\nAborted."));
        return {
          success: false,
          actions,
          filesMigrated: 0,
          backupsCreated: 0,
          error: "Aborted by user",
          exitCode: EXIT_CODES.SUCCESS,
        };
      }
    }

    // Execute migration
    console.log(chalk.blue("\n🔄 Migrating files...\n"));

    let totalMigrated = 0;
    let totalBacked = 0;

    for (const action of actions) {
      console.log(chalk.gray(`  Migrating ${action.source}/ → ${action.target}/`));

      const { migrated, backed } = migrateDirectory(
        rootDir,
        action.source,
        action.target,
        options.backup ?? false
      );

      totalMigrated += migrated;
      totalBacked += backed;

      console.log(chalk.green(`    ✓ ${migrated} file(s) migrated`));
      if (backed > 0) {
        console.log(chalk.gray(`    ${backed} backup(s) created`));
      }
    }

    // Summary
    console.log(chalk.green("\n✅ Migration complete!"));
    console.log(chalk.gray(`  Files migrated: ${totalMigrated}`));
    if (totalBacked > 0) {
      console.log(chalk.gray(`  Backups created: ${totalBacked}`));
    }

    console.log(chalk.gray("\nNote: Original files were preserved. You can safely remove"));
    console.log(chalk.gray("the legacy directories after verifying the migration."));
    console.log(chalk.gray("\nRun `vellum prompt validate` to verify the migrated files."));

    return {
      success: true,
      actions,
      filesMigrated: totalMigrated,
      backupsCreated: totalBacked,
      exitCode: EXIT_CODES.SUCCESS,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`\n❌ Migration failed: ${message}`));
    return {
      success: false,
      actions: [],
      filesMigrated: 0,
      backupsCreated: 0,
      error: message,
      exitCode: EXIT_CODES.ERROR,
    };
  }
}

// =============================================================================
// Slash Command Definition
// =============================================================================

/**
 * Migrate prompts slash command for TUI
 */
export const migratePromptsCommand: SlashCommand = {
  name: "migrate-prompts",
  description: "Migrate prompts from legacy locations to .vellum/",
  kind: "builtin",
  category: "config",
  aliases: ["migrate"],
  namedArgs: [
    {
      name: "dry-run",
      type: "boolean",
      description: "Show migration plan without executing",
      required: false,
      default: false,
    },
    {
      name: "backup",
      shorthand: "b",
      type: "boolean",
      description: "Create .bak copies before moving",
      required: false,
      default: false,
    },
  ],
  examples: [
    "/migrate-prompts              - Interactive migration",
    "/migrate-prompts --dry-run    - Show migration plan",
    "/migrate-prompts --backup     - Create backups before moving",
  ],

  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    const dryRun = ctx.parsedArgs.named["dry-run"] as boolean | undefined;
    const backup = ctx.parsedArgs.named.backup as boolean | undefined;

    return pending({
      message: "Analyzing legacy directories...",
      showProgress: true,
      promise: (async (): Promise<CommandResult> => {
        const result = await executeMigratePrompts({
          dryRun: dryRun ?? false,
          backup: backup ?? false,
          nonInteractive: false,
        });

        if (result.success) {
          if (result.filesMigrated === 0 && result.actions.length === 0) {
            return success("No legacy directories found to migrate.");
          }

          if (dryRun) {
            return success(`Migration plan: ${result.actions.length} source(s) detected.`, {
              actions: result.actions,
            });
          }

          return success(`Migrated ${result.filesMigrated} file(s).`, {
            actions: result.actions,
            filesMigrated: result.filesMigrated,
            backupsCreated: result.backupsCreated,
          });
        }

        return error("INTERNAL_ERROR", result.error ?? "Migration failed");
      })(),
    });
  },
};

// =============================================================================
// CLI Entry Point
// =============================================================================

/**
 * Run migrate prompts command from CLI
 *
 * @param options - CLI options
 */
export async function runMigratePromptsCli(options: {
  dryRun?: boolean;
  backup?: boolean;
}): Promise<void> {
  const result = await executeMigratePrompts({
    dryRun: options.dryRun ?? false,
    backup: options.backup ?? false,
    nonInteractive: false,
  });

  process.exit(result.exitCode);
}
