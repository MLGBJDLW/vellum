/**
 * Session Archive Command
 * @module cli/commands/session/archive
 */

import type { SessionListService, StorageManager } from "@vellum/core";

import type { CommandContext, CommandResult, SlashCommand } from "../types.js";
import { error, interactive, success } from "../types.js";
import { findSessionById } from "./resume.js";

export interface SessionArchiveOptions {
  force?: boolean;
}

function isConfirmed(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === "y" || normalized === "yes" || normalized === "true" || normalized === "1";
}

export function createArchiveCommand(
  storage?: StorageManager,
  listService?: SessionListService
): SlashCommand {
  return {
    name: "archive",
    description: "Move a saved session into the archive",
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
        name: "force",
        shorthand: "f",
        type: "boolean",
        description: "Skip confirmation prompt",
        required: false,
      },
    ],
    examples: [
      "/session archive abc12345        - Archive a session",
      "/session archive abc12345 --force - Archive without confirmation",
    ],
    execute: async (ctx: CommandContext): Promise<CommandResult> => {
      if (!storage || !listService) {
        return error(
          "INTERNAL_ERROR",
          "Archive command not initialized. Use createArchiveCommand with storage dependencies."
        );
      }

      const sessionId = ctx.parsedArgs.positional[0] as string | undefined;
      if (!sessionId) {
        return error("MISSING_ARGUMENT", "Please provide a session ID to archive.", [
          "/session archive <session-id>",
        ]);
      }

      const lookup = await findSessionById(sessionId, { storage, listService });
      if (!lookup.ok || !lookup.session) {
        return error("RESOURCE_NOT_FOUND", lookup.error ?? "Session not found.");
      }

      const session = lookup.session;

      const archiveSession = async (): Promise<CommandResult> => {
        try {
          await storage.archiveSession(session.metadata.id);
          return success(`📦 Archived session "${session.metadata.title}".`);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return error("INTERNAL_ERROR", `Failed to archive session: ${message}`);
        }
      };

      if ((ctx.parsedArgs.named.force as boolean | undefined) ?? false) {
        return archiveSession();
      }

      return interactive({
        inputType: "confirm",
        message: `[WARN] Archive session "${lookup.session.metadata.title}"?`,
        defaultValue: "n",
        handler: async (value: string): Promise<CommandResult> => {
          if (!isConfirmed(value)) {
            return success("Session archive cancelled.");
          }

          return archiveSession();
        },
        onCancel: () => success("Session archive cancelled."),
      });
    },
  };
}

export const archiveCommand: SlashCommand = createArchiveCommand();
