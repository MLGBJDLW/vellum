// ============================================
// CompactionService Tests
// ============================================

import { describe, expect, it } from "vitest";
import {
  type CompactionConfig,
  CompactionService,
  DEFAULT_COMPACTION_CONFIG,
} from "../compaction.js";
import { SessionParts } from "../message.js";
import { createSession } from "../types.js";

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Creates a test session with messages.
 */
function createTestSession(messageCount: number) {
  const session = createSession({
    title: "Test Session",
    workingDirectory: "/test",
  });

  for (let i = 0; i < messageCount; i++) {
    const role = i % 2 === 0 ? "user" : "assistant";
    session.messages.push({
      id: `msg-${i}`,
      role: role as "user" | "assistant",
      parts: [SessionParts.text(`Test message ${i}`)],
      metadata: { createdAt: Date.now() },
    });
  }

  session.metadata.messageCount = messageCount;
  session.metadata.tokenCount = messageCount * 10;
  return session;
}

/**
 * Creates a session with tool results of specified sizes.
 */
function createSessionWithToolResults(toolOutputSizes: number[]) {
  const session = createSession({
    title: "Tool Session",
    workingDirectory: "/test",
  });

  // Add user message
  session.messages.push({
    id: "msg-user-1",
    role: "user",
    parts: [SessionParts.text("Run some tools")],
    metadata: { createdAt: Date.now() },
  });

  // Add assistant with tool calls
  session.messages.push({
    id: "msg-assistant-1",
    role: "assistant",
    parts: toolOutputSizes.map((_, i) => SessionParts.tool(`tool-${i}`, "test_tool", { index: i })),
    metadata: { createdAt: Date.now() },
  });

  // Add tool results
  toolOutputSizes.forEach((size, i) => {
    const content = "x".repeat(size);
    session.messages.push({
      id: `msg-tool-result-${i}`,
      role: "tool_result",
      parts: [SessionParts.toolResult(`tool-${i}`, content)],
      metadata: { createdAt: Date.now() },
    });
  });

  session.metadata.messageCount = 2 + toolOutputSizes.length;
  return session;
}

// =============================================================================
// Tests
// =============================================================================

