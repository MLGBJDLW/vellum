/**
 * Context Management System - Configuration Module
 *
 * Provides configuration interfaces, defaults, and validation for the
 * Context Management System. Implements REQ-CFG-001, REQ-CFG-002, and REQ-008.
 *
 * @module @vellum/core/context/config
 */

import { z } from "zod";

// ============================================================================
// Zod Schemas (REQ-008)
// ============================================================================

/**
 * Schema for truncation policy options.
 *
 * Defines how messages should be truncated when context limits are reached.
 */
export const TruncationPolicySchema = z.enum([
  /** Remove oldest messages first (FIFO) */
  "sliding-window",
  /** Compress older messages into summaries */
  "summary",
  /** Aggressive truncation for overflow scenarios */
  "aggressive",
  /** No automatic truncation (manual control) */
  "none",
]);

/** Type for truncation policy values */
export type TruncationPolicy = z.infer<typeof TruncationPolicySchema>;

/**
 * Schema for summary model fallback configuration.
 *
 * Defines the ordered list of models to try when generating summaries.
 * If one model fails, the next in the list is attempted.
 */
export const SummaryModelFallbackSchema = z.object({
  /** Ordered list of models to try for summarization */
  models: z.array(z.string()).min(1, "At least one summary model required"),
  /** Maximum retry attempts per model (default: 2) */
  maxRetriesPerModel: z.number().int().min(0).max(5).default(2),
  /** Timeout for each model attempt in milliseconds (default: 30000) */
  timeoutMs: z.number().int().min(1000).max(120000).default(30000),
});

/** Type for summary model fallback configuration */
export type SummaryModelFallback = z.infer<typeof SummaryModelFallbackSchema>;

/**
 * Schema for protected tools configuration.
 *
 * Tools in this list will never be pruned or truncated during context management.
 */
export const ProtectedToolsSchema = z
  .array(z.string())
  .default(["skill", "memory_search", "code_review"]);

/** Type for protected tools list */
export type ProtectedTools = z.infer<typeof ProtectedToolsSchema>;

/**
 * Schema for custom threshold configuration.
 *
 * Defines warning, critical, and overflow thresholds as decimals (0.0-1.0).
 */
export const CustomThresholdsSchema = z
  .object({
    /** Budget ratio that triggers warning state (e.g., 0.75 = 75%) */
    warning: z.number().min(0).max(1),
    /** Budget ratio that triggers critical state (e.g., 0.85 = 85%) */
    critical: z.number().min(0).max(1),
    /** Budget ratio that triggers overflow state (e.g., 0.95 = 95%) */
    overflow: z.number().min(0).max(1),
  })
  .refine((data) => data.warning < data.critical && data.critical < data.overflow, {
    message: "Thresholds must be in order: warning < critical < overflow",
  });

/** Type for custom thresholds */
export type CustomThresholds = z.infer<typeof CustomThresholdsSchema>;

/**
 * Complete schema for context manager configuration with Zod validation.
 *
 * This schema can be used to validate configuration objects from external sources
 * (e.g., configuration files, environment variables).
 *
 * @example
 * ```typescript
 * const config = ContextManagerConfigSchema.parse({
 *   maxContextWindow: 200_000,
 *   truncationPolicy: 'summary',
 *   summaryModelFallback: {
 *     models: ['gpt-4o-mini', 'claude-3-haiku'],
 *     maxRetriesPerModel: 2,
 *   },
 * });
 * ```
 */
export const ContextManagerConfigSchema = z
  .object({
    // Token management
    maxContextWindow: z.number().int().positive().optional(),
    outputReserve: z.number().int().nonnegative().optional(),
    systemReserve: z.number().int().nonnegative().optional(),

    // Thresholds
    warningThreshold: z.number().min(0).max(1).optional(),
    criticalThreshold: z.number().min(0).max(1).optional(),
    overflowThreshold: z.number().min(0).max(1).optional(),

    // Behavior flags
    useAutoCondense: z.boolean().optional(),
    preserveToolPairs: z.boolean().optional(),
    maxCheckpoints: z.number().int().nonnegative().optional(),

    // Pruning settings
    maxToolOutputChars: z.number().int().nonnegative().optional(),
    protectedTools: ProtectedToolsSchema.optional(),

    // Cache settings
    tokenCacheSize: z.number().int().nonnegative().optional(),
    tokenCacheTTL: z.number().int().nonnegative().optional(),

    // REQ-008: New compaction system fields
    truncationPolicy: TruncationPolicySchema.optional(),
    summaryModelFallback: SummaryModelFallbackSchema.optional(),
    customThresholds: CustomThresholdsSchema.optional(),
  })
  .refine(
    (data) => {
      // Validate threshold ordering if multiple are provided
      const warning = data.warningThreshold ?? 0.75;
      const critical = data.criticalThreshold ?? 0.85;
      const overflow = data.overflowThreshold ?? 0.95;
      return warning < critical && critical < overflow;
    },
    {
      message:
        "Thresholds must be in order: warningThreshold < criticalThreshold < overflowThreshold",
    }
  );

