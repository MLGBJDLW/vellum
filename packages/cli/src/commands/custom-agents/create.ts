/**
 * Custom Agents Create Command (T021)
 *
 * Creates a new custom agent definition from a template.
 *
 * @module cli/commands/custom-agents/create
 * @see REQ-019
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { isValidSlug, SLUG_PATTERN } from "@vellum/core";
import chalk from "chalk";

import type { CommandResult } from "../types.js";
import { error, interactive, success } from "../types.js";
import type { CreateOptions } from "./index.js";

// =============================================================================
// Templates
// =============================================================================

/**
 * Template types available for agent creation
 */
type TemplateType = "basic" | "advanced" | "orchestrator";

/**
 * Basic agent template (minimal configuration)
 */
function getBasicTemplate(slug: string, name: string): string {
  return `---
slug: ${slug}
name: "${name}"
mode: code
description: "Custom agent for specialized tasks"
icon: "🤖"
---

# ${name}

You are a helpful AI assistant.

## Instructions

Follow these guidelines when assisting users:
- Be concise and clear
- Ask for clarification when needed
- Provide examples when helpful
`;
}

/**
 * Advanced agent template (full configuration)
 */
function getAdvancedTemplate(slug: string, name: string): string {
  return `---
slug: ${slug}
name: "${name}"
mode: code
description: "Advanced custom agent with full configuration"
icon: "⚡"
color: "#3b82f6"
version: "1.0.0"
author: "user"
tags:
  - custom
  - advanced

# Tool configuration
toolGroups:
  - group: filesystem
    enabled: true
  - group: shell
    enabled: true

# Restrictions
restrictions:
  fileRestrictions:
    - pattern: "src/**"
      access: write
    - pattern: "*.config.*"
      access: read
  maxTokens: 8192
  timeout: 300000

# Runtime settings
settings:
  temperature: 0.7
  extendedThinking: false
  streamOutput: true
  autoConfirm: false

# When to suggest this agent
whenToUse:
  description: "Use this agent for specialized coding tasks"
  triggers:
    - type: keyword
      pattern: "implement|build|create"
  priority: 10
---

# ${name}

You are a specialized AI assistant with advanced capabilities.

## Core Responsibilities

1. Analyze requirements carefully before implementation
2. Write clean, well-documented code
3. Follow best practices and project conventions
4. Test your implementations thoroughly

## Guidelines

- Always explain your approach before making changes
- Ask clarifying questions when requirements are ambiguous
- Consider edge cases and error handling
- Document complex logic with comments

## Constraints

- Only modify files within your allowed scope
- Prefer existing patterns found in the codebase
- Keep changes focused and minimal
`;
}

/**
 * Orchestrator agent template (for multi-agent workflows)
 */
function getOrchestratorTemplate(slug: string, name: string): string {
  return `---
slug: ${slug}
name: "${name}"
mode: plan
description: "Orchestrator agent for coordinating multi-agent workflows"
icon: "🎯"
color: "#8b5cf6"
version: "1.0.0"
level: orchestrator

# Multi-agent coordination
coordination:
  canSpawnAgents:
    - coder
    - reviewer
    - tester
  maxConcurrentSubagents: 3

# Settings for orchestration
settings:
  temperature: 0.5
  extendedThinking: true
  streamOutput: true

whenToUse:
  description: "Use for complex tasks requiring multiple agents"
  triggers:
    - type: keyword
      pattern: "complex|multi-step|orchestrate"
  priority: 20
---

# ${name}

You are an orchestrator agent responsible for coordinating complex workflows.

## Your Role

As an orchestrator, you:
1. Break down complex tasks into subtasks
2. Delegate subtasks to specialized agents
3. Coordinate and synthesize results
4. Ensure overall task completion

## Workflow Strategy

1. **Analysis**: Understand the full scope of the request
2. **Planning**: Create a step-by-step execution plan
3. **Delegation**: Assign tasks to appropriate agents
4. **Monitoring**: Track progress and handle issues
5. **Synthesis**: Combine results into final output

## Available Agents

You can delegate to these specialized agents:
- \`coder\`: Implementation tasks
- \`reviewer\`: Code review and analysis
- \`tester\`: Testing and validation

## Constraints

- Always create a plan before delegating
- Monitor agent progress and intervene if needed
- Synthesize results before presenting to user
`;
}

