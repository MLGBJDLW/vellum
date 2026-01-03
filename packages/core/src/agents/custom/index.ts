/**
 * Custom Agents Module
 *
 * This module provides functionality for loading and managing custom agent definitions
 * from Markdown files with YAML frontmatter.
 */

// ============================================
// Type Exports (T004, T005)
// ============================================

export type {
  AgentCoordination,
  AgentHooks,
  AgentRestrictions,
  AgentSettings,
  CustomAgentDefinition,
  CustomTrigger,
  FileRestriction,
  ToolGroupEntry,
  TriggerPattern,
  WhenToUse,
} from "./types.js";
// Re-export from types for convenience
export { AgentLevel } from "./types.js";

// ============================================
// Schema Exports (T006)
// ============================================

export type { ValidatedCustomAgentDefinition } from "./schema.js";
export {
  AgentCoordinationSchema,
  AgentHooksSchema,
  AgentRestrictionsSchema,
  AgentSettingsSchema,
  CustomAgentDefinitionSchema,
  isValidSlug,
  MAX_DESCRIPTION_LENGTH,
  MAX_NAME_LENGTH,
  MAX_SLUG_LENGTH,
  SLUG_PATTERN,
  TriggerPatternSchema,
  TriggerPatternTypeSchema,
  validateAgentDefinition,
  WhenToUseSchema,
} from "./schema.js";

// ============================================
// Error Exports (T007)
// ============================================

export type { AgentErrorOptions, ValidationIssue } from "./errors.js";
export {
  AgentCircularInheritanceError,
  AgentError,
  AgentErrorCode,
  AgentNotFoundError,
  AgentParseError,
  AgentValidationError,
  fromZodError,
  isAgentCircularInheritanceError,
  isAgentError,
  isAgentNotFoundError,
  isAgentParseError,
  isAgentValidationError,
} from "./errors.js";

// ============================================
// Loader Exports (T009)
// ============================================

export type { AgentLoadError, LoadResult, SupportedExtension } from "./loader.js";
export {
  AgentLoader,
  createAgentLoader,
  getSlugFromFilePath,
  isSupportedAgentFile,
  SUPPORTED_EXTENSIONS,
} from "./loader.js";

// ============================================
// Resolver Exports (T010)
// ============================================

export type {
  AgentRegistry,
  ResolutionError,
  ResolvedAgent,
  ResolveResult,
} from "./resolver.js";
export {
  createInheritanceResolver,
  getInheritanceDepth,
  hasNoCycles,
  InheritanceResolver,
  MAX_INHERITANCE_DEPTH,
} from "./resolver.js";

// ============================================
// Discovery Exports (T011)
// ============================================

export type {
  AgentDiscoveryEvents,
  AgentDiscoveryOptions,
  DiscoveredAgent,
} from "./discovery.js";
export {
  AgentDiscovery,
  createAgentDiscovery,
  DEFAULT_DEBOUNCE_MS,
  DiscoverySource,
} from "./discovery.js";

// ============================================
// Registry Exports (T015)
// ============================================

export type { RegistryEvents, RegistryOptions } from "./registry.js";
export {
  CustomAgentRegistry,
  createAgentRegistry,
  registerBuiltinAgents,
} from "./registry.js";

// ============================================
// Router Exports (T016)
// ============================================

export type {
  RouterOptions,
  RoutingContext,
  RoutingResult,
  RoutingWeights,
  ScoreBreakdown,
  ScoredCandidate,
} from "./router.js";
export {
  AgentRouter,
  createAgentRouter,
  MIN_ROUTING_SCORE,
  ROUTING_WEIGHTS,
} from "./router.js";

// ============================================
// Template Exports (T030)
// ============================================

export type { TemplateInfo, TemplateName } from "./templates.js";
export {
  BACKEND_TEMPLATE,
  DEVOPS_TEMPLATE,
  DOCS_TEMPLATE,
  FRONTEND_TEMPLATE,
  getTemplate,
  getTemplateNames,
  isValidTemplateName,
  QA_TEMPLATE,
  SECURITY_TEMPLATE,
  TEMPLATE_INFO,
  TEMPLATES,
  templateToMarkdown,
} from "./templates.js";

// ============================================
// JSON Schema Exports (T030a)
// ============================================

export type { GenerateSchemaOptions, JsonSchema } from "./schema-generator.js";
export {
  generateFrontmatterSchema,
  generateJsonSchema,
  schemaToString,
} from "./schema-generator.js";
