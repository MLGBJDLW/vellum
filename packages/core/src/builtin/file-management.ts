/**
 * File Management Tools
 *
 * Provides move, copy, delete, and mkdir operations with permission checks.
 * Complements existing read_file, write_file, and list_dir tools.
 *
 * @module builtin/file-management
 */

import { cp, mkdir, rename, rm, type Stats, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";

import { defineTool, fail, ok } from "../types/index.js";
import { validatePath } from "./utils/index.js";

// =============================================================================
// move_file Tool
// =============================================================================

/**
 * Schema for move_file tool parameters
 */
export const moveFileParamsSchema = z.object({
  /** Source path (file or directory) */
  source: z.string().describe("Source path"),
  /** Destination path */
  destination: z.string().describe("Destination path"),
  /** Overwrite if destination exists (default: false) */
  overwrite: z.boolean().optional().default(false).describe("Overwrite if exists"),
});

/** Inferred type for move_file parameters */
export type MoveFileParams = z.infer<typeof moveFileParamsSchema>;

/** Output type for move_file tool */
export interface MoveFileOutput {
  /** The resolved source path */
  source: string;
  /** The resolved destination path */
  destination: string;
  /** Whether an existing file was overwritten */
  overwritten: boolean;
}

/**
 * Move or rename a file or directory.
 *
 * @example
 * ```typescript
 * const result = await moveFileTool.execute(
 *   { source: "old.ts", destination: "new.ts" },
 *   ctx
 * );
 * ```
 */
export const moveFileTool = defineTool({
  name: "move_file",
  description: "Move or rename a file or directory",
  parameters: moveFileParamsSchema,
  kind: "write",
  category: "filesystem",

  async execute(input, ctx) {
    if (ctx.abortSignal.aborted) {
      return fail("Operation was cancelled");
    }

    // Validate source path
    const sourceResult = validatePath(input.source, ctx.workingDir);
    if (!sourceResult.valid) {
      return fail(sourceResult.error ?? "Source path traversal not allowed");
    }

    // Validate destination path
    const destResult = validatePath(input.destination, ctx.workingDir);
    if (!destResult.valid) {
      return fail(destResult.error ?? "Destination path traversal not allowed");
    }

    const sourcePath = sourceResult.sanitizedPath;
    const destPath = destResult.sanitizedPath;

    // Check read permission for source
    const canRead = await ctx.checkPermission("read", sourcePath);
    if (!canRead) {
      return fail(`Permission denied: cannot read from ${input.source}`);
    }

    // Check write permission for destination
    const canWrite = await ctx.checkPermission("write", destPath);
    if (!canWrite) {
      return fail(`Permission denied: cannot write to ${input.destination}`);
    }

    try {
      // Check if source exists
      try {
        await stat(sourcePath);
      } catch {
        return fail(`Source does not exist: ${input.source}`);
      }

      // Check if destination exists
      let overwritten = false;
      try {
        await stat(destPath);
        if (!input.overwrite) {
          return fail(
            `Destination already exists: ${input.destination}. Use overwrite: true to replace.`
          );
        }
        overwritten = true;
      } catch {
        // Destination doesn't exist, proceed with move
      }

      // Create parent directory if needed
      await mkdir(dirname(destPath), { recursive: true });

      // Perform the move/rename
      await rename(sourcePath, destPath);

      return ok({
        source: sourcePath,
        destination: destPath,
        overwritten,
      });
    } catch (error) {
      if (error instanceof Error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code === "EACCES") {
          return fail(`Access denied: ${input.source} or ${input.destination}`);
        }
        if (nodeError.code === "EXDEV") {
          // Cross-device move - need to copy then delete
          try {
            await cp(sourcePath, destPath, { recursive: true });
            await rm(sourcePath, { recursive: true, force: true });
            return ok({
              source: sourcePath,
              destination: destPath,
              overwritten: false,
            });
          } catch (copyError) {
            return fail(
              `Cross-device move failed: ${copyError instanceof Error ? copyError.message : String(copyError)}`
            );
          }
        }
        return fail(`Failed to move: ${error.message}`);
      }
      return fail(`Failed to move: ${String(error)}`);
    }
  },
});

// =============================================================================
// copy_file Tool
// =============================================================================

/**
 * Schema for copy_file tool parameters
 */
export const copyFileParamsSchema = z.object({
  /** Source path (file or directory) */
  source: z.string().describe("Source path"),
  /** Destination path */
  destination: z.string().describe("Destination path"),
  /** Copy directories recursively (default: true) */
  recursive: z.boolean().optional().default(true).describe("Copy directories recursively"),
  /** Overwrite if destination exists (default: false) */
  overwrite: z.boolean().optional().default(false).describe("Overwrite if exists"),
});

/** Inferred type for copy_file parameters */
export type CopyFileParams = z.infer<typeof copyFileParamsSchema>;