/**
 * Get template content by type
 */
function getTemplate(type: TemplateType, slug: string, name: string): string {
  switch (type) {
    case "advanced":
      return getAdvancedTemplate(slug, name);
    case "orchestrator":
      return getOrchestratorTemplate(slug, name);
    default:
      return getBasicTemplate(slug, name);
  }
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Convert slug to display name
 */
function slugToName(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Validate slug format
 */
function validateSlug(slug: string): { valid: boolean; message?: string } {
  if (!slug || slug.trim().length === 0) {
    return { valid: false, message: "Slug cannot be empty" };
  }

  if (slug.length > 50) {
    return { valid: false, message: "Slug must be 50 characters or less" };
  }

  if (!isValidSlug(slug)) {
    return {
      valid: false,
      message: `Slug must be lowercase alphanumeric with hyphens (pattern: ${SLUG_PATTERN.source})`,
    };
  }

  return { valid: true };
}

/**
 * Get agent file path
 */
function getAgentFilePath(slug: string, global: boolean): string {
  const baseDir = global
    ? path.join(os.homedir(), ".vellum", "agents")
    : path.join(process.cwd(), ".vellum", "agents");

  return path.join(baseDir, `${slug}.md`);
}

/**
 * Check if file already exists
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

// =============================================================================
// Command Handler
// =============================================================================

/**
 * Handle create subcommand
 *
 * Creates a new custom agent definition file from a template.
 *
 * @param slug - Agent slug (identifier)
 * @param options - Create options
 * @returns Command result
 */
export async function handleCreate(
  slug: string | undefined,
  options: CreateOptions = {}
): Promise<CommandResult> {
  // If no slug provided, prompt for it (unless no-interactive)
  if (!slug) {
    if (options.noInteractive) {
      return error("MISSING_ARGUMENT", "Agent slug is required", [
        "Provide a slug: /custom-agents create <slug>",
      ]);
    }

    return interactive({
      inputType: "text",
      message: "Enter agent slug (lowercase, alphanumeric, hyphens):",
      placeholder: "my-custom-agent",
      handler: async (value) => {
        return handleCreate(value, options);
      },
      onCancel: () => success("Agent creation cancelled"),
    });
  }

  // Validate slug
  const validation = validateSlug(slug);
  if (!validation.valid) {
    return error("INVALID_ARGUMENT", validation.message ?? "Invalid slug format", [
      "Example valid slugs: my-agent, code-reviewer, test-helper",
    ]);
  }

  // Parse template type
  const templateType: TemplateType = (options.template?.toLowerCase() as TemplateType) || "basic";

  if (!["basic", "advanced", "orchestrator"].includes(templateType)) {
    return error("INVALID_ARGUMENT", `Unknown template: ${options.template}`, [
      "Available templates: basic, advanced, orchestrator",
    ]);
  }

  // Get file path
  const filePath = getAgentFilePath(slug, options.global ?? false);
  const dirPath = path.dirname(filePath);

  // Check if file already exists
  if (await fileExists(filePath)) {
    return error("OPERATION_NOT_ALLOWED", `Agent "${slug}" already exists at: ${filePath}`, [
      `Use a different slug, or delete the existing file first`,
    ]);
  }

  try {
    // Ensure directory exists
    await ensureDir(dirPath);

    // Generate name from slug
    const name = slugToName(slug);

    // Get template content
    const content = getTemplate(templateType, slug, name);

    // Write file
    await fs.writeFile(filePath, content, "utf-8");

    // Success message
    const scope = options.global ? "user" : "project";
    const lines = [
      chalk.green(`✅ Created agent "${slug}" (${scope} scope)`),
      "",
      chalk.gray(`File: ${filePath}`),
      chalk.gray(`Template: ${templateType}`),
      "",
      chalk.cyan("Next steps:"),
      chalk.gray(`  1. Edit the agent file to customize behavior`),
      chalk.gray(`  2. Run: /custom-agents validate ${slug}`),
      chalk.gray(`  3. Use: /mode ${slug}`),
    ];

    return success(lines.join("\n"));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error("INTERNAL_ERROR", `Failed to create agent: ${message}`);
  }
}
