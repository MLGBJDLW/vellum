// =============================================================================
// Google Gemini Provider Transform
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
import { sanitizeJsonSchemaForGemini } from "./schema-sanitizer.js";
import type {
  ParsedResponse,
  TransformConfig,
  TransformResult,
  TransformWarning,
} from "./types.js";

// =============================================================================
// Gemini-Specific Types
// =============================================================================

/**
 * Gemini text part
 */
interface GeminiTextPart {
  text: string;
  /** Thought signature for thinking models (Gemini 2.5+) */
  thoughtSignature?: string;
}

/**
 * Gemini inline data part (for base64 images)
 */
interface GeminiInlineDataPart {
  inlineData: {
    mimeType: string;
    data: string;
  };
}

/**
 * Gemini file data part (for URI-based images)
 */
interface GeminiFileDataPart {
  fileData: {
    mimeType: string;
    fileUri: string;
  };
}

/**
 * Gemini function call part (tool use request)
 */
interface GeminiFunctionCallPart {
  functionCall: {
    name: string;
    args: Record<string, unknown>;
  };
  /** Thought signature for thinking models (Gemini 2.5+) */
  thoughtSignature?: string;
}

/**
 * Gemini function response part (tool result)
 */
interface GeminiFunctionResponsePart {
  functionResponse: {
    name: string;
    response: {
      name: string;
      content: string;
    };
  };
}

/**
 * Union of all Gemini part types
 */
export type GeminiPart =
  | GeminiTextPart
  | GeminiInlineDataPart
  | GeminiFileDataPart
  | GeminiFunctionCallPart
  | GeminiFunctionResponsePart;

/**
 * Gemini content (message) format
 */
export interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

/**
 * Gemini function declaration (tool definition)
 */
interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: "OBJECT";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * Gemini tools wrapper containing function declarations
 */
export interface GeminiTool {
  functionDeclarations: GeminiFunctionDeclaration[];
}

/**
 * Gemini response candidate content part
 */
interface GeminiResponsePart {
  text?: string;
  functionCall?: {
    name: string;
    args: Record<string, unknown>;
  };
  thoughtSignature?: string;
}

/**
 * Gemini response candidate
 */
interface GeminiCandidate {
  content: {
    parts: GeminiResponsePart[];
    role: string;
  };
  finishReason?: string;
}

/**
 * Gemini usage metadata
 */
interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
  thoughtsTokenCount?: number;
  cachedContentTokenCount?: number;
}

/**
 * Gemini API response format
 */
export interface GeminiResponse {
  candidates?: GeminiCandidate[];
  usageMetadata?: GeminiUsageMetadata;
}

// =============================================================================
// Google Transform Implementation
// =============================================================================

/**
 * Transform implementation for Google Gemini provider
 *
 * Converts Vellum's Anthropic-style internal format to Google Gemini's API format.
 * Handles the structural differences between the two APIs:
 * - Roles: user/assistant → user/model
 * - Content parts use different formats (text, inlineData, functionCall, etc.)
 * - Tools use FunctionDeclaration format
 * - Special handling for thinking models with thoughtSignature
 *
 * @example
 * ```typescript
 * const result = googleTransform.transformMessages(messages, {
 *   provider: 'google',
 *   modelId: 'gemini-2.0-flash',
 * });
 *
 * // Use result.data for API call, log result.warnings
 * ```
 */
export class GoogleTransform extends AbstractProviderTransform<
  GeminiContent,
  GeminiTool,
  GeminiResponse
