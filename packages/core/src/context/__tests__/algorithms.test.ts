/**
 * Phase 2: Core Algorithms Tests
 *
 * Comprehensive unit tests for:
 * - tool-pairing.ts
 * - image-tokens.ts
 * - sliding-window.ts
 * - tool-trimming.ts
 *
 * @module @vellum/core/context/__tests__/algorithms
 */

import { beforeEach, describe, expect, it } from "vitest";
// Image Tokens
import {
  AnthropicImageCalculator,
  calculateMessageImageTokens,
  createImageCalculator,
  DefaultImageCalculator,
  extractImageDimensions,
  GeminiImageCalculator,
  hasImageBlocks,
  OpenAIImageCalculator,
} from "../image-tokens.js";
// Sliding Window
import {
  assignPriorities,
  calculatePriority,
  estimateTokens,
  fitsInBudget,
  getTruncationCandidates,
  truncate,
} from "../sliding-window.js";
// Tool Pairing
import {
  analyzeToolPairs,
  areInSameToolPair,
  extractToolResultBlocks,
  extractToolUseBlocks,
  getLinkedIndices,
  hasToolBlocks,
} from "../tool-pairing.js";

// Tool Trimming
import {
  cloneMessage,
  DEFAULT_MAX_OUTPUT_CHARS,
  DEFAULT_PROTECTED_TOOLS,
  DEFAULT_TRUNCATION_MARKER,
  getToolNameForResult,
  getToolResultLength,
  isProtectedTool,
  pruneToolOutputs,
  trimToolResult,
} from "../tool-trimming.js";

// Types
import {
  type ContentBlock,
  type ContextMessage,
  type ImageBlock,
  MessagePriority,
  type TextBlock,
  type ToolResultBlock,
  type ToolUseBlock,
} from "../types.js";

// ============================================================================
// Test Helpers
// ============================================================================

let messageIdCounter = 0;

/**
 * Create a test message with sensible defaults.
 */
function createTestMessage(overrides?: Partial<ContextMessage>): ContextMessage {
  messageIdCounter++;
  return {
    id: `msg-${messageIdCounter}`,
    role: "user",
    content: "Test message content",
    priority: MessagePriority.NORMAL,
    ...overrides,
  };
}

/**
 * Create a tool_use block.
 */
function createToolUse(id: string, name: string, input: unknown = {}): ToolUseBlock {
  return {
    type: "tool_use",
    id,
    name,
    input,
  };
}

/**
 * Create a tool_result block.
 */
function createToolResult(
  toolUseId: string,
  content: string | ContentBlock[] = "result"
): ToolResultBlock {
  return {
    type: "tool_result",
    tool_use_id: toolUseId,
    content,
  };
}

/**
 * Create a text block.
 */
function createTextBlock(text: string): TextBlock {
  return { type: "text", text };
}

/**
 * Create an image block.
 */
function createImageBlock(width?: number, height?: number): ImageBlock {
  return {
    type: "image",
    source: { type: "base64", data: "iVBORw0KGgo=" },
    mediaType: "image/png",
    width,
    height,
  };
}

/**
 * Reset message ID counter.
 */
function resetMessageIds(): void {
  messageIdCounter = 0;
}

// ============================================================================
// Tool Pairing Tests
// ============================================================================

