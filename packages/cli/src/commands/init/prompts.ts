/**
 * Init Prompts Command
 *
 * Scaffolds the .vellum/ directory structure for customizing prompts,
 * rules, skills, commands, and workflows.
 *
 * Usage:
 * - `vellum init prompts` - Interactive scaffolding
 * - `vellum init prompts --force` - Overwrite existing .vellum/
 *
 * @module cli/commands/init/prompts
 * @see REQ-015
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { confirm } from "@inquirer/prompts";
import chalk from "chalk";

import { EXIT_CODES } from "../exit-codes.js";
import type { CommandContext, CommandResult, SlashCommand } from "../types.js";
import { error, pending, success } from "../types.js";

// =============================================================================
// Constants
// =============================================================================

/**
 * Directory structure to scaffold
 */
const SCAFFOLD_DIRECTORIES = [
  "prompts",
  "prompts/roles",
  "prompts/providers",
  "prompts/spec",
  "prompts/workers",
  "prompts/custom",
  "rules",
  "skills",
  "commands",
  "workflows",
] as const;

/**
 * README files to copy from templates
 */
const README_MAPPINGS: Record<string, string> = {
  prompts: "prompts-readme.md",
  rules: "rules-readme.md",
  skills: "skills-readme.md",
  commands: "commands-readme.md",
  workflows: "workflows-readme.md",
};

/**
 * Example files to copy from templates
 */
const EXAMPLE_MAPPINGS: Record<string, string> = {
  "commands/summarize.example.md": "example-command.md",
  "workflows/bugfix.example.md": "example-workflow.md",
  "skills/react-patterns/SKILL.md": "example-skill.md",
};

// =============================================================================
// Types
// =============================================================================

/**
 * Options for init prompts command
 */
export interface InitPromptsOptions {
  /** Overwrite existing .vellum/ without prompting */
  force?: boolean;
  /** Non-interactive mode (for CI) */
  nonInteractive?: boolean;
  /** Working directory (defaults to process.cwd()) */
  cwd?: string;
}

/**
 * Result of init prompts command
 */
export interface InitPromptsResult {
  /** Whether initialization succeeded */
  success: boolean;
  /** Path to created .vellum/ directory */
  vellumPath?: string;
  /** Directories created */
  directoriesCreated?: string[];
  /** Files created */
  filesCreated?: string[];
  /** Error message if failed */
  error?: string;
  /** Exit code */
  exitCode: number;
}

// =============================================================================
// Template Loading
// =============================================================================

/**
 * Get the templates directory path
 */
function getTemplatesDir(): string {
  const currentFile = fileURLToPath(import.meta.url);
  return join(dirname(currentFile), "templates");
}

/**
 * Read a template file
 */
function readTemplate(templateName: string): string | null {
  try {
    const templatePath = join(getTemplatesDir(), templateName);
    return readFileSync(templatePath, "utf-8");
  } catch {
    return null;
  }
}

// =============================================================================
// Scaffolding Logic
// =============================================================================

/**
 * Create the .vellum/ directory structure
 *
 * @param rootDir - Project root directory
 * @returns Created directories and files
 */
function scaffoldVellumDirectory(rootDir: string): {
  directories: string[];
  files: string[];
} {
  const vellumPath = join(rootDir, ".vellum");
  const directories: string[] = [];
  const files: string[] = [];

  // Create main .vellum directory
  if (!existsSync(vellumPath)) {
    mkdirSync(vellumPath, { recursive: true });
    directories.push(".vellum");
  }

  // Create subdirectories
  for (const subdir of SCAFFOLD_DIRECTORIES) {
    const fullPath = join(vellumPath, subdir);
    if (!existsSync(fullPath)) {
      mkdirSync(fullPath, { recursive: true });
      directories.push(`.vellum/${subdir}`);
    }
  }

  // Copy README files
  for (const [targetDir, templateFile] of Object.entries(README_MAPPINGS)) {
    const targetPath = join(vellumPath, targetDir, "README.md");
    if (!existsSync(targetPath)) {
      const content = readTemplate(templateFile);
      if (content) {
        writeFileSync(targetPath, content, "utf-8");
        files.push(`.vellum/${targetDir}/README.md`);
      }
    }
  }

  // Copy example files
  for (const [targetFile, templateFile] of Object.entries(EXAMPLE_MAPPINGS)) {
    const targetPath = join(vellumPath, targetFile);
    const targetDirPath = dirname(targetPath);

    // Ensure parent directory exists (for nested paths like skills/react-patterns/)
    if (!existsSync(targetDirPath)) {
      mkdirSync(targetDirPath, { recursive: true });
      const relativePath = targetDirPath
        .replace(`${vellumPath}/`, "")
        .replace(`${vellumPath}\\`, "");
      if (!directories.includes(`.vellum/${relativePath}`)) {
        directories.push(`.vellum/${relativePath}`);
      }
    }

    if (!existsSync(targetPath)) {
      const content = readTemplate(templateFile);
      if (content) {
        writeFileSync(targetPath, content, "utf-8");
        files.push(`.vellum/${targetFile}`);
      }
    }
  }

  return { directories, files };
}

