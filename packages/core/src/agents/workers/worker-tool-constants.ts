// ============================================
// Worker Tool Constants
// ============================================
// Shared tool set definitions for worker agents

/**
 * Allowed tool names for each worker type.
 * Workers can only use tools from their allowed set.
 */
export const WORKER_TOOL_SETS: Record<string, readonly string[]> = {
  analyst: ["read_file", "search_files", "codebase_search", "list_dir", "lsp"],
  architect: [
    "read_file",
    "write_file",
    "search_files",
    "codebase_search",
    "list_dir",
    "smart_edit",
  ],
  coder: [
    "read_file",
    "write_file",
    "search_files",
    "codebase_search",
    "list_dir",
    "bash",
    "shell",
    "smart_edit",
    "apply_diff",
    "apply_patch",
    "search_and_replace",
    "lsp",
  ],
  devops: ["read_file", "write_file", "search_files", "list_dir", "bash", "shell", "smart_edit"],
  qa: [
    "read_file",
    "write_file",
    "search_files",
    "codebase_search",
    "list_dir",
    "bash",
    "shell",
    "smart_edit",
    "lsp",
  ],
  researcher: [
    "read_file",
    "search_files",
    "codebase_search",
    "list_dir",
    "web_fetch",
    "web_search",
    "doc_lookup",
  ],
  security: ["read_file", "search_files", "codebase_search", "list_dir", "lsp"],
  writer: ["read_file", "write_file", "search_files", "codebase_search", "list_dir", "smart_edit"],
} as const;
