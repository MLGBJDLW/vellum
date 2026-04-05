/**
 * Session Commands Index
 * @module cli/commands/session
 */

import type { SessionListService, StorageManager } from "@vellum/core";

import type { CommandContext, CommandResult, SlashCommand } from "../types.js";
import { error } from "../types.js";
import { archiveCommand, createArchiveCommand } from "./archive.js";
import { createDeleteCommand, deleteCommand } from "./delete.js";
import { createExportCommand, exportCommand } from "./export.js";
import { createListCommand, listCommand } from "./list.js";
import { createResumeCommand, resumeCommand } from "./resume.js";
import { searchCommand } from "./search.js";
import { createShowCommand, showCommand } from "./show.js";

const SESSION_SUBCOMMANDS: SlashCommand["subcommands"] = [
  { name: "list", description: "List saved sessions" },
  { name: "resume", description: "Resume a saved session" },
  { name: "show", description: "Show session details" },
  { name: "export", description: "Export a session to a file" },
  { name: "delete", description: "Delete saved sessions" },
  { name: "archive", description: "Archive a saved session" },
  { name: "archived", description: "List or inspect archived sessions" },
];

const SESSION_EXAMPLES = [
  "/session list",
  "/session resume abc12345",
  "/session show abc12345",
  "/session export abc12345 --format=markdown",
  "/session delete abc12345",
  "/session archive abc12345",
  "/session archived list",
] as const;

function rebindContext(
  ctx: CommandContext,
  command: string,
  positional: readonly string[],
  namedOverrides: Readonly<Record<string, unknown>> = {}
): CommandContext {
  return {
    ...ctx,
    parsedArgs: {
      ...ctx.parsedArgs,
      command,
      positional,
      named: {
        ...ctx.parsedArgs.named,
        ...namedOverrides,
      },
    },
  };
}

export function createSessionCommand(
  storage: StorageManager,
  listService: SessionListService
): SlashCommand {
  const listWithDeps = createListCommand(storage, listService);
  const showWithDeps = createShowCommand(storage, listService);
  const exportWithDeps = createExportCommand(storage, listService);
  const deleteWithDeps = createDeleteCommand(storage, listService);
  const archiveWithDeps = createArchiveCommand(storage, listService);
  const resumeWithDeps = createResumeCommand(storage, listService);

  return {
    name: "session",
    description: "Manage saved and archived sessions",
    kind: "builtin",
    category: "session",
    aliases: ["sessions"],
    subcommands: SESSION_SUBCOMMANDS,
    examples: SESSION_EXAMPLES,
    execute: async (ctx: CommandContext): Promise<CommandResult> => {
      const positional = ctx.parsedArgs.positional as string[];
      const subcommand = positional[0]?.toLowerCase() ?? "list";
      const rest = positional.slice(1);

      switch (subcommand) {
        case "list":
          return listWithDeps.execute(rebindContext(ctx, "session:list", rest));
        case "resume":
          return resumeWithDeps.execute(rebindContext(ctx, "session:resume", rest));
        case "show":
          return showWithDeps.execute(rebindContext(ctx, "session:show", rest));
        case "export":
          return exportWithDeps.execute(rebindContext(ctx, "session:export", rest));
        case "delete":
        case "remove":
        case "rm":
          return deleteWithDeps.execute(rebindContext(ctx, "session:delete", rest));
        case "archive":
          return archiveWithDeps.execute(rebindContext(ctx, "session:archive", rest));
        case "archived": {
          const archivedSubcommand = rest[0]?.toLowerCase() ?? "list";
          const archivedRest = rest.slice(1);

          switch (archivedSubcommand) {
            case "list":
              return listWithDeps.execute(
                rebindContext(ctx, "session:archived:list", archivedRest, { archived: true })
              );
            case "show":
              return showWithDeps.execute(
                rebindContext(ctx, "session:archived:show", archivedRest, { archived: true })
              );
            case "export":
              return exportWithDeps.execute(
                rebindContext(ctx, "session:archived:export", archivedRest, {
                  archived: true,
                })
              );
            case "resume":
              return error(
                "OPERATION_NOT_ALLOWED",
                "Archived session resume is not supported yet because restore/unarchive is not implemented.",
                ["/session archived show <session-id>", "/session archived export <session-id>"]
              );
            default:
              return error(
                "INVALID_ARGUMENT",
                `Unknown archived session subcommand: ${archivedSubcommand}`,
                [
                  "/session archived list",
                  "/session archived show <session-id>",
                  "/session archived export <session-id>",
                ]
              );
          }
        }
        default:
          return error("INVALID_ARGUMENT", `Unknown session subcommand: ${subcommand}`, [
            "/session list",
            "/session resume <session-id>",
            "/session show <session-id>",
            "/session export <session-id>",
            "/session delete <session-id>",
            "/session archive <session-id>",
            "/session archived list",
          ]);
      }
    },
  };
}

export const sessionCommand: SlashCommand = {
  name: "session",
  description: "Manage saved and archived sessions",
  kind: "builtin",
  category: "session",
  aliases: ["sessions"],
  subcommands: SESSION_SUBCOMMANDS,
  examples: SESSION_EXAMPLES,
  execute: async (): Promise<CommandResult> => {
    return error(
      "INTERNAL_ERROR",
      "Session command not initialized. Use createSessionCommand with storage dependencies."
    );
  },
};

export {
  archiveCommand,
  createArchiveCommand,
  createDeleteCommand,
  createExportCommand,
  createListCommand,
  createShowCommand,
  deleteCommand,
  exportCommand,
  listCommand,
  resumeCommand,
  searchCommand,
  showCommand,
};
export {
  createResumeCommand,
  findSessionById,
  getMostRecentSession,
  type ResumeSessionEventData,
  type SessionLookupOptions,
  type SessionLookupResult,
  SHORT_ID_LENGTH,
} from "./resume.js";
export { createSearchCommand, type SearchSessionEventData } from "./search.js";
