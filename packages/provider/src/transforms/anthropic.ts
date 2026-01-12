// =============================================================================
// Anthropic Provider Transform
// Phase 1: Agent System Upgrade
// =============================================================================

import type {
  CompletionMessage,
  ContentPart,
  StopReason,
  ToolCall,
  ToolDefinition,
} from "../types.js";
import { AbstractProviderTransform } from "./base.js";
import type {
  CacheControl,
  CachedMessage,
  ParsedResponse,
  TransformConfig,
  TransformResult,
  TransformWarning,
} from "./types.js";

// =============================================================================
// Anthropic-Specific Types
// =============================================================================

/**
 * Anthropic cache control directive
 */
interface AnthropicCacheControl {
  type: "ephemeral";
}

/**
 * Anthropic text content block
 */
interface AnthropicTextBlock {
  type: "text";
  text: string;
  cache_control?: AnthropicCacheControl;
}

/**
 * Anthropic image content block
 */
interface AnthropicImageBlock {
  type: "image";
  source: {
    type: "base64";
    media_type: string;
    data: string;
  };
  cache_control?: AnthropicCacheControl;
}

/**
 * Anthropic tool use content block
 */
interface AnthropicToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/**
 * Anthropic tool result content block
 */
interface AnthropicToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
  cache_control?: AnthropicCacheControl;
}

/**
 * Anthropic thinking content block (extended thinking)
 */
interface AnthropicThinkingBlock {
  type: "thinking";
  thinking: string;
}

/**
 * Union of all Anthropic content block types
 */
type AnthropicContentBlock =
  | AnthropicTextBlock
  | AnthropicImageBlock
  | AnthropicToolUseBlock
  | AnthropicToolResultBlock
  | AnthropicThinkingBlock;

/**
 * Anthropic message format
 */
export interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

/**
 * Anthropic tool definition format
 */
export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/**
 * Anthropic response content block
 */
interface AnthropicResponseContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

/**
 * Anthropic API response format
 */
