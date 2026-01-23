/**
 * Token Counting Utilities
 *
 * Provides token counting functionality for different LLM providers.
 * Uses native SDK methods where available, falls back to estimation.
 *
 * @module @vellum/provider/tokenizer
 */

import { getEncoding, type TiktokenEncoding } from "js-tiktoken";
import type { CompletionMessage, ProviderType } from "./types.js";

// =============================================================================
// T035: Token Counting Types
// =============================================================================

/**
 * Result of a token count operation
 */
export interface TokenCountResult {
  /** Total token count */
  tokens: number;
  /** Whether this is an estimate or exact count */
  isEstimate: boolean;
  /** Method used for counting */
  method: "native" | "tiktoken" | "fallback";
}

/**
 * Options for token counting
 */
export interface TokenCountOptions {
  /** The model to use for counting (affects tokenization) */
  model?: string;
}

/**
 * Generic tokenizer interface
 */
export interface Tokenizer {
  /** Count tokens in text */
  countTokens(text: string, options?: TokenCountOptions): Promise<TokenCountResult>;
  /** Count tokens in messages */
  countMessageTokens(
    messages: CompletionMessage[],
    options?: TokenCountOptions
  ): Promise<TokenCountResult>;
}

// =============================================================================
// Fallback Estimation
// =============================================================================

/**
 * Average characters per token for different languages/content types.
 * English averages ~4 chars/token, code can be ~3, other languages vary.
 */
const CHARS_PER_TOKEN_ESTIMATES: Record<string, number> = {
  english: 4,
  code: 3,
  chinese: 2,
  japanese: 2,
  korean: 2,
};

/**
 * Detect content type from text for better estimation
 */
function detectContentType(text: string): "english" | "code" | "chinese" | "japanese" | "korean" {
  // Check for code patterns
  const codePatterns = /[{}[\]();=><]|function|const|let|var|import|export|class|def|async|await/;
  if (codePatterns.test(text)) {
    return "code";
  }

  // Check for CJK characters
  const cjkPattern = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/;
  const cjkMatches = text.match(cjkPattern);
  if (cjkMatches && cjkMatches.length > text.length * 0.2) {
    // Check specific scripts
    if (/[\u4e00-\u9fff]/.test(text)) return "chinese";
    if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) return "japanese";
    if (/[\uac00-\ud7af]/.test(text)) return "korean";
  }

  return "english";
}

/**
 * Estimate token count using character length heuristic.
 * Uses ~4 characters per token as default (reasonable for English).
 *
 * @param text - The text to estimate tokens for
 * @returns Estimated token count
 *
 * @example
 * ```typescript
 * const tokens = estimateTokenCount('Hello, world!');
 * // ~3 tokens (13 chars / 4)
 * ```
 */
export function estimateTokenCount(text: string): number {
  if (!text) return 0;

  const contentType = detectContentType(text);
  const charsPerToken = CHARS_PER_TOKEN_ESTIMATES[contentType] ?? 4;
  return Math.ceil(text.length / charsPerToken);
}

/**
 * Estimate tokens for a message including role overhead
 */
function estimateMessageTokens(message: CompletionMessage): number {
  // Each message has ~4 tokens overhead for role/structure
  const overhead = 4;

  let contentTokens: number;
  if (typeof message.content === "string") {
    contentTokens = estimateTokenCount(message.content);
  } else {
    // For array content, sum up text parts
    contentTokens = message.content.reduce((sum, part) => {
      if (part.type === "text") {
        return sum + estimateTokenCount(part.text);
      }
      if (part.type === "tool_use") {
        // Tool use adds name + JSON input
        return sum + estimateTokenCount(part.name) + estimateTokenCount(JSON.stringify(part.input));
      }
      if (part.type === "tool_result") {
        const content =
          typeof part.content === "string" ? part.content : JSON.stringify(part.content);
        return sum + estimateTokenCount(content);
      }
      // Images are typically fixed token counts (varies by model)
      if (part.type === "image") {
        return sum + 765; // Approximate for low-res image
      }
      return sum;
    }, 0);
  }

  return overhead + contentTokens;
}

// =============================================================================
// Provider-Specific Tokenizers
// =============================================================================

/**
 * Create Anthropic tokenizer using native SDK
 *
 * @param client - Anthropic client instance
 * @returns Tokenizer instance
 *
 * @example
 * ```typescript
 * import Anthropic from '@anthropic-ai/sdk';
 * const client = new Anthropic({ apiKey: 'sk-...' });
 * const tokenizer = createAnthropicTokenizer(client);
 * const result = await tokenizer.countTokens('Hello, world!');
 * ```
 */
