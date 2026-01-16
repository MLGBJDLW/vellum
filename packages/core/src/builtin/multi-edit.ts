/**
 * Multi-Edit Tool
 *
 * Atomic multi-edit operations on a single file.
 * All edits succeed or all fail, ensuring file consistency.
 *
 * @module builtin/multi-edit
 */

import { readFile, writeFile } from "node:fs/promises";
import { relative } from "node:path";
import { createTwoFilesPatch, diffLines } from "diff";
import { z } from "zod";

import { defineTool, fail, ok } from "../types/index.js";
import type { DiffMetadata } from "../types/tool.js";
import { validatePath } from "./utils/index.js";

/**
 * Schema for a single edit operation
 */
const editOperationSchema = z.object({
  /** Type of edit operation */
  type: z
    .enum(["replace", "insert", "delete"])
    .describe("Type of edit: replace, insert, or delete"),
  /** Start line number (1-indexed) */
  startLine: z.number().int().positive().describe("Start line number (1-indexed)"),
  /** End line number for replace/delete operations (1-indexed, inclusive) */
  endLine: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("End line number (1-indexed, inclusive) for replace/delete"),
  /** Content for replace/insert operations */
  content: z.string().optional().describe("Content for replace/insert operations"),
});

/** Inferred type for edit operation */
export type EditOperation = z.infer<typeof editOperationSchema>;

/**
 * Schema for multi_edit tool parameters
 */
export const multiEditParamsSchema = z.object({
  /** File path to edit */
  path: z.string().describe("The path to the file to edit"),
  /** Array of edit operations to apply */
  edits: z
    .array(editOperationSchema)
    .min(1)
    .max(100)
    .describe("Array of edit operations to apply (max: 100)"),
  /** Preview changes without applying (default: false) */
  dryRun: z.boolean().optional().default(false).describe("Preview changes without applying"),
});

/** Inferred type for multi_edit parameters */
export type MultiEditParams = z.infer<typeof multiEditParamsSchema>;

/** Result of a single edit operation */
export interface EditResult {
  /** Type of edit that was applied */
  type: "replace" | "insert" | "delete";
  /** Starting line of the edit */
  startLine: number;
  /** Ending line of the edit (for replace/delete) */
  endLine?: number;
  /** Number of lines affected */
  linesAffected: number;
}

/** Output type for multi_edit tool */
export interface MultiEditOutput {
  /** The resolved file path */
  path: string;
  /** Array of edit results */
  edits: EditResult[];
  /** Total number of edits applied */
  editCount: number;
  /** Original line count before edits */
  originalLineCount: number;
  /** New line count after edits */
  newLineCount: number;
  /** Whether this was a dry run */
  dryRun: boolean;
  /** Preview of the result (only for dry run) */
  preview?: string;
  /** Diff metadata for all edits (if content changed) */
  diffMeta?: DiffMetadata;
}

/**
 * Validate edit operations for consistency
 */
function validateEdits(edits: EditOperation[], totalLines: number): string | null {
  for (let i = 0; i < edits.length; i++) {
    const edit = edits[i];
    if (!edit) continue;

    // Validate line numbers
    if (edit.startLine > totalLines + 1) {
      return `Edit ${i + 1}: startLine (${edit.startLine}) exceeds file length (${totalLines} lines)`;
    }

    if (edit.type === "replace" || edit.type === "delete") {
      const endLine = edit.endLine ?? edit.startLine;
      if (endLine < edit.startLine) {
        return `Edit ${i + 1}: endLine (${endLine}) cannot be less than startLine (${edit.startLine})`;
      }
      if (edit.startLine > totalLines) {
        return `Edit ${i + 1}: startLine (${edit.startLine}) exceeds file length (${totalLines} lines)`;
      }
    }

    if ((edit.type === "replace" || edit.type === "insert") && edit.content === undefined) {
      return `Edit ${i + 1}: content is required for ${edit.type} operations`;
    }
  }

  return null;
}

/**
 * Sort edits by start line in reverse order (bottom-up) to avoid line number shifts
 */
function sortEditsBottomUp(edits: EditOperation[]): EditOperation[] {
  return [...edits].sort((a, b) => {
    // Sort by start line descending
    if (b.startLine !== a.startLine) {
      return b.startLine - a.startLine;
    }
    // For same start line, deletes before inserts before replaces
    const typeOrder = { delete: 0, insert: 1, replace: 2 };
    return typeOrder[a.type] - typeOrder[b.type];
  });
}

/**
 * Apply a single edit operation to lines array
 */
