/**
 * Memory Search Command
 *
 * Search project memories by query with full-text search support.
 *
 * @module cli/commands/memory/search
 */

import type { MemoryEntry, MemoryEntryType } from "@vellum/core";
import chalk from "chalk";

import type { CommandContext, CommandResult, SlashCommand } from "../types.js";
import { error, success } from "../types.js";
import { withMemoryService } from "./utils.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Options for the memory search command.
 */
export interface MemorySearchOptions {
  /** Search query string */
  query: string;
  /** Filter by type */
  type?: MemoryEntryType;
  /** Case-sensitive search */
  caseSensitive?: boolean;
  /** Maximum results to return */
  limit?: number;
  /** Output as JSON */
  json?: boolean;
}

/**
 * Search result with relevance score.
 */
interface SearchResult {
  entry: MemoryEntry;
  score: number;
  matches: {
    inKey: boolean;
    inContent: boolean;
    inTags: boolean;
  };
}

/**
 * JSON output for memory search.
 */
interface MemorySearchJson {
  success: boolean;
  query: string;
  results: Array<{
    key: string;
    type: MemoryEntryType;
    content: string;
    score: number;
    matches: {
      inKey: boolean;
      inContent: boolean;
      inTags: boolean;
    };
  }>;
  total: number;
}

// =============================================================================
// Search Functions
// =============================================================================

/**
 * Calculate relevance score for an entry.
 */
function calculateScore(
  entry: MemoryEntry,
  query: string,
  caseSensitive: boolean
): SearchResult | null {
  const q = caseSensitive ? query : query.toLowerCase();
  const key = caseSensitive ? entry.key : entry.key.toLowerCase();
  const content = caseSensitive ? entry.content : entry.content.toLowerCase();
  const tags = entry.metadata.tags.map((t) => (caseSensitive ? t : t.toLowerCase()));

  const inKey = key.includes(q);
  const inContent = content.includes(q);
  const inTags = tags.some((t) => t.includes(q));

  if (!inKey && !inContent && !inTags) {
    return null;
  }

  // Score weighting: key matches > tag matches > content matches
  let score = 0;
  if (inKey) score += 10;
  if (inTags) score += 5;
  if (inContent) score += 1;

  // Boost for exact key match
  if (key === q) score += 20;

  // Boost by importance
  score *= 1 + entry.metadata.importance;

  // Boost recent entries slightly
  const ageInDays = (Date.now() - entry.updatedAt.getTime()) / (1000 * 60 * 60 * 24);
  if (ageInDays < 7) score *= 1.1;

  return {
    entry,
    score,
    matches: { inKey, inContent, inTags },
  };
}

/**
 * Search entries and return ranked results.
 */
