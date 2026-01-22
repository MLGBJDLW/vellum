/**
 * Insert At Line Tool
 *
 * Simple line-based content insertion.
 * Easier to use than multi_edit for single insertions.
 *
 * @module builtin/insert-at-line
 */

import { readFile, writeFile } from "node:fs/promises";
import { relative } from "node:path";

import { createTwoFilesPatch, diffLines } from "diff";
import { z } from "zod";

import { defineTool, fail, ok } from "../types/index.js";
import type { DiffMetadata } from "../types/tool.js";
import { validatePath } from "./utils/index.js";

/**
 * Schema for insert_at_line tool parameters
 */
export const insertAtLineParamsSchema = z.object({
  /** File path to edit */
  path: z.string().describe("The path to the file to edit"),
  /** Line number to insert at (1-indexed) */
  line: z.number().int().positive().describe("Line number to insert at (1-indexed)"),
  /** Content to insert */
  content: z.string().describe("Content to insert"),
  /** Insert position relative to the line (default: before) */
  position: z
    .enum(["before", "after"])
    .optional()
    .default("before")
    .describe("Insert before or after the specified line (default: before)"),
});

/** Inferred type for insert_at_line parameters */
export type InsertAtLineParams = z.infer<typeof insertAtLineParamsSchema>;

/** Output type for insert_at_line tool */
export interface InsertAtLineOutput {
  /** The resolved file path */
  path: string;
  /** The line number where content was inserted */
  insertedAtLine: number;
  /** Number of lines inserted */
  linesInserted: number;
  /** Original line count before insertion */
  originalLineCount: number;
  /** New line count after insertion */
  newLineCount: number;
  /** Diff metadata showing what changed */
  diffMeta?: DiffMetadata;
}

/**
 * Insert at line tool implementation
 *
 * Inserts content at a specific line in a file.
 * Simpler than multi_edit for single insertion operations.
 *
 * @example
 * ```typescript
 * // Insert import at the beginning of file
 * const result = await insertAtLineTool.execute({
 *   path: "src/index.ts",
 *   line: 1,
 *   content: "import { foo } from 'bar';",
 *   position: "before"
 * }, ctx);
 *
 * // Insert code after a specific line
 * const result = await insertAtLineTool.execute({
 *   path: "src/utils.ts",
 *   line: 10,
 *   content: "// New comment\nconst x = 1;",
 *   position: "after"
 * }, ctx);
 * ```
 */
export const insertAtLineTool = defineTool({
  name: "insert_at_line",
  description:
    "Insert content at a specific line in a file. Can insert before or after the specified line. Simpler alternative to multi_edit for single insertions.",
  parameters: insertAtLineParamsSchema,
  kind: "write",
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

    // Check permission for write operation
    const hasPermission = await ctx.checkPermission("write", resolvedPath);
    if (!hasPermission) {
      return fail(`Permission denied: cannot write to ${input.path}`);
    }

    try {
      // Read the file
      const content = await readFile(resolvedPath, { encoding: "utf-8" });
      const lines = content.split("\n");
      const originalLineCount = lines.length;

      // Validate line number
      if (input.line > originalLineCount + 1) {
        return fail(
          `Line number ${input.line} exceeds file length (${originalLineCount} lines). Use line ${originalLineCount + 1} to append.`
        );
      }

      // Split content into lines
      const newLines = input.content.split("\n");
      const linesInserted = newLines.length;

      // Calculate insertion index (0-based)
      let insertIdx: number;
      let insertedAtLine: number;

      if (input.position === "after") {
        // Insert after the specified line
        insertIdx = input.line; // After line N means index N (0-based after line N is index N)
        insertedAtLine = input.line + 1;
      } else {
        // Insert before the specified line (default)
        insertIdx = input.line - 1; // Before line N means index N-1
        insertedAtLine = input.line;
      }

      // Clamp insertion index to valid range
      insertIdx = Math.max(0, Math.min(insertIdx, lines.length));

      // Insert the new lines
      lines.splice(insertIdx, 0, ...newLines);

      const newContent = lines.join("\n");
      const newLineCount = lines.length;

      // Write the modified content
      await writeFile(resolvedPath, newContent, { encoding: "utf-8" });

      // Generate diff metadata
      const relativePath = relative(ctx.workingDir, resolvedPath);
      const diff = createTwoFilesPatch(relativePath, relativePath, content, newContent, "", "");

      let additions = 0;
      let deletions = 0;
      for (const change of diffLines(content, newContent)) {
        if (change.added) additions += change.count ?? 0;
        if (change.removed) deletions += change.count ?? 0;
      }

      const diffMeta: DiffMetadata = { diff, additions, deletions };

      return ok({
        path: resolvedPath,
        insertedAtLine,
        linesInserted,
        originalLineCount,
        newLineCount,
        diffMeta,
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
        return fail(`Failed to insert content: ${error.message}`);
      }
      return fail("Unknown error occurred while inserting content");
    }
  },

  shouldConfirm(_input, _ctx) {
    // Write operations need confirmation
    return true;
  },
});
