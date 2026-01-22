/**
 * Apply Patch Tool
 *
 * Parses and applies Codex-format patches using <<<< >>>> markers.
 * Supports multiple patches in a single call.
 *
 * @module builtin/apply-patch
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative } from "node:path";
import { createTwoFilesPatch, diffLines } from "diff";
import { z } from "zod";
import { defineTool, fail, ok } from "../types/index.js";
import type { DiffMetadata } from "../types/tool.js";
import { validatePath } from "./utils/index.js";

/**
 * Schema for apply_patch tool parameters
 */
export const applyPatchParamsSchema = z.object({
  /** File path to patch (relative to working directory or absolute) */
  path: z.string().describe("The path to the file to patch"),
  /** Codex format patch with <<<<<<< SEARCH / ======= / >>>>>>> REPLACE markers */
  patch: z.string().describe("The Codex format patch to apply"),
});

/** Inferred type for apply_patch parameters */
export type ApplyPatchParams = z.infer<typeof applyPatchParamsSchema>;

/** Represents a single search/replace block */
export interface PatchBlock {
  /** The content to search for */
  search: string;
  /** The content to replace with */
  replace: string;
}

/** Result of applying a single patch block */
export interface PatchBlockResult {
  /** Whether this block was successfully applied */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

/** Output type for apply_patch tool */
export interface ApplyPatchOutput {
  /** The resolved path that was patched */
  path: string;
  /** Number of patches successfully applied */
  appliedCount: number;
  /** Total number of patches in input */
  totalCount: number;
  /** Details of any failed patches */
  failures: Array<{ index: number; error: string }>;
  /** Diff metadata showing the changes made */
  diffMeta?: DiffMetadata;
}

/**
 * Parse Codex-format patch into blocks
 *
 * Format:
 * ```
 * <<<<<<< SEARCH
 * original content
 * =======
 * replacement content
 * >>>>>>> REPLACE
 * ```
 *
 * @param patch - The patch string to parse
 * @returns Array of parsed patch blocks
 */
export function parseCodexPatch(patch: string): PatchBlock[] {
  const blocks: PatchBlock[] = [];

  // Match pattern: <<<<<<< SEARCH ... ======= ... >>>>>>> REPLACE
  // Using a state machine approach for robustness
  const lines = patch.split("\n");

  let state: "outside" | "search" | "replace" = "outside";
  let searchLines: string[] = [];
  let replaceLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === "<<<<<<< SEARCH" || trimmed.startsWith("<<<<<<< SEARCH")) {
      state = "search";
      searchLines = [];
      replaceLines = [];
    } else if (trimmed === "=======" && state === "search") {
      state = "replace";
    } else if (
      (trimmed === ">>>>>>> REPLACE" || trimmed.startsWith(">>>>>>> REPLACE")) &&
      state === "replace"
    ) {
      // Complete block found
      blocks.push({
        search: searchLines.join("\n"),
        replace: replaceLines.join("\n"),
      });
      state = "outside";
    } else if (state === "search") {
      searchLines.push(line);
    } else if (state === "replace") {
      replaceLines.push(line);
    }
  }

  return blocks;
}

/**
 * Apply a single patch block to content
 *
 * @param content - The file content
 * @param block - The patch block to apply
 * @returns Result with new content or error
 */
export function applyPatchBlock(
  content: string,
  block: PatchBlock
): { success: true; content: string } | { success: false; error: string } {
  // Handle empty search (insert at beginning or end of file)
  if (block.search === "") {
    return {
      success: true,
      content: block.replace + content,
    };
  }

  // Find the search string in content
  const index = content.indexOf(block.search);
  if (index === -1) {
    // Try to provide helpful error with preview
    const searchPreview =
      block.search.length > 50 ? `${block.search.substring(0, 50)}...` : block.search;
    return {
      success: false,
      error: `Search content not found: "${searchPreview.replace(/\n/g, "\\n")}"`,
    };
  }

  // Check for multiple matches (ambiguous)
  const secondIndex = content.indexOf(block.search, index + 1);
  if (secondIndex !== -1) {
    return {
      success: false,
      error: `Multiple matches found for search content. Please provide more context for unambiguous replacement.`,
    };
  }

  // Apply the replacement
  const before = content.substring(0, index);
  const after = content.substring(index + block.search.length);
  const newContent = before + block.replace + after;

  return { success: true, content: newContent };
}

/**
 * Apply patch tool implementation
 *
 * Parses and applies Codex-format patches using search/replace markers.
 * Supports multiple patches in a single call.
 *
 * @example
 * ```typescript
 * const patch = `<<<<<<< SEARCH
 * const oldValue = 1;
 * =======
 * const newValue = 2;
 * >>>>>>> REPLACE`;
 *
 * const result = await applyPatchTool.execute({ path: "file.ts", patch }, ctx);
 * ```
 */
export const applyPatchTool = defineTool({
  name: "apply_patch",
  description:
    "Apply a Codex-format patch to a file using <<<<<<< SEARCH / ======= / >>>>>>> REPLACE markers. Supports multiple patches in one call.",
  parameters: applyPatchParamsSchema,
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

    // Parse the patch
    const blocks = parseCodexPatch(input.patch);
    if (blocks.length === 0) {
      return fail(
        "No valid patch blocks found. Use <<<<<<< SEARCH ... ======= ... >>>>>>> REPLACE format."
      );
    }

    try {
      // Read the current file content
      let content: string;
      let oldContent = "";
      try {
        content = await readFile(resolvedPath, { encoding: "utf-8" });
        oldContent = content;
      } catch (error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code === "ENOENT") {
          // File doesn't exist - start with empty content for new files
          content = "";
        } else {
          throw error;
        }
      }

      const failures: Array<{ index: number; error: string }> = [];
      let appliedCount = 0;

      // Apply each block in order
      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        if (!block) continue;
        const result = applyPatchBlock(content, block);
        if (result.success) {
          content = result.content;
          appliedCount++;
        } else {
          failures.push({ index: i, error: result.error });
        }
      }

      // Only write if at least one patch was applied
      let diffMeta: DiffMetadata | undefined;
      if (appliedCount > 0) {
        // Create parent directories if needed
        const parentDir = dirname(resolvedPath);
        await mkdir(parentDir, { recursive: true });

        // Write the patched content
        await writeFile(resolvedPath, content, { encoding: "utf-8" });

        // Generate diff metadata
        const relativePath = relative(ctx.workingDir, resolvedPath);
        const diff = createTwoFilesPatch(relativePath, relativePath, oldContent, content, "", "");

        let additions = 0;
        let deletions = 0;
        for (const change of diffLines(oldContent, content)) {
          if (change.added) additions += change.count ?? 0;
          if (change.removed) deletions += change.count ?? 0;
        }

        diffMeta = { diff, additions, deletions };
      }

      // Return partial success if some patches failed
      if (failures.length > 0 && appliedCount === 0) {
        return fail(
          `All patches failed to apply:\n${failures.map((f) => `  Block ${f.index + 1}: ${f.error}`).join("\n")}`
        );
      }

      return ok({
        path: resolvedPath,
        appliedCount,
        totalCount: blocks.length,
        failures,
        diffMeta,
      });
    } catch (error) {
      if (error instanceof Error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code === "EACCES") {
          return fail(`Access denied: ${input.path}`);
        }
        return fail(`Failed to apply patch: ${error.message}`);
      }
      return fail("Unknown error occurred while applying patch");
    }
  },

  shouldConfirm(_input, _ctx) {
    // Write operations typically need confirmation
    return true;
  },
});
