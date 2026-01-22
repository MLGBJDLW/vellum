/**
 * Glob Tool
 *
 * Direct pattern matching for files without shell.
 * Uses picomatch for efficient glob pattern matching.
 *
 * @module builtin/glob
 */

import { readdir, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import picomatch from "picomatch";
import { z } from "zod";

import { defineTool, fail, ok } from "../types/index.js";
import { validatePath } from "./utils/index.js";

/** Default maximum files to return */
const DEFAULT_MAX_FILES = 1000;

/** Directories to always ignore */
const DEFAULT_IGNORE_DIRS = ["node_modules", ".git", "dist", "build", ".next", "coverage"];

/**
 * Schema for glob tool parameters
 */
export const globParamsSchema = z.object({
  /** Glob patterns to match (e.g., "**\/*.ts", "src/**\/*.{js,jsx}") */
  patterns: z
    .array(z.string())
    .min(1)
    .describe('Glob patterns to match (e.g., "**/*.ts", "src/**/*.{js,jsx}")'),
  /** Working directory for pattern matching (default: workspace root) */
  cwd: z
    .string()
    .optional()
    .describe("Working directory for pattern matching (defaults to workspace root)"),
  /** Patterns to exclude from results */
  ignore: z.array(z.string()).optional().describe("Patterns to exclude from results"),
  /** Include dotfiles in results (default: false) */
  dot: z.boolean().optional().default(false).describe("Include dotfiles in results"),
  /** Maximum number of files to return (default: 1000) */
  maxFiles: z
    .number()
    .int()
    .min(1)
    .max(10000)
    .optional()
    .default(DEFAULT_MAX_FILES)
    .describe("Maximum number of files to return (1-10000, default: 1000)"),
});

/** Inferred type for glob parameters */
export type GlobParams = z.infer<typeof globParamsSchema>;

/** Output type for glob tool */
export interface GlobOutput {
  /** Array of matched file paths (relative to cwd) */
  files: string[];
  /** Total number of matches found */
  count: number;
  /** Whether results were truncated due to maxFiles limit */
  truncated: boolean;
  /** The working directory used for matching */
  cwd: string;
  /** Patterns that were matched */
  patterns: string[];
}

/**
 * Recursively walk a directory and collect all file paths
 */
async function walkDirectory(
  dir: string,
  baseDir: string,
  options: {
    dot: boolean;
    maxFiles: number;
    ignoreMatcher: picomatch.Matcher | null;
  },
  results: string[],
  depth = 0
): Promise<boolean> {
  // Prevent infinite recursion
  if (depth > 50) return false;

  // Check if we've hit the limit
  if (results.length >= options.maxFiles) {
    return true; // truncated
  }

  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (results.length >= options.maxFiles) {
        return true; // truncated
      }

      const name = entry.name;

      // Skip hidden files/dirs unless dot option is enabled
      if (!options.dot && name.startsWith(".")) {
        continue;
      }

      // Skip common ignored directories
      if (entry.isDirectory() && DEFAULT_IGNORE_DIRS.includes(name)) {
        continue;
      }

      const fullPath = join(dir, name);
      const relativePath = relative(baseDir, fullPath).replace(/\\/g, "/");

      // Check ignore patterns
      if (options.ignoreMatcher?.(relativePath)) {
        continue;
      }

      if (entry.isDirectory()) {
        const truncated = await walkDirectory(fullPath, baseDir, options, results, depth + 1);
        if (truncated) return true;
      } else if (entry.isFile()) {
        results.push(relativePath);
      }
    }
  } catch {
    // Ignore permission errors and continue
  }

  return false;
}

/**
 * Glob tool implementation
 *
 * Matches files using glob patterns without invoking a shell.
 * Supports multiple patterns, ignore patterns, and dotfiles.
 *
 * @example
 * ```typescript
 * // Find all TypeScript files
 * const result = await globTool.execute(
 *   { patterns: ["**\/*.ts"] },
 *   ctx
 * );
 *
 * // Find multiple file types, ignoring tests
 * const result = await globTool.execute(
 *   { patterns: ["**\/*.{ts,tsx}"], ignore: ["**\/*.test.ts"] },
 *   ctx
 * );
 * ```
 */
export const globTool = defineTool({
  name: "glob",
  description:
    'Find files matching glob patterns. Returns file paths relative to the working directory. Supports patterns like "**/*.ts", "src/**/*.{js,jsx}", etc. Ignores node_modules, .git, and other common directories by default.',
  parameters: globParamsSchema,
  kind: "read",
  category: "filesystem",

  async execute(input, ctx) {
    // Check for cancellation
    if (ctx.abortSignal.aborted) {
      return fail("Operation was cancelled");
    }

    // Resolve working directory
    const cwd = input.cwd ? resolve(ctx.workingDir, input.cwd) : ctx.workingDir;

    // Validate path security
    const pathResult = validatePath(cwd, ctx.workingDir);
    if (!pathResult.valid) {
      return fail(pathResult.error ?? "Path traversal not allowed");
    }

    const resolvedCwd = pathResult.sanitizedPath;

    // Verify directory exists
    try {
      const stats = await stat(resolvedCwd);
      if (!stats.isDirectory()) {
        return fail(`Path is not a directory: ${input.cwd ?? cwd}`);
      }
    } catch (error) {
      if (error instanceof Error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code === "ENOENT") {
          return fail(`Directory not found: ${input.cwd ?? cwd}`);
        }
      }
      return fail(`Failed to access directory: ${input.cwd ?? cwd}`);
    }

    // Create matchers for patterns
    const patternMatcher = picomatch(input.patterns, {
      dot: input.dot,
      nocase: process.platform === "win32",
    });

    // Create matcher for ignore patterns
    const ignoreMatcher = input.ignore?.length
      ? picomatch(input.ignore, {
          dot: true,
          nocase: process.platform === "win32",
        })
      : null;

    // Collect all files first
    const allFiles: string[] = [];
    const truncatedDuringWalk = await walkDirectory(
      resolvedCwd,
      resolvedCwd,
      {
        dot: input.dot ?? false,
        maxFiles: input.maxFiles ?? DEFAULT_MAX_FILES,
        ignoreMatcher,
      },
      allFiles
    );

    // Filter files by pattern
    const matchedFiles = allFiles.filter((file) => patternMatcher(file));

    // Apply maxFiles limit to matched results
    const maxFiles = input.maxFiles ?? DEFAULT_MAX_FILES;
    const truncated = truncatedDuringWalk || matchedFiles.length > maxFiles;
    const files = matchedFiles.slice(0, maxFiles);

    return ok({
      files,
      count: files.length,
      truncated,
      cwd: resolvedCwd,
      patterns: input.patterns,
    });
  },

  shouldConfirm(_input, _ctx) {
    // Read-only operation, no confirmation needed
    return false;
  },
});