// ============================================================================
// Configuration Interface
// ============================================================================

/**
 * Configuration options for the Context Manager.
 *
 * All properties are optional and will be merged with DEFAULT_CONFIG
 * when creating a configuration via `createConfig()`.
 *
 * @example
 * ```typescript
 * const config = createConfig({
 *   maxContextWindow: 200_000,
 *   warningThreshold: 0.8,
 *   useAutoCondense: false, // Disable LLM compression
 * });
 * ```
 */
export interface ContextManagerConfig {
  // ─────────────────────────────────────────────────────────────────────────
  // Token Management
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Override the model's context window size.
   *
   * If not specified, the actual model context window from the provider
   * will be used. Useful for testing or constraining context usage.
   *
   * @default 128000 (128K tokens)
   */
  maxContextWindow?: number;

  /**
   * Tokens reserved for model output/response.
   *
   * This reserve ensures the model has space to generate responses.
   * The value depends on expected response length and model capabilities.
   *
   * @default 8192 (8K tokens)
   */
  outputReserve?: number;

  /**
   * Tokens reserved for system prompt and tool definitions.
   *
   * System prompts and tool schemas consume tokens but are essential
   * for proper model behavior. This reserve protects that allocation.
   *
   * @default 4000 (4K tokens)
   */
  systemReserve?: number;

  // ─────────────────────────────────────────────────────────────────────────
  // Thresholds (percentages of budget, expressed as decimals 0.0-1.0)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Budget utilization ratio that triggers warning state.
   *
   * When context usage exceeds this threshold, the system starts
   * pruning tool outputs to reclaim space.
   *
   * Must be: 0 < warningThreshold < criticalThreshold
   *
   * @default 0.75 (75% of budget)
   */
  warningThreshold?: number;

  /**
   * Budget utilization ratio that triggers critical state.
   *
   * When context usage exceeds this threshold, the system applies
   * LLM-based compression (if enabled) and sliding window truncation.
   *
   * Must be: warningThreshold < criticalThreshold < overflowThreshold
   *
   * @default 0.85 (85% of budget)
   */
  criticalThreshold?: number;

  /**
   * Budget utilization ratio that triggers overflow/emergency state.
   *
   * When context usage exceeds this threshold, aggressive truncation
   * is applied to prevent API errors.
   *
   * Must be: criticalThreshold < overflowThreshold <= 1.0
   *
   * @default 0.95 (95% of budget)
   */
  overflowThreshold?: number;

  // ─────────────────────────────────────────────────────────────────────────
  // Behavior Flags
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Enable LLM-based automatic compression at critical threshold.
   *
   * When true, the system uses an LLM to summarize conversation history
   * while preserving semantic meaning. When false, only sliding window
   * truncation is used. (REQ-CFG-001)
   *
   * @default true
   */
  useAutoCondense?: boolean;

  /**
   * Preserve tool_use and tool_result blocks together.
   *
   * When true, tool pairs are never split during truncation. This
   * prevents API errors from orphaned tool blocks. (REQ-WIN-002)
   *
   * @default true
   */
  preserveToolPairs?: boolean;

  /**
   * Maximum number of checkpoints to retain (LRU eviction).
   *
   * Checkpoints enable rollback after compression. Older checkpoints
   * are evicted when the limit is reached.
   *
   * @default 5
   */
  maxCheckpoints?: number;

  // ─────────────────────────────────────────────────────────────────────────
  // Pruning Settings
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Maximum character length for tool output before truncation.
   *
   * Tool results exceeding this length are truncated with a marker
   * indicating the omitted content.
   *
   * @default 10000 (10K characters)
   */
  maxToolOutputChars?: number;

  /**
   * Tool names that should never be pruned or truncated.
   *
   * These tools contain critical information that must be preserved
   * regardless of context pressure.
   *
   * @default ['skill', 'memory_search', 'code_review']
   */
  protectedTools?: string[];

  // ─────────────────────────────────────────────────────────────────────────
  // Cache Settings
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Maximum entries in the token count LRU cache.
   *
   * Caching token counts improves performance when the same content
   * is counted multiple times.
   *
   * @default 1000
   */
  tokenCacheSize?: number;

  /**
   * Token cache entry time-to-live in milliseconds.
   *
   * Entries older than this are treated as cache misses.
   *
   * @default 300000 (5 minutes)
   */
  tokenCacheTTL?: number;

