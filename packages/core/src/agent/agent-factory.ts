// ============================================
// Agent Factory
// ============================================

/**
 * Factory for creating agent instances with proper initialization.
 *
 * Creates and configures PromptLoader and PromptWatcher instances,
 * ensuring they are shared across the agent lifecycle.
 *
 * @module @vellum/core/agent/agent-factory
 * @see T050, T056
 */

import { PromptBuilder } from "../prompts/prompt-builder.js";
import { PromptLoader, type PromptLoaderOptions } from "../prompts/prompt-loader.js";
import { PromptWatcher, type PromptWatcherOptions } from "../prompts/prompt-watcher.js";
import type { CodingMode } from "./coding-modes.js";
import type { AgentLoopConfig } from "./loop.js";

// =============================================================================
// Mode-to-Role Mapping
// =============================================================================

/**
 * Default roles for each coding mode.
 * Can be overridden by explicitly passing `role` in options.
 */
const MODE_DEFAULT_ROLE: Partial<Record<CodingMode, string>> = {
  vibe: "coder", // Implementation-focused
  plan: "coder", // Planning for implementation
  spec: "orchestrator", // Multi-agent coordination
};

// =============================================================================
// Types
// =============================================================================

/**
 * Options for creating an agent via the factory.
 */
export interface AgentFactoryOptions {
  /**
   * Working directory for the agent.
   */
  cwd: string;

  /**
   * Project root directory (optional, defaults to cwd).
   */
  projectRoot?: string;

  /**
   * PromptLoader configuration options.
   */
  promptLoaderOptions?: PromptLoaderOptions;

  /**
   * PromptWatcher configuration options.
   */
  promptWatcherOptions?: PromptWatcherOptions;

  /**
   * Enable hot-reload watching for prompts.
   * @default true in development, false in production
   */
  enableHotReload?: boolean;

  /**
   * Custom instructions from config.
   */
  customInstructions?: string;

  /**
   * Integration instructions (alias for customInstructions).
   */
  integrationInstructions?: string;

  /**
   * Agent role to load from MD files (e.g., 'coder', 'qa', 'orchestrator').
   * Overrides the mode's default role if provided.
   * Falls back to mode's default role, then to 'coder'.
   */
  role?: string;

  /**
   * Coding mode to load from MD files (e.g., 'vibe', 'plan', 'spec').
   * If provided, loads mode prompt from markdown.
   */
  mode?: string;
}

/**
 * Result of agent factory creation.
 */
export interface AgentFactoryResult {
  /**
   * Configured PromptBuilder instance.
   */
  promptBuilder: PromptBuilder;

  /**
   * Shared PromptLoader instance.
   */
  promptLoader: PromptLoader;

  /**
   * PromptWatcher instance (if hot-reload enabled).
   */
  promptWatcher: PromptWatcher | null;

  /**
   * The effective role loaded (from --role or mode default).
   */
  effectiveRole: string;

  /**
   * Cleanup function to stop watcher and clear caches.
   */
  cleanup: () => void;
}

// =============================================================================
// AgentFactory Class
// =============================================================================

/**
 * Factory for creating and managing agent instances.
 *
 * Handles initialization of:
 * - PromptLoader with LRU caching
 * - PromptWatcher for hot-reload
 * - PromptBuilder with proper loader injection
 *
 * @example
 * ```typescript
 * const factory = new AgentFactory();
 * const { promptBuilder, promptLoader, cleanup } = await factory.create({
 *   cwd: '/path/to/project',
 *   enableHotReload: true,
 *   customInstructions: "Always use TypeScript",
 * });
 *
 * // Use promptBuilder in AgentLoopConfig
 * const loopConfig: AgentLoopConfig = {
 *   ...otherConfig,
 *   promptBuilder,
 * };
 *
 * // On shutdown
 * cleanup();
 * ```
 */
export class AgentFactory {
  /**
   * Creates a configured agent setup with shared instances.
   *
   * @param options - Factory configuration options
   * @returns Agent factory result with cleanup function
   */
  async create(options: AgentFactoryOptions): Promise<AgentFactoryResult> {
    const {
      cwd,
      projectRoot = cwd,
      promptLoaderOptions,
      promptWatcherOptions,
      enableHotReload = process.env.NODE_ENV !== "production",
      customInstructions,
      integrationInstructions,
      role,
      mode,
    } = options;

    // Create shared PromptLoader instance (T050)
    const promptLoader = new PromptLoader({
      ...promptLoaderOptions,
      discovery: {
        ...promptLoaderOptions?.discovery,
        workspacePath: projectRoot,
      },
    });

    // Create PromptBuilder with loader (T051)
    const promptBuilder = new PromptBuilder().withLoader(promptLoader);

    // Determine effective role:
    // 1. Use role from options if provided
    // 2. Fall back to MODE_DEFAULT_ROLE[mode] if mode is set
    // 3. Fall back to "coder" as ultimate default
    const modeDefaultRole = mode ? MODE_DEFAULT_ROLE[mode as CodingMode] : undefined;
    const effectiveRole = role ?? modeDefaultRole ?? "coder";

    // Load base foundation (always loaded first)
    await promptBuilder.withExternalRole("base");

    // Load specialist role (if not base)
    if (effectiveRole !== "base") {
      await promptBuilder.withExternalRole(effectiveRole);
    }

    // Load mode workflow rules
    if (mode) {
      await promptBuilder.withExternalMode(mode);
    }

    // Apply custom/integration instructions if provided (T053)
    const instructions = integrationInstructions ?? customInstructions;
    if (instructions) {
      promptBuilder.withCustomInstructions(instructions);
    }

    // Create and start PromptWatcher if hot-reload enabled (T056)
    let promptWatcher: PromptWatcher | null = null;

    if (enableHotReload) {
      promptWatcher = new PromptWatcher({
        ...promptWatcherOptions,
        workspacePath: projectRoot,
      });

      // Register callback to invalidate PromptLoader cache on file changes
      promptWatcher.onInvalidate((paths) => {
        for (const path of paths) {
          promptLoader.invalidateByPath(path);
        }
      });

      // Start watching
      promptWatcher.start();
    }

    // Create cleanup function
    const cleanup = (): void => {
      // Stop watcher (T056)
      if (promptWatcher) {
        promptWatcher.stop();
      }

      // Clear loader cache
      promptLoader.invalidateAll();
    };

    return {
      promptBuilder,
      promptLoader,
      promptWatcher,
      effectiveRole,
      cleanup,
    };
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Creates an agent factory result with default configuration.
 *
 * Convenience function for simple agent creation.
 *
 * @param options - Factory configuration options
 * @returns Agent factory result
 *
 * @example
 * ```typescript
 * const { promptBuilder, cleanup } = await createAgentFactory({
 *   cwd: process.cwd(),
 * });
 * ```
 */
export async function createAgentFactory(
  options: AgentFactoryOptions
): Promise<AgentFactoryResult> {
  const factory = new AgentFactory();
  return factory.create(options);
}

/**
 * Applies agent factory result to an AgentLoopConfig.
 *
 * Helper function to merge factory result with existing config.
 *
 * @param config - Base AgentLoopConfig
 * @param factoryResult - Result from AgentFactory.create()
 * @returns Merged config with promptBuilder
 */
export function applyFactoryToConfig(
  config: Partial<AgentLoopConfig>,
  factoryResult: AgentFactoryResult
): Partial<AgentLoopConfig> {
  return {
    ...config,
    promptBuilder: factoryResult.promptBuilder,
  };
}
