/**
 * List Directory Tool
 *
 * Lists directory contents with optional recursion and hidden file support.
 *
 * @module builtin/list-dir
 */

import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import picomatch from "picomatch";
import { z } from "zod";

import { ProtectedFilesManager } from "../permission/index.js";
import { defineTool, fail, ok } from "../types/index.js";
import { validatePath } from "./utils/index.js";

/** Singleton protected files manager for checking file protection status */
const protectedFilesManager = new ProtectedFilesManager();

/** Default maximum recursion depth */
const DEFAULT_MAX_DEPTH = 3;

/**
 * Schema for list_dir tool parameters
 */
export const listDirParamsSchema = z.object({
  /** Directory path to list */
  path: z.string().describe("The path to the directory to list"),
  /** Include subdirectories recursively (default: false) */
  recursive: z.boolean().optional().default(false).describe("Include subdirectories recursively"),
  /** Include hidden files (dotfiles) (default: false) */
  includeHidden: z
    .boolean()
    .optional()
    .default(false)
    .describe("Include hidden files and directories (dotfiles)"),
  /** Maximum recursion depth (default: 3) */
  maxDepth: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .default(DEFAULT_MAX_DEPTH)
    .describe("Maximum recursion depth (1-10, default: 3)"),
  /** Glob patterns to ignore */
  ignorePatterns: z
    .array(z.string())
    .optional()
    .describe("Glob patterns to ignore, e.g., ['node_modules', '*.log', '.git']"),
  /** Output format */
  format: z
    .enum(["flat", "tree"])
    .optional()
    .default("flat")
    .describe("Output format: 'flat' (default list) or 'tree' (hierarchical tree view)"),
});

/** Inferred type for list_dir parameters */
export type ListDirParams = z.infer<typeof listDirParamsSchema>;

/** Entry type in directory listing */
export interface DirEntry {
  /** Entry name */
  name: string;
  /** Entry type: 'file' or 'directory' */
  type: "file" | "directory";
  /** File size in bytes (only for files) */
  size?: number;
  /** Last modified timestamp (ISO 8601) */
  modifiedAt?: string;
  /** Relative path from the listed directory */
  relativePath: string;
  /** Whether this file matches protected patterns (sensitive files) */
  isProtected?: boolean;
}

/** Output type for list_dir tool */
export interface ListDirOutput {
  /** The resolved directory path */
  path: string;
  /** Array of directory entries */
  entries: DirEntry[];
  /** Total number of files found */
  fileCount: number;
  /** Total number of directories found */
  dirCount: number;
  /** Whether the listing was truncated (for very large directories) */
  truncated: boolean;
  /** Whether any protected files were found in the listing */
  hasProtectedFiles: boolean;
  /** Tree format output string (only when format="tree") */
  tree?: string;
}

/** Maximum entries to return (to prevent memory issues) */
const MAX_ENTRIES = 1000;

/**
 * Check if a filename is hidden (starts with a dot)
 */
function isHidden(name: string): boolean {
  return name.startsWith(".");
}

/**
 * Check if a path matches any ignore pattern
 */
function shouldIgnore(
  name: string,
  relativePath: string,
  ignoreMatcher: picomatch.Matcher | null
): boolean {
  if (!ignoreMatcher) return false;
  // Match against both the name and the relative path
  return ignoreMatcher(name) || ignoreMatcher(relativePath);
}

/**
 * Generate ASCII tree representation of directory entries
 */
