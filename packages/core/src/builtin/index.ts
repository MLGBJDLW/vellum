/**
 * Builtin Tools
 *
 * Core builtin tools for file operations, shell execution,
 * search, and agent control.
 *
 * @module builtin
 */

export {
  type ApplyDiffOutput,
  type ApplyDiffParams,
  applyDiffParamsSchema,
  applyDiffTool,
  applyHunk,
  type DiffHunk,
  parseUnifiedDiff,
} from "./apply-diff.js";
export {
  type ApplyPatchOutput,
  type ApplyPatchParams,
  applyPatchBlock,
  applyPatchParamsSchema,
  applyPatchTool,
  type PatchBlock,
  type PatchBlockResult,
  parseCodexPatch,
} from "./apply-patch.js";
export {
  type AskFollowupQuestionOutput,
  type AskFollowupQuestionParams,
  askFollowupQuestionParamsSchema,
  askFollowupQuestionTool,
  type UserPromptSignal,
} from "./ask-followup.js";
// Agent control tools
export {
  type AttemptCompletionOutput,
  type AttemptCompletionParams,
  attemptCompletionParamsSchema,
  attemptCompletionTool,
} from "./attempt-completion.js";
// Shell execution tools
export {
  type BashOutput,
  type BashParams,
  bashParamsSchema,
  bashTool,
} from "./bash.js";
// Batch tool execution
export {
  type BatchOperationResult,
  type BatchOutput,
  type BatchParams,
  batchParamsSchema,
  batchTool,
  getBatchToolRegistry,
  setBatchToolRegistry,
} from "./batch.js";
// Browser automation tools
export {
  type BrowserOutput,
  type BrowserParams,
  browserParamsSchema,
  browserTool,
  cleanupBrowser,
} from "./browser.js";
// ============================================
// Phase 14: Cache Utilities
// ============================================
export {
  type CacheOptions,
  type CacheStats,
  createCacheKey,
  isCacheable,
  ResponseCache,
} from "./cache/response-cache.js";
export {
  type CodebaseSearchOutput,
  type CodebaseSearchParams,
  type CodebaseSearchResult,
  codebaseSearchParamsSchema,
  codebaseSearchTool,
} from "./codebase-search.js";
// Agent tools
export {
  type DelegateAgentOutput,
  type DelegateAgentParams,
  type DelegateAgentSignal,
  delegateAgentParamsSchema,
  delegateAgentTool,
} from "./delegate-agent.js";
// ============================================
// Phase 14: Documentation Lookup Tool
// ============================================
export {
  type DocLookupOutput,
  type DocLookupParams,
  type DocSource,
  DocSourceSchema,
  docLookupParamsSchema,
  docLookupTool,
} from "./doc-lookup.js";
// Example tools (for demonstration)
export { exampleReadFileTool, exampleWriteFileTool } from "./example-tools.js";
// File management tools (move, copy, delete, mkdir)
export {
  type CopyFileOutput,
  type CopyFileParams,
  type CreateDirectoryOutput,
  type CreateDirectoryParams,
  copyFileParamsSchema,
  copyFileTool,
  createDirectoryParamsSchema,
  createDirectoryTool,
  type DeleteFileOutput,
  type DeleteFileParams,
  deleteFileParamsSchema,
  deleteFileTool,
  FILE_MANAGEMENT_TOOLS,
  type MoveFileOutput,
  type MoveFileParams,
  moveFileParamsSchema,
  moveFileTool,
  registerFileManagementTools,
} from "./file-management.js";
// Glob pattern matching
export {
  type GlobOutput,
  type GlobParams,
  globParamsSchema,
  globTool,
} from "./glob.js";
// Insert at line tool
export {
  type InsertAtLineOutput,
  type InsertAtLineParams,
  insertAtLineParamsSchema,
  insertAtLineTool,
} from "./insert-at-line.js";
// Directory listing tool
export {
  type DirEntry,
  type ListDirOutput,
  type ListDirParams,
  listDirParamsSchema,
  listDirTool,
} from "./list-dir.js";
// Multi-edit tool
export {
  type EditOperation,
  type EditResult,
  type MultiEditOutput,
  type MultiEditParams,
  multiEditParamsSchema,
  multiEditTool,
} from "./multi-edit.js";
// File operation tools
export {
  type ReadFileOutput,
  type ReadFileParams,
  readFileParamsSchema,
  readFileTool,
} from "./read-file.js";
// Batch file reading
export {
  type FileReadResult,
  type ReadManyFilesOutput,
  type ReadManyFilesParams,
  readManyFilesParamsSchema,
  readManyFilesTool,
} from "./read-many-files.js";
export {
  type RecallMemoryOutput,
  type RecallMemoryParams,
  recallMemoryParamsSchema,
  recallMemoryTool,
} from "./recall-memory.js";
// Memory tools
export {
  type SavedMemoryEntry,
  type SaveMemoryOutput,
  type SaveMemoryParams,
  saveMemoryParamsSchema,
  saveMemoryTool,
} from "./save-memory.js";
// High-performance search facade and backends
export {
  type BackendType as SearchBackendType,
  getSearchFacade,
  resetSearchFacade,
  SearchFacade,
  type SearchMatch as FileSearchMatch,
  type SearchMode as FileSearchMode,
  type SearchOptions as FileSearchOptions,
  type SearchResult as FileSearchResult,
  type SearchStats as FileSearchStats,
} from "./search/index.js";
export {
  type FileReplaceResult,
  type SearchAndReplaceOutput,
  type SearchAndReplaceParams,
  searchAndReplaceParamsSchema,
  searchAndReplaceTool,
} from "./search-and-replace.js";
// Search tools
export {
  type SearchFilesOutput,
  type SearchFilesParams,
  type SearchMatch,
  searchFilesParamsSchema,
  searchFilesTool,
} from "./search-files.js";
export {
  checkDomain,
  checkUrlDomain,
  type DomainCheckResult,
  extractDomain,
  matchDomainPattern,
} from "./security/domain-control.js";
// ============================================
// Phase 14: Security Utilities
// ============================================
export {
  type CloudMetadataCheckResult,
  isCloudMetadata,
  isPrivateIP,
  normalizeIP,
  type UrlValidationResult,
  validateUrlWithDNS,
} from "./security/url-validator.js";
export {
  type ShellOutput,
  type ShellParams,
  shellParamsSchema,
  shellTool,
} from "./shell.js";
// Skill tools
export {
  getSkillManager,
  type SkillOutput,
  type SkillParams,
  setSkillConfig,
  setSkillManager,
  skillParamsSchema,
  skillTool,
} from "./skill-tool.js";
export {
  type SmartEditOutput,
  type SmartEditParams,
  smartEditParamsSchema,
  smartEditTool,
} from "./smart-edit-tool.js";
// Productivity tools
export {
  type TodoItem,
  type TodoManageOutput,
  type TodoManageParams,
  todoManageParamsSchema,
  todoManageTool,
} from "./todo-manage.js";
export {
  type StoredTodoItem,
  type TodoStatus,
  TodoStatusSchema,
  type TodoWriteItem,
  TodoWriteItemSchema,
  type TodoWriteOutput,
  type TodoWriteParams,
  todoWriteParamsSchema,
  todoWriteTool,
} from "./todo-write.js";
// Network tools
export {
  type WebFetchOutput,
  type WebFetchParams,
  webFetchParamsSchema,
  webFetchTool,
} from "./web-fetch.js";
export {
  type SearchResult,
  type WebSearchOutput,
  type WebSearchParams,
  webSearchParamsSchema,
  webSearchTool,
} from "./web-search.js";
export {
  type WriteFileOutput,
  type WriteFileParams,
  writeFileParamsSchema,
  writeFileTool,
} from "./write-file.js";

