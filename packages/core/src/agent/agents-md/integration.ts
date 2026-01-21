// ============================================
// AGENTS.md Prompt Integration
// ============================================

/**
 * Integration between AgentsMdLoader and PromptBuilder.
 *
 * Provides utilities for injecting directory-scoped AGENTS.md
 * instructions into the system prompt.
 *
 * @module @vellum/core/agent/agents-md/integration
 */

import type { PromptBuilder } from "../../prompts/prompt-builder.js";
import type { AgentsMdLoader } from "./loader.js";
import type { AgentsMdScope } from "./types.js";

// =============================================================================
// Constants
// =============================================================================

/**
 * Priority for AGENTS.md content in prompt layers.
 * Between role (2) and mode (3) for appropriate precedence.
 */
export const AGENTS_MD_PRIORITY = 2.5;

/**
 * Maximum length for AGENTS.md instructions in prompt.
 * Prevents excessively large AGENTS.md files from bloating context.
 */
export const MAX_AGENTS_MD_LENGTH = 10000;

// =============================================================================
// Integration Class
// =============================================================================

/**
 * Options for AgentsMdIntegration.
 */
export interface IntegrationOptions {
  /** Maximum instruction length (default: 10000) */
  maxLength?: number;
  /** Include source attribution comment (default: true) */
  includeAttribution?: boolean;
  /** Truncation indicator (default: "<!-- Content truncated -->") */
  truncationIndicator?: string;
}

/**
 * Integrates AGENTS.md scoped instructions with PromptBuilder.
 *
 * @example
 * ```typescript
 * const loader = createAgentsMdLoader({ projectRoot: '/project' });
 * const integration = new AgentsMdIntegration(loader);
 *
 * const builder = new PromptBuilder()
 *   .withBase("System instructions");
 *
 * // Inject AGENTS.md instructions for target file
 * await integration.injectInstructions(builder, '/project/src/utils.ts');
 *
 * const prompt = builder.build();
 * ```
 */
export class AgentsMdIntegration {
  private readonly loader: AgentsMdLoader;
  private readonly options: Required<IntegrationOptions>;

  constructor(loader: AgentsMdLoader, options?: IntegrationOptions) {
    this.loader = loader;
    this.options = {
      maxLength: options?.maxLength ?? MAX_AGENTS_MD_LENGTH,
      includeAttribution: options?.includeAttribution ?? true,
      truncationIndicator: options?.truncationIndicator ?? "<!-- Content truncated -->",
    };
  }

  /**
   * Inject AGENTS.md instructions into a PromptBuilder.
   *
   * @param builder - The PromptBuilder to inject into
   * @param targetFile - Path to the file being worked on
   * @returns The same builder for chaining
   */
  async injectInstructions(builder: PromptBuilder, targetFile: string): Promise<PromptBuilder> {
    const scope = await this.loader.resolve(targetFile);

    if (!scope.instructions || scope.instructions.trim().length === 0) {
      return builder;
    }

    const content = this.formatContent(scope);
    builder.withRulesContent(content);

    return builder;
  }

  /**
   * Get formatted AGENTS.md content for a target file.
   *
   * @param targetFile - Path to the file
   * @returns Formatted instructions string
   */
  async getFormattedContent(targetFile: string): Promise<string> {
    const scope = await this.loader.resolve(targetFile);

    if (!scope.instructions) {
      return "";
    }

    return this.formatContent(scope);
  }

  /**
   * Check if there are any applicable AGENTS.md files.
   *
   * @param targetFile - Path to check
   * @returns True if AGENTS.md files apply
   */
  async hasApplicableInstructions(targetFile: string): Promise<boolean> {
    return this.loader.hasScope(targetFile);
  }

  /**
   * Format scope content for injection into prompt.
   */
  private formatContent(scope: AgentsMdScope): string {
    let content = scope.instructions;

    // Truncate if necessary
    if (content.length > this.options.maxLength) {
      content =
        content.slice(0, this.options.maxLength - 50) + `\n\n${this.options.truncationIndicator}`;
    }

    // Add attribution if enabled
    if (this.options.includeAttribution && scope.sources.length > 0) {
      const sources = scope.sources.map((f) => f.path).join(", ");
      content = `<!-- AGENTS.md Sources: ${sources} -->\n\n${content}`;
    }

    return content;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a new AgentsMdIntegration instance.
 *
 * @param loader - The AgentsMdLoader to use
 * @param options - Integration options
 * @returns New integration instance
 */
export function createAgentsMdIntegration(
  loader: AgentsMdLoader,
  options?: IntegrationOptions
): AgentsMdIntegration {
  return new AgentsMdIntegration(loader, options);
}

// =============================================================================
// Helper Function
// =============================================================================

/**
 * Convenience function to inject AGENTS.md instructions into a builder.
 *
 * Creates a temporary loader and integration for one-shot injection.
 * For repeated use, prefer creating a persistent loader.
 *
 * @param builder - The PromptBuilder to inject into
 * @param projectRoot - Project root directory
 * @param targetFile - Path to the file being worked on
 * @returns The same builder for chaining
 *
 * @example
 * ```typescript
 * const builder = new PromptBuilder().withBase("System prompt");
 * await injectAgentsMd(builder, '/project', '/project/src/file.ts');
 * ```
 */
export async function injectAgentsMd(
  builder: PromptBuilder,
  projectRoot: string,
  targetFile: string
): Promise<PromptBuilder> {
  // Import dynamically to avoid circular dependency
  const { createAgentsMdLoader } = await import("./loader.js");

  const loader = createAgentsMdLoader({ projectRoot });
  const integration = new AgentsMdIntegration(loader);

  return integration.injectInstructions(builder, targetFile);
}
