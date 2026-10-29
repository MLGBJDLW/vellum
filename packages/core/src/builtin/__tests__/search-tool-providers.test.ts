import { fetchWithPool } from "@vellum/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "../../types/tool.js";
import { configureWebTools, type WebToolSettings } from "../web/config.js";
import { searchTool, webSearchTool } from "../web-search.js";

vi.mock("@vellum/shared", async (original) => ({
  ...(await original<typeof import("@vellum/shared")>()),
  fetchWithPool: vi.fn(),
}));
const fetch = vi.mocked(fetchWithPool);
function firstRequest() {
  const call = fetch.mock.calls[0];
  if (!call) throw new Error("Expected a search request");
  return call;
}
let settings: WebToolSettings;
let ctx: ToolContext;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const row = {
  title: "Source",
  url: "https://example.com/source",
  snippet: "Snippet",
  summary: "Summary",
  content: "Page content",
};
const ddg = () =>
  new Response(
    '<a class="result__a" href="/l/?uddg=https%3A%2F%2Fexample.com%2Fsource">Source</a><a class="result__snippet">Snippet</a>',
    { headers: { "content-type": "text/html" } }
  );

beforeEach(() => {
  settings = {};
  configureWebTools({ getSettings: () => settings });
  fetch.mockReset();
  for (const key of [
    "DEEPSEEK_API_KEY",
    "BRAVE_SEARCH_API_KEY",
    "BRAVE_API_KEY",
    "TAVILY_API_KEY",
    "EXA_API_KEY",
    "SERPER_API_KEY",
    "SERPAPI_KEY",
    "SERPAPI_API_KEY",
    "ANYSEARCH_API_KEY",
    "SEARXNG_BASE_URL",
  ])
    vi.stubEnv(key, "");
  ctx = {
    workingDir: "/fixture",
    sessionId: "fixture",
    messageId: "fixture",
    callId: "fixture",
    abortSignal: new AbortController().signal,
    checkPermission: vi.fn().mockResolvedValue(true),
  };
});
afterEach(() => {
  configureWebTools();
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("search_tool provider contracts", () => {
  it("retains web_search as the same executable implementation", async () => {
    expect(searchTool.definition.name).toBe("search_tool");
    expect(webSearchTool.definition.name).toBe("web_search");
    expect(searchTool.definition.parameters).toBe(webSearchTool.definition.parameters);
    fetch.mockImplementation(async () => ddg());
    expect(await searchTool.execute({ query: "Search", engine: "duckduckgo" }, ctx)).toEqual(
      await webSearchTool.execute({ query: "Search", engine: "duckduckgo" }, ctx)
    );
  });

  it("sends the current DeepSeek Search API contract and preserves summary/content", async () => {
    settings = {
      providers: { deepseek: { apiKey: "fixture-deepseek", baseUrl: "https://proxy.example/v1" } },
    };
    fetch.mockResolvedValue(json({ results: [row] }));
    const result = await searchTool.execute(
      { query: "中文😀", engine: "deepseek", maxResults: 100, needContent: true },
      ctx
    );
    const [url, request] = firstRequest();
    expect(String(url)).toBe("https://proxy.example/v1/tools/search");
    expect(request).toMatchObject({
      method: "POST",
      headers: { Authorization: "Bearer fixture-deepseek" },
    });
    expect(JSON.parse(String(request?.body))).toEqual({
      query: "中文😀",
      count: 50,
      need_content: true,
    });
    expect(result).toMatchObject({
      success: true,
      output: { engineUsed: "deepseek", results: [{ ...row, position: 1 }] },
    });
  });

  it("counts DeepSeek query length as Unicode characters and never truncates the query", async () => {
    settings = { providers: { deepseek: { apiKey: "fixture" } } };
    fetch.mockImplementation(async () => json({ results: [] }));
    expect(
      (await searchTool.execute({ query: "😀".repeat(128), engine: "deepseek" }, ctx)).success
    ).toBe(true);
    const rejected = await searchTool.execute({ query: "😀".repeat(129), engine: "deepseek" }, ctx);
    expect(rejected).toMatchObject({
      success: false,
      error: expect.stringContaining("128 Unicode"),
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      engine: "brave" as const,
      response: { web: { results: [{ title: "Source", url: row.url, description: "Snippet" }] } },
      endpoint: "https://api.search.brave.com/res/v1/web/search",
      header: "X-Subscription-Token",
    },
    {
      engine: "exa" as const,
      response: { results: [{ title: "Source", url: row.url, highlights: ["Snippet"] }] },
      endpoint: "https://api.exa.ai/search",
      header: "x-api-key",
    },
    {
      engine: "serper" as const,
      response: { organic: [{ title: "Source", link: row.url, snippet: "Snippet" }] },
      endpoint: "https://google.serper.dev/search",
      header: "X-API-KEY",
    },
    {
      engine: "tavily" as const,
      response: {
        results: [{ title: "Source", url: row.url, content: "Snippet" }],
        answer: "Answer",
      },
      endpoint: "https://api.tavily.com/search",
      header: "Authorization",
    },
  ])(
    "uses the $engine request and result format",
    async ({ engine, response, endpoint, header }) => {
      settings = { providers: { [engine]: { apiKey: "fixture" } } };
      fetch.mockResolvedValue(json(response));
      const result = await searchTool.execute(
        { query: "Search", engine, maxResults: 3, timeRange: "week" },
        ctx
      );
      const [url, request] = firstRequest();
      expect(String(url).split("?")[0]).toBe(endpoint);
      expect(new Headers(request?.headers as Record<string, string>).get(header)).toBe(
        header === "Authorization" ? "Bearer fixture" : "fixture"
      );
      expect(result).toMatchObject({
        success: true,
        output: {
          engineUsed: engine,
          results: [{ title: "Source", url: row.url, snippet: "Snippet", position: 1 }],
        },
      });
      if (engine === "brave") expect(new URL(String(url)).searchParams.get("freshness")).toBe("pw");
      if (engine === "exa")
        expect(JSON.parse(String(request?.body))).toMatchObject({
          query: "Search",
          numResults: 3,
          contents: { highlights: true },
          startPublishedDate: expect.any(String),
        });
      if (engine === "serper")
        expect(JSON.parse(String(request?.body))).toEqual({ q: "Search", num: 3, tbs: "qdr:w" });
      if (engine === "tavily")
        expect(JSON.parse(String(request?.body))).toMatchObject({
          query: "Search",
          max_results: 3,
          time_range: "week",
        });
    }
  );

  it.each(["google", "bing", "serpapi"] as const)(
    "preserves %s through SerpAPI",
    async (engine) => {
      settings = { providers: { serpapi: { apiKey: "fixture" } } };
      fetch.mockResolvedValue(
        json({ organic_results: [{ title: "Source", link: row.url, snippet: "Snippet" }] })
      );
      expect((await searchTool.execute({ query: "Search", engine }, ctx)).success).toBe(true);
      const url = new URL(String(firstRequest()[0]));
      expect(url.hostname).toBe("serpapi.com");
      expect(url.searchParams.get("api_key")).toBe("fixture");
      expect(url.searchParams.get("engine")).toBe(engine === "bing" ? "bing" : "google");
    }
  );

  it.each([
    { results: [{ title: "Source", url: row.url, description: "Snippet" }] },
    {
      code: 0,
      message: "success",
      request_id: "fixture",
      data: {
        results: [{ title: "Source", url: row.url, snippet: "Snippet", content: "Page" }],
        metadata: {},
      },
    },
  ])("accepts AnySearch result formats with optional Bearer authentication", async (response) => {
    settings = {
      providers: { anysearch: { enabled: true, baseUrl: "https://search.example/v1/search" } },
    };
    fetch.mockResolvedValue(json(response));
    expect(
      (
        await searchTool.execute(
          { query: "Search", engine: "anysearch", maxResults: 4, timeRange: "month" },
          ctx
        )
      ).success
    ).toBe(true);
    const [url, request] = firstRequest();
    expect(String(url)).toBe("https://search.example/v1/search");
    expect(new Headers(request?.headers as Record<string, string>).has("Authorization")).toBe(
      false
    );
    expect(JSON.parse(String(request?.body))).toEqual({
      query: "Search",
      max_results: 4,
      language: "en",
      zone: "intl",
      constraint: { freshness: "month" },
    });
  });

  it("rejects AnySearch application errors even when HTTP succeeds without exposing the body", async () => {
    fetch.mockResolvedValue(
      json({ code: 1001, message: "fixture-private-key", data: { results: [row] } })
    );
    const result = await searchTool.execute({ query: "Search", engine: "anysearch" }, ctx);
    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining("AnySearch rejected the request"),
    });
    expect(JSON.stringify(result)).not.toContain("fixture-private-key");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("uses a configured keyless SearXNG instance and rejects an unsupported week filter", async () => {
    settings = { providers: { searxng: { baseUrl: "https://search.example/subpath" } } };
    fetch.mockResolvedValue(
      json({ results: [{ title: "Source", url: row.url, content: "Snippet" }] })
    );
    expect(
      (await searchTool.execute({ query: "Search", engine: "searxng", timeRange: "day" }, ctx))
        .success
    ).toBe(true);
    const url = new URL(String(firstRequest()[0]));
    expect(url.pathname).toBe("/subpath/search");
    expect(url.searchParams.get("format")).toBe("json");
    expect(url.searchParams.get("time_range")).toBe("day");
    expect(
      await searchTool.execute({ query: "Search", engine: "searxng", timeRange: "week" }, ctx)
    ).toMatchObject({ success: false, error: expect.stringContaining("time range") });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("search routing and bounded failure behavior", () => {
  it("uses the configured engine and resolves only the credential actually needed", async () => {
    const resolveCredential = vi.fn(async (provider: string) => {
      if (provider !== "deepseek") throw new Error("Unneeded credential must not be read");
      return { apiKey: "managed-fixture" };
    });
    configureWebTools({ getSettings: () => settings, resolveCredential });
    fetch.mockImplementation(async () => json({ results: [row] }));
    expect((await searchTool.execute({ query: "Search" }, ctx)).success).toBe(true);
    expect(resolveCredential).toHaveBeenCalledExactlyOnceWith("deepseek");
    settings = {
      engine: "tavily",
      searchDepth: "advanced",
      providers: { tavily: { apiKey: "fixture" } },
    };
    expect(await searchTool.execute({ query: "Search" }, ctx)).toMatchObject({
      success: true,
      output: { engineUsed: "tavily" },
    });
    expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body)).search_depth).toBe("advanced");
  });

  it("prefers an available DeepSeek credential and honors configured defaults", async () => {
    settings = {
      defaultMaxResults: 4,
      providers: { deepseek: { apiKey: "fixture" }, tavily: { apiKey: "fixture" } },
    };
    fetch.mockResolvedValue(json({ results: [row] }));
    expect(await searchTool.execute({ query: "Search" }, ctx)).toMatchObject({
      success: true,
      output: { engine: "auto", engineUsed: "deepseek" },
    });
    expect(JSON.parse(String(firstRequest()[1]?.body)).count).toBe(4);
  });

  it("uses DuckDuckGo with no configured service and unwraps its result URLs", async () => {
    fetch.mockResolvedValue(ddg());
    expect(await searchTool.execute({ query: "Search" }, ctx)).toMatchObject({
      success: true,
      output: { engineUsed: "duckduckgo", results: [{ url: row.url }] },
    });
    expect(String(firstRequest()[0])).toContain("duckduckgo.com");
  });

  it("uses only services supporting the requested filters and never silently drops them", async () => {
    settings = { providers: { deepseek: { apiKey: "fixture" }, tavily: { apiKey: "fixture" } } };
    fetch.mockResolvedValue(json({ results: [row] }));
    expect(
      await searchTool.execute({ query: "Search", includeDomains: ["example.com"] }, ctx)
    ).toMatchObject({ success: true, output: { engineUsed: "tavily" } });
    expect(JSON.parse(String(firstRequest()[1]?.body))).toMatchObject({
      include_domains: ["example.com"],
      include_domains_mode: "restrict",
    });
    expect(
      await searchTool.execute(
        { query: "Search", engine: "deepseek", includeDomains: ["example.com"] },
        ctx
      )
    ).toMatchObject({ success: false, error: expect.stringContaining("domain filters") });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("reports missing explicit credentials without using a different engine", async () => {
    expect(await searchTool.execute({ query: "Search", engine: "deepseek" }, ctx)).toMatchObject({
      success: false,
      error: expect.stringContaining("DEEPSEEK_API_KEY"),
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([400, 401, 403])(
    "does not broaden search after a nonretryable HTTP %s",
    async (status) => {
      settings = { providers: { deepseek: { apiKey: "fixture" } } };
      fetch.mockResolvedValue(json({ error: "secret-value must never be shown" }, status));
      const result = await searchTool.execute({ query: "Search", engine: "auto" }, ctx);
      expect(result).toMatchObject({
        success: false,
        error: expect.stringContaining(String(status)),
      });
      expect(JSON.stringify(result)).not.toContain("secret-value");
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  );

  it.each(["auto", "deepseek"] as const)(
    "only auto may fallback after bounded transient retries (engine=%s)",
    async (engine) => {
      vi.useFakeTimers();
      settings = { providers: { deepseek: { apiKey: "fixture" } } };
      fetch.mockImplementation(async (url) =>
        String(url).includes("deepseek") ? json({}, 503) : ddg()
      );
      const pending = searchTool.execute({ query: "Search", engine }, ctx);
      await vi.advanceTimersByTimeAsync(1000);
      const result = await pending;
      expect(fetch).toHaveBeenCalledTimes(engine === "auto" ? 4 : 3);
      if (engine === "auto") {
        expect(result).toMatchObject({
          success: true,
          output: { engineUsed: "duckduckgo (fallback)" },
        });
        expect(ctx.checkPermission).toHaveBeenCalledWith("network:read", "search:duckduckgo");
      } else expect(result.success).toBe(false);
    }
  );

  it("honors fallback=false and permission denial before switching engines", async () => {
    vi.useFakeTimers();
    settings = { fallback: false, providers: { deepseek: { apiKey: "fixture" } } };
    fetch.mockImplementation(async () => json({}, 503));
    const pending = searchTool.execute({ query: "Search" }, ctx);
    await vi.advanceTimersByTimeAsync(1000);
    expect((await pending).success).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(3);
    settings.fallback = true;
    ctx.checkPermission = vi.fn(async (_permission, resource) => resource !== "search:duckduckgo");
    const denied = searchTool.execute({ query: "Search" }, ctx);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await denied).toMatchObject({
      success: false,
      error: expect.stringContaining("Permission denied"),
    });
    expect(fetch).toHaveBeenCalledTimes(6);
  });

  it("never falls back to unconstrained DuckDuckGo after a filtered search fails", async () => {
    vi.useFakeTimers();
    settings = { providers: { tavily: { apiKey: "fixture" } } };
    fetch.mockImplementation(async () => json({}, 503));
    const pending = searchTool.execute({ query: "Search", includeDomains: ["example.com"] }, ctx);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await pending).toMatchObject({ success: false, error: expect.stringContaining("503") });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls.every(([url]) => String(url).includes("tavily.com"))).toBe(true);
    expect(ctx.checkPermission).not.toHaveBeenCalledWith("network:read", "search:duckduckgo");
  });

  it("uses one total deadline and does not fallback after timeout or cancellation", async () => {
    vi.useFakeTimers();
    settings = { timeout: 20, providers: { deepseek: { apiKey: "fixture" } } };
    fetch.mockImplementation(() => new Promise(() => {}));
    const pending = searchTool.execute({ query: "Search" }, ctx);
    await vi.advanceTimersByTimeAsync(21);
    expect(await pending).toMatchObject({
      success: false,
      error: expect.stringContaining("timed out"),
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    const controller = new AbortController();
    controller.abort();
    ctx.abortSignal = controller.signal;
    expect(await searchTool.execute({ query: "Search" }, ctx)).toMatchObject({
      success: false,
      error: expect.stringContaining("cancelled"),
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
