/**
 * Session Show Command
 * @module cli/commands/session/show
 */

import {
  getTextContent,
  type Session,
  type SessionListService,
  type StorageManager,
} from "@vellum/core";

import type { CommandContext, CommandResult, SlashCommand } from "../types.js";
import { error, success } from "../types.js";
import { formatDisplayDate, resolveSessionReference, truncateText } from "./utils.js";

export interface SessionShowOptions {
  json?: boolean;
  messages?: boolean;
  archived?: boolean;
}

function formatMessagePreview(session: Session): string[] {
  const preview = session.messages.slice(-5);
  if (preview.length === 0) {
    return ["Recent messages: none"];
  }

  return [
    "Recent messages:",
    ...preview.map((message) => {
      const content = getTextContent(message).trim() || "[non-text content]";
      const createdAt = formatDisplayDate(new Date(message.metadata.createdAt));
      return `  - [${message.role}] ${truncateText(content, 120)} (${createdAt})`;
    }),
  ];
}

function formatSessionDetails(session: Session, options: SessionShowOptions): string {
  const { metadata } = session;
  const archived = options.archived ?? false;
  const lines: string[] = [
    archived ? "🗄️ Archived Session" : "🗂️ Session Details",
    "",
    `Title: ${metadata.title}`,
    `ID: ${metadata.id}`,
    `Status: ${metadata.status}`,
    `Mode: ${metadata.mode}`,
    `Created: ${formatDisplayDate(metadata.createdAt)}`,
    `Updated: ${formatDisplayDate(metadata.updatedAt)}`,
    `Last Active: ${formatDisplayDate(metadata.lastActive)}`,
    `Messages: ${metadata.messageCount}`,
    `Tokens: ${metadata.tokenCount.toLocaleString()}`,
    `Working directory: ${metadata.workingDirectory}`,
  ];

  if (metadata.tags.length > 0) {
    lines.push(`Tags: ${metadata.tags.join(", ")}`);
  }

  if (metadata.summary) {
    lines.push(`Summary: ${metadata.summary}`);
  }

  if (options.messages) {
    lines.push("");
    lines.push(...formatMessagePreview(session));
  }

  return lines.join("\n");
}

export function createShowCommand(
  storage?: StorageManager,
  listService?: SessionListService
): SlashCommand {
  return {
    name: "show",
    aliases: ["view"],
    description: "Show detailed information for a saved session",
    kind: "builtin",
    category: "session",
    positionalArgs: [
      {
        name: "session-id",
        type: "string",
        description: "Session ID or short ID",
        required: true,
      },
    ],
    namedArgs: [
      {
        name: "json",
        type: "boolean",
        description: "Output raw session JSON",
        required: false,
      },
      {
        name: "messages",
        type: "boolean",
        description: "Include a preview of recent messages",
        required: false,
      },
      {
        name: "archived",
        type: "boolean",
        description: "Show an archived session instead of an active one",
        required: false,
      },
    ],
    examples: [
      "/session show abc12345              - Show an active session",
      "/session show abc12345 --messages   - Include message preview",
      "/session archived show abc12345     - Show an archived session",
    ],
    execute: async (ctx: CommandContext): Promise<CommandResult> => {
      if (!storage || !listService) {
        return error(
          "INTERNAL_ERROR",
          "Show command not initialized. Use createShowCommand with storage dependencies."
        );
      }

      const sessionId = ctx.parsedArgs.positional[0] as string | undefined;
      if (!sessionId) {
        return error("MISSING_ARGUMENT", "Please provide a session ID.", [
          "/session show <session-id>",
          "/session archived show <session-id>",
        ]);
      }

      const options: SessionShowOptions = {
        json: ctx.parsedArgs.named.json as boolean | undefined,
        messages: ctx.parsedArgs.named.messages as boolean | undefined,
        archived: ctx.parsedArgs.named.archived as boolean | undefined,
      };

      const result = await resolveSessionReference({
        storage,
        listService,
        sessionId,
        archived: options.archived,
      });

      if (!result.ok || !result.session) {
        return error("RESOURCE_NOT_FOUND", result.error ?? "Session not found.");
      }

      if (options.json) {
        return success(JSON.stringify(result.session, null, 2));
      }

      return success(formatSessionDetails(result.session, options));
    },
  };
}

export const showCommand: SlashCommand = createShowCommand();
