// ============================================
// Prompt Builder
// ============================================

/**
 * Fluent builder for constructing agent prompts with layered content.
 *
 * Provides a chainable API for building prompts from multiple sources
 * (base, role, mode, context) with variable substitution and size validation.
 *
 * @module @vellum/core/prompts/prompt-builder
 */

import { ContextBuilder } from "./context-builder.js";
import type { PromptLoader } from "./prompt-loader.js";
import {
  type AgentRole,
  MAX_PROMPT_SIZE,
  type PromptLayer,
  type PromptLayerSource,
  type PromptPriority,
  PromptSizeError,
  type PromptVariables,
  type SessionContext,
} from "./types.js";

// =============================================================================
// Constants
// =============================================================================

/**
 * Pattern for matching variable placeholders in prompts.
 * Variables use the format `{{KEY}}`.
 */
const VARIABLE_PATTERN = /\{\{(\w+)\}\}/g;

// =============================================================================
// Sanitizer (stub - will be implemented in dedicated module)
// =============================================================================

/**
 * Sanitizes a variable value for safe insertion into prompts.
 * Removes potentially dangerous characters and trims whitespace.
 *
 * @param value - The raw value to sanitize
 * @returns The sanitized value
 */
function sanitizeVariable(value: string): string {
  // Remove control characters and null bytes
  // Trim excessive whitespace
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Intentionally matching control chars for sanitization
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
}

// =============================================================================
// PromptBuilder Class
// =============================================================================

/**
 * Fluent builder for constructing agent prompts.
 *
 * Supports layered prompt construction with:
 * - Multiple content sources (base, role, mode, context)
 * - Priority-based ordering (1=highest, 4=lowest)
 * - Variable substitution with `{{KEY}}` syntax
 * - Size validation against MAX_PROMPT_SIZE
 *
 * @example
 * ```typescript
 * const prompt = new PromptBuilder()
 *   .withBase("You are an AI assistant.")
 *   .withRole("coder", "You write clean, maintainable code.")
 *   .setVariable("LANGUAGE", "TypeScript")
 *   .build();
 * ```
 */
export class PromptBuilder {
  /** Prompt layers to be combined on build */
  #layers: PromptLayer[] = [];

  /** Variable substitutions to apply during build */
  #variables: Map<string, string> = new Map();

  /** Optional PromptLoader instance for external prompt loading */
  #loader: PromptLoader | null = null;

  /** Complete system prompt override (replaces all layers when set) */
  #systemPromptOverride: string | null = null;

  /** Custom instructions to append */
  #customInstructions: string | null = null;

  // ===========================================================================
  // Fluent Methods
  // ===========================================================================

  /**
   * Sets the PromptLoader instance for loading external prompts.
   *
   * @param loader - The PromptLoader instance to use
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * const loader = new PromptLoader({ discovery: { workspacePath: '/project' } });
   * builder.withLoader(loader);
   * ```
   */
  withLoader(loader: PromptLoader): this {
    this.#loader = loader;
    return this;
  }

  /**
   * Loads an external role prompt from markdown files.
   *
   * Replaces hardcoded role prompts with externalized versions.
   * Requires a PromptLoader to be set via withLoader().
   *
   * @param role - The role name to load (e.g., 'coder', 'orchestrator')
   * @returns This builder for chaining
   * @throws Error if no loader is configured
   *
   * @example
   * ```typescript
   * await builder
   *   .withLoader(loader)
   *   .withExternalRole('coder');
   * ```
   */
  async withExternalRole(role: string): Promise<this> {
    if (!this.#loader) {
      throw new Error("PromptLoader required for external role loading. Call withLoader() first.");
    }

    const content = await this.#loader.loadRole(role as AgentRole);
    if (content) {
      this.#addLayer(content, 2, "role");
    }

    return this;
  }

  /**
   * Loads an external mode prompt from markdown files.
   *
   * Replaces hardcoded mode prompts with externalized versions from MD files.
   * Requires a PromptLoader to be set via withLoader().
   *
   * @param mode - The mode name to load (e.g., 'vibe', 'plan', 'spec')
   * @returns This builder for chaining
   * @throws Error if no loader is configured
   *
   * @example
   * ```typescript
   * await builder
   *   .withLoader(loader)
   *   .withExternalMode('vibe');
   * ```
   */
  async withExternalMode(mode: string): Promise<this> {
    if (!this.#loader) {
      throw new Error("PromptLoader required for external mode loading. Call withLoader() first.");
    }

    const content = await this.#loader.loadMode(mode);
    if (content) {
      this.#addLayer(content, 3, "mode");
    }

    return this;
  }

