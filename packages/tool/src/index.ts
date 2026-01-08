// ============================================
// Vellum Tool System
// ============================================

/**
 * @deprecated This package is deprecated. Please import from "@vellum/core" instead.
 *
 * Migration guide:
 * ```typescript
 * // Before (deprecated)
 * import { ToolRegistry, defineTool } from "@vellum/tool";
 *
 * // After (recommended)
 * import { createToolRegistry, defineTool } from "@vellum/core";
 * // Or for builtin tools:
 * import { readFileTool, writeFileTool } from "@vellum/core";
 * ```
 *
 * The tool system has been consolidated into @vellum/core for better
 * integration with the agent loop and registry.
 *
 * @module @vellum/tool
 */

// Emit deprecation warning on import (only once)
const WARNED_KEY = "__vellum_tool_deprecated_warned__";
if (!(globalThis as Record<string, unknown>)[WARNED_KEY]) {
  (globalThis as Record<string, unknown>)[WARNED_KEY] = true;
  console.warn(
    "[@vellum/tool] This package is deprecated. Please import from @vellum/core instead."
  );
}

// Agent tools (multi-agent orchestration)
export * from "./agent/index.js";

export { executeCommandTool } from "./builtin/execute-command.js";
// Built-in tools
export { readFileTool } from "./builtin/read-file.js";
export { searchFilesTool } from "./builtin/search-files.js";
export { writeFileTool } from "./builtin/write-file.js";
export { defineTool } from "./define.js";
export { ToolRegistry } from "./registry.js";
// Todo tools (task management)
export * from "./tools/todo/index.js";
export type { ToolDefinition, ToolHandler } from "./types.js";