/** Output type for copy_file tool */
export interface CopyFileOutput {
  /** The resolved source path */
  source: string;
  /** The resolved destination path */
  destination: string;
  /** Whether an existing file was overwritten */
  overwritten: boolean;
  /** Whether this was a recursive directory copy */
  recursive: boolean;
}

/**
 * Copy a file or directory.
 *
 * @example
 * ```typescript
 * const result = await copyFileTool.execute(
 *   { source: "src/", destination: "backup/", recursive: true },
 *   ctx
 * );
 * ```
 */
export const copyFileTool = defineTool({
  name: "copy_file",
  description: "Copy a file or directory",
  parameters: copyFileParamsSchema,
  kind: "write",
  category: "filesystem",

  async execute(input, ctx) {
    if (ctx.abortSignal.aborted) {
      return fail("Operation was cancelled");
    }

    // Validate source path
    const sourceResult = validatePath(input.source, ctx.workingDir);
    if (!sourceResult.valid) {
      return fail(sourceResult.error ?? "Source path traversal not allowed");
    }

    // Validate destination path
    const destResult = validatePath(input.destination, ctx.workingDir);
    if (!destResult.valid) {
      return fail(destResult.error ?? "Destination path traversal not allowed");
    }

    const sourcePath = sourceResult.sanitizedPath;
    const destPath = destResult.sanitizedPath;

    // Check read permission for source
    const canRead = await ctx.checkPermission("read", sourcePath);
    if (!canRead) {
      return fail(`Permission denied: cannot read from ${input.source}`);
    }

    // Check write permission for destination
    const canWrite = await ctx.checkPermission("write", destPath);
    if (!canWrite) {
      return fail(`Permission denied: cannot write to ${input.destination}`);
    }

    try {
      // Check if source exists
      let sourceStats: Stats | undefined;
      try {
        sourceStats = await stat(sourcePath);
      } catch {
        return fail(`Source does not exist: ${input.source}`);
      }

      // Check if destination exists
      let overwritten = false;
      try {
        await stat(destPath);
        if (!input.overwrite) {
          return fail(
            `Destination already exists: ${input.destination}. Use overwrite: true to replace.`
          );
        }
        overwritten = true;
      } catch {
        // Destination doesn't exist, proceed with copy
      }

      // Create parent directory if needed
      await mkdir(dirname(destPath), { recursive: true });

      // Perform the copy
      const isDirectory = sourceStats.isDirectory();

      if (isDirectory && !input.recursive) {
        return fail(
          `Source is a directory: ${input.source}. Use recursive: true to copy directories.`
        );
      }

      await cp(sourcePath, destPath, {
        recursive: input.recursive,
        force: input.overwrite,
      });

      return ok({
        source: sourcePath,
        destination: destPath,
        overwritten,
        recursive: isDirectory && input.recursive,
      });
    } catch (error) {
      if (error instanceof Error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code === "EACCES") {
          return fail(`Access denied: ${input.source} or ${input.destination}`);
        }
        if (nodeError.code === "ENOSPC") {
          return fail("No space left on device");
        }
        return fail(`Failed to copy: ${error.message}`);
      }
      return fail(`Failed to copy: ${String(error)}`);
    }
  },
});

// =============================================================================
// delete_file Tool
// =============================================================================

/**
 * Schema for delete_file tool parameters
 */
export const deleteFileParamsSchema = z.object({
  /** Path to delete */
  path: z.string().describe("Path to delete"),
  /** Delete directories recursively (default: false) */
  recursive: z.boolean().optional().default(false).describe("Delete directories recursively"),
  /** Ignore nonexistent files (default: false) */
  force: z.boolean().optional().default(false).describe("Ignore nonexistent files"),
});

/** Inferred type for delete_file parameters */
export type DeleteFileParams = z.infer<typeof deleteFileParamsSchema>;

/** Output type for delete_file tool */
export interface DeleteFileOutput {
  /** The resolved path that was deleted */
  path: string;
  /** Whether the target existed before deletion */
  existed: boolean;
}

/**
 * Delete a file or directory.
 *
 * @example
 * ```typescript
 * const result = await deleteFileTool.execute(
 *   { path: "temp/", recursive: true },
 *   ctx
 * );
 * ```
 */