  /**
   * Sets a complete system prompt override.
   *
   * When set, this completely replaces all other layers during build.
   * Used for system-prompt-{mode}.md files that fully replace the default prompt.
   *
   * @param content - The complete system prompt content
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.withSystemPromptOverride(customSystemPrompt);
   * // All other layers are ignored when building
   * ```
   */
  withSystemPromptOverride(content: string): this {
    this.#systemPromptOverride = content;
    return this;
  }

  /**
   * Appends custom instructions to the prompt.
   *
   * Custom instructions are appended after all other layers.
   * Multiple calls will replace previous custom instructions.
   *
   * @param instructions - The custom instructions to append
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.withCustomInstructions("Always respond in Spanish.");
   * ```
   */
  withCustomInstructions(instructions: string): this {
    this.#customInstructions = instructions;
    return this;
  }

  /**
   * Sets multiple runtime variables for interpolation.
   *
   * Variables are replaced in the final prompt using `{{KEY}}` syntax.
   * Accepts a partial PromptVariables object.
   *
   * @param vars - Partial PromptVariables object
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.setRuntimeVariables({
   *   os: 'darwin',
   *   shell: 'zsh',
   *   cwd: '/home/user/project',
   *   mode: 'vibe',
   *   provider: 'anthropic'
   * });
   * ```
   */
  setRuntimeVariables(vars: Partial<PromptVariables>): this {
    for (const [key, value] of Object.entries(vars)) {
      if (typeof value === "string") {
        this.setVariable(key.toUpperCase(), value);
      }
    }
    return this;
  }

  /**
   * Adds external rules content as a layer.
   *
   * Rules are additive and appended to the prompt with priority 3.5 (between mode and context).
   * Integrates with ExternalRulesLoader to inject .vellum/rules/ content.
   *
   * @param rulesContent - The concatenated rules content
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * const rulesLoader = new ExternalRulesLoader();
   * const content = await rulesLoader.getMergedRulesContent('/project', 'coder');
   * builder.withRulesContent(content);
   * ```
   */
  withRulesContent(rulesContent: string): this {
    if (rulesContent && rulesContent.trim().length > 0) {
      // Rules go between mode (3) and context (4)
      // Using 3 with 'mode' source since layers are stable sorted
      this.#addLayer(rulesContent.trim(), 3, "mode");
    }
    return this;
  }

  /**
   * Adds provider-specific header content.
   *
   * Provider headers are prepended to the system prompt with highest priority.
   *
   * @param providerContent - The provider header content
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * const header = await loader.loadProviderHeader('anthropic');
   * if (header) {
   *   builder.withProviderHeader(header);
   * }
   * ```
   */
  withProviderHeader(providerContent: string): this {
    if (providerContent && providerContent.trim().length > 0) {
      // Provider headers get highest priority (0-ish, before base)
      this.#addLayer(providerContent.trim(), 1, "base");
    }
    return this;
  }

  /**
   * Checks if a system prompt override is currently set.
   *
   * @returns True if an override is set, false otherwise
   */
  hasSystemPromptOverride(): boolean {
    return this.#systemPromptOverride !== null;
  }

  /**
   * Clears the system prompt override if set.
   *
   * @returns This builder for chaining
   */
  clearSystemPromptOverride(): this {
    this.#systemPromptOverride = null;
    return this;
  }

  /**
   * Adds base system instructions (priority 1).
   *
   * Base content forms the foundation of the prompt and takes
   * the highest priority in the final output.
   *
   * @param content - The base system instructions
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.withBase("You are a helpful AI assistant.");
   * ```
   */
  withBase(content: string): this {
    this.#addLayer(content, 1, "base");
    return this;
  }

  /**
   * Adds role-specific instructions (priority 2).
   *
   * Role content customizes behavior based on the agent's role
   * (e.g., coder, qa, writer).
   *
   * @param role - The agent role
   * @param content - Role-specific instructions
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.withRole("coder", "Write clean, testable code.");
   * ```
   */
  withRole(_role: AgentRole, content: string): this {
    // Role is used for potential future filtering/logging
    // Currently we just store the content with role source
    this.#addLayer(content, 2, "role");
    return this;
  }

