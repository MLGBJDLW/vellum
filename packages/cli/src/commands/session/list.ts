/**
 * Session List Command
 * @module cli/commands/session/list
 */

import {
  SessionListService as CoreSessionListService,
  StorageManager as CoreStorageManager,
  type SessionFilter,
  type SessionListService,
  type SessionMetadata,
  type StorageManager,
} from "@vellum/core";

import type { CommandContext, CommandResult, SlashCommand } from "../types.js";
import { error, success } from "../types.js";
import { formatDisplayDate } from "./utils.js";

export interface ListOptions {
  json?: boolean;
  limit?: number;
  status?: string;
  archived?: boolean;
}

function getStatusIcon(status: SessionMetadata["status"]): string {
  switch (status) {
    case "active":
      return "🟢";
    case "paused":
      return "🟡";
    case "completed":
      return "✅";
    case "archived":
      return "📦";
    default:
      return "⚪";
  }
}

function formatSession(session: SessionMetadata, index: number): string {
  const title = session.title || "Untitled";
  const status = session.status || "unknown";
  const created = formatDisplayDate(session.createdAt);
  const lastActive = formatDisplayDate(session.lastActive);
  const messageCount = session.messageCount ?? 0;

  return [
    `${index + 1}. ${getStatusIcon(status)} ${title}`,
    `   ID: ${session.id}`,
    `   Messages: ${messageCount} | Created: ${created}`,
    `   Last Active: ${lastActive} | Status: ${status}`,
  ].join("\n");
}

function sortByLastActive(sessions: SessionMetadata[]): SessionMetadata[] {
  return [...sessions].sort((left, right) => {
    const leftTime = new Date(left.lastActive).getTime();
    const rightTime = new Date(right.lastActive).getTime();
    return rightTime - leftTime;
  });
}

function buildListOutput(sessions: SessionMetadata[], total: number, options: ListOptions): string {
  const archived = options.archived ?? false;
  const lines: string[] = [
    archived ? "📂 Archived Sessions" : "📂 Sessions",
    "",
    `Showing ${sessions.length} of ${total} ${archived ? "archived " : ""}sessions`,
    "",
  ];

  for (const [index, session] of sessions.entries()) {
    lines.push(formatSession(session, index));
    lines.push("");
  }

  if (total > sessions.length) {
    lines.push(`… and ${total - sessions.length} more ${archived ? "archived " : ""}sessions`);
    lines.push("");
  }

  lines.push(
    archived
      ? "Use /session archived show <id> to inspect an archived session."
      : "Use /session show <id> or /session resume <id> to continue a session."
  );

  return lines.join("\n");
}

async function handleActiveList(
  options: ListOptions,
  deps: { storage?: StorageManager; listService?: SessionListService }
): Promise<CommandResult> {
  const storage = deps.storage ?? (await CoreStorageManager.create());
  const listService = deps.listService ?? new CoreSessionListService(storage);

  const filter: SessionFilter | undefined = options.status
    ? { status: options.status as SessionFilter["status"] }
    : undefined;

  const result = await listService.listSessions(
    filter,
    { field: "lastActive", direction: "desc" },
    { pageSize: options.limit ?? 20 }
  );

  if (result.items.length === 0) {
    return success(
      "📂 No sessions found.\n\nStart a new conversation to create your first session."
    );
  }

  if (options.json) {
    return success(JSON.stringify(result.items, null, 2));
  }

  return success(buildListOutput(result.items, result.total, options));
}

async function handleArchivedList(
  options: ListOptions,
  deps: { storage?: StorageManager }
): Promise<CommandResult> {
  const storage = deps.storage ?? (await CoreStorageManager.create());
  let sessions = await storage.getArchivedSessions();

  if (options.status) {
    const expectedStatuses = new Set(
      options.status
        .split(",")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
    );
    sessions = sessions.filter((session) => expectedStatuses.has(session.status));
  }

  const sorted = sortByLastActive(sessions);
  const limited = sorted.slice(0, options.limit ?? 20);

  if (limited.length === 0) {
    return success("📂 No archived sessions found.");
  }

  if (options.json) {
    return success(JSON.stringify(limited, null, 2));
  }

  return success(buildListOutput(limited, sorted.length, { ...options, archived: true }));
}

async function handleList(
  options: ListOptions,
  deps: { storage?: StorageManager; listService?: SessionListService } = {}
): Promise<CommandResult> {
  try {
    if (options.archived) {
      return await handleArchivedList(options, { storage: deps.storage });
    }

    return await handleActiveList(options, deps);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error("INTERNAL_ERROR", `Failed to list sessions: ${message}`, [
      "Check if session storage is accessible.",
      "Try /session list --json for raw output.",
    ]);
  }
}

export function createListCommand(
  storage?: StorageManager,
  listService?: SessionListService
): SlashCommand {
  return {
    name: "list",
    aliases: ["ls"],
    description: "List saved sessions",
    kind: "builtin",
    category: "session",
    positionalArgs: [],
    namedArgs: [
      {
        name: "json",
        type: "boolean",
        description: "Output the session list as JSON",
        required: false,
      },
      {
        name: "limit",
        type: "number",
        description: "Maximum number of sessions to show (default: 20)",
        required: false,
      },
      {
        name: "status",
        type: "string",
        description: "Filter by status (active, paused, completed, archived)",
        required: false,
      },
      {
        name: "archived",
        type: "boolean",
        description: "List archived sessions instead of active ones",
        required: false,
      },
    ],
    examples: [
      "/session list                    - List recent active sessions",
      "/session list --status=active    - Filter active sessions",
      "/session list --archived         - List archived sessions",
      "/session archived list           - Equivalent archived listing",
    ],
    execute: async (ctx: CommandContext): Promise<CommandResult> => {
      return handleList(
        {
          json: ctx.parsedArgs.named.json as boolean | undefined,
          limit: ctx.parsedArgs.named.limit as number | undefined,
          status: ctx.parsedArgs.named.status as string | undefined,
          archived: ctx.parsedArgs.named.archived as boolean | undefined,
        },
        { storage, listService }
      );
    },
  };
}

export const listCommand: SlashCommand = createListCommand();
