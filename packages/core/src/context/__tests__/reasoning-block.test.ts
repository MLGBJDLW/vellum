/**
 * Tests for Reasoning Block Handler
 *
 * Covers:
 * - REQ-004: Reasoning block injection for DeepSeek models
 *
 * @module @vellum/core/context/__tests__/reasoning-block.test
 */

import { describe, expect, it } from "vitest";
import {
  addReasoningBlock,
  createReasoningBlockHandler,
  ReasoningBlockHandler,
  requiresReasoningBlock,
} from "../reasoning-block.js";
import type { ContextMessage } from "../types.js";
import { MessagePriority } from "../types.js";

// ============================================================================
// Test Helpers
// ============================================================================

function createTestMessage(
  role: ContextMessage["role"],
  content: string,
  options: Partial<ContextMessage> = {}
): ContextMessage {
  return {
    id: "test-msg-1",
    role,
    content,
    priority: MessagePriority.NORMAL,
    ...options,
  };
}

// ============================================================================
// ReasoningBlockHandler Tests
// ============================================================================

describe("ReasoningBlockHandler", () => {
  describe("constructor", () => {
    it("should create handler with default options", () => {
      const handler = new ReasoningBlockHandler();
      expect(handler.getThinkingPrefix()).toContain("analyze the context");
    });

    it("should respect custom thinkingPrefix", () => {
      const customPrefix = "Custom thinking process...";
      const handler = new ReasoningBlockHandler({ thinkingPrefix: customPrefix });
      expect(handler.getThinkingPrefix()).toBe(customPrefix);
    });
  });

  describe("requiresReasoningBlock() - DeepSeek detection", () => {
    it("should return true for deepseek models", () => {
      const handler = new ReasoningBlockHandler();

      expect(handler.requiresReasoningBlock("deepseek")).toBe(true);
      expect(handler.requiresReasoningBlock("deepseek-r1")).toBe(true);
      expect(handler.requiresReasoningBlock("deepseek-v3")).toBe(true);
      expect(handler.requiresReasoningBlock("deepseek-coder")).toBe(true);
      expect(handler.requiresReasoningBlock("deep-seek")).toBe(true);
    });

    it("should be case-insensitive for model detection", () => {
      const handler = new ReasoningBlockHandler();

      expect(handler.requiresReasoningBlock("DeepSeek")).toBe(true);
      expect(handler.requiresReasoningBlock("DEEPSEEK")).toBe(true);
      expect(handler.requiresReasoningBlock("DeepSeek-R1")).toBe(true);
      expect(handler.requiresReasoningBlock("DEEPSEEK-CODER")).toBe(true);
    });

    it("should return false for non-DeepSeek models", () => {
      const handler = new ReasoningBlockHandler();

      expect(handler.requiresReasoningBlock("gpt-4o")).toBe(false);
      expect(handler.requiresReasoningBlock("gpt-4-turbo")).toBe(false);
      expect(handler.requiresReasoningBlock("claude-3-opus")).toBe(false);
      expect(handler.requiresReasoningBlock("claude-3-sonnet")).toBe(false);
      expect(handler.requiresReasoningBlock("gemini-pro")).toBe(false);
      expect(handler.requiresReasoningBlock("llama-3")).toBe(false);
    });

    it("should handle edge cases", () => {
      const handler = new ReasoningBlockHandler();

      expect(handler.requiresReasoningBlock("")).toBe(false);
      expect(handler.requiresReasoningBlock("deep")).toBe(false);
      expect(handler.requiresReasoningBlock("seek")).toBe(false);
    });
  });

  describe("detectModelFamily()", () => {
    it("should detect deepseek-r1 family", () => {
      const handler = new ReasoningBlockHandler();

      expect(handler.detectModelFamily("deepseek-r1")).toBe("deepseek-r1");
      expect(handler.detectModelFamily("DeepSeek-R1")).toBe("deepseek-r1");
      expect(handler.detectModelFamily("deepseek-r1-base")).toBe("deepseek-r1");
    });

    it("should detect generic deepseek family", () => {
      const handler = new ReasoningBlockHandler();

      expect(handler.detectModelFamily("deepseek")).toBe("deepseek");
      expect(handler.detectModelFamily("deepseek-coder")).toBe("deepseek");
      expect(handler.detectModelFamily("deepseek-v3")).toBe("deepseek");
    });

    it("should return undefined for non-reasoning models", () => {
      const handler = new ReasoningBlockHandler();

      expect(handler.detectModelFamily("gpt-4o")).toBeUndefined();
      expect(handler.detectModelFamily("claude-3-opus")).toBeUndefined();
      expect(handler.detectModelFamily("")).toBeUndefined();
    });
  });

  describe("addReasoningBlock() - block addition", () => {
    it("should add reasoning block to assistant message", () => {
      const handler = new ReasoningBlockHandler();
      const message = createTestMessage("assistant", "Summary content");

      const result = handler.addReasoningBlock(message);

      expect(result.wasAdded).toBe(true);
      expect(result.message.reasoningContent).toBeDefined();
      expect(result.message.reasoningContent).toContain("<thinking>");
      expect(result.message.reasoningContent).toContain("</thinking>");
      expect(result.reasoningContent).toBeDefined();
    });

    it("should include thinking prefix in reasoning block", () => {
      const handler = new ReasoningBlockHandler();
      const message = createTestMessage("assistant", "Summary content");

      const result = handler.addReasoningBlock(message);

      expect(result.message.reasoningContent).toContain("analyze the context");
    });

    it("should preserve original message content", () => {
      const handler = new ReasoningBlockHandler();
      const message = createTestMessage("assistant", "Original content");

      const result = handler.addReasoningBlock(message);

      expect(result.message.content).toBe("Original content");
      expect(result.message.id).toBe(message.id);
      expect(result.message.role).toBe(message.role);
      expect(result.message.priority).toBe(message.priority);
    });

    it("should preserve existing reasoning content", () => {
      const handler = new ReasoningBlockHandler();
      const message = createTestMessage("assistant", "Summary", {
        reasoningContent: "Existing reasoning...",
      });

      const result = handler.addReasoningBlock(message);

      expect(result.message.reasoningContent).toContain("<thinking>");
      expect(result.message.reasoningContent).toContain("Existing reasoning...");
    });
  });

  describe("addReasoningBlock() - non-assistant passthrough", () => {
    it("should not add reasoning to user messages", () => {
      const handler = new ReasoningBlockHandler();
      const message = createTestMessage("user", "User message");

      const result = handler.addReasoningBlock(message);

      expect(result.wasAdded).toBe(false);
      expect(result.message.reasoningContent).toBeUndefined();
      expect(result.message).toEqual(message);
    });

    it("should not add reasoning to system messages", () => {
      const handler = new ReasoningBlockHandler();
      const message = createTestMessage("system", "System message");

      const result = handler.addReasoningBlock(message);

      expect(result.wasAdded).toBe(false);
      expect(result.message.reasoningContent).toBeUndefined();
    });
  });

  describe("processForModel()", () => {
    it("should add reasoning for DeepSeek models", () => {
      const handler = new ReasoningBlockHandler();
      const message = createTestMessage("assistant", "Summary");

      const result = handler.processForModel(message, "deepseek-r1");

      expect(result.wasAdded).toBe(true);
      expect(result.message.reasoningContent).toContain("<thinking>");
    });

    it("should not add reasoning for non-DeepSeek models", () => {
      const handler = new ReasoningBlockHandler();
      const message = createTestMessage("assistant", "Summary");

      const result = handler.processForModel(message, "gpt-4o");

      expect(result.wasAdded).toBe(false);
      expect(result.message.reasoningContent).toBeUndefined();
    });

    it("should return original message unchanged for non-DeepSeek", () => {
      const handler = new ReasoningBlockHandler();
      const message = createTestMessage("assistant", "Summary");

      const result = handler.processForModel(message, "claude-3-opus");

      expect(result.message).toEqual(message);
    });
  });

  describe("timestamp option", () => {
    it("should include timestamp when enabled", () => {
      const handler = new ReasoningBlockHandler({ includeTimestamp: true });
      const message = createTestMessage("assistant", "Summary");

      const result = handler.addReasoningBlock(message);

      expect(result.message.reasoningContent).toContain("Generated at:");
    });

    it("should not include timestamp by default", () => {
      const handler = new ReasoningBlockHandler();
      const message = createTestMessage("assistant", "Summary");

      const result = handler.addReasoningBlock(message);

      expect(result.message.reasoningContent).not.toContain("Generated at:");
    });
  });

  describe("custom thinking prefix", () => {
    it("should use custom prefix in reasoning block", () => {
      const customPrefix = "Analyzing this conversation...";
      const handler = new ReasoningBlockHandler({ thinkingPrefix: customPrefix });
      const message = createTestMessage("assistant", "Summary");

      const result = handler.addReasoningBlock(message);

      expect(result.message.reasoningContent).toContain(customPrefix);
    });
  });
});

