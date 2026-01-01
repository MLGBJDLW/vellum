/**
 * Init Command
 *
 * Interactive wizard to create AGENTS.md for project configuration.
 * Supports both interactive and non-interactive modes.
 *
 * Usage:
 * - `vellum init` - Interactive wizard
 * - `vellum init --minimal` - Skip wizard, use defaults
 * - `vellum init --force` - Overwrite existing AGENTS.md
 *
 * @module cli/commands/init
 */

import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

import { confirm, input, select } from "@inquirer/prompts";
import chalk from "chalk";

import { EXIT_CODES } from "./exit-codes.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Init command options
 */
export interface InitOptions {
  /** Overwrite existing AGENTS.md without prompting */
  force?: boolean;
  /** Skip wizard prompts, use defaults */
  minimal?: boolean;
  /** Non-interactive mode (for CI) */
  nonInteractive?: boolean;
}

/**
 * Project information gathered from wizard
 */
export interface ProjectInfo {
  /** Project name */
  name: string;
  /** Brief description */
  description: string;
  /** Programming language/stack */
  language: string;
  /** Framework (if any) */
  framework: string;
}

/**
 * Init command result
 */
export interface InitResult {
  /** Whether initialization succeeded */
  success: boolean;
  /** Output file path */
  filePath?: string;
  /** Error message if failed */
  error?: string;
  /** Exit code */
  exitCode: number;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Default project name from current directory
 */
function getDefaultProjectName(): string {
  return basename(process.cwd());
}

/**
 * Available language choices
 */
const LANGUAGE_CHOICES = [
  { name: "TypeScript", value: "TypeScript" },
  { name: "JavaScript", value: "JavaScript" },
  { name: "Python", value: "Python" },
  { name: "Rust", value: "Rust" },
  { name: "Go", value: "Go" },
  { name: "Java", value: "Java" },
  { name: "C#", value: "C#" },
  { name: "Other", value: "Other" },
];

/**
 * Available framework choices by language
 */
const FRAMEWORK_CHOICES: Record<string, Array<{ name: string; value: string }>> = {
  TypeScript: [
    { name: "React", value: "React" },
    { name: "Vue", value: "Vue" },
    { name: "Node.js", value: "Node.js" },
    { name: "Next.js", value: "Next.js" },
    { name: "None", value: "None" },
  ],
  JavaScript: [
    { name: "React", value: "React" },
    { name: "Vue", value: "Vue" },
    { name: "Node.js", value: "Node.js" },
    { name: "Express", value: "Express" },
    { name: "None", value: "None" },
  ],
  Python: [
    { name: "FastAPI", value: "FastAPI" },
    { name: "Django", value: "Django" },
    { name: "Flask", value: "Flask" },
    { name: "None", value: "None" },
  ],
  Rust: [
    { name: "Actix", value: "Actix" },
    { name: "Axum", value: "Axum" },
    { name: "Tokio", value: "Tokio" },
    { name: "None", value: "None" },
  ],
  Go: [
    { name: "Gin", value: "Gin" },
    { name: "Echo", value: "Echo" },
    { name: "Fiber", value: "Fiber" },
    { name: "None", value: "None" },
  ],
  Java: [
    { name: "Spring Boot", value: "Spring Boot" },
    { name: "Quarkus", value: "Quarkus" },
    { name: "None", value: "None" },
  ],
  "C#": [
    { name: ".NET Core", value: ".NET Core" },
    { name: "ASP.NET", value: "ASP.NET" },
    { name: "None", value: "None" },
  ],
  Other: [{ name: "None", value: "None" }],
};

// =============================================================================
// Template Generation
// =============================================================================

/**
 * Generate AGENTS.md content from project info
 *
 * @param info - Project information
 * @returns Generated AGENTS.md content
 */
export function generateAgentsMd(info: ProjectInfo): string {
  const frameworkLine = info.framework && info.framework !== "None" ? `\n- ${info.framework}` : "";

  return `---
name: "${info.name}"
version: "1.0.0"
description: "${info.description || `AI coding assistant configuration for ${info.name}`}"
priority: 100
merge:
  strategy: extend
  arrays: append
---

# Instructions

You are an AI coding assistant for ${info.name}.

## Tech Stack
- ${info.language}${frameworkLine}

## Coding Standards
- Follow project conventions
- Write clean, readable code
- Use meaningful variable and function names
- Add appropriate comments for complex logic

## Allowed Tools
- @readonly
- @edit
- !bash
`;
}

/**
 * Generate minimal AGENTS.md content
 *
 * @param projectName - Project name
 * @returns Minimal AGENTS.md content
 */
export function generateMinimalAgentsMd(projectName: string): string {
  return `---
name: "${projectName}"
version: "1.0.0"
priority: 100
---

# Instructions

You are an AI coding assistant for ${projectName}.

## Allowed Tools
- @readonly
- @edit
`;
}

// =============================================================================
// Wizard Prompts
// =============================================================================

/**
 * Run interactive wizard to gather project information
 *
 * @returns Project information
 */
async function runWizard(): Promise<ProjectInfo> {
  console.log(chalk.bold.blue("\n🚀 Initialize AGENTS.md\n"));

  const name = await input({
    message: "Project name:",
    default: getDefaultProjectName(),
  });

  const description = await input({
    message: "Brief description (optional):",
    default: "",
  });

  const language = await select({
    message: "Primary language/stack:",
    choices: LANGUAGE_CHOICES,
  });

  const frameworkChoices = FRAMEWORK_CHOICES[language] || [{ name: "None", value: "None" }];
  const framework = await select({
    message: "Framework:",
    choices: frameworkChoices,
  });

  return { name, description, language, framework };
}

// =============================================================================
// Init Command Handler
// =============================================================================

/**
 * Execute init command
 *
 * @param options - Command options
 * @returns Init result
 */
export async function executeInit(options: InitOptions = {}): Promise<InitResult> {
  const targetPath = join(process.cwd(), "AGENTS.md");

  try {
    // Check for existing file
    const fileExists = existsSync(targetPath);

    if (fileExists && !options.force) {
      // In non-interactive mode, fail if file exists
      if (options.nonInteractive || options.minimal) {
        console.log(chalk.yellow("AGENTS.md already exists. Use --force to overwrite."));
        return {
          success: false,
          error: "File already exists",
          exitCode: EXIT_CODES.ERROR,
        };
      }

      // Interactive confirmation
      const shouldOverwrite = await confirm({
        message: "AGENTS.md already exists. Overwrite?",
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

    // Generate content
    let content: string;

    if (options.minimal || options.nonInteractive) {
      // Use minimal template with defaults
      content = generateMinimalAgentsMd(getDefaultProjectName());
    } else {
      // Run interactive wizard
      const info = await runWizard();
      content = generateAgentsMd(info);
    }

    // Write file
    await writeFile(targetPath, content, "utf-8");

    console.log(chalk.green(`\n✅ Created ${targetPath}`));
    console.log(chalk.gray("\nNext steps:"));
    console.log(chalk.gray("  • Review and customize AGENTS.md"));
    console.log(chalk.gray("  • Run `vellum agents validate` to check syntax"));
    console.log(chalk.gray("  • Run `vellum agents show` to view merged config\n"));

    return {
      success: true,
      filePath: targetPath,
      exitCode: EXIT_CODES.SUCCESS,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`\n❌ Failed to create AGENTS.md: ${message}`));
    return {
      success: false,
      error: message,
      exitCode: EXIT_CODES.ERROR,
    };
  }
}

// =============================================================================
// Command Definition (SlashCommand format for TUI)
// =============================================================================

import type { CommandContext, CommandResult, SlashCommand } from "./types.js";
import { error, pending, success } from "./types.js";

/**
 * Init slash command for TUI
 *
 * Creates AGENTS.md in the current working directory.
 */
export const initSlashCommand: SlashCommand = {
  name: "init",
  description: "Initialize AGENTS.md for your project",
  kind: "builtin",
  category: "config",
  aliases: [],
  namedArgs: [
    {
      name: "force",
      shorthand: "f",
      type: "boolean",
      description: "Overwrite existing AGENTS.md without prompting",
      required: false,
      default: false,
    },
    {
      name: "minimal",
      shorthand: "m",
      type: "boolean",
      description: "Skip wizard prompts, use defaults",
      required: false,
      default: false,
    },
  ],
  examples: [
    "/init           - Interactive wizard",
    "/init --minimal - Skip wizard, use defaults",
    "/init --force   - Overwrite existing file",
  ],

  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    const force = ctx.parsedArgs.named.force as boolean | undefined;
    const minimal = ctx.parsedArgs.named.minimal as boolean | undefined;

    // Return pending result with async operation
    return pending({
      message: "Initializing AGENTS.md...",
      showProgress: true,
      promise: (async (): Promise<CommandResult> => {
        const result = await executeInit({
          force: force ?? false,
          minimal: minimal ?? false,
          // In TUI context, assume interactive is available
          nonInteractive: false,
        });

        if (result.success) {
          return success(`Created ${result.filePath}`, { filePath: result.filePath });
        }

        return error("INTERNAL_ERROR", result.error ?? "Failed to initialize AGENTS.md");
      })(),
    });
  },
};