function applyEdit(lines: string[], edit: EditOperation): EditResult {
  const startIdx = edit.startLine - 1; // Convert to 0-indexed

  switch (edit.type) {
    case "insert": {
      // Insert content at the specified line
      const newLines = (edit.content ?? "").split("\n");
      lines.splice(startIdx, 0, ...newLines);
      return {
        type: "insert",
        startLine: edit.startLine,
        linesAffected: newLines.length,
      };
    }

    case "delete": {
      const endLine = edit.endLine ?? edit.startLine;
      const endIdx = endLine; // endLine is 1-indexed, splice needs count
      const deleteCount = endIdx - startIdx;
      lines.splice(startIdx, deleteCount);
      return {
        type: "delete",
        startLine: edit.startLine,
        endLine,
        linesAffected: deleteCount,
      };
    }

    case "replace": {
      const endLine = edit.endLine ?? edit.startLine;
      const endIdx = endLine;
      const deleteCount = endIdx - startIdx;
      const newLines = (edit.content ?? "").split("\n");
      lines.splice(startIdx, deleteCount, ...newLines);
      return {
        type: "replace",
        startLine: edit.startLine,
        endLine,
        linesAffected: Math.abs(newLines.length - deleteCount),
      };
    }
  }
}

/**
 * Multi-edit tool implementation
 *
 * Applies multiple edits to a single file atomically.
 * All edits either succeed together or fail together, ensuring consistency.
 *
 * @example
 * ```typescript
 * // Replace a function and insert a new import
 * const result = await multiEditTool.execute({
 *   path: "src/index.ts",
 *   edits: [
 *     { type: "insert", startLine: 1, content: "import { foo } from 'bar';" },
 *     { type: "replace", startLine: 10, endLine: 15, content: "function newImpl() {\n  return true;\n}" },
 *     { type: "delete", startLine: 20, endLine: 22 }
 *   ]
 * }, ctx);
 * ```
 */
export const multiEditTool = defineTool({
  name: "multi_edit",
  description:
    "Apply multiple edits to a single file atomically. All edits succeed or all fail. Supports insert, replace, and delete operations. Edits are applied bottom-up to avoid line number shifts.",
  parameters: multiEditParamsSchema,
  kind: "write",
  category: "filesystem",

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Atomic multi-edit with validation and rollback support
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

    // Check permission for write operation (unless dry run)
    if (!input.dryRun) {
      const hasPermission = await ctx.checkPermission("write", resolvedPath);
      if (!hasPermission) {
        return fail(`Permission denied: cannot write to ${input.path}`);
      }
    }

    try {
      // Read the file
      const content = await readFile(resolvedPath, { encoding: "utf-8" });
      const originalContent = content; // Capture for diff generation
      const lines = content.split("\n");
      const originalLineCount = lines.length;

      // Validate all edits before applying
      const validationError = validateEdits(input.edits, originalLineCount);
      if (validationError) {
        return fail(validationError);
      }

      // Sort edits bottom-up to avoid line number shifts
      const sortedEdits = sortEditsBottomUp(input.edits);

      // Apply edits
      const editResults: EditResult[] = [];
      for (const edit of sortedEdits) {
        const result = applyEdit(lines, edit);
        editResults.push(result);
      }

      // Reverse results to match original order
      editResults.reverse();

      const newContent = lines.join("\n");
      const newLineCount = lines.length;

      // Generate diff metadata if content changed
      let diffMeta: DiffMetadata | undefined;
      if (newContent !== originalContent) {
        const relativePath = relative(ctx.workingDir, resolvedPath);
        const diff = createTwoFilesPatch(
          relativePath,
          relativePath,
          originalContent,
          newContent,
          "",
          ""
        );

        let additions = 0;
        let deletions = 0;
        for (const change of diffLines(originalContent, newContent)) {
          if (change.added) additions += change.count ?? 0;
          if (change.removed) deletions += change.count ?? 0;
        }

        diffMeta = { diff, additions, deletions };
      }

      // Write if not dry run
      if (!input.dryRun) {
        await writeFile(resolvedPath, newContent, { encoding: "utf-8" });
      }

      return ok({
        path: resolvedPath,
        edits: editResults,
        editCount: input.edits.length,
        originalLineCount,
        newLineCount,
        dryRun: input.dryRun ?? false,
        preview: input.dryRun ? newContent : undefined,
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
        return fail(`Failed to edit file: ${error.message}`);
      }
      return fail("Unknown error occurred while editing file");
    }
  },

  shouldConfirm(input, _ctx) {
    // Dry run doesn't need confirmation
    if (input.dryRun) return false;
    // Write operations need confirmation
    return true;
  },
});