// ============================================================================
// Utility Function Tests
// ============================================================================

describe("createReasoningBlockHandler", () => {
  it("should create handler with default options", () => {
    const handler = createReasoningBlockHandler();
    expect(handler).toBeInstanceOf(ReasoningBlockHandler);
  });

  it("should create handler with custom options", () => {
    const handler = createReasoningBlockHandler({ thinkingPrefix: "Custom" });
    expect(handler.getThinkingPrefix()).toBe("Custom");
  });
});

describe("requiresReasoningBlock (standalone)", () => {
  it("should detect DeepSeek models", () => {
    expect(requiresReasoningBlock("deepseek-r1")).toBe(true);
    expect(requiresReasoningBlock("deepseek")).toBe(true);
  });

  it("should return false for other models", () => {
    expect(requiresReasoningBlock("gpt-4o")).toBe(false);
    expect(requiresReasoningBlock("claude-3")).toBe(false);
  });
});

describe("addReasoningBlock (standalone)", () => {
  it("should add reasoning block to assistant message", () => {
    const message = createTestMessage("assistant", "Summary");

    const result = addReasoningBlock(message);

    expect(result.wasAdded).toBe(true);
    expect(result.message.reasoningContent).toContain("<thinking>");
  });

  it("should accept custom options", () => {
    const message = createTestMessage("assistant", "Summary");

    const result = addReasoningBlock(message, { thinkingPrefix: "Custom" });

    expect(result.message.reasoningContent).toContain("Custom");
  });
});
