// =============================================================================
// Abstract Base Class for Provider Transforms
// Phase 1: Agent System Upgrade
// =============================================================================

import type { CompletionMessage, ProviderType, ToolDefinition } from "../types.js";
import type {
  CachedMessage,
  ParsedResponse,
  ProviderMessage,
  ProviderResponse,
  ProviderTool,
  ProviderTransform,
  TransformConfig,
  TransformResult,
  TransformWarning,
} from "./types.js";

// =============================================================================
// Abstract Base Transform
// =============================================================================

/**
 * Abstract base class for provider-specific transforms
 *
 * Provides common utility methods for transformation operations while
 * requiring subclasses to implement provider-specific transformation logic.
 *
 * @typeParam TMessage - Provider-specific message type
 * @typeParam TTool - Provider-specific tool definition type
 * @typeParam TResponse - Provider-specific response type
 *
 * @example
 * ```typescript
 * class AnthropicTransform extends AbstractProviderTransform<
 *   AnthropicMessage,
 *   AnthropicTool,
 *   AnthropicResponse
 * > {
 *   readonly provider = 'anthropic';
 *
 *   transformMessages(messages, config) {
 *     const warnings: TransformWarning[] = [];
 *     const normalized = this.normalizeEmptyContent(messages);
 *     // ... transform logic
 *     return this.createResult(transformed, warnings);
 *   }
 *
 *   transformTools(tools, config) {
 *     // ... implementation
 *   }
 *
 *   parseResponse(response, config) {
 *     // ... implementation
 *   }
 * }
 * ```
 */
export abstract class AbstractProviderTransform<
  TMessage = ProviderMessage,
  TTool = ProviderTool,
  TResponse = ProviderResponse,
> implements ProviderTransform<TMessage, TTool, TResponse>
{
  /**
   * Provider type this transform handles
   * Must be set by concrete subclasses
   */
  abstract readonly provider: ProviderType;

  // ===========================================================================
  // Abstract Methods (must be implemented by subclasses)
  // ===========================================================================

  /**
   * Transform Vellum messages to provider-specific format
   *
   * @param messages - Vellum canonical messages
   * @param config - Transform configuration
   * @returns Transformed messages with any warnings
   */
  abstract transformMessages(
    messages: CompletionMessage[],
    config: TransformConfig
  ): TransformResult<TMessage[]>;

  /**
   * Transform Vellum tool definitions to provider-specific format
   *
   * @param tools - Vellum tool definitions
   * @param config - Transform configuration
   * @returns Transformed tools with any warnings
   */
  abstract transformTools(
    tools: ToolDefinition[],
    config: TransformConfig
  ): TransformResult<TTool[]>;

  /**
   * Parse provider response to Vellum canonical format
   *
   * @param response - Provider-specific response
   * @param config - Transform configuration
   * @returns Parsed response with any warnings
   */
  abstract parseResponse(
    response: TResponse,
    config: TransformConfig
  ): TransformResult<ParsedResponse>;

  // ===========================================================================
  // Default Implementations
  // ===========================================================================

  /**
   * Apply caching directives to messages
   *
   * Default implementation returns messages unchanged with no caching applied.
   * Providers that support caching (e.g., Anthropic) should override this.
   *
   * @param messages - Messages to apply caching to
   * @param config - Transform configuration
   * @returns Messages with cache control applied (default: unchanged)
   */
  applyCaching(
    messages: CompletionMessage[],
    _config: TransformConfig
  ): TransformResult<CachedMessage[]> {
    // Default: no caching support, return messages as-is
    // Cast is safe because CachedMessage extends CompletionMessage
    return this.createResult(messages as CachedMessage[]);
  }

  // ===========================================================================
  // Protected Utility Methods
  // ===========================================================================

  /**
   * Create a TransformResult with data and optional warnings
   *
   * @param data - The transformed data
   * @param warnings - Optional array of warnings (defaults to empty)
   * @returns TransformResult wrapping the data and warnings
   *
   * @example
   * ```typescript
   * // Simple result with no warnings
   * return this.createResult(transformedMessages);
   *
   * // Result with accumulated warnings
   * return this.createResult(transformedMessages, warnings);
   * ```
   */
  protected createResult<T>(data: T, warnings: TransformWarning[] = []): TransformResult<T> {
    return { data, warnings };
  }

  /**
   * Add a warning to the warnings array
   *
   * Mutates the array in place for efficiency during transformation.
   *
   * @param warnings - Array to add warning to
   * @param warning - Warning to add
   *
   * @example
   * ```typescript
   * const warnings: TransformWarning[] = [];
   *
   * if (!supportsFeature) {
   *   this.addWarning(warnings, {
   *     code: 'UNSUPPORTED_FEATURE',
   *     message: 'Feature X not supported by this provider',
   *     severity: 'warning',
   *   });
   * }
   * ```
   */
  protected addWarning(warnings: TransformWarning[], warning: TransformWarning): void {
    warnings.push(warning);
  }

  /**
   * Filter out messages with empty content
   *
   * Removes messages that have no meaningful content (empty string or
   * empty content array). Useful for normalizing input before transformation.
   *
   * @param messages - Messages to normalize
   * @returns Messages with non-empty content only
   *
   * @example
   * ```typescript
   * const normalized = this.normalizeEmptyContent(messages);
   * // Messages with empty string or [] content are removed
   * ```
   */
  protected normalizeEmptyContent(messages: CompletionMessage[]): CompletionMessage[] {
    return messages.filter((message) => {
      const { content } = message;

      // Empty string content
      if (typeof content === "string") {
        return content.length > 0;
      }

      // Empty array content
      if (Array.isArray(content)) {
        return content.length > 0;
      }

      // Keep messages with other content types
      return true;
    });
  }

  /**
   * Sanitize and normalize tool call IDs
   *
   * Ensures tool call IDs are valid and consistent across providers.
   * Some providers have specific requirements for ID format.
   *
   * @param id - Original tool call ID
   * @returns Sanitized ID safe for use across providers
   *
   * @example
   * ```typescript
   * const sanitizedId = this.sanitizeToolCallId(toolCall.id);
   * // Ensures ID is non-empty and contains only valid characters
   * ```
   */
  protected sanitizeToolCallId(id: string | undefined | null): string {
    // Handle null/undefined
    if (id == null) {
      return this.generateToolCallId();
    }

    // Trim whitespace
    const trimmed = id.trim();

    // Handle empty string
    if (trimmed.length === 0) {
      return this.generateToolCallId();
    }

    // Remove any characters that might cause issues with providers
    // Keep alphanumeric, hyphens, and underscores
    const sanitized = trimmed.replace(/[^a-zA-Z0-9_-]/g, "_");

    // Ensure the ID isn't too long (some providers have limits)
    const maxLength = 64;
    if (sanitized.length > maxLength) {
      return sanitized.slice(0, maxLength);
    }

    return sanitized;
  }

  /**
   * Generate a unique tool call ID
   *
   * Used when the original ID is missing or invalid.
   *
   * @returns Generated unique ID
   */
  protected generateToolCallId(): string {
    // Use timestamp + random for uniqueness
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 8);
    return `tool_${timestamp}_${random}`;
  }
}
