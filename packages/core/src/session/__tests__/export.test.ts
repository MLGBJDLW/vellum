// ============================================
// Export Service Tests
// ============================================

import * as fs from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ExportFormat, ExportService } from "../export.js";
import { createAssistantMessage, createUserMessage, SessionParts } from "../message.js";
import { createSession, type Session } from "../types.js";

// Mock the fs module for exportToFile tests
vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual<typeof fs>("node:fs/promises");
  return {
    ...actual,
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
  };
});

// =============================================================================
// Test Fixtures
// =============================================================================

function createTestSession(): Session {
  const session = createSession({
    id: "550e8400-e29b-41d4-a716-446655440000",
    title: "Test Export Session",
    mode: "chat",
    workingDirectory: "/test/project",
    tags: ["test", "export"],
  });

  // Add some messages
  const userMsg = createUserMessage([SessionParts.text("Hello, can you help me with a task?")]);
  const assistantMsg = createAssistantMessage(
    [
      SessionParts.text("Of course! I'd be happy to help."),
      SessionParts.tool("tool-1", "read_file", { path: "/test/file.ts" }),
    ],
    { model: "claude-sonnet-4-20250514", tokens: { input: 10, output: 25 } }
  );
  const toolResultMsg = {
    id: "msg-3",
    role: "tool_result" as const,
    parts: [SessionParts.toolResult("tool-1", "file content here", false)],
    metadata: { createdAt: Date.now() },
  };

  session.messages.push(userMsg, assistantMsg, toolResultMsg);

  // Update metadata
  session.metadata.messageCount = 3;
  session.metadata.tokenCount = 100;
  session.metadata.summary = "A test conversation about exporting sessions";

  return session;
}

function createSessionWithAllPartTypes(): Session {
  const session = createSession({
    title: "Session with All Part Types",
  });

  // User message with text
  session.messages.push(
    createUserMessage([
      SessionParts.text("Here is a message with an image"),
      SessionParts.image("data:image/png;base64,abc123", "image/png"),
      SessionParts.file("https://example.com/file.pdf", "document.pdf", "application/pdf"),
    ])
  );

  // Assistant message with reasoning
  session.messages.push(
    createAssistantMessage([
      SessionParts.reasoning("Let me think about this..."),
      SessionParts.text("Here is my response."),
    ])
  );

  // Tool result with error
  session.messages.push({
    id: "msg-err",
    role: "tool_result" as const,
    parts: [SessionParts.toolResult("tool-err", "Error: File not found", true)],
    metadata: { createdAt: Date.now() },
  });

  session.metadata.messageCount = 3;
  return session;
}

// =============================================================================
// Export Service Tests
// =============================================================================

