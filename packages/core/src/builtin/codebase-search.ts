/**
 * Codebase Search Tool
 *
 * Semantic search with ripgrep fallback.
 * Tokenizes natural language queries for effective code search.
 *
 * @module builtin/codebase-search
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";

import { defineTool, fail, ok } from "../types/index.js";
import { validatePath } from "./utils/index.js";

/** Default maximum search results */
const DEFAULT_MAX_RESULTS = 20;

/** Context lines to show around matches */
const CONTEXT_LINES = 3;

/**
 * Schema for codebase_search tool parameters
 */
export const codebaseSearchParamsSchema = z.object({
  /** Natural language query */
  query: z.string().describe("Natural language query to search for"),
  /** Directory scope (default: current working directory) */
  path: z.string().optional().describe("Directory scope for search (defaults to cwd)"),
  /** Maximum results to return (default: 20) */
  maxResults: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(DEFAULT_MAX_RESULTS)
    .describe("Maximum number of results (1-100, default: 20)"),
});

/** Inferred type for codebase_search parameters */
export type CodebaseSearchParams = z.infer<typeof codebaseSearchParamsSchema>;

/** A single search result with relevance scoring */
export interface CodebaseSearchResult {
  /** File path (relative to search root) */
  file: string;
  /** Line number (1-indexed) */
  line: number;
  /** The matched text/context */
  content: string;
  /** Relevance score (0-1) */
  score: number;
  /** Which query tokens were found */
  matchedTokens: string[];
}

/** Output type for codebase_search tool */
export interface CodebaseSearchOutput {
  /** Original query */
  query: string;
  /** Tokens extracted from query */
  tokens: string[];
  /** Search results ranked by relevance */
  results: CodebaseSearchResult[];
  /** Total files searched */
  filesSearched: number;
  /** Whether semantic search was used */
  usedSemanticSearch: boolean;
}

/** Common directories to skip */
const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".hg",
  ".svn",
  "dist",
  "build",
  "coverage",
  ".next",
  ".nuxt",
  "__pycache__",
  ".venv",
  "venv",
  ".tox",
  "target",
  "vendor",
]);

/** Binary file extensions to skip */
const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".bmp",
  ".ico",
  ".webp",
  ".svg",
  ".pdf",
  ".zip",
  ".tar",
  ".gz",
  ".rar",
  ".7z",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".mp3",
  ".mp4",
  ".wav",
  ".avi",
  ".mov",
  ".webm",
]);

/** Stop words to filter from queries */
const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "must",
  "can",
  "to",
  "of",
  "in",
  "for",
  "on",
  "with",
  "at",
  "by",
  "from",
  "as",
  "into",
  "through",
  "during",
  "before",
  "after",
  "above",
  "below",
  "between",
  "under",
  "again",
  "further",
  "then",
  "once",
  "here",
  "there",
  "when",
  "where",
  "why",
  "how",
  "all",
  "each",
  "few",
  "more",
  "most",
  "other",
  "some",
  "such",
  "no",
  "nor",
  "not",
  "only",
  "own",
  "same",
  "so",
  "than",
  "too",
  "very",
  "just",
  "and",
  "but",
  "if",
  "or",
  "because",
  "as",
  "until",
  "while",
  "this",
  "that",
  "these",
  "those",
  "what",
  "which",
  "who",
  "whom",
  "i",
  "me",
  "my",
  "myself",
  "we",
  "our",
  "ours",
  "ourselves",
  "you",
  "your",
  "yours",
  "yourself",
  "yourselves",
  "he",
  "him",
  "his",
  "himself",
  "she",
  "her",
  "hers",
  "herself",
  "it",
  "its",
  "itself",
  "they",
  "them",
  "their",
  "theirs",
  "themselves",
  "find",
  "search",
  "look",
  "get",
  "show",
  "code",
  "file",
  "files",
  "function",
  "functions",
  "class",
  "classes",
  "method",
  "methods",
]);

/**
 * Tokenize a natural language query into searchable terms
 *
 * - Splits on whitespace and punctuation
 * - Removes stop words
 * - Handles camelCase and snake_case
 * - Keeps quoted phrases intact
 */
function tokenizeQuery(query: string): string[] {
  const tokens: string[] = [];

  // Extract quoted phrases first
  const quotedPhrases: string[] = [];
  const withoutQuotes = query.replace(/"([^"]+)"/g, (_, phrase) => {
    quotedPhrases.push(phrase.toLowerCase());
    return "";
  });

  // Add quoted phrases as single tokens
  tokens.push(...quotedPhrases);

  // Split remaining text
  const words = withoutQuotes
    .toLowerCase()
    .split(/[\s\-_./\\,;:!?()[\]{}]+/)
    .filter((w) => w.length > 0);

  for (const word of words) {
    // Skip stop words
    if (STOP_WORDS.has(word)) {
      continue;
    }

    // Skip very short words
    if (word.length < 2) {
      continue;
    }

    tokens.push(word);

    // Also split camelCase words
    const camelParts = word.replace(/([a-z])([A-Z])/g, "$1 $2").split(" ");
    if (camelParts.length > 1) {
      for (const part of camelParts) {
        const lowerPart = part.toLowerCase();
        if (lowerPart.length >= 2 && !STOP_WORDS.has(lowerPart)) {
          tokens.push(lowerPart);
        }
      }
    }
  }

  // Remove duplicates while preserving order
  return [...new Set(tokens)];
}

/**
 * Check if a path should be ignored
 */
function shouldIgnore(name: string): boolean {
  return IGNORED_DIRS.has(name) || name.startsWith(".");
}