  /**
   * Adds mode-specific overrides (priority 3).
   *
   * Mode content modifies behavior based on the current
   * operating mode (e.g., plan, code, debug).
   *
   * @param content - Mode-specific override content
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.withModeOverrides("Focus on implementation, not planning.");
   * ```
   */
  withModeOverrides(content: string): this {
    this.#addLayer(content, 3, "mode");
    return this;
  }

  /**
   * Adds session context as a prompt layer (priority 4).
   *
   * Context content provides dynamic runtime information
   * such as the active file, git status, and current task.
   *
   * @param context - The session context to include
   * @returns This builder for chaining
   *
   * @remarks
   * This method uses ContextBuilder internally to format the context
   * into a consistent markdown structure.
   *
   * @example
   * ```typescript
   * builder.withSessionContext({
   *   activeFile: { path: "src/index.ts", language: "typescript" },
   *   currentTask: { id: "T001", description: "Fix bug", status: "in-progress" }
   * });
   * ```
   */
  withSessionContext(context: SessionContext): this {
    const contextBuilder = new ContextBuilder();
    const contextContent = contextBuilder.buildContext(context);
    if (contextContent) {
      this.#addLayer(contextContent, 4, "context");
    }
    return this;
  }

  /**
   * Sets a variable for substitution during build.
   *
   * Variables are replaced in the final prompt using `{{KEY}}` syntax.
   * Values are sanitized to prevent injection attacks.
   *
   * @param key - The variable name (alphanumeric and underscore only)
   * @param value - The value to substitute
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder
   *   .withBase("Write code in {{LANGUAGE}}.")
   *   .setVariable("LANGUAGE", "TypeScript");
   * // Result: "Write code in TypeScript."
   * ```
   */
  setVariable(key: string, value: string): this {
    const sanitizedValue = sanitizeVariable(value);
    this.#variables.set(key, sanitizedValue);
    return this;
  }

  // ===========================================================================
  // Build Methods
  // ===========================================================================

