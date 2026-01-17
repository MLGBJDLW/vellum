/**
 * Condense Slash Command (Context Management)
 *
 * Provides slash command for manually triggering context window optimization:
 * - /condense - Compact the conversation context
 * - /condense status - Show current context state
 *
 * @module cli/commands/condense
 */

import type { AgentLoop, ContextManageResult } from "@vellum/core";
import type { CommandContext, CommandResult, SlashCommand } from "./types.js";
import { error, success } from "./types.js";

// =============================================================================
// Module State
// =============================================================================

/**
 * Reference to the active AgentLoop instance.
 * Set by the App component when an agent session is active.
 */
let agentLoopRef: AgentLoop | null = null;

/**
 * Set the AgentLoop instance for context management commands.
 * Called by the App component when an agent session starts/ends.
 *
 * @param loop - The AgentLoop instance to use, or null when session ends
 */
export function setCondenseCommandLoop(loop: AgentLoop | null): void {
  agentLoopRef = loop;
}

/**
 * Get the current AgentLoop instance.
 * Returns null if no agent session is active.
 */
export function getCondenseCommandLoop(): AgentLoop | null {
  return agentLoopRef;
}

// =============================================================================
// Types
// =============================================================================

/**
 * Context state descriptions for user display
 */
const CONTEXT_STATE_DESCRIPTIONS: Record<string, string> = {
  healthy: "Context is healthy, no action needed",
  warning: "Context is approaching limits, may compress soon",
  critical: "Context is near capacity, compression recommended",
  overflow: "Context has exceeded limits, compression required",
};

/**
 * Get human-readable description for context state
 */
function getStateDescription(state: string): string {
  return CONTEXT_STATE_DESCRIPTIONS[state] ?? `Unknown state: ${state}`;
}

/**
 * Format context management result for display
 */
function formatResult(result: ContextManageResult): string {
  const lines: string[] = [];

  if (result.modified) {
    lines.push("✅ Context compacted successfully");
    lines.push("");
    lines.push(`📊 State: ${result.state}`);

    if (result.actions.length > 0) {
      lines.push(`🔧 Actions taken:`);
      for (const action of result.actions) {
        lines.push(`   • ${action}`);
      }
    }

    lines.push(`📝 Messages: ${result.messages.length}`);
  } else {
    lines.push("ℹ️ No compaction needed");
    lines.push("");
    lines.push(`📊 State: ${result.state}`);
    lines.push(`💡 ${getStateDescription(result.state)}`);
  }

  return lines.join("\n");
}

// =============================================================================
// /condense Command
// =============================================================================

/**
 * /condense command - Manually compact the conversation context.
 *
 * Usage:
 *   /condense        - Compact the context immediately
 *   /condense status - Show current context state
 */
export const condenseCommand: SlashCommand = {
  name: "condense",
  description: "Compact conversation context to free up token space",
  kind: "builtin",
  category: "workflow",
  aliases: ["compact", "compress"],
  subcommands: [{ name: "status", description: "Show current context state" }],
  positionalArgs: [
    {
      name: "subcommand",
      type: "string",
      description: "Subcommand (status)",
      required: false,
    },
  ],
  namedArgs: [],

  async execute(ctx: CommandContext): Promise<CommandResult> {
    const { parsedArgs } = ctx;

    // Check if we have access to the agent loop
    if (!agentLoopRef) {
      return error("RESOURCE_NOT_FOUND", "Context management is not available", [
        "No active agent session found. Start a conversation first.",
      ]);
    }

    // Check if context management is enabled
    if (!agentLoopRef.isContextManagementEnabled()) {
      return error("OPERATION_NOT_ALLOWED", "Context management is disabled", [
        "Enable context management in your configuration to use this command.",
        "",
        "Add to your vellum.config.ts:",
        "",
        "  contextManagement: {",
        "    enabled: true",
        "  }",
      ]);
    }

    // Handle subcommands
    const subcommand = parsedArgs.positional[0] as string | undefined;

    if (subcommand === "status") {
      const state = agentLoopRef.getContextState();
      const messages = agentLoopRef.getMessages();

      const lines: string[] = [
        "📊 Context Status",
        "",
        `   State: ${state ?? "unknown"}`,
        `   Messages: ${messages.length}`,
        "",
        `💡 ${getStateDescription(state ?? "healthy")}`,
      ];

      return success(lines.join("\n"));
    }

    if (subcommand && subcommand !== "status") {
      return error("INVALID_ARGUMENT", `Unknown subcommand: ${subcommand}`, [
        "Use /condense or /condense status",
      ]);
    }

    // Execute compaction
    try {
      const result = await agentLoopRef.compactContext();

      if (!result) {
        return error("INTERNAL_ERROR", "Compaction failed", [
          "Context management returned no result. This may indicate an internal error.",
        ]);
      }

      return success(formatResult(result));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return error("INTERNAL_ERROR", `Failed to compact context: ${message}`);
    }
  },
};

// =============================================================================
// Exports
// =============================================================================

export default condenseCommand;
