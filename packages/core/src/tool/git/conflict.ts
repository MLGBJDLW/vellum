// ============================================
// Git Conflict Tools - T013
// ============================================

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { z } from "zod";

import { defineTool, fail, ok, type ToolContext, type ToolResult } from "../../types/tool.js";
import { createGitOps } from "./utils.js";

// =============================================================================
// Common Types
// =============================================================================

/**
 * Extended tool context with optional snapshot service.
 */
interface ExtendedToolContext extends ToolContext {
  snapshotService?: { track: () => Promise<void> };
}

/**
 * Call snapshot service if available (for write operations).
 * Failures are logged but don't block the operation.
 */
async function trackSnapshot(ctx: ToolContext): Promise<void> {
  const extCtx = ctx as unknown as ExtendedToolContext;
  try {
    await extCtx.snapshotService?.track();
  } catch (snapshotError) {
    console.warn("Snapshot tracking failed:", snapshotError);
  }
}

// =============================================================================
// Conflict Info Schemas and Types
// =============================================================================

/**
 * Input schema for git_conflict_info tool.
 */
export const GitConflictInfoInputSchema = z.object({
  cwd: z.string().optional().describe("Working directory, defaults to current"),
});

export type GitConflictInfoInput = z.infer<typeof GitConflictInfoInputSchema>;

/**
 * Conflict section for a single file.
 */
export interface ConflictFile {
  /** Path to the conflicted file */
  path: string;
  /** Content from ours (current branch) */
  oursContent?: string;
  /** Content from theirs (merging branch) */
  theirsContent?: string;
  /** Raw conflict markers section */
  markers: string;
}

/**
 * Result of git_conflict_info operation.
 */
export interface GitConflictInfoResult {
  /** Whether there are any conflicts */
  hasConflicts: boolean;
  /** List of files with conflicts */
  files: ConflictFile[];
}

// =============================================================================
// Resolve Conflict Schemas and Types
// =============================================================================

/**
 * Input schema for git_resolve_conflict tool.
 */
export const GitResolveConflictInputSchema = z.object({
  path: z.string().describe("Path to conflicted file"),
  strategy: z.enum(["ours", "theirs", "content"]).describe("Resolution strategy"),
  content: z.string().optional().describe("Content for strategy=content"),
  cwd: z.string().optional().describe("Working directory, defaults to current"),
});

export type GitResolveConflictInput = z.infer<typeof GitResolveConflictInputSchema>;

/**
 * Result of git_resolve_conflict operation.
 */
