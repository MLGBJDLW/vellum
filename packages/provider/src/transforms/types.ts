// =============================================================================
// Provider Transform Layer Types
// Phase 1: Agent System Upgrade
// =============================================================================

import type {
  CompletionMessage,
  ProviderType,
  StopReason,
  TokenUsage,
  ToolCall,
  ToolDefinition,
} from "../types.js";

// =============================================================================
// Transform Direction
// =============================================================================

/**
 * Direction of transformation
 * - "to_provider": Transform from Vellum format to provider-specific format
 * - "from_provider": Transform from provider-specific format to Vellum format
 */
export type TransformDirection = "to_provider" | "from_provider";

// =============================================================================
// Transform Configuration
// =============================================================================

/**
 * Tool protocol for provider communication
 * - "native": Use provider's native tool/function calling format
 * - "xml": Use XML-based tool format (for providers without native support)
 */
export type ToolProtocol = "xml" | "native";

/**
 * Configuration for provider transformations
 *
 * @example
 * ```typescript
 * const config: TransformConfig = {
 *   provider: 'anthropic',
 *   modelId: 'claude-sonnet-4-20250514',
 *   enableCaching: true,
 *   toolProtocol: 'native',
 * };
 * ```
 */
export interface TransformConfig {
  /** Target provider type */
  provider: ProviderType;
  /** Specific model identifier (affects transform behavior for model-specific features) */
  modelId?: string;
  /** Enable prompt caching if supported by provider */
  enableCaching?: boolean;
  /** Tool protocol to use for tool definitions and calls */
  toolProtocol?: ToolProtocol;
}

// =============================================================================
// Transform Warnings
// =============================================================================

/**
 * Severity levels for transform warnings
 */
export type WarningSeverity = "info" | "warning" | "error";

/**
 * Warning generated during transformation
 *
 * Warnings capture non-fatal issues encountered during transformation,
 * such as unsupported features being dropped or values being clamped.
 *
 * @example
 * ```typescript
 * const warning: TransformWarning = {
 *   code: 'UNSUPPORTED_CONTENT_TYPE',
 *   message: 'Image content is not supported by this provider, skipped',
 *   severity: 'warning',
 *   field: 'messages[2].content[1]',
 * };
 * ```
 */
export interface TransformWarning {
  /** Machine-readable warning code */
  code: string;
  /** Human-readable warning message */
  message: string;
  /** Severity level of the warning */
  severity: WarningSeverity;
  /** Optional field path where the issue occurred */
  field?: string;
  /** Optional original value that caused the warning */
  originalValue?: unknown;
  /** Optional transformed/fallback value used instead */
  transformedValue?: unknown;
}

// =============================================================================
// Transform Result
// =============================================================================

/**
 * Result of a transformation operation
 *
 * Wraps the transformed data with any warnings generated during the process.
 * This allows callers to handle warnings (log, display, etc.) while still
 * using the transformed result.
 *
 * @typeParam T - The type of the transformed data
 *
 * @example
 * ```typescript
 * const result: TransformResult<ProviderMessage[]> = {
 *   data: transformedMessages,
 *   warnings: [
 *     { code: 'CACHING_DISABLED', message: 'Caching not supported', severity: 'info' }
 *   ],
 * };
 *
 * if (result.warnings.length > 0) {
 *   logger.warn('Transform warnings:', result.warnings);
 * }
 * ```
 */
export interface TransformResult<T> {
  /** The transformed data */
  data: T;
  /** Warnings generated during transformation */
  warnings: TransformWarning[];
}

// =============================================================================
// Provider-Specific Message Types (for transform outputs)
// =============================================================================

/**
 * Provider-specific message format (opaque to transform layer)
 *
 * Each provider adapter will define its own concrete message type.
 * This is a placeholder for the generic transform interface.
 */
export type ProviderMessage = Record<string, unknown>;

/**
 * Provider-specific tool format (opaque to transform layer)
 *
 * Each provider adapter will define its own concrete tool type.
 * This is a placeholder for the generic transform interface.
 */
export type ProviderTool = Record<string, unknown>;

/**
 * Provider-specific response format (opaque to transform layer)
 *
 * Each provider adapter will define its own concrete response type.
 * This is a placeholder for the generic transform interface.
 */
export type ProviderResponse = Record<string, unknown>;

// =============================================================================
// Parsed Response
// =============================================================================

/**
 * Parsed response from provider, normalized to Vellum format
 *
 * @example
 * ```typescript
 * const parsed: ParsedResponse = {
 *   content: 'Here is my response...',
 *   toolCalls: [{ id: 'call_123', name: 'read_file', input: { path: 'foo.ts' } }],
 *   stopReason: 'tool_use',
 *   usage: { inputTokens: 100, outputTokens: 50 },
 * };
 * ```
 */
