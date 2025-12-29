/**
 * Tests for web_search tool
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "../../types/tool.js";
import { webSearchTool } from "../web-search.js";

describe("webSearchTool", () => {
  let ctx: ToolContext;

  beforeEach(() => {
    ctx = {
      workingDir: "/test",
      sessionId: "test-session",
      messageId: "test-message",
      callId: "test-call",
      abortSignal: new AbortController().signal,
      checkPermission: vi.fn().mockResolvedValue(true),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("tool definition", () => {
    it("should have correct metadata", () => {
      expect(webSearchTool.definition.name).toBe("web_search");
      expect(webSearchTool.definition.kind).toBe("read");
      expect(webSearchTool.definition.category).toBe("network");
    });

    it("should not require confirmation for read operations", () => {
      expect(
        webSearchTool.shouldConfirm?.({ query: "test", maxResults: 10, engine: "duckduckgo" }, ctx)
      ).toBe(false);
    });
  });

  describe("permission checks", () => {
    it("should check network:read permission", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve("<html></html>"),
      });
      vi.stubGlobal("fetch", fetchMock);

      await webSearchTool.execute({ query: "test", maxResults: 10, engine: "duckduckgo" }, ctx);

      expect(ctx.checkPermission).toHaveBeenCalledWith("network:read", "search:duckduckgo");
    });

    it("should fail when permission denied", async () => {
      ctx.checkPermission = vi.fn().mockResolvedValue(false);

      const result = await webSearchTool.execute(
        { query: "test", maxResults: 10, engine: "duckduckgo" },
        ctx
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Permission denied");
      }
    });
  });

  describe("cancellation", () => {
    it("should return error when cancelled", async () => {
      const controller = new AbortController();
      controller.abort();
      ctx.abortSignal = controller.signal;

      const result = await webSearchTool.execute(
        { query: "test", maxResults: 10, engine: "duckduckgo" },
        ctx
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("cancelled");
      }
    });
  });

  describe("DuckDuckGo search", () => {
    it("should use duckduckgo as default engine", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve("<html></html>"),
      });
      vi.stubGlobal("fetch", fetchMock);

      await webSearchTool.execute(
        { query: "test query", maxResults: 10, engine: "duckduckgo" },
        ctx
      );

      expect(fetchMock).toHaveBeenCalled();
      const url = fetchMock.mock.calls[0]?.[0];
      expect(url).toContain("duckduckgo.com");
    });

    it("should include query in request", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve("<html></html>"),
      });
      vi.stubGlobal("fetch", fetchMock);

      await webSearchTool.execute(
        { query: "typescript tutorials", maxResults: 10, engine: "duckduckgo" },
        ctx
      );

      const url = fetchMock.mock.calls[0]?.[0] as string;
      expect(url).toContain("q=typescript");
    });

    it("should return results on successful search", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () =>
          Promise.resolve(`
            <html>
              <a class="result__a" href="https://example.com">Example Title</a>
              <a class="result__snippet">This is a snippet</a>
            </html>
          `),
      });
      vi.stubGlobal("fetch", fetchMock);

      const result = await webSearchTool.execute(
        { query: "test", maxResults: 10, engine: "duckduckgo" },
        ctx
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.engine).toBe("duckduckgo");
        expect(result.output.query).toBe("test");
      }
    });

    it("should handle fetch errors", async () => {
      const fetchMock = vi.fn().mockRejectedValue(new Error("Network error"));
      vi.stubGlobal("fetch", fetchMock);

      const result = await webSearchTool.execute(
        { query: "test", maxResults: 10, engine: "duckduckgo" },
        ctx
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("failed");
      }
    });

    it("should handle non-OK response", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
      });
      vi.stubGlobal("fetch", fetchMock);

      const result = await webSearchTool.execute(
        { query: "test", maxResults: 10, engine: "duckduckgo" },
        ctx
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("429");
      }
    });
  });

  describe("SerpAPI search", () => {
    it("should fail without API key for google engine", async () => {
      const originalEnv = process.env.SERPAPI_KEY;
      delete process.env.SERPAPI_KEY;
      delete process.env.SERPAPI_API_KEY;

      const result = await webSearchTool.execute(
        { query: "test", maxResults: 10, engine: "google" },
        ctx
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("SERPAPI_KEY");
      }

      if (originalEnv) {
        process.env.SERPAPI_KEY = originalEnv;
      }
    });

    it("should use SerpAPI when engine is google with API key", async () => {
      process.env.SERPAPI_KEY = "test-api-key";

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            organic_results: [
              { title: "Result 1", link: "https://example.com", snippet: "Snippet 1" },
            ],
          }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const result = await webSearchTool.execute(
        { query: "test", maxResults: 10, engine: "google" },
        ctx
      );

      expect(fetchMock).toHaveBeenCalled();
      const url = fetchMock.mock.calls[0]?.[0] as string;
      expect(url).toContain("serpapi.com");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.engine).toBe("google");
        expect(result.output.results).toHaveLength(1);
        expect(result.output.results[0]?.title).toBe("Result 1");
      }

      delete process.env.SERPAPI_KEY;
    });
  });

  describe("maxResults parameter", () => {
    it("should respect maxResults limit", async () => {
      process.env.SERPAPI_KEY = "test-api-key";

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            organic_results: [
              { title: "Result 1", link: "https://example1.com", snippet: "S1" },
              { title: "Result 2", link: "https://example2.com", snippet: "S2" },
              { title: "Result 3", link: "https://example3.com", snippet: "S3" },
            ],
          }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const result = await webSearchTool.execute(
        { query: "test", engine: "google", maxResults: 2 },
        ctx
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.results).toHaveLength(2);
      }

      delete process.env.SERPAPI_KEY;
    });
  });
});
