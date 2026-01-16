/**
 * Search Files Tool
 *
 * Pattern search across files with regex support and .gitignore awareness.
 * Uses the high-performance search facade with pluggable backends (ripgrep, git-grep, JS fallback).
 *
 * @module builtin/search-files
 */

import { stat } from "node:fs/promises";
import { z } from "zod";

import { defineTool, fail, ok } from "../types/index.js";
import { type BackendType, getSearchFacade, type SearchResult } from "./search/index.js";
import { validatePath } from "./utils/index.js";

/** Default maximum search results */
const DEFAULT_MAX_RESULTS = 100;

/** Context lines to show around matches */
const CONTEXT_LINES = 2;

/**
 * Valid backend types for search operations.
 */
const BackendTypeSchema = z.enum(["ripgrep", "git-grep", "javascript", "auto"]);

/**
 * Schema for search_files tool parameters
 */
export const searchFilesParamsSchema = z.object({
  /** Search pattern */
  pattern: z.string().describe("The search pattern"),
  /** Directory to search (default: current working directory) */
  path: z.string().optional().describe("Directory to search (defaults to cwd)"),
  /** Treat pattern as regex (default: false) */
  isRegex: z.boolean().optional().default(false).describe("Treat pattern as a regular expression"),
  /** Case sensitive search (default: false) */
  caseSensitive: z.boolean().optional().default(false).describe("Case sensitive search"),
  /** Maximum results to return (default: 100) */
  maxResults: z
    .number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .default(DEFAULT_MAX_RESULTS)
    .describe("Maximum number of results (1-500, default: 100)"),
  /** Force specific search backend (default: auto-select best available) */
  backend: BackendTypeSchema.optional().describe(
    "Search backend to use: 'ripgrep' (fastest), 'git-grep', 'javascript' (fallback), or 'auto' (default)"
  ),
  /** Number of context lines before/after each match (default: 2) */
  contextLines: z
    .number()
    .int()
    .min(0)
    .max(10)
    .optional()
    .default(CONTEXT_LINES)
    .describe("Context lines before/after match (0-10, default: 2)"),
});

/** Inferred type for search_files parameters */
export type SearchFilesParams = z.infer<typeof searchFilesParamsSchema>;

/** A single search match */
export interface SearchMatch {
  /** File path (relative to search root) */
  file: string;
  /** Line number (1-indexed) */
  line: number;
  /** Column number (1-indexed) */
  column: number;
  /** The matched text */
  match: string;
  /** Context: lines around the match */
  context: string;
}

/** Output type for search_files tool */
export interface SearchFilesOutput {
  /** Search pattern used */
  pattern: string;
  /** Directory searched */
  searchPath: string;
  /** Array of matches */
  matches: SearchMatch[];
  /** Total files searched */
  filesSearched: number;
  /** Whether results were truncated */
  truncated: boolean;
  /** Search backend used (if using facade) */
  backend?: string;
  /** Search duration in ms (if available) */
  durationMs?: number;
}

/**
 * Search files tool implementation
 *
 * Searches for patterns across files in a directory.
 * Supports regex and literal string search.
 * Uses high-performance backends (ripgrep, git-grep) when available.
 * Respects .gitignore patterns and skips common directories (node_modules, .git, etc.).
 *
 * @example
 * ```typescript
 * // Simple text search
 * const result = await searchFilesTool.execute(
 *   { pattern: "TODO" },
 *   ctx
 * );
 *
 * // Regex search in specific directory
 * const result = await searchFilesTool.execute(
 *   { pattern: "function\\s+\\w+\\(", path: "src", isRegex: true },
 *   ctx
 * );
 *
 * // Force ripgrep backend
 * const result = await searchFilesTool.execute(
 *   { pattern: "TODO", backend: "ripgrep" },
 *   ctx
 * );
 * ```
 */
export const searchFilesTool = defineTool({
  name: "search_files",
  description:
    "Search for a pattern across files in a directory. Supports regex, case sensitivity options, and respects .gitignore patterns. Uses fastest available backend (ripgrep > git-grep > javascript).",
  parameters: searchFilesParamsSchema,
  kind: "read",
  category: "search",

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Search with multiple backends and result aggregation
  async execute(input, ctx) {
    // Check for cancellation
    if (ctx.abortSignal.aborted) {
      return fail("Operation was cancelled");
    }

    // Determine search path
    const searchPath = input.path ?? ".";

    // Validate path security
    const pathResult = validatePath(searchPath, ctx.workingDir);
    if (!pathResult.valid) {
      return fail(pathResult.error ?? "Path traversal not allowed");
    }

    const resolvedPath = pathResult.sanitizedPath;

    try {
      // Verify it's a directory
      const stats = await stat(resolvedPath);
      if (!stats.isDirectory()) {
        return fail(`Path is not a directory: ${searchPath}`);
      }

      // Use the high-performance search facade
      const facade = getSearchFacade();
      const backendChoice = input.backend;

      // Build search options for the facade
      const searchOptions = {
        query: input.pattern,
        mode: input.isRegex ? ("regex" as const) : ("literal" as const),
        paths: [resolvedPath],
        contextLines: input.contextLines ?? CONTEXT_LINES,
        maxResults: input.maxResults,
        caseSensitive: input.caseSensitive,
      };

      let result: SearchResult | undefined;
      if (backendChoice && backendChoice !== "auto") {
        // Force specific backend
        try {
          result = await facade.searchWithBackend(backendChoice as BackendType, searchOptions);
        } catch (error) {
          if (error instanceof Error && error.message.includes("not available")) {
            // Fallback to auto-select if requested backend unavailable
            result = await facade.search(searchOptions);
          } else {
            throw error;
          }
        }
      } else {
        // Auto-select best backend with fallback chain
        try {
          result = await facade.search(searchOptions);
        } catch (searchError) {
          // If primary backend fails (e.g., git-grep outside repo), try javascript fallback
          if (
            searchError instanceof Error &&
            (searchError.message.includes("outside repository") ||
              searchError.message.includes("exit code"))
          ) {
            result = await facade.searchWithBackend("javascript", searchOptions);
          } else {
            throw searchError;
          }
        }
      }

      // Convert facade matches to tool output format
      const matches: SearchMatch[] = result.matches.map((m) => ({
        file: m.file,
        line: m.line,
        column: m.column,
        match: m.content,
        context: m.context
          ? [...m.context.before, m.content, ...m.context.after].join("\n")
          : m.content,
      }));

      return ok({
        pattern: input.pattern,
        searchPath: resolvedPath,
        matches,
        filesSearched: result.stats.filesSearched,
        truncated: result.truncated,
        backend: result.stats.backend,
        durationMs: result.stats.duration,
      });
    } catch (error) {
      if (error instanceof Error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code === "ENOENT") {
          return fail(`Directory not found: ${searchPath}`);
        }
        if (nodeError.code === "EACCES") {
          return fail(`Access denied: ${searchPath}`);
        }
        // Handle regex syntax errors from backends
        if (
          error.message.includes("regex") ||
          error.message.includes("pattern") ||
          error.message.includes("Invalid") ||
          error.message.includes("invalid")
        ) {
          return fail(`Invalid regex pattern: ${error.message}`);
        }
        return fail(`Failed to search files: ${error.message}`);
      }
      return fail("Unknown error occurred while searching files");
    }
  },

  shouldConfirm(_input, _ctx) {
    // Read operations don't need confirmation
    return false;
  },
});
