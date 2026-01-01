// ============================================
// SessionSummaryService Tests
// ============================================

import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionParts } from "../message.js";
import { DEFAULT_SUMMARY_CONFIG, SessionSummaryService, type SummaryConfig } from "../summary.js";
import { createSession } from "../types.js";

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Creates a test session with messages.
 */
function createTestSession(messageCount: number, options?: { summary?: string; title?: string }) {
  const session = createSession({
    title: options?.title ?? "New Session",
    workingDirectory: "/test",
  });

  // Add messages
  for (let i = 0; i < messageCount; i++) {
    const role = i % 2 === 0 ? "user" : "assistant";
    session.messages.push({
      id: `msg-${i}`,
      role: role as "user" | "assistant",
      parts: [SessionParts.text(`Test message ${i}`)],
      metadata: { createdAt: Date.now() },
    });
  }

  // Update message count
  session.metadata.messageCount = messageCount;

  // Add summary if provided
  if (options?.summary) {
    session.metadata.summary = options.summary;
  }

  return session;
}

/**
 * Creates a session with tool calls.
 */
function createSessionWithTools() {
  const session = createSession({
    title: "New Session",
    workingDirectory: "/test",
  });

  session.messages.push({
    id: "msg-1",
    role: "user",
    parts: [SessionParts.text("Please help me with file operations")],
    metadata: { createdAt: Date.now() },
  });

  session.messages.push({
    id: "msg-2",
    role: "assistant",
    parts: [
      SessionParts.text("I'll help you with that."),
      SessionParts.tool("tool-1", "read_file", { path: "/test.ts" }),
      SessionParts.tool("tool-2", "write_file", { path: "/output.ts", content: "test" }),
    ],
    metadata: { createdAt: Date.now() },
  });

  session.messages.push({
    id: "msg-3",
    role: "tool_result",
    parts: [SessionParts.toolResult("tool-1", "file contents here")],
    metadata: { createdAt: Date.now() },
  });

  session.metadata.messageCount = 3;
  return session;
}

// =============================================================================
// Tests
// =============================================================================

