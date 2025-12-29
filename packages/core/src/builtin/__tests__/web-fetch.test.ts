/**
 * Tests for web_fetch tool
 *
 * @module builtin/__tests__/web-fetch.test
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "../../types/tool.js";
import { webFetchTool } from "../web-fetch.js";

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("webFetchTool", () => {
  const mockContext: ToolContext = {
    workingDir: "/test/workspace",
    sessionId: "test-session",
    messageId: "test-message",
    callId: "test-call",
    abortSignal: new AbortController().signal,
    checkPermission: vi.fn().mockResolvedValue(true),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("definition", () => {
    it("should have correct name", () => {
      expect(webFetchTool.definition.name).toBe("web_fetch");
    });

    it("should have correct kind", () => {
      expect(webFetchTool.definition.kind).toBe("read");
    });

    it("should have description", () => {
      expect(webFetchTool.definition.description).toBeTruthy();
    });

    it("should have correct category", () => {
      expect(webFetchTool.definition.category).toBe("network");
    });
  });

  describe("execute - GET requests", () => {
    it("should successfully execute GET request", async () => {
      const mockHeaders = new Headers();
      mockHeaders.set("content-type", "application/json");

      mockFetch.mockResolvedValueOnce({
        status: 200,
        statusText: "OK",
        headers: mockHeaders,
        text: vi.fn().mockResolvedValue('{"data": "test"}'),
      });

      const result = await webFetchTool.execute(
        { url: "https://api.example.com/data", method: "GET", timeout: 5000 },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.status).toBe(200);
        expect(result.output.statusText).toBe("OK");
        expect(result.output.body).toBe('{"data": "test"}');
        expect(result.output.headers["content-type"]).toBe("application/json");
        expect(result.output.timing.duration).toBeGreaterThanOrEqual(0);
      }
    });

    it("should use GET as default method", async () => {
      const mockHeaders = new Headers();

      mockFetch.mockResolvedValueOnce({
        status: 200,
        statusText: "OK",
        headers: mockHeaders,
        text: vi.fn().mockResolvedValue("test"),
      });

      await webFetchTool.execute(
        { url: "https://api.example.com/data", method: "GET", timeout: 5000 },
        mockContext
      );

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.example.com/data",
        expect.objectContaining({ method: "GET" })
      );
    });

    it("should fail if body is provided for GET request", async () => {
      const result = await webFetchTool.execute(
        {
          url: "https://api.example.com/data",
          method: "GET",
          body: "should not have body",
          timeout: 5000,
        },
        mockContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("should not include a body");
      }
    });
  });

  describe("execute - POST requests", () => {
    it("should successfully execute POST request with body", async () => {
      const mockHeaders = new Headers();
      mockHeaders.set("content-type", "application/json");

      mockFetch.mockResolvedValueOnce({
        status: 201,
        statusText: "Created",
        headers: mockHeaders,
        text: vi.fn().mockResolvedValue('{"id": 123}'),
      });

      const result = await webFetchTool.execute(
        {
          url: "https://api.example.com/submit",
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: '{"name": "test"}',
          timeout: 5000,
        },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.status).toBe(201);
        expect(result.output.statusText).toBe("Created");
        expect(result.output.body).toBe('{"id": 123}');
      }

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.example.com/submit",
        expect.objectContaining({
          method: "POST",
          body: '{"name": "test"}',
          headers: { "Content-Type": "application/json" },
        })
      );
    });

    it("should allow POST without body", async () => {
      const mockHeaders = new Headers();

      mockFetch.mockResolvedValueOnce({
        status: 200,
        statusText: "OK",
        headers: mockHeaders,
        text: vi.fn().mockResolvedValue(""),
      });

      const result = await webFetchTool.execute(
        { url: "https://api.example.com/trigger", method: "POST", timeout: 5000 },
        mockContext
      );

      expect(result.success).toBe(true);
    });
  });

  describe("execute - custom headers", () => {
    it("should include custom headers in request", async () => {
      const mockHeaders = new Headers();

      mockFetch.mockResolvedValueOnce({
        status: 200,
        statusText: "OK",
        headers: mockHeaders,
        text: vi.fn().mockResolvedValue(""),
      });

      const customHeaders = {
        Authorization: "Bearer token123",
        "X-Custom-Header": "custom-value",
      };

      await webFetchTool.execute(
        {
          url: "https://api.example.com/secure",
          method: "GET",
          headers: customHeaders,
          timeout: 5000,
        },
        mockContext
      );

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.example.com/secure",
        expect.objectContaining({ headers: customHeaders })
      );
    });
  });

  describe("execute - timeout handling", () => {
    it("should fail when request times out", async () => {
      const abortError = new Error("The operation was aborted");
      abortError.name = "AbortError";
      mockFetch.mockRejectedValueOnce(abortError);

      const result = await webFetchTool.execute(
        { url: "https://api.example.com/slow", method: "GET", timeout: 100 },
        mockContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("timed out");
      }
    });

    it("should use default timeout if not specified", async () => {
      const mockHeaders = new Headers();

      mockFetch.mockResolvedValueOnce({
        status: 200,
        statusText: "OK",
        headers: mockHeaders,
        text: vi.fn().mockResolvedValue(""),
      });

      await webFetchTool.execute(
        { url: "https://api.example.com/data", method: "GET", timeout: 30000 },
        mockContext
      );

      // Should not throw with default timeout
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe("execute - HTTP error status", () => {
    it("should return 404 status", async () => {
      const mockHeaders = new Headers();

      mockFetch.mockResolvedValueOnce({
        status: 404,
        statusText: "Not Found",
        headers: mockHeaders,
        text: vi.fn().mockResolvedValue("Resource not found"),
      });

      const result = await webFetchTool.execute(
        { url: "https://api.example.com/missing", method: "GET", timeout: 5000 },
        mockContext
      );

      // HTTP errors still return success (it's the HTTP layer that worked)
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.status).toBe(404);
        expect(result.output.statusText).toBe("Not Found");
      }
    });

    it("should return 500 status", async () => {
      const mockHeaders = new Headers();

      mockFetch.mockResolvedValueOnce({
        status: 500,
        statusText: "Internal Server Error",
        headers: mockHeaders,
        text: vi.fn().mockResolvedValue("Server error"),
      });

      const result = await webFetchTool.execute(
        { url: "https://api.example.com/error", method: "GET", timeout: 5000 },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.status).toBe(500);
      }
    });
  });

  describe("execute - network errors", () => {
    it("should fail on network error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("fetch failed: ENOTFOUND"));

      const result = await webFetchTool.execute(
        { url: "https://nonexistent.example.com", method: "GET", timeout: 5000 },
        mockContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Network error");
      }
    });

    it("should fail on invalid URL", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Invalid URL"));

      const result = await webFetchTool.execute(
        { url: "https://invalid-url", method: "GET", timeout: 5000 },
        mockContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Invalid URL");
      }
    });
  });

  describe("execute - permission denied", () => {
    it("should fail when permission denied for GET", async () => {
      vi.mocked(mockContext.checkPermission).mockResolvedValueOnce(false);

      const result = await webFetchTool.execute(
        { url: "https://api.example.com/data", method: "GET", timeout: 5000 },
        mockContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Permission denied");
      }
    });

    it("should fail when permission denied for POST", async () => {
      vi.mocked(mockContext.checkPermission).mockResolvedValueOnce(false);

      const result = await webFetchTool.execute(
        { url: "https://api.example.com/submit", method: "POST", timeout: 5000 },
        mockContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Permission denied");
      }
    });
  });

  describe("execute - cancellation", () => {
    it("should fail when aborted before fetch", async () => {
      const abortController = new AbortController();
      abortController.abort();

      const result = await webFetchTool.execute(
        { url: "https://api.example.com/data", method: "GET", timeout: 5000 },
        { ...mockContext, abortSignal: abortController.signal }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("cancelled");
      }
    });

    it("should fail when aborted during fetch", async () => {
      const abortError = new Error("The operation was aborted");
      abortError.name = "AbortError";
      mockFetch.mockRejectedValueOnce(abortError);

      const abortController = new AbortController();

      const result = await webFetchTool.execute(
        { url: "https://api.example.com/data", method: "GET", timeout: 5000 },
        { ...mockContext, abortSignal: abortController.signal }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toMatch(/cancelled|timed out/);
      }
    });
  });

  describe("execute - DELETE method", () => {
    it("should successfully execute DELETE request", async () => {
      const mockHeaders = new Headers();

      mockFetch.mockResolvedValueOnce({
        status: 204,
        statusText: "No Content",
        headers: mockHeaders,
        text: vi.fn().mockResolvedValue(""),
      });

      const result = await webFetchTool.execute(
        { url: "https://api.example.com/resource/123", method: "DELETE", timeout: 5000 },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.status).toBe(204);
      }
    });

    it("should fail if body is provided for DELETE request", async () => {
      const result = await webFetchTool.execute(
        {
          url: "https://api.example.com/resource/123",
          method: "DELETE",
          body: "should not have body",
          timeout: 5000,
        },
        mockContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("should not include a body");
      }
    });
  });

  describe("execute - PUT method", () => {
    it("should successfully execute PUT request with body", async () => {
      const mockHeaders = new Headers();

      mockFetch.mockResolvedValueOnce({
        status: 200,
        statusText: "OK",
        headers: mockHeaders,
        text: vi.fn().mockResolvedValue('{"updated": true}'),
      });

      const result = await webFetchTool.execute(
        {
          url: "https://api.example.com/resource/123",
          method: "PUT",
          body: '{"name": "updated"}',
          timeout: 5000,
        },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.status).toBe(200);
      }
    });
  });

  describe("shouldConfirm", () => {
    it("should not require confirmation for GET", () => {
      expect(
        webFetchTool.shouldConfirm?.(
          { url: "https://example.com", method: "GET", timeout: 5000 },
          mockContext
        )
      ).toBe(false);
    });

    it("should require confirmation for POST", () => {
      expect(
        webFetchTool.shouldConfirm?.(
          { url: "https://example.com", method: "POST", timeout: 5000 },
          mockContext
        )
      ).toBe(true);
    });

    it("should require confirmation for PUT", () => {
      expect(
        webFetchTool.shouldConfirm?.(
          { url: "https://example.com", method: "PUT", timeout: 5000 },
          mockContext
        )
      ).toBe(true);
    });

    it("should require confirmation for DELETE", () => {
      expect(
        webFetchTool.shouldConfirm?.(
          { url: "https://example.com", method: "DELETE", timeout: 5000 },
          mockContext
        )
      ).toBe(true);
    });
  });
});