  /**
   * Builds the final prompt string.
   *
   * Combines all layers in priority order (1→2→3→4),
   * applies variable substitutions, and validates size.
   *
   * If a system prompt override is set, it completely replaces all layers.
   * Custom instructions are appended after all other content.
   *
   * @returns The complete prompt string
   * @throws {PromptSizeError} If the result exceeds MAX_PROMPT_SIZE
   *
   * @example
   * ```typescript
   * const prompt = new PromptBuilder()
   *   .withBase("System instructions")
   *   .withRole("coder", "Coding rules")
   *   .build();
   * ```
   */
  build(): string {
    let result: string;

    // Check for complete system prompt override
    if (this.#systemPromptOverride !== null) {
      result = this.#systemPromptOverride;
    } else {
      // Sort layers by priority (ascending: 1, 2, 3, 4)
      const sortedLayers = [...this.#layers].sort((a, b) => a.priority - b.priority);

      // Concatenate content with double newlines between layers
      result = sortedLayers
        .map((layer) => layer.content)
        .filter((content) => content.length > 0)
        .join("\n\n");
    }

    // Append custom instructions if present
    if (this.#customInstructions) {
      result = `${result}\n\n${this.#customInstructions}`;
    }

    // Apply variable substitutions
    result = this.#applyVariables(result);

    // Validate size
    if (result.length > MAX_PROMPT_SIZE) {
      throw new PromptSizeError(result.length, MAX_PROMPT_SIZE);
    }

    return result;
  }

  /**
   * Returns the character count of the built prompt.
   *
   * Useful for checking size before building or for metrics.
   *
   * @returns The character count of the built prompt
   *
   * @example
   * ```typescript
   * if (builder.getSize() > 100000) {
   *   console.warn("Prompt is getting large");
   * }
   * ```
   */
  getSize(): number {
    // Use the build logic to get accurate size
    let result: string;

    if (this.#systemPromptOverride !== null) {
      result = this.#systemPromptOverride;
    } else {
      const sortedLayers = [...this.#layers].sort((a, b) => a.priority - b.priority);
      result = sortedLayers
        .map((layer) => layer.content)
        .filter((content) => content.length > 0)
        .join("\n\n");
    }

    if (this.#customInstructions) {
      result = `${result}\n\n${this.#customInstructions}`;
    }

    result = this.#applyVariables(result);
    return result.length;
  }

  /**
   * Returns a readonly copy of the current layers.
   *
   * Useful for debugging or inspecting the builder state.
   *
   * @returns A readonly array of prompt layers
   *
   * @example
   * ```typescript
   * const layers = builder.getLayers();
   * console.log(`Builder has ${layers.length} layers`);
   * ```
   */
  getLayers(): readonly PromptLayer[] {
    // Return a copy to prevent external mutation
    return Object.freeze([...this.#layers]);
  }

  // ===========================================================================
  // Static Factory Methods
  // ===========================================================================

  /**
   * Creates a PromptBuilder from a legacy configuration object.
   *
   * Supports both simple legacy configs and full SystemPromptConfig format.
   * Maps legacy structure to the new builder pattern:
   * - `systemPrompt` → withBase()
   * - `rolePrompt` → withRole()
   * - `modePrompt` → withModeOverrides()
   * - `customInstructions` → sequential withBase() calls
   *
   * @param config - The legacy configuration object
   * @returns A new PromptBuilder instance
   *
   * @example
   * ```typescript
   * // Simple legacy config
   * const builder = PromptBuilder.fromLegacyConfig({
   *   systemPrompt: "You are an AI assistant.",
   *   rolePrompt: "You write code."
   * });
   *
   * // SystemPromptConfig format
   * const builder = PromptBuilder.fromLegacyConfig({
   *   mode: "code",
   *   modePrompt: "Focus on implementation.",
   *   customInstructions: ["Use TypeScript", "Follow DRY"]
   * });
   * ```
   */
  static fromLegacyConfig(config: unknown): PromptBuilder {
    const builder = new PromptBuilder();

    if (!config || typeof config !== "object") {
      return builder;
    }

    const legacyConfig = config as Record<string, unknown>;

    // Handle systemPrompt (base instructions)
    if (typeof legacyConfig.systemPrompt === "string" && legacyConfig.systemPrompt.trim()) {
      builder.withBase(legacyConfig.systemPrompt);
    }

    // Handle rolePrompt (role-specific instructions)
    if (typeof legacyConfig.rolePrompt === "string" && legacyConfig.rolePrompt.trim()) {
      // Determine role from config or default to orchestrator
      const role = (
        typeof legacyConfig.role === "string" ? legacyConfig.role : "orchestrator"
      ) as AgentRole;
      builder.withRole(role, legacyConfig.rolePrompt);
    }

    // Handle modePrompt (mode-specific overrides)
    if (typeof legacyConfig.modePrompt === "string" && legacyConfig.modePrompt.trim()) {
      builder.withModeOverrides(legacyConfig.modePrompt);
    }

    // Handle customInstructions array
    if (Array.isArray(legacyConfig.customInstructions)) {
      for (const instruction of legacyConfig.customInstructions) {
        if (typeof instruction === "string" && instruction.trim()) {
          // Custom instructions are added as base layers (lower priority handled by order)
          builder.#addLayer(instruction.trim(), 4, "context");
        }
      }
    }

    // Handle providerType for variable substitution
    if (typeof legacyConfig.providerType === "string") {
      builder.setVariable("PROVIDER", legacyConfig.providerType);
    }

    // Handle mode for variable substitution
    if (typeof legacyConfig.mode === "string") {
      builder.setVariable("MODE", legacyConfig.mode);
    }

    // Handle cwd for variable substitution
    if (typeof legacyConfig.cwd === "string") {
      builder.setVariable("CWD", legacyConfig.cwd);
    }

    return builder;
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Adds a layer to the internal collection.
   *
   * @param content - The layer content
   * @param priority - The priority level (1-4)
   * @param source - The layer source
   */
  #addLayer(content: string, priority: PromptPriority, source: PromptLayerSource): void {
    if (!content || content.trim().length === 0) {
      return; // Skip empty content
    }

    this.#layers.push({
      content: content.trim(),
      priority,
      source,
    });
  }

  /**
   * Applies variable substitutions to the content.
   *
   * @param content - The content with variable placeholders
   * @returns The content with variables replaced
   */
  #applyVariables(content: string): string {
    return content.replace(VARIABLE_PATTERN, (match, key: string) => {
      const value = this.#variables.get(key);
      return value !== undefined ? value : match; // Keep original if not found
    });
  }
}
