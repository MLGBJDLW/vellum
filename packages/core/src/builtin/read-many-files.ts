/**
 * Read Many Files Tool
 *
 * Batch file reading with glob pattern support.
 * Efficiently reads multiple files in a single operation.
 *
 * @module builtin/read-many-files
 */

import { readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import picomatch from "picomatch";
import { z } from "zod";

import { defineTool, fail, ok } from "../types/index.js";
import { validatePath } from "./utils/index.js";

/** Default maximum files to read */
const DEFAULT_MAX_FILES = 20;

/** Default maximum bytes per file */
const DEFAULT_MAX_SIZE_PER_FILE = 50 * 1024; // 50KB

/** Directories to always ignore when using patterns */
const DEFAULT_IGNORE_DIRS = ["node_modules", ".git", "dist", "build", ".next", "coverage"];

/**
 * Schema for read_many_files tool parameters
 */
export const readManyFilesParamsSchema = z.object({
  /** Explicit file paths to read */
  paths: z.array(z.string()).optional().describe("Explicit file paths to read"),
  /** Glob patterns to match files (e.g., "src/**\/*.ts") */
  patterns: z
    .array(z.string())
    .optional()
    .describe('Glob patterns to match files (e.g., "src/**/*.ts")'),
  /** Maximum number of files to read (default: 20) */
  maxFiles: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(DEFAULT_MAX_FILES)
    .describe("Maximum number of files to read (1-100, default: 20)"),
  /** Maximum bytes per file (default: 50KB) */
  maxSizePerFile: z
    .number()
    .int()
    .min(1)
    .max(1024 * 1024) // 1MB max
    .optional()
    .default(DEFAULT_MAX_SIZE_PER_FILE)
    .describe("Maximum bytes per file (default: 50KB, max: 1MB)"),
  /** Optional line range to extract from all files [startLine, endLine] (1-indexed) */
  lineRange: z
    .tuple([z.number().int().positive(), z.number().int().positive()])
    .optional()
    .describe("Optional line range [startLine, endLine] (1-indexed) to extract from all files"),
});

/** Inferred type for read_many_files parameters */
export type ReadManyFilesParams = z.infer<typeof readManyFilesParamsSchema>;

/** Single file result in batch read */
export interface FileReadResult {
  /** File path (relative to working directory) */
  path: string;
  /** File content (or partial if line range specified) */
  content: string;
  /** File size in bytes */
  size: number;
  /** Total number of lines in file */
  lines: number;
  /** Whether content was truncated due to size limit */
  truncated: boolean;
  /** Error message if reading failed */
  error?: string;
}

/** Output type for read_many_files tool */
export interface ReadManyFilesOutput {
  /** Array of file read results */
  files: FileReadResult[];
  /** Number of files successfully read */
  successCount: number;
  /** Number of files that failed to read */
  errorCount: number;
  /** Whether results were truncated due to maxFiles limit */
  truncated: boolean;
}

/**
 * Recursively walk a directory and collect file paths matching patterns
 */
async function walkDirectory(
  dir: string,
  baseDir: string,
  matcher: picomatch.Matcher,
  maxFiles: number,
  results: string[],
  depth = 0
): Promise<boolean> {
  if (depth > 50 || results.length >= maxFiles) {
    return results.length >= maxFiles;
  }

  try {
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (results.length >= maxFiles) return true;

      const name = entry.name;

      // Skip hidden and ignored directories
      if (name.startsWith(".") || (entry.isDirectory() && DEFAULT_IGNORE_DIRS.includes(name))) {
        continue;
      }

      const fullPath = join(dir, name);
      const relativePath = relative(baseDir, fullPath).replace(/\\/g, "/");

      if (entry.isDirectory()) {
        const truncated = await walkDirectory(
          fullPath,
          baseDir,
          matcher,
          maxFiles,
          results,
          depth + 1
        );
        if (truncated) return true;
      } else if (entry.isFile() && matcher(relativePath)) {
        results.push(relativePath);
      }
    }
  } catch {
    // Ignore permission errors
  }

  return false;
}

/**
 * Read many files tool implementation
 *
 * Reads multiple files in a single operation, supporting both explicit paths
 * and glob patterns. Useful for batch operations and context gathering.
 *
 * @example
 * ```typescript
 * // Read specific files
 * const result = await readManyFilesTool.execute(
 *   { paths: ["src/index.ts", "package.json"] },
 *   ctx
 * );
 *
 * // Read files matching patterns
 * const result = await readManyFilesTool.execute(
 *   { patterns: ["src/**\/*.test.ts"], maxFiles: 10 },
 *   ctx
 * );
 * ```
 */
