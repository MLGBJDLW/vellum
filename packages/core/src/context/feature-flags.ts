/**
 * Feature Flags for Context Management Behaviors
 *
 * Provides runtime feature toggling for context management operations.
 * Flags can be configured via:
 * - Environment variables (VELLUM_CONTEXT_*)
 * - Programmatic configuration
 * - Default values
 *
 * @module @vellum/core/context
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Feature flags for context management behaviors.
 *
 * Each flag controls a specific aspect of context management:
 * - Compression: autoCondense, checkpointBeforeCompress
 * - Pruning: toolPruning, aggressiveTruncation
 * - Performance: tokenCaching, imageTokens
 * - Debugging: debugLogging
 *
 * @example
 * ```typescript
 * const flags: ContextFeatureFlags = {
 *   ...DEFAULT_FEATURE_FLAGS,
 *   debugLogging: true,
 * };
 * ```
 */
export interface ContextFeatureFlags {
  /** Enable automatic LLM-based compression when context exceeds threshold */
  autoCondense: boolean;

  /** Enable tool output pruning to reduce token usage */
  toolPruning: boolean;

  /** Enable checkpoint creation before compression for rollback support */
  checkpointBeforeCompress: boolean;

  /** Enable token count caching for performance optimization */
  tokenCaching: boolean;

  /** Enable debug logging for context operations */
  debugLogging: boolean;

  /** Enable image token calculation for multimodal messages */
  imageTokens: boolean;

  /** Enable aggressive truncation in overflow state (removes tool pairs) */
  aggressiveTruncation: boolean;
}

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default feature flags configuration.
 *
 * All features enabled except:
 * - debugLogging: false (verbose, for development only)
 * - aggressiveTruncation: false (destructive, emergency only)
 *
 * @example
 * ```typescript
 * // Use defaults with override
 * const flags = mergeFlags({ debugLogging: true });
 * ```
 */
export const DEFAULT_FEATURE_FLAGS: Readonly<ContextFeatureFlags> = Object.freeze({
  autoCondense: true,
  toolPruning: true,
  checkpointBeforeCompress: true,
  tokenCaching: true,
  debugLogging: false,
  imageTokens: true,
  aggressiveTruncation: false,
});

// ============================================================================
// Environment Variable Mappings
// ============================================================================

/**
 * Maps feature flag keys to their corresponding environment variable names.
 *
 * Environment variable patterns:
 * - VELLUM_CONTEXT_{FLAG}=true → enables the flag
 * - VELLUM_CONTEXT_{FLAG}=false → disables the flag
 *
 * @internal
 */
const ENV_FLAG_MAP: Readonly<Record<keyof ContextFeatureFlags, string>> = Object.freeze({
  autoCondense: "VELLUM_CONTEXT_AUTO_CONDENSE",
  toolPruning: "VELLUM_CONTEXT_TOOL_PRUNING",
  checkpointBeforeCompress: "VELLUM_CONTEXT_CHECKPOINT",
  tokenCaching: "VELLUM_CONTEXT_TOKEN_CACHING",
  debugLogging: "VELLUM_CONTEXT_DEBUG",
  imageTokens: "VELLUM_CONTEXT_IMAGE_TOKENS",
  aggressiveTruncation: "VELLUM_CONTEXT_AGGRESSIVE_TRUNCATION",
});

/**
 * Environment variable prefix for disable pattern.
 * VELLUM_DISABLE_{FLAG}=true inverts the flag to false.
 *
 * @internal
 */
const DISABLE_PREFIX = "VELLUM_DISABLE_";

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse environment variable value to boolean.
 *
 * Recognized truthy values (case-insensitive):
 * - "true", "1", "yes", "on"
 *
 * Recognized falsy values (case-insensitive):
 * - "false", "0", "no", "off"
 *
 * @param value - The environment variable value
 * @returns Parsed boolean or undefined if value is empty/unrecognized
 *
 * @example
 * ```typescript
 * parseEnvBoolean('true')  // true
 * parseEnvBoolean('FALSE') // false
 * parseEnvBoolean('1')     // true
 * parseEnvBoolean('yes')   // true
 * parseEnvBoolean('')      // undefined
 * parseEnvBoolean('maybe') // undefined
 * ```
 *
 * @internal
 */
function parseEnvBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }

  const normalized = value.toLowerCase().trim();

  // Truthy values
  if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on") {
    return true;
  }

  // Falsy values
  if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "off") {
    return false;
  }

  return undefined;
}

/**
 * Extract flag name from disable-pattern environment variable.
 *
 * @param envKey - The environment variable key (e.g., "VELLUM_DISABLE_TOKEN_CACHING")
 * @returns The flag key or null if not a disable pattern
 *
 * @internal
 */
