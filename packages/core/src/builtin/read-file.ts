/**
 * Read File Tool
 *
 * Reads file contents with optional line range support.
 * Implements path security to prevent traversal attacks.
 *
 * @module builtin/read-file
 */

import { readFile } from "node:fs/promises";
import { z } from "zod";

import { defineTool, fail, ok } from "../types/index.js";
import { validatePath } from "./utils/index.js";

/**
 * Schema for read_file tool parameters
 */
export const readFileParamsSchema = z.object({
  /** File path to read (relative to working directory or absolute) */
  path: z.string().describe("The path to the file to read"),
  /** Optional start line (1-indexed, inclusive) */
  startLine: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Start line number (1-indexed, inclusive)"),
  /** Optional end line (1-indexed, inclusive) */
  endLine: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("End line number (1-indexed, inclusive)"),
});

/** Inferred type for read_file parameters */
export type ReadFileParams = z.infer<typeof readFileParamsSchema>;

/** Output type for read_file tool */
export interface ReadFileOutput {
  /** The file content (or specified line range) */
  content: string;
  /** The resolved path that was read */
  path: string;
  /** Total number of lines in the file */
  totalLines: number;
  /** Start line that was read (1-indexed) */
  startLine: number;
  /** End line that was read (1-indexed) */
  endLine: number;
}

/**
 * Read file tool implementation
 *
 * Reads file contents with optional line range support.
 * Uses path security validation to prevent directory traversal attacks.
 *
 * @example
 * ```typescript
 * // Read entire file
 * const result = await readFileTool.execute(
 *   { path: "src/index.ts" },
 *   ctx
 * );
 *
 * // Read specific line range
 * const result = await readFileTool.execute(
 *   { path: "src/index.ts", startLine: 10, endLine: 20 },
 *   ctx
 * );
 * ```
 */
export const readFileTool = defineTool({
  name: "read_file",
  description:
    "Read the contents of a file. Optionally specify a line range to read only part of the file. Line numbers are 1-indexed and inclusive.",
  parameters: readFileParamsSchema,
  kind: "read",
  category: "filesystem",

  async execute(input, ctx) {
    // Check for cancellation
    if (ctx.abortSignal.aborted) {
      return fail("Operation was cancelled");
    }

    // Validate path security
    const pathResult = validatePath(input.path, ctx.workingDir);
    if (!pathResult.valid) {
      return fail(pathResult.error ?? "Path traversal not allowed");
    }

    const resolvedPath = pathResult.sanitizedPath;

    try {
      // Read the file
      const content = await readFile(resolvedPath, { encoding: "utf-8" });
      const lines = content.split("\n");
      const totalLines = lines.length;

      // Handle line range
      const startLine = input.startLine ?? 1;
      let endLine = input.endLine ?? totalLines;

      // Validate line range
      if (startLine > totalLines) {
        return fail(`Start line ${startLine} exceeds file length (${totalLines} lines)`);
      }

      if (endLine > totalLines) {
        endLine = totalLines;
      }

      if (startLine > endLine) {
        return fail(`Start line (${startLine}) cannot be greater than end line (${endLine})`);
      }

      // Extract the requested line range (convert from 1-indexed to 0-indexed)
      const selectedLines = lines.slice(startLine - 1, endLine);
      const selectedContent = selectedLines.join("\n");

      return ok({
        content: selectedContent,
        path: resolvedPath,
        totalLines,
        startLine,
        endLine,
      });
    } catch (error) {
      if (error instanceof Error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code === "ENOENT") {
          return fail(`File not found: ${input.path}`);
        }
        if (nodeError.code === "EACCES") {
          return fail(`Access denied: ${input.path}`);
        }
        if (nodeError.code === "EISDIR") {
          return fail(`Path is a directory, not a file: ${input.path}`);
        }
        return fail(`Failed to read file: ${error.message}`);
      }
      return fail("Unknown error occurred while reading file");
    }
  },

  shouldConfirm(_input, _ctx) {
    // Read operations don't need confirmation
    return false;
  },
});