export interface GitResolveConflictResult {
  /** Whether resolution was successful */
  resolved: boolean;
  /** Resolved file path */
  path: string;
  /** Strategy used */
  strategy: "ours" | "theirs" | "content";
  /** Whether user confirmation should be requested */
  shouldConfirm?: boolean;
  /** Message to show for confirmation */
  confirmMessage?: string;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Parse git status output to find conflicted files.
 *
 * @param output - Raw output from git status --porcelain
 * @returns List of conflicting file paths
 */
export function parseConflictedFiles(output: string): string[] {
  const conflicts: string[] = [];
  const lines = output.split("\n").filter((line) => line.trim().length > 0);

  for (const line of lines) {
    // Conflict markers: UU (both modified), AA (both added), DD (both deleted)
    // Also AU, UA, DU, UD for various conflict states
    const status = line.slice(0, 2);
    if (status.includes("U") || status === "AA" || status === "DD") {
      conflicts.push(line.slice(3).trim());
    }
  }

  return conflicts;
}

/**
 * Extract conflict markers section from file content.
 *
 * @param content - Full file content
 * @returns Object with markers string and parsed ours/theirs content
 */
export function extractConflictMarkers(content: string): {
  markers: string;
  oursContent?: string;
  theirsContent?: string;
} {
  // Match conflict sections: <<<<<<< ... ======= ... >>>>>>>
  const conflictRegex = /(<<<<<<<[^\n]*\n)([\s\S]*?)(=======\n)([\s\S]*?)(>>>>>>>[^\n]*)/g;
  const markers: string[] = [];
  let oursContent = "";
  let theirsContent = "";

  let match: RegExpExecArray | null = conflictRegex.exec(content);
  while (match !== null) {
    markers.push(match[0]);
    oursContent += match[2];
    theirsContent += match[4];
    match = conflictRegex.exec(content);
  }

  if (markers.length === 0) {
    return { markers: "" };
  }

  return {
    markers: markers.join("\n---\n"),
    oursContent: oursContent.trim(),
    theirsContent: theirsContent.trim(),
  };
}

// =============================================================================
// Git Conflict Info Tool Definition
// =============================================================================

/**
 * Git conflict info tool.
 *
 * Lists files with merge conflicts and shows conflict markers.
 */
export const gitConflictInfoTool = defineTool({
  name: "git_conflict_info",
  description:
    "List files with merge conflicts and show conflict markers with ours/theirs content.",
  parameters: GitConflictInfoInputSchema,
  kind: "read",
  category: "git",

  async execute(input, ctx): Promise<ToolResult<GitConflictInfoResult>> {
    const cwd = input.cwd ?? ctx.workingDir;
    const git = createGitOps(cwd);
    // Get list of conflicted files
    const statusResult = await git.exec(["status", "--porcelain"], { signal: ctx.abortSignal });

    if (statusResult.exitCode !== 0) {
      if (statusResult.stderr.includes("not a git repository")) {
        return fail(`Not a git repository: ${cwd}`);
      }
      return fail(`Failed to get status: ${statusResult.stderr}`);
    }

    const conflictedPaths = parseConflictedFiles(statusResult.stdout);

    if (conflictedPaths.length === 0) {
      return ok({
        hasConflicts: false,
        files: [],
      });
    }

    // Read each conflicted file and extract markers
    const files: ConflictFile[] = [];

    for (const filePath of conflictedPaths) {
      try {
        const fullPath = resolve(cwd, filePath);
        const content = await readFile(fullPath, "utf-8");
        const { markers, oursContent, theirsContent } = extractConflictMarkers(content);

        files.push({
          path: filePath,
          oursContent,
          theirsContent,
          markers,
        });
      } catch {
        // File might be deleted in one side of conflict
        files.push({
          path: filePath,
          markers: "(file not readable - may be deleted in conflict)",
        });
      }
    }

    return ok({
      hasConflicts: true,
      files,
    });
  },
});

// =============================================================================
// Git Resolve Conflict Tool Definition
// =============================================================================

/**
 * Git resolve conflict tool.
 *
 * Resolves merge conflicts using specified strategy.
 */
export const gitResolveConflictTool = defineTool({
  name: "git_resolve_conflict",
  description:
    "Resolve a merge conflict in a file using ours/theirs strategy or custom content. Stages the resolved file.",
  parameters: GitResolveConflictInputSchema,
  kind: "write",
  category: "git",

  shouldConfirm(_input): boolean {
    // Always confirm conflict resolution
    return true;
  },

  async execute(input, ctx): Promise<ToolResult<GitResolveConflictResult>> {
    const cwd = input.cwd ?? ctx.workingDir;
    const git = createGitOps(cwd);

    // Validate content is provided for content strategy
    if (input.strategy === "content" && !input.content) {
      return fail("Content is required when using 'content' strategy");
    }
    // Track snapshot before write
    await trackSnapshot(ctx);

    switch (input.strategy) {
      case "ours": {
        // Use our version
        const checkoutResult = await git.exec(["checkout", "--ours", input.path], {
          signal: ctx.abortSignal,
        });

        if (checkoutResult.exitCode !== 0) {
          return fail(`Failed to checkout ours: ${checkoutResult.stderr}`);
        }
        break;
      }

      case "theirs": {
        // Use their version
        const checkoutResult = await git.exec(["checkout", "--theirs", input.path], {
          signal: ctx.abortSignal,
        });

        if (checkoutResult.exitCode !== 0) {
          return fail(`Failed to checkout theirs: ${checkoutResult.stderr}`);
        }
        break;
      }

      case "content": {
        // Write custom content
        const fullPath = resolve(cwd, input.path);
        await writeFile(fullPath, input.content!, "utf-8");
        break;
      }
    }

    // Stage the resolved file
    const addResult = await git.exec(["add", input.path], { signal: ctx.abortSignal });

    if (addResult.exitCode !== 0) {
      return fail(`Failed to stage resolved file: ${addResult.stderr}`);
    }

    return ok({
      resolved: true,
      path: input.path,
      strategy: input.strategy,
      shouldConfirm: true,
      confirmMessage: `Resolve conflict in '${input.path}' using '${input.strategy}' strategy?`,
    });
  },
});

// =============================================================================
// Factory Exports (for testing with custom git ops)
// =============================================================================

/**
 * Create a git conflict info tool with custom git operations.
 * Useful for testing with mocked git commands.
 *
 * @param gitOpsFactory - Factory function to create git operations
 * @param fsOps - Optional file system operations for testing
 * @returns Configured git conflict info tool
 */
export function createGitConflictInfoTool(
  gitOpsFactory: typeof createGitOps = createGitOps,
  fsOps: { readFile: typeof readFile } = { readFile }
) {
  return defineTool({
    name: "git_conflict_info",
    description:
      "List files with merge conflicts and show conflict markers with ours/theirs content.",
    parameters: GitConflictInfoInputSchema,
    kind: "read",
    category: "git",

    async execute(input, ctx): Promise<ToolResult<GitConflictInfoResult>> {
      const cwd = input.cwd ?? ctx.workingDir;
      const git = gitOpsFactory(cwd);
      const statusResult = await git.exec(["status", "--porcelain"], { signal: ctx.abortSignal });

      if (statusResult.exitCode !== 0) {
        if (statusResult.stderr.includes("not a git repository")) {
          return fail(`Not a git repository: ${cwd}`);
        }
        return fail(`Failed to get status: ${statusResult.stderr}`);
      }

      const conflictedPaths = parseConflictedFiles(statusResult.stdout);

      if (conflictedPaths.length === 0) {
        return ok({
          hasConflicts: false,
          files: [],
        });
      }

      const files: ConflictFile[] = [];

      for (const filePath of conflictedPaths) {
        try {
          const fullPath = resolve(cwd, filePath);
          const content = await fsOps.readFile(fullPath, "utf-8");
          const { markers, oursContent, theirsContent } = extractConflictMarkers(content as string);

          files.push({
            path: filePath,
            oursContent,
            theirsContent,
            markers,
          });
        } catch {
          files.push({
            path: filePath,
            markers: "(file not readable - may be deleted in conflict)",
          });
        }
      }

      return ok({
        hasConflicts: true,
        files,
      });
    },
  });
}

/**
 * Create a git resolve conflict tool with custom git operations.
 * Useful for testing with mocked git commands.
 *
 * @param gitOpsFactory - Factory function to create git operations
 * @param fsOps - Optional file system operations for testing
 * @returns Configured git resolve conflict tool
 */
export function createGitResolveConflictTool(
  gitOpsFactory: typeof createGitOps = createGitOps,
  fsOps: { writeFile: typeof writeFile } = { writeFile }
) {
  return defineTool({
    name: "git_resolve_conflict",
    description:
      "Resolve a merge conflict in a file using ours/theirs strategy or custom content. Stages the resolved file.",
    parameters: GitResolveConflictInputSchema,
    kind: "write",
    category: "git",

    shouldConfirm(_input): boolean {
      return true;
    },

    async execute(input, ctx): Promise<ToolResult<GitResolveConflictResult>> {
      const cwd = input.cwd ?? ctx.workingDir;
      const git = gitOpsFactory(cwd);

      if (input.strategy === "content" && !input.content) {
        return fail("Content is required when using 'content' strategy");
      }
      await trackSnapshot(ctx);

      switch (input.strategy) {
        case "ours": {
          const checkoutResult = await git.exec(["checkout", "--ours", input.path], {
            signal: ctx.abortSignal,
          });

          if (checkoutResult.exitCode !== 0) {
            return fail(`Failed to checkout ours: ${checkoutResult.stderr}`);
          }
          break;
        }

        case "theirs": {
          const checkoutResult = await git.exec(["checkout", "--theirs", input.path], {
            signal: ctx.abortSignal,
          });

          if (checkoutResult.exitCode !== 0) {
            return fail(`Failed to checkout theirs: ${checkoutResult.stderr}`);
          }
          break;
        }

        case "content": {
          const fullPath = resolve(cwd, input.path);
          await fsOps.writeFile(fullPath, input.content!, "utf-8");
          break;
        }
      }

      const addResult = await git.exec(["add", input.path], { signal: ctx.abortSignal });

      if (addResult.exitCode !== 0) {
        return fail(`Failed to stage resolved file: ${addResult.stderr}`);
      }

      return ok({
        resolved: true,
        path: input.path,
        strategy: input.strategy,
        shouldConfirm: true,
        confirmMessage: `Resolve conflict in '${input.path}' using '${input.strategy}' strategy?`,
      });
    },
  });
}
