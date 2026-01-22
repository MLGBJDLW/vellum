/**
 * Write File Tool
 *
 * Writes content to a file, creating parent directories as needed.
 * Implements path security and permission checks.
 *
 * @module builtin/write-file
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative } from "node:path";
import { createTwoFilesPatch, diffLines } from "diff";
import { z } from "zod";
import { defineTool, fail, ok } from "../types/index.js";
import type { DiffMetadata } from "../types/tool.js";
import { validatePath } from "./utils/index.js";

/**
 * Schema for write_file tool parameters
 */
export const writeFileParamsSchema = z.object({
  /** File path to write (relative to working directory or absolute) */
  path: z.string().describe("The path to the file to write"),
  /** Content to write to the file */
  content: z.string().describe("The content to write to the file"),
});

/** Inferred type for write_file parameters */
export type WriteFileParams = z.infer<typeof writeFileParamsSchema>;

/** Output type for write_file tool */
export interface WriteFileOutput {
  /** The resolved path that was written */
  path: string;
  /** Number of bytes written */
  bytesWritten: number;
  /** Whether the file was created (true) or overwritten (false) */
  created: boolean;
  /** Diff metadata for modified files (undefined for new files) */
  diffMeta?: DiffMetadata;
}

/**
 * Write file tool implementation
 *
 * Writes content to a file, creating parent directories if they don't exist.
 * Uses path security validation to prevent directory traversal attacks.
 * Requires write permission through the context.
 *
 * @example
 * ```typescript
 * const result = await writeFileTool.execute(
 *   { path: "src/new-file.ts", content: "export const foo = 'bar';" },
 *   ctx
 * );
 *
 * if (result.success) {
 *   console.log(`Wrote ${result.output.bytesWritten} bytes to ${result.output.path}`);
 * }
 * ```
 */
export const writeFileTool = defineTool({
  name: "write_file",
  description:
    "Write content to a file. Creates the file if it doesn't exist, or overwrites it if it does. Parent directories are created automatically.",
  parameters: writeFileParamsSchema,
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
      // Read existing content if file exists (for diff generation)
      let oldContent = "";
      let created = true;
      try {
        oldContent = await readFile(resolvedPath, "utf-8");
        created = false;
      } catch {
        // File doesn't exist, will be created
      }

      // Create parent directories if needed
      const parentDir = dirname(resolvedPath);
      await mkdir(parentDir, { recursive: true });

      // Write the file
      await writeFile(resolvedPath, input.content, { encoding: "utf-8" });

      // Generate diff metadata for modified files (not new files)
      let diffMeta: DiffMetadata | undefined;
      if (!created) {
        const relativePath = relative(ctx.workingDir, resolvedPath);
        const diff = createTwoFilesPatch(
          relativePath,
          relativePath,
          oldContent,
          input.content,
          "",
          ""
        );

        let additions = 0;
        let deletions = 0;
        for (const change of diffLines(oldContent, input.content)) {
          if (change.added) additions += change.count ?? 0;
          if (change.removed) deletions += change.count ?? 0;
        }

        diffMeta = { diff, additions, deletions };
      }

      return ok({
        path: resolvedPath,
        bytesWritten: Buffer.byteLength(input.content, "utf-8"),
        created,
        diffMeta,
      });
    } catch (error) {
      if (error instanceof Error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code === "EACCES") {
          return fail(`Access denied: ${input.path}`);
        }
        if (nodeError.code === "EROFS") {
          return fail(`Read-only file system: ${input.path}`);
        }
        if (nodeError.code === "ENOSPC") {
          return fail(`No space left on device`);
        }
        return fail(`Failed to write file: ${error.message}`);
      }
      return fail("Unknown error occurred while writing file");
    }
  },

  shouldConfirm(_input, _ctx) {
    // Could add confirmation for overwriting existing files
    // For now, all write operations might need confirmation based on policy
    return true;
  },
});