// ============================================
// T063: Builtin Tool Registration
// ============================================

import type { ToolRegistry } from "../tool/registry.js";

/**
 * Array of all builtin tools available for registration.
 *
 * Includes:
 * - File operations: read_file, write_file, apply_diff, apply_patch, search_and_replace
 * - Shell execution: bash, shell
 * - Directory operations: list_dir
 * - Search: search_files, codebase_search
 * - Agent control: attempt_completion, ask_followup_question
 * - Browser: browser
 * - Network: web_fetch, web_search
 * - Documentation: doc_lookup
 * - Productivity: todo_manage, smart_edit
 * - Memory: save_memory, recall_memory
 * - Agent delegation: delegate_agent
 */
export const ALL_BUILTIN_TOOLS = [
  applyDiffTool,
  applyPatchTool,
  askFollowupQuestionTool,
  attemptCompletionTool,
  bashTool,
  batchTool,
  browserTool,
  codebaseSearchTool,
  copyFileTool,
  createDirectoryTool,
  delegateAgentTool,
  deleteFileTool,
  docLookupTool,
  globTool,
  insertAtLineTool,
  listDirTool,
  moveFileTool,
  multiEditTool,
  readFileTool,
  readManyFilesTool,
  recallMemoryTool,
  saveMemoryTool,
  searchAndReplaceTool,
  searchFilesTool,
  shellTool,
  skillTool,
  smartEditTool,
  todoManageTool,
  todoWriteTool,
  webFetchTool,
  webSearchTool,
  writeFileTool,
] as const;