export function createAnthropicTokenizer(client: {
  messages: {
    countTokens: (params: {
      model: string;
      messages: Array<{ role: string; content: string }>;
    }) => Promise<{ input_tokens: number }>;
  };
}): Tokenizer {
  return {
    async countTokens(text: string, options?: TokenCountOptions): Promise<TokenCountResult> {
      const model = options?.model ?? "claude-sonnet-4-20250514";
      try {
        const result = await client.messages.countTokens({
          model,
          messages: [{ role: "user", content: text }],
        });
        return {
          tokens: result.input_tokens,
          isEstimate: false,
          method: "native",
        };
      } catch {
        // Fall back to estimation
        return {
          tokens: estimateTokenCount(text),
          isEstimate: true,
          method: "fallback",
        };
      }
    },

    async countMessageTokens(
      messages: CompletionMessage[],
      options?: TokenCountOptions
    ): Promise<TokenCountResult> {
      const model = options?.model ?? "claude-sonnet-4-20250514";
      try {
        // Convert to Anthropic format
        const anthropicMessages = messages
          .filter((m) => m.role !== "system")
          .map((m) => ({
            role: m.role as "user" | "assistant",
            content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
          }));

        const result = await client.messages.countTokens({
          model,
          messages: anthropicMessages,
        });
        return {
          tokens: result.input_tokens,
          isEstimate: false,
          method: "native",
        };
      } catch {
        // Fall back to estimation
        const tokens = messages.reduce((sum, m) => sum + estimateMessageTokens(m), 0);
        return {
          tokens,
          isEstimate: true,
          method: "fallback",
        };
      }
    },
  };
}

/**
 * Create OpenAI tokenizer using tiktoken for accurate token counting.
 *
 * This is the recommended tokenizer for OpenAI models as it provides
 * exact token counts using the same algorithm as the OpenAI API.
 *
 * @param model - Optional model name for encoding selection
 * @returns Tokenizer instance with accurate counting
 *
 * @example
 * ```typescript
 * const tokenizer = createOpenAITokenizer('gpt-4o');
 * const result = await tokenizer.countTokens('Hello, world!');
 * console.log(result.tokens); // Exact token count
 * ```
 */
export function createOpenAITokenizer(model: string = "gpt-4o"): Tokenizer {
  // Use tiktoken for accurate token counting
  return createTiktokenTokenizer(model);
}

/**
 * Create Google tokenizer using native SDK
 *
 * @param client - Google GenAI client instance
 * @returns Tokenizer instance
 *
 * @example
 * ```typescript
 * import { GoogleGenAI } from '@google/genai';
 * const client = new GoogleGenAI({ apiKey: 'AIza...' });
 * const tokenizer = createGoogleTokenizer(client);
 * const result = await tokenizer.countTokens('Hello, world!');
 * ```
 */
export function createGoogleTokenizer(client: {
  models: {
    countTokens: (params: { model: string; contents: string }) => Promise<{ totalTokens: number }>;
  };
}): Tokenizer {
  return {
    async countTokens(text: string, options?: TokenCountOptions): Promise<TokenCountResult> {
      const model = options?.model ?? "gemini-2.5-flash";
      try {
        const result = await client.models.countTokens({
          model,
          contents: text,
        });
        return {
          tokens: result.totalTokens,
          isEstimate: false,
          method: "native",
        };
      } catch {
        return {
          tokens: estimateTokenCount(text),
          isEstimate: true,
          method: "fallback",
        };
      }
    },

    async countMessageTokens(
      messages: CompletionMessage[],
      options?: TokenCountOptions
    ): Promise<TokenCountResult> {
      // For messages, concatenate and count
      const text = messages
        .map((m) => {
          const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
          return `${m.role}: ${content}`;
        })
        .join("\n");

      return this.countTokens(text, options);
    },
  };
}

/**
 * Create a fallback tokenizer for unknown providers
 *
 * @returns Tokenizer instance using estimation
 */
export function createFallbackTokenizer(): Tokenizer {
  return {
    async countTokens(text: string): Promise<TokenCountResult> {
      return {
        tokens: estimateTokenCount(text),
        isEstimate: true,
        method: "fallback",
      };
    },

    async countMessageTokens(messages: CompletionMessage[]): Promise<TokenCountResult> {
      const tokens = messages.reduce((sum, m) => sum + estimateMessageTokens(m), 0);
      return {
        tokens,
        isEstimate: true,
        method: "fallback",
      };
    },
  };
}

// =============================================================================
// Tiktoken-Based Tokenizer (REQ-002)
// =============================================================================

/**
 * Model to encoding mapping for OpenAI models.
 * Reference: https://github.com/openai/tiktoken/blob/main/tiktoken/model.py
 */
