/**
 * Apply Diff Tool
 *
 * Parses and applies unified diff format patches to files.
 * Supports SmartEdit fallback for context mismatch handling.
 *
 * @module builtin/apply-diff
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { createSmartEditEngine, type StrategyName } from "../tool/smart-edit.js";
import { defineTool, fail, ok } from "../types/index.js";
import type { DiffMetadata } from "../types/tool.js";
import { validatePath } from "./utils/index.js";

/**
 * Schema for apply_diff tool parameters
 */
export const applyDiffParamsSchema = z.object({
  /** File path to patch (relative to working directory or absolute) */
  path: z.string().describe("The path to the file to patch"),
  /** Unified diff format patch */
  diff: z.string().describe("The unified diff format patch to apply"),
});

/** Inferred type for apply_diff parameters */
export type ApplyDiffParams = z.infer<typeof applyDiffParamsSchema>;

/** Represents a single hunk in a unified diff */
export interface DiffHunk {
  /** Original file start line (1-indexed) */
  oldStart: number;
  /** Number of lines in original section */
  oldCount: number;
  /** New file start line (1-indexed) */
  newStart: number;
  /** Number of lines in new section */
  newCount: number;
  /** Lines in the hunk (prefixed with ' ', '+', or '-') */
  lines: string[];
}

/** Output type for apply_diff tool */
export interface ApplyDiffOutput {
  /** The resolved path that was patched */
  path: string;
  /** Number of hunks applied */
  hunksApplied: number;
  /** Total lines added */
  linesAdded: number;
  /** Total lines removed */
  linesRemoved: number;
  /** Whether SmartEdit was used for fuzzy matching */
  smartEditUsed?: boolean;
  /** Strategy used by SmartEdit (if applicable) */
  smartEditStrategy?: StrategyName;
  /** Diff metadata for rendering (optional, backward compatible) */
  diffMeta?: DiffMetadata;
}

/**
 * Parse a unified diff format string into hunks
 *
 * @param diff - The unified diff string
 * @returns Array of parsed hunks
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Diff parsing requires comprehensive line-by-line state machine
export function parseUnifiedDiff(diff: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  const lines = diff.split("\n");

  // Regular expression to match hunk headers: @@ -1,3 +1,4 @@
  const hunkHeaderRegex = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/;

  let currentHunk: DiffHunk | null = null;

  for (const line of lines) {
    // Skip file headers (--- and +++)
    if (line.startsWith("---") || line.startsWith("+++")) {
      continue;
    }

    // Check for hunk header
    const headerMatch = line.match(hunkHeaderRegex);
    if (headerMatch) {
      // Save previous hunk if exists
      if (currentHunk) {
        hunks.push(currentHunk);
      }

      // Start new hunk
      currentHunk = {
        oldStart: parseInt(headerMatch[1] ?? "1", 10),
        oldCount: headerMatch[2] ? parseInt(headerMatch[2], 10) : 1,
        newStart: parseInt(headerMatch[3] ?? "1", 10),
        newCount: headerMatch[4] ? parseInt(headerMatch[4], 10) : 1,
        lines: [],
      };
      continue;
    }

    // Add line to current hunk if we're in one
    if (currentHunk) {
      // Only include lines that are part of the diff (context, additions, deletions)
      if (line.startsWith(" ") || line.startsWith("+") || line.startsWith("-") || line === "") {
        // Handle empty lines in diff (they might not have a prefix)
        if (line === "" && currentHunk.lines.length > 0) {
          currentHunk.lines.push(" ");
        } else if (line !== "") {
          currentHunk.lines.push(line);
        }
      }
    }
  }

  // Don't forget the last hunk
  if (currentHunk) {
    hunks.push(currentHunk);
  }

  return hunks;
}

/**
 * Apply a single hunk to file lines
 *
 * @param lines - Original file lines
 * @param hunk - Hunk to apply
 * @param useSmartEdit - Whether to use SmartEdit on mismatch (default: true)
 * @returns Result with new lines, error message, and SmartEdit info
 */
