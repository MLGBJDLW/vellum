/**
 * CLI Delegate Command - REQ-034)
 *
 * Implements the `vellum delegate <agent> <task>` CLI command
 * for delegating tasks to specific agents.
 *
 * @module cli/agents/commands/delegate
 */

import {
  AgentLevel,
  DEFAULT_DELEGATION_TIMEOUT,
  type DelegateTaskContext,
  type DelegateTaskParams,
  type DelegateTaskResult,
  type DelegationTarget,
  executeDelegateTask,
} from "@vellum/core";
import type { Command } from "commander";

import { ICONS } from "../../utils/icons.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Options for the delegate command.
 *
 * @example
 * ```typescript
 * const options: DelegateCommandOptions = {
 *   files: ['src/auth/login.ts', 'src/auth/types.ts'],
 *   timeout: 60000,
 *   confirm: true,
 * };
 * ```
 */
export interface DelegateCommandOptions {
  /** Related files for the task (comma-separated in CLI, parsed to array) */
  files?: string[];
  /** Task timeout in milliseconds */
  timeout?: number;
  /** Whether to show confirmation prompt before delegation */
  confirm?: boolean;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Parse comma-separated file paths into an array.
 *
 * @param value - Comma-separated file paths
 * @returns Array of file paths, or undefined if empty
 */
function parseFiles(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  return value
    .split(",")
    .map((f) => f.trim())
    .filter((f) => f.length > 0);
}

/**
 * Parse timeout value with validation.
 *
 * @param value - Timeout string value
 * @returns Parsed timeout in milliseconds
 * @throws Error if timeout is invalid
 */
function parseTimeout(value: string): number {
  const timeout = parseInt(value, 10);
  if (Number.isNaN(timeout) || timeout <= 0) {
    throw new Error(`Invalid timeout value: ${value}. Must be a positive integer.`);
  }
  return timeout;
}

/**
 * Create a DelegationTarget from an agent slug.
 *
 * CLI delegation supports builtin agents and MCP targets.
 * Custom agents require a mode config and should be created
 * through the TUI or programmatic API.
 *
 * @param agent - Agent identifier (slug or prefixed identifier)
 * @returns DelegationTarget for the specified agent
 * @throws Error if target format is invalid or unsupported
 */
function createDelegationTarget(agent: string): DelegationTarget {
  // Custom agents require mode config - not supported via CLI
  if (agent.startsWith("custom:")) {
    throw new Error(
      `Custom agents require a mode configuration and cannot be delegated via CLI. ` +
        `Use the TUI or programmatic API for custom agent delegation.`
    );
  }

  // MCP targets: mcp:serverId/toolName
  if (agent.startsWith("mcp:")) {
    const mcpPart = agent.slice(4);
    const [serverId, toolName] = mcpPart.split("/");
    if (!serverId || !toolName) {
      throw new Error(`Invalid MCP target format: ${agent}. Expected 'mcp:serverId/toolName'.`);
    }
    return {
      kind: "mcp",
      serverId,
      toolName,
    };
  }

  // Default to builtin agent
  return {
    kind: "builtin",
    slug: agent,
  };
}

/**
 * Create a mock DelegateTaskContext for CLI execution.
 *
 * In a full implementation, this would be integrated with the
 * session and agent management systems.
 *
 * @returns DelegateTaskContext for CLI execution
 */
function createCliContext(): DelegateTaskContext {
  return {
    workingDir: process.cwd(),
    sessionId: `cli-${Date.now()}`,
    messageId: `msg-${Date.now()}`,
    callId: `call-${Date.now()}`,
    abortSignal: new AbortController().signal,
    // CLI runs as orchestrator level (can delegate)
    agentLevel: AgentLevel.orchestrator,
    agentSlug: "cli",
    checkPermission: async () => true,
  };
}

// =============================================================================
// Command Registration
// =============================================================================

/**
 * Register the delegate command with Commander.js.
 *
 * Command: `vellum delegate <agent> <task>`
 *
 * Options:
 *   --files <paths>    Related files (comma-separated)
 *   --timeout <ms>     Task timeout in milliseconds (default: 300000)
 *   --no-confirm       Skip confirmation prompt
 *
 * @example
 * ```bash
 * # Delegate a task to the coder agent
 * vellum delegate coder "Implement authentication module"
 *
 * # With files context
 * vellum delegate coder "Fix bug in login" --files src/auth/login.ts,src/auth/types.ts
 *
 * # With custom timeout
 * vellum delegate analyst "Analyze codebase" --timeout 600000
 *
 * # Delegate to custom agent
 * vellum delegate custom:my-agent "Custom task"
 *
 * # Delegate to MCP tool
 * vellum delegate mcp:server/tool "MCP task"
 * ```
 *
 * @param program - Commander program instance
 */
export function registerDelegateCommand(program: Command): void {
  program
    .command("delegate <agent> <task>")
    .description("Delegate a task to a specific agent")
    .option("--files <paths>", "Related files (comma-separated)")
    .option("--timeout <ms>", "Task timeout in milliseconds", String(DEFAULT_DELEGATION_TIMEOUT))
    .option("--no-confirm", "Skip confirmation prompt")
    .action(async (agent: string, task: string, options: Record<string, unknown>) => {
      try {
        // Parse options
        const delegateOptions: DelegateCommandOptions = {
          files: parseFiles(options.files as string | undefined),
          timeout: parseTimeout((options.timeout as string) || String(DEFAULT_DELEGATION_TIMEOUT)),
          confirm: options.confirm !== false,
        };

        // Create delegation target
        const target = createDelegationTarget(agent);

        // Confirmation prompt (if enabled)
        if (delegateOptions.confirm) {
          console.log(`\n${ICONS.workflow} Delegation Details:`);
          console.log(`   Agent: ${agent}`);
          console.log(`   Task: ${task}`);
          if (delegateOptions.files?.length) {
            console.log(`   Files: ${delegateOptions.files.join(", ")}`);
          }
          console.log(`   Timeout: ${delegateOptions.timeout}ms`);
          console.log("");

          // In a full implementation, use readline or inquirer for confirmation
          // For now, we proceed directly (confirmation can be skipped with --no-confirm)
        }

        // Build delegation parameters
        const params: DelegateTaskParams = {
          target,
          task,
          context: delegateOptions.files ? { files: delegateOptions.files } : undefined,
          timeout: delegateOptions.timeout,
        };

        // Execute delegation
        const context = createCliContext();
        const result: DelegateTaskResult = await executeDelegateTask(params, context);

        if (result.success) {
          console.log(`\n${ICONS.success} Delegation successful!`);
          console.log(`   Task Packet ID: ${result.taskPacketId}`);
          if (result.agentId) {
            console.log(`   Agent ID: ${result.agentId}`);
          }
        } else {
          console.error(`\n${ICONS.error} Delegation failed:`);
          console.error(`   ${result.error}`);
          process.exit(1);
        }
      } catch (error) {
        console.error(`\n${ICONS.error} Error:`, error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });
}
