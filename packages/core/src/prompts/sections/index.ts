// ============================================
// Prompt Sections Exports
// ============================================

/**
 * Dynamic prompt sections for system prompt generation.
 * These sections are generated at runtime based on current state.
 *
 * @module @butlerw/core/prompts/sections
 */

export {
  getMcpServersSection,
  type McpResourceInfo,
  type McpResourceTemplateInfo,
  type McpServer,
  type McpServerStatus,
  type McpServersSectionOptions,
  type McpToolInfo,
  type McpToolInputSchema,
  mapStatusFromHub,
} from "./mcp-servers.js";