> {
  readonly provider = "google" as const;

  /**
   * Map of tool_use_id to tool name for function response correlation
   * Gemini requires tool name in functionResponse, not tool ID
   */
  private toolIdToName: Map<string, string> = new Map();

  // ===========================================================================
  // Message Transformation
  // ===========================================================================

  /**
   * Transform Vellum messages to Gemini format
   *
   * Key transformations:
   * 1. System messages are extracted (Gemini handles system as separate instruction)
   * 2. User/assistant roles → user/model
   * 3. Content parts converted to Gemini Part format
   * 4. Build tool ID → name mapping for function responses
   */
  transformMessages(
    messages: CompletionMessage[],
    config: TransformConfig
  ): TransformResult<GeminiContent[]> {
    const warnings: TransformWarning[] = [];

    // Reset tool ID mapping for this transformation
    this.toolIdToName.clear();

    // First pass: build tool ID to name mapping from assistant messages
    for (const message of messages) {
      if (message.role === "assistant" && Array.isArray(message.content)) {
        for (const part of message.content) {
          if (part.type === "tool_use") {
            this.toolIdToName.set(part.id, part.name);
          }
        }
      }
    }

    // Normalize empty content
    const normalized = this.normalizeEmptyContent(messages);

    const result: GeminiContent[] = [];
    const isThinkingModel = this.isThinkingModel(config.modelId);

    for (const message of normalized) {
      // Skip system messages - Gemini handles these separately
      if (message.role === "system") {
        continue;
      }

      const transformed = this.transformMessage(message, warnings, isThinkingModel);
      if (transformed) {
        result.push(transformed);
      }
    }

    return this.createResult(result, warnings);
  }

  /**
   * Check if the model is a Gemini thinking model (2.5+)
   */
  private isThinkingModel(modelId?: string): boolean {
    if (!modelId) return false;

    // Gemini 2.5+ models support thinking/reasoning
    const thinkingPatterns = ["gemini-2.5", "gemini-3", "gemini-exp", "gemini-2.0-flash-thinking"];

    return thinkingPatterns.some((pattern) =>
      modelId.toLowerCase().includes(pattern.toLowerCase())
    );
  }

  /**
   * Transform a single message to Gemini format
   */
  private transformMessage(
    message: CompletionMessage,
    warnings: TransformWarning[],
    isThinkingModel: boolean
  ): GeminiContent | null {
    const role: "user" | "model" = message.role === "assistant" ? "model" : "user";

    // Simple string content
    if (typeof message.content === "string") {
      return {
        role,
        parts: [{ text: message.content }],
      };
    }

    // Multi-part content
    const parts = this.transformContentParts(
      message.content,
      message.role,
      warnings,
      isThinkingModel
    );

    // Skip empty messages
    if (parts.length === 0) {
      return null;
    }

    return { role, parts };
  }

  /**
   * Transform content parts to Gemini Part format
   */
  private transformContentParts(
    content: ContentPart[],
    _role: string,
    warnings: TransformWarning[],
    isThinkingModel: boolean
  ): GeminiPart[] {
    const parts: GeminiPart[] = [];

    // Track if we found a thought signature (from thinking content)
    let thoughtSignature: string | undefined;

    for (const part of content) {
      switch (part.type) {
        case "text":
          parts.push({ text: part.text });
          break;

        case "image":
          parts.push(this.transformImagePart(part));
          break;

        case "tool_use":
          parts.push(this.transformToolUsePart(part, isThinkingModel, thoughtSignature));
          break;

        case "tool_result":
          parts.push(...this.transformToolResultPart(part, warnings));
          break;

        default: {
          // Handle unknown content types with warning
          this.addWarning(warnings, {
            code: "UNSUPPORTED_CONTENT_TYPE",
            message: `Unknown content part type: ${(part as ContentPart).type}`,
            severity: "warning",
            field: "content",
            originalValue: part,
          });
        }
      }
    }

    // For thinking models, ensure thought signatures are attached if needed
    if (isThinkingModel && thoughtSignature && parts.length > 0) {
      const firstPart = parts[0];
      // Only add to text parts if no functionCall parts have it
      if (firstPart && "text" in firstPart && !parts.some((p) => "thoughtSignature" in p)) {
        (firstPart as GeminiTextPart).thoughtSignature = thoughtSignature;
      }
    }

    return parts;
  }

  /**
   * Transform image content part to Gemini format
   */
  private transformImagePart(part: ContentPart & { type: "image" }): GeminiPart {
    const isUrl = part.source.startsWith("http://") || part.source.startsWith("https://");
    const isDataUrl = part.source.startsWith("data:");

    if (isUrl) {
      // Use fileData for URLs
      return {
        fileData: {
          mimeType: part.mimeType,
          fileUri: part.source,
        },
      };
    }

    // Extract base64 data from data URL or use raw base64
    let base64Data: string;
    if (isDataUrl) {
      // Extract base64 portion from data URL
      const matches = part.source.match(/^data:[^;]+;base64,(.+)$/);
      base64Data = matches?.[1] ?? part.source;
    } else {
      base64Data = part.source;
    }

    // Use inlineData for base64 images
    return {
      inlineData: {
        mimeType: part.mimeType,
        data: base64Data,
      },
    };
  }

  /**
   * Transform tool use content part to Gemini functionCall
   */
  private transformToolUsePart(
    part: ContentPart & { type: "tool_use" },
    isThinkingModel: boolean,
    thoughtSignature?: string
  ): GeminiFunctionCallPart {
    const functionCall: GeminiFunctionCallPart = {
      functionCall: {
        name: part.name,
        args: part.input,
      },
    };

    // For thinking models, attach thought signature for validation
    if (isThinkingModel) {
      // Use provided signature or fallback for cross-model compatibility
      functionCall.thoughtSignature = thoughtSignature || "skip_thought_signature_validator";
    }

    return functionCall;
  }

  /**
   * Transform tool result content part to Gemini functionResponse
   */
  private transformToolResultPart(
    part: ContentPart & { type: "tool_result" },
    warnings: TransformWarning[]
  ): GeminiPart[] {
    // Get tool name from the mapping
    const toolName = this.toolIdToName.get(part.toolUseId);

    if (!toolName) {
      this.addWarning(warnings, {
        code: "MISSING_TOOL_NAME",
        message: `Unable to find tool name for tool_use_id "${part.toolUseId}". Using ID as fallback.`,
        severity: "warning",
        field: "content",
        originalValue: part.toolUseId,
      });
    }

    // Use tool name or fall back to sanitized ID
    const name = toolName || this.sanitizeToolCallId(part.toolUseId);

    // Convert content to string
    const contentStr =
      typeof part.content === "string" ? part.content : JSON.stringify(part.content);

    // Include error indicator in response if present
    const responseContent = part.isError ? `[ERROR] ${contentStr}` : contentStr;

    return [
      {
        functionResponse: {
          name,
          response: {
            name,
            content: responseContent,
          },
        },
      },
    ];
  }

  // ===========================================================================
  // Tool Transformation
  // ===========================================================================

  /**
   * Transform Vellum tool definitions to Gemini FunctionDeclaration format
   *
   * Gemini tools have the format:
   * { functionDeclarations: [{ name, description, parameters: { type: "OBJECT", properties, required } }] }
   *
   * This method also sanitizes the JSON Schema to remove fields unsupported by Gemini:
   * - exclusiveMinimum/exclusiveMaximum → converted to minimum/maximum
   * - propertyNames, patternProperties, etc. → removed
   * - $schema, $id, $ref, etc. → removed
   */
  transformTools(tools: ToolDefinition[], _config: TransformConfig): TransformResult<GeminiTool[]> {
    const warnings: TransformWarning[] = [];

    if (tools.length === 0) {
      return this.createResult([], warnings);
    }

    const functionDeclarations: GeminiFunctionDeclaration[] = tools.map((tool) => {
      // Sanitize the schema to remove Gemini-unsupported fields
      const sanitizedSchema = sanitizeJsonSchemaForGemini(tool.inputSchema || {});

      // Extract properties and required from sanitized schema
      const properties = (sanitizedSchema.properties as Record<string, unknown>) || {};
      const required = (sanitizedSchema.required as string[]) || [];

      return {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: "OBJECT",
          properties,
          ...(required.length > 0 && { required }),
        },
      };
    });

    // Gemini wraps all function declarations in a single tool object
    return this.createResult([{ functionDeclarations }], warnings);
  }

  // ===========================================================================
  // Response Parsing
  // ===========================================================================

  /**
   * Parse Gemini response to Vellum canonical format
   *
   * Handles:
   * - candidates[0].content.parts for content
   * - functionCall parts → toolCalls
   * - usageMetadata for token counts
   * - thoughtSignature for thinking models
   */
  parseResponse(
    response: GeminiResponse,
    _config: TransformConfig
  ): TransformResult<ParsedResponse> {
    const warnings: TransformWarning[] = [];

    // Handle empty candidates
    if (!response.candidates || response.candidates.length === 0) {
      this.addWarning(warnings, {
        code: "EMPTY_RESPONSE",
        message: "Gemini response has no candidates",
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

    const candidate = response.candidates[0];
    if (!candidate) {
      return this.createResult(
        {
          content: "",
          stopReason: "error",
          usage: { inputTokens: 0, outputTokens: 0 },
        },
        warnings
      );
    }

    // Extract content and tool calls from parts
    let content = "";
    const toolCalls: ToolCall[] = [];

    if (candidate.content?.parts) {
      for (const part of candidate.content.parts) {
        if (part.text) {
          content += part.text;
        }

        if (part.functionCall) {
          toolCalls.push({
            id: this.generateToolCallId(),
            name: part.functionCall.name,
            input: part.functionCall.args || {},
          });
        }
      }
    }

    // Map finish reason
    const stopReason = this.mapFinishReason(candidate.finishReason);

    // Extract usage metadata
    const usage = response.usageMetadata;
    const tokenUsage = {
      inputTokens: usage?.promptTokenCount ?? 0,
      outputTokens: usage?.candidatesTokenCount ?? 0,
      ...(usage?.thoughtsTokenCount !== undefined && {
        thinkingTokens: usage.thoughtsTokenCount,
      }),
      ...(usage?.cachedContentTokenCount !== undefined && {
        cacheReadTokens: usage.cachedContentTokenCount,
      }),
    };

    // Build parsed response
    const parsed: ParsedResponse = {
      content,
      stopReason,
      usage: tokenUsage,
      ...(toolCalls.length > 0 && { toolCalls }),
    };

    return this.createResult(parsed, warnings);
  }

  /**
   * Map Gemini finishReason to Vellum StopReason
   */
  private mapFinishReason(reason?: string): StopReason {
    switch (reason) {
      case "STOP":
        return "end_turn";
      case "MAX_TOKENS":
        return "max_tokens";
      case "SAFETY":
        return "content_filter";
      case "RECITATION":
        return "content_filter";
      case "TOOL_CODE":
        return "tool_use";
      case "MALFORMED_FUNCTION_CALL":
        return "error";
      default:
        return "end_turn";
    }
  }
}

// =============================================================================
// Singleton Export
// =============================================================================

/**
 * Singleton instance of the Google Gemini transform
 *
 * Use this exported instance for all Google transformations.
 *
 * @example
 * ```typescript
 * import { googleTransform } from './transforms/google.js';
 *
 * const messagesResult = googleTransform.transformMessages(messages, config);
 * const toolsResult = googleTransform.transformTools(tools, config);
 * const parsed = googleTransform.parseResponse(response, config);
 * ```
 */
export const googleTransform = new GoogleTransform();
