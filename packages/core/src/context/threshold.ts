/**
 * Context Management System - Threshold Configuration Module
 *
 * Provides model-specific threshold configuration for context state management.
 * Implements REQ-CFG-002 for model-specific threshold optimization.
 *
 * Features:
 * - Predefined threshold profiles (conservative, balanced, aggressive)
 * - Built-in configurations for common models
 * - Glob pattern matching for model families (* wildcard)
 * - Runtime customization support
 * - Threshold validation
 *
 * @module @vellum/core/context/threshold
 */

import type { ThresholdConfig } from "./types.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Threshold profile for different model characteristics.
 *
 * - `conservative`: Start actions early, more headroom (for high-cost models)
 * - `balanced`: Standard thresholds for most models
 * - `aggressive`: Delay actions, maximize context usage (for smaller windows)
 */
export type ThresholdProfile = "conservative" | "balanced" | "aggressive";

/**
 * Model-specific threshold configuration entry.
 *
 * @example
 * ```typescript
 * const config: ModelThresholdConfig = {
 *   model: 'claude-3-opus',
 *   profile: 'conservative',
 *   reason: 'High cost model, prefer early compression',
 * };
 * ```
 */
export interface ModelThresholdConfig {
  /** Model name or pattern (supports * wildcard) */
  readonly model: string;

  /** Threshold profile to use */
  readonly profile: ThresholdProfile;

  /** Custom thresholds (override profile defaults) */
  readonly thresholds?: Partial<ThresholdConfig>;

  /** Reason for this configuration */
  readonly reason?: string;
}

// ============================================================================
// Threshold Profiles
// ============================================================================

/**
 * Threshold profiles with predefined values.
 *
 * - **Conservative**: Start actions early (70/80/90%), more headroom
 *   - Best for: High-cost models, reasoning-heavy models
 *
 * - **Balanced**: Standard thresholds (75/85/95%)
 *   - Best for: General purpose models, medium context windows
 *
 * - **Aggressive**: Delay actions (85/92/97%), maximize context usage
 *   - Best for: Smaller context windows, cost-sensitive usage
 */
export const THRESHOLD_PROFILES: Record<ThresholdProfile, ThresholdConfig> = {
  conservative: {
    warning: 0.7,
    critical: 0.8,
    overflow: 0.9,
  },
  balanced: {
    warning: 0.75,
    critical: 0.85,
    overflow: 0.95,
  },
  aggressive: {
    warning: 0.85,
    critical: 0.92,
    overflow: 0.97,
  },
};

// ============================================================================
// Built-in Model Configurations
// ============================================================================

/**
 * Built-in model-specific threshold configurations.
 *
 * These configurations are based on model characteristics:
 * - Cost (high cost = conservative to minimize token usage)
 * - Context window size (smaller = aggressive to maximize usage)
 * - Model type (reasoning models need more headroom)
 */