describe("SessionSummaryService", () => {
  describe("constructor", () => {
    it("should use default config when no options provided", () => {
      const service = new SessionSummaryService();
      // Verify defaults are applied by checking behavior
      const session = createTestSession(5);
      expect(service.shouldGenerateSummary(session)).toBe(false); // < minMessagesForSummary (10)
    });

    it("should merge partial config with defaults", () => {
      const service = new SessionSummaryService({ minMessagesForSummary: 5 });
      const session = createTestSession(5);
      expect(service.shouldGenerateSummary(session)).toBe(true); // = custom minMessagesForSummary
    });

    it("should accept full custom config", () => {
      const customConfig: SummaryConfig = {
        maxMessages: 10,
        minMessagesForSummary: 3,
        autoUpdateTitle: false,
      };
      const service = new SessionSummaryService(customConfig);
      const session = createTestSession(3);
      expect(service.shouldGenerateSummary(session)).toBe(true);
    });
  });

  describe("shouldGenerateSummary", () => {
    let service: SessionSummaryService;

    beforeEach(() => {
      service = new SessionSummaryService();
    });

    it("should return false for sessions below threshold", () => {
      const session = createTestSession(5);
      expect(service.shouldGenerateSummary(session)).toBe(false);
    });

    it("should return true when messages >= minMessagesForSummary and no summary", () => {
      const session = createTestSession(10);
      expect(service.shouldGenerateSummary(session)).toBe(true);
    });

    it("should return false when summary already exists and not enough new messages", () => {
      const session = createTestSession(10, { summary: "Existing summary" });
      expect(service.shouldGenerateSummary(session)).toBe(false);
    });

    it("should return true when summary exists but messages increased significantly", () => {
      const session = createTestSession(20, { summary: "Existing summary" });
      expect(service.shouldGenerateSummary(session)).toBe(true);
    });

    it("should return false for empty sessions", () => {
      const session = createTestSession(0);
      expect(service.shouldGenerateSummary(session)).toBe(false);
    });
  });

  describe("generateSummary", () => {
    let service: SessionSummaryService;

    beforeEach(() => {
      service = new SessionSummaryService();
    });

    it("should handle empty sessions gracefully", async () => {
      const session = createTestSession(0);
      const summary = await service.generateSummary(session);
      expect(summary).toBe("Empty session with no messages.");
    });

    it("should generate rule-based summary without LLM", async () => {
      const session = createTestSession(5);
      const summary = await service.generateSummary(session);
      expect(summary).toContain("User intent:");
      expect(summary).toContain("Messages: 5");
    });

    it("should include tools used in summary", async () => {
      const session = createSessionWithTools();
      const summary = await service.generateSummary(session);
      expect(summary).toContain("Tools used:");
      expect(summary).toContain("read_file");
      expect(summary).toContain("write_file");
    });

    it("should use LLM when provided", async () => {
      const session = createTestSession(5);
      const mockLLM = vi.fn().mockResolvedValue("LLM generated summary");

      const summary = await service.generateSummary(session, mockLLM);

      expect(mockLLM).toHaveBeenCalled();
      expect(summary).toBe("LLM generated summary");
    });

    it("should fall back to rule-based on LLM failure", async () => {
      const session = createTestSession(5);
      const mockLLM = vi.fn().mockRejectedValue(new Error("LLM error"));

      const summary = await service.generateSummary(session, mockLLM);

      expect(mockLLM).toHaveBeenCalled();
      expect(summary).toContain("User intent:");
    });

    it("should truncate summary to max 500 characters", async () => {
      const session = createTestSession(5);
      const longSummary = "A".repeat(600);
      const mockLLM = vi.fn().mockResolvedValue(longSummary);

      const summary = await service.generateSummary(session, mockLLM);

      expect(summary.length).toBeLessThanOrEqual(500);
    });

    it("should use sliding window for many messages", async () => {
      const service = new SessionSummaryService({ maxMessages: 5 });
      const session = createTestSession(10);

      const summary = await service.generateSummary(session);

      // Should only process last 5 messages
      expect(summary).toContain("Messages: 5");
    });
  });

  describe("applySummary", () => {
    let service: SessionSummaryService;

    beforeEach(() => {
      service = new SessionSummaryService();
    });

    it("should update session metadata with summary", () => {
      const session = createTestSession(5);
      const summary = "Test summary content";

      const updated = service.applySummary(session, summary);

      expect(updated.metadata.summary).toBe(summary);
      expect(updated.metadata.updatedAt).toBeInstanceOf(Date);
    });

    it("should truncate long summaries", () => {
      const session = createTestSession(5);
      const longSummary = "A".repeat(600);

      const updated = service.applySummary(session, longSummary);

      expect(updated.metadata.summary?.length).toBe(500);
    });

    it("should auto-update title from summary when enabled", () => {
      const session = createTestSession(5, { title: "New Session" });
      const summary =
        "Building a REST API with authentication. This involves setting up endpoints.";

      const updated = service.applySummary(session, summary);

      expect(updated.metadata.title).toBe("Building a REST API with authentication");
    });

    it("should not update title when autoUpdateTitle is disabled", () => {
      const service = new SessionSummaryService({ autoUpdateTitle: false });
      const session = createTestSession(5, { title: "New Session" });
      const summary = "Building a REST API with authentication.";

      const updated = service.applySummary(session, summary);

      expect(updated.metadata.title).toBe("New Session");
    });

    it("should not update non-default titles", () => {
      const session = createTestSession(5, { title: "My Custom Title" });
      const summary = "Building a REST API.";

      const updated = service.applySummary(session, summary);

      expect(updated.metadata.title).toBe("My Custom Title");
    });

    it("should not mutate original session", () => {
      const session = createTestSession(5);
      const originalTitle = session.metadata.title;

      service.applySummary(session, "New summary");

      expect(session.metadata.title).toBe(originalTitle);
      expect(session.metadata.summary).toBeUndefined();
    });
  });

  describe("extractTitle", () => {
    let service: SessionSummaryService;

    beforeEach(() => {
      service = new SessionSummaryService();
    });

    it("should extract first sentence as title", () => {
      const summary = "Building a REST API. This involves setting up endpoints and authentication.";
      const title = service.extractTitle(summary);
      expect(title).toBe("Building a REST API");
    });

    it("should handle exclamation and question marks", () => {
      const summary = "Help with debugging! The code has errors.";
      const title = service.extractTitle(summary);
      expect(title).toBe("Help with debugging");
    });

    it("should truncate long first sentences", () => {
      const summary =
        "This is a very long first sentence that exceeds the maximum title length allowed for session titles. More content here.";
      const title = service.extractTitle(summary);
      expect(title.length).toBeLessThanOrEqual(50);
      expect(title).toContain("...");
    });

    it("should use shorter phrase if available", () => {
      const summary = "Building APIs: A comprehensive guide to REST and GraphQL development.";
      const title = service.extractTitle(summary);
      expect(title).toBe("Building APIs");
    });

    it("should handle empty summary", () => {
      const title = service.extractTitle("");
      expect(title).toBe("");
    });

    it("should handle whitespace-only summary", () => {
      const title = service.extractTitle("   ");
      expect(title).toBe("");
    });

    it("should clean up leading/trailing punctuation", () => {
      const summary = "- Building an API.";
      const title = service.extractTitle(summary);
      expect(title).toBe("Building an API");
    });
  });

  describe("DEFAULT_SUMMARY_CONFIG", () => {
    it("should have expected default values", () => {
      expect(DEFAULT_SUMMARY_CONFIG).toEqual({
        maxMessages: 20,
        minMessagesForSummary: 10,
        autoUpdateTitle: true,
      });
    });
  });
});
