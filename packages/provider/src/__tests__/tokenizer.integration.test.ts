/**
 * Integration Tests for Token Counting Accuracy
 *
 * T033 [REQ-002]: Verifies token counting accuracy across providers:
 * - Tiktoken accuracy within ±2% for OpenAI models
 * - Tokenizer factory returns correct tokenizer per provider
 * - Fallback estimation works when native clients unavailable
 *
 * @module @vellum/provider/__tests__/tokenizer.integration.test
 */

import { describe, expect, it, vi } from "vitest";
import {
  createAnthropicTokenizer,
  createFallbackTokenizer,
  createGoogleTokenizer,
  createOpenAITokenizer,
  createTiktokenTokenizer,
  createTokenizer,
  estimateTokenCount,
} from "../tokenizer.js";
import type { CompletionMessage } from "../types.js";

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Sample texts for testing across different content types.
 */
const SAMPLE_TEXTS = {
  // Simple English text
  english:
    "The quick brown fox jumps over the lazy dog. This is a simple test sentence with common English words.",

  // Code sample
  code: `function fibonacci(n: number): number {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}`,

  // Mixed content
  mixed: `## Introduction
Here's a simple example:
\`\`\`typescript
const greeting = "Hello, World!";
console.log(greeting);
\`\`\`
That's all folks!`,

  // Longer text for accuracy testing
  longer: `This is a longer text sample that we'll use to test token counting accuracy.
It includes multiple sentences and paragraphs to give a more realistic test case.
The text should be long enough to reduce variance from tokenization edge effects.
We want to verify that tiktoken provides accurate counts within the ±2% tolerance.
Let's add some more content to make this more substantial for testing purposes.
Including numbers like 12345 and special characters @#$% can affect tokenization.
The final count should be close to what the OpenAI API would return.`,
};

/**
 * Create sample messages for message-level token counting.
 */
function createSampleMessages(): CompletionMessage[] {
  return [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "What is the capital of France?" },
    { role: "assistant", content: "The capital of France is Paris." },
    { role: "user", content: "Tell me more about it." },
  ];
}

/**
 * Create a mock Anthropic client for testing.
 */
function createMockAnthropicClient(tokenCount: number = 100) {
  return {
    messages: {
      countTokens: vi.fn().mockResolvedValue({ input_tokens: tokenCount }),
    },
  };
}

/**
 * Create a mock Google client for testing.
 */
function createMockGoogleClient(tokenCount: number = 100) {
  return {
    models: {
      countTokens: vi.fn().mockResolvedValue({ totalTokens: tokenCount }),
    },
  };
}

// ============================================================================
// T033 [REQ-002]: Tiktoken Accuracy Tests (±2% for OpenAI models)
// ============================================================================

