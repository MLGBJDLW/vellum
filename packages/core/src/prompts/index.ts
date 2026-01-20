// ============================================
// Prompt System Exports
// ============================================

/**
 * Agent prompt system for managing role-based prompts and context.
 *
 * This module provides a comprehensive prompt building system with:
 * - **PromptBuilder**: Fluent API for composing layered prompts
 * - **ContextBuilder**: Formatter for session context (active file, git status, tasks)
 * - **PromptDiscovery**: Multi-source prompt discovery with priority
 * - **PromptLoader**: Progressive loading with LRU caching
 * - **PromptParser**: Frontmatter parsing and variable interpolation
 * - **PromptWatcher**: Hot-reload via file system watching
 * - **Sanitization**: Security utilities to prevent prompt injection
 *
 * @example
 * ```typescript
 * import { PromptBuilder, PromptLoader } from '@vellum/core';
 *
 * const loader = new PromptLoader({ discovery: { workspacePath: '/project' } });
 * const rolePrompt = await loader.loadRole('coder');
 *
 * const prompt = new PromptBuilder()
 *   .withBase(basePrompt)
 *   .withRole('coder', rolePrompt)
 *   .setVariable('PROJECT_NAME', 'my-app')
 *   .build();
 * ```
 *
 * @module @vellum/core/prompts
 */

// =============================================================================
// Externalized Prompt System (REQ-001)
// =============================================================================

// =============================================================================
// Builder
// =============================================================================
/**
 * Builder for formatting session context into prompt-friendly strings.
 * @see {@link ContextBuilder}
 */
export { ContextBuilder } from "./context-builder.js";
/**
 * Error codes and classes for the prompt system.
 * @see {@link PromptError}
 */
export {
  PromptError,
  PromptErrorCode,
  type PromptErrorCodeType,
  promptLoadError,
  promptNotFoundError,
  promptParseError,
  promptSchemaError,
  promptVariableError,
  promptYamlError,
} from "./errors.js";
/**
 * Hot-reload integration for automatic cache invalidation.
 * @see {@link HotReloadIntegration}
 */
export {
  createHotReload,
  HotReloadIntegration,
  type HotReloadOptions,
  type HotReloadStats,
  type ReloadCallback,
} from "./hot-reload.js";
/**
 * Fluent builder for constructing agent prompts with layered content.
 * @see {@link PromptBuilder}
 */
export { PromptBuilder } from "./prompt-builder.js";
/**
 * Multi-source prompt discovery with priority-based deduplication.
 * @see {@link PromptDiscovery}
 */
export {
  PROMPT_SOURCE_PRIORITY,
  PromptDiscovery,
  type PromptDiscoveryOptions,
} from "./prompt-discovery.js";
/**
 * Progressive prompt loader with LRU caching and TypeScript fallback.
 * @see {@link PromptLoader}
 */
export {
  type LoadResult,
  PromptLoader,
  type PromptLoaderOptions,
} from "./prompt-loader.js";
/**
 * Parser for markdown files with YAML frontmatter and variable interpolation.
 * @see {@link PromptParser}
 */
export {
  type PromptParseResult,
  PromptParser,
  type PromptParserOptions,
} from "./prompt-parser.js";
/**
 * File system watcher for prompt hot-reload with debouncing.
 * @see {@link PromptWatcher}
 */
export {
  type PromptChangeEvent,
  type PromptWatchEventType,
  PromptWatcher,
  type PromptWatcherOptions,
} from "./prompt-watcher.js";

// Sanitization
/**
 * Security utilities for sanitizing prompt variables and detecting injection attempts.
 *
 * @example
 * ```typescript
 * import { sanitizeVariable, containsDangerousContent } from '@vellum/core';
 *
 * // Check for dangerous patterns
 * if (containsDangerousContent(userInput)) {
 *   console.warn('Potential injection detected');
 * }
 *
 * // Sanitize user input
 * const safe = sanitizeVariable('key', userInput);
 * ```
 */
export {
  containsDangerousContent,
  DEFAULT_MAX_LENGTH,
  sanitizeVariable,
  TRUNCATION_SUFFIX,
} from "./sanitizer.js";

// Types and Schemas
/**
 * Type definitions and Zod schemas for the prompt system.
 *
 * Key types:
 * - `AgentRole`: Valid agent roles (orchestrator, coder, qa, writer, analyst, architect)
 * - `PromptLayer`: A single layer with content, priority, and source
 * - `SessionContext`: Dynamic context (active file, git status, tasks, errors)
 * - `PromptSizeError`: Error thrown when prompt exceeds MAX_PROMPT_SIZE
 *
 * @example
 * ```typescript
 * import {
 *   type AgentRole,
 *   type SessionContext,
 *   PromptSizeError,
 *   MAX_PROMPT_SIZE
 * } from '@vellum/core';
 *
 * const role: AgentRole = 'coder';
 * const context: SessionContext = {
 *   activeFile: { path: 'src/app.ts', language: 'typescript' }
 * };
 * ```
 */
export {
  type ActiveFile,
  ActiveFileSchema,
  AGENT_ROLES,
  type AgentRole,
  AgentRoleSchema,
  type GitStatus,
  GitStatusSchema,
  MAX_PROMPT_SIZE,
  PROMPT_LAYER_SOURCES,
  type PromptCategory,
  type PromptLayer,
  PromptLayerSchema,
  type PromptLayerSource,
  PromptLayerSourceSchema,
  type PromptLoaded,
  type PromptLocation,
  type PromptPriority,
  PromptPrioritySchema,
  PromptSizeError,
  type PromptSource,
  type PromptVariables,
  type SessionContext,
  SessionContextSchema,
  type Task,
  TaskSchema,
  type TaskStatus,
  TaskStatusSchema,
} from "./types.js";
