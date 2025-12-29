/**
 * Tests for browser tool (Playwright integration)
 *
 * @module builtin/__tests__/browser.test
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "../../types/tool.js";
import { browserTool, cleanupBrowser } from "../browser.js";

// Mock playwright module
vi.mock("playwright", () => {
  return {
    default: null, // Force playwright to be "not installed" by default
  };
});

describe("browserTool", () => {
  const mockContext: ToolContext = {
    workingDir: "/test/workspace",
    sessionId: "test-session",
    messageId: "test-message",
    callId: "test-call",
    abortSignal: new AbortController().signal,
    checkPermission: vi.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    // Clean up any browser state between tests
    await cleanupBrowser();
  });

  describe("definition", () => {
    it("should have correct name", () => {
      expect(browserTool.definition.name).toBe("browser");
    });

    it("should have correct kind", () => {
      expect(browserTool.definition.kind).toBe("agent");
    });

    it("should have description", () => {
      expect(browserTool.definition.description).toBeTruthy();
    });

    it("should have correct category", () => {
      expect(browserTool.definition.category).toBe("browser");
    });
  });

  describe("execute - Playwright not installed", () => {
    it("should return graceful error when Playwright is not installed or browsers not available", async () => {
      const result = await browserTool.execute(
        { action: "navigate", url: "https://example.com", fullPage: false, timeout: 5000 },
        mockContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        // Either Playwright is not installed, or browsers are not available
        expect(
          result.error.includes("Playwright is not installed") ||
            result.error.includes("Failed to initialize browser")
        ).toBe(true);
      }
    });
  });

  describe("execute - action validation", () => {
    it("should fail navigate without URL", async () => {
      // Mock playwright to be available
      vi.doMock("playwright", () => ({
        chromium: {
          launch: vi.fn().mockResolvedValue({
            newPage: vi.fn().mockResolvedValue({
              setDefaultTimeout: vi.fn(),
              goto: vi.fn(),
              url: vi.fn().mockReturnValue("https://example.com"),
              title: vi.fn().mockResolvedValue("Example"),
              close: vi.fn(),
            }),
            close: vi.fn(),
          }),
        },
      }));

      // Even with Playwright mocked, without URL validation will fail
      const result = await browserTool.execute(
        { action: "navigate", fullPage: false, timeout: 5000 },
        mockContext
      );

      // Should fail either due to Playwright not installed or missing URL
      expect(result.success).toBe(false);
    });

    it("should fail click without selector", async () => {
      const result = await browserTool.execute(
        { action: "click", fullPage: false, timeout: 5000 },
        mockContext
      );

      expect(result.success).toBe(false);
    });

    it("should fail type without selector", async () => {
      const result = await browserTool.execute(
        { action: "type", text: "hello", fullPage: false, timeout: 5000 },
        mockContext
      );

      expect(result.success).toBe(false);
    });

    it("should fail type without text", async () => {
      const result = await browserTool.execute(
        { action: "type", selector: "input", fullPage: false, timeout: 5000 },
        mockContext
      );

      expect(result.success).toBe(false);
    });

    it("should fail evaluate without script", async () => {
      const result = await browserTool.execute(
        { action: "evaluate", fullPage: false, timeout: 5000 },
        mockContext
      );

      expect(result.success).toBe(false);
    });
  });

  describe("execute - close action", () => {
    it("should successfully close browser (even if not open)", async () => {
      const result = await browserTool.execute(
        { action: "close", fullPage: false, timeout: 5000 },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.action).toBe("close");
        expect(result.output.success).toBe(true);
      }
    });
  });

  describe("execute - permission denied", () => {
    it("should fail when permission denied", async () => {
      vi.mocked(mockContext.checkPermission).mockResolvedValueOnce(false);

      const result = await browserTool.execute(
        { action: "navigate", url: "https://example.com", fullPage: false, timeout: 5000 },
        mockContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Permission denied");
      }
    });
  });

  describe("execute - cancellation", () => {
    it("should fail when aborted", async () => {
      const abortController = new AbortController();
      abortController.abort();

      const result = await browserTool.execute(
        { action: "navigate", url: "https://example.com", fullPage: false, timeout: 5000 },
        { ...mockContext, abortSignal: abortController.signal }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("cancelled");
      }
    });
  });

  describe("shouldConfirm", () => {
    it("should require confirmation for navigate", () => {
      expect(
        browserTool.shouldConfirm?.(
          { action: "navigate", url: "https://example.com", fullPage: false, timeout: 5000 },
          mockContext
        )
      ).toBe(true);
    });

    it("should require confirmation for click", () => {
      expect(
        browserTool.shouldConfirm?.(
          { action: "click", selector: "button", fullPage: false, timeout: 5000 },
          mockContext
        )
      ).toBe(true);
    });

    it("should require confirmation for screenshot", () => {
      expect(
        browserTool.shouldConfirm?.(
          { action: "screenshot", fullPage: false, timeout: 5000 },
          mockContext
        )
      ).toBe(true);
    });

    it("should not require confirmation for close", () => {
      expect(
        browserTool.shouldConfirm?.(
          { action: "close", fullPage: false, timeout: 5000 },
          mockContext
        )
      ).toBe(false);
    });
  });
});

describe("browserTool - with mocked Playwright", () => {
  // These tests verify the schema validation logic.
  // Full Playwright integration tests would require more sophisticated mocking.

  describe("action types", () => {
    it("should handle navigate action type", () => {
      const schema = browserTool.definition.parameters;
      const result = schema.safeParse({
        action: "navigate",
        url: "https://example.com",
      });
      expect(result.success).toBe(true);
    });

    it("should handle screenshot action type", () => {
      const schema = browserTool.definition.parameters;
      const result = schema.safeParse({
        action: "screenshot",
        fullPage: true,
      });
      expect(result.success).toBe(true);
    });

    it("should handle click action type", () => {
      const schema = browserTool.definition.parameters;
      const result = schema.safeParse({
        action: "click",
        selector: "button.submit",
      });
      expect(result.success).toBe(true);
    });

    it("should handle type action type", () => {
      const schema = browserTool.definition.parameters;
      const result = schema.safeParse({
        action: "type",
        selector: "input[name='email']",
        text: "test@example.com",
      });
      expect(result.success).toBe(true);
    });

    it("should handle evaluate action type", () => {
      const schema = browserTool.definition.parameters;
      const result = schema.safeParse({
        action: "evaluate",
        script: "document.title",
      });
      expect(result.success).toBe(true);
    });

    it("should handle close action type", () => {
      const schema = browserTool.definition.parameters;
      const result = schema.safeParse({
        action: "close",
      });
      expect(result.success).toBe(true);
    });

    it("should reject invalid action type", () => {
      const schema = browserTool.definition.parameters;
      const result = schema.safeParse({
        action: "invalid",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("parameter validation", () => {
    it("should require valid URL format for navigate", () => {
      const schema = browserTool.definition.parameters;
      const result = schema.safeParse({
        action: "navigate",
        url: "not-a-valid-url",
      });
      expect(result.success).toBe(false);
    });

    it("should allow timeout parameter", () => {
      const schema = browserTool.definition.parameters;
      const result = schema.safeParse({
        action: "navigate",
        url: "https://example.com",
        timeout: 60000,
      });
      expect(result.success).toBe(true);
    });

    it("should reject negative timeout", () => {
      const schema = browserTool.definition.parameters;
      const result = schema.safeParse({
        action: "navigate",
        url: "https://example.com",
        timeout: -1000,
      });
      expect(result.success).toBe(false);
    });
  });
});