export interface AnthropicResponse {
  id: string;
  type: string;
  role: string;
  content: AnthropicResponseContentBlock[];
  model: string;
  stop_reason: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

// =============================================================================
// Anthropic Transform Implementation
// =============================================================================

/**
 * Transform implementation for Anthropic provider
 *
 * Anthropic format is the canonical internal format for Vellum, so transformations
 * are mostly pass-through with some normalization and optional caching applied.
 *
 * @example
 * ```typescript
 * const result = anthropicTransform.transformMessages(messages, {
 *   provider: 'anthropic',
 *   modelId: 'claude-sonnet-4-20250514',
 *   enableCaching: true,
 * });
 *
 * // Use result.data for API call, log result.warnings
 * ```
 */
export class AnthropicTransform extends AbstractProviderTransform<
  AnthropicMessage,
  AnthropicTool,
  AnthropicResponse
> {
  readonly provider = "anthropic" as const;

  // ===========================================================================
  // Message Transformation
  // ===========================================================================

  /**
   * Transform Vellum messages to Anthropic format
   *
   * Since Vellum uses Anthropic-style internally, this is mostly pass-through:
   * 1. Filter empty content
   * 2. Sanitize tool call IDs
   * 3. Apply caching if enabled
   *
   * Note: System messages should be extracted separately before calling the API,
   * as Anthropic handles system messages as a separate parameter.
   */
  transformMessages(
    messages: CompletionMessage[],
    config: TransformConfig
  ): TransformResult<AnthropicMessage[]> {
    const warnings: TransformWarning[] = [];

    // Normalize empty content
    let normalized = this.normalizeEmptyContent(messages);

    // Apply caching if enabled
    if (config.enableCaching) {
      const cachingResult = this.applyCaching(normalized, config);
      warnings.push(...cachingResult.warnings);
      normalized = cachingResult.data;
    }

    // Transform to Anthropic format
    const transformed = normalized
      .filter((m) => m.role !== "system") // System handled separately
      .map((m) => this.transformMessage(m, warnings));

    return this.createResult(transformed, warnings);
  }

  /**
   * Transform a single message to Anthropic format
   */
  private transformMessage(
    message: CompletionMessage | CachedMessage,
    warnings: TransformWarning[]
  ): AnthropicMessage {
    const role: "user" | "assistant" = message.role === "assistant" ? "assistant" : "user";

    // Simple string content
    if (typeof message.content === "string") {
      // Apply cache control if present on the message
      const cachedMessage = message as CachedMessage;
      if (cachedMessage.cacheControl) {
        return {
          role,
          content: [
            {
              type: "text",
              text: message.content,
              cache_control: { type: cachedMessage.cacheControl.type },
            },
          ],
        };
      }
      return { role, content: message.content };
    }

    // Multi-part content
    const content = message.content.map((part) => this.transformContentPart(part, warnings));

    // Apply cache control to last content block if message has caching
    const cachedMessage = message as CachedMessage;
    if (cachedMessage.cacheControl && content.length > 0) {
      const lastBlock = content[content.length - 1];
      if (lastBlock && this.supportsCacheControl(lastBlock)) {
        lastBlock.cache_control = { type: cachedMessage.cacheControl.type };
      }
    }

    return { role, content };
  }

  /**
   * Transform a content part to Anthropic format
   */
  private transformContentPart(
    part: ContentPart,
    _warnings: TransformWarning[]
  ): AnthropicContentBlock {
    switch (part.type) {
      case "text":
        return { type: "text", text: part.text };

      case "image":
        return {
          type: "image",
          source: {
            type: "base64",
            media_type: part.mimeType,
            data: part.source,
          },
        };

      case "tool_use":
        return {
          type: "tool_use",
          id: this.sanitizeToolCallId(part.id),
          name: part.name,
          input: part.input,
        };

      case "tool_result":
        return {
          type: "tool_result",
          tool_use_id: this.sanitizeToolCallId(part.toolUseId),
          content: typeof part.content === "string" ? part.content : JSON.stringify(part.content),
          ...(part.isError && { is_error: true }),
        };

      default: {
        // TypeScript exhaustiveness check
        const _exhaustive: never = part;
        throw new Error(`Unknown content part type: ${(_exhaustive as ContentPart).type}`);
      }
    }
  }

  /**
   * Check if a content block supports cache_control
   */
  private supportsCacheControl(
    block: AnthropicContentBlock
  ): block is AnthropicTextBlock | AnthropicImageBlock | AnthropicToolResultBlock {
    return block.type === "text" || block.type === "image" || block.type === "tool_result";
  }

  // ===========================================================================
  // Tool Transformation
  // ===========================================================================

  /**
   * Transform Vellum tool definitions to Anthropic format
   *
   * Anthropic tools have the format:
   * { name, description, input_schema }
   */
  transformTools(
    tools: ToolDefinition[],
    _config: TransformConfig
  ): TransformResult<AnthropicTool[]> {
    const warnings: TransformWarning[] = [];

    const transformed = tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema,
    }));

    return this.createResult(transformed, warnings);
  }

  // ===========================================================================
  // Response Parsing
  // ===========================================================================

  /**
   * Parse Anthropic response to Vellum canonical format
   *
   * Handles:
   * - text blocks
   * - tool_use blocks
   * - thinking blocks (extended thinking)
   */
  parseResponse(
    response: AnthropicResponse,
    _config: TransformConfig
  ): TransformResult<ParsedResponse> {
    const warnings: TransformWarning[] = [];

    let content = "";
    let thinking = "";
    const toolCalls: ToolCall[] = [];

    // Process content blocks
    for (const block of response.content) {
      switch (block.type) {
        case "text":
          if (block.text) {
            content += block.text;
          }
          break;

        case "thinking":
          if (block.thinking) {
            thinking += block.thinking;
          }
          break;

        case "tool_use":
          if (block.id && block.name) {
            toolCalls.push({
              id: block.id,
              name: block.name,
              input: block.input ?? {},
            });
          }
          break;

        default:
          // Unknown block type - add warning but continue
          this.addWarning(warnings, {
            code: "UNKNOWN_CONTENT_BLOCK",
            message: `Unknown content block type: ${block.type}`,
            severity: "info",
            field: "content",
            originalValue: block.type,
          });
      }
    }

    // Map stop reason
    const stopReason = this.mapStopReason(response.stop_reason);

    // Build parsed response
    const parsed: ParsedResponse = {
      content,
      stopReason,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        ...(response.usage.cache_read_input_tokens !== undefined && {
          cacheReadTokens: response.usage.cache_read_input_tokens,
        }),
        ...(response.usage.cache_creation_input_tokens !== undefined && {
          cacheWriteTokens: response.usage.cache_creation_input_tokens,
        }),
      },
      ...(thinking && { thinking }),
      ...(toolCalls.length > 0 && { toolCalls }),
    };

    return this.createResult(parsed, warnings);
  }

  /**
   * Map Anthropic stop reason to Vellum StopReason
   */
  private mapStopReason(reason: string | null | undefined): StopReason {
    switch (reason) {
      case "end_turn":
        return "end_turn";
      case "max_tokens":
        return "max_tokens";
      case "stop_sequence":
        return "stop_sequence";
      case "tool_use":
        return "tool_use";
      case "content_filter":
        return "content_filter";
      default:
        return "end_turn";
    }
  }

  // ===========================================================================
  // Caching Implementation
  // ===========================================================================

  /**
   * Apply Anthropic prompt caching to messages
   *
   * Caching strategy:
   * 1. Apply ephemeral cache to system message content
   * 2. Apply ephemeral cache to last 2 user messages
   *
   * This optimizes for typical conversation patterns where:
   * - System prompts are reused across requests
   * - Recent context is most likely to be repeated
   */
  override applyCaching(
    messages: CompletionMessage[],
    config: TransformConfig
  ): TransformResult<CachedMessage[]> {
    const warnings: TransformWarning[] = [];

    if (!config.enableCaching) {
      this.addWarning(warnings, {
        code: "CACHING_DISABLED",
        message: "Caching is disabled in config",
        severity: "info",
      });
      return this.createResult(messages as CachedMessage[], warnings);
    }

    const cached: CachedMessage[] = messages.map((m) => ({ ...m }));

    // Track user message indices (excluding system)
    const userMessageIndices: number[] = [];
    cached.forEach((m, i) => {
      if (m.role === "user") {
        userMessageIndices.push(i);
      }
    });

    // Apply caching to system messages
    for (const message of cached) {
      if (message.role === "system") {
        this.applyCacheControlToMessage(message);
      }
    }

    // Apply caching to last 2 user messages
    const lastTwoUserIndices = userMessageIndices.slice(-2);
    for (const index of lastTwoUserIndices) {
      const message = cached[index];
      if (message) {
        this.applyCacheControlToMessage(message);
      }
    }

    return this.createResult(cached, warnings);
  }

  /**
   * Apply cache control to a single message
   */
  private applyCacheControlToMessage(message: CachedMessage): void {
    const cacheControl: CacheControl = { type: "ephemeral" };

    if (typeof message.content === "string") {
      // For string content, add cache control at message level
      message.cacheControl = cacheControl;
    } else if (Array.isArray(message.content) && message.content.length > 0) {
      // For array content, apply cache control to the last text/tool_result part
      const cacheable = [...message.content]
        .reverse()
        .find((p) => p.type === "text" || p.type === "tool_result");

      if (cacheable) {
        // Add cache control at message level - will be applied during transform
        message.cacheControl = cacheControl;
      }
    }
  }
}

// =============================================================================
// Singleton Export
// =============================================================================

/**
 * Singleton instance of the Anthropic transform
 *
 * Use this exported instance for all Anthropic transformations.
 *
 * @example
 * ```typescript
 * import { anthropicTransform } from './transforms/anthropic.js';
 *
 * const messagesResult = anthropicTransform.transformMessages(messages, config);
 * const toolsResult = anthropicTransform.transformTools(tools, config);
 * const parsed = anthropicTransform.parseResponse(response, config);
 * ```
 */
export const anthropicTransform = new AnthropicTransform();
