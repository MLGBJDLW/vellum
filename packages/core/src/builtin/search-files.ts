/**
 * Search Files Tool
 *
 * Pattern search across files with regex support and .gitignore awareness.
 *
 * @module builtin/search-files
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";

import { defineTool, fail, ok } from "../types/index.js";
import { validatePath } from "./utils/index.js";

/** Default maximum search results */
const DEFAULT_MAX_RESULTS = 100;

/** Context lines to show around matches */
const CONTEXT_LINES = 2;

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

/**
 * Parse .gitignore patterns from a directory
 */
async function loadGitignore(dirPath: string): Promise<Set<string>> {
  const patterns = new Set<string>();
  const gitignorePath = join(dirPath, ".gitignore");

  try {
    const content = await readFile(gitignorePath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      // Skip comments and empty lines
      if (trimmed && !trimmed.startsWith("#")) {
        // Simple pattern matching - strip trailing slashes
        patterns.add(trimmed.replace(/\/$/, ""));
      }
    }
  } catch {
    // No .gitignore or can't read it
  }

  return patterns;
}

/**
 * Check if a path matches any gitignore pattern
 */
function isIgnored(name: string, gitignorePatterns: Set<string>): boolean {
  // Check against built-in ignored dirs
  if (IGNORED_DIRS.has(name)) {
    return true;
  }

  // Simple gitignore pattern matching
  for (const pattern of gitignorePatterns) {
    // Handle exact matches
    if (name === pattern) {
      return true;
    }
    // Handle wildcard patterns (*.ext)
    if (pattern.startsWith("*.")) {
      const ext = pattern.slice(1);
      if (name.endsWith(ext)) {
        return true;
      }
    }
  }

  return false;
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
 * Create a regex from pattern and options
 */
function createSearchPattern(pattern: string, isRegex: boolean, caseSensitive: boolean): RegExp {
  let flags = "g"; // Global to find all matches
  if (!caseSensitive) {
    flags += "i";
  }

  if (isRegex) {
    return new RegExp(pattern, flags);
  } else {
    // Escape special regex characters for literal search
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(escaped, flags);
  }
}

/**
 * Extract context lines around a match
 */
function extractContext(lines: string[], lineIndex: number, contextLines: number): string {
  const start = Math.max(0, lineIndex - contextLines);
  const end = Math.min(lines.length, lineIndex + contextLines + 1);
  return lines.slice(start, end).join("\n");
}

/**
 * Search a single file for pattern matches
 */
async function searchFile(
  filePath: string,
  relativePath: string,
  pattern: RegExp,
  matches: SearchMatch[],
  maxResults: number
): Promise<void> {
  if (matches.length >= maxResults) {
    return;
  }

  try {
    const content = await readFile(filePath, "utf-8");
    const lines = content.split("\n");

    for (let i = 0; i < lines.length && matches.length < maxResults; i++) {
      const line = lines[i]!;
      // Reset regex lastIndex for each line
      pattern.lastIndex = 0;

      let match = pattern.exec(line);
      while (match !== null && matches.length < maxResults) {
        matches.push({
          file: relativePath,
          line: i + 1, // 1-indexed
          column: match.index + 1, // 1-indexed
          match: match[0],
          context: extractContext(lines, i, CONTEXT_LINES),
        });

        // Prevent infinite loop on zero-width matches
        if (match[0].length === 0) {
          pattern.lastIndex++;
        }
        match = pattern.exec(line);
      }
    }
  } catch {
    // Skip files we can't read (binary, permission denied, etc.)
  }
}

/**
 * Recursively search directory for files matching pattern
 */
async function searchDirectory(
  basePath: string,
  currentPath: string,
  pattern: RegExp,
  matches: SearchMatch[],
  maxResults: number,
  gitignorePatterns: Set<string>,
  abortSignal: AbortSignal,
  filesSearched: { count: number }
): Promise<void> {
  if (abortSignal.aborted || matches.length >= maxResults) {
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
    if (abortSignal.aborted || matches.length >= maxResults) {
      return;
    }

    // Skip ignored paths
    if (isIgnored(name, gitignorePatterns)) {
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
          pattern,
          matches,
          maxResults,
          gitignorePatterns,
          abortSignal,
          filesSearched
        );
      } else if (stats.isFile() && !isBinaryFile(name)) {
        filesSearched.count++;
        await searchFile(entryPath, relativePath, pattern, matches, maxResults);
      }
    } catch {
      // Skip entries we can't access
    }
  }
}

/**
 * Search files tool implementation
 *
 * Searches for patterns across files in a directory.
 * Supports regex and literal string search.
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
 * ```
 */
export const searchFilesTool = defineTool({
  name: "search_files",
  description:
    "Search for a pattern across files in a directory. Supports regex, case sensitivity options, and respects .gitignore patterns.",
  parameters: searchFilesParamsSchema,
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

      // Create search pattern
      let pattern: RegExp;
      try {
        pattern = createSearchPattern(input.pattern, input.isRegex, input.caseSensitive);
      } catch (error) {
        if (error instanceof SyntaxError) {
          return fail(`Invalid regex pattern: ${error.message}`);
        }
        throw error;
      }

      // Load gitignore patterns
      const gitignorePatterns = await loadGitignore(resolvedPath);

      const matches: SearchMatch[] = [];
      const filesSearched = { count: 0 };

      await searchDirectory(
        resolvedPath,
        "",
        pattern,
        matches,
        input.maxResults,
        gitignorePatterns,
        ctx.abortSignal,
        filesSearched
      );

      return ok({
        pattern: input.pattern,
        searchPath: resolvedPath,
        matches,
        filesSearched: filesSearched.count,
        truncated: matches.length >= input.maxResults,
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