export interface ParsedResponse {
  /** Generated text content */
  content: string;
  /** Thinking/reasoning content (if available) */
  thinking?: string;
  /** Tool calls requested by the model */
  toolCalls?: ToolCall[];
  /** Reason why generation stopped */
  stopReason: StopReason;
  /** Token usage statistics */
  usage: TokenUsage;
}

// =============================================================================
// Cache Control
// =============================================================================

/**
 * Cache control directive for prompt caching
 *
 * Used to mark content blocks for caching in providers that support it
 * (e.g., Anthropic's prompt caching feature).
 */
export interface CacheControl {
  /** Type of cache control - currently only "ephemeral" is supported */
  type: "ephemeral";
}

/**
 * Message with optional cache control applied
 */
export interface CachedMessage extends CompletionMessage {
  /** Cache control directive for this message */
  cacheControl?: CacheControl;
}

// =============================================================================
// Provider Transform Interface
// =============================================================================

/**
 * Provider-specific transform implementation
 *
 * Each provider implements this interface to handle bidirectional
 * transformation between Vellum's canonical format and the provider's
 * specific API format.
 *
 * @example
 * ```typescript
 * class AnthropicTransform implements ProviderTransform {
 *   readonly provider = 'anthropic';
 *
 *   transformMessages(messages, config) {
 *     // Convert Vellum messages to Anthropic format
 *     return { data: anthropicMessages, warnings: [] };
 *   }
 *
 *   transformTools(tools, config) {
 *     // Convert Vellum tools to Anthropic tool format
 *     return { data: anthropicTools, warnings: [] };
 *   }
 *
 *   parseResponse(response, config) {
 *     // Parse Anthropic response to Vellum format
 *     return { data: parsedResponse, warnings: [] };
 *   }
 *
 *   applyCaching(messages, config) {
 *     // Apply cache_control to eligible messages
 *     return { data: cachedMessages, warnings: [] };
 *   }
 * }
 * ```
 */
export interface ProviderTransform<
  TMessage = ProviderMessage,
  TTool = ProviderTool,
  TResponse = ProviderResponse,
> {
  /** Provider type this transform handles */
  readonly provider: ProviderType;

  /**
   * Transform Vellum messages to provider-specific format
   *
   * @param messages - Vellum canonical messages
   * @param config - Transform configuration
   * @returns Transformed messages with any warnings
   */
  transformMessages(
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
  transformTools(tools: ToolDefinition[], config: TransformConfig): TransformResult<TTool[]>;

  /**
   * Parse provider response to Vellum canonical format
   *
   * @param response - Provider-specific response
   * @param config - Transform configuration
   * @returns Parsed response with any warnings
   */
  parseResponse(response: TResponse, config: TransformConfig): TransformResult<ParsedResponse>;

  /**
   * Apply caching directives to messages (optional)
   *
   * For providers that support prompt caching (e.g., Anthropic),
   * this method adds cache control directives to eligible messages.
   *
   * @param messages - Messages to apply caching to
   * @param config - Transform configuration
   * @returns Messages with cache control applied
   */
  applyCaching?(
    messages: CompletionMessage[],
    config: TransformConfig
  ): TransformResult<CachedMessage[]>;
}

// =============================================================================
// Transform Factory Type
// =============================================================================

/**
 * Factory function type for creating provider transforms
 *
 * @param provider - Provider type to create transform for
 * @returns Provider transform instance or undefined if not supported
 */
export type TransformFactory = (provider: ProviderType) => ProviderTransform | undefined;

// =============================================================================
// Common Warning Codes
// =============================================================================

/**
 * Standard warning codes for transform operations
 *
 * Using string literal union for type safety while keeping extensibility
 */
export type CommonWarningCode =
  | "UNSUPPORTED_CONTENT_TYPE"
  | "UNSUPPORTED_TOOL_FEATURE"
  | "CACHING_NOT_SUPPORTED"
  | "CACHING_DISABLED"
  | "VALUE_CLAMPED"
  | "VALUE_TRUNCATED"
  | "FEATURE_DEGRADED"
  | "UNKNOWN_FIELD_IGNORED"
  | "PARSE_ERROR_RECOVERED"
  | "XML_FALLBACK_USED";

/**
 * Helper to create a transform warning with common code
 */
export function createWarning(
  code: CommonWarningCode | string,
  message: string,
  severity: WarningSeverity = "warning",
  options?: Pick<TransformWarning, "field" | "originalValue" | "transformedValue">
): TransformWarning {
  return {
    code,
    message,
    severity,
    ...options,
  };
}
