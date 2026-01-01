/**
 * Resume Command
 *
 * Resumes a previous session by ID or most recent session.
 * Supports interactive session selection with pagination.
 *
 * @module cli/commands/session/resume
 */

import { select } from "@inquirer/prompts";
import type { Session, SessionListService, SessionMetadata, StorageManager } from "@vellum/core";

import type { CommandContext, CommandResult, SlashCommand } from "../types.js";
import { error, pending, success } from "../types.js";

// =============================================================================
// Short ID Constants
// =============================================================================

/**
 * Number of characters in a short ID.
 */
export const SHORT_ID_LENGTH = 8;

/**
 * Number of sessions to show per page in interactive selector.
 */
export const SESSIONS_PER_PAGE = 10;

// =============================================================================
// Session Selection Utilities
// =============================================================================

/**
 * Options for session selection.
 */
export interface SessionSelectOptions {
  /** Storage manager for session data */
  storage: StorageManager;
  /** Session list service for queries */
  listService: SessionListService;
  /** Whether to show sessions from all directories */
  showAllDirs?: boolean;
}

/**
 * Format a date as "MM/dd HH:mm".
 *
 * @param date - Date to format
 * @returns Formatted string like "12/30 14:30"
 */
function formatSessionDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${month}/${day} ${hours}:${minutes}`;
}

/**
 * Format a session metadata for display in the selector.
 *
 * @param session - Session metadata
 * @param index - Display index (1-based)
 * @returns Formatted string like "1. 调试API错误 (12/30 14:30) - 15条消息"
 */
export function formatSessionChoice(session: SessionMetadata, index: number): string {
  const date = formatSessionDate(session.lastActive);
  return `${index}. ${session.title} (${date}) - ${session.messageCount}条消息`;
}

/**
 * Group sessions by working directory.
 *
 * @param sessions - Array of session metadata
 * @returns Map of working directory to sessions
 */
export function groupSessionsByDirectory(
  sessions: SessionMetadata[]
): Map<string, SessionMetadata[]> {
  const grouped = new Map<string, SessionMetadata[]>();

  for (const session of sessions) {
    const dir = session.workingDirectory;
    const existing = grouped.get(dir);
    if (existing) {
      existing.push(session);
    } else {
      grouped.set(dir, [session]);
    }
  }

  return grouped;
}

/**
 * Interactively select a session from the list.
 *
 * Shows a paginated list of recent sessions for user selection.
 * Returns null if the user cancels the selection.
 *
 * @param options - Selection options
 * @returns Selected session or null if cancelled
 *
 * @example
 * ```typescript
 * const session = await selectSession({ storage, listService });
 * if (session) {
 *   console.log("Selected:", session.metadata.title);
 * }
 * ```
 */
export async function selectSession(options: SessionSelectOptions): Promise<Session | null> {
  const { storage, listService, showAllDirs } = options;

  // Get recent sessions
  const sessions = await listService.getRecentSessions(SESSIONS_PER_PAGE * 5); // Get more for pagination

  if (sessions.length === 0) {
    return null;
  }

  // Build choices for the selector
  interface SessionChoice {
    name: string;
    value: string;
    description?: string;
  }

  const choices: SessionChoice[] = [];

  if (showAllDirs) {
    // Group by directory
    const grouped = groupSessionsByDirectory(sessions);
    let globalIndex = 1;

    for (const [dir, dirSessions] of grouped) {
      // Add separator for each directory
      choices.push({
        name: `── ${dir} ──`,
        value: "__separator__",
        description: `${dirSessions.length} 个会话`,
      });

      // Add sessions in this directory (up to page size)
      const displaySessions = dirSessions.slice(0, SESSIONS_PER_PAGE);
      for (const session of displaySessions) {
        choices.push({
          name: formatSessionChoice(session, globalIndex),
          value: session.id,
          description: session.summary,
        });
        globalIndex++;
      }
    }
  } else {
    // Flat list with pagination
    const displaySessions = sessions.slice(0, SESSIONS_PER_PAGE);
    displaySessions.forEach((session, idx) => {
      choices.push({
        name: formatSessionChoice(session, idx + 1),
        value: session.id,
        description: session.summary,
      });
    });
  }

  // Filter out separators for actual selection
  const selectableChoices = choices.filter((c) => c.value !== "__separator__");

  if (selectableChoices.length === 0) {
    return null;
  }

  try {
    const selectedId = await select({
      message: "选择要恢复的会话:",
      choices: selectableChoices,
      pageSize: SESSIONS_PER_PAGE,
    });

    // Load the selected session
    const session = await storage.load(selectedId);
    return session;
  } catch {
    // User cancelled (Ctrl+C)
    return null;
  }
}

// =============================================================================
// Session Lookup Utilities
// =============================================================================

/**
 * Result of a session lookup operation.
 */
export interface SessionLookupResult {
  /** Whether the lookup was successful */
  ok: boolean;
  /** The found session (if ok is true) */
  session?: Session;
  /** Error message (if ok is false) */
  error?: string;
}

/**
 * Options for session lookup operations.
 */
export interface SessionLookupOptions {
  /** Storage manager for session data */
  storage: StorageManager;
  /** Session list service for queries */
  listService: SessionListService;
  /** Whether to search all directories */
  searchAllDirs?: boolean;
}

/**
 * Finds a session by full ID or short ID (first 8 characters).
 *
 * Short IDs are matched against the prefix of full session IDs.
 * If multiple sessions match a short ID, returns an error.
 *
 * @param id - Full session ID or short ID prefix
 * @param options - Lookup options
 * @returns Session lookup result
 *
 * @example
 * ```typescript
 * const result = await findSessionById("abc12345", { storage, listService });
 * if (result.ok && result.session) {
 *   console.log(result.session.metadata.title);
 * }
 * ```
 */
export async function findSessionById(
  id: string,
  options: SessionLookupOptions
): Promise<SessionLookupResult> {
  const { storage } = options;

  // Try exact match first
  try {
    const session = await storage.load(id);
    return { ok: true, session };
  } catch {
    // Not found by exact ID, continue to short ID search
  }

  // If ID is short, search by prefix
  if (id.length <= SHORT_ID_LENGTH) {
    const index = await storage.getIndex();
    const matches: SessionMetadata[] = [];

    for (const [sessionId, metadata] of index) {
      if (sessionId.toLowerCase().startsWith(id.toLowerCase())) {
        matches.push(metadata);
      }
    }

    if (matches.length === 0) {
      return { ok: false, error: `未找到会话: ${id}` };
    }

    if (matches.length > 1) {
      const matchList = matches.slice(0, 5).map((m) => `  ${m.id.slice(0, 8)} - ${m.title}`);
      return {
        ok: false,
        error: `多个会话匹配 "${id}":\n${matchList.join("\n")}\n请使用更长的ID以区分`,
      };
    }

    // Single match - load the full session
    const firstMatch = matches[0];
    if (!firstMatch) {
      return { ok: false, error: `未找到会话: ${id}` };
    }
    try {
      const session = await storage.load(firstMatch.id);
      return { ok: true, session };
    } catch {
      return { ok: false, error: "会话已损坏，无法恢复" };
    }
  }

  return { ok: false, error: `未找到会话: ${id}` };
}

/**
 * Gets the most recent session.
 *
 * @param options - Lookup options
 * @returns Session lookup result
 *
 * @example
 * ```typescript
 * const result = await getMostRecentSession({ storage, listService });
 * if (result.ok && result.session) {
 *   console.log("Most recent:", result.session.metadata.title);
 * }
 * ```
 */
export async function getMostRecentSession(
  options: SessionLookupOptions
): Promise<SessionLookupResult> {
  const { storage, listService } = options;

  const recent = await listService.getRecentSessions(1);

  if (recent.length === 0) {
    return { ok: false, error: "没有可恢复的会话" };
  }

  const firstRecent = recent[0];
  if (!firstRecent) {
    return { ok: false, error: "没有可恢复的会话" };
  }
  try {
    const session = await storage.load(firstRecent.id);
    return { ok: true, session };
  } catch {
    return { ok: false, error: "会话已损坏，无法恢复" };
  }
}

// =============================================================================
// Resume Session Event Data
// =============================================================================

/**
 * Event data emitted when a session is resumed.
 */
export interface ResumeSessionEventData {
  /** The session being resumed */
  session: Session;
  /** Whether --last flag was used */
  usedLastFlag: boolean;
}

// =============================================================================
// T032: ResumeCommand Definition
// =============================================================================

/**
 * Creates the resume command with injected dependencies.
 *
 * This factory allows the command to be created with specific
 * storage and list service instances, enabling testing and
 * different storage backends.
 *
 * @param storage - Storage manager for session data
 * @param listService - Session list service for queries
 * @returns SlashCommand instance
 *
 * @example
 * ```typescript
 * const storage = await StorageManager.create();
 * const listService = new SessionListService(storage);
 * const resumeCmd = createResumeCommand(storage, listService);
 * registry.register(resumeCmd);
 * ```
 */
export function createResumeCommand(
  storage: StorageManager,
  listService: SessionListService
): SlashCommand {
  return {
    name: "resume",
    description: "Resume a previous session",
    kind: "builtin",
    category: "session",
    aliases: ["r", "restore"],
    positionalArgs: [
      {
        name: "session-id",
        type: "string",
        description: "Session ID or short ID (first 8 characters)",
        required: false,
      },
    ],
    namedArgs: [
      {
        name: "last",
        shorthand: "l",
        type: "boolean",
        description: "Resume most recent session",
        required: false,
        default: false,
      },
      {
        name: "all",
        shorthand: "a",
        type: "boolean",
        description: "Show sessions from all directories",
        required: false,
        default: false,
      },
    ],
    examples: [
      "/resume                - Interactive session selector",
      "/resume abc12345       - Resume session by short ID",
      "/resume --last         - Resume most recent session",
      "/resume -l             - Resume most recent session (short form)",
      "/resume --all          - Interactive selector with all directories",
    ],

    execute: async (ctx: CommandContext): Promise<CommandResult> => {
      const sessionId = ctx.parsedArgs.positional[0] as string | undefined;
      const useLast = ctx.parsedArgs.named.last as boolean | undefined;
      const searchAllDirs = ctx.parsedArgs.named.all as boolean | undefined;

      // Cannot use both session ID and --last
      if (sessionId && useLast) {
        return error("INVALID_ARGUMENT", "不能同时指定会话ID和 --last 标志", [
          "/resume <session-id>",
          "/resume --last",
        ]);
      }

      const lookupOptions: SessionLookupOptions = {
        storage,
        listService,
        searchAllDirs,
      };

      // Interactive selection: when no session ID and no --last flag
      if (!sessionId && !useLast) {
        return pending({
          message: "正在加载会话列表...",
          showProgress: true,
          promise: (async (): Promise<CommandResult> => {
            const session = await selectSession({
              storage,
              listService,
              showAllDirs: searchAllDirs,
            });

            if (!session) {
              return error("COMMAND_ABORTED", "已取消选择");
            }

            // Emit resume event
            const eventData: ResumeSessionEventData = {
              session,
              usedLastFlag: false,
            };
            ctx.emit("session:resume", eventData);

            return success(`正在恢复会话: ${session.metadata.title}`, {
              session,
              sessionId: session.metadata.id,
              title: session.metadata.title,
            });
          })(),
        });
      }

      // Use pending result for async operation
      return pending({
        message: useLast ? "正在查找最近的会话..." : `正在查找会话: ${sessionId}...`,
        showProgress: true,
        promise: (async (): Promise<CommandResult> => {
          let result: SessionLookupResult;

          if (useLast) {
            result = await getMostRecentSession(lookupOptions);
          } else if (sessionId) {
            result = await findSessionById(sessionId, lookupOptions);
          } else {
            // This should never happen due to validation above
            return error("INTERNAL_ERROR", "无效的命令状态");
          }

          if (!result.ok || !result.session) {
            return error("RESOURCE_NOT_FOUND", result.error ?? "未找到会话");
          }

          const session = result.session;

          // Emit resume event
          const eventData: ResumeSessionEventData = {
            session,
            usedLastFlag: !!useLast,
          };
          ctx.emit("session:resume", eventData);

          // Display appropriate message
          const message = useLast
            ? `正在恢复最近的会话: ${session.metadata.title}`
            : `正在恢复会话: ${session.metadata.title}`;

          return success(message, {
            session,
            sessionId: session.metadata.id,
            title: session.metadata.title,
          });
        })(),
      });
    },
  };
}

/**
 * Default resume command (requires initialization with storage).
 *
 * This is a placeholder that throws if executed without proper initialization.
 * Use `createResumeCommand` factory for production use.
 *
 * @example
 * ```typescript
 * // For testing only - use createResumeCommand in production
 * registry.register(resumeCommand);
 * ```
 */
export const resumeCommand: SlashCommand = {
  name: "resume",
  description: "Resume a previous session",
  kind: "builtin",
  category: "session",
  aliases: ["r", "restore"],
  positionalArgs: [
    {
      name: "session-id",
      type: "string",
      description: "Session ID or short ID (first 8 characters)",
      required: false,
    },
  ],
  namedArgs: [
    {
      name: "last",
      shorthand: "l",
      type: "boolean",
      description: "Resume most recent session",
      required: false,
      default: false,
    },
    {
      name: "all",
      shorthand: "a",
      type: "boolean",
      description: "Show sessions from all directories",
      required: false,
      default: false,
    },
  ],
  examples: [
    "/resume                - Interactive session selector",
    "/resume abc12345       - Resume session by short ID",
    "/resume --last         - Resume most recent session",
    "/resume -l             - Resume most recent session (short form)",
    "/resume --all          - Interactive selector with all directories",
  ],

  execute: async (_ctx: CommandContext): Promise<CommandResult> => {
    return error(
      "INTERNAL_ERROR",
      "Resume command not initialized. Use createResumeCommand with storage dependencies."
    );
  },
};
