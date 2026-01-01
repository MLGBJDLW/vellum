/**
 * Schema Index - Base and Configuration Schemas
 * Exports all schema definitions for config parsing
 */

// Agents schemas
export {
  type AgentsFrontmatter,
  type AgentsFrontmatterInput,
  agentsFrontmatterSchema,
  allowedToolPattern,
  allowedToolSchema,
  arrayMergeSchema,
  DEFAULT_AGENTS_FRONTMATTER,
  type MergeSettings,
  type ModelSettings,
  mergeSettingsSchema,
  mergeStrategySchema,
  modelSettingsSchema,
  type ScopeSettings,
  scopeSettingsSchema,
} from "./agents.js";
// Base schemas
export {
  authorSchema,
  type BaseMetadata,
  type BaseMetadataInput,
  baseMetadataSchema,
  DEFAULT_BASE_METADATA,
  type ExtendedMetadata,
  type ExtendedMetadataInput,
  extendedMetadataSchema,
  semverPattern,
  updatedSchema,
} from "./base.js";

// Mode rules schemas
export {
  DEFAULT_MODE_RULES,
  type ModeRulesFrontmatter,
  type ModeRulesFrontmatterInput,
  modeNameSchema,
  modeRulesSchema,
  parseModeRules,
  safeParseModeRules,
  triggerPatternSchema,
} from "./mode-rules.js";
