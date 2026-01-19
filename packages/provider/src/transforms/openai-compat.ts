// =============================================================================
// OpenAI-Compatible Provider Transform
// Phase 1: Agent System Upgrade
//
// Extends the base OpenAI transform to handle provider-specific quirks for:
// - Qwen (阿里通义)        - DeepSeek               - Moonshot (月之暗面)
// - Yi (零一万物)          - Baichuan (百川)         - Groq
// - xAI (Grok)            - Mistral                 - OpenRouter
// - Ollama                - LMStudio                - Doubao (字节豆包)
// - MiniMax
// =============================================================================

import type { CompletionMessage, ProviderType, ToolDefinition } from "../types.js";
import { AbstractProviderTransform } from "./base.js";
import {
  type OpenAIMessage,
  type OpenAIResponse,
  type OpenAITool,
  openaiTransform,
} from "./openai.js";
import type {
  ParsedResponse,
  TransformConfig,
  TransformResult,
  TransformWarning,
} from "./types.js";

// =============================================================================
// OpenAI-Compatible Provider Identifiers
// =============================================================================

/**
 * Known OpenAI-compatible providers
 *
 * These providers use the OpenAI API format with varying degrees of compatibility.
 */
export const OPENAI_COMPAT_PROVIDERS = [
  "qwen",
  "deepseek",
  "moonshot",
  "yi",
  "baichuan",
  "groq",
  "xai",
  "grok",
  "mistral",
  "openrouter",
  "ollama",
  "lmstudio",
  "doubao",
  "minimax",
  "together",
  "fireworks",
  "perplexity",
  "cerebras",
  "sambanova",
  "openai-compat",
] as const;

export type OpenAICompatProvider = (typeof OPENAI_COMPAT_PROVIDERS)[number];

/**
 * Check if a provider is OpenAI-compatible
 */
export function isOpenAICompatProvider(provider: string): provider is OpenAICompatProvider {
  return OPENAI_COMPAT_PROVIDERS.includes(provider as OpenAICompatProvider);
}

// =============================================================================
// Provider-Specific Configuration
// =============================================================================

/**
 * Configuration for provider-specific behavior adjustments
 */
export interface OpenAICompatConfig {
  /** Provider identifier */
  provider: OpenAICompatProvider | string;

  /**
   * Default temperature for this provider
   * Some providers have specific temperature requirements for optimal results
   * - Qwen: 0.55 (recommended by OpenCode research)
   * - Gemini via OpenRouter: 1.0
   * - Others: undefined (let provider decide)
   */
  defaultTemperature?: number;

  /**
   * Tool call ID normalization strategy
   * - "standard": Use base OpenAI sanitization (alphanumeric, hyphen, underscore)
   * - "mistral": Exactly 9 alphanumeric characters (Mistral requirement)
   */
  toolIdStrategy: "standard" | "mistral";

  /**
   * Whether to filter empty messages (some providers reject them)
   */
  filterEmptyMessages: boolean;

  /**
   * Whether to handle reasoning/thinking content specially
   * Some providers return reasoning in a separate field
   */
  handleReasoningContent: boolean;

  /**
   * Whether assistant messages require content when tool_calls present
   * Some providers require at least empty string, others accept null
   */
  requireAssistantContent: boolean;

  /**
   * Insert synthetic assistant message between tool results and user messages
   * Mistral and some others require this to maintain valid message sequences
   */
  insertToolResultBridge: boolean;
}

/**
 * Default configuration for OpenAI-compatible providers
 */
const DEFAULT_CONFIG: Omit<OpenAICompatConfig, "provider"> = {
  toolIdStrategy: "standard",
  filterEmptyMessages: false,
  handleReasoningContent: false,
  requireAssistantContent: false,
  insertToolResultBridge: false,
};

/**
 * Provider-specific configuration overrides
 * Based on OpenCode research and provider documentation
 */
