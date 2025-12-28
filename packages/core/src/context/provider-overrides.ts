/**
 * Provider Context Window Override System
 *
 * Handles context window overrides for non-standard models accessed through
 * different providers. For example, when using DeepSeek models via OpenAI-compatible
 * APIs, the context window may differ from what OpenAI reports.
 *
 * @module @vellum/core/context/provider-overrides
 * @see REQ-PRV-001 Provider Context Window Overrides
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Provider override configuration for non-standard models.
 *
 * Defines context window overrides for models accessed through providers
 * that may not correctly report their capabilities.
 *
 * @example
 * ```typescript
 * const override: ProviderOverride = {
 *   provider: 'openai',
 *   modelPattern: 'deepseek-*',
 *   contextWindow: 64000,
 *   description: 'DeepSeek models via OpenAI-compatible API',
 * };
 * ```
 */
export interface ProviderOverride {
  /** Provider name (e.g., 'openai', 'anthropic') */
  readonly provider: string;
  /** Model pattern (glob or exact match, case-insensitive) */
  readonly modelPattern: string;
  /** Override context window size in tokens */
  readonly contextWindow: number;
  /** Optional description for documentation */
  readonly description?: string;
}

// ============================================================================
// Built-in Overrides
// ============================================================================

/**
 * Built-in provider overrides for models accessed through different providers.
 *
 * These overrides handle common cases where models are accessed through
 * OpenAI-compatible APIs but have different context windows than what
 * the provider might report.
 *
 * @example
 * ```typescript
 * // DeepSeek via OpenAI-compatible API
 * getContextWindowOverride('openai', 'deepseek-chat'); // 64000
 * ```
 */
export const PROVIDER_OVERRIDES: readonly ProviderOverride[] = [
  // ──────────────────────────────────────────────────────────────────────────
  // DeepSeek models via OpenAI-compatible API
  // ──────────────────────────────────────────────────────────────────────────
  {
    provider: "openai",
    modelPattern: "deepseek-*",
    contextWindow: 64_000,
    description: "DeepSeek models via OpenAI-compatible API",
  },
  {
    provider: "openai",
    modelPattern: "deepseek-chat",
    contextWindow: 64_000,
  },
  {
    provider: "openai",
    modelPattern: "deepseek-coder",
    contextWindow: 64_000,
  },

  // ──────────────────────────────────────────────────────────────────────────
  // Qwen models via OpenAI-compatible API
  // ──────────────────────────────────────────────────────────────────────────
  {
    provider: "openai",
    modelPattern: "qwen-*",
    contextWindow: 128_000,
    description: "Qwen models via OpenAI-compatible API",
  },
  {
    provider: "openai",
    modelPattern: "qwen2.5-*",
    contextWindow: 128_000,
  },

  // ──────────────────────────────────────────────────────────────────────────
  // Mistral models via OpenAI-compatible API
  // ──────────────────────────────────────────────────────────────────────────
  {
    provider: "openai",
    modelPattern: "mistral-*",
    contextWindow: 32_000,
    description: "Mistral models via OpenAI-compatible API",
  },

  // ──────────────────────────────────────────────────────────────────────────
  // Local models (Ollama, LM Studio) - conservative default
  // ──────────────────────────────────────────────────────────────────────────
  {
    provider: "openai",
    modelPattern: "local-*",
    contextWindow: 8_192,
    description: "Local models with unknown context windows",
  },
] as const;

// ============================================================================
// Custom Overrides Storage
// ============================================================================

/**
 * Runtime storage for custom provider overrides.
 * These are added via `addProviderOverride()` and can be cleared.
 */
const customOverrides: ProviderOverride[] = [];

// ============================================================================
// Pattern Matching
// ============================================================================

/**
 * Check if a model matches a pattern (supports * glob).
 *
 * Pattern matching rules:
 * - `*` matches any sequence of characters (including empty)
 * - Matching is case-insensitive
 * - Exact match takes precedence in override lookup
 *
 * @param model - The model identifier to match
 * @param pattern - The pattern to match against (supports * wildcard)
 * @returns true if model matches the pattern
 *
 * @example
 * ```typescript
 * matchesPattern('deepseek-chat', 'deepseek-*');    // true
 * matchesPattern('deepseek-coder', 'deepseek-*');   // true
 * matchesPattern('gpt-4o', 'deepseek-*');           // false
 * matchesPattern('DeepSeek-Chat', 'deepseek-*');    // true (case-insensitive)
 * ```
 */
