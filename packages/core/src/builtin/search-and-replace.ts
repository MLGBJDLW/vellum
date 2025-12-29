/**
 * Search and Replace Tool
 *
 * Batch search and replace across multiple files with regex support.
 *
 * @module builtin/search-and-replace
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";

import { defineTool, fail, ok } from "../types/index.js";
import { validatePath } from "./utils/index.js";

/**
 * Schema for search_and_replace tool parameters
 */
export const searchAndReplaceParamsSchema = z.object({
  /** Search pattern (string or regex) */
  pattern: z.string().describe("The search pattern (string or regex)"),
  /** Replacement string (supports $1, $2, etc. for regex capture groups) */
  replacement: z
    .string()
    .describe("The replacement string. Use $1, $2, etc. for regex capture groups"),
  /** Array of file paths to search */
  paths: z.array(z.string()).min(1).describe("Array of file paths to search and replace in"),
  /** Whether to treat pattern as regex (default: false) */
  isRegex: z.boolean().optional().default(false).describe("Treat pattern as a regular expression"),
  /** Whether search is case sensitive (default: true) */
  caseSensitive: z.boolean().optional().default(true).describe("Case sensitive search"),
});

/** Inferred type for search_and_replace parameters */
export type SearchAndReplaceParams = z.infer<typeof searchAndReplaceParamsSchema>;

/** Result for a single file */
export interface FileReplaceResult {
  /** File path */
  path: string;
  /** Number of replacements made */
  replacements: number;
  /** Whether the file was modified */
  modified: boolean;
  /** Error message if failed */
  error?: string;
}

/** Output type for search_and_replace tool */
export interface SearchAndReplaceOutput {
  /** Total number of replacements across all files */
  totalReplacements: number;
  /** Number of files modified */
  filesModified: number;
  /** Number of files processed */
  filesProcessed: number;
  /** Results per file */
  results: FileReplaceResult[];
}

/**
 * Count matches of a pattern in a string
 *
 * @param content - The content to search
 * @param pattern - The regex pattern
 * @returns Number of matches
 */
function countMatches(content: string, pattern: RegExp): number {
  // Need to ensure global flag is set for counting
  const globalPattern = pattern.global ? pattern : new RegExp(pattern.source, `${pattern.flags}g`);

  const matches = content.match(globalPattern);
  return matches ? matches.length : 0;
}

/**
 * Create a regex from pattern and options
 *
 * @param pattern - The search pattern
 * @param isRegex - Whether to treat as regex
 * @param caseSensitive - Whether case sensitive
 * @returns Compiled RegExp
 */
function createPattern(pattern: string, isRegex: boolean, caseSensitive: boolean): RegExp {
  let flags = "g"; // Always global for replace all
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
 * Search and replace tool implementation
 *
 * Performs batch search and replace across multiple files.
 * Supports both literal string search and regular expressions.
 * Regex capture groups can be used in replacement string ($1, $2, etc.).
 *
 * @example
 * ```typescript
 * // Literal search and replace
 * const result = await searchAndReplaceTool.execute({
 *   pattern: "oldFunction",
 *   replacement: "newFunction",
 *   paths: ["src/a.ts", "src/b.ts"],
 * }, ctx);
 *
 * // Regex with capture groups
 * const result = await searchAndReplaceTool.execute({
 *   pattern: "console\\.log\\(([^)]+)\\)",
 *   replacement: "logger.debug($1)",
 *   paths: ["src/*.ts"],
 *   isRegex: true,
 * }, ctx);
 * ```
 */
export const searchAndReplaceTool = defineTool({
  name: "search_and_replace",
  description:
    "Search and replace text across multiple files. Supports regex patterns and capture groups ($1, $2, etc.) in replacements.",
  parameters: searchAndReplaceParamsSchema,
  kind: "write",
  category: "filesystem",

  async execute(input, ctx) {
    // Check for cancellation
    if (ctx.abortSignal.aborted) {
      return fail("Operation was cancelled");
    }

    const results: FileReplaceResult[] = [];
    let totalReplacements = 0;
    let filesModified = 0;

    // Validate regex if provided
    let regex: RegExp;
    try {
      regex = createPattern(input.pattern, input.isRegex ?? false, input.caseSensitive ?? true);
    } catch (error) {
      return fail(
        `Invalid regex pattern: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }

    // Process each file
    for (const filePath of input.paths) {
      // Validate path security
      const pathResult = validatePath(filePath, ctx.workingDir);
      if (!pathResult.valid) {
        results.push({
          path: filePath,
          replacements: 0,
          modified: false,
          error: pathResult.error ?? "Path traversal not allowed",
        });
        continue;
      }

      const resolvedPath = pathResult.sanitizedPath;

      // Check permission for write operation
      const hasPermission = await ctx.checkPermission("write", resolvedPath);
      if (!hasPermission) {
        results.push({
          path: filePath,
          replacements: 0,
          modified: false,
          error: `Permission denied: cannot write to ${filePath}`,
        });
        continue;
      }

      try {
        // Read the file
        const content = await readFile(resolvedPath, { encoding: "utf-8" });

        // Count matches before replacing
        const matchCount = countMatches(content, regex);

        if (matchCount === 0) {
          results.push({
            path: filePath,
            replacements: 0,
            modified: false,
          });
          continue;
        }

        // Apply replacement
        const newContent = content.replace(regex, input.replacement);

        // Only write if content changed
        if (newContent !== content) {
          // Create parent directories if needed (shouldn't be necessary for existing files)
          const parentDir = dirname(resolvedPath);
          await mkdir(parentDir, { recursive: true });

          await writeFile(resolvedPath, newContent, { encoding: "utf-8" });

          results.push({
            path: filePath,
            replacements: matchCount,
            modified: true,
          });
          totalReplacements += matchCount;
          filesModified++;
        } else {
          results.push({
            path: filePath,
            replacements: 0,
            modified: false,
          });
        }
      } catch (error) {
        const nodeError = error as NodeJS.ErrnoException;
        let errorMsg: string;

        if (nodeError.code === "ENOENT") {
          errorMsg = `File not found: ${filePath}`;
        } else if (nodeError.code === "EACCES") {
          errorMsg = `Access denied: ${filePath}`;
        } else if (nodeError.code === "EISDIR") {
          errorMsg = `Path is a directory: ${filePath}`;
        } else if (error instanceof Error) {
          errorMsg = error.message;
        } else {
          errorMsg = "Unknown error";
        }

        results.push({
          path: filePath,
          replacements: 0,
          modified: false,
          error: errorMsg,
        });
      }
    }

    return ok({
      totalReplacements,
      filesModified,
      filesProcessed: input.paths.length,
      results,
    });
  },

  shouldConfirm(input, _ctx) {
    // Confirm for operations affecting multiple files
    return input.paths.length > 1;
  },
});