describe("Phase 2: Core Algorithms", () => {
  beforeEach(() => {
    resetMessageIds();
  });

  describe("tool-pairing", () => {
    describe("analyzeToolPairs", () => {
      it("should identify complete tool pairs", () => {
        const messages: ContextMessage[] = [
          createTestMessage({
            role: "assistant",
            content: [createToolUse("tool-1", "read_file", { path: "test.ts" })],
          }),
          createTestMessage({
            role: "user",
            content: [createToolResult("tool-1", "file contents")],
          }),
        ];

        const analysis = analyzeToolPairs(messages);

        expect(analysis.pairs).toHaveLength(1);
        expect(analysis.pairs[0]?.toolId).toBe("tool-1");
        expect(analysis.pairs[0]?.useMessageIndex).toBe(0);
        expect(analysis.pairs[0]?.resultMessageIndex).toBe(1);
        expect(analysis.pairs[0]?.toolName).toBe("read_file");
        expect(analysis.pairs[0]?.isComplete).toBe(true);
        expect(analysis.orphanedUses).toHaveLength(0);
        expect(analysis.orphanedResults).toHaveLength(0);
      });

      it("should identify orphaned tool_use blocks", () => {
        const messages: ContextMessage[] = [
          createTestMessage({
            role: "assistant",
            content: [createToolUse("tool-orphan", "write_file", { path: "x" })],
          }),
        ];

        const analysis = analyzeToolPairs(messages);

        expect(analysis.pairs).toHaveLength(0);
        expect(analysis.orphanedUses).toHaveLength(1);
        expect(analysis.orphanedUses[0]?.toolId).toBe("tool-orphan");
        expect(analysis.orphanedUses[0]?.messageIndex).toBe(0);
      });

      it("should identify orphaned tool_result blocks", () => {
        const messages: ContextMessage[] = [
          createTestMessage({
            role: "user",
            content: [createToolResult("tool-missing", "orphaned result")],
          }),
        ];

        const analysis = analyzeToolPairs(messages);

        expect(analysis.pairs).toHaveLength(0);
        expect(analysis.orphanedResults).toHaveLength(1);
        expect(analysis.orphanedResults[0]?.toolId).toBe("tool-missing");
      });

      it("should handle multiple tool pairs", () => {
        const messages: ContextMessage[] = [
          createTestMessage({
            role: "assistant",
            content: [createToolUse("t1", "read_file"), createToolUse("t2", "list_dir")],
          }),
          createTestMessage({
            role: "user",
            content: [createToolResult("t1", "file1"), createToolResult("t2", "dir contents")],
          }),
        ];

        const analysis = analyzeToolPairs(messages);

        expect(analysis.pairs).toHaveLength(2);
        expect(analysis.pairedMessageIndices.has(0)).toBe(true);
        expect(analysis.pairedMessageIndices.has(1)).toBe(true);
      });

      it("should handle empty messages array", () => {
        const analysis = analyzeToolPairs([]);

        expect(analysis.pairs).toHaveLength(0);
        expect(analysis.orphanedUses).toHaveLength(0);
        expect(analysis.orphanedResults).toHaveLength(0);
      });

      it("should handle messages with string content", () => {
        const messages: ContextMessage[] = [createTestMessage({ content: "Just a string" })];

        const analysis = analyzeToolPairs(messages);

        expect(analysis.pairs).toHaveLength(0);
      });
    });

    describe("areInSameToolPair", () => {
      it("should return true for linked tool pair indices", () => {
        const messages: ContextMessage[] = [
          createTestMessage({
            role: "assistant",
            content: [createToolUse("t1", "test")],
          }),
          createTestMessage({
            role: "user",
            content: [createToolResult("t1", "result")],
          }),
        ];

        const analysis = analyzeToolPairs(messages);

        expect(areInSameToolPair(analysis, 0, 1)).toBe(true);
        expect(areInSameToolPair(analysis, 1, 0)).toBe(true);
      });

      it("should return false for unlinked indices", () => {
        const messages: ContextMessage[] = [
          createTestMessage({
            role: "assistant",
            content: [createToolUse("t1", "test")],
          }),
          createTestMessage({
            role: "user",
            content: [createToolResult("t1", "result")],
          }),
          createTestMessage({ content: "Regular message" }),
        ];

        const analysis = analyzeToolPairs(messages);

        expect(areInSameToolPair(analysis, 0, 2)).toBe(false);
        expect(areInSameToolPair(analysis, 1, 2)).toBe(false);
      });

      it("should return false for same index", () => {
        const messages: ContextMessage[] = [
          createTestMessage({
            role: "assistant",
            content: [createToolUse("t1", "test")],
          }),
        ];

        const analysis = analyzeToolPairs(messages);

        expect(areInSameToolPair(analysis, 0, 0)).toBe(false);
      });
    });

    describe("getLinkedIndices", () => {
      it("should return both indices for a complete pair", () => {
        const messages: ContextMessage[] = [
          createTestMessage({
            role: "assistant",
            content: [createToolUse("t1", "test")],
          }),
          createTestMessage({
            role: "user",
            content: [createToolResult("t1", "result")],
          }),
        ];

        const analysis = analyzeToolPairs(messages);

        expect(getLinkedIndices(analysis, 0)).toEqual([0, 1]);
        expect(getLinkedIndices(analysis, 1)).toEqual([0, 1]);
      });

      it("should return empty array for non-paired index", () => {
        const messages: ContextMessage[] = [
          createTestMessage({ content: "Regular message" }),
          createTestMessage({
            role: "assistant",
            content: [createToolUse("t1", "test")],
          }),
          createTestMessage({
            role: "user",
            content: [createToolResult("t1", "result")],
          }),
        ];

        const analysis = analyzeToolPairs(messages);

        expect(getLinkedIndices(analysis, 0)).toEqual([]);
      });

      it("should handle message with multiple tools", () => {
        const messages: ContextMessage[] = [
          createTestMessage({
            role: "assistant",
            content: [createToolUse("t1", "tool1"), createToolUse("t2", "tool2")],
          }),
          createTestMessage({
            role: "user",
            content: [createToolResult("t1", "r1")],
          }),
          createTestMessage({
            role: "user",
            content: [createToolResult("t2", "r2")],
          }),
        ];

        const analysis = analyzeToolPairs(messages);

        // Message 0 is linked to both 1 and 2
        const linked = getLinkedIndices(analysis, 0);
        expect(linked).toContain(0);
        expect(linked).toContain(1);
        expect(linked).toContain(2);
      });
    });

    describe("extractToolUseBlocks", () => {
      it("should extract tool_use blocks from message", () => {
        const message = createTestMessage({
          content: [
            createTextBlock("Hello"),
            createToolUse("t1", "read_file"),
            createTextBlock("World"),
          ],
        });

        const uses = extractToolUseBlocks(message);

        expect(uses).toHaveLength(1);
        expect(uses[0]?.id).toBe("t1");
        expect(uses[0]?.name).toBe("read_file");
      });

      it("should return empty array for string content", () => {
        const message = createTestMessage({ content: "Just text" });

        const uses = extractToolUseBlocks(message);

        expect(uses).toHaveLength(0);
      });

      it("should handle nested content in message", () => {
        const message = createTestMessage({
          content: [createToolUse("t1", "tool1"), createToolUse("t2", "tool2")],
        });

        const uses = extractToolUseBlocks(message);

        expect(uses).toHaveLength(2);
      });
    });

    describe("extractToolResultBlocks", () => {
      it("should extract tool_result blocks from message", () => {
        const message = createTestMessage({
          content: [createToolResult("t1", "result content")],
        });

        const results = extractToolResultBlocks(message);

        expect(results).toHaveLength(1);
        expect(results[0]?.tool_use_id).toBe("t1");
      });

      it("should handle string content in tool_result", () => {
        const message = createTestMessage({
          content: [createToolResult("t1", "string result")],
        });

        const results = extractToolResultBlocks(message);

        expect(results[0]?.content).toBe("string result");
      });

      it("should handle nested content blocks in tool_result", () => {
        const nestedContent: ContentBlock[] = [
          createTextBlock("Part 1"),
          createTextBlock("Part 2"),
        ];
        const message = createTestMessage({
          content: [createToolResult("t1", nestedContent)],
        });

        const results = extractToolResultBlocks(message);

        expect(results[0]?.content).toEqual(nestedContent);
      });
    });

    describe("hasToolBlocks", () => {
      it("should return true for content with tool_use", () => {
        const content: ContentBlock[] = [createToolUse("t1", "test")];
        expect(hasToolBlocks(content)).toBe(true);
      });

      it("should return true for content with tool_result", () => {
        const content: ContentBlock[] = [createToolResult("t1", "res")];
        expect(hasToolBlocks(content)).toBe(true);
      });

      it("should return false for text-only content", () => {
        const content: ContentBlock[] = [createTextBlock("Hello")];
        expect(hasToolBlocks(content)).toBe(false);
      });

      it("should return false for string content", () => {
        expect(hasToolBlocks("Just a string")).toBe(false);
      });
    });
  });

  // ============================================================================
  // Image Tokens Tests
  // ============================================================================

  describe("image-tokens", () => {
    describe("AnthropicImageCalculator", () => {
      const calculator = new AnthropicImageCalculator();

      it("should calculate tokens for standard image dimensions", () => {
        // Use 800x600 = 480,000 pixels (under 1.15 MP limit)
        const block = createImageBlock(800, 600);
        const tokens = calculator.calculateTokens(block);

        // Formula: ceil((width * height) / 750)
        // ceil((800 * 600) / 750) = ceil(640) = 640
        expect(tokens).toBe(640);
      });

      it("should use default dimensions when not specified", () => {
        const block = createImageBlock();
        const tokens = calculator.calculateTokens(block);

        // Default: 1024x1024, ceil((1024 * 1024) / 750) = ceil(1398.1) = 1399
        expect(tokens).toBe(1399);
      });

      it("should apply scaling for large images exceeding megapixel limit", () => {
        // 4000x4000 = 16 megapixels, exceeds 1.15 MP limit
        const block = createImageBlock(4000, 4000);
        const tokens = calculator.calculateTokens(block);

        // Should be scaled down, resulting in fewer tokens
        // After scaling to 1.15 MP: ~1072x1072, tokens ≈ 1533
        expect(tokens).toBeLessThan(Math.ceil((4000 * 4000) / 750));
      });

      it("should cap dimensions at 8192", () => {
        const block = createImageBlock(10000, 10000);
        const tokens = calculator.calculateTokens(block);

        // Capped at 8192, then scaled for megapixel limit
        expect(tokens).toBeGreaterThan(0);
      });

      it("should return at least 1 token", () => {
        const block = createImageBlock(1, 1);
        const tokens = calculator.calculateTokens(block);

        expect(tokens).toBeGreaterThanOrEqual(1);
      });
    });

    describe("OpenAIImageCalculator", () => {
      const calculator = new OpenAIImageCalculator();

      it("should return 85 tokens for low detail", () => {
        const block = createImageBlock(2000, 2000);
        const tokens = calculator.calculateTokens(block, "low");

        expect(tokens).toBe(85);
      });

      it("should calculate tiles for high detail", () => {
        // 1024x1024 image
        // After scaling to 768 shortest side: 768x768
        // Tiles: ceil(768/512) * ceil(768/512) = 2 * 2 = 4
        // Tokens: 85 + (4 * 170) = 765
        const block = createImageBlock(1024, 1024);
        const tokens = calculator.calculateTokens(block, "high");

        expect(tokens).toBe(765);
      });

      it("should use low detail for small images in auto mode", () => {
        // 512x512 or smaller → low detail (85 tokens)
        const block = createImageBlock(512, 512);
        const tokens = calculator.calculateTokens(block, "auto");

        expect(tokens).toBe(85);
      });

      it("should use high detail for larger images in auto mode", () => {
        const block = createImageBlock(1024, 768);
        const tokensAuto = calculator.calculateTokens(block, "auto");
        const tokensHigh = calculator.calculateTokens(block, "high");

        expect(tokensAuto).toBe(tokensHigh);
      });

      it("should handle very large images with scaling", () => {
        // 4096x4096 → scaled to fit 2048x2048 first
        const block = createImageBlock(4096, 4096);
        const tokens = calculator.calculateTokens(block, "high");

        // After scaling: 2048x2048 → 768x768 (shortest side to 768)
        // Tiles: 2x2 = 4, tokens = 85 + 680 = 765
        expect(tokens).toBe(765);
      });
    });

    describe("GeminiImageCalculator", () => {
      const calculator = new GeminiImageCalculator();

      it("should return fixed 258 tokens regardless of size", () => {
        expect(calculator.calculateTokens(createImageBlock(100, 100))).toBe(258);
        expect(calculator.calculateTokens(createImageBlock(4096, 4096))).toBe(258);
        expect(calculator.calculateTokens(createImageBlock())).toBe(258);
      });
    });

    describe("DefaultImageCalculator", () => {
      const calculator = new DefaultImageCalculator();

      it("should return maximum of all provider calculations", () => {
        const block = createImageBlock(1024, 1024);
        const tokens = calculator.calculateTokens(block);

        const anthropic = new AnthropicImageCalculator().calculateTokens(block);
        const openai = new OpenAIImageCalculator().calculateTokens(block, "high");
        const gemini = new GeminiImageCalculator().calculateTokens(block);

        expect(tokens).toBe(Math.max(anthropic, openai, gemini));
      });
    });

    describe("createImageCalculator factory", () => {
      it("should return AnthropicImageCalculator for anthropic", () => {
        const calc = createImageCalculator("anthropic");
        expect(calc).toBeInstanceOf(AnthropicImageCalculator);
      });

      it("should return AnthropicImageCalculator for claude", () => {
        const calc = createImageCalculator("claude");
        expect(calc).toBeInstanceOf(AnthropicImageCalculator);
      });

      it("should return OpenAIImageCalculator for openai variants", () => {
        expect(createImageCalculator("openai")).toBeInstanceOf(OpenAIImageCalculator);
        expect(createImageCalculator("gpt")).toBeInstanceOf(OpenAIImageCalculator);
        expect(createImageCalculator("gpt-4v")).toBeInstanceOf(OpenAIImageCalculator);
      });

      it("should return GeminiImageCalculator for google variants", () => {
        expect(createImageCalculator("gemini")).toBeInstanceOf(GeminiImageCalculator);
        expect(createImageCalculator("google")).toBeInstanceOf(GeminiImageCalculator);
        expect(createImageCalculator("vertex")).toBeInstanceOf(GeminiImageCalculator);
      });

      it("should return DefaultImageCalculator for unknown providers", () => {
        const calc = createImageCalculator("unknown-provider");
        expect(calc).toBeInstanceOf(DefaultImageCalculator);
      });

      it("should be case-insensitive", () => {
        expect(createImageCalculator("ANTHROPIC")).toBeInstanceOf(AnthropicImageCalculator);
        expect(createImageCalculator("OpenAI")).toBeInstanceOf(OpenAIImageCalculator);
      });
    });

    describe("calculateMessageImageTokens", () => {
      it("should sum tokens for all image blocks", () => {
        const content: ContentBlock[] = [
          createTextBlock("Hello"),
          createImageBlock(1024, 1024),
          createImageBlock(512, 512),
        ];

        const calc = new AnthropicImageCalculator();
        const tokens = calculateMessageImageTokens(content, calc);

        const expected =
          calc.calculateTokens(createImageBlock(1024, 1024)) +
          calc.calculateTokens(createImageBlock(512, 512));

        expect(tokens).toBe(expected);
      });

      it("should return 0 for content with no images", () => {
        const content: ContentBlock[] = [createTextBlock("No images here")];

        const calc = new AnthropicImageCalculator();
        const tokens = calculateMessageImageTokens(content, calc);

        expect(tokens).toBe(0);
      });

      it("should handle mixed content types", () => {
        const content: ContentBlock[] = [
          createTextBlock("Text"),
          createImageBlock(100, 100),
          createToolUse("t1", "test"),
          createImageBlock(200, 200),
        ];

        const calc = new GeminiImageCalculator();
        const tokens = calculateMessageImageTokens(content, calc);

        // 2 images * 258 tokens each
        expect(tokens).toBe(516);
      });
    });

    describe("extractImageDimensions", () => {
      it("should extract specified dimensions", () => {
        const block = createImageBlock(800, 600);
        const [width, height] = extractImageDimensions(block);

        expect(width).toBe(800);
        expect(height).toBe(600);
      });

      it("should use defaults for missing dimensions", () => {
        const block = createImageBlock();
        const [width, height] = extractImageDimensions(block);

        expect(width).toBe(1024);
        expect(height).toBe(1024);
      });

      it("should clamp invalid dimensions", () => {
        const block: ImageBlock = {
          type: "image",
          source: { type: "base64", data: "test" },
          mediaType: "image/png",
          width: -100,
          height: 0,
        };

        const [width, height] = extractImageDimensions(block);

        expect(width).toBe(1024); // Defaults for invalid
        expect(height).toBe(1024);
      });
    });

    describe("hasImageBlocks", () => {
      it("should return true when images present", () => {
        const content: ContentBlock[] = [createTextBlock("Text"), createImageBlock(100, 100)];

        expect(hasImageBlocks(content)).toBe(true);
      });

      it("should return false when no images", () => {
        const content: ContentBlock[] = [createTextBlock("Text only")];

        expect(hasImageBlocks(content)).toBe(false);
      });
    });
  });

  // ============================================================================
  // Sliding Window Tests
  // ============================================================================

  describe("sliding-window", () => {
    describe("calculatePriority", () => {
      it("should assign SYSTEM priority to system messages", () => {
        const message = createTestMessage({ role: "system" });
        const analysis = analyzeToolPairs([message]);

        const priority = calculatePriority(message, 0, 1, 3, analysis);

        expect(priority).toBe(MessagePriority.SYSTEM);
      });

      it("should assign ANCHOR priority to first user message", () => {
        const message = createTestMessage({ role: "user" });
        const analysis = analyzeToolPairs([message]);

        const priority = calculatePriority(message, 0, 1, 3, analysis);

        expect(priority).toBe(MessagePriority.ANCHOR);
      });

      it("should assign RECENT priority to last N messages", () => {
        const messages = [
          createTestMessage({ role: "system" }),
          createTestMessage({ role: "user" }),
          createTestMessage({ role: "assistant" }),
          createTestMessage({ role: "user" }),
          createTestMessage({ role: "assistant" }),
        ];
        const analysis = analyzeToolPairs(messages);

        // With recentCount=2, messages at index 3 and 4 should be RECENT
        const priority4 = calculatePriority(messages[4]!, 4, 5, 2, analysis);
        const priority3 = calculatePriority(messages[3]!, 3, 5, 2, analysis);

        expect(priority4).toBe(MessagePriority.RECENT);
        expect(priority3).toBe(MessagePriority.RECENT);
      });

      it("should assign TOOL_PAIR priority to paired messages", () => {
        const messages: ContextMessage[] = [
          createTestMessage({ role: "system" }),
          createTestMessage({ role: "user" }),
          createTestMessage({
            role: "assistant",
            content: [createToolUse("t1", "read_file")],
          }),
          createTestMessage({
            role: "user",
            content: [createToolResult("t1", "file content")],
          }),
          createTestMessage({ role: "assistant" }),
          createTestMessage({ role: "user" }),
          createTestMessage({ role: "assistant" }),
        ];
        const analysis = analyzeToolPairs(messages);

        const priority = calculatePriority(messages[2]!, 2, 7, 2, analysis);

        expect(priority).toBe(MessagePriority.TOOL_PAIR);
      });

      it("should assign NORMAL priority to regular messages", () => {
        const messages: ContextMessage[] = [
          createTestMessage({ role: "system" }),
          createTestMessage({ role: "user" }),
          createTestMessage({ role: "assistant" }),
          createTestMessage({ role: "user" }),
          createTestMessage({ role: "assistant" }),
        ];
        const analysis = analyzeToolPairs(messages);

        // Message at index 2 is not system, anchor, recent (with recentCount=1), or tool pair
        const priority = calculatePriority(messages[2]!, 2, 5, 1, analysis);

        expect(priority).toBe(MessagePriority.NORMAL);
      });
    });

    describe("getTruncationCandidates", () => {
      it("should exclude SYSTEM and ANCHOR messages", () => {
        const messages: ContextMessage[] = [
          createTestMessage({ role: "system" }),
          createTestMessage({ role: "user" }),
          createTestMessage({ role: "assistant" }),
          createTestMessage({ role: "user" }),
        ];
        const analysis = analyzeToolPairs(messages);

        const candidates = getTruncationCandidates(messages, 1, analysis);

        // System (index 0) and anchor (index 1) should be excluded
        const indices = candidates.map((c) => c.index);
        expect(indices).not.toContain(0);
        expect(indices).not.toContain(1);
      });

      it("should sort candidates by priority ascending", () => {
        const messages: ContextMessage[] = [
          createTestMessage({ role: "system" }),
          createTestMessage({ role: "user" }),
          createTestMessage({ role: "assistant" }),
          createTestMessage({
            role: "assistant",
            content: [createToolUse("t1", "test")],
          }),
          createTestMessage({
            role: "user",
            content: [createToolResult("t1", "res")],
          }),
          createTestMessage({ role: "user" }),
        ];
        const analysis = analyzeToolPairs(messages);

        const candidates = getTruncationCandidates(messages, 1, analysis);

        // Should be sorted: NORMAL first, then TOOL_PAIR, then RECENT
        for (let i = 1; i < candidates.length; i++) {
          expect(candidates[i]?.priority ?? 0).toBeGreaterThanOrEqual(
            candidates[i - 1]?.priority ?? 0
          );
        }
      });
    });

    describe("truncate", () => {
      it("should remove lowest priority messages first", () => {
        const messages: ContextMessage[] = [
          createTestMessage({ role: "system", content: "System" }),
          createTestMessage({ role: "user", content: "User anchor" }),
          createTestMessage({ role: "assistant", content: "A".repeat(1000) }),
          createTestMessage({ role: "user", content: "B".repeat(1000) }),
          createTestMessage({ role: "assistant", content: "C".repeat(100) }),
        ];

        const result = truncate(messages, { targetTokens: 300 });

        expect(result.removedCount).toBeGreaterThan(0);
        // System and anchor should remain
        expect(result.messages.some((m) => m.role === "system")).toBe(true);
        expect(result.messages[1]?.content).toBe("User anchor");
      });

      it("should preserve tool pairs when preserveToolPairs is true", () => {
        const messages: ContextMessage[] = [
          createTestMessage({ role: "system", content: "S" }),
          createTestMessage({ role: "user", content: "U" }),
          createTestMessage({
            role: "assistant",
            content: [createToolUse("t1", "test")],
          }),
          createTestMessage({
            role: "user",
            content: [createToolResult("t1", "result")],
          }),
          createTestMessage({ role: "assistant", content: "Normal" }),
        ];

        const result = truncate(messages, {
          targetTokens: 50,
          preserveToolPairs: true,
        });

        // If tool pair messages are removed, both should be removed together
        const hasToolUse = result.messages.some(
          (m) => Array.isArray(m.content) && m.content.some((b) => b.type === "tool_use")
        );
        const hasToolResult = result.messages.some(
          (m) => Array.isArray(m.content) && m.content.some((b) => b.type === "tool_result")
        );

        // Either both present or both removed
        expect(hasToolUse).toBe(hasToolResult);
      });

      it("should respect recent count protection", () => {
        const messages: ContextMessage[] = [
          createTestMessage({ role: "system", content: "S" }),
          createTestMessage({ role: "user", content: "U1" }),
          createTestMessage({ role: "assistant", content: "A".repeat(500) }),
          createTestMessage({ role: "user", content: "U2" }),
          createTestMessage({ role: "assistant", content: "Recent" }),
        ];

        const result = truncate(messages, {
          targetTokens: 100,
          recentCount: 2,
        });

        // Last 2 messages should be protected
        const lastTwo = result.messages.slice(-2);
        expect(lastTwo.some((m) => m.content === "U2")).toBe(true);
        expect(lastTwo.some((m) => m.content === "Recent")).toBe(true);
      });

      it("should never remove SYSTEM messages", () => {
        const messages: ContextMessage[] = [
          createTestMessage({ role: "system", content: "Critical system prompt" }),
          createTestMessage({ role: "user", content: "U".repeat(10000) }),
        ];

        const result = truncate(messages, { targetTokens: 50 });

        expect(result.messages.some((m) => m.role === "system")).toBe(true);
      });

      it("should never remove ANCHOR (first user) message", () => {
        const messages: ContextMessage[] = [
          createTestMessage({ role: "user", content: "First user message" }),
          createTestMessage({ role: "assistant", content: "A".repeat(10000) }),
        ];

        const result = truncate(messages, { targetTokens: 50 });

        expect(result.messages[0]?.content).toBe("First user message");
      });

      it("should return original messages if already within budget", () => {
        const messages: ContextMessage[] = [createTestMessage({ content: "Short" })];

        const result = truncate(messages, { targetTokens: 10000 });

        expect(result.removedCount).toBe(0);
        expect(result.messages).toHaveLength(1);
      });

      it("should handle empty messages array", () => {
        const result = truncate([], { targetTokens: 1000 });

        expect(result.messages).toHaveLength(0);
        expect(result.removedCount).toBe(0);
        expect(result.tokenCount).toBe(0);
      });
    });

    describe("estimateTokens", () => {
      it("should use cached tokens if available", () => {
        const message = createTestMessage({
          content: "This is ignored",
          tokens: 42,
        });

        expect(estimateTokens(message)).toBe(42);
      });

      it("should estimate tokens from string content", () => {
        const message = createTestMessage({
          content: "Hello World", // 11 chars → ~3 tokens
        });

        const tokens = estimateTokens(message);

        expect(tokens).toBe(Math.ceil(11 / 4));
      });

      it("should estimate tokens from array content", () => {
        const message = createTestMessage({
          content: [createTextBlock("Hello World")],
        });

        const tokens = estimateTokens(message);

        expect(tokens).toBeGreaterThan(0);
      });
    });

    describe("fitsInBudget", () => {
      it("should return true when under budget", () => {
        const messages = [createTestMessage({ content: "Short", tokens: 10 })];

        expect(fitsInBudget(messages, 100)).toBe(true);
      });

      it("should return false when over budget", () => {
        const messages = [createTestMessage({ content: "Long", tokens: 200 })];

        expect(fitsInBudget(messages, 100)).toBe(false);
      });

      it("should use custom tokenizer", () => {
        const messages = [createTestMessage({ content: "Test" })];
        const customTokenizer = () => 500;

        expect(fitsInBudget(messages, 100, customTokenizer)).toBe(false);
      });
    });

    describe("assignPriorities", () => {
      it("should assign priorities to all messages", () => {
        const messages: ContextMessage[] = [
          createTestMessage({ role: "system" }),
          createTestMessage({ role: "user" }),
          createTestMessage({ role: "assistant" }),
        ];
        const analysis = analyzeToolPairs(messages);

        assignPriorities(messages, 1, analysis);

        expect(messages[0]?.priority).toBe(MessagePriority.SYSTEM);
        expect(messages[1]?.priority).toBe(MessagePriority.ANCHOR);
      });
    });
  });

  // ============================================================================
  // Tool Trimming Tests
  // ============================================================================

  describe("tool-trimming", () => {
    describe("isProtectedTool", () => {
      it("should return true for protected tools", () => {
        expect(isProtectedTool("skill", DEFAULT_PROTECTED_TOOLS)).toBe(true);
        expect(isProtectedTool("memory_search", DEFAULT_PROTECTED_TOOLS)).toBe(true);
        expect(isProtectedTool("code_review", DEFAULT_PROTECTED_TOOLS)).toBe(true);
      });

      it("should return false for non-protected tools", () => {
        expect(isProtectedTool("read_file", DEFAULT_PROTECTED_TOOLS)).toBe(false);
        expect(isProtectedTool("write_file", DEFAULT_PROTECTED_TOOLS)).toBe(false);
      });

      it("should be case-insensitive", () => {
        expect(isProtectedTool("SKILL", DEFAULT_PROTECTED_TOOLS)).toBe(true);
        expect(isProtectedTool("Memory_Search", DEFAULT_PROTECTED_TOOLS)).toBe(true);
      });

      it("should work with custom protected tools", () => {
        const custom = ["custom_tool", "another_tool"];
        expect(isProtectedTool("custom_tool", custom)).toBe(true);
        expect(isProtectedTool("skill", custom)).toBe(false);
      });
    });

    describe("getToolResultLength", () => {
      it("should return length for string content", () => {
        const block = createToolResult("t1", "Hello World");
        expect(getToolResultLength(block)).toBe(11);
      });

      it("should return length for text block content", () => {
        const content: ContentBlock[] = [createTextBlock("Part 1"), createTextBlock("Part 2")];
        const block = createToolResult("t1", content);

        expect(getToolResultLength(block)).toBe(12); // 6 + 6
      });

      it("should ignore non-text blocks in length calculation", () => {
        const content: ContentBlock[] = [createTextBlock("Text"), createImageBlock(100, 100)];
        const block = createToolResult("t1", content);

        expect(getToolResultLength(block)).toBe(4); // Only text
      });
    });

    describe("getToolNameForResult", () => {
      it("should find tool name from matching tool_use", () => {
        const messages: ContextMessage[] = [
          createTestMessage({
            role: "assistant",
            content: [createToolUse("tool-123", "read_file")],
          }),
          createTestMessage({
            role: "user",
            content: [createToolResult("tool-123", "content")],
          }),
        ];

        const name = getToolNameForResult("tool-123", messages);
        expect(name).toBe("read_file");
      });

      it("should return undefined for non-existent tool_use_id", () => {
        const messages: ContextMessage[] = [createTestMessage({ content: "No tools here" })];

        const name = getToolNameForResult("missing-id", messages);
        expect(name).toBeUndefined();
      });
    });

    describe("trimToolResult", () => {
      it("should not trim content within limit", () => {
        const block = createToolResult("t1", "Short content");
        const result = trimToolResult(block, 100, "[truncated]", false);

        expect(result.trimmed).toBe(false);
        expect(result.charsRemoved).toBe(0);
        expect(result.block).toBe(block); // Same reference
      });

      it("should trim long string content", () => {
        const longContent = "A".repeat(1000);
        const block = createToolResult("t1", longContent);
        const result = trimToolResult(block, 100, "[truncated]", false);

        expect(result.trimmed).toBe(true);
        expect(result.charsRemoved).toBeGreaterThan(0);
        expect(getToolResultLength(result.block)).toBeLessThanOrEqual(100);
      });

      it("should add truncation marker", () => {
        const longContent = "A".repeat(1000);
        const block = createToolResult("t1", longContent);
        const result = trimToolResult(block, 100, "[... truncated]", false);

        expect((result.block.content as string).endsWith("[... truncated]")).toBe(true);
      });

      it("should set compactedAt when tracking enabled", () => {
        const longContent = "A".repeat(1000);
        const block = createToolResult("t1", longContent);
        const before = Date.now();
        const result = trimToolResult(block, 100, "[truncated]", true);
        const after = Date.now();

        expect(result.block.compactedAt).toBeGreaterThanOrEqual(before);
        expect(result.block.compactedAt).toBeLessThanOrEqual(after);
      });

      it("should handle content block array trimming", () => {
        const content: ContentBlock[] = [
          createTextBlock("A".repeat(500)),
          createTextBlock("B".repeat(500)),
        ];
        const block = createToolResult("t1", content);
        const result = trimToolResult(block, 200, "[truncated]", false);

        expect(result.trimmed).toBe(true);
        expect(getToolResultLength(result.block)).toBeLessThanOrEqual(200);
      });
    });

    describe("pruneToolOutputs", () => {
      it("should trim long tool outputs", () => {
        const messages: ContextMessage[] = [
          createTestMessage({
            role: "assistant",
            content: [createToolUse("t1", "read_file")],
          }),
          createTestMessage({
            role: "user",
            content: [createToolResult("t1", "X".repeat(20000))],
          }),
        ];

        const result = pruneToolOutputs(messages, { maxOutputChars: 5000 });

        expect(result.trimmedCount).toBe(1);
        expect(result.charsRemoved).toBeGreaterThan(0);
        expect(result.trimmedTools).toContain("read_file");
      });

      it("should protect listed tools from pruning", () => {
        const messages: ContextMessage[] = [
          createTestMessage({
            role: "assistant",
            content: [createToolUse("t1", "skill")],
          }),
          createTestMessage({
            role: "user",
            content: [createToolResult("t1", "X".repeat(20000))],
          }),
        ];

        const result = pruneToolOutputs(messages, {
          maxOutputChars: 100,
          protectedTools: ["skill"],
        });

        expect(result.trimmedCount).toBe(0);
      });

      it("should add truncation marker to trimmed content", () => {
        const messages: ContextMessage[] = [
          createTestMessage({
            role: "assistant",
            content: [createToolUse("t1", "read_file")],
          }),
          createTestMessage({
            role: "user",
            content: [createToolResult("t1", "X".repeat(20000))],
          }),
        ];

        const result = pruneToolOutputs(messages, {
          maxOutputChars: 100,
          truncationMarker: "[CUSTOM MARKER]",
        });

        const toolResultMsg = result.messages[1]!;
        const content = toolResultMsg.content as ContentBlock[];
        const toolResult = content[0] as ToolResultBlock;

        expect((toolResult.content as string).includes("[CUSTOM MARKER]")).toBe(true);
      });

      it("should not mutate original messages", () => {
        const originalContent = "X".repeat(20000);
        const messages: ContextMessage[] = [
          createTestMessage({
            role: "assistant",
            content: [createToolUse("t1", "read_file")],
          }),
          createTestMessage({
            role: "user",
            content: [createToolResult("t1", originalContent)],
          }),
        ];

        pruneToolOutputs(messages, { maxOutputChars: 100 });

        // Original should be unchanged
        const originalToolResult = (messages[1]?.content as ContentBlock[])[0] as ToolResultBlock;
        expect(originalToolResult.content).toBe(originalContent);
      });

      it("should estimate tokens saved", () => {
        const messages: ContextMessage[] = [
          createTestMessage({
            role: "assistant",
            content: [createToolUse("t1", "read_file")],
          }),
          createTestMessage({
            role: "user",
            content: [createToolResult("t1", "X".repeat(10000))],
          }),
        ];

        const result = pruneToolOutputs(messages, { maxOutputChars: 1000 });

        // tokensSaved should be approximately charsRemoved / 4
        expect(result.tokensSaved).toBe(Math.floor(result.charsRemoved / 4));
      });

      it("should handle messages with string content", () => {
        const messages: ContextMessage[] = [
          createTestMessage({ content: "Just a string message" }),
        ];

        const result = pruneToolOutputs(messages);

        expect(result.trimmedCount).toBe(0);
        expect(result.messages[0]).toBe(messages[0]);
      });

      it("should handle empty messages array", () => {
        const result = pruneToolOutputs([]);

        expect(result.messages).toHaveLength(0);
        expect(result.trimmedCount).toBe(0);
      });
    });

    describe("cloneMessage", () => {
      it("should create deep copy of message", () => {
        const original = createTestMessage({
          content: [createTextBlock("Hello")],
          metadata: { key: "value" },
        });

        const clone = cloneMessage(original);

        expect(clone).not.toBe(original);
        expect(clone.content).not.toBe(original.content);
        expect(clone.metadata).not.toBe(original.metadata);
        expect(clone).toEqual(original);
      });

      it("should handle string content", () => {
        const original = createTestMessage({ content: "String content" });

        const clone = cloneMessage(original);

        expect(clone.content).toBe("String content");
      });
    });

    describe("constants", () => {
      it("should have reasonable default values", () => {
        expect(DEFAULT_MAX_OUTPUT_CHARS).toBe(10000);
        expect(DEFAULT_TRUNCATION_MARKER).toBe("\n\n[... truncated]");
        expect(DEFAULT_PROTECTED_TOOLS).toContain("skill");
        expect(DEFAULT_PROTECTED_TOOLS).toContain("memory_search");
        expect(DEFAULT_PROTECTED_TOOLS).toContain("code_review");
      });
    });
  });
});
