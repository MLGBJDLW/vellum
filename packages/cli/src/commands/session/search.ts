/**
 * Search Command
 *
 * Full-text search across historical sessions using MiniSearch.
 * Supports interactive session selection from search results.
 *
 * @module cli/commands/session/search
 */

import { select } from "@inquirer/prompts";
import type { SearchService, Session, SessionSearchHit, StorageManager } from "@vellum/core";

import type { CommandContext, CommandResult, SlashCommand } from "../types.js";
import { error, pending, success } from "../types.js";

// =============================================================================
// Constants
// =============================================================================

/**
 * Maximum number of search results to display.
 */
const MAX_DISPLAY_RESULTS = 20;

/**
 * Number of results per page in interactive selector.
 */
const RESULTS_PER_PAGE = 10;

// =============================================================================
// Search Result Formatting
// =============================================================================

/**
 * Format a search result for display.
 *
 * @param hit - Search result hit
 * @param index - Display index (1-based)
 * @returns Formatted string
 */
function formatSearchResult(hit: SessionSearchHit, index: number): string {
  const scorePercent = Math.round(hit.score * 10) / 10;
  const matchTerms = hit.matches.slice(0, 3).join(", ");
  const snippet = hit.snippet ? ` - "${hit.snippet}"` : "";

  return `${index}. ${hit.title} (score: ${scorePercent})${snippet}${matchTerms ? ` [${matchTerms}]` : ""}`;
}

/**
 * Format search results for text display.
 *
 * @param hits - Array of search hits
 * @param query - Original search query
 * @returns Formatted results string
 */
function formatSearchResults(hits: SessionSearchHit[], query: string): string {
  const lines: string[] = [];

  lines.push(`🔍 搜索结果: "${query}"`);
  lines.push("━".repeat(50));

  if (hits.length === 0) {
    lines.push("");
    lines.push("  未找到匹配的会话");
    lines.push("");
    lines.push("提示:");
    lines.push("  • 尝试使用不同的关键词");
    lines.push("  • 使用更少或更通用的搜索词");
    lines.push("  • 使用 /search --rebuild 重建索引");
  } else {
    lines.push("");
    for (let i = 0; i < hits.length; i++) {
      const hit = hits[i];
      if (!hit) continue;
      lines.push(`  ${formatSearchResult(hit, i + 1)}`);
    }
    lines.push("");
    lines.push(`找到 ${hits.length} 个匹配会话`);
  }

  lines.push("━".repeat(50));

  return lines.join("\n");
}

// =============================================================================
// Interactive Session Selection
// =============================================================================

/**
 * Options for interactive search result selection.
 */
interface SearchSelectOptions {
  /** Search hits to select from */
  hits: SessionSearchHit[];
  /** Storage manager for loading sessions */
  storage: StorageManager;
  /** Original search query (for display) */
  query: string;
}

/**
 * Interactively select a session from search results.
 *
 * @param options - Selection options
 * @returns Selected session or null if cancelled
 */