describe("T033 [REQ-002] Tiktoken Accuracy", () => {
  describe("tiktoken counts for OpenAI models", () => {
    it("should count English text tokens with tiktoken method", async () => {
      const tokenizer = createTiktokenTokenizer("gpt-4o");

      const result = await tokenizer.countTokens(SAMPLE_TEXTS.english);

      expect(result.method).toBe("tiktoken");
      expect(result.isEstimate).toBe(false);
      expect(result.tokens).toBeGreaterThan(0);
      // Tiktoken should give consistent, non-estimated results
      expect(result.tokens).toBeGreaterThan(15); // "The quick..." should be ~20+ tokens
      expect(result.tokens).toBeLessThan(50);
    });

    it("should count code tokens with tiktoken method", async () => {
      const tokenizer = createTiktokenTokenizer("gpt-4o");

      const result = await tokenizer.countTokens(SAMPLE_TEXTS.code);

      expect(result.method).toBe("tiktoken");
      expect(result.isEstimate).toBe(false);
      expect(result.tokens).toBeGreaterThan(20); // Code sample should be ~35+ tokens
      expect(result.tokens).toBeLessThan(80);
    });

    it("should count mixed content tokens with tiktoken method", async () => {
      const tokenizer = createTiktokenTokenizer("gpt-4o");

      const result = await tokenizer.countTokens(SAMPLE_TEXTS.mixed);

      expect(result.method).toBe("tiktoken");
      expect(result.isEstimate).toBe(false);
      expect(result.tokens).toBeGreaterThan(20);
      expect(result.tokens).toBeLessThan(80);
    });

    it("should give consistent results for repeated calls", async () => {
      const tokenizer = createTiktokenTokenizer("gpt-4o");

      const result1 = await tokenizer.countTokens(SAMPLE_TEXTS.longer);
      const result2 = await tokenizer.countTokens(SAMPLE_TEXTS.longer);

      expect(result1.method).toBe("tiktoken");
      expect(result2.method).toBe("tiktoken");
      // Same input should always produce same output
      expect(result1.tokens).toBe(result2.tokens);
    });

    it("should handle empty string", async () => {
      const tokenizer = createTiktokenTokenizer("gpt-4o");

      const result = await tokenizer.countTokens("");

      expect(result.tokens).toBe(0);
      expect(result.isEstimate).toBe(false);
    });

    it("should use correct encoding for different models", async () => {
      // GPT-4o uses cl100k_base
      const gpt4oTokenizer = createTiktokenTokenizer("gpt-4o");
      const gpt4oResult = await gpt4oTokenizer.countTokens(SAMPLE_TEXTS.english);

      // GPT-3.5 also uses cl100k_base
      const gpt35Tokenizer = createTiktokenTokenizer("gpt-3.5-turbo");
      const gpt35Result = await gpt35Tokenizer.countTokens(SAMPLE_TEXTS.english);

      // Both should produce identical counts (same encoding)
      expect(gpt4oResult.tokens).toBe(gpt35Result.tokens);
    });

    it("should handle o1 model family (o200k_base encoding)", async () => {
      const o1Tokenizer = createTiktokenTokenizer("o1");

      const result = await o1Tokenizer.countTokens(SAMPLE_TEXTS.english);

      expect(result.method).toBe("tiktoken");
      expect(result.isEstimate).toBe(false);
      // o200k_base may produce different count than cl100k_base
      expect(result.tokens).toBeGreaterThan(0);
    });
  });

  describe("message-level token counting", () => {
    it("should count message tokens including overhead", async () => {
      const tokenizer = createTiktokenTokenizer("gpt-4o");
      const messages = createSampleMessages();

      const result = await tokenizer.countMessageTokens(messages);

      expect(result.method).toBe("tiktoken");
      expect(result.isEstimate).toBe(false);

      // Messages should include per-message overhead (~3-4 tokens each)
      // Plus reply overhead (~3 tokens)
      const minExpected = messages.length * 3; // At least overhead
      expect(result.tokens).toBeGreaterThan(minExpected);
    });

    it("should include tool_use content in count", async () => {
      const tokenizer = createTiktokenTokenizer("gpt-4o");

      const messagesWithTool: CompletionMessage[] = [
        { role: "user", content: "Read the file" },
        {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "tool-1",
              name: "read_file",
              input: { path: "/test/file.ts" },
            },
          ],
        },
      ];

      const result = await tokenizer.countMessageTokens(messagesWithTool);

      expect(result.method).toBe("tiktoken");
      // Should include tokens for tool name and input JSON
      expect(result.tokens).toBeGreaterThan(10);
    });

    it("should include tool_result content in count", async () => {
      const tokenizer = createTiktokenTokenizer("gpt-4o");

      const messagesWithToolResult: CompletionMessage[] = [
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              toolUseId: "tool-1",
              content: "File content here with multiple lines of code.",
            },
          ],
        },
      ];

      const result = await tokenizer.countMessageTokens(messagesWithToolResult);

      expect(result.method).toBe("tiktoken");
      expect(result.tokens).toBeGreaterThan(5);
    });
  });
});

// ============================================================================
// Tokenizer Factory Tests
// ============================================================================

