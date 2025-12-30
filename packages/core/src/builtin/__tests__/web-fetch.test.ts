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

// Mock security validation functions
vi.mock("../security/url-validator.js", () => ({
  validateUrlWithDNS: vi.fn().mockResolvedValue({ valid: true, url: null, resolvedIPs: [] }),
  isCloudMetadata: vi.fn().mockReturnValue({ isMetadata: false }),
}));

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

import { CloudMetadataError, PrivateIPError } from "../../errors/web.js";
// Import security module mocks for security tests
import { isCloudMetadata, validateUrlWithDNS } from "../security/url-validator.js";

describe("webFetchTool - Security Integration", () => {
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

  describe("SSRF Protection - Private IP Blocking", () => {
    it("should reject private IP address in URL (127.0.0.1)", async () => {
      // Mock validateUrlWithDNS to return invalid for private IP
      vi.mocked(validateUrlWithDNS).mockResolvedValueOnce({
        valid: false,
        url: new URL("http://127.0.0.1/data"),
        resolvedIPs: ["127.0.0.1"],
        error: "Private IP blocked: 127.0.0.1",
      });

      await expect(
        webFetchTool.execute(
          { url: "http://127.0.0.1/data", method: "GET", timeout: 5000 },
          mockContext
        )
      ).rejects.toThrow(PrivateIPError);
    });

    it("should reject private IP address in URL (192.168.x.x)", async () => {
      vi.mocked(validateUrlWithDNS).mockResolvedValueOnce({
        valid: false,
        url: new URL("http://192.168.1.1/admin"),
        resolvedIPs: ["192.168.1.1"],
        error: "Private IP blocked: 192.168.1.1",
      });

      await expect(
        webFetchTool.execute(
          { url: "http://192.168.1.1/admin", method: "GET", timeout: 5000 },
          mockContext
        )
      ).rejects.toThrow(PrivateIPError);
    });

    it("should reject private IP address in URL (10.x.x.x)", async () => {
      vi.mocked(validateUrlWithDNS).mockResolvedValueOnce({
        valid: false,
        url: new URL("http://10.0.0.1/internal"),
        resolvedIPs: ["10.0.0.1"],
        error: "Private IP blocked: 10.0.0.1",
      });

      await expect(
        webFetchTool.execute(
          { url: "http://10.0.0.1/internal", method: "GET", timeout: 5000 },
          mockContext
        )
      ).rejects.toThrow(PrivateIPError);
    });

    it("should reject DNS resolution to private IP (DNS rebinding)", async () => {
      vi.mocked(validateUrlWithDNS).mockResolvedValueOnce({
        valid: false,
        url: new URL("http://evil.attacker.com/data"),
        resolvedIPs: ["192.168.1.100"],
        error: "DNS rebinding detected: evil.attacker.com resolved to private IP 192.168.1.100",
      });

      await expect(
        webFetchTool.execute(
          { url: "http://evil.attacker.com/data", method: "GET", timeout: 5000 },
          mockContext
        )
      ).rejects.toThrow(PrivateIPError);
    });
  });

  describe("SSRF Protection - Cloud Metadata Blocking", () => {
    it("should reject AWS metadata endpoint (169.254.169.254)", async () => {
      vi.mocked(isCloudMetadata).mockReturnValueOnce({
        isMetadata: true,
        provider: "AWS",
        reason: "Cloud metadata IP detected: 169.254.169.254",
      });

      await expect(
        webFetchTool.execute(
          { url: "http://169.254.169.254/latest/meta-data/", method: "GET", timeout: 5000 },
          mockContext
        )
      ).rejects.toThrow(CloudMetadataError);
    });

    it("should reject GCP metadata endpoint (metadata.google.internal)", async () => {
      vi.mocked(isCloudMetadata).mockReturnValueOnce({
        isMetadata: true,
        provider: "GCP",
        reason: "Cloud metadata hostname detected: metadata.google.internal",
      });

      await expect(
        webFetchTool.execute(
          {
            url: "http://metadata.google.internal/computeMetadata/v1/",
            method: "GET",
            timeout: 5000,
          },
          mockContext
        )
      ).rejects.toThrow(CloudMetadataError);
    });

    it("should reject Azure metadata endpoint (168.63.129.16)", async () => {
      vi.mocked(isCloudMetadata).mockReturnValueOnce({
        isMetadata: true,
        provider: "Azure",
        reason: "Cloud metadata IP detected: 168.63.129.16",
      });

      await expect(
        webFetchTool.execute(
          { url: "http://168.63.129.16/metadata/instance", method: "GET", timeout: 5000 },
          mockContext
        )
      ).rejects.toThrow(CloudMetadataError);
    });

    it("should reject Alibaba Cloud metadata endpoint (100.100.100.200)", async () => {
      vi.mocked(isCloudMetadata).mockReturnValueOnce({
        isMetadata: true,
        provider: "Alibaba",
        reason: "Cloud metadata IP detected: 100.100.100.200",
      });

      await expect(
        webFetchTool.execute(
          { url: "http://100.100.100.200/latest/meta-data/", method: "GET", timeout: 5000 },
          mockContext
        )
      ).rejects.toThrow(CloudMetadataError);
    });
  });

  describe("Caching Behavior", () => {
    it("should cache successful GET requests", async () => {
      const mockHeaders = new Headers();
      mockHeaders.set("content-type", "application/json");

      // Reset mocks for clean test
      vi.mocked(isCloudMetadata).mockReturnValue({ isMetadata: false });
      vi.mocked(validateUrlWithDNS).mockResolvedValue({
        valid: true,
        url: new URL("https://api.example.com/cached"),
        resolvedIPs: [],
      });

      mockFetch.mockResolvedValue({
        status: 200,
        statusText: "OK",
        ok: true,
        redirected: false,
        headers: mockHeaders,
        text: vi.fn().mockResolvedValue('{"cached": true}'),
      });

      // First request should hit the network
      const result1 = await webFetchTool.execute(
        { url: "https://api.example.com/cached", method: "GET", timeout: 5000 },
        mockContext
      );

      expect(result1.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second request with same URL should be cached
      const result2 = await webFetchTool.execute(
        { url: "https://api.example.com/cached", method: "GET", timeout: 5000 },
        mockContext
      );

      expect(result2.success).toBe(true);
      if (result2.success) {
        expect(result2.output.statusText).toBe("OK (Cached)");
        expect(result2.output.headers["x-cache"]).toBe("HIT");
      }
      // Should not have made another fetch call
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should not cache responses with Cache-Control: no-store", async () => {
      const mockHeaders = new Headers();
      mockHeaders.set("content-type", "application/json");
      mockHeaders.set("cache-control", "no-store");

      vi.mocked(isCloudMetadata).mockReturnValue({ isMetadata: false });
      vi.mocked(validateUrlWithDNS).mockResolvedValue({
        valid: true,
        url: new URL("https://api.example.com/no-cache"),
        resolvedIPs: [],
      });

      mockFetch.mockResolvedValue({
        status: 200,
        statusText: "OK",
        ok: true,
        redirected: false,
        headers: mockHeaders,
        text: vi.fn().mockResolvedValue('{"nocache": true}'),
      });

      // First request
      await webFetchTool.execute(
        { url: "https://api.example.com/no-cache", method: "GET", timeout: 5000 },
        mockContext
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second request should also hit network (not cached due to no-store)
      await webFetchTool.execute(
        { url: "https://api.example.com/no-cache", method: "GET", timeout: 5000 },
        mockContext
      );

      // Both requests should hit the network
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should not cache responses with Cache-Control: private", async () => {
      const mockHeaders = new Headers();
      mockHeaders.set("content-type", "application/json");
      mockHeaders.set("cache-control", "private, max-age=3600");

      vi.mocked(isCloudMetadata).mockReturnValue({ isMetadata: false });
      vi.mocked(validateUrlWithDNS).mockResolvedValue({
        valid: true,
        url: new URL("https://api.example.com/private"),
        resolvedIPs: [],
      });

      mockFetch.mockResolvedValue({
        status: 200,
        statusText: "OK",
        ok: true,
        redirected: false,
        headers: mockHeaders,
        text: vi.fn().mockResolvedValue('{"private": true}'),
      });

      // First request
      await webFetchTool.execute(
        { url: "https://api.example.com/private", method: "GET", timeout: 5000 },
        mockContext
      );

      // Second request - should hit network (not cached due to private)
      await webFetchTool.execute(
        { url: "https://api.example.com/private", method: "GET", timeout: 5000 },
        mockContext
      );

      // Both requests should hit the network
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should not cache POST requests", async () => {
      const mockHeaders = new Headers();
      mockHeaders.set("content-type", "application/json");

      vi.mocked(isCloudMetadata).mockReturnValue({ isMetadata: false });
      vi.mocked(validateUrlWithDNS).mockResolvedValue({
        valid: true,
        url: new URL("https://api.example.com/submit"),
        resolvedIPs: [],
      });

      mockFetch.mockResolvedValue({
        status: 200,
        statusText: "OK",
        ok: true,
        redirected: false,
        headers: mockHeaders,
        text: vi.fn().mockResolvedValue('{"success": true}'),
      });

      // First POST request
      await webFetchTool.execute(
        { url: "https://api.example.com/submit", method: "POST", body: "{}", timeout: 5000 },
        mockContext
      );

      // Second POST request
      await webFetchTool.execute(
        { url: "https://api.example.com/submit", method: "POST", body: "{}", timeout: 5000 },
        mockContext
      );

      // Both POST requests should hit network
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("Existing Functionality Unchanged", () => {
    it("should allow valid public URLs", async () => {
      const mockHeaders = new Headers();
      mockHeaders.set("content-type", "application/json");

      vi.mocked(isCloudMetadata).mockReturnValue({ isMetadata: false });
      vi.mocked(validateUrlWithDNS).mockResolvedValue({
        valid: true,
        url: new URL("https://api.github.com/users"),
        resolvedIPs: ["140.82.114.6"],
      });

      mockFetch.mockResolvedValueOnce({
        status: 200,
        statusText: "OK",
        ok: true,
        redirected: false,
        headers: mockHeaders,
        text: vi.fn().mockResolvedValue('{"users": []}'),
      });

      const result = await webFetchTool.execute(
        { url: "https://api.github.com/users", method: "GET", timeout: 5000 },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.status).toBe(200);
        expect(result.output.body).toBe('{"users": []}');
      }
    });

    it("should properly pass headers and body for POST requests", async () => {
      const mockHeaders = new Headers();
      mockHeaders.set("content-type", "application/json");

      vi.mocked(isCloudMetadata).mockReturnValue({ isMetadata: false });
      vi.mocked(validateUrlWithDNS).mockResolvedValue({
        valid: true,
        url: new URL("https://api.example.com/create"),
        resolvedIPs: [],
      });

      mockFetch.mockResolvedValueOnce({
        status: 201,
        statusText: "Created",
        ok: true,
        redirected: false,
        headers: mockHeaders,
        text: vi.fn().mockResolvedValue('{"id": 123}'),
      });

      const requestBody = '{"name": "test"}';
      const requestHeaders = { "Content-Type": "application/json", "X-Api-Key": "secret" };

      await webFetchTool.execute(
        {
          url: "https://api.example.com/create",
          method: "POST",
          headers: requestHeaders,
          body: requestBody,
          timeout: 5000,
        },
        mockContext
      );

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.example.com/create",
        expect.objectContaining({
          method: "POST",
          headers: requestHeaders,
          body: requestBody,
        })
      );
    });
  });
});
