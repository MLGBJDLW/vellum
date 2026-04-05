/**
 * Session Delete Command
 * @module cli/commands/session/delete
 */

import type { SessionListService, SessionMetadata, StorageManager } from "@vellum/core";

import type { CommandContext, CommandResult, SlashCommand } from "../types.js";
import { error, interactive, success } from "../types.js";
import { findSessionById } from "./resume.js";

export interface SessionDeleteOptions {
  force?: boolean;
  all?: boolean;
}

function isConfirmed(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === "y" || normalized === "yes" || normalized === "true" || normalized === "1";
}

async function deleteSessions(storage: StorageManager, sessionIds: string[]): Promise<number> {
  let deletedCount = 0;

  for (const sessionId of sessionIds) {
    const deleted = await storage.delete(sessionId);
    if (deleted) {
      deletedCount += 1;
    }
  }

  return deletedCount;
}

async function resolveDeleteTargets(
  storage: StorageManager,
  listService: SessionListService,
  sessionId: string | undefined,
  deleteAll: boolean
): Promise<
  { sessionIds: string[]; label: string; description: string } | { result: CommandResult }
> {
  if (deleteAll) {
    const index = await storage.getIndex();
    const sessions = Array.from(index.values()) as SessionMetadata[];

    if (sessions.length === 0) {
      return { result: success("No active sessions to delete.") };
    }

    return {
      sessionIds: sessions.map((session) => session.id),
      label: `${sessions.length} active sessions`,
      description: `Delete ${sessions.length} active sessions`,
    };
  }

  if (!sessionId) {
    return {
      result: error("MISSING_ARGUMENT", "Please provide a session ID to delete.", [
        "/session delete <session-id>",
        "/session delete --all",
      ]),
    };
  }

  const lookup = await findSessionById(sessionId, { storage, listService });
  if (!lookup.ok || !lookup.session) {
    return {
      result: error("RESOURCE_NOT_FOUND", lookup.error ?? "Session not found."),
    };
  }

  return {
    sessionIds: [lookup.session.metadata.id],
    label: lookup.session.metadata.title,
    description: `Delete session "${lookup.session.metadata.title}"`,
  };
}

export function createDeleteCommand(
  storage?: StorageManager,
  listService?: SessionListService
): SlashCommand {
  return {
    name: "delete",
    aliases: ["rm", "remove"],
    description: "Delete one or more saved sessions",
    kind: "builtin",
    category: "session",
    positionalArgs: [
      {
        name: "session-id",
        type: "string",
        description: "Session ID or short ID",
        required: false,
      },
    ],
    namedArgs: [
      {
        name: "force",
        shorthand: "f",
        type: "boolean",
        description: "Skip confirmation prompt",
        required: false,
      },
      {
        name: "all",
        type: "boolean",
        description: "Delete all active sessions",
        required: false,
      },
    ],
    examples: [
      "/session delete abc12345        - Delete a single session",
      "/session delete abc12345 --force - Delete without confirmation",
      "/session delete --all            - Delete all active sessions",
    ],
    execute: async (ctx: CommandContext): Promise<CommandResult> => {
      if (!storage || !listService) {
        return error(
          "INTERNAL_ERROR",
          "Delete command not initialized. Use createDeleteCommand with storage dependencies."
        );
      }

      const sessionId = ctx.parsedArgs.positional[0] as string | undefined;
      const deleteAll = (ctx.parsedArgs.named.all as boolean | undefined) ?? false;
      const force = (ctx.parsedArgs.named.force as boolean | undefined) ?? false;

      const targetResult = await resolveDeleteTargets(storage, listService, sessionId, deleteAll);
      if ("result" in targetResult) {
        return targetResult.result;
      }

      const executeDeletion = async (): Promise<CommandResult> => {
        const deletedCount = await deleteSessions(storage, targetResult.sessionIds);
        if (deletedCount === 0) {
          return error("RESOURCE_NOT_FOUND", "No matching sessions were deleted.");
        }

        return success(
          deleteAll
            ? `🗑️ Deleted ${deletedCount} active sessions.`
            : `🗑️ Deleted session "${targetResult.label}".`
        );
      };

      if (force) {
        return executeDeletion();
      }

      return interactive({
        inputType: "confirm",
        message: `[WARN] ${targetResult.description}? This cannot be undone.`,
        defaultValue: "n",
        handler: async (value: string): Promise<CommandResult> => {
          if (!isConfirmed(value)) {
            return success("Session deletion cancelled.");
          }

          return executeDeletion();
        },
        onCancel: () => success("Session deletion cancelled."),
      });
    },
  };
}

export const deleteCommand: SlashCommand = createDeleteCommand();