const MODEL_TO_ENCODING: Record<string, TiktokenEncoding> = {
  // GPT-4o family (cl100k_base)
  "gpt-4o": "cl100k_base",
  "gpt-4o-mini": "cl100k_base",
  "gpt-4o-2024-05-13": "cl100k_base",
  "gpt-4o-2024-08-06": "cl100k_base",
  "gpt-4o-mini-2024-07-18": "cl100k_base",

  // GPT-4 family (cl100k_base)
  "gpt-4": "cl100k_base",
  "gpt-4-32k": "cl100k_base",
  "gpt-4-turbo": "cl100k_base",
  "gpt-4-turbo-preview": "cl100k_base",
  "gpt-4-1106-preview": "cl100k_base",
  "gpt-4-0125-preview": "cl100k_base",
  "gpt-4-vision-preview": "cl100k_base",

  // GPT-3.5 family (cl100k_base)
  "gpt-3.5-turbo": "cl100k_base",
  "gpt-3.5-turbo-16k": "cl100k_base",
  "gpt-3.5-turbo-instruct": "cl100k_base",
  "gpt-3.5-turbo-0125": "cl100k_base",
  "gpt-3.5-turbo-1106": "cl100k_base",

  // o1 family (o200k_base)
  o1: "o200k_base",
  "o1-mini": "o200k_base",
  "o1-preview": "o200k_base",
  "o3-mini": "o200k_base",
  o3: "o200k_base",
  "o4-mini": "o200k_base",

  // GPT-4.1 family (o200k_base)
  "gpt-4.1": "o200k_base",
  "gpt-4.1-mini": "o200k_base",
  "gpt-4.1-nano": "o200k_base",

  // GPT-5 family (o200k_base - newer encoding for advanced models)
  "gpt-5": "o200k_base",
  "gpt-5.1": "o200k_base",
  "gpt-5.2": "o200k_base",
  "gpt-5-mini": "o200k_base",

  // GPT-5 Codex family
  "gpt-5.1-codex": "o200k_base",
  "gpt-5.1-codex-max": "o200k_base",
  "gpt-5.1-codex-mini": "o200k_base",
  "gpt-5.2-codex": "o200k_base",
  "gpt-5-nano": "o200k_base",
  "gpt-5-codex": "o200k_base",

  // Embedding models (cl100k_base)
  "text-embedding-ada-002": "cl100k_base",
  "text-embedding-3-small": "cl100k_base",
  "text-embedding-3-large": "cl100k_base",
};

/**
 * Get the tiktoken encoding for a model name.
 *
 * @param model - The model name (e.g., 'gpt-4o', 'gpt-3.5-turbo')
 * @returns The tiktoken encoding name
 */
function getEncodingForModel(model: string): TiktokenEncoding {
  // Direct mapping
  const directMapping = MODEL_TO_ENCODING[model];
  if (directMapping !== undefined) {
    return directMapping;
  }

  // Pattern matching for model families
  if (model.startsWith("gpt-4o") || model.includes("gpt-4o")) {
    return "cl100k_base";
  }
  if (model.startsWith("gpt-4") || model.includes("gpt-4")) {
    return "cl100k_base";
  }
  if (model.startsWith("gpt-3.5") || model.includes("gpt-3.5")) {
    return "cl100k_base";
  }
  if (model.startsWith("o1") || model.startsWith("o3") || model.startsWith("o4")) {
    return "o200k_base";
  }

  // GPT-5 family
  if (model.startsWith("gpt-5") || model.includes("gpt-5")) {
    return "o200k_base";
  }

  // Default to cl100k_base (most common for modern models)
  return "cl100k_base";
}

/**
 * Cache for tiktoken encoders to avoid repeated initialization.
 */
const encoderCache = new Map<TiktokenEncoding, ReturnType<typeof getEncoding>>();

/**
 * Get or create a cached tiktoken encoder.
 *
 * @param encoding - The encoding name
 * @returns The tiktoken encoder instance
 */
function getCachedEncoder(encoding: TiktokenEncoding): ReturnType<typeof getEncoding> {
  let encoder = encoderCache.get(encoding);
  if (!encoder) {
    encoder = getEncoding(encoding);
    encoderCache.set(encoding, encoder);
  }
  return encoder;
}

/**
 * Create a tiktoken-based tokenizer for OpenAI models.
 *
 * Provides accurate token counting using the js-tiktoken library,
 * which implements the same tokenization algorithm used by OpenAI.
 *
 * @param defaultModel - Default model to use for encoding selection
 * @returns Tokenizer instance with accurate token counting
 *
 * @example
 * ```typescript
 * const tokenizer = createTiktokenTokenizer('gpt-4o');
 * const result = await tokenizer.countTokens('Hello, world!');
 * console.log(result.tokens); // Exact token count
 * console.log(result.isEstimate); // false
 * console.log(result.method); // 'tiktoken'
 * ```
 */
