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
// Command schemas
export {
  type CommandArgument,
  type CommandArgumentInput,
  type CommandFrontmatter,
  type CommandFrontmatterInput,
  type CommandTrigger,
  type CommandTriggerInput,
  commandArgumentSchema,
  commandFrontmatterSchema,
  commandTriggerSchema,
  DEFAULT_COMMAND_FRONTMATTER,
} from "./command.js";
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

// Prompt schemas
export {
  DEFAULT_PROMPT_FRONTMATTER,
  type PromptCategory,
  type PromptFrontmatter,
  type PromptFrontmatterInput,
  type PromptVariable,
  type PromptVariableInput,
  promptCategories,
  promptCategorySchema,
  promptFrontmatterSchema,
  promptVariableSchema,
} from "./prompt.js";
// Skill schemas
export {
  DEFAULT_SKILL_FRONTMATTER,
  type SkillCompatibility,
  type SkillCompatibilityInput,
  type SkillFrontmatter,
  type SkillFrontmatterCompat,
  type SkillFrontmatterCompatInput,
  type SkillFrontmatterInput,
  type SkillTrigger,
  type SkillTriggerInput,
  type SkillTriggerType,
  skillCompatibilitySchema,
  skillFrontmatterCompatSchema,
  skillFrontmatterSchema,
  skillTriggerSchema,
  skillTriggerTypeSchema,
  skillTriggerTypes,
} from "./skill.js";

// Workflow schemas
export {
  DEFAULT_WORKFLOW_FRONTMATTER,
  type StepValidation,
  stepValidationSchema,
  type WorkflowFrontmatter,
  type WorkflowFrontmatterInput,
  type WorkflowStep,
  type WorkflowStepInput,
  type WorkflowVariable,
  type WorkflowVariableInput,
  workflowFrontmatterSchema,
  workflowStepSchema,
  workflowVariableSchema,
} from "./workflow.js";