  // ─────────────────────────────────────────────────────────────────────────
  // REQ-008: Compaction System Settings
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Truncation policy to use when context limits are reached.
   *
   * - `sliding-window`: Remove oldest messages first (FIFO)
   * - `summary`: Compress older messages into summaries (requires LLM)
   * - `aggressive`: Aggressive truncation for overflow scenarios
   * - `none`: No automatic truncation (manual control)
   *
   * @default 'sliding-window'
   */
  truncationPolicy?: TruncationPolicy;

  /**
   * Configuration for summary model fallback chain.
   *
   * When generating summaries, models are tried in order. If one fails,
   * the next model in the list is attempted.
   *
   * @example
   * ```typescript
   * summaryModelFallback: {
   *   models: ['gpt-4o-mini', 'claude-3-haiku', 'gemini-1.5-flash'],
   *   maxRetriesPerModel: 2,
   *   timeoutMs: 30000,
   * }
   * ```
   */
  summaryModelFallback?: SummaryModelFallback;

  /**
   * Custom threshold configuration for context state transitions.
   *
   * Override the default thresholds with custom values.
   * Use this for fine-grained control over when context management
   * actions are triggered.
   */
  customThresholds?: CustomThresholds;
}

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default configuration values for the Context Manager.
 *
 * These sensible defaults are suitable for most use cases with
 * modern LLMs (Claude, GPT-4, Gemini, etc.).
 *
 * @example
 * ```typescript
 * // Use all defaults
 * const config = createConfig();
 *
 * // Override specific values
 * const customConfig = createConfig({
 *   maxContextWindow: 64_000,
 *   warningThreshold: 0.7,
 * });
 * ```
 */
export const DEFAULT_CONFIG: Required<ContextManagerConfig> = {
  // Token management
  maxContextWindow: 128_000,
  outputReserve: 8192,
  systemReserve: 4000,

  // Thresholds (as decimals)
  warningThreshold: 0.75,
  criticalThreshold: 0.85,
  overflowThreshold: 0.95,

  // Behavior flags
  useAutoCondense: true,
  preserveToolPairs: true,
  maxCheckpoints: 5,

  // Pruning settings
  maxToolOutputChars: 10_000,
  protectedTools: ["skill", "memory_search", "code_review"],

  // Cache settings
  tokenCacheSize: 1000,
  tokenCacheTTL: 5 * 60 * 1000, // 5 minutes

  // REQ-008: Compaction system settings
  truncationPolicy: "sliding-window",
  summaryModelFallback: {
    models: ["gpt-4o-mini", "claude-3-haiku-20240307", "gemini-1.5-flash"],
    maxRetriesPerModel: 2,
    timeoutMs: 30000,
  },
  customThresholds: {
    warning: 0.75,
    critical: 0.85,
    overflow: 0.95,
  },
} as const;

// ============================================================================
// Validation Result
// ============================================================================

/**
 * Result of configuration validation.
 */