const PROVIDER_CONFIGS: Partial<Record<string, Partial<OpenAICompatConfig>>> = {
  // Qwen (阿里通义) - temperature 0.55 recommended
  qwen: {
    defaultTemperature: 0.55,
    filterEmptyMessages: true,
  },

  // DeepSeek - standard compatibility
  deepseek: {
    filterEmptyMessages: true,
    handleReasoningContent: true,
  },

  // Moonshot (月之暗面) - standard compatibility
  moonshot: {
    filterEmptyMessages: true,
    handleReasoningContent: true,
  },

  // Yi (零一万物) - standard compatibility
  yi: {
    filterEmptyMessages: true,
  },

  // Baichuan (百川) - standard compatibility
  baichuan: {
    filterEmptyMessages: true,
  },

  // Groq - fast inference, standard format
  groq: {
    filterEmptyMessages: true,
    handleReasoningContent: true,
  },

  // xAI (Grok) - standard compatibility
  xai: {
    filterEmptyMessages: true,
    handleReasoningContent: true,
  },
  grok: {
    filterEmptyMessages: true,
    handleReasoningContent: true,
  },

  // Mistral - requires exactly 9-char alphanumeric tool IDs and message bridges
  mistral: {
    toolIdStrategy: "mistral",
    filterEmptyMessages: true,
    insertToolResultBridge: true,
  },

  // OpenRouter - gateway to many providers
  openrouter: {
    filterEmptyMessages: true,
    handleReasoningContent: true,
  },

  // Ollama - local inference
  ollama: {
    filterEmptyMessages: true,
    requireAssistantContent: true,
  },

  // LMStudio - local inference
  lmstudio: {
    filterEmptyMessages: true,
    requireAssistantContent: true,
  },

  // Doubao (字节豆包) - ByteDance
  doubao: {
    filterEmptyMessages: true,
  },

  // MiniMax - standard compatibility
  minimax: {
    filterEmptyMessages: true,
    handleReasoningContent: true,
  },

  // Together AI
  together: {
    filterEmptyMessages: true,
    handleReasoningContent: true,
  },

  // Fireworks AI
  fireworks: {
    filterEmptyMessages: true,
  },

  // Perplexity - specialized for search
  perplexity: {
    filterEmptyMessages: true,
  },

  // Cerebras - fast inference
  cerebras: {
    filterEmptyMessages: true,
    handleReasoningContent: true,
  },

  // SambaNova - fast inference
  sambanova: {
    filterEmptyMessages: true,
  },
};

/**
 * Get provider configuration with defaults
 */
function getProviderConfig(provider: string): OpenAICompatConfig {
  const overrides = PROVIDER_CONFIGS[provider.toLowerCase()] ?? {};
  return {
    ...DEFAULT_CONFIG,
    provider,
    ...overrides,
  };
}

// =============================================================================
// OpenAI-Compatible Transform Implementation
// =============================================================================

/**
 * OpenAI-compatible transform with provider-specific adjustments
 *
 * Uses composition with the base OpenAI transform to handle quirks and requirements
 * of various OpenAI-compatible API providers.
 *
 * @example
 * ```typescript
 * // Create transform for Mistral
 * const mistralTransform = createOpenAICompatTransform('mistral');
 *
 * // Transform messages with Mistral-specific handling
 * const result = mistralTransform.transformMessages(messages, {
 *   provider: 'mistral',
 *   modelId: 'mistral-large',
 * });
 * ```
 */
export class OpenAICompatTransform extends AbstractProviderTransform<
  OpenAIMessage,
  OpenAITool,
  OpenAIResponse