function generateTree(entries: DirEntry[], basePath: string): string {
  // Build a hierarchical structure
  interface TreeNode {
    name: string;
    type: "file" | "directory";
    children: Map<string, TreeNode>;
  }

  const root: TreeNode = { name: basePath, type: "directory", children: new Map() };

  // Sort entries by relativePath to ensure proper tree building
  const sortedEntries = [...entries].sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  for (const entry of sortedEntries) {
    const parts = entry.relativePath.split(/[\\/]/);
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i] as string;
      const isLast = i === parts.length - 1;

      if (!current.children.has(part)) {
        current.children.set(part, {
          name: part,
          type: isLast ? entry.type : "directory",
          children: new Map(),
        });
      }
      current = current.children.get(part) as TreeNode;
    }
  }

  // Render tree to string
  const lines: string[] = [];

  function renderNode(node: TreeNode, prefix: string, isLast: boolean, isRoot: boolean): void {
    if (!isRoot) {
      const connector = isLast ? "└── " : "├── ";
      const displayName = node.type === "directory" ? `${node.name}/` : node.name;
      lines.push(`${prefix}${connector}${displayName}`);
    }

    const children = Array.from(node.children.values()).sort((a, b) => {
      // Directories first, then alphabetically
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    const childPrefix = isRoot ? "" : prefix + (isLast ? "    " : "│   ");

    children.forEach((child, index) => {
      const isLastChild = index === children.length - 1;
      renderNode(child, childPrefix, isLastChild, false);
    });
  }

  // Start rendering from root's children
  const rootChildren = Array.from(root.children.values()).sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  rootChildren.forEach((child, index) => {
    const isLastChild = index === rootChildren.length - 1;
    renderNode(child, "", isLastChild, false);
  });

  return lines.join("\n");
}

/**
 * Recursively list directory contents
 */
async function listDirectory(
  basePath: string,
  currentPath: string,
  options: {
    recursive: boolean;
    includeHidden: boolean;
    maxDepth: number;
    ignoreMatcher: picomatch.Matcher | null;
  },
  currentDepth: number,
  entries: DirEntry[],
  abortSignal: AbortSignal
): Promise<void> {
  // Check for cancellation
  if (abortSignal.aborted) {
    return;
  }

  // Check max entries
  if (entries.length >= MAX_ENTRIES) {
    return;
  }

  // Check depth limit
  if (currentDepth > options.maxDepth) {
    return;
  }

  const fullPath = resolve(basePath, currentPath);
  let dirEntries: string[];

  try {
    dirEntries = await readdir(fullPath);
  } catch {
    // Skip directories we can't read
    return;
  }

  for (const name of dirEntries) {
    // Check for cancellation
    if (abortSignal.aborted || entries.length >= MAX_ENTRIES) {
      return;
    }

    // Skip hidden files if not requested
    if (!options.includeHidden && isHidden(name)) {
      continue;
    }

    const entryPath = join(fullPath, name);
    const relativePath = currentPath ? join(currentPath, name) : name;

    // Skip entries matching ignore patterns
    if (shouldIgnore(name, relativePath, options.ignoreMatcher)) {
      continue;
    }

    try {
      const stats = await stat(entryPath);
      const isDirectory = stats.isDirectory();

      // Check if file is protected (matches sensitive file patterns)
      const isProtected = !isDirectory && protectedFilesManager.isProtected(entryPath);

      const entry: DirEntry = {
        name,
        type: isDirectory ? "directory" : "file",
        relativePath,
        ...(isProtected && { isProtected: true }),
      };

      if (!isDirectory) {
        entry.size = stats.size;
      }
      entry.modifiedAt = stats.mtime.toISOString();

      entries.push(entry);

      // Recurse into subdirectories
      if (isDirectory && options.recursive && currentDepth < options.maxDepth) {
        await listDirectory(
          basePath,
          relativePath,
          options,
          currentDepth + 1,
          entries,
          abortSignal
        );
      }
    } catch {}
  }
}

/**
 * List directory tool implementation
 *
 * Lists directory contents with optional recursion, hidden file inclusion,
 * and depth limiting.
 *
 * @example
 * ```typescript
 * // List current directory
 * const result = await listDirTool.execute(
 *   { path: "." },
 *   ctx
 * );
 *
 * // Recursive listing with hidden files
 * const result = await listDirTool.execute(
 *   { path: "src", recursive: true, includeHidden: true, maxDepth: 5 },
 *   ctx
 * );
 * ```
 */
export const listDirTool = defineTool({
  name: "list_dir",
  description:
    "List the contents of a directory. Optionally include subdirectories recursively, hidden files, ignore patterns, and tree format output.",
  parameters: listDirParamsSchema,
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
      // Verify it's a directory
      const stats = await stat(resolvedPath);
      if (!stats.isDirectory()) {
        return fail(`Path is not a directory: ${input.path}`);
      }

      const entries: DirEntry[] = [];

      // Create ignore pattern matcher if patterns provided
      const ignoreMatcher =
        input.ignorePatterns && input.ignorePatterns.length > 0
          ? picomatch(input.ignorePatterns, { dot: true })
          : null;

      await listDirectory(
        resolvedPath,
        "",
        {
          recursive: input.recursive,
          includeHidden: input.includeHidden,
          maxDepth: input.maxDepth,
          ignoreMatcher,
        },
        1,
        entries,
        ctx.abortSignal
      );

      // Sort entries: directories first, then alphabetically
      entries.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === "directory" ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

      const fileCount = entries.filter((e) => e.type === "file").length;
      const dirCount = entries.filter((e) => e.type === "directory").length;
      const hasProtectedFiles = entries.some((e) => e.isProtected === true);

      // Generate tree output if requested
      const tree = input.format === "tree" ? generateTree(entries, input.path) : undefined;

      return ok({
        path: resolvedPath,
        entries,
        fileCount,
        dirCount,
        truncated: entries.length >= MAX_ENTRIES,
        hasProtectedFiles,
        ...(tree !== undefined && { tree }),
      });
    } catch (error) {
      if (error instanceof Error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code === "ENOENT") {
          return fail(`Directory not found: ${input.path}`);
        }
        if (nodeError.code === "EACCES") {
          return fail(`Access denied: ${input.path}`);
        }
        return fail(`Failed to list directory: ${error.message}`);
      }
      return fail("Unknown error occurred while listing directory");
    }
  },

  shouldConfirm(_input, _ctx) {
    // Read operations don't need confirmation
    return false;
  },
});