/**
 * Check if a file is likely binary based on extension
 */
function isBinaryFile(filename: string): boolean {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot === -1) return false;
  const ext = filename.slice(lastDot).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

/**
 * Calculate relevance score based on token matches
 */
function calculateScore(content: string, tokens: string[], matchedTokens: Set<string>): number {
  if (tokens.length === 0) return 0;

  const contentLower = content.toLowerCase();
  let score = 0;

  for (const token of tokens) {
    if (contentLower.includes(token)) {
      matchedTokens.add(token);
      // Base score for match
      score += 1;

      // Bonus for word boundary matches
      const wordBoundaryRegex = new RegExp(`\\b${token}\\b`, "i");
      if (wordBoundaryRegex.test(content)) {
        score += 0.5;
      }

      // Bonus for multiple occurrences (diminishing returns)
      const matches = contentLower.split(token).length - 1;
      score += Math.log(matches + 1) * 0.2;
    }
  }

  // Normalize by number of tokens
  return score / tokens.length;
}

/**
 * Search a single file for matching tokens
 */
async function searchFile(
  filePath: string,
  relativePath: string,
  tokens: string[],
  results: CodebaseSearchResult[],
  maxResults: number
): Promise<void> {
  if (results.length >= maxResults) {
    return;
  }

  try {
    const content = await readFile(filePath, "utf-8");
    const lines = content.split("\n");

    // First pass: find lines with any token matches
    const lineScores: Array<{ index: number; score: number; matched: Set<string> }> = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line === undefined) continue;
      const matched = new Set<string>();
      const score = calculateScore(line, tokens, matched);

      if (score > 0) {
        lineScores.push({ index: i, score, matched });
      }
    }

    // Sort by score and take top results for this file
    lineScores.sort((a, b) => b.score - a.score);

    // Add best matches from this file
    for (const { index, score, matched } of lineScores.slice(0, 5)) {
      if (results.length >= maxResults) break;

      // Get context
      const start = Math.max(0, index - CONTEXT_LINES);
      const end = Math.min(lines.length, index + CONTEXT_LINES + 1);
      const context = lines.slice(start, end).join("\n");

      results.push({
        file: relativePath,
        line: index + 1,
        content: context,
        score,
        matchedTokens: [...matched],
      });
    }
  } catch {
    // Skip files we can't read
  }
}

/**
 * Recursively search directory
 */
async function searchDirectory(
  basePath: string,
  currentPath: string,
  tokens: string[],
  results: CodebaseSearchResult[],
  maxResults: number,
  abortSignal: AbortSignal,
  filesSearched: { count: number }
): Promise<void> {
  if (abortSignal.aborted || results.length >= maxResults) {
    return;
  }

  const fullPath = resolve(basePath, currentPath);
  let entries: string[];

  try {
    entries = await readdir(fullPath);
  } catch {
    return;
  }

  for (const name of entries) {
    if (abortSignal.aborted || results.length >= maxResults) {
      return;
    }

    if (shouldIgnore(name)) {
      continue;
    }

    const entryPath = join(fullPath, name);
    const relativePath = currentPath ? join(currentPath, name) : name;

    try {
      const stats = await stat(entryPath);

      if (stats.isDirectory()) {
        await searchDirectory(
          basePath,
          relativePath,
          tokens,
          results,
          maxResults,
          abortSignal,
          filesSearched
        );
      } else if (stats.isFile() && !isBinaryFile(name)) {
        filesSearched.count++;
        await searchFile(entryPath, relativePath, tokens, results, maxResults);
      }
    } catch {
      // Skip entries we can't access
    }
  }
}

/**
 * Codebase search tool implementation
 *
 * Performs semantic-style search using smart query tokenization.
 * Falls back to pattern matching when semantic embeddings are not available.
 *
 * @example
 * ```typescript
 * // Natural language search
 * const result = await codebaseSearchTool.execute(
 *   { query: "user authentication function" },
 *   ctx
 * );
 *
 * // Scoped search
 * const result = await codebaseSearchTool.execute(
 *   { query: "error handling", path: "src/utils" },
 *   ctx
 * );
 * ```
 */
export const codebaseSearchTool = defineTool({
  name: "codebase_search",
  description:
    "Search the codebase using natural language. Tokenizes query into relevant terms and ranks results by relevance.",
  parameters: codebaseSearchParamsSchema,
  kind: "read",
  category: "search",

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

      // Tokenize the query
      const tokens = tokenizeQuery(input.query);

      if (tokens.length === 0) {
        return fail("Query did not produce any searchable tokens. Try being more specific.");
      }

      const results: CodebaseSearchResult[] = [];
      const filesSearched = { count: 0 };

      // TODO: Try semantic search first if embeddings available
      // For now, fall back to token-based search
      const usedSemanticSearch = false;

      await searchDirectory(
        resolvedPath,
        "",
        tokens,
        results,
        input.maxResults * 2, // Get more initially for better ranking
        ctx.abortSignal,
        filesSearched
      );

      // Sort all results by score
      results.sort((a, b) => b.score - a.score);

      // Take top results
      const topResults = results.slice(0, input.maxResults);

      return ok({
        query: input.query,
        tokens,
        results: topResults,
        filesSearched: filesSearched.count,
        usedSemanticSearch,
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
        return fail(`Failed to search codebase: ${error.message}`);
      }
      return fail("Unknown error occurred while searching codebase");
    }
  },

  shouldConfirm(_input, _ctx) {
    // Read operations don't need confirmation
    return false;
  },
});
