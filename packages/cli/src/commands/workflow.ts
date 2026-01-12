/**
 * Workflow Slash Commands (T035)
 *
 * Provides slash commands for workflow management:
 * - /workflow - List available workflows
 * - /workflow {name} - Inject workflow instructions
 *
 * Workflows are loaded from .vellum/workflows/*.md files.
 *
 * @module cli/commands/workflow
 * @see REQ-011
 */

import { createWorkflowLoader, type Workflow, type WorkflowLoader } from "@vellum/core";
import type { CommandContext, CommandResult, SlashCommand } from "./types.js";
import { error, pending, success } from "./types.js";

// =============================================================================
// Module State
// =============================================================================

/**
 * Cached WorkflowLoader instance.
 * Initialized lazily on first use.
 */
let cachedLoader: WorkflowLoader | null = null;

/**
 * Last workspace path used to create the loader.
 */
let lastWorkspacePath: string | null = null;

/**
 * Get or create WorkflowLoader for the given workspace.
 *
 * @param cwd - Current working directory (workspace root)
 * @returns WorkflowLoader instance
 */
function getLoader(cwd: string): WorkflowLoader {
  // Create new loader if workspace changed
  if (cachedLoader === null || lastWorkspacePath !== cwd) {
    cachedLoader = createWorkflowLoader({ cwd });
    lastWorkspacePath = cwd;
  }
  return cachedLoader;
}

/**
 * Clear the cached loader (for testing).
 */
export function clearWorkflowLoaderCache(): void {
  cachedLoader = null;
  lastWorkspacePath = null;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Format workflow list for display.
 *
 * @param workflows - Array of loaded workflows
 * @returns Formatted string for TUI display
 */
function formatWorkflowList(workflows: Workflow[]): string {
  if (workflows.length === 0) {
    return `📂 No workflows found.

Create workflows in .vellum/workflows/*.md with YAML frontmatter:

\`\`\`yaml
---
id: deploy
name: Deploy to Production
description: Step-by-step deployment workflow
steps:
  - id: build
    prompt: "Build the project for production"
  - id: test
    prompt: "Run all tests"
  - id: deploy
    prompt: "Deploy to production server"
---
\`\`\`

Then run: /workflow deploy`;
  }

  const lines = ["📋 Available Workflows:\n"];

  for (const wf of workflows) {
    const stepCount = wf.steps.length;
    const source = wf.source === "project" ? "[project]" : "[user]";
    lines.push(`  • ${wf.id} - ${wf.name || wf.description || "No description"}`);
    lines.push(`    ${stepCount} step${stepCount !== 1 ? "s" : ""} ${source}\n`);
  }

  lines.push("\nUsage: /workflow <name> [--var=value ...]");

  return lines.join("\n");
}

/**
 * Format workflow instructions for injection.
 *
 * @param workflow - The workflow to format
 * @param variables - Variable values for interpolation
 * @returns Formatted workflow instructions
 */
function formatWorkflowInstructions(workflow: Workflow, variables: Record<string, string>): string {
  const loader = getLoader(lastWorkspacePath ?? process.cwd());
  return loader.getWorkflowInstructions(workflow, variables);
}

/**
 * Parse variable arguments from command args.
 * Format: --var=value or --var value
 *
 * @param args - Raw argument string
 * @returns Parsed variables object
 */
function parseVariables(args: string): { name: string; variables: Record<string, string> } {
  const parts = args.trim().split(/\s+/);
  const name = parts[0] ?? "";
  const variables: Record<string, string> = {};

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    if (part?.startsWith("--")) {
      const eqIndex = part.indexOf("=");
      if (eqIndex > 2) {
        // --key=value format
        const key = part.slice(2, eqIndex);
        const value = part.slice(eqIndex + 1);
        variables[key] = value;
      } else {
        const nextPart = parts[i + 1];
        if (nextPart && !nextPart.startsWith("--")) {
          // --key value format
          const key = part.slice(2);
          variables[key] = nextPart;
          i++;
        }
      }
    }
  }

  return { name, variables };
}

// =============================================================================
// /workflow Command - List and Execute Workflows
// =============================================================================

/**
 * /workflow command handler.
 *
 * Without arguments: Lists all available workflows
 * With workflow name: Loads and injects workflow instructions
 *
 * @example
 * ```
 * /workflow          # List all workflows
 * /workflow deploy   # Inject deploy workflow
 * /workflow deploy --env=prod --branch=main
 * ```
 */
async function executeWorkflow(ctx: CommandContext): Promise<CommandResult> {
  const args = ctx.parsedArgs.raw.trim();
  const loader = getLoader(ctx.session.cwd);

  // No arguments - list workflows
  if (!args) {
    try {
      const workflows = await loader.loadAll();
      return success(formatWorkflowList(workflows));
    } catch (err) {
      return error(
        "INTERNAL_ERROR",
        `Failed to load workflows: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Parse workflow name and variables
  const { name, variables } = parseVariables(args);

  if (!name) {
    return error(
      "INVALID_ARGUMENT",
      "Please specify a workflow name. Use /workflow to list available workflows."
    );
  }

  try {
    // Try to load the specific workflow
    const workflow = await loader.load(name);

    if (!workflow) {
      // Workflow not found - show helpful message
      const workflows = await loader.loadAll();
      const names = workflows.map((w: Workflow) => w.id);
      const suggestion =
        names.length > 0
          ? `\n\nAvailable workflows: ${names.join(", ")}`
          : "\n\nNo workflows found. Create one in .vellum/workflows/";

      return error("RESOURCE_NOT_FOUND", `Workflow "${name}" not found.${suggestion}`);
    }

    // Format workflow instructions for injection
    const instructions = formatWorkflowInstructions(workflow, variables);

    // Return pending result to inject instructions into context
    return pending({
      message: `📋 Loading workflow: ${workflow.name || workflow.id}`,
      promise: Promise.resolve(success(instructions)),
    });
  } catch (err) {
    return error(
      "INTERNAL_ERROR",
      `Failed to load workflow "${name}": ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * /workflow slash command definition.
 */
export const workflowCommand: SlashCommand = {
  name: "workflow",
  description: "List or execute workflows from .vellum/workflows/",
  kind: "builtin",
  category: "workflow",
  aliases: ["wf"],
  positionalArgs: [
    {
      name: "name",
      type: "string",
      description: "Workflow name to execute (optional)",
      required: false,
    },
  ],
  subcommands: [
    { name: "list", description: "List available workflows", aliases: ["ls"] },
    { name: "run", description: "Run a workflow by name" },
    { name: "validate", description: "Validate workflow file syntax" },
  ],
  execute: executeWorkflow,
};

/**
 * All workflow-related slash commands.
 */
export const workflowCommands: SlashCommand[] = [workflowCommand];