describe("ExportService", () => {
  let service: ExportService;
  let testSession: Session;

  beforeEach(() => {
    service = new ExportService();
    testSession = createTestSession();
  });

  // ===========================================================================
  // JSON Export Tests
  // ===========================================================================

  describe("JSON export", () => {
    it("should export session as pretty-printed JSON", () => {
      const result = service.export(testSession, { format: "json" });

      expect(result).toBeTypeOf("string");
      const parsed = JSON.parse(result);

      expect(parsed.metadata).toBeDefined();
      expect(parsed.metadata.id).toBe("550e8400-e29b-41d4-a716-446655440000");
      expect(parsed.metadata.title).toBe("Test Export Session");
      expect(parsed.messages).toHaveLength(3);
    });

    it("should exclude metadata when includeMetadata is false", () => {
      const result = service.export(testSession, {
        format: "json",
        includeMetadata: false,
      });

      const parsed = JSON.parse(result);
      expect(parsed.metadata).toBeUndefined();
      expect(parsed.messages).toBeDefined();
    });

    it("should exclude tool parts when includeToolOutputs is false", () => {
      const result = service.export(testSession, {
        format: "json",
        includeToolOutputs: false,
      });

      const parsed = JSON.parse(result);
      const assistantMsg = parsed.messages[1];

      // Should only have text part, not tool part
      expect(assistantMsg.parts).toHaveLength(1);
      expect(assistantMsg.parts[0].type).toBe("text");
    });

    it("should exclude timestamps when includeTimestamps is false", () => {
      const result = service.export(testSession, {
        format: "json",
        includeTimestamps: false,
      });

      const parsed = JSON.parse(result);
      expect(parsed.messages[0].metadata.createdAt).toBeUndefined();
    });

    it("should include checkpoints in JSON export", () => {
      testSession.checkpoints = [
        {
          id: "cp-1",
          sessionId: testSession.metadata.id,
          messageIndex: 0,
          createdAt: new Date(),
          description: "Test checkpoint",
        },
      ];

      const result = service.export(testSession, { format: "json" });
      const parsed = JSON.parse(result);

      expect(parsed.checkpoints).toBeDefined();
      expect(parsed.checkpoints).toHaveLength(1);
    });
  });

  // ===========================================================================
  // Markdown Export Tests
  // ===========================================================================

  describe("Markdown export", () => {
    it("should export session as Markdown", () => {
      const result = service.export(testSession, { format: "markdown" });

      expect(result).toContain("# Test Export Session");
      expect(result).toContain("## Session Info");
      expect(result).toContain("## Messages");
    });

    it("should include role emojis in Markdown", () => {
      const result = service.export(testSession, { format: "markdown" });

      expect(result).toContain("👤 User");
      expect(result).toContain("🤖 Assistant");
      expect(result).toContain("🔧 Tool");
    });

    it("should format tool calls in code blocks", () => {
      const result = service.export(testSession, { format: "markdown" });

      expect(result).toContain("**Tool Call:** `read_file`");
      expect(result).toContain("```json");
    });

    it("should include metadata table", () => {
      const result = service.export(testSession, { format: "markdown" });

      expect(result).toContain("| Property | Value |");
      expect(result).toContain("| **ID** |");
      expect(result).toContain("| **Status** | active |");
      expect(result).toContain("| **Mode** | chat |");
      expect(result).toContain("| **Tags** |");
    });

    it("should exclude metadata when includeMetadata is false", () => {
      const result = service.export(testSession, {
        format: "markdown",
        includeMetadata: false,
      });

      expect(result).not.toContain("## Session Info");
      expect(result).toContain("## Messages");
    });

    it("should include timestamps when enabled", () => {
      const result = service.export(testSession, {
        format: "markdown",
        includeTimestamps: true,
      });

      // Should contain time in HH:mm:ss format
      expect(result).toMatch(/\d{2}:\d{2}:\d{2}/);
    });

    it("should format reasoning in collapsible details", () => {
      const session = createSessionWithAllPartTypes();
      const result = service.export(session, { format: "markdown" });

      expect(result).toContain("<details>");
      expect(result).toContain("💭 Thinking...");
      expect(result).toContain("</details>");
    });

    it("should format file attachments", () => {
      const session = createSessionWithAllPartTypes();
      const result = service.export(session, { format: "markdown" });

      expect(result).toContain("📎 **File:**");
      expect(result).toContain("document.pdf");
    });

    it("should format images", () => {
      const session = createSessionWithAllPartTypes();
      const result = service.export(session, { format: "markdown" });

      expect(result).toContain("🖼️ **Image:**");
    });

    it("should show error indicator for failed tool results", () => {
      const session = createSessionWithAllPartTypes();
      const result = service.export(session, { format: "markdown" });

      expect(result).toContain("❌ **Error:**");
    });
  });

  // ===========================================================================
  // HTML Export Tests
  // ===========================================================================

  describe("HTML export", () => {
    it("should export session as complete HTML document", () => {
      const result = service.export(testSession, { format: "html" });

      expect(result).toContain("<!DOCTYPE html>");
      expect(result).toContain('<html lang="en">');
      expect(result).toContain("</html>");
      expect(result).toContain("<title>Test Export Session</title>");
    });

    it("should include inline CSS", () => {
      const result = service.export(testSession, { format: "html" });

      expect(result).toContain("<style>");
      expect(result).toContain(".message");
      expect(result).toContain(".container");
    });

    it("should include collapsible tool output script", () => {
      const result = service.export(testSession, { format: "html" });

      expect(result).toContain("<script>");
      expect(result).toContain("collapsible-header");
    });

    it("should apply role-based styling classes", () => {
      const result = service.export(testSession, { format: "html" });

      expect(result).toContain('class="message user"');
      expect(result).toContain('class="message assistant"');
      expect(result).toContain('class="message tool_result"');
    });

    it("should escape HTML entities", () => {
      const session = createSession({ title: "Test <script>alert(1)</script>" });
      session.messages.push(
        createUserMessage([SessionParts.text('Code: <div class="test">&</div>')])
      );

      const result = service.export(session, { format: "html" });

      expect(result).not.toContain("<script>alert(1)</script>");
      expect(result).toContain("&lt;script&gt;");
      expect(result).toContain("&lt;div");
      expect(result).toContain("&amp;");
    });

    it("should include metadata grid", () => {
      const result = service.export(testSession, { format: "html" });

      expect(result).toContain("metadata-grid");
      expect(result).toContain("metadata-item");
    });

    it("should render tool calls as collapsible sections", () => {
      const result = service.export(testSession, { format: "html" });

      expect(result).toContain("collapsible-header");
      expect(result).toContain("collapsible-content");
      expect(result).toContain("Tool Call:");
    });

    it("should render tags as styled spans", () => {
      const result = service.export(testSession, { format: "html" });

      expect(result).toContain('class="tag"');
      expect(result).toContain("test");
      expect(result).toContain("export");
    });

    it("should render error tool results with error class", () => {
      const session = createSessionWithAllPartTypes();
      const result = service.export(session, { format: "html" });

      expect(result).toContain('class="error"');
    });
  });

  // ===========================================================================
  // Text Export Tests
  // ===========================================================================

  describe("Text export", () => {
    it("should export session as plain text", () => {
      const result = service.export(testSession, { format: "text" });

      expect(result).toContain("Test Export Session");
      expect(result).toContain("SESSION INFO");
      expect(result).toContain("MESSAGES");
    });

    it("should use role prefixes", () => {
      const result = service.export(testSession, { format: "text" });

      expect(result).toContain("[User]");
      expect(result).toContain("[Assistant]");
      expect(result).toContain("[Tool]");
    });

    it("should include separators between messages", () => {
      const result = service.export(testSession, { format: "text" });

      expect(result).toContain("─".repeat(60));
    });

    it("should format metadata as key-value pairs", () => {
      const result = service.export(testSession, { format: "text" });

      expect(result).toContain("ID:");
      expect(result).toContain("Status:");
      expect(result).toContain("Mode:");
      expect(result).toContain("Messages:");
      expect(result).toContain("Tokens:");
    });

    it("should exclude metadata when includeMetadata is false", () => {
      const result = service.export(testSession, {
        format: "text",
        includeMetadata: false,
      });

      expect(result).not.toContain("SESSION INFO");
      expect(result).toContain("MESSAGES");
    });

    it("should format reasoning with prefix", () => {
      const session = createSessionWithAllPartTypes();
      const result = service.export(session, { format: "text" });

      expect(result).toContain("[Thinking]");
    });

    it("should format file attachments", () => {
      const session = createSessionWithAllPartTypes();
      const result = service.export(session, { format: "text" });

      expect(result).toContain("[File: document.pdf]");
    });

    it("should format images", () => {
      const session = createSessionWithAllPartTypes();
      const result = service.export(session, { format: "text" });

      expect(result).toContain("[Image:");
    });

    it("should show error prefix for failed tool results", () => {
      const session = createSessionWithAllPartTypes();
      const result = service.export(session, { format: "text" });

      expect(result).toContain("[Error]");
    });
  });

  // ===========================================================================
  // formatMessage Tests
  // ===========================================================================

  describe("formatMessage", () => {
    it("should format a single message as JSON", () => {
      const message = createUserMessage([SessionParts.text("Hello")]);
      const result = service.formatMessage(message, "json");

      const parsed = JSON.parse(result);
      expect(parsed.role).toBe("user");
      expect(parsed.parts[0].text).toBe("Hello");
    });

    it("should format a single message as Markdown", () => {
      const message = createUserMessage([SessionParts.text("Hello")]);
      const result = service.formatMessage(message, "markdown");

      expect(result).toContain("👤 User");
      expect(result).toContain("Hello");
    });

    it("should format a single message as HTML", () => {
      const message = createUserMessage([SessionParts.text("Hello")]);
      const result = service.formatMessage(message, "html");

      expect(result).toContain('class="message user"');
      expect(result).toContain("Hello");
    });

    it("should format a single message as text", () => {
      const message = createUserMessage([SessionParts.text("Hello")]);
      const result = service.formatMessage(message, "text");

      expect(result).toContain("[User]");
      expect(result).toContain("Hello");
    });

    it("should respect options when formatting single message", () => {
      const message = createAssistantMessage([
        SessionParts.text("Response"),
        SessionParts.tool("t1", "some_tool", { arg: "value" }),
      ]);

      const result = service.formatMessage(message, "markdown", {
        includeToolOutputs: false,
      });

      expect(result).toContain("Response");
      expect(result).not.toContain("some_tool");
    });
  });

  // ===========================================================================
  // exportToFile Tests
  // ===========================================================================

  describe("exportToFile", () => {
    const testDir = "/tmp/export-test";
    const testFile = `${testDir}/session.json`;

    beforeEach(() => {
      vi.mocked(fs.mkdir).mockClear();
      vi.mocked(fs.writeFile).mockClear();
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    it("should create directory if not exists", async () => {
      await service.exportToFile(testSession, { format: "json" }, testFile);

      expect(fs.mkdir).toHaveBeenCalledWith(testDir, { recursive: true });
    });

    it("should write exported content to file", async () => {
      await service.exportToFile(testSession, { format: "json" }, testFile);

      expect(fs.writeFile).toHaveBeenCalledWith(testFile, expect.any(String), "utf-8");

      // Verify the content is valid JSON
      const calls = vi.mocked(fs.writeFile).mock.calls[0];
      const content = calls?.[1] as string | undefined;
      expect(content).toBeDefined();
      // biome-ignore lint/style/noNonNullAssertion: content verified as defined above
      expect(() => JSON.parse(content!)).not.toThrow();
    });

    it("should export to different formats", async () => {
      const formats: ExportFormat[] = ["json", "markdown", "html", "text"];

      for (const format of formats) {
        const filePath = `${testDir}/session.${format}`;
        await service.exportToFile(testSession, { format }, filePath);

        expect(fs.writeFile).toHaveBeenCalledWith(filePath, expect.any(String), "utf-8");
      }
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe("edge cases", () => {
    it("should handle empty session", () => {
      const emptySession = createSession({ title: "Empty Session" });

      const formats: ExportFormat[] = ["json", "markdown", "html", "text"];
      for (const format of formats) {
        const result = service.export(emptySession, { format });
        expect(result).toBeTruthy();
      }
    });

    it("should handle session with no tags", () => {
      testSession.metadata.tags = [];

      const mdResult = service.export(testSession, { format: "markdown" });
      const htmlResult = service.export(testSession, { format: "html" });
      const textResult = service.export(testSession, { format: "text" });

      expect(mdResult).not.toContain("**Tags**");
      expect(textResult).not.toContain("Tags:");
      // HTML should still render without errors
      expect(htmlResult).toContain("<!DOCTYPE html>");
    });

    it("should handle session with no summary", () => {
      testSession.metadata.summary = undefined;

      const result = service.export(testSession, { format: "markdown" });
      expect(result).not.toContain("**Summary**");
    });

    it("should truncate long tool outputs", () => {
      const longContent = "x".repeat(2000);
      const session = createSession({ title: "Long Output" });
      session.messages.push({
        id: "msg-long",
        role: "tool_result",
        parts: [SessionParts.toolResult("t1", longContent, false)],
        metadata: { createdAt: Date.now() },
      });

      const mdResult = service.export(session, { format: "markdown" });
      const htmlResult = service.export(session, { format: "html" });
      const textResult = service.export(session, { format: "text" });

      expect(mdResult).toContain("[truncated]");
      expect(htmlResult).toContain("[truncated]");
      expect(textResult).toContain("[truncated]");
    });

    it("should handle tool result with object content", () => {
      const session = createSession({ title: "Object Result" });
      session.messages.push({
        id: "msg-obj",
        role: "tool_result",
        parts: [SessionParts.toolResult("t1", { key: "value", nested: { a: 1 } }, false)],
        metadata: { createdAt: Date.now() },
      });

      const result = service.export(session, { format: "json" });
      const parsed = JSON.parse(result);

      expect(parsed.messages[0].parts[0].content).toEqual({ key: "value", nested: { a: 1 } });
    });

    it("should throw for unsupported format", () => {
      expect(() => {
        // @ts-expect-error Testing invalid format
        service.export(testSession, { format: "pdf" });
      }).toThrow("Unsupported export format: pdf");
    });

    it("should handle special characters in content", () => {
      const session = createSession({ title: "Special Chars: <>&\"'" });
      session.messages.push(
        createUserMessage([SessionParts.text("Test: <script> & \"quotes\" 'apostrophe'")])
      );

      const htmlResult = service.export(session, { format: "html" });

      // Should escape all HTML entities
      expect(htmlResult).toContain("&lt;script&gt;");
      expect(htmlResult).toContain("&amp;");
      expect(htmlResult).toContain("&quot;");
      expect(htmlResult).toContain("&#039;");
    });
  });
});