async function selectFromSearchResults(options: SearchSelectOptions): Promise<Session | null> {
  const { hits, storage, query } = options;

  if (hits.length === 0) {
    return null;
  }

  // Build choices for inquirer
  interface SearchChoice {
    name: string;
    value: string;
    description?: string;
  }

  const choices: SearchChoice[] = hits.map((hit, idx) => ({
    name: formatSearchResult(hit, idx + 1),
    value: hit.sessionId,
    description: hit.snippet,
  }));

  try {
    const selectedId = await select({
      message: `选择要恢复的会话 (搜索: "${query}"):`,
      choices,
      pageSize: RESULTS_PER_PAGE,
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
// Search Event Data
// =============================================================================

/**
 * Event data emitted when a session is selected from search.
 */
export interface SearchSessionEventData {
  /** The session being resumed */
  session: Session;
  /** The search query that found this session */
  query: string;
}

// =============================================================================
// Helper Types and Functions
// =============================================================================

/**
 * Maps search hits to a serializable data format.
 */
function mapHitsToData(hits: SessionSearchHit[]) {
  return hits.map((h) => ({
    sessionId: h.sessionId,
    title: h.title,
    score: h.score,
    matches: h.matches,
  }));
}

/**
 * Performs the actual search operation.
 */
async function executeSearch(
  searchService: SearchService,
  query: string,
  limit: number
): Promise<SessionSearchHit[]> {
  if (!searchService.isInitialized()) {
    await searchService.initialize();
  }
  return searchService.search(query, { limit });
}

/**
 * Handles interactive session selection from search results.
 */
async function handleInteractiveSelection(
  hits: SessionSearchHit[],
  storage: StorageManager,
  query: string,
  ctx: CommandContext
): Promise<CommandResult> {
  const session = await selectFromSearchResults({ hits, storage, query });

  if (!session) {
    return error("COMMAND_ABORTED", "已取消选择");
  }

  const eventData: SearchSessionEventData = { session, query };
  ctx.emit("session:search", eventData);

  return success(`正在恢复会话: ${session.metadata.title}`, {
    session,
    sessionId: session.metadata.id,
    title: session.metadata.title,
    query,
  });
}

/**
 * Formats search results as a success response.
 */
function createSearchResultResponse(hits: SessionSearchHit[], query: string): CommandResult {
  const resultText = formatSearchResults(hits, query);
  return success(resultText, {
    query,
    hits: mapHitsToData(hits),
    count: hits.length,
  });
}

// =============================================================================
// Search Command Factory
// =============================================================================

/**
 * Creates the search command with injected dependencies.
 *
 * This factory allows the command to be created with specific
 * storage and search service instances, enabling testing and
 * different storage backends.
 *
 * @param storage - Storage manager for session data
 * @param searchService - Search service for full-text search
 * @returns SlashCommand instance
 *
 * @example
 * ```typescript
 * const storage = await StorageManager.create();
 * const searchService = new SearchService(storage);
 * await searchService.initialize();
 * const searchCmd = createSearchCommand(storage, searchService);
 * registry.register(searchCmd);
 * ```
 */
export function createSearchCommand(
  storage: StorageManager,
  searchService: SearchService
): SlashCommand {
  return {
    name: "search",
    description: "Search historical sessions by keywords",
    kind: "builtin",
    category: "session",
    aliases: ["find", "s"],
    positionalArgs: [
      {
        name: "query",
        type: "string",
        description: "Search keywords (multiple words allowed)",
        required: false,
      },
    ],
    namedArgs: [
      {
        name: "limit",
        shorthand: "n",
        type: "number",
        description: "Maximum number of results (default: 10)",
        required: false,
        default: 10,
      },
      {
        name: "select",
        shorthand: "s",
        type: "boolean",
        description: "Interactive selection mode (default when no query)",
        required: false,
        default: false,
      },
      {
        name: "rebuild",
        shorthand: "r",
        type: "boolean",
        description: "Rebuild search index before searching",
        required: false,
        default: false,
      },
    ],
    examples: [
      "/search typescript          - Search for 'typescript'",
      "/search refactor api        - Search for 'refactor' and 'api'",
      "/search bug fix -n 20       - Search with max 20 results",
      "/search --rebuild           - Rebuild search index",
      "/search auth -s             - Search and select interactively",
    ],

    execute: async (ctx: CommandContext): Promise<CommandResult> => {
      const query = ctx.parsedArgs.positional[0] as string | undefined;
      const limit = Math.min(
        (ctx.parsedArgs.named.limit as number | undefined) ?? 10,
        MAX_DISPLAY_RESULTS
      );
      const interactiveSelect = (ctx.parsedArgs.named.select as boolean | undefined) ?? false;
      const rebuildIndex = (ctx.parsedArgs.named.rebuild as boolean | undefined) ?? false;

      // Handle rebuild request
      if (rebuildIndex) {
        return pending({
          message: "正在重建搜索索引...",
          showProgress: true,
          promise: (async (): Promise<CommandResult> => {
            try {
              await searchService.rebuildIndex();
              return success("✅ 搜索索引重建完成");
            } catch (err) {
              return error(
                "INTERNAL_ERROR",
                `重建索引失败: ${err instanceof Error ? err.message : String(err)}`
              );
            }
          })(),
        });
      }

      // No query provided - show usage or enter interactive mode
      if (!query || query.trim().length === 0) {
        return error("MISSING_ARGUMENT", "请提供搜索关键词", [
          "/search <关键词>      - 搜索会话",
          "/search --rebuild     - 重建索引",
          "/help search          - 查看完整帮助",
        ]);
      }

      const trimmedQuery = query.trim();

      // Perform search
      return pending({
        message: `正在搜索: "${trimmedQuery}"...`,
        showProgress: true,
        promise: (async (): Promise<CommandResult> => {
          try {
            const hits = await executeSearch(searchService, trimmedQuery, limit);

            // Interactive selection when requested and results available
            if (interactiveSelect && hits.length > 0) {
              return handleInteractiveSelection(hits, storage, trimmedQuery, ctx);
            }

            // Default: show results as text
            return createSearchResultResponse(hits, trimmedQuery);
          } catch (err) {
            return error(
              "INTERNAL_ERROR",
              `搜索失败: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        })(),
      });
    },
  };
}

/**
 * Default search command (requires initialization with storage).
 *
 * This is a placeholder that throws if executed without proper initialization.
 * Use `createSearchCommand` factory for production use.
 *
 * @example
 * ```typescript
 * // For testing only - use createSearchCommand in production
 * registry.register(searchCommand);
 * ```
 */
export const searchCommand: SlashCommand = {
  name: "search",
  description: "Search historical sessions by keywords",
  kind: "builtin",
  category: "session",
  aliases: ["find", "s"],
  positionalArgs: [
    {
      name: "query",
      type: "string",
      description: "Search keywords (multiple words allowed)",
      required: false,
    },
  ],
  namedArgs: [
    {
      name: "limit",
      shorthand: "n",
      type: "number",
      description: "Maximum number of results (default: 10)",
      required: false,
      default: 10,
    },
    {
      name: "select",
      shorthand: "s",
      type: "boolean",
      description: "Interactive selection mode",
      required: false,
      default: false,
    },
    {
      name: "rebuild",
      shorthand: "r",
      type: "boolean",
      description: "Rebuild search index before searching",
      required: false,
      default: false,
    },
  ],
  examples: [
    "/search typescript          - Search for 'typescript'",
    "/search refactor api        - Search for 'refactor' and 'api'",
    "/search bug fix -n 20       - Search with max 20 results",
    "/search --rebuild           - Rebuild search index",
    "/search auth -s             - Search and select interactively",
  ],

  execute: async (_ctx: CommandContext): Promise<CommandResult> => {
    return error(
      "INTERNAL_ERROR",
      "Search command not initialized. Use createSearchCommand with storage dependencies."
    );
  },
};
