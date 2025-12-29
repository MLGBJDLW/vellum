// ============================================
// Git Tool - Barrel Export
// ============================================

import type { z } from "zod";

import type { Tool } from "../../types/tool.js";
import type { ToolRegistry } from "../registry.js";

// Error factories
export {
  gitBranchExistsError,
  gitBranchNotFoundError,
  gitConflictError,
  gitDirtyWorkdirError,
  gitNoStagedChangesError,
  gitRemoteError,
  gitStashEmptyError,
  gitTimeoutError,
} from "./errors.js";
// Types and constants
export {
  BranchNameSchema,
  FilePathSchema,
  GIT_TIMEOUTS,
  type GitExecOptions,
  type GitExecResult,
  type GitToolContext,
  MAX_OUTPUT_LINES,
  TRUNCATION_MARKER,
} from "./types.js";

// Utility functions
export {
  createGitOps,
  truncateOutput,
  validatePath,
  withTimeout as gitWithTimeout,
} from "./utils.js";

// =============================================================================
// Read Tools (Phase 1)
// =============================================================================

// git_diff tool
export {
  countFilesChanged,
  createGitDiffTool,
  type DiffHunk as GitToolDiffHunk,
  type GitDiffInput,
  GitDiffInputSchema,
  type GitDiffResult,
  gitDiffTool,
  parseDiffOutput,
} from "./diff.js";
// git_log tool
export {
  createGitLogTool,
  type GitLogCommit,
  type GitLogInput,
  GitLogInputSchema,
  type GitLogResult,
  gitLogTool,
  parseLogOutput,
} from "./log.js";
// git_status tool
export {
  createGitStatusTool,
  type GitStatusInput,
  GitStatusInputSchema,
  type GitStatusResult,
  gitStatusTool,
  parseBranchOutput,
  parseStatusOutput,
} from "./status.js";

// =============================================================================
// Write Tools (Phase 2)
// =============================================================================

// git_branch, git_checkout, git_merge tools
export {
  createGitBranchTool,
  createGitCheckoutTool,
  createGitMergeTool,
  type GitBranchInfo,
  type GitBranchInput,
  GitBranchInputSchema,
  type GitBranchListResult,
  type GitBranchMutateResult,
  type GitBranchResult,
  type GitCheckoutInput,
  GitCheckoutInputSchema,
  type GitCheckoutResult,
  type GitMergeInput,
  GitMergeInputSchema,
  type GitMergeResult,
  gitBranchTool,
  gitCheckoutTool,
  gitMergeTool,
  parseBranchListOutput,
  parseConflictFiles,
} from "./branch.js";
// git_commit tool
export {
  createGitCommitTool,
  type GitCommitInput,
  GitCommitInputSchema,
  type GitCommitResult,
  gitCommitTool,
} from "./commit.js";

// =============================================================================
// Conflict + Stash Tools (Phase 3)
// =============================================================================

// git_conflict_info, git_resolve_conflict tools
export {
  type ConflictFile,
  createGitConflictInfoTool,
  createGitResolveConflictTool,
  extractConflictMarkers,
  type GitConflictInfoInput,
  GitConflictInfoInputSchema,
  type GitConflictInfoResult,
  type GitResolveConflictInput,
  GitResolveConflictInputSchema,
  type GitResolveConflictResult,
  gitConflictInfoTool,
  gitResolveConflictTool,
  parseConflictedFiles,
} from "./conflict.js";

// git_stash tool
export {
  createGitStashTool,
  type GitStashApplyResult,
  type GitStashClearResult,
  type GitStashDropResult,
  type GitStashEntry,
  type GitStashInput,
  GitStashInputSchema,
  type GitStashListResult,
  type GitStashPushResult,
  type GitStashResult,
  gitStashTool,
  parseStashListOutput,
} from "./stash.js";

// =============================================================================
// Network Tools (Phase 4)
// =============================================================================

// git_fetch, git_pull, git_push, git_remote tools
export {
  createGitFetchTool,
  createGitPullTool,
  createGitPushTool,
  createGitRemoteTool,
  type GitFetchInput,
  GitFetchInputSchema,
  type GitFetchResult,
  type GitPullInput,
  GitPullInputSchema,
  type GitPullResult,
  type GitPushInput,
  GitPushInputSchema,
  type GitPushResult,
  type GitRemoteEntry,
  type GitRemoteInput,
  GitRemoteInputSchema,
  type GitRemoteListResult,
  type GitRemoteMutateResult,
  type GitRemoteResult,
  gitFetchTool,
  gitPullTool,
  gitPushTool,
  gitRemoteTool,
  parseConflictFilesFromOutput,
  parseFilesUpdated,
  parseRemoteVerboseOutput,
} from "./remote.js";

// =============================================================================
// PR Tools (Phase 5)
// =============================================================================

// git_generate_pr tool
export {
  createGitGeneratePrTool,
  type GeneratedPR,
  type GitGeneratePrInput,
  GitGeneratePrInputSchema,
  generatePrBody,
  generatePrTitle,
  gitGeneratePrTool,
  type PrCommit,
  parseChangedFiles,
  parsePrLogOutput,
} from "./pr.js";

// =============================================================================
// Tool Imports for Registration
// =============================================================================

import { gitBranchTool, gitCheckoutTool, gitMergeTool } from "./branch.js";
import { gitCommitTool } from "./commit.js";
import { gitConflictInfoTool, gitResolveConflictTool } from "./conflict.js";
import { gitDiffTool } from "./diff.js";
import { gitLogTool } from "./log.js";
import { gitGeneratePrTool } from "./pr.js";
import { gitFetchTool, gitPullTool, gitPushTool, gitRemoteTool } from "./remote.js";
import { gitStashTool } from "./stash.js";
import { gitStatusTool } from "./status.js";

// =============================================================================
// Tool Array and Registration
// =============================================================================

/**
 * Array of all git tools for bulk registration.
 *
 * Contains all 15 git tools:
 * - Read: git_status, git_diff, git_log
 * - Write: git_commit, git_branch, git_checkout, git_merge
 * - Conflict/Stash: git_conflict_info, git_resolve_conflict, git_stash
 * - Network: git_fetch, git_pull, git_push, git_remote
 * - PR: git_generate_pr
 */
// biome-ignore lint/suspicious/noExplicitAny: Tools have varying input/output types
export const gitTools: readonly Tool<z.ZodType, any>[] = [
  gitStatusTool,
  gitDiffTool,
  gitLogTool,
  gitCommitTool,
  gitBranchTool,
  gitCheckoutTool,
  gitMergeTool,
  gitConflictInfoTool,
  gitResolveConflictTool,
  gitStashTool,
  gitFetchTool,
  gitPullTool,
  gitPushTool,
  gitRemoteTool,
  gitGeneratePrTool,
] as const;

/**
 * Register all git tools with a tool registry.
 *
 * Registers all 15 git tools:
 * - git_status, git_diff, git_log (read)
 * - git_commit, git_branch, git_checkout, git_merge (write)
 * - git_conflict_info, git_resolve_conflict, git_stash (conflict/stash)
 * - git_fetch, git_pull, git_push, git_remote (network)
 * - git_generate_pr (PR)
 *
 * @param registry - Tool registry to register tools with
 */
export function registerGitTools(registry: ToolRegistry): void {
  for (const tool of gitTools) {
    registry.register(tool);
  }
}