// =============================================================================
// Command Execution
// =============================================================================

/**
 * Execute init prompts command
 *
 * @param options - Command options
 * @returns Init result
 */
export async function executeInitPrompts(
  options: InitPromptsOptions = {}
): Promise<InitPromptsResult> {
  const rootDir = options.cwd ?? process.cwd();
  const vellumPath = join(rootDir, ".vellum");

  try {
    // Check for existing .vellum directory
    const exists = existsSync(vellumPath);

    if (exists && !options.force) {
      // In non-interactive mode, fail if directory exists
      if (options.nonInteractive) {
        console.log(chalk.yellow(".vellum/ already exists. Use --force to overwrite."));
        return {
          success: false,
          error: "Directory already exists",
          exitCode: EXIT_CODES.ERROR,
        };
      }

      // Interactive confirmation
      const shouldOverwrite = await confirm({
        message: ".vellum/ already exists. Overwrite?",
        default: false,
      });

      if (!shouldOverwrite) {
        console.log(chalk.gray("Aborted."));
        return {
          success: false,
          error: "Aborted by user",
          exitCode: EXIT_CODES.SUCCESS, // User choice, not an error
        };
      }
    }

    // Scaffold the directory structure
    console.log(chalk.blue("\n🔧 Scaffolding .vellum/ directory...\n"));

    const { directories, files } = scaffoldVellumDirectory(rootDir);

    // Display created items
    if (directories.length > 0) {
      console.log(chalk.gray("Created directories:"));
      for (const dir of directories) {
        console.log(chalk.gray(`  📁 ${dir}`));
      }
    }

    if (files.length > 0) {
      console.log(chalk.gray("\nCreated files:"));
      for (const file of files) {
        console.log(chalk.gray(`  📄 ${file}`));
      }
    }

    console.log(chalk.green("\n✅ .vellum/ directory scaffolded successfully!"));
    console.log(chalk.gray("\nNext steps:"));
    console.log(chalk.gray("  • Add custom prompts to .vellum/prompts/"));
    console.log(chalk.gray("  • Add global rules to .vellum/rules/"));
    console.log(chalk.gray("  • Create skills in .vellum/skills/"));
    console.log(chalk.gray("  • Add custom commands in .vellum/commands/"));
    console.log(chalk.gray("  • Define workflows in .vellum/workflows/"));
    console.log(chalk.gray("  • Run `vellum prompt validate` to check syntax\n"));

    return {
      success: true,
      vellumPath,
      directoriesCreated: directories,
      filesCreated: files,
      exitCode: EXIT_CODES.SUCCESS,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`\n❌ Failed to scaffold .vellum/: ${message}`));
    return {
      success: false,
      error: message,
      exitCode: EXIT_CODES.ERROR,
    };
  }
}

// =============================================================================
// Slash Command Definition
// =============================================================================

/**
 * Init prompts slash command for TUI
 *
 * Scaffolds the .vellum/ directory structure.
 */
export const initPromptsCommand: SlashCommand = {
  name: "init-prompts",
  description: "Scaffold .vellum/ directory for custom prompts and configuration",
  kind: "builtin",
  category: "config",
  aliases: ["scaffold"],
  namedArgs: [
    {
      name: "force",
      shorthand: "f",
      type: "boolean",
      description: "Overwrite existing .vellum/ without prompting",
      required: false,
      default: false,
    },
  ],
  examples: [
    "/init-prompts           - Interactive scaffolding",
    "/init-prompts --force   - Overwrite existing .vellum/",
  ],

  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    const force = ctx.parsedArgs.named.force as boolean | undefined;

    return pending({
      message: "Scaffolding .vellum/ directory...",
      showProgress: true,
      promise: (async (): Promise<CommandResult> => {
        const result = await executeInitPrompts({
          force: force ?? false,
          nonInteractive: false,
        });

        if (result.success) {
          const createdCount =
            (result.directoriesCreated?.length ?? 0) + (result.filesCreated?.length ?? 0);
          return success(`Scaffolded ${createdCount} items in .vellum/`, {
            vellumPath: result.vellumPath,
            directoriesCreated: result.directoriesCreated,
            filesCreated: result.filesCreated,
          });
        }

        return error("INTERNAL_ERROR", result.error ?? "Failed to scaffold .vellum/");
      })(),
    });
  },
};

// =============================================================================
// CLI Entry Point
// =============================================================================

/**
 * Run init prompts command from CLI
 *
 * @param options - CLI options
 */
export async function runInitPromptsCli(options: { force?: boolean }): Promise<void> {
  const result = await executeInitPrompts({
    force: options.force ?? false,
    nonInteractive: false,
  });

  process.exit(result.exitCode);
}