export function applyHunk(
  lines: string[],
  hunk: DiffHunk,
  useSmartEdit = true
):
  | {
      success: true;
      lines: string[];
      smartEditUsed?: boolean;
      smartEditStrategy?: StrategyName;
    }
  | {
      success: false;
      error: string;
    } {
  // Extract context and removed lines from hunk
  const oldLines: string[] = [];
  const newLines: string[] = [];

  for (const line of hunk.lines) {
    const prefix = line[0];
    const content = line.slice(1);

    if (prefix === " ") {
      // Context line - appears in both
      oldLines.push(content);
      newLines.push(content);
    } else if (prefix === "-") {
      // Removed line - only in old
      oldLines.push(content);
    } else if (prefix === "+") {
      // Added line - only in new
      newLines.push(content);
    }
  }

  // Calculate the position (convert from 1-indexed to 0-indexed)
  const startIndex = hunk.oldStart - 1;

  // First try exact context match
  let exactMatch = true;
  let mismatchInfo = "";

  for (let i = 0; i < oldLines.length; i++) {
    const fileLineIndex = startIndex + i;

    if (fileLineIndex >= lines.length) {
      exactMatch = false;
      mismatchInfo = `Hunk at line ${hunk.oldStart} extends beyond file (file has ${lines.length} lines)`;
      break;
    }

    if (lines[fileLineIndex] !== oldLines[i]) {
      exactMatch = false;
      mismatchInfo = `Context mismatch at line ${fileLineIndex + 1}: expected "${oldLines[i]}", found "${lines[fileLineIndex]}"`;
      break;
    }
  }

  // If exact match succeeded, apply directly
  if (exactMatch) {
    const result = [
      ...lines.slice(0, startIndex),
      ...newLines,
      ...lines.slice(startIndex + oldLines.length),
    ];
    return { success: true, lines: result };
  }

  // T036: Try SmartEdit fallback on mismatch
  if (useSmartEdit) {
    const engine = createSmartEditEngine({
      strategies: ["exact", "whitespace", "fuzzy", "block"],
      confidenceThreshold: 0.7,
    });

    // Construct search and replace strings from hunk
    const searchText = oldLines.join("\n");
    const replaceText = newLines.join("\n");
    const originalText = lines.join("\n");

    const smartResult = engine.apply(originalText, searchText, replaceText);

    if (smartResult.success) {
      return {
        success: true,
        lines: smartResult.output.split("\n"),
        smartEditUsed: true,
        smartEditStrategy: smartResult.strategy,
      };
    }
  }

  // All strategies failed
  return {
    success: false,
    error: mismatchInfo,
  };
}

/**
 * Apply diff tool implementation
 *
 * Parses and applies unified diff format patches to files.
 * Uses SmartEdit for fuzzy context matching when exact match fails.
 *
 * @example
 * ```typescript
 * const diff = `--- a/file.ts
 * +++ b/file.ts
 * @@ -1,3 +1,4 @@
 *  const a = 1;
 * +const b = 2;
 *  const c = 3;
 *  export { a, c };`;
 *
 * const result = await applyDiffTool.execute({ path: "file.ts", diff }, ctx);
 * ```
 */
export const applyDiffTool = defineTool({
  name: "apply_diff",
  description:
    "Apply a unified diff format patch to a file. The diff should include context lines for accurate matching. Currently requires exact context match.",
  parameters: applyDiffParamsSchema,
  kind: "write",
  category: "filesystem",

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: File operation with comprehensive validation and error handling
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

    // Parse the diff
    const hunks = parseUnifiedDiff(input.diff);
    if (hunks.length === 0) {
      return fail("No valid hunks found in diff");
    }

    try {
      // Read the current file content
      let content: string;
      try {
        content = await readFile(resolvedPath, { encoding: "utf-8" });
      } catch (error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code === "ENOENT") {
          // File doesn't exist - start with empty content for new files
          content = "";
        } else {
          throw error;
        }
      }

      let lines = content.split("\n");
      let linesAdded = 0;
      let linesRemoved = 0;

      // Apply hunks in reverse order to preserve line numbers
      // (applying from bottom to top prevents offset issues)
      const sortedHunks = [...hunks].sort((a, b) => b.oldStart - a.oldStart);

      let smartEditUsed = false;
      let smartEditStrategy: StrategyName | undefined;

      for (const hunk of sortedHunks) {
        const result = applyHunk(lines, hunk);
        if (!result.success) {
          return fail(result.error);
        }
        lines = result.lines;

        // Track SmartEdit usage
        if (result.smartEditUsed) {
          smartEditUsed = true;
          smartEditStrategy = result.smartEditStrategy;
        }

        // Count additions and removals
        for (const line of hunk.lines) {
          if (line.startsWith("+")) linesAdded++;
          if (line.startsWith("-")) linesRemoved++;
        }
      }

      // Create parent directories if needed
      const parentDir = dirname(resolvedPath);
      await mkdir(parentDir, { recursive: true });

      // Write the patched content
      await writeFile(resolvedPath, lines.join("\n"), { encoding: "utf-8" });

      return ok({
        path: resolvedPath,
        hunksApplied: hunks.length,
        linesAdded,
        linesRemoved,
        smartEditUsed: smartEditUsed || undefined,
        smartEditStrategy,
        diffMeta: {
          diff: input.diff,
          additions: linesAdded,
          deletions: linesRemoved,
        },
      });
    } catch (error) {
      if (error instanceof Error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code === "EACCES") {
          return fail(`Access denied: ${input.path}`);
        }
        return fail(`Failed to apply diff: ${error.message}`);
      }
      return fail("Unknown error occurred while applying diff");
    }
  },

  shouldConfirm(_input, _ctx) {
    // Write operations typically need confirmation
    return true;
  },
});
