// =============================================================================
// OpenAI Provider Transform
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
import { stripSchemaMetaFields } from "./schema-sanitizer.js";
import type {
  ParsedResponse,
  TransformConfig,
  TransformResult,
  TransformWarning,
} from "./types.js";

// =============================================================================
// OpenAI-Specific Types
// =============================================================================

/**
 * OpenAI text content part
 */
interface OpenAITextContent {
  type: "text";
  text: string;
}

/**
 * OpenAI image URL content part
 */
interface OpenAIImageContent {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
}

/**
 * Union of OpenAI content parts for user messages
 */
type OpenAIContentPart = OpenAITextContent | OpenAIImageContent;

/**
 * OpenAI tool call in assistant messages
 */
interface OpenAIToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * OpenAI system message format
 */
interface OpenAISystemMessage {
  role: "system";
  content: string;
}

/**
 * OpenAI user message format
 */
interface OpenAIUserMessage {
  role: "user";
  content: string | OpenAIContentPart[];
}

/**
 * OpenAI assistant message format
 */
interface OpenAIAssistantMessage {
  role: "assistant";
  content?: string | null;
  tool_calls?: OpenAIToolCall[];
  /** Legacy function_call format (deprecated but still supported) */
  function_call?: {
    name: string;
    arguments: string;
  };
}

/**
 * OpenAI tool result message format
 */
interface OpenAIToolMessage {
  role: "tool";
  tool_call_id: string;
  content: string;
}

/**
 * Union of all OpenAI message types
 */
export type OpenAIMessage =
  | OpenAISystemMessage
  | OpenAIUserMessage
  | OpenAIAssistantMessage
  | OpenAIToolMessage;

/**
 * OpenAI tool definition format (function calling)
 */
export interface OpenAITool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/**
 * OpenAI response choice format
 */
interface OpenAIChoice {
  index: number;
  message: {
    role: string;
    content?: string | null;
    tool_calls?: OpenAIToolCall[];
    function_call?: {
      name: string;
      arguments: string;
    };
  };
  finish_reason: string | null;
}

/**
 * OpenAI usage statistics format
 */
interface OpenAIUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

/**
 * OpenAI API response format
 */
export interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: OpenAIChoice[];
  usage?: OpenAIUsage;
}

// =============================================================================
// OpenAI Transform Implementation
// =============================================================================

/**
 * Transform implementation for OpenAI provider
 *
 * Converts Vellum's Anthropic-style internal format to OpenAI's API format.
 * Handles the structural differences between the two APIs:
 * - Tool use/results are separate message types in OpenAI
 * - Images use URL format instead of base64 source objects
 * - Tool calls are part of assistant messages, not content blocks
 *
 * @example
 * ```typescript
 * const result = openaiTransform.transformMessages(messages, {
 *   provider: 'openai',
 *   modelId: 'gpt-4o',
 * });
 *
 * // Use result.data for API call, log result.warnings
 * ```
 */
export class OpenAITransform extends AbstractProviderTransform<
  OpenAIMessage,
  OpenAITool,
  OpenAIResponse
