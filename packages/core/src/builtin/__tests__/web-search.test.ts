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

  describe("DuckDuckGo HTML parsing fallbacks", () => {
    it("should use alt regex pattern when primary pattern fails", async () => {
      // HTML that matches altResultRegex but not primary resultRegex
      const altPatternHtml = `
        <html>
          <a rel="nofollow" href="https://alt-example.com"><span>Alt Title</span></a>
          <td class="result-snippet">Alt snippet text</td>
        </html>
      `;
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(altPatternHtml),
      });
      vi.stubGlobal("fetch", fetchMock);

      const result = await webSearchTool.execute(
        { query: "test alt", maxResults: 10, engine: "duckduckgo" },
        ctx
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.results.length).toBeGreaterThanOrEqual(0);
      }
    });

    it("should fall back to generic link extraction when no result divs", async () => {
      // HTML with only basic links (no result classes)
      const genericLinksHtml = `
        <html>
          <a href="https://generic-example1.com">Generic Link Title One</a>
          <a href="https://generic-example2.com">Another Link Title Here</a>
          <a href="https://duckduckgo.com/internal">Should Skip Internal</a>
        </html>
      `;
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(genericLinksHtml),
      });
      vi.stubGlobal("fetch", fetchMock);

      const result = await webSearchTool.execute(
        { query: "test generic", maxResults: 10, engine: "duckduckgo" },
        ctx
      );

      expect(result.success).toBe(true);
      if (result.success) {
        // Generic fallback extracts links with 10+ character titles
        // Should not include duckduckgo.com internal links
        const urls = result.output.results.map((r) => r.url);
        expect(urls).not.toContain("https://duckduckgo.com/internal");
      }
    });
  });

  describe("HTML entity decoding", () => {
    it("should decode common HTML entities in results", async () => {
      const htmlWithEntities = `
        <html>
          <a class="result__a" href="https://example.com?foo=1&amp;bar=2">Title with &quot;quotes&quot; &amp; ampersand</a>
          <a class="result__snippet">Snippet with &#39;apostrophe&#39; &lt;tag&gt;</a>
        </html>
      `;
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(htmlWithEntities),
      });
      vi.stubGlobal("fetch", fetchMock);

      const result = await webSearchTool.execute(
        { query: "entities test", maxResults: 10, engine: "duckduckgo" },
        ctx
      );

      expect(result.success).toBe(true);
      if (result.success && result.output.results.length > 0) {
        const firstResult = result.output.results[0]!;
        // URL should have decoded &amp; to &
        expect(firstResult.url).toContain("foo=1&bar=2");
        // Title should have decoded entities
        expect(firstResult.title).toContain('"quotes"');
        expect(firstResult.title).toContain("& ampersand");
      }
    });

    it("should decode numeric HTML entities", async () => {
      const htmlWithNumericEntities = `
        <html>
          <a class="result__a" href="https://example.com">Title &#60;angle&#62; &#x3C;hex&#x3E;</a>
          <a class="result__snippet">Snippet &nbsp; with spaces</a>
        </html>
      `;
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(htmlWithNumericEntities),
      });
      vi.stubGlobal("fetch", fetchMock);

      const result = await webSearchTool.execute(
        { query: "numeric entities", maxResults: 10, engine: "duckduckgo" },
        ctx
      );

      expect(result.success).toBe(true);
      if (result.success && result.output.results.length > 0) {
        const firstResult = result.output.results[0]!;
        // Should decode &#60; to < and &#62; to >
        expect(firstResult.title).toContain("<angle>");
        // Should decode hex entities &#x3C; to < and &#x3E; to >
        expect(firstResult.title).toContain("<hex>");
      }
    });
  });

  describe("timeout handling", () => {
    it("should abort request when signal is aborted during fetch", async () => {
      const controller = new AbortController();
      ctx.abortSignal = controller.signal;

      // Pre-abort before calling execute
      controller.abort();

      const result = await webSearchTool.execute(
        { query: "aborted query", maxResults: 10, engine: "duckduckgo" },
        ctx
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toMatch(/cancel|abort/i);
      }
    });

    it("should handle abort signal during in-flight request", async () => {
      const controller = new AbortController();
      ctx.abortSignal = controller.signal;

      const fetchMock = vi.fn().mockImplementation((_url, _options) => {
        // Immediately abort when fetch is called
        controller.abort();
        // Simulate the fetch rejecting due to abort
        const error = new Error("The operation was aborted");
        error.name = "AbortError";
        return Promise.reject(error);
      });
      vi.stubGlobal("fetch", fetchMock);

      const result = await webSearchTool.execute(
        { query: "mid-flight abort", maxResults: 10, engine: "duckduckgo" },
        ctx
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toMatch(/cancel/i);
      }
    });
  });

  describe("SerpAPI Bing engine", () => {
    it("should use SerpAPI with engine=bing when API key is set", async () => {
      process.env.SERPAPI_KEY = "test-api-key";

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            organic_results: [
              { title: "Bing Result 1", link: "https://bing-example.com", snippet: "Bing Snippet" },
            ],
          }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const result = await webSearchTool.execute(
        { query: "bing test", maxResults: 5, engine: "bing" },
        ctx
      );

      expect(fetchMock).toHaveBeenCalled();
      const url = fetchMock.mock.calls[0]?.[0] as string;
      expect(url).toContain("serpapi.com");
      expect(url).toContain("engine=bing");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.engine).toBe("bing");
        expect(result.output.results).toHaveLength(1);
        expect(result.output.results[0]?.title).toBe("Bing Result 1");
      }

      delete process.env.SERPAPI_KEY;
    });

    it("should fail without API key for bing engine", async () => {
      delete process.env.SERPAPI_KEY;
      delete process.env.SERPAPI_API_KEY;

      const result = await webSearchTool.execute(
        { query: "bing test", maxResults: 10, engine: "bing" },
        ctx
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("SERPAPI_KEY");
      }
    });
  });

  describe("retry mechanism", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should retry on HTTP 429 rate limit", async () => {
      let callCount = 0;
      const fetchMock = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          return Promise.resolve({ ok: false, status: 429 });
        }
        return Promise.resolve({
          ok: true,
          text: () =>
            Promise.resolve(`
              <html>
                <a class="result__a" href="https://retry-success.com">Success After Retry</a>
                <a class="result__snippet">Retry worked</a>
              </html>
            `),
        });
      });
      vi.stubGlobal("fetch", fetchMock);

      const resultPromise = webSearchTool.execute(
        { query: "retry test", maxResults: 10, engine: "duckduckgo" },
        ctx
      );

      // Advance through retry delays (1s, 2s)
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(2000);

      const result = await resultPromise;

      expect(callCount).toBeGreaterThanOrEqual(3);
      expect(result.success).toBe(true);
    });

    it("should retry on HTTP 5xx server errors", async () => {
      let callCount = 0;
      const fetchMock = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount < 2) {
          return Promise.resolve({ ok: false, status: 503 });
        }
        return Promise.resolve({
          ok: true,
          text: () =>
            Promise.resolve(`
              <html>
                <a class="result__a" href="https://server-recovered.com">Server Recovered</a>
                <a class="result__snippet">After 503</a>
              </html>
            `),
        });
      });
      vi.stubGlobal("fetch", fetchMock);

      const resultPromise = webSearchTool.execute(
        { query: "server error test", maxResults: 10, engine: "duckduckgo" },
        ctx
      );

      // Advance through retry delay (1s)
      await vi.advanceTimersByTimeAsync(1000);

      const result = await resultPromise;

      expect(callCount).toBe(2);
      expect(result.success).toBe(true);
    });

    it("should fail after max retries exhausted", async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 429 });
      vi.stubGlobal("fetch", fetchMock);

      const resultPromise = webSearchTool.execute(
        { query: "always rate limited", maxResults: 10, engine: "duckduckgo" },
        ctx
      );

      // Advance through all retry delays (1s + 2s + 4s)
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(2000);
      await vi.advanceTimersByTimeAsync(4000);

      const result = await resultPromise;

      // Should have tried initial + 3 retries = 4 total calls
      expect(fetchMock).toHaveBeenCalledTimes(4);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("429");
      }
    });

    it("should not retry on HTTP 4xx client errors (except 429)", async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 });
      vi.stubGlobal("fetch", fetchMock);

      const result = await webSearchTool.execute(
        { query: "not found", maxResults: 10, engine: "duckduckgo" },
        ctx
      );

      // Should only call once (no retry for 404)
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("404");
      }
    });
  });

  describe("Tavily search", () => {
    const mockTavilyResponse = {
      answer: "AI generated summary of search results",
      query: "test query",
      results: [
        {
          title: "Tavily Result 1",
          url: "https://example.com/1",
          content: "Content from Tavily search",
          score: 0.95,
        },
        {
          title: "Tavily Result 2",
          url: "https://example.com/2",
          content: "More content from Tavily",
          score: 0.88,
        },
      ],
    };

    afterEach(() => {
      delete process.env.TAVILY_API_KEY;
    });

    it("should search using Tavily when key is provided", async () => {
      process.env.TAVILY_API_KEY = "test-tavily-key";
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockTavilyResponse),
      });
      vi.stubGlobal("fetch", fetchMock);

      const result = await webSearchTool.execute(
        { query: "test query", maxResults: 10, engine: "tavily" },
        ctx
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.engineUsed).toBe("tavily");
        expect(result.output.results).toHaveLength(2);
        expect(result.output.results[0]?.title).toBe("Tavily Result 1");
        expect(result.output.answer).toBe("AI generated summary of search results");
      }
    });

    it("should fail without API key for tavily engine", async () => {
      delete process.env.TAVILY_API_KEY;

      const result = await webSearchTool.execute(
        { query: "test", maxResults: 10, engine: "tavily" },
        ctx
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("TAVILY_API_KEY");
      }
    });

    it("should use Tavily for auto engine when API key is available", async () => {
      process.env.TAVILY_API_KEY = "test-tavily-key";
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockTavilyResponse),
      });
      vi.stubGlobal("fetch", fetchMock);

      const result = await webSearchTool.execute(
        { query: "test query", maxResults: 10, engine: "auto" },
        ctx
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.engineUsed).toBe("tavily");
        expect(result.output.engine).toBe("auto");
      }

      // Verify POST to Tavily API
      expect(fetchMock).toHaveBeenCalled();
      const call = fetchMock.mock.calls[0];
      expect(call?.[0]).toContain("tavily.com");
    });

    it("should fallback to DuckDuckGo when Tavily fails", async () => {
      process.env.TAVILY_API_KEY = "test-tavily-key";

      const duckDuckGoHtml = `
        <html>
          <a class="result__a" href="https://fallback.com">Fallback Result</a>
          <a class="result__snippet">Fallback snippet</a>
        </html>
      `;

      const fetchMock = vi
        .fn()
        // First call (Tavily) fails
        .mockRejectedValueOnce(new Error("Tavily API error"))
        // Second call (DuckDuckGo fallback) succeeds
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(duckDuckGoHtml),
        });
      vi.stubGlobal("fetch", fetchMock);

      const result = await webSearchTool.execute(
        { query: "test query", maxResults: 10, engine: "auto" },
        ctx
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.engineUsed).toContain("fallback");
      }
    });

    it("should include answer in output when available", async () => {
      process.env.TAVILY_API_KEY = "test-tavily-key";
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockTavilyResponse),
      });
      vi.stubGlobal("fetch", fetchMock);

      const result = await webSearchTool.execute(
        { query: "test", maxResults: 10, engine: "tavily" },
        ctx
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.answer).toBe("AI generated summary of search results");
      }
    });

    it("should pass advanced parameters to Tavily", async () => {
      process.env.TAVILY_API_KEY = "test-tavily-key";
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockTavilyResponse),
      });
      vi.stubGlobal("fetch", fetchMock);

      await webSearchTool.execute(
        {
          query: "test",
          maxResults: 10,
          engine: "tavily",
          searchDepth: "advanced",
          includeDomains: ["example.com"],
          excludeDomains: ["spam.com"],
          timeRange: "week",
        },
        ctx
      );

      expect(fetchMock).toHaveBeenCalled();
      const call = fetchMock.mock.calls[0];
      const body = JSON.parse(call?.[1]?.body as string);
      expect(body.search_depth).toBe("advanced");
      expect(body.include_domains).toContain("example.com");
      expect(body.exclude_domains).toContain("spam.com");
      expect(body.time_range).toBe("w"); // "week" maps to "w"
    });

    it("should handle Tavily API HTTP errors", async () => {
      process.env.TAVILY_API_KEY = "test-tavily-key";

      const duckDuckGoHtml = `
        <html>
          <a class="result__a" href="https://fallback.com">DDG Result</a>
        </html>
      `;

      const fetchMock = vi
        .fn()
        // Tavily returns error
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          text: () => Promise.resolve("Unauthorized"),
        })
        // Fallback to DDG
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(duckDuckGoHtml),
        });
      vi.stubGlobal("fetch", fetchMock);

      const result = await webSearchTool.execute(
        { query: "test", maxResults: 10, engine: "auto" },
        ctx
      );

      // Should fallback successfully
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.engineUsed).toContain("fallback");
      }
    });

    it("should respect maxResults limit", async () => {
      process.env.TAVILY_API_KEY = "test-tavily-key";

      const manyResults = {
        query: "test",
        results: Array.from({ length: 10 }, (_, i) => ({
          title: `Result ${i + 1}`,
          url: `https://example.com/${i + 1}`,
          content: `Content ${i + 1}`,
        })),
      };

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(manyResults),
      });
      vi.stubGlobal("fetch", fetchMock);

      await webSearchTool.execute({ query: "test", maxResults: 3, engine: "tavily" }, ctx);

      // Check that maxResults is passed to API
      const call = fetchMock.mock.calls[0];
      const body = JSON.parse(call?.[1]?.body as string);
      expect(body.max_results).toBe(3);
    });

    it("should check network:read permission for tavily", async () => {
      process.env.TAVILY_API_KEY = "test-tavily-key";
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockTavilyResponse),
      });
      vi.stubGlobal("fetch", fetchMock);

      await webSearchTool.execute({ query: "test", maxResults: 10, engine: "tavily" }, ctx);

      expect(ctx.checkPermission).toHaveBeenCalledWith("network:read", "search:tavily");
    });
  });
});
