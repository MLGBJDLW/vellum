// =============================================================================
// Transform Layer Index
// Phase 1: Agent System Upgrade
//
// Central registry and factory for provider message transforms.
// Provides unified access to all provider transforms with lazy initialization.
// =============================================================================

import { anthropicTransform } from "./anthropic.js";
import { googleTransform } from "./google.js";
import { openaiTransform } from "./openai.js";
import {
  createOpenAICompatTransform,
  isOpenAICompatProvider,
  OPENAI_COMPAT_PROVIDERS,
} from "./openai-compat.js";
import type { ProviderTransform } from "./types.js";

// =============================================================================
// Re-exports: Types
// =============================================================================

export type {
  // Cache support
  CacheControl,
  CachedMessage,
  CommonWarningCode,
  ParsedResponse,
  // Provider format types
  ProviderMessage,
  ProviderResponse,
  ProviderTool,
  // Transform interface
  ProviderTransform,
  ToolProtocol,
  // Configuration
  TransformConfig,
  TransformDirection,
  TransformFactory,
  // Results
  TransformResult,
  // Warnings
  TransformWarning,
  WarningSeverity,
} from "./types.js";

export { createWarning } from "./types.js";

// =============================================================================
// Re-exports: Base Transform
// =============================================================================

export { AbstractProviderTransform } from "./base.js";

// =============================================================================
// Re-exports: Individual Transforms (for direct access)
// =============================================================================

// Anthropic
export { AnthropicTransform, anthropicTransform } from "./anthropic.js";
// Google/Gemini
export { GoogleTransform, googleTransform } from "./google.js";
// OpenAI
export type { OpenAIMessage, OpenAIResponse, OpenAITool } from "./openai.js";
export { OpenAITransform, openaiTransform } from "./openai.js";

// OpenAI-Compatible
export type { OpenAICompatConfig, OpenAICompatProvider } from "./openai-compat.js";
export {
  createOpenAICompatTransform,
  isOpenAICompatProvider,
  OPENAI_COMPAT_PROVIDERS,
  OpenAICompatTransform,
  openaiCompatTransform,
} from "./openai-compat.js";

// Schema Sanitizer (for Gemini and other providers with limited JSON Schema support)
export type { JsonSchema, SanitizeOptions } from "./schema-sanitizer.js";
export {
  sanitizeJsonSchema,
  sanitizeJsonSchemaForGemini,
} from "./schema-sanitizer.js";

// =============================================================================
// Supported Providers
// =============================================================================

/**
 * All providers that have transform support
 *
 * Includes:
 * - Native providers: anthropic, openai, google, gemini
 * - OpenAI-compatible providers: qwen, deepseek, moonshot, etc.
 */
export const SUPPORTED_PROVIDERS = [
  "anthropic",
  "openai",
  "google",
  "gemini", // Alias for google
  ...OPENAI_COMPAT_PROVIDERS,
] as const;

export type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number];

/**
 * Check if a provider has transform support
 */
export function isSupportedProvider(provider: string): provider is SupportedProvider {
  return SUPPORTED_PROVIDERS.includes(provider as SupportedProvider);
}

// =============================================================================
// Transform Registry (Native Providers Only)
// =============================================================================

/**
 * Type alias for a provider transform with any generic parameters.
 * Used internally for the registry and returned by getTransform().
 *
 * Consumers who need specific provider types should import the
 * concrete transform classes directly (e.g., AnthropicTransform).
 */
// biome-ignore lint/suspicious/noExplicitAny: Registry needs to hold transforms with varying generic types
export type AnyProviderTransform = ProviderTransform<any, any, any>;

/**
 * Registry of singleton transforms for native providers.
 * OpenAI-compatible providers are handled separately with lazy initialization.
 *
 * Note: We use `any` for generic parameters because each transform has different
 * provider-specific types, but the registry returns them as the base interface.
 */
const NATIVE_TRANSFORM_REGISTRY: Readonly<Record<string, AnyProviderTransform>> = {
  anthropic: anthropicTransform,
  openai: openaiTransform,
  google: googleTransform,
  gemini: googleTransform, // Alias for google
} as const;

// =============================================================================
// Lazy Cache for OpenAI-Compatible Transforms
// =============================================================================

/**
 * Cache for OpenAI-compatible provider transforms.
 * Transforms are created on first request to avoid upfront initialization.
 */
const openaiCompatCache = new Map<string, AnyProviderTransform>();

/**
 * Get or create an OpenAI-compatible transform with caching.
 */
function getOpenAICompatTransform(provider: string): AnyProviderTransform {
  let transform = openaiCompatCache.get(provider);
  if (!transform) {
    transform = createOpenAICompatTransform(provider);
    openaiCompatCache.set(provider, transform);
  }
  return transform;
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Error thrown when requesting a transform for an unknown provider
 */
export class UnknownProviderError extends Error {
  constructor(
    public readonly provider: string,
    public readonly availableProviders: readonly string[]
  ) {
    const available = availableProviders.slice(0, 10).join(", ");
    const more =
      availableProviders.length > 10 ? `, and ${availableProviders.length - 10} more` : "";
    super(`Unknown provider: "${provider}". Available providers: ${available}${more}`);
    this.name = "UnknownProviderError";
  }
}

/**
 * Get a transform for the specified provider.
 *
 * This is the primary API for obtaining provider transforms. It handles:
 * - Native providers (anthropic, openai, google, gemini) with singleton transforms
 * - OpenAI-compatible providers with lazy-initialized cached transforms
 *
 * @param provider - The provider identifier (e.g., 'anthropic', 'openai', 'qwen')
 * @returns The appropriate ProviderTransform for the provider
 * @throws {UnknownProviderError} If the provider is not supported
 *
 * @example
 * ```typescript
 * // Get native provider transform
 * const transform = getTransform('anthropic');
 *
 * // Get OpenAI-compatible transform (lazy-initialized)
 * const qwenTransform = getTransform('qwen');
 *
 * // Use the transform
 * const result = transform.transformMessages(messages, config);
 * ```
 */
export function getTransform(provider: string): AnyProviderTransform {
  // Normalize provider name to lowercase
  const normalizedProvider = provider.toLowerCase();

  // Check native providers first (most common case)
  const nativeTransform = NATIVE_TRANSFORM_REGISTRY[normalizedProvider];
  if (nativeTransform) {
    return nativeTransform;
  }

  // Check OpenAI-compatible providers
  if (isOpenAICompatProvider(normalizedProvider)) {
    return getOpenAICompatTransform(normalizedProvider);
  }

  // Unknown provider - throw helpful error
  throw new UnknownProviderError(provider, SUPPORTED_PROVIDERS);
}

/**
 * Check if a transform exists for the given provider without throwing.
 *
 * @param provider - The provider identifier to check
 * @returns true if a transform exists, false otherwise
 *
 * @example
 * ```typescript
 * if (hasTransform('qwen')) {
 *   const transform = getTransform('qwen');
 *   // ...
 * }
 * ```
 */
export function hasTransform(provider: string): boolean {
  const normalizedProvider = provider.toLowerCase();
  return (
    normalizedProvider in NATIVE_TRANSFORM_REGISTRY || isOpenAICompatProvider(normalizedProvider)
  );
}

/**
 * Clear the OpenAI-compatible transform cache.
 * Primarily useful for testing.
 */
export function clearTransformCache(): void {
  openaiCompatCache.clear();
}