const BUILT_IN_MODEL_THRESHOLDS: ModelThresholdConfig[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // Anthropic Claude Models
  // ─────────────────────────────────────────────────────────────────────────

  // Claude Opus - conservative due to higher cost
  {
    model: "claude-3-opus*",
    profile: "conservative",
    reason: "High cost model, prefer early compression",
  },
  {
    model: "claude-opus-4*",
    profile: "conservative",
    reason: "High cost model, prefer early compression",
  },

  // Claude Sonnet - balanced
  {
    model: "claude-3-5-sonnet*",
    profile: "balanced",
  },
  {
    model: "claude-3.5-sonnet*",
    profile: "balanced",
  },
  {
    model: "claude-sonnet-4*",
    profile: "balanced",
  },

  // Claude Haiku - balanced (lower cost but also smaller)
  {
    model: "claude-3-5-haiku*",
    profile: "balanced",
  },
  {
    model: "claude-3.5-haiku*",
    profile: "balanced",
  },

  // ─────────────────────────────────────────────────────────────────────────
  // DeepSeek Models
  // ─────────────────────────────────────────────────────────────────────────

  // DeepSeek - aggressive to maximize smaller window (per REQ-CFG-002)
  {
    model: "deepseek*",
    profile: "aggressive",
    reason: "Smaller context window, maximize usage",
  },

  // ─────────────────────────────────────────────────────────────────────────
  // OpenAI GPT Models
  // ─────────────────────────────────────────────────────────────────────────

  // GPT-4o variants - balanced
  {
    model: "gpt-4o*",
    profile: "balanced",
  },

  // GPT-4 Turbo - balanced
  {
    model: "gpt-4-turbo*",
    profile: "balanced",
  },

  // GPT-4 base - balanced
  {
    model: "gpt-4",
    profile: "balanced",
  },

  // o1 reasoning models - conservative (need headroom for reasoning)
  {
    model: "o1*",
    profile: "conservative",
    reason: "Reasoning models need more headroom for chain-of-thought",
  },

  // o3 reasoning models - conservative
  {
    model: "o3*",
    profile: "conservative",
    reason: "Reasoning models need more headroom for chain-of-thought",
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Google Gemini Models
  // ─────────────────────────────────────────────────────────────────────────

  // Gemini - aggressive for large windows (per REQ-CFG-002)
  // Note: Gemini has very large context windows (1M+), so aggressive is appropriate
  {
    model: "gemini*",
    profile: "aggressive",
    thresholds: {
      warning: 0.88,
      critical: 0.94,
      overflow: 0.98,
    },
    reason: "Very large context window, aggressive thresholds",
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Mistral Models
  // ─────────────────────────────────────────────────────────────────────────

  {
    model: "mistral*",
    profile: "balanced",
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Llama Models
  // ─────────────────────────────────────────────────────────────────────────

  {
    model: "llama*",
    profile: "balanced",
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Qwen Models
  // ─────────────────────────────────────────────────────────────────────────

  {
    model: "qwen*",
    profile: "balanced",
  },
];

// ============================================================================
// Runtime State
// ============================================================================

/**
 * Custom model thresholds added at runtime.
 * These take precedence over built-in configurations.
 */
let customModelThresholds: ModelThresholdConfig[] = [];

// ============================================================================
// Pattern Matching
// ============================================================================

/**
 * Check if a model name matches a pattern.
 *
 * Supports * wildcard for glob-style matching:
 * - `claude-3*` matches `claude-3-opus`, `claude-3-5-sonnet`, etc.
 * - `*-turbo` matches `gpt-4-turbo`, `gpt-3.5-turbo`, etc.
 * - `gpt-4` matches only `gpt-4` (exact match)
 *
 * @param model - The model name to check
 * @param pattern - The pattern to match against (supports * wildcard)
 * @returns True if the model matches the pattern
 *
 * @example
 * ```typescript
 * matchesModelPattern('deepseek-chat', 'deepseek*'); // true
 * matchesModelPattern('gpt-4-turbo', 'gpt-4'); // false (exact match)
 * matchesModelPattern('gpt-4', 'gpt-4'); // true
 * ```
 */
export function matchesModelPattern(model: string, pattern: string): boolean {
  // Normalize both to lowercase for case-insensitive matching
  const normalizedModel = model.toLowerCase();
  const normalizedPattern = pattern.toLowerCase();

  // If no wildcard, require exact match
  if (!normalizedPattern.includes("*")) {
    return normalizedModel === normalizedPattern;
  }

  // Convert glob pattern to regex
  // Escape special regex characters except *
  const regexPattern = normalizedPattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&") // Escape special chars
    .replace(/\*/g, ".*"); // Convert * to .*

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(normalizedModel);
}

// ============================================================================
// Threshold Resolution
// ============================================================================

/**
 * Find the matching model configuration.
 *
 * Search order:
 * 1. Custom thresholds (most recent first)
 * 2. Built-in thresholds (in order)
 *
 * @param model - The model name to find configuration for
 * @returns The matching configuration or undefined
 */
function findModelConfig(model: string): ModelThresholdConfig | undefined {
  // Search custom thresholds first (most recent takes precedence)
  for (let i = customModelThresholds.length - 1; i >= 0; i--) {
    const config = customModelThresholds[i];
    if (config && matchesModelPattern(model, config.model)) {
      return config;
    }
  }

  // Search built-in thresholds
  for (const config of BUILT_IN_MODEL_THRESHOLDS) {
    if (matchesModelPattern(model, config.model)) {
      return config;
    }
  }

  return undefined;
}

/**
 * Get the threshold profile for a model.
 *
 * @param model - The model identifier
 * @returns The threshold profile (defaults to 'balanced' if no match)
 *
 * @example
 * ```typescript
 * getThresholdProfile('deepseek-chat'); // 'aggressive'
 * getThresholdProfile('claude-3-opus-20240229'); // 'conservative'
 * getThresholdProfile('unknown-model'); // 'balanced'
 * ```
 */
export function getThresholdProfile(model: string): ThresholdProfile {
  const config = findModelConfig(model);
  return config?.profile ?? "balanced";
}

/**
 * Get threshold configuration for a specific model.
 *
 * Resolution order:
 * 1. Custom thresholds from model config (if any)
 * 2. Profile defaults
 * 3. Default profile (balanced) if no match
 *
 * @param model - Model identifier
 * @param defaultProfile - Default profile if no match (default: 'balanced')
 * @returns Threshold configuration
 *
 * @example
 * ```typescript
 * const thresholds = getThresholdConfig('deepseek-chat');
 * // { warning: 0.85, critical: 0.92, overflow: 0.97 }
 *
 * const claudeThresholds = getThresholdConfig('claude-3-opus');
 * // { warning: 0.70, critical: 0.80, overflow: 0.90 }
 *
 * const geminiThresholds = getThresholdConfig('gemini-1.5-pro');
 * // { warning: 0.88, critical: 0.94, overflow: 0.98 } (custom overrides)
 * ```
 */
export function getThresholdConfig(
  model: string,
  defaultProfile: ThresholdProfile = "balanced"
): ThresholdConfig {
  const config = findModelConfig(model);

  if (!config) {
    // No match, use default profile
    return { ...THRESHOLD_PROFILES[defaultProfile] };
  }

  // Get base thresholds from profile
  const baseThresholds = THRESHOLD_PROFILES[config.profile];

  // Apply custom threshold overrides if present
  if (config.thresholds) {
    return {
      warning: config.thresholds.warning ?? baseThresholds.warning,
      critical: config.thresholds.critical ?? baseThresholds.critical,
      overflow: config.thresholds.overflow ?? baseThresholds.overflow,
    };
  }

  return { ...baseThresholds };
}

// ============================================================================
// Runtime Customization
// ============================================================================

/**
 * Add a custom model threshold configuration at runtime.
 *
 * Custom configurations take precedence over built-in configurations.
 * Later additions take precedence over earlier ones.
 *
 * @param config - The model threshold configuration to add
 *
 * @example
 * ```typescript
 * // Add custom threshold for a specific model
 * addModelThreshold({
 *   model: 'my-custom-model',
 *   profile: 'conservative',
 *   reason: 'Custom deployment needs more headroom',
 * });
 *
 * // Override built-in with custom thresholds
 * addModelThreshold({
 *   model: 'gpt-4o*',
 *   profile: 'aggressive',
 *   thresholds: { warning: 0.88, critical: 0.93, overflow: 0.98 },
 *   reason: 'Organization prefers aggressive usage',
 * });
 * ```
 */
export function addModelThreshold(config: ModelThresholdConfig): void {
  customModelThresholds.push(config);
}

/**
 * Clear all custom model thresholds.
 *
 * Only removes runtime-added configurations, built-in configurations remain.
 * Useful for testing or resetting state.
 *
 * @example
 * ```typescript
 * addModelThreshold({ model: 'test-model', profile: 'aggressive' });
 * clearCustomThresholds();
 * // test-model now uses default (balanced) profile
 * ```
 */
export function clearCustomThresholds(): void {
  customModelThresholds = [];
}

/**
 * Get all threshold configurations (built-in and custom).
 *
 * Custom configurations are listed first (most recent first),
 * followed by built-in configurations.
 *
 * @returns Read-only array of all model threshold configurations
 *
 * @example
 * ```typescript
 * const all = getAllThresholdConfigs();
 * for (const config of all) {
 *   console.log(`${config.model}: ${config.profile}`);
 * }
 * ```
 */
export function getAllThresholdConfigs(): readonly ModelThresholdConfig[] {
  // Return custom (reversed for precedence order) + built-in
  return [...[...customModelThresholds].reverse(), ...BUILT_IN_MODEL_THRESHOLDS];
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validation result for threshold configuration.
 */
export interface ThresholdValidationResult {
  /** Whether the thresholds are valid */
  readonly valid: boolean;
  /** List of validation errors (empty if valid) */
  readonly errors: readonly string[];
}

/**
 * Validate threshold values are in valid range and order.
 *
 * Validates:
 * - All values are between 0 and 1 (exclusive)
 * - Correct ordering: warning < critical < overflow
 *
 * @param thresholds - The threshold configuration to validate
 * @returns Validation result with errors if invalid
 *
 * @example
 * ```typescript
 * const result = validateThresholds({ warning: 0.75, critical: 0.85, overflow: 0.95 });
 * // { valid: true, errors: [] }
 *
 * const invalid = validateThresholds({ warning: 0.90, critical: 0.85, overflow: 0.80 });
 * // { valid: false, errors: ['warning (0.90) must be less than critical (0.85)', ...] }
 * ```
 */
export function validateThresholds(thresholds: ThresholdConfig): ThresholdValidationResult {
  const errors: string[] = [];

  // Check range (0, 1)
  if (thresholds.warning <= 0 || thresholds.warning >= 1) {
    errors.push(`warning threshold (${thresholds.warning}) must be between 0 and 1 (exclusive)`);
  }
  if (thresholds.critical <= 0 || thresholds.critical >= 1) {
    errors.push(`critical threshold (${thresholds.critical}) must be between 0 and 1 (exclusive)`);
  }
  if (thresholds.overflow <= 0 || thresholds.overflow >= 1) {
    errors.push(`overflow threshold (${thresholds.overflow}) must be between 0 and 1 (exclusive)`);
  }

  // Check ordering
  if (thresholds.warning >= thresholds.critical) {
    errors.push(
      `warning threshold (${thresholds.warning}) must be less than critical threshold (${thresholds.critical})`
    );
  }
  if (thresholds.critical >= thresholds.overflow) {
    errors.push(
      `critical threshold (${thresholds.critical}) must be less than overflow threshold (${thresholds.overflow})`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// Re-exports for convenience
// ============================================================================

/**
 * Built-in model threshold configurations (read-only).
 *
 * @see getAllThresholdConfigs for combined built-in + custom configurations
 */
export const MODEL_THRESHOLDS: readonly ModelThresholdConfig[] = BUILT_IN_MODEL_THRESHOLDS;