> {
  readonly provider = "openai" as const;

  // ===========================================================================
  // Message Transformation
  // ===========================================================================

  /**
   * Transform Vellum messages to OpenAI format
   *
   * Key transformations:
   * 1. System messages pass through as-is
   * 2. User messages convert content parts to OpenAI format
   * 3. Assistant messages with tool_use become messages with tool_calls
   * 4. Tool results become separate "tool" role messages
   */
  transformMessages(
    messages: CompletionMessage[],
    _config: TransformConfig
  ): TransformResult<OpenAIMessage[]> {
    const warnings: TransformWarning[] = [];

    // Normalize empty content
    const normalized = this.normalizeEmptyContent(messages);

    const result: OpenAIMessage[] = [];

    for (const message of normalized) {
      const transformed = this.transformMessage(message, warnings);
      result.push(...transformed);
    }

    return this.createResult(result, warnings);
  }

  /**
   * Transform a single message to OpenAI format
   *
   * A single Vellum message may produce multiple OpenAI messages:
   * - User message with tool_results → tool messages + user message
   * - Assistant message with tool_use → assistant message with tool_calls
   */
  private transformMessage(
    message: CompletionMessage,
    warnings: TransformWarning[]
  ): OpenAIMessage[] {
    const result: OpenAIMessage[] = [];

    switch (message.role) {
      case "system":
        result.push(this.transformSystemMessage(message));
        break;

      case "user":
        result.push(...this.transformUserMessage(message, warnings));
        break;

      case "assistant":
        result.push(this.transformAssistantMessage(message, warnings));
        break;
    }

    return result;
  }

  /**
   * Transform system message to OpenAI format
   */
  private transformSystemMessage(message: CompletionMessage): OpenAISystemMessage {
    const content =
      typeof message.content === "string"
        ? message.content
        : message.content.map((p) => (p.type === "text" ? p.text : "")).join("");

    return {
      role: "system",
      content,
    };
  }

  /**
   * Transform user message to OpenAI format
   *
   * Handles the split between tool_result parts (become tool messages)
   * and regular content parts (become user message)
   */
  private transformUserMessage(
    message: CompletionMessage,
    warnings: TransformWarning[]
  ): OpenAIMessage[] {
    const result: OpenAIMessage[] = [];

    // Simple string content
    if (typeof message.content === "string") {
      return [{ role: "user", content: message.content }];
    }

    // Separate tool results from other content
    const toolResults: ContentPart[] = [];
    const otherContent: ContentPart[] = [];

    for (const part of message.content) {
      if (part.type === "tool_result") {
        toolResults.push(part);
      } else {
        otherContent.push(part);
      }
    }

    // Tool results become separate tool messages (must come first to follow tool_calls)
    for (const part of toolResults) {
      if (part.type === "tool_result") {
        result.push({
          role: "tool",
          tool_call_id: this.sanitizeToolCallId(part.toolUseId),
          content: typeof part.content === "string" ? part.content : JSON.stringify(part.content),
        });
      }
    }

    // Other content becomes user message
    if (otherContent.length > 0) {
      const content = this.transformUserContent(otherContent, warnings);
      if (content.length > 0) {
        // Use string for single text content, array for multi-part
        const firstPart = content[0];
        if (content.length === 1 && firstPart && firstPart.type === "text") {
          result.push({ role: "user", content: firstPart.text });
        } else {
          result.push({ role: "user", content });
        }
      }
    }

    return result;
  }

  /**
   * Transform user content parts to OpenAI format
   */
  private transformUserContent(
    parts: ContentPart[],
    warnings: TransformWarning[]
  ): OpenAIContentPart[] {
    const result: OpenAIContentPart[] = [];

    for (const part of parts) {
      switch (part.type) {
        case "text":
          result.push({ type: "text", text: part.text });
          break;

        case "image":
          result.push(this.transformImageContent(part));
          break;

        case "tool_use":
          // Tool use in user message is unusual - add warning
          this.addWarning(warnings, {
            code: "UNEXPECTED_CONTENT_TYPE",
            message: "tool_use in user message is not expected, skipping",
            severity: "warning",
            field: "content",
            originalValue: part,
          });
          break;

        case "tool_result":
          // Should have been handled separately
          break;
      }
    }

    return result;
  }

  /**
   * Transform image content part to OpenAI format
   */
  private transformImageContent(part: ContentPart & { type: "image" }): OpenAIImageContent {
    // Check if source is already a URL or base64 data
    const isUrl = part.source.startsWith("http://") || part.source.startsWith("https://");
    const isDataUrl = part.source.startsWith("data:");

    let url: string;
    if (isUrl || isDataUrl) {
      url = part.source;
    } else {
      // Assume base64 data, construct data URL
      url = `data:${part.mimeType};base64,${part.source}`;
    }

    return {
      type: "image_url",
      image_url: { url },
    };
  }

  /**
   * Transform assistant message to OpenAI format
   *
   * Handles:
   * - Simple text content
   * - Mixed content with text and tool_use blocks
   * - Tool calls array construction
   */
  private transformAssistantMessage(
    message: CompletionMessage,
    warnings: TransformWarning[]
  ): OpenAIAssistantMessage {
    // Simple string content
    if (typeof message.content === "string") {
      return { role: "assistant", content: message.content };
    }

    // Extract text content and tool calls
    let textContent = "";
    const toolCalls: OpenAIToolCall[] = [];

    for (const part of message.content) {
      switch (part.type) {
        case "text":
          textContent += part.text;
          break;

        case "tool_use":
          toolCalls.push({
            id: this.sanitizeToolCallId(part.id),
            type: "function",
            function: {
              name: part.name,
              arguments: JSON.stringify(part.input),
            },
          });
          break;

        case "image":
          // Assistant cannot send images in OpenAI format
          this.addWarning(warnings, {
            code: "UNSUPPORTED_CONTENT_TYPE",
            message: "Image content in assistant message not supported by OpenAI, skipping",
            severity: "warning",
            field: "content",
            originalValue: part,
          });
          break;

        case "tool_result":
          // Tool results in assistant message are unexpected
          this.addWarning(warnings, {
            code: "UNEXPECTED_CONTENT_TYPE",
            message: "tool_result in assistant message is not expected, skipping",
            severity: "warning",
            field: "content",
            originalValue: part,
          });
          break;
      }
    }

    // Build result
    const result: OpenAIAssistantMessage = {
      role: "assistant",
      content: textContent || null,
    };

    // Add tool_calls if present (cannot be empty array)
    if (toolCalls.length > 0) {
      result.tool_calls = toolCalls;
    }

    return result;
  }

  // ===========================================================================
  // Tool Transformation
  // ===========================================================================

  /**
   * Transform Vellum tool definitions to OpenAI function calling format
   *
   * OpenAI tools have the format:
   * { type: "function", function: { name, description, parameters } }
   */
  transformTools(tools: ToolDefinition[], _config: TransformConfig): TransformResult<OpenAITool[]> {
    const warnings: TransformWarning[] = [];

    const transformed = tools.map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: stripSchemaMetaFields(tool.inputSchema),
      },
    }));

    return this.createResult(transformed, warnings);
  }

  // ===========================================================================
  // Response Parsing
  // ===========================================================================

  /**
   * Parse OpenAI response to Vellum canonical format
   *
   * Handles:
   * - choices[0].message.content for text
   * - choices[0].message.tool_calls for tool calls (new format)
   * - choices[0].message.function_call for function call (legacy format)
   * - usage statistics
   */
  parseResponse(
    response: OpenAIResponse,
    _config: TransformConfig
  ): TransformResult<ParsedResponse> {
    const warnings: TransformWarning[] = [];

    // Handle empty choices
    if (!response.choices || response.choices.length === 0) {
      this.addWarning(warnings, {
        code: "EMPTY_RESPONSE",
        message: "OpenAI response has no choices",
        severity: "warning",
      });

      return this.createResult(
        {
          content: "",
          stopReason: "error",
          usage: { inputTokens: 0, outputTokens: 0 },
        },
        warnings
      );
    }

    // We've already checked choices.length > 0 above, but TypeScript needs explicit check
    const choice = response.choices[0];
    if (!choice) {
      // Should never happen due to length check above
      return this.createResult(
        {
          content: "",
          stopReason: "error",
          usage: { inputTokens: 0, outputTokens: 0 },
        },
        warnings
      );
    }
    const message = choice.message;

    // Extract content
    const content = message.content ?? "";

    // Extract tool calls (new format)
    const toolCalls: ToolCall[] = [];

    if (message.tool_calls && message.tool_calls.length > 0) {
      for (const toolCall of message.tool_calls) {
        if (toolCall.type === "function" && toolCall.function) {
          toolCalls.push({
            id: toolCall.id,
            name: toolCall.function.name,
            input: this.safeParseJson(toolCall.function.arguments, warnings),
          });
        }
      }
    }

    // Handle legacy function_call format
    if (message.function_call && toolCalls.length === 0) {
      toolCalls.push({
        id: this.generateToolCallId(),
        name: message.function_call.name,
        input: this.safeParseJson(message.function_call.arguments, warnings),
      });
    }

    // Map stop reason
    const stopReason = this.mapStopReason(choice.finish_reason);

    // Build parsed response
    const parsed: ParsedResponse = {
      content,
      stopReason,
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
      ...(toolCalls.length > 0 && { toolCalls }),
    };

    return this.createResult(parsed, warnings);
  }

  /**
   * Safely parse JSON arguments string
   */
  private safeParseJson(json: string, warnings: TransformWarning[]): Record<string, unknown> {
    try {
      const parsed = JSON.parse(json);
      return typeof parsed === "object" && parsed !== null ? parsed : {};
    } catch {
      this.addWarning(warnings, {
        code: "JSON_PARSE_ERROR",
        message: "Failed to parse tool call arguments as JSON",
        severity: "warning",
        originalValue: json,
        transformedValue: {},
      });
      return {};
    }
  }

  /**
   * Map OpenAI finish_reason to Vellum StopReason
   */
  private mapStopReason(reason: string | null | undefined): StopReason {
    switch (reason) {
      case "stop":
        return "end_turn";
      case "length":
        return "max_tokens";
      case "tool_calls":
      case "function_call":
        return "tool_use";
      case "content_filter":
        return "content_filter";
      default:
        return "end_turn";
    }
  }
}

// =============================================================================
// Singleton Export
// =============================================================================

/**
 * Singleton instance of the OpenAI transform
 *
 * Use this exported instance for all OpenAI transformations.
 *
 * @example
 * ```typescript
 * import { openaiTransform } from './transforms/openai.js';
 *
 * const messagesResult = openaiTransform.transformMessages(messages, config);
 * const toolsResult = openaiTransform.transformTools(tools, config);
 * const parsed = openaiTransform.parseResponse(response, config);
 * ```
 */
export const openaiTransform = new OpenAITransform();