export interface ConfigValidationResult {
  /** Whether the configuration is valid */
  readonly valid: boolean;
  /** List of validation error messages (empty if valid) */
  readonly errors: readonly string[];
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a complete configuration by merging partial config with defaults.
 *
 * This is the recommended way to create a configuration object, as it
 * ensures all required properties are present with sensible defaults.
 *
 * @param partial - Optional partial configuration to override defaults
 * @returns Complete configuration with all properties defined
 *
 * @example
 * ```typescript
 * // Use all defaults
 * const defaultConfig = createConfig();
 *
 * // Override specific values
 * const customConfig = createConfig({
 *   maxContextWindow: 200_000,
 *   useAutoCondense: false,
 *   protectedTools: ['skill', 'memory_search'],
 * });
 * ```
 */
export function createConfig(
  partial?: Partial<ContextManagerConfig>
): Required<ContextManagerConfig> {
  if (!partial) {
    return { ...DEFAULT_CONFIG };
  }

  return {
    // Token management
    maxContextWindow: partial.maxContextWindow ?? DEFAULT_CONFIG.maxContextWindow,
    outputReserve: partial.outputReserve ?? DEFAULT_CONFIG.outputReserve,
    systemReserve: partial.systemReserve ?? DEFAULT_CONFIG.systemReserve,

    // Thresholds
    warningThreshold: partial.warningThreshold ?? DEFAULT_CONFIG.warningThreshold,
    criticalThreshold: partial.criticalThreshold ?? DEFAULT_CONFIG.criticalThreshold,
    overflowThreshold: partial.overflowThreshold ?? DEFAULT_CONFIG.overflowThreshold,

    // Behavior flags
    useAutoCondense: partial.useAutoCondense ?? DEFAULT_CONFIG.useAutoCondense,
    preserveToolPairs: partial.preserveToolPairs ?? DEFAULT_CONFIG.preserveToolPairs,
    maxCheckpoints: partial.maxCheckpoints ?? DEFAULT_CONFIG.maxCheckpoints,

    // Pruning settings
    maxToolOutputChars: partial.maxToolOutputChars ?? DEFAULT_CONFIG.maxToolOutputChars,
    protectedTools: partial.protectedTools ?? [...DEFAULT_CONFIG.protectedTools],

    // Cache settings
    tokenCacheSize: partial.tokenCacheSize ?? DEFAULT_CONFIG.tokenCacheSize,
    tokenCacheTTL: partial.tokenCacheTTL ?? DEFAULT_CONFIG.tokenCacheTTL,

    // REQ-008: Compaction system settings
    truncationPolicy: partial.truncationPolicy ?? DEFAULT_CONFIG.truncationPolicy,
    summaryModelFallback: partial.summaryModelFallback ?? {
      ...DEFAULT_CONFIG.summaryModelFallback,
    },
    customThresholds: partial.customThresholds ?? { ...DEFAULT_CONFIG.customThresholds },
  };
}

// ============================================================================
// Validation Function
// ============================================================================

/**
 * Validate a context manager configuration.
 *
 * Checks that:
 * - Thresholds are in valid range (0-1)
 * - Thresholds are in correct order (warning < critical < overflow)
 * - Numeric values are positive where required
 *
 * @param config - Configuration to validate
 * @returns Validation result with any error messages
 *
 * @example
 * ```typescript
 * const config = { warningThreshold: 0.9, criticalThreshold: 0.8 };
 * const result = validateConfig(config);
 *
 * if (!result.valid) {
 *   console.error('Invalid config:', result.errors);
 *   // ['warningThreshold (0.9) must be less than criticalThreshold (0.8)']
 * }
 * ```
 */
export function validateConfig(config: ContextManagerConfig): ConfigValidationResult {
  const errors: string[] = [];

  // ─────────────────────────────────────────────────────────────────────────
  // Threshold Range Validation (0-1)
  // ─────────────────────────────────────────────────────────────────────────

  if (config.warningThreshold !== undefined) {
    if (config.warningThreshold < 0 || config.warningThreshold > 1) {
      errors.push(`warningThreshold must be between 0 and 1, got ${config.warningThreshold}`);
    }
  }

  if (config.criticalThreshold !== undefined) {
    if (config.criticalThreshold < 0 || config.criticalThreshold > 1) {
      errors.push(`criticalThreshold must be between 0 and 1, got ${config.criticalThreshold}`);
    }
  }

  if (config.overflowThreshold !== undefined) {
    if (config.overflowThreshold < 0 || config.overflowThreshold > 1) {
      errors.push(`overflowThreshold must be between 0 and 1, got ${config.overflowThreshold}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Threshold Order Validation (warning < critical < overflow)
  // ─────────────────────────────────────────────────────────────────────────

  const warning = config.warningThreshold ?? DEFAULT_CONFIG.warningThreshold;
  const critical = config.criticalThreshold ?? DEFAULT_CONFIG.criticalThreshold;
  const overflow = config.overflowThreshold ?? DEFAULT_CONFIG.overflowThreshold;

  if (warning >= critical) {
    errors.push(`warningThreshold (${warning}) must be less than criticalThreshold (${critical})`);
  }

  if (critical >= overflow) {
    errors.push(
      `criticalThreshold (${critical}) must be less than overflowThreshold (${overflow})`
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Positive Number Validation
  // ─────────────────────────────────────────────────────────────────────────

  if (config.maxContextWindow !== undefined && config.maxContextWindow <= 0) {
    errors.push(`maxContextWindow must be positive, got ${config.maxContextWindow}`);
  }

  if (config.outputReserve !== undefined && config.outputReserve < 0) {
    errors.push(`outputReserve must be non-negative, got ${config.outputReserve}`);
  }

  if (config.systemReserve !== undefined && config.systemReserve < 0) {
    errors.push(`systemReserve must be non-negative, got ${config.systemReserve}`);
  }

  if (config.maxCheckpoints !== undefined && config.maxCheckpoints < 0) {
    errors.push(`maxCheckpoints must be non-negative, got ${config.maxCheckpoints}`);
  }

  if (config.maxToolOutputChars !== undefined && config.maxToolOutputChars < 0) {
    errors.push(`maxToolOutputChars must be non-negative, got ${config.maxToolOutputChars}`);
  }

  if (config.tokenCacheSize !== undefined && config.tokenCacheSize < 0) {
    errors.push(`tokenCacheSize must be non-negative, got ${config.tokenCacheSize}`);
  }

  if (config.tokenCacheTTL !== undefined && config.tokenCacheTTL < 0) {
    errors.push(`tokenCacheTTL must be non-negative, got ${config.tokenCacheTTL}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// Re-exports from types.ts for convenience
// ============================================================================

export { DEFAULT_THRESHOLDS, type ThresholdConfig } from "./types.js";