function searchEntries(entries: MemoryEntry[], options: MemorySearchOptions): SearchResult[] {
  const results: SearchResult[] = [];

  for (const entry of entries) {
    // Filter by type if specified
    if (options.type && entry.type !== options.type) {
      continue;
    }

    const result = calculateScore(entry, options.query, options.caseSensitive ?? false);
    if (result) {
      results.push(result);
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  // Apply limit
  if (options.limit && options.limit > 0) {
    return results.slice(0, options.limit);
  }

  return results;
}

/**
 * Highlight query matches in text.
 */
function highlightMatch(text: string, query: string): string {
  const regex = new RegExp(`(${escapeRegex(query)})`, "gi");
  return text.replace(regex, chalk.bold.yellow("$1"));
}

/**
 * Escape special regex characters.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Format date for display.
 */
function formatDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${month}/${day} ${hours}:${minutes}`;
}

/**
 * Get type badge color.
 */
function getTypeBadge(type: MemoryEntryType): string {
  const colors: Record<MemoryEntryType, (s: string) => string> = {
    context: chalk.cyan,
    preference: chalk.magenta,
    decision: chalk.yellow,
    summary: chalk.green,
  };
  return colors[type](`[${type}]`);
}

/**
 * Format search results for console output.
 */
function formatSearchOutput(results: SearchResult[], query: string): string {
  if (results.length === 0) {
    return chalk.dim(`No memories found matching "${query}".`);
  }

  const lines: string[] = [
    chalk.bold.blue(`🔍 Search Results for "${query}"`),
    chalk.dim(`Found ${results.length} matching ${results.length === 1 ? "entry" : "entries"}`),
    "",
  ];

  for (const { entry, score, matches } of results) {
    const badge = getTypeBadge(entry.type);
    const date = chalk.dim(formatDate(entry.updatedAt));
    const key = matches.inKey ? highlightMatch(entry.key, query) : chalk.bold(entry.key);
    const scoreStr = chalk.dim(`(score: ${score.toFixed(1)})`);

    lines.push(`${badge} ${key} ${date} ${scoreStr}`);

    // Show content preview with highlighting
    let preview = entry.content.slice(0, 80).replace(/\n/g, " ");
    if (matches.inContent) {
      preview = highlightMatch(preview, query);
    }
    const truncated = entry.content.length > 80 ? "…" : "";
    lines.push(chalk.dim(`   ${preview}${truncated}`));

    // Show matching tags
    if (matches.inTags && entry.metadata.tags.length > 0) {
      const tags = entry.metadata.tags
        .map((t) =>
          t.toLowerCase().includes(query.toLowerCase())
            ? chalk.bold.yellow(`#${t}`)
            : chalk.cyan(`#${t}`)
        )
        .join(" ");
      lines.push(chalk.dim(`   Tags: ${tags}`));
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Format search results as JSON.
 */
function formatSearchJson(results: SearchResult[], query: string): MemorySearchJson {
  return {
    success: true,
    query,
    results: results.map(({ entry, score, matches }) => ({
      key: entry.key,
      type: entry.type,
      content: entry.content,
      score,
      matches,
    })),
    total: results.length,
  };
}

// =============================================================================
// Command Execution
// =============================================================================

/**
 * Execute the memory search command.
 */
export async function executeMemorySearch(
  projectPath: string,
  options: MemorySearchOptions
): Promise<CommandResult> {
  if (!options.query || options.query.trim().length === 0) {
    return error("MISSING_ARGUMENT", "Search query is required. Usage: /memory search <query>");
  }

  try {
    return await withMemoryService(projectPath, async (service) => {
      const allEntries = await service.listEntries();
      const results = searchEntries(allEntries, options);

      if (options.json) {
        const json = formatSearchJson(results, options.query);
        return success(JSON.stringify(json, null, 2));
      }

      const output = formatSearchOutput(results, options.query);
      return success(output);
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error("INTERNAL_ERROR", `Failed to search memories: ${message}`);
  }
}

// =============================================================================
// Slash Command Definition
// =============================================================================

/**
 * Parse search command arguments.
 */
function parseSearchArgs(args: string[]): MemorySearchOptions {
  const options: MemorySearchOptions = { query: "" };
  const queryParts: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;
    const nextArg = args[i + 1] ?? "";

    if (arg === "--type" && nextArg) {
      if (["context", "preference", "decision", "summary"].includes(nextArg)) {
        options.type = nextArg as MemoryEntryType;
      }
      i++;
    } else if (arg === "--limit" && nextArg) {
      const limit = Number.parseInt(nextArg, 10);
      if (!Number.isNaN(limit) && limit > 0) {
        options.limit = limit;
      }
      i++;
    } else if (arg === "--case-sensitive" || arg === "-c") {
      options.caseSensitive = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (!arg.startsWith("--")) {
      queryParts.push(arg);
    }
  }

  options.query = queryParts.join(" ");
  return options;
}

/**
 * Memory search slash command handler.
 */
async function handleMemorySearch(context: CommandContext): Promise<CommandResult> {
  const args = context.parsedArgs.positional as string[];
  const options = parseSearchArgs(args);
  const projectPath = context.session.cwd;

  return executeMemorySearch(projectPath, options);
}

/**
 * Memory search slash command definition.
 */
export const memorySearchCommand: SlashCommand = {
  name: "memory search",
  description: "Search project memories by query",
  kind: "builtin",
  category: "session",
  aliases: ["memory find"],
  execute: handleMemorySearch,
};
