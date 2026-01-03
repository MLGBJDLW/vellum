/**
 * Plugin Agents Module
 *
 * Provides types and utilities for plugin-defined agents.
 * Plugin agents extend the core CustomAgentDefinition with plugin-specific fields.
 *
 * @module plugin/agents
 */

// =============================================================================
// Type Exports
// =============================================================================

export type { ParsedAgent } from "./parser.js";
export type {
  PluginAgentDefinition,
  PluginAgentDefinitionInput,
} from "./types.js";

// =============================================================================
// Schema Exports
// =============================================================================

export {
  MAX_FILE_PATH_LENGTH,
  MAX_PLUGIN_NAME_LENGTH,
  PLUGIN_AGENT_SCOPE,
  PluginAgentDefinitionSchema,
} from "./types.js";

// =============================================================================
// Helper Function Exports
// =============================================================================

export {
  getPluginAgentQualifiedSlug,
  parsePluginAgentQualifiedSlug,
  validatePluginAgentDefinition,
} from "./types.js";

// =============================================================================
// Parser Exports
// =============================================================================

export {
  extractFirstParagraph,
  extractNameFromPath,
  parseAgent,
} from "./parser.js";

// =============================================================================
// Adapter Exports
// =============================================================================

export {
  adaptToPluginAgent,
  convertToolsToToolGroups,
  TOOL_TO_GROUP,
} from "./adapter.js";