export function createTiktokenTokenizer(defaultModel: string = "gpt-4o"): Tokenizer {
  return {
    async countTokens(text: string, options?: TokenCountOptions): Promise<TokenCountResult> {
      const model = options?.model ?? defaultModel;
      try {
        const encoding = getEncodingForModel(model);
        const encoder = getCachedEncoder(encoding);
        const tokens = encoder.encode(text);

        return {
          tokens: tokens.length,
          isEstimate: false,
          method: "tiktoken",
        };
      } catch {
        // Fall back to estimation on any error
        return {
          tokens: estimateTokenCount(text),
          isEstimate: true,
          method: "fallback",
        };
      }
    },

    async countMessageTokens(
      messages: CompletionMessage[],
      options?: TokenCountOptions
    ): Promise<TokenCountResult> {
      const model = options?.model ?? defaultModel;
      try {
        const encoding = getEncodingForModel(model);
        const encoder = getCachedEncoder(encoding);

        // OpenAI message format overhead:
        // - Each message: ~3 tokens for structure (<|start|>role<|end|>)
        // - Reply prompt: ~3 tokens (<|start|>assistant<|end|>)
        const perMessageOverhead = 3;
        const replyOverhead = 3;

        let totalTokens = 0;

        for (const message of messages) {
          totalTokens += perMessageOverhead;

          // Count role tokens
          totalTokens += encoder.encode(message.role).length;

          // Count content tokens
          if (typeof message.content === "string") {
            totalTokens += encoder.encode(message.content).length;
          } else {
            // For array content, handle each part
            for (const part of message.content) {
              if (part.type === "text") {
                totalTokens += encoder.encode(part.text).length;
              } else if (part.type === "tool_use") {
                // Tool use includes name and JSON input
                totalTokens += encoder.encode(part.name).length;
                totalTokens += encoder.encode(JSON.stringify(part.input)).length;
              } else if (part.type === "tool_result") {
                const content =
                  typeof part.content === "string" ? part.content : JSON.stringify(part.content);
                totalTokens += encoder.encode(content).length;
              }
              // Images are handled separately (fixed token cost per image)
              else if (part.type === "image") {
                // Low-res images: ~85 tokens, high-res: ~170 tokens base + tiles
                totalTokens += 85;
              }
            }
          }
        }

        // Add reply prompt overhead
        totalTokens += replyOverhead;

        return {
          tokens: totalTokens,
          isEstimate: false,
          method: "tiktoken",
        };
      } catch {
        // Fall back to estimation on any error
        const tokens = messages.reduce((sum, m) => sum + estimateMessageTokens(m), 0);
        return {
          tokens,
          isEstimate: true,
          method: "fallback",
        };
      }
    },
  };
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a tokenizer for a specific provider
 *
 * @param provider - The provider type
 * @param client - Optional native client for accurate counting
 * @returns Tokenizer instance
 *
 * @example
 * ```typescript
 * // With native client for accurate counting
 * import Anthropic from '@anthropic-ai/sdk';
 * const client = new Anthropic({ apiKey: 'sk-...' });
 * const tokenizer = createTokenizer('anthropic', client);
 *
 * // Without client (uses estimation)
 * const tokenizer = createTokenizer('openai');
 * ```
 */
export function createTokenizer(provider: ProviderType, client?: unknown): Tokenizer {
  switch (provider) {
    case "anthropic":
      if (client && hasAnthropicCountTokens(client)) {
        return createAnthropicTokenizer(client);
      }
      return createFallbackTokenizer();

    case "google":
      if (client && hasGoogleCountTokens(client)) {
        return createGoogleTokenizer(client);
      }
      return createFallbackTokenizer();

    case "openai":
      return createOpenAITokenizer();

    default:
      return createFallbackTokenizer();
  }
}

/**
 * Type guard for Anthropic client with countTokens method
 */
function hasAnthropicCountTokens(client: unknown): client is {
  messages: {
    countTokens: (params: {
      model: string;
      messages: Array<{ role: string; content: string }>;
    }) => Promise<{ input_tokens: number }>;
  };
} {
  return (
    typeof client === "object" &&
    client !== null &&
    "messages" in client &&
    typeof (client as Record<string, unknown>).messages === "object" &&
    (client as Record<string, unknown>).messages !== null &&
    "countTokens" in ((client as Record<string, unknown>).messages as Record<string, unknown>)
  );
}

/**
 * Type guard for Google client with countTokens method
 */
function hasGoogleCountTokens(client: unknown): client is {
  models: {
    countTokens: (params: { model: string; contents: string }) => Promise<{ totalTokens: number }>;
  };
} {
  return (
    typeof client === "object" &&
    client !== null &&
    "models" in client &&
    typeof (client as Record<string, unknown>).models === "object" &&
    (client as Record<string, unknown>).models !== null &&
    "countTokens" in ((client as Record<string, unknown>).models as Record<string, unknown>)
  );
}