/**
 * Register all builtin tools with a ToolRegistry.
 *
 * This function should be called during agent initialization to make
 * all builtin tools available for LLM invocation.
 *
 * @param registry - The ToolRegistry to register tools with
 * @returns The number of tools registered
 *
 * @example
 * ```typescript
 * import { createToolRegistry, registerAllBuiltinTools } from "@vellum/core";
 *
 * const registry = createToolRegistry();
 * const count = registerAllBuiltinTools(registry);
 * console.log(`Registered ${count} builtin tools`);
 * ```
 */
export function registerAllBuiltinTools(registry: ToolRegistry): number {
  for (const tool of ALL_BUILTIN_TOOLS) {
    registry.register(tool);
  }
  return ALL_BUILTIN_TOOLS.length;
}

// Re-import tools needed for ALL_BUILTIN_TOOLS array
import { applyDiffTool } from "./apply-diff.js";
import { applyPatchTool } from "./apply-patch.js";
import { askFollowupQuestionTool } from "./ask-followup.js";
import { attemptCompletionTool } from "./attempt-completion.js";
import { bashTool } from "./bash.js";
import { batchTool } from "./batch.js";
import { browserTool } from "./browser.js";
import { codebaseSearchTool } from "./codebase-search.js";
import { delegateAgentTool } from "./delegate-agent.js";
import { docLookupTool } from "./doc-lookup.js";
import {
  copyFileTool,
  createDirectoryTool,
  deleteFileTool,
  moveFileTool,
} from "./file-management.js";
import { globTool } from "./glob.js";
import { insertAtLineTool } from "./insert-at-line.js";
import { listDirTool } from "./list-dir.js";
import { multiEditTool } from "./multi-edit.js";
import { readFileTool } from "./read-file.js";
import { readManyFilesTool } from "./read-many-files.js";
import { recallMemoryTool } from "./recall-memory.js";
import { saveMemoryTool } from "./save-memory.js";
import { searchAndReplaceTool } from "./search-and-replace.js";
import { searchFilesTool } from "./search-files.js";
import { shellTool } from "./shell.js";
import { skillTool } from "./skill-tool.js";
import { smartEditTool } from "./smart-edit-tool.js";
import { todoManageTool } from "./todo-manage.js";
import { todoWriteTool } from "./todo-write.js";
import { webFetchTool } from "./web-fetch.js";
import { webSearchTool } from "./web-search.js";
import { writeFileTool } from "./write-file.js";