function getDisableFlagKey(envKey: string): keyof ContextFeatureFlags | null {
  if (!envKey.startsWith(DISABLE_PREFIX)) {
    return null;
  }

  const suffix = envKey.slice(DISABLE_PREFIX.length).toUpperCase();

  // Map disable env var suffixes to flag keys
  const disableMapping: Record<string, keyof ContextFeatureFlags> = {
    AUTO_CONDENSE: "autoCondense",
    TOOL_PRUNING: "toolPruning",
    CHECKPOINT: "checkpointBeforeCompress",
    TOKEN_CACHING: "tokenCaching",
    DEBUG: "debugLogging",
    IMAGE_TOKENS: "imageTokens",
    AGGRESSIVE_TRUNCATION: "aggressiveTruncation",
  };

  return disableMapping[suffix] ?? null;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Create feature flags from environment variables.
 *
 * Supports two patterns:
 * 1. Enable pattern: VELLUM_CONTEXT_{FLAG}=true|false
 * 2. Disable pattern: VELLUM_DISABLE_{FLAG}=true (inverts to false)
 *
 * Priority order (highest to lowest):
 * 1. Disable pattern (VELLUM_DISABLE_*)
 * 2. Enable pattern (VELLUM_CONTEXT_*)
 * 3. Default values
 *
 * @param env - Environment variables object (defaults to process.env)
 * @returns Complete feature flags with all values resolved
 *
 * @example
 * ```typescript
 * // From process.env
 * const flags = createFeatureFlagsFromEnv();
 *
 * // From custom env object
 * const flags = createFeatureFlagsFromEnv({
 *   VELLUM_CONTEXT_DEBUG: 'true',
 *   VELLUM_DISABLE_TOKEN_CACHING: 'true',
 * });
 * // Result: { debugLogging: true, tokenCaching: false, ... }
 * ```
 */
export function createFeatureFlagsFromEnv(
  env: Record<string, string | undefined> = process.env
): ContextFeatureFlags {
  const flags = { ...DEFAULT_FEATURE_FLAGS };

  // Process enable patterns (VELLUM_CONTEXT_*)
  for (const [flagKey, envKey] of Object.entries(ENV_FLAG_MAP) as [
    keyof ContextFeatureFlags,
    string,
  ][]) {
    const value = parseEnvBoolean(env[envKey]);
    if (value !== undefined) {
      flags[flagKey] = value;
    }
  }

  // Process disable patterns (VELLUM_DISABLE_*) - these take precedence
  for (const [envKey, envValue] of Object.entries(env)) {
    const flagKey = getDisableFlagKey(envKey);
    if (flagKey !== null) {
      const isDisabled = parseEnvBoolean(envValue);
      if (isDisabled === true) {
        flags[flagKey] = false;
      }
    }
  }

  return flags;
}

/**
 * Check if a specific feature is enabled.
 *
 * @param flags - The feature flags configuration
 * @param feature - The feature key to check
 * @returns Whether the feature is enabled
 *
 * @example
 * ```typescript
 * const flags = createFeatureFlagsFromEnv();
 *
 * if (isFeatureEnabled(flags, 'debugLogging')) {
 *   console.log('Debug mode enabled');
 * }
 *
 * if (isFeatureEnabled(flags, 'tokenCaching')) {
 *   // Use cached tokenizer
 * }
 * ```
 */
export function isFeatureEnabled(
  flags: ContextFeatureFlags,
  feature: keyof ContextFeatureFlags
): boolean {
  return flags[feature];
}

/**
 * Merge partial flags with defaults.
 *
 * Creates a complete feature flags object by merging provided partial
 * configuration with default values.
 *
 * @param partial - Partial feature flags to override defaults
 * @returns Complete feature flags with all values defined
 *
 * @example
 * ```typescript
 * // Enable debug mode only
 * const flags = mergeFlags({ debugLogging: true });
 *
 * // Disable specific features
 * const flags = mergeFlags({
 *   tokenCaching: false,
 *   autoCondense: false,
 * });
 *
 * // Use all defaults
 * const flags = mergeFlags();
 * ```
 */
export function mergeFlags(partial?: Partial<ContextFeatureFlags>): ContextFeatureFlags {
  if (!partial) {
    return { ...DEFAULT_FEATURE_FLAGS };
  }

  return {
    ...DEFAULT_FEATURE_FLAGS,
    ...partial,
  };
}

/**
 * Get the environment variable name for a feature flag.
 *
 * Useful for documentation or runtime configuration hints.
 *
 * @param feature - The feature flag key
 * @returns The corresponding environment variable name
 *
 * @example
 * ```typescript
 * const envVar = getEnvVarName('tokenCaching');
 * // Returns: 'VELLUM_CONTEXT_TOKEN_CACHING'
 *
 * console.log(`Set ${envVar}=false to disable caching`);
 * ```
 */
export function getEnvVarName(feature: keyof ContextFeatureFlags): string {
  return ENV_FLAG_MAP[feature];
}

/**
 * Get all environment variable names and their current mappings.
 *
 * Useful for generating documentation or configuration templates.
 *
 * @returns Object mapping feature keys to environment variable names
 *
 * @example
 * ```typescript
 * const envVars = getAllEnvVarNames();
 * // Returns: {
 * //   autoCondense: 'VELLUM_CONTEXT_AUTO_CONDENSE',
 * //   toolPruning: 'VELLUM_CONTEXT_TOOL_PRUNING',
 * //   ...
 * // }
 * ```
 */
export function getAllEnvVarNames(): Record<keyof ContextFeatureFlags, string> {
  return { ...ENV_FLAG_MAP };
}