export const readManyFilesTool = defineTool({
  name: "read_many_files",
  description:
    "Read multiple files in a single operation. Supports explicit paths and/or glob patterns. Returns file contents with metadata. Useful for batch reading related files.",
  parameters: readManyFilesParamsSchema,
  kind: "read",
  category: "filesystem",

  async execute(input, ctx) {
    // Check for cancellation
    if (ctx.abortSignal.aborted) {
      return fail("Operation was cancelled");
    }

    // Validate that at least one of paths or patterns is provided
    if (
      (!input.paths || input.paths.length === 0) &&
      (!input.patterns || input.patterns.length === 0)
    ) {
      return fail("Either 'paths' or 'patterns' must be provided");
    }

    const maxFiles = input.maxFiles ?? DEFAULT_MAX_FILES;
    const maxSizePerFile = input.maxSizePerFile ?? DEFAULT_MAX_SIZE_PER_FILE;
    const filesToRead: string[] = [];

    // Add explicit paths
    if (input.paths) {
      for (const path of input.paths) {
        if (filesToRead.length >= maxFiles) break;
        filesToRead.push(path);
      }
    }

    // Add files matching patterns
    if (input.patterns && input.patterns.length > 0 && filesToRead.length < maxFiles) {
      const matcher = picomatch(input.patterns, {
        dot: false,
        nocase: process.platform === "win32",
      });

      const patternFiles: string[] = [];
      await walkDirectory(
        ctx.workingDir,
        ctx.workingDir,
        matcher,
        maxFiles - filesToRead.length,
        patternFiles
      );

      // Add pattern matches, avoiding duplicates
      const existingPaths = new Set(filesToRead);
      for (const file of patternFiles) {
        if (filesToRead.length >= maxFiles) break;
        if (!existingPaths.has(file)) {
          filesToRead.push(file);
          existingPaths.add(file);
        }
      }
    }

    const truncated = filesToRead.length >= maxFiles;
    const results: FileReadResult[] = [];
    let successCount = 0;
    let errorCount = 0;

    // Read all files
    for (const filePath of filesToRead) {
      // Check for cancellation
      if (ctx.abortSignal.aborted) {
        return fail("Operation was cancelled");
      }

      // Validate path security
      const pathResult = validatePath(filePath, ctx.workingDir);
      if (!pathResult.valid) {
        results.push({
          path: filePath,
          content: "",
          size: 0,
          lines: 0,
          truncated: false,
          error: pathResult.error ?? "Path traversal not allowed",
        });
        errorCount++;
        continue;
      }

      const resolvedPath = pathResult.sanitizedPath;

      try {
        // Get file stats
        const stats = await stat(resolvedPath);

        if (!stats.isFile()) {
          results.push({
            path: filePath,
            content: "",
            size: 0,
            lines: 0,
            truncated: false,
            error: "Path is not a file",
          });
          errorCount++;
          continue;
        }

        // Read file content
        let content = await readFile(resolvedPath, { encoding: "utf-8" });
        const originalSize = Buffer.byteLength(content, "utf-8");
        let contentTruncated = false;

        // Apply size limit
        if (originalSize > maxSizePerFile) {
          content = content.slice(0, maxSizePerFile);
          contentTruncated = true;
        }

        // Apply line range if specified
        const lines = content.split("\n");
        const totalLines = lines.length;

        if (input.lineRange) {
          const [startLine, endLine] = input.lineRange;
          const start = Math.max(1, startLine);
          const end = Math.min(totalLines, endLine);

          if (start <= totalLines) {
            content = lines.slice(start - 1, end).join("\n");
          } else {
            content = "";
          }
        }

        results.push({
          path: filePath,
          content,
          size: originalSize,
          lines: totalLines,
          truncated: contentTruncated,
        });
        successCount++;
      } catch (error) {
        let errorMessage = "Unknown error";
        if (error instanceof Error) {
          const nodeError = error as NodeJS.ErrnoException;
          if (nodeError.code === "ENOENT") {
            errorMessage = "File not found";
          } else if (nodeError.code === "EACCES") {
            errorMessage = "Access denied";
          } else {
            errorMessage = error.message;
          }
        }

        results.push({
          path: filePath,
          content: "",
          size: 0,
          lines: 0,
          truncated: false,
          error: errorMessage,
        });
        errorCount++;
      }
    }

    return ok({
      files: results,
      successCount,
      errorCount,
      truncated,
    });
  },

  shouldConfirm(_input, _ctx) {
    // Read-only operation, no confirmation needed
    return false;
  },
});