describe("CompactionService", () => {
  describe("constructor", () => {
    it("should use default config when no options provided", () => {
      const service = new CompactionService();
      const session = createSessionWithToolResults([500]);
      const stats = service.getCompactionStats(session);

      // 500 < 1000 (default maxToolOutputLength), so no savings
      expect(stats.potentialSavings).toBe(0);
    });

    it("should merge partial config with defaults", () => {
      const service = new CompactionService({ maxToolOutputLength: 200 });
      const session = createSessionWithToolResults([500]);
      const stats = service.getCompactionStats(session);

      // 500 > 200, so there should be potential savings
      expect(stats.potentialSavings).toBeGreaterThan(0);
    });

    it("should accept full custom config", () => {
      const customConfig: CompactionConfig = {
        maxToolOutputLength: 500,
        keepFirstMessages: 3,
        keepLastMessages: 5,
        prunedMarker: "[PRUNED]",
        truncatedMarker: "[TRUNCATED: {count}]",
      };
      const service = new CompactionService(customConfig);

      // Test that custom config is used
      const session = createTestSession(20);
      const { result } = service.truncateMiddle(session);

      // 20 - 3 - 5 = 12 truncated
      expect(result.truncatedMessages).toBe(12);
    });
  });

  describe("pruneToolOutputs", () => {
    it("should not modify outputs under maxToolOutputLength", () => {
      const service = new CompactionService({ maxToolOutputLength: 1000 });
      const session = createSessionWithToolResults([500, 800]);
      const { session: pruned, result } = service.pruneToolOutputs(session);

      expect(result.prunedOutputs).toBe(0);

      // Original content should be preserved
      const toolResult1 = pruned.messages[2]?.parts[0] as { content: string } | undefined;
      expect(toolResult1?.content.length).toBe(500);
    });

    it("should truncate outputs exceeding maxToolOutputLength", () => {
      const service = new CompactionService({ maxToolOutputLength: 1000 });
      const session = createSessionWithToolResults([500, 2000, 1500]);
      const { session: pruned, result } = service.pruneToolOutputs(session);

      expect(result.prunedOutputs).toBe(2);

      // First output should be unchanged (500 < 1000)
      const toolResult1 = pruned.messages[2]?.parts[0] as { content: string } | undefined;
      expect(toolResult1?.content.length).toBe(500);

      // Second output should be truncated
      const toolResult2 = pruned.messages[3]?.parts[0] as { content: string } | undefined;
      expect(toolResult2?.content).toContain(DEFAULT_COMPACTION_CONFIG.prunedMarker);
      expect(toolResult2?.content.length).toBeLessThan(2000);
    });

    it("should preserve first and last 200 chars when truncating", () => {
      const service = new CompactionService({ maxToolOutputLength: 100 });

      // Create content with identifiable start and end
      const start = "START".repeat(40); // 200 chars
      const middle = "MIDDLE".repeat(100); // 600 chars
      const end = "END".repeat(67); // ~200 chars

      const session = createSession({
        title: "Test",
        workingDirectory: "/test",
      });

      session.messages.push({
        id: "user-1",
        role: "user",
        parts: [SessionParts.text("test")],
        metadata: { createdAt: Date.now() },
      });

      session.messages.push({
        id: "tool-result-1",
        role: "tool_result",
        parts: [SessionParts.toolResult("tool-1", start + middle + end)],
        metadata: { createdAt: Date.now() },
      });

      const { session: pruned } = service.pruneToolOutputs(session);
      const toolResult = pruned.messages[1]?.parts[0] as { content: string } | undefined;

      expect(toolResult?.content).toContain("STARTSTART"); // Beginning preserved
      expect(toolResult?.content).toContain("ENDEND"); // End preserved
      expect(toolResult?.content).toContain(DEFAULT_COMPACTION_CONFIG.prunedMarker);
    });

    it("should be immutable - not modify original session", () => {
      const service = new CompactionService({ maxToolOutputLength: 100 });
      const session = createSessionWithToolResults([500]);
      const originalContent = (session.messages[2]?.parts[0] as { content: string } | undefined)
        ?.content;

      service.pruneToolOutputs(session);

      // Original should be unchanged
      const afterContent = (session.messages[2]?.parts[0] as { content: string } | undefined)
        ?.content;
      expect(afterContent).toBe(originalContent);
    });

    it("should recalculate tokenCount", () => {
      const service = new CompactionService({ maxToolOutputLength: 100 });
      const session = createSessionWithToolResults([2000]);
      session.metadata.tokenCount = 1000;

      const { session: pruned, result } = service.pruneToolOutputs(session);

      expect(result.originalTokenCount).toBe(1000);
      expect(result.newTokenCount).toBeLessThan(1000);
      expect(pruned.metadata.tokenCount).toBe(result.newTokenCount);
    });

    it("should use custom prunedMarker", () => {
      const service = new CompactionService({
        maxToolOutputLength: 100,
        prunedMarker: "[CUSTOM MARKER]",
      });
      const session = createSessionWithToolResults([500]);
      const { session: pruned } = service.pruneToolOutputs(session);

      const toolResult = pruned.messages[2]?.parts[0] as { content: string } | undefined;
      expect(toolResult?.content).toContain("[CUSTOM MARKER]");
    });
  });

  describe("truncateMiddle", () => {
    it("should not truncate when messages fit within limits", () => {
      const service = new CompactionService({
        keepFirstMessages: 5,
        keepLastMessages: 10,
      });
      const session = createTestSession(10); // Exactly at limit

      const { result } = service.truncateMiddle(session);
      expect(result.truncatedMessages).toBe(0);
    });

    it("should truncate middle messages and insert marker", () => {
      const service = new CompactionService({
        keepFirstMessages: 3,
        keepLastMessages: 3,
      });
      const session = createTestSession(20);

      const { session: truncated, result } = service.truncateMiddle(session);

      // Should have: 3 first + 1 marker + 3 last = 7 messages
      expect(truncated.messages.length).toBe(7);
      expect(result.truncatedMessages).toBe(14); // 20 - 3 - 3 = 14

      // Check marker message
      const markerMessage = truncated.messages[3];
      if (!markerMessage) throw new Error("Test setup error");
      expect(markerMessage.role).toBe("system");
      const markerPart = markerMessage.parts[0] as { text: string } | undefined;
      expect(markerPart?.text).toContain("14");
    });

    it("should preserve first and last messages correctly", () => {
      const service = new CompactionService({
        keepFirstMessages: 2,
        keepLastMessages: 2,
      });
      const session = createTestSession(10);

      const { session: truncated } = service.truncateMiddle(session);

      // First 2 messages
      expect(truncated.messages[0]?.id).toBe("msg-0");
      expect(truncated.messages[1]?.id).toBe("msg-1");

      // Last 2 messages (after marker at index 2)
      expect(truncated.messages[3]?.id).toBe("msg-8");
      expect(truncated.messages[4]?.id).toBe("msg-9");
    });

    it("should use custom truncatedMarker with count placeholder", () => {
      const service = new CompactionService({
        keepFirstMessages: 2,
        keepLastMessages: 2,
        truncatedMarker: "Removed {count} messages here",
      });
      const session = createTestSession(10);

      const { session: truncated } = service.truncateMiddle(session);
      const markerMessage = truncated.messages[2];
      if (!markerMessage) throw new Error("Test setup error");
      const markerPart = markerMessage.parts[0] as { text: string } | undefined;

      expect(markerPart?.text).toBe("Removed 6 messages here");
    });

    it("should be immutable - not modify original session", () => {
      const service = new CompactionService({
        keepFirstMessages: 2,
        keepLastMessages: 2,
      });
      const session = createTestSession(10);
      const originalLength = session.messages.length;

      service.truncateMiddle(session);

      expect(session.messages.length).toBe(originalLength);
    });

    it("should update messageCount in metadata", () => {
      const service = new CompactionService({
        keepFirstMessages: 3,
        keepLastMessages: 3,
      });
      const session = createTestSession(20);

      const { session: truncated } = service.truncateMiddle(session);

      // 3 + 1 (marker) + 3 = 7
      expect(truncated.metadata.messageCount).toBe(7);
    });

    it("should recalculate tokenCount", () => {
      const service = new CompactionService({
        keepFirstMessages: 2,
        keepLastMessages: 2,
      });
      const session = createTestSession(100);
      session.metadata.tokenCount = 5000;

      const { session: truncated, result } = service.truncateMiddle(session);

      expect(result.originalTokenCount).toBe(5000);
      expect(result.newTokenCount).toBeLessThan(5000);
      expect(truncated.metadata.tokenCount).toBe(result.newTokenCount);
    });

    it("should update updatedAt timestamp", () => {
      const service = new CompactionService({
        keepFirstMessages: 2,
        keepLastMessages: 2,
      });
      const session = createTestSession(10);
      const originalUpdatedAt = session.metadata.updatedAt.getTime();

      // Small delay to ensure timestamp difference
      const { session: truncated } = service.truncateMiddle(session);

      expect(truncated.metadata.updatedAt.getTime()).toBeGreaterThanOrEqual(originalUpdatedAt);
    });
  });

  describe("getCompactionStats", () => {
    it("should calculate total tool output bytes", () => {
      const service = new CompactionService();
      const session = createSessionWithToolResults([100, 200, 300]);
      const stats = service.getCompactionStats(session);

      expect(stats.toolOutputBytes).toBe(600);
    });

    it("should calculate potential savings for large outputs", () => {
      const service = new CompactionService({ maxToolOutputLength: 500 });
      const session = createSessionWithToolResults([1000, 2000]);
      const stats = service.getCompactionStats(session);

      // 1000 -> ~400+marker, savings ~585
      // 2000 -> ~400+marker, savings ~1585
      expect(stats.potentialSavings).toBeGreaterThan(0);
      expect(stats.toolOutputBytes).toBe(3000);
    });

    it("should calculate messages in middle correctly", () => {
      const service = new CompactionService({
        keepFirstMessages: 5,
        keepLastMessages: 5,
      });

      // 20 messages: 20 - 5 - 5 = 10 in middle
      const session = createTestSession(20);
      const stats = service.getCompactionStats(session);

      expect(stats.messagesInMiddle).toBe(10);
    });

    it("should return zero messagesInMiddle when within limits", () => {
      const service = new CompactionService({
        keepFirstMessages: 5,
        keepLastMessages: 5,
      });

      const session = createTestSession(8); // 8 <= 5 + 5
      const stats = service.getCompactionStats(session);

      expect(stats.messagesInMiddle).toBe(0);
    });

    it("should handle empty session", () => {
      const service = new CompactionService();
      const session = createSession({
        title: "Empty",
        workingDirectory: "/test",
      });

      const stats = service.getCompactionStats(session);

      expect(stats.toolOutputBytes).toBe(0);
      expect(stats.potentialSavings).toBe(0);
      expect(stats.messagesInMiddle).toBe(0);
    });

    it("should handle non-string tool result content", () => {
      const service = new CompactionService();
      const session = createSession({
        title: "Test",
        workingDirectory: "/test",
      });

      session.messages.push({
        id: "tool-result-1",
        role: "tool_result",
        parts: [
          {
            type: "tool_result",
            toolId: "tool-1",
            content: { data: "value", nested: { a: 1, b: 2 } },
          },
        ],
        metadata: { createdAt: Date.now() },
      });

      const stats = service.getCompactionStats(session);

      // Should have serialized the JSON
      expect(stats.toolOutputBytes).toBeGreaterThan(0);
    });
  });

  describe("immutability", () => {
    it("should preserve message IDs", () => {
      const service = new CompactionService({
        keepFirstMessages: 2,
        keepLastMessages: 2,
      });
      const session = createTestSession(10);

      const { session: truncated } = service.truncateMiddle(session);

      // Check preserved message IDs
      expect(truncated.messages[0]?.id).toBe("msg-0");
      expect(truncated.messages[1]?.id).toBe("msg-1");
      expect(truncated.messages[3]?.id).toBe("msg-8");
      expect(truncated.messages[4]?.id).toBe("msg-9");
    });

    it("should preserve message timestamps", () => {
      const service = new CompactionService({ maxToolOutputLength: 100 });
      const session = createSessionWithToolResults([500]);
      const originalTimestamp = session.messages[0]?.metadata.createdAt;

      const { session: pruned } = service.pruneToolOutputs(session);

      expect(pruned.messages[0]?.metadata.createdAt).toBe(originalTimestamp);
    });

    it("should preserve checkpoints", () => {
      const service = new CompactionService();
      const session = createTestSession(5);
      session.checkpoints = [
        {
          id: "cp-1",
          sessionId: session.metadata.id,
          messageIndex: 2,
          createdAt: new Date(),
        },
      ];

      const { session: pruned } = service.pruneToolOutputs(session);

      expect(pruned.checkpoints).toHaveLength(1);
      expect(pruned.checkpoints[0]?.id).toBe("cp-1");
    });
  });

  describe("DEFAULT_COMPACTION_CONFIG", () => {
    it("should have correct default values", () => {
      expect(DEFAULT_COMPACTION_CONFIG.maxToolOutputLength).toBe(1000);
      expect(DEFAULT_COMPACTION_CONFIG.keepFirstMessages).toBe(5);
      expect(DEFAULT_COMPACTION_CONFIG.keepLastMessages).toBe(10);
      expect(DEFAULT_COMPACTION_CONFIG.prunedMarker).toBe("[工具输出已裁剪]");
      expect(DEFAULT_COMPACTION_CONFIG.truncatedMarker).toBe("[中间消息已省略: {count} 条]");
    });
  });
});