function matchesPattern(model: string, pattern: string): boolean {
  // Case-insensitive matching
  const lowerModel = model.toLowerCase();
  const lowerPattern = pattern.toLowerCase();

  // Exact match (no wildcards)
  if (!lowerPattern.includes("*")) {
    return lowerModel === lowerPattern;
  }

  // Convert glob pattern to regex
  // Escape special regex chars, then convert * to .*
  const regexPattern = lowerPattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&") // Escape special chars
    .replace(/\*/g, ".*"); // Convert * to .*

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(lowerModel);
}

// ============================================================================
// Override Lookup
// ============================================================================

/**
 * Get context window override for a model accessed through a specific provider.
 *
 * Looks up overrides in order:
 * 1. Custom overrides (added at runtime)
 * 2. Built-in overrides
 *
 * Within each category, exact matches are checked before glob patterns.
 *
 * @param provider - The provider being used (e.g., 'openai')
 * @param model - The model identifier
 * @returns Override context window or null if no override applies
 *
 * @example
 * ```typescript
 * // DeepSeek via OpenAI API
 * getContextWindowOverride('openai', 'deepseek-chat'); // 64000
 *
 * // Qwen via OpenAI API
 * getContextWindowOverride('openai', 'qwen2.5-72b'); // 128000
 *
 * // Regular OpenAI model (no override)
 * getContextWindowOverride('openai', 'gpt-4o'); // null
 * ```
 */
export function getContextWindowOverride(provider: string, model: string): number | null {
  const lowerProvider = provider.toLowerCase();

  // Check all overrides: custom first, then built-in
  const allOverrides = [...customOverrides, ...PROVIDER_OVERRIDES];

  // First pass: exact matches only
  for (const override of allOverrides) {
    if (
      override.provider.toLowerCase() === lowerProvider &&
      !override.modelPattern.includes("*") &&
      override.modelPattern.toLowerCase() === model.toLowerCase()
    ) {
      return override.contextWindow;
    }
  }

  // Second pass: glob pattern matches
  for (const override of allOverrides) {
    if (
      override.provider.toLowerCase() === lowerProvider &&
      override.modelPattern.includes("*") &&
      matchesPattern(model, override.modelPattern)
    ) {
      return override.contextWindow;
    }
  }

  return null;
}

// ============================================================================
// Override Management
// ============================================================================

/**
 * Add a custom provider override at runtime.
 *
 * Custom overrides take precedence over built-in overrides.
 * Use this to add overrides for models not covered by the built-in list,
 * or to override built-in values for specific use cases.
 *
 * @param override - The override configuration to add
 *
 * @example
 * ```typescript
 * // Add custom override for a local model
 * addProviderOverride({
 *   provider: 'openai',
 *   modelPattern: 'my-local-model',
 *   contextWindow: 16384,
 *   description: 'My local fine-tuned model',
 * });
 * ```
 */
export function addProviderOverride(override: ProviderOverride): void {
  customOverrides.push(override);
}

/**
 * Get all provider overrides (built-in + custom).
 *
 * Returns custom overrides first (higher precedence), followed by built-in overrides.
 *
 * @returns All registered provider overrides
 *
 * @example
 * ```typescript
 * const overrides = getAllOverrides();
 * console.log(`${overrides.length} overrides registered`);
 * ```
 */
export function getAllOverrides(): readonly ProviderOverride[] {
  return [...customOverrides, ...PROVIDER_OVERRIDES];
}

/**
 * Clear all custom overrides, keeping only built-in overrides.
 *
 * Use this to reset runtime overrides, typically in tests
 * or when reloading configuration.
 *
 * @example
 * ```typescript
 * addProviderOverride({ ... });
 * // ... later
 * clearCustomOverrides();
 * // Only built-in overrides remain
 * ```
 */
export function clearCustomOverrides(): void {
  customOverrides.length = 0;
}