> {
  /** Provider-specific configuration */
  private readonly compatConfig: OpenAICompatConfig;

  /** Provider type for this transform instance */
  readonly provider: ProviderType;

  constructor(providerConfig?: OpenAICompatConfig | string) {
    super();

    if (typeof providerConfig === "string") {
      this.compatConfig = getProviderConfig(providerConfig);
    } else if (providerConfig) {
      this.compatConfig = { ...DEFAULT_CONFIG, ...providerConfig };
    } else {
      this.compatConfig = { ...DEFAULT_CONFIG, provider: "openai-compat" };
    }

    // Set provider after config is initialized
    this.provider = this.compatConfig.provider as ProviderType;
  }

  // ===========================================================================
  // Message Transformation
  // ===========================================================================

  /**
   * Transform messages with provider-specific handling
   */
  transformMessages(
    messages: CompletionMessage[],
    config: TransformConfig
  ): TransformResult<OpenAIMessage[]> {
    const warnings: TransformWarning[] = [];

    // Apply provider-specific filtering
    let processedMessages = messages;

    // Filter empty messages if required
    if (this.compatConfig.filterEmptyMessages) {
      processedMessages = this.filterEmptyMessages(processedMessages);
    }

    // Use base OpenAI transformation (via singleton)
    const baseResult = openaiTransform.transformMessages(processedMessages, config);
    warnings.push(...baseResult.warnings);

    // Apply provider-specific post-processing
    let result = baseResult.data;

    // Handle tool ID normalization based on provider strategy
    if (this.compatConfig.toolIdStrategy === "mistral") {
      result = this.normalizeMistralToolIds(result);
    }

    // Insert bridge messages between tool results and user messages if required
    if (this.compatConfig.insertToolResultBridge) {
      result = this.insertToolResultBridges(result);
    }

    // Ensure assistant content requirements
    if (this.compatConfig.requireAssistantContent) {
      result = this.ensureAssistantContent(result);
    }

    return this.createResult(result, warnings);
  }

  // ===========================================================================
  // Tool Transformation
  // ===========================================================================

  /**
   * Transform tools - delegates to base OpenAI transform
   */
  transformTools(tools: ToolDefinition[], config: TransformConfig): TransformResult<OpenAITool[]> {
    // Delegate to base OpenAI transform
    return openaiTransform.transformTools(tools, config);
  }

  // ===========================================================================
  // Response Parsing
  // ===========================================================================

  /**
   * Parse response with provider-specific handling
   */
  parseResponse(
    response: OpenAIResponse,
    config: TransformConfig
  ): TransformResult<ParsedResponse> {
    // Use base OpenAI parsing (via singleton)
    const baseResult = openaiTransform.parseResponse(response, config);

    // Extract reasoning content if available and provider supports it
    if (this.compatConfig.handleReasoningContent) {
      const thinking = this.extractReasoningContent(response);
      if (thinking) {
        return this.createResult({ ...baseResult.data, thinking }, baseResult.warnings);
      }
    }

    return baseResult;
  }

  // ===========================================================================
  // Provider-Specific Utilities
  // ===========================================================================

  /**
   * Get the recommended temperature for this provider
   *
   * Returns undefined if the provider doesn't have a specific recommendation,
   * allowing the caller to use their own default or let the provider decide.
   */
  getRecommendedTemperature(): number | undefined {
    return this.compatConfig.defaultTemperature;
  }

  /**
   * Get the full provider configuration
   */
  getConfig(): Readonly<OpenAICompatConfig> {
    return this.compatConfig;
  }

  // ===========================================================================
  // Private Helper Methods
  // ===========================================================================

  /**
   * Filter out messages with empty or whitespace-only content
   */
  private filterEmptyMessages(messages: CompletionMessage[]): CompletionMessage[] {
    return messages.filter((message) => {
      const { content } = message;

      if (typeof content === "string") {
        return content.trim().length > 0;
      }

      if (Array.isArray(content)) {
        // Filter out empty text parts
        const nonEmptyParts = content.filter((part) => {
          if (part.type === "text") {
            return part.text.trim().length > 0;
          }
          // Keep non-text parts (images, tool_use, tool_result)
          return true;
        });
        return nonEmptyParts.length > 0;
      }

      return true;
    });
  }

  /**
   * Normalize tool IDs for Mistral (exactly 9 alphanumeric characters)
   */
  private normalizeMistralToolIds(messages: OpenAIMessage[]): OpenAIMessage[] {
    return messages.map((message) => {
      // Handle assistant messages with tool_calls
      if (message.role === "assistant" && "tool_calls" in message && message.tool_calls) {
        return {
          ...message,
          tool_calls: message.tool_calls.map((call) => ({
            ...call,
            id: this.toMistralToolId(call.id),
          })),
        };
      }

      // Handle tool messages
      if (message.role === "tool" && "tool_call_id" in message) {
        return {
          ...message,
          tool_call_id: this.toMistralToolId(message.tool_call_id),
        };
      }

      return message;
    });
  }

  /**
   * Convert a tool ID to Mistral format (exactly 9 alphanumeric characters)
   */
  private toMistralToolId(id: string): string {
    // Remove non-alphanumeric characters
    const alphanumeric = id.replace(/[^a-zA-Z0-9]/g, "");
    // Take first 9 characters and pad if necessary
    return alphanumeric.slice(0, 9).padEnd(9, "0");
  }

  /**
   * Insert synthetic assistant messages between tool results and user messages
   *
   * Some providers (like Mistral) don't allow tool messages to be followed
   * directly by user messages - they require an assistant message in between.
   */
  private insertToolResultBridges(messages: OpenAIMessage[]): OpenAIMessage[] {
    const result: OpenAIMessage[] = [];

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (!msg) continue;

      const nextMsg = messages[i + 1];

      result.push(msg);

      // If current is tool and next is user, insert bridge
      if (msg.role === "tool" && nextMsg?.role === "user") {
        result.push({
          role: "assistant",
          content: "Done.",
        });
      }
    }

    return result;
  }

  /**
   * Ensure assistant messages have content (at least empty string)
   *
   * Some providers don't accept null content in assistant messages,
   * even when tool_calls are present.
   */
  private ensureAssistantContent(messages: OpenAIMessage[]): OpenAIMessage[] {
    return messages.map((message) => {
      if (message.role === "assistant" && "content" in message) {
        // If content is null/undefined, set to empty string
        if (message.content == null) {
          return { ...message, content: "" };
        }
      }
      return message;
    });
  }

  /**
   * Extract reasoning/thinking content from provider-specific response fields
   *
   * Different providers may include reasoning in different locations:
   * - reasoning_content field (DeepSeek, some OpenRouter models)
   * - thinking field
   * - reasoning field
   */
  private extractReasoningContent(response: OpenAIResponse): string | undefined {
    if (!response.choices || response.choices.length === 0) {
      return undefined;
    }

    const choice = response.choices[0];
    if (!choice) return undefined;

    const message = choice.message as Record<string, unknown>;

    // Check common reasoning field names
    const reasoningFields = [
      "reasoning_content",
      "thinking",
      "reasoning",
      "thought",
      "chain_of_thought",
    ];

    for (const field of reasoningFields) {
      const value = message[field];
      if (typeof value === "string" && value.trim().length > 0) {
        return value;
      }
    }

    return undefined;
  }

  // ===========================================================================
  // Tool ID Handling
  // ===========================================================================

  /**
   * Sanitize tool call ID with provider-specific handling
   */
  protected override sanitizeToolCallId(id: string | undefined | null): string {
    // For Mistral, use the special 9-char format
    if (this.compatConfig.toolIdStrategy === "mistral") {
      if (id == null || id.trim().length === 0) {
        return this.generateMistralToolId();
      }
      return this.toMistralToolId(id);
    }

    // Otherwise use base implementation
    return super.sanitizeToolCallId(id);
  }

  /**
   * Generate a Mistral-compatible tool call ID (9 alphanumeric characters)
   */
  private generateMistralToolId(): string {
    // Generate random alphanumeric string of exactly 9 characters
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < 9; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create an OpenAI-compatible transform for a specific provider
 *
 * @param provider - Provider identifier (e.g., 'mistral', 'groq', 'deepseek')
 * @returns Configured transform instance for the provider
 *
 * @example
 * ```typescript
 * // Create provider-specific transforms
 * const mistralTransform = createOpenAICompatTransform('mistral');
 * const groqTransform = createOpenAICompatTransform('groq');
 * const qwenTransform = createOpenAICompatTransform('qwen');
 *
 * // Get recommended temperature for provider
 * const temp = mistralTransform.getRecommendedTemperature();
 * ```
 */
export function createOpenAICompatTransform(provider: string): OpenAICompatTransform {
  return new OpenAICompatTransform(provider);
}

// =============================================================================
// Singleton Export
// =============================================================================

/**
 * Default OpenAI-compatible transform instance
 *
 * Use this for generic OpenAI-compatible providers where no
 * specific configuration is needed.
 *
 * For providers with known quirks (Mistral, Qwen, etc.), prefer
 * using createOpenAICompatTransform() to get a properly configured instance.
 *
 * @example
 * ```typescript
 * import { openaiCompatTransform, createOpenAICompatTransform } from './transforms/openai-compat.js';
 *
 * // Generic usage
 * const result = openaiCompatTransform.transformMessages(messages, config);
 *
 * // Provider-specific usage (recommended for known providers)
 * const mistralTransform = createOpenAICompatTransform('mistral');
 * const result = mistralTransform.transformMessages(messages, config);
 * ```
 */
export const openaiCompatTransform = new OpenAICompatTransform();