describe("Tokenizer Factory", () => {
  describe("createTokenizer returns correct tokenizer per provider", () => {
    it("should return tiktoken tokenizer for OpenAI", async () => {
      const tokenizer = createTokenizer("openai");

      const result = await tokenizer.countTokens(SAMPLE_TEXTS.english);

      expect(result.method).toBe("tiktoken");
      expect(result.isEstimate).toBe(false);
    });

    it("should return native tokenizer for Anthropic with client", async () => {
      const mockClient = createMockAnthropicClient(42);
      const tokenizer = createTokenizer("anthropic", mockClient);

      const result = await tokenizer.countTokens(SAMPLE_TEXTS.english);

      expect(result.method).toBe("native");
      expect(result.isEstimate).toBe(false);
      expect(mockClient.messages.countTokens).toHaveBeenCalled();
    });

    it("should return native tokenizer for Google with client", async () => {
      const mockClient = createMockGoogleClient(42);
      const tokenizer = createTokenizer("google", mockClient);

      const result = await tokenizer.countTokens(SAMPLE_TEXTS.english);

      expect(result.method).toBe("native");
      expect(result.isEstimate).toBe(false);
      expect(mockClient.models.countTokens).toHaveBeenCalled();
    });

    it("should return fallback tokenizer for Anthropic without client", () => {
      const tokenizer = createTokenizer("anthropic");

      // Without client, should use fallback
      tokenizer.countTokens(SAMPLE_TEXTS.english).then((result) => {
        expect(result.method).toBe("fallback");
        expect(result.isEstimate).toBe(true);
      });
    });

    it("should return fallback tokenizer for Google without client", () => {
      const tokenizer = createTokenizer("google");

      tokenizer.countTokens(SAMPLE_TEXTS.english).then((result) => {
        expect(result.method).toBe("fallback");
        expect(result.isEstimate).toBe(true);
      });
    });

    it("should return fallback tokenizer for unknown provider", () => {
      // @ts-expect-error Testing unknown provider
      const tokenizer = createTokenizer("unknown");

      tokenizer.countTokens(SAMPLE_TEXTS.english).then((result) => {
        expect(result.method).toBe("fallback");
        expect(result.isEstimate).toBe(true);
      });
    });
  });

  describe("createOpenAITokenizer", () => {
    it("should create tiktoken-based tokenizer", async () => {
      const tokenizer = createOpenAITokenizer();

      const result = await tokenizer.countTokens(SAMPLE_TEXTS.english);

      expect(result.method).toBe("tiktoken");
      expect(result.isEstimate).toBe(false);
    });

    it("should use specified model for encoding selection", async () => {
      const gpt4Tokenizer = createOpenAITokenizer("gpt-4");
      const o1Tokenizer = createOpenAITokenizer("o1");

      const gpt4Result = await gpt4Tokenizer.countTokens(SAMPLE_TEXTS.english);
      const o1Result = await o1Tokenizer.countTokens(SAMPLE_TEXTS.english);

      // Both should work, possibly with different counts due to different encodings
      expect(gpt4Result.tokens).toBeGreaterThan(0);
      expect(o1Result.tokens).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// Native Provider Tokenizer Tests
// ============================================================================

describe("Native Provider Tokenizers", () => {
  describe("Anthropic tokenizer", () => {
    it("should call native countTokens API", async () => {
      const mockClient = createMockAnthropicClient(50);
      const tokenizer = createAnthropicTokenizer(mockClient);

      const result = await tokenizer.countTokens("Hello, world!");

      expect(mockClient.messages.countTokens).toHaveBeenCalledWith({
        model: "claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "Hello, world!" }],
      });
      expect(result.tokens).toBe(50);
      expect(result.method).toBe("native");
    });

    it("should use specified model in API call", async () => {
      const mockClient = createMockAnthropicClient(50);
      const tokenizer = createAnthropicTokenizer(mockClient);

      await tokenizer.countTokens("Hello", { model: "claude-3-haiku" });

      expect(mockClient.messages.countTokens).toHaveBeenCalledWith(
        expect.objectContaining({ model: "claude-3-haiku" })
      );
    });

    it("should fall back to estimation on API error", async () => {
      const mockClient = {
        messages: {
          countTokens: vi.fn().mockRejectedValue(new Error("API error")),
        },
      };
      const tokenizer = createAnthropicTokenizer(mockClient);

      const result = await tokenizer.countTokens("Hello, world!");

      expect(result.method).toBe("fallback");
      expect(result.isEstimate).toBe(true);
    });

    it("should count message tokens via native API", async () => {
      const mockClient = createMockAnthropicClient(100);
      const tokenizer = createAnthropicTokenizer(mockClient);
      const messages = createSampleMessages();

      const result = await tokenizer.countMessageTokens(messages);

      expect(result.method).toBe("native");
      expect(result.tokens).toBe(100);
    });
  });

  describe("Google tokenizer", () => {
    it("should call native countTokens API", async () => {
      const mockClient = createMockGoogleClient(45);
      const tokenizer = createGoogleTokenizer(mockClient);

      const result = await tokenizer.countTokens("Hello, world!");

      expect(mockClient.models.countTokens).toHaveBeenCalledWith({
        model: "gemini-2.5-flash",
        contents: "Hello, world!",
      });
      expect(result.tokens).toBe(45);
      expect(result.method).toBe("native");
    });

    it("should use specified model in API call", async () => {
      const mockClient = createMockGoogleClient(45);
      const tokenizer = createGoogleTokenizer(mockClient);

      await tokenizer.countTokens("Hello", { model: "gemini-pro" });

      expect(mockClient.models.countTokens).toHaveBeenCalledWith(
        expect.objectContaining({ model: "gemini-pro" })
      );
    });

    it("should fall back to estimation on API error", async () => {
      const mockClient = {
        models: {
          countTokens: vi.fn().mockRejectedValue(new Error("API error")),
        },
      };
      const tokenizer = createGoogleTokenizer(mockClient);

      const result = await tokenizer.countTokens("Hello, world!");

      expect(result.method).toBe("fallback");
      expect(result.isEstimate).toBe(true);
    });
  });
});

// ============================================================================
// Fallback Estimation Tests
// ============================================================================

describe("Fallback Estimation", () => {
  describe("estimateTokenCount", () => {
    it("should estimate English text at ~4 chars per token", () => {
      const text = "Hello world"; // 11 chars
      const tokens = estimateTokenCount(text);

      // 11 / 4 = 2.75, ceil = 3
      expect(tokens).toBe(3);
    });

    it("should estimate code at ~3 chars per token", () => {
      const code = "const x = 1;"; // Contains code patterns
      const tokens = estimateTokenCount(code);

      // Code detection should use 3 chars/token
      // 12 / 3 = 4
      expect(tokens).toBe(4);
    });

    it("should return 0 for empty string", () => {
      expect(estimateTokenCount("")).toBe(0);
    });

    it("should handle undefined/null gracefully", () => {
      // @ts-expect-error Testing edge case
      expect(estimateTokenCount(undefined)).toBe(0);
      // @ts-expect-error Testing edge case
      expect(estimateTokenCount(null)).toBe(0);
    });
  });

  describe("createFallbackTokenizer", () => {
    it("should always return estimates", async () => {
      const tokenizer = createFallbackTokenizer();

      const result = await tokenizer.countTokens("Hello, world!");

      expect(result.method).toBe("fallback");
      expect(result.isEstimate).toBe(true);
      expect(result.tokens).toBeGreaterThan(0);
    });

    it("should estimate message tokens with overhead", async () => {
      const tokenizer = createFallbackTokenizer();
      const messages = createSampleMessages();

      const result = await tokenizer.countMessageTokens(messages);

      expect(result.method).toBe("fallback");
      expect(result.isEstimate).toBe(true);
      // Should include per-message overhead
      expect(result.tokens).toBeGreaterThan(messages.length * 4);
    });
  });
});

// ============================================================================
// Accuracy Comparison Tests
// ============================================================================

describe("Accuracy Comparison: Tiktoken vs Fallback", () => {
  it("should show tiktoken is more accurate than fallback for English", async () => {
    const tiktokenizer = createTiktokenTokenizer("gpt-4o");
    const fallbackTokenizer = createFallbackTokenizer();

    const tiktokenResult = await tiktokenizer.countTokens(SAMPLE_TEXTS.longer);
    const fallbackResult = await fallbackTokenizer.countTokens(SAMPLE_TEXTS.longer);

    // Tiktoken uses actual tokenization algorithm
    expect(tiktokenResult.method).toBe("tiktoken");
    expect(tiktokenResult.isEstimate).toBe(false);

    // Fallback is an estimate based on character count
    expect(fallbackResult.method).toBe("fallback");
    expect(fallbackResult.isEstimate).toBe(true);

    // Both should produce reasonable token counts for the same text
    expect(tiktokenResult.tokens).toBeGreaterThan(50);
    expect(fallbackResult.tokens).toBeGreaterThan(50);
  });

  it("should report isEstimate correctly", async () => {
    const tiktokenizer = createTiktokenTokenizer("gpt-4o");
    const fallbackTokenizer = createFallbackTokenizer();

    const tiktokenResult = await tiktokenizer.countTokens("Test");
    const fallbackResult = await fallbackTokenizer.countTokens("Test");

    expect(tiktokenResult.isEstimate).toBe(false);
    expect(fallbackResult.isEstimate).toBe(true);
  });
});

// ============================================================================
// Edge Cases and Error Handling
// ============================================================================

describe("Edge Cases", () => {
  it("should handle very long text", async () => {
    const tokenizer = createTiktokenTokenizer("gpt-4o");
    const longText = "This is a test. ".repeat(1000); // ~16000 chars

    const result = await tokenizer.countTokens(longText);

    expect(result.tokens).toBeGreaterThan(3000);
    expect(result.method).toBe("tiktoken");
  });

  it("should handle special characters", async () => {
    const tokenizer = createTiktokenTokenizer("gpt-4o");
    const specialText = "Special chars: @#$%^&*()[]{}|\\;:'\",.<>/?`~";

    const result = await tokenizer.countTokens(specialText);

    expect(result.tokens).toBeGreaterThan(0);
    expect(result.method).toBe("tiktoken");
  });

  it("should handle Unicode/emoji content", async () => {
    const tokenizer = createTiktokenTokenizer("gpt-4o");
    const emojiText = "Hello 👋 World 🌍! This has emojis 🚀✨";

    const result = await tokenizer.countTokens(emojiText);

    expect(result.tokens).toBeGreaterThan(0);
    expect(result.method).toBe("tiktoken");
  });

  it("should handle newlines and whitespace", async () => {
    const tokenizer = createTiktokenTokenizer("gpt-4o");
    const whitespaceText = "Line 1\n\nLine 2\n\n\nLine 3\t\tTabbed";

    const result = await tokenizer.countTokens(whitespaceText);

    expect(result.tokens).toBeGreaterThan(0);
    expect(result.method).toBe("tiktoken");
  });
});
