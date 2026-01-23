/**
 * Session List Command (T016)
 * @module cli/commands/session/list
 */

import {
  type SessionFilter,
  SessionListService,
  type SessionMetadata,
  StorageManager,
} from "@vellum/core";
import type { CommandContext, CommandResult, SlashCommand } from "../types.js";
import { error, success } from "../types.js";

// =============================================================================
// Types
// =============================================================================

export interface ListOptions {
  json?: boolean;
  limit?: number;
  status?: string;
}

// =============================================================================
// Formatters
// =============================================================================

/**
 * Format a date for display
 */
function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString();
}

/**
 * Format session metadata for display
 */
function formatSession(session: SessionMetadata, index: number): string {
  const status = session.status ?? "unknown";
  const statusIcon =
    status === "active" ? "🟢" : status === "paused" ? "🟡" : status === "completed" ? "✅" : "⚪";
  const title = session.title ?? "Untitled";
  const messageCount = session.messageCount ?? 0;
  const created = formatDate(session.createdAt);

  return [
    `${index + 1}. ${statusIcon} ${title}`,
    `   ID: ${session.id}`,
    `   Messages: ${messageCount} | Created: ${created}`,
    `   Status: ${status}`,
  ].join("\n");
}

// =============================================================================
// Command Handler
// =============================================================================

/**
 * Handle session list command
 */
async function handleList(options?: ListOptions): Promise<CommandResult> {
  try {
    // Initialize storage manager
    const storage = await StorageManager.create();
    const listService = new SessionListService(storage);

    // Build filter from options
    const filter: SessionFilter | undefined = options?.status
      ? { status: options.status as SessionFilter["status"] }
      : undefined;

    // Get sessions
    const result = await listService.listSessions(
      filter,
      { field: "lastActive", direction: "desc" },
      { pageSize: options?.limit ?? 20 }
    );

    if (result.items.length === 0) {
      return success(
        "📂 No sessions found.\n\n" + "Start a new conversation to create your first session."
      );
    }

    // JSON output
    if (options?.json) {
      return success(JSON.stringify(result.items, null, 2));
    }

    // Format for display
    const lines: string[] = [
      "📂 Sessions",
      "",
      `Showing ${result.items.length} of ${result.total} sessions`,
      "",
    ];

    for (const [i, session] of result.items.entries()) {
      lines.push(formatSession(session, i));
      lines.push("");
    }

    if (result.hasMore) {
      lines.push(`... and ${result.total - result.items.length} more sessions`);
      lines.push("");
    }

    lines.push("Use /session resume <id> to continue a session.");

    return success(lines.join("\n"));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error("INTERNAL_ERROR", `Failed to list sessions: ${message}`, [
      "Check if storage is accessible",
      "Try /session new to start fresh",
    ]);
  }
}

// =============================================================================
// Command Definition
// =============================================================================

/**
 * List command for displaying sessions
 */
export const listCommand: SlashCommand = {
  name: "list",
  aliases: ["ls"],
  description: "List all sessions",
  kind: "builtin",
  category: "session",
  positionalArgs: [],
  namedArgs: [
    {
      name: "json",
      type: "boolean",
      description: "Output as JSON",
      required: false,
    },
    {
      name: "limit",
      type: "number",
      description: "Maximum sessions to show (default: 20)",
      required: false,
    },
    {
      name: "status",
      type: "string",
      description: "Filter by status (active, paused, completed, archived)",
      required: false,
    },
  ],
  examples: [
    "/session list           - List recent sessions",
    "/session list --json    - Output as JSON",
    "/session list --limit=5 - Show only 5 sessions",
    "/session list --status=active - Show only active sessions",
  ],
  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    const json = ctx.parsedArgs.named?.json as boolean | undefined;
    const limit = ctx.parsedArgs.named?.limit as number | undefined;
    const status = ctx.parsedArgs.named?.status as string | undefined;

    return handleList({ json, limit, status });
  },
};

/**
 * Factory function to create list command with context
 */
export function createListCommand(): SlashCommand {
  return listCommand;
}