export const deleteFileTool = defineTool({
  name: "delete_file",
  description: "Delete a file or directory",
  parameters: deleteFileParamsSchema,
  kind: "write",
  category: "filesystem",

  async execute(input, ctx) {
    if (ctx.abortSignal.aborted) {
      return fail("Operation was cancelled");
    }

    // Validate path
    const pathResult = validatePath(input.path, ctx.workingDir);
    if (!pathResult.valid) {
      return fail(pathResult.error ?? "Path traversal not allowed");
    }

    const targetPath = pathResult.sanitizedPath;

    // Check write permission (delete is a write operation)
    const canWrite = await ctx.checkPermission("write", targetPath);
    if (!canWrite) {
      return fail(`Permission denied: cannot delete ${input.path}`);
    }

    try {
      // Check if target exists
      let existed = true;
      let targetStats: Stats | undefined;
      try {
        targetStats = await stat(targetPath);
      } catch {
        existed = false;
        if (!input.force) {
          return fail(`Path does not exist: ${input.path}`);
        }
        // force=true, return success even if doesn't exist
        return ok({
          path: targetPath,
          existed: false,
        });
      }

      // Check if it's a directory and recursive flag
      if (targetStats.isDirectory() && !input.recursive) {
        return fail(
          `Path is a directory: ${input.path}. Use recursive: true to delete directories.`
        );
      }

      // Perform the deletion
      await rm(targetPath, {
        recursive: input.recursive,
        force: input.force,
      });

      return ok({
        path: targetPath,
        existed,
      });
    } catch (error) {
      if (error instanceof Error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code === "EACCES") {
          return fail(`Access denied: ${input.path}`);
        }
        if (nodeError.code === "EBUSY") {
          return fail(`Resource busy or locked: ${input.path}`);
        }
        if (nodeError.code === "EPERM") {
          return fail(`Operation not permitted: ${input.path}`);
        }
        return fail(`Failed to delete: ${error.message}`);
      }
      return fail(`Failed to delete: ${String(error)}`);
    }
  },
});

// =============================================================================
// create_directory Tool
// =============================================================================

/**
 * Schema for create_directory tool parameters
 */
export const createDirectoryParamsSchema = z.object({
  /** Directory path to create */
  path: z.string().describe("Directory path to create"),
  /** Create parent directories if needed (default: true) */
  recursive: z.boolean().optional().default(true).describe("Create parent directories if needed"),
});

/** Inferred type for create_directory parameters */
export type CreateDirectoryParams = z.infer<typeof createDirectoryParamsSchema>;

/** Output type for create_directory tool */
export interface CreateDirectoryOutput {
  /** The resolved path that was created */
  path: string;
  /** Whether the directory was newly created (false if already existed) */
  created: boolean;
}

/**
 * Create a directory.
 *
 * @example
 * ```typescript
 * const result = await createDirectoryTool.execute(
 *   { path: "src/components/ui", recursive: true },
 *   ctx
 * );
 * ```
 */
export const createDirectoryTool = defineTool({
  name: "create_directory",
  description: "Create a directory",
  parameters: createDirectoryParamsSchema,
  kind: "write",
  category: "filesystem",

  async execute(input, ctx) {
    if (ctx.abortSignal.aborted) {
      return fail("Operation was cancelled");
    }

    // Validate path
    const pathResult = validatePath(input.path, ctx.workingDir);
    if (!pathResult.valid) {
      return fail(pathResult.error ?? "Path traversal not allowed");
    }

    const targetPath = pathResult.sanitizedPath;

    // Check write permission
    const canWrite = await ctx.checkPermission("write", targetPath);
    if (!canWrite) {
      return fail(`Permission denied: cannot create ${input.path}`);
    }

    try {
      // Check if already exists
      let created = true;
      try {
        const targetStats = await stat(targetPath);
        if (targetStats.isDirectory()) {
          // Directory already exists, that's fine
          created = false;
        } else {
          // Path exists but is not a directory
          return fail(`Path exists but is not a directory: ${input.path}`);
        }
      } catch {
        // Doesn't exist, will create
      }

      if (created) {
        await mkdir(targetPath, { recursive: input.recursive });
      }

      return ok({
        path: targetPath,
        created,
      });
    } catch (error) {
      if (error instanceof Error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code === "EACCES") {
          return fail(`Access denied: ${input.path}`);
        }
        if (nodeError.code === "EEXIST" && !input.recursive) {
          return fail(`Parent directory missing: ${input.path}. Use recursive: true.`);
        }
        if (nodeError.code === "ENOSPC") {
          return fail("No space left on device");
        }
        if (nodeError.code === "ENOTDIR") {
          return fail(`A component of the path is not a directory: ${input.path}`);
        }
        return fail(`Failed to create directory: ${error.message}`);
      }
      return fail(`Failed to create directory: ${String(error)}`);
    }
  },
});

// =============================================================================
// Registration Helper
// =============================================================================

import type { ToolRegistry } from "../tool/registry.js";

/**
 * All file management tools available for registration.
 */
export const FILE_MANAGEMENT_TOOLS = [
  moveFileTool,
  copyFileTool,
  deleteFileTool,
  createDirectoryTool,
] as const;

/**
 * Register all file management tools with a ToolRegistry.
 *
 * @param registry - The ToolRegistry to register tools with
 * @returns The number of tools registered
 *
 * @example
 * ```typescript
 * import { createToolRegistry } from "@vellum/core";
 * import { registerFileManagementTools } from "@vellum/core/builtin";
 *
 * const registry = createToolRegistry();
 * registerFileManagementTools(registry);
 * ```
 */
export function registerFileManagementTools(registry: ToolRegistry): number {
  for (const tool of FILE_MANAGEMENT_TOOLS) {
    registry.register(tool);
  }
  return FILE_MANAGEMENT_TOOLS.length;
}
