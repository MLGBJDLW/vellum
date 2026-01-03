/**
 * Custom Agents Import Command (T020b)
 *
 * Imports agent definition from a file.
 *
 * @module cli/commands/custom-agents/import
 * @see REQ-022
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  AgentDiscovery,
  AgentLoader,
  type CustomAgentDefinition,
  validateAgentDefinition,
} from "@vellum/core";
import chalk from "chalk";
import matter from "gray-matter";

import type { CommandResult } from "../types.js";
import { error, interactive, success } from "../types.js";
import type { ImportOptions } from "./index.js";

// =============================================================================
// Helpers
// =============================================================================

/**
 * Get agent file path for import destination
 */
function getAgentFilePath(slug: string, global: boolean): string {
  const baseDir = global
    ? path.join(os.homedir(), ".vellum", "agents")
    : path.join(process.cwd(), ".vellum", "agents");

  return path.join(baseDir, `${slug}.md`);
}

/**
 * Check if file exists
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure directory exists
 */
async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

/**
 * Convert agent definition to Markdown with YAML frontmatter
 */
function toMarkdown(agent: CustomAgentDefinition): string {
  // Extract systemPrompt as body content
  const { systemPrompt, ...frontmatter } = agent;

  // Use gray-matter to create markdown with frontmatter
  const body =
    systemPrompt ??
    `# ${agent.name}

You are a helpful AI assistant.

## Instructions

Add your agent instructions here.`;

  return matter.stringify(body, frontmatter);
}

// =============================================================================
// Command Handler
// =============================================================================

/**
 * Handle import subcommand
 *
 * Imports an agent definition from a file.
 *
 * @param options - Import options
 * @returns Command result
 */
export async function handleImport(options: ImportOptions): Promise<CommandResult> {
  // Require file path
  if (!options.file) {
    return error("MISSING_ARGUMENT", "Import file path is required", [
      "Usage: /custom-agents import <file>",
    ]);
  }

  try {
    const filePath = path.resolve(options.file);

    // Check file exists
    if (!(await fileExists(filePath))) {
      return error("FILE_NOT_FOUND", `File not found: ${filePath}`);
    }

    // Load agent from file
    const loader = new AgentLoader();
    const loadResult = await loader.loadFile(filePath);

    if (!loadResult.ok) {
      return error("INVALID_ARGUMENT", `Failed to parse agent file: ${loadResult.error.message}`, [
        "Ensure the file is valid YAML or Markdown with YAML frontmatter",
      ]);
    }

    const agent = loadResult.value;

    // Validate agent definition
    const validation = validateAgentDefinition(agent);
    if (!validation.success) {
      const issues = validation.error.issues
        .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
        .join("\n");

      return error("INVALID_ARGUMENT", `Agent validation failed:\n${issues}`, [
        "Fix the validation errors and try again",
      ]);
    }

    // Check if agent already exists
    const discovery = new AgentDiscovery({ watchEnabled: false });
    await discovery.discover();
    const existing = discovery.get(agent.slug);

    if (existing) {
      // Prompt for confirmation
      return interactive({
        inputType: "confirm",
        message: `Agent "${agent.slug}" already exists. Overwrite?`,
        handler: async (value) => {
          if (value.toLowerCase() !== "yes" && value.toLowerCase() !== "y") {
            return success(chalk.yellow("Import cancelled"));
          }
          return doImport(agent, options.global ?? false, filePath);
        },
        onCancel: () => success(chalk.yellow("Import cancelled")),
      });
    }

    return doImport(agent, options.global ?? false, filePath);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error("INTERNAL_ERROR", `Failed to import agent: ${message}`);
  }
}

/**
 * Perform the actual import
 */
async function doImport(
  agent: CustomAgentDefinition,
  global: boolean,
  sourceFile: string
): Promise<CommandResult> {
  try {
    // Get destination path
    const destPath = getAgentFilePath(agent.slug, global);
    const dirPath = path.dirname(destPath);

    // Ensure directory exists
    await ensureDir(dirPath);

    // Convert to Markdown and write
    const content = toMarkdown(agent);
    await fs.writeFile(destPath, content, "utf-8");

    // Success message
    const scope = global ? "user" : "project";
    const lines = [
      chalk.green(`✅ Imported agent "${agent.slug}" (${scope} scope)`),
      "",
      chalk.gray(`Source: ${sourceFile}`),
      chalk.gray(`Destination: ${destPath}`),
      "",
      chalk.cyan("Next steps:"),
      chalk.gray(`  1. Review the imported agent: /custom-agents info ${agent.slug}`),
      chalk.gray(`  2. Validate: /custom-agents validate ${agent.slug}`),
      chalk.gray(`  3. Use: /mode ${agent.slug}`),
    ];

    return success(lines.join("\n"));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error("INTERNAL_ERROR", `Failed to write agent file: ${message}`);
  }
}
