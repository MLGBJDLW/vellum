import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "../../types/tool.js";
import { type FetchToolParams, fetchTool, fetchToolParamsSchema } from "../fetch-tool.js";
import { getWebToolSettings, type ResolvedWebProvider, resolveWebProvider } from "../web/config.js";
import { deepseekToolEndpoint } from "../web/endpoints.js";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), lookup: vi.fn() }));
vi.mock("@vellum/shared", async (original) => ({
  ...(await original<typeof import("@vellum/shared")>()),
  fetchWithPool: mocks.fetch,
}));
vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }));
vi.mock("../web/config.js", () => ({ getWebToolSettings: vi.fn(), resolveWebProvider: vi.fn() }));

const PAGE = "https://www.example.com/article";
let providers: Record<string, ResolvedWebProvider>;
let ctx: ToolContext;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function execute(input: Partial<FetchToolParams> = {}) {
  return fetchTool.execute(fetchToolParamsSchema.parse({ url: PAGE, ...input }), ctx);
}

beforeEach(() => {
  vi.resetAllMocks();
  providers = {};
  vi.mocked(getWebToolSettings).mockReturnValue({});
  vi.mocked(resolveWebProvider).mockImplementation(
    async (provider) => providers[provider] ?? { enabled: true }
  );
  mocks.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  ctx = {
    workingDir: "/workspace",
    sessionId: "session",
    messageId: "message",
    callId: "call",
    abortSignal: new AbortController().signal,
    checkPermission: vi.fn().mockResolvedValue(true),
  };
});
afterEach(() => vi.useRealTimers());

describe("fetch_tool extraction providers", () => {
  it("automatically reuses resolved DeepSeek credentials and sends the standalone fetch contract", async () => {
    providers.deepseek = {
      enabled: true,
      apiKey: "fixture-deepseek-key",
      baseUrl: "https://api.deepseek.com/v1",
    };
    mocks.fetch.mockResolvedValue(json({ title: "Article", content: "# Readable\nArticle text" }));
    const result = await execute();
    expect(result).toEqual({
      success: true,
      output: {
        url: PAGE,
        finalUrl: PAGE,
        title: "Article",
        content: "# Readable\nArticle text",
        contentType: "text/markdown",
        providerUsed: "deepseek",
        truncated: false,
      },
    });
    expect(mocks.fetch).toHaveBeenCalledWith(
      "https://api.deepseek.com/v1/tools/fetch",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ url: PAGE }),
        redirect: "error",
        headers: expect.objectContaining({
          Authorization: "Bearer fixture-deepseek-key",
          "Content-Type": "application/json",
        }),
      })
    );
    expect(resolveWebProvider).toHaveBeenCalledTimes(1);
    expect(ctx.checkPermission).toHaveBeenCalledWith("network:read", PAGE);
    expect(ctx.checkPermission).toHaveBeenCalledWith(
      "network:read",
      "https://api.deepseek.com/v1/tools/fetch"
    );
  });

  it("supports anonymous explicit Jina extraction and truncates content", async () => {
    mocks.fetch.mockResolvedValue(
      json({ code: 200, data: { title: "Jina page", url: PAGE, content: "abcdef" } })
    );
    const result = await execute({ provider: "jina", maxChars: 3 });
    expect(result).toMatchObject({
      success: true,
      output: { title: "Jina page", content: "abc", providerUsed: "jina", truncated: true },
    });
    expect(mocks.fetch).toHaveBeenCalledWith(
      `https://r.jina.ai/${PAGE}`,
      expect.objectContaining({
        method: "GET",
        headers: { Accept: "application/json", "X-Return-Format": "markdown" },
      })
    );
  });

  it("uses Firecrawl's v2 read-only markdown contract", async () => {
    providers.firecrawl = { enabled: true, apiKey: "fixture-firecrawl-key" };
    mocks.fetch.mockResolvedValue(
      json({
        success: true,
        data: { markdown: "# Firecrawl", metadata: { title: "Firecrawl page", sourceURL: PAGE } },
      })
    );
    expect(await execute({ provider: "firecrawl" })).toMatchObject({
      success: true,
      output: { providerUsed: "firecrawl", title: "Firecrawl page", content: "# Firecrawl" },
    });
    const [endpoint, options] = mocks.fetch.mock.calls[0] ?? [];
    expect(endpoint).toBe("https://api.firecrawl.dev/v2/scrape");
    expect(options.headers.Authorization).toBe("Bearer fixture-firecrawl-key");
    expect(JSON.parse(options.body)).toMatchObject({
      url: PAGE,
      formats: ["markdown"],
      onlyMainContent: true,
      skipTlsVerification: false,
    });
    expect(JSON.parse(options.body)).not.toHaveProperty("actions");
  });

  it("extracts static HTML through direct reading when no provider key is configured", async () => {
    mocks.fetch.mockResolvedValue(
      new Response(
        "<html><head><title>A &amp; B</title></head><body><nav>Navigation</nav><main><h1>Heading</h1><p>Hello &#x4E16;&#30028;.</p><script>secretScript()</script><style>.style{}</style></main><footer>Footer</footer></body></html>",
        { headers: { "content-type": "text/html; charset=utf-8" } }
      )
    );
    const result = await execute();
    expect(result).toMatchObject({
      success: true,
      output: {
        title: "A & B",
        content: "Heading\nHello 世界.",
        providerUsed: "direct",
        contentType: "text/plain",
      },
    });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.fetch).toHaveBeenCalledWith(
      PAGE,
      expect.objectContaining({ method: "GET", redirect: "manual" })
    );
  });

  it("keeps the native alias and configured fetch provider", async () => {
    vi.mocked(getWebToolSettings).mockReturnValue({ fetchProvider: "native" });
    mocks.fetch.mockResolvedValue(
      new Response('{"data":"value"}', { headers: { "content-type": "application/json" } })
    );
    expect(await execute()).toMatchObject({
      success: true,
      output: { providerUsed: "direct", content: '{"data":"value"}' },
    });
    expect(resolveWebProvider).toHaveBeenCalledExactlyOnceWith("direct");
  });

  it.each(["deepseek", "firecrawl"] as const)(
    "does not silently switch an explicit provider without credentials (%s)",
    async (provider) => {
      expect(await execute({ provider })).toMatchObject({
        success: false,
        error: expect.stringContaining("requires an API key"),
      });
      expect(mocks.fetch).not.toHaveBeenCalled();
    }
  );

  it("does not switch a disabled explicit provider", async () => {
    providers.deepseek = { enabled: false };
    expect(await execute({ provider: "deepseek" })).toMatchObject({
      success: false,
      error: expect.stringContaining("disabled"),
    });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("falls back only in auto mode for retryable provider failures", async () => {
    providers.deepseek = { enabled: true, apiKey: "fixture" };
    mocks.fetch
      .mockResolvedValueOnce(json({ error: "Unavailable" }, 503))
      .mockResolvedValueOnce(
        new Response("Direct page", { headers: { "content-type": "text/plain" } })
      );
    expect(await execute()).toMatchObject({
      success: true,
      output: {
        providerUsed: "direct",
        content: "Direct page",
        fallbacks: [{ provider: "deepseek", code: "http" }],
      },
    });
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it.each([401, 403, 404])(
    "does not bypass an HTTP %s failure through another provider",
    async (status) => {
      providers.deepseek = { enabled: true, apiKey: "fixture" };
      mocks.fetch.mockResolvedValue(json({ error: "provider-secret-detail" }, status));
      expect(await execute()).toMatchObject({
        success: false,
        error: expect.stringContaining(`HTTP ${status}`),
      });
      expect(mocks.fetch).toHaveBeenCalledTimes(1);
    }
  );

  it("respects disabled fallback and rejects malformed page responses", async () => {
    vi.mocked(getWebToolSettings).mockReturnValue({ fallback: false });
    providers.deepseek = { enabled: true, apiKey: "fixture" };
    mocks.fetch.mockResolvedValueOnce(json({}, 503));
    expect(await execute()).toMatchObject({ success: false });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    mocks.fetch.mockResolvedValueOnce(json({ secret: "not page data" }));
    const malformed = await execute({ provider: "deepseek" });
    expect(malformed).toEqual({
      success: false,
      error: "DeepSeek returned an invalid page response",
    });
  });
});

describe("fetch_tool permission, URL and deadline boundaries", () => {
  it("does not resolve credentials or contact a provider when permission is denied", async () => {
    vi.mocked(ctx.checkPermission).mockResolvedValue(false);
    expect(await execute()).toEqual({
      success: false,
      error: "Permission denied: cannot fetch this URL",
    });
    expect(mocks.lookup).not.toHaveBeenCalled();
    expect(resolveWebProvider).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it.each([
    "ftp://www.example.com/",
    "https://user:password@www.example.com/",
    "http://127.0.0.1/",
    "http://2130706433/",
    "http://169.254.169.254/latest/meta-data/",
  ])("blocks unsafe URLs before external fetching (%s)", async (url) => {
    expect(await execute({ url })).toMatchObject({ success: false });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("validates URL length and bounded numeric arguments", () => {
    expect(
      fetchToolParamsSchema.safeParse({ url: `https://www.example.com/${"a".repeat(8192)}` })
        .success
    ).toBe(false);
    expect(fetchToolParamsSchema.safeParse({ url: PAGE, maxChars: 0 }).success).toBe(false);
    expect(fetchToolParamsSchema.safeParse({ url: PAGE, timeout: 120_001 }).success).toBe(false);
    expect(fetchTool.definition.kind).toBe("read");
  });

  it("blocks DNS results pointing to private addresses", async () => {
    mocks.lookup.mockResolvedValue([{ address: "10.1.2.3", family: 4 }]);
    expect(await execute()).toMatchObject({
      success: false,
      error: expect.stringContaining("private"),
    });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("does not submit internal names to cloud extraction even if DNS returns a public IP", async () => {
    providers.deepseek = { enabled: true, apiKey: "fixture" };
    expect(await execute({ url: "https://intranet.corp/", provider: "deepseek" })).toMatchObject({
      success: false,
      error: expect.stringContaining("Internal URLs"),
    });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("validates each direct redirect and checks permission before following", async () => {
    mocks.fetch
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "/final" } }))
      .mockResolvedValueOnce(
        new Response("Final text", { headers: { "content-type": "text/plain" } })
      );
    expect(await execute({ provider: "direct" })).toMatchObject({
      success: true,
      output: { finalUrl: "https://www.example.com/final", content: "Final text" },
    });
    expect(ctx.checkPermission).toHaveBeenCalledWith(
      "network:read",
      "https://www.example.com/final"
    );
    expect(mocks.lookup).toHaveBeenCalledTimes(3);
  });

  it("never follows a redirect to a private address", async () => {
    mocks.fetch.mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: "http://127.0.0.1/secret" } })
    );
    expect(await execute({ provider: "direct" })).toMatchObject({ success: false });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("does not follow a redirect when permission for the new URL is denied", async () => {
    vi.mocked(ctx.checkPermission).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    mocks.fetch.mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: "https://other.example.com/" } })
    );
    expect(await execute({ provider: "direct" })).toMatchObject({
      success: false,
      error: expect.stringContaining("Permission denied"),
    });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects binary bodies and limits the full response before extraction", async () => {
    mocks.fetch.mockResolvedValueOnce(
      new Response("binary", { headers: { "content-type": "image/png" } })
    );
    expect(await execute({ provider: "direct" })).toMatchObject({
      success: false,
      error: expect.stringContaining("readable text"),
    });
    mocks.fetch.mockResolvedValueOnce(
      new Response("page", {
        headers: { "content-type": "text/plain", "content-length": String(3 * 1024 * 1024) },
      })
    );
    expect(await execute({ provider: "direct" })).toMatchObject({
      success: false,
      error: expect.stringContaining("byte limit"),
    });
  });

  it("cancels before permission or network activity", async () => {
    ctx.abortSignal = AbortSignal.abort();
    expect(await execute()).toEqual({ success: false, error: "Operation was cancelled" });
    expect(ctx.checkPermission).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("cancels a pending permission check without starting a later request", async () => {
    const controller = new AbortController();
    ctx.abortSignal = controller.signal;
    let grant: (value: boolean) => void = () => {};
    vi.mocked(ctx.checkPermission).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          grant = resolve;
        })
    );
    const pending = execute();
    controller.abort();
    expect(await pending).toEqual({ success: false, error: "Operation was cancelled" });
    grant(true);
    await Promise.resolve();
    expect(mocks.lookup).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("cannot bypass denied cloud service permission with direct fallback", async () => {
    providers.deepseek = { enabled: true, apiKey: "fixture" };
    vi.mocked(ctx.checkPermission).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(await execute()).toMatchObject({
      success: false,
      error: expect.stringContaining("Permission denied"),
    });
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(resolveWebProvider).toHaveBeenCalledTimes(1);
  });

  it("rejects service URLs with embedded credentials before requesting permission for them", async () => {
    providers.firecrawl = {
      enabled: true,
      apiKey: "fixture",
      baseUrl: "https://user:secret@api.example.com",
    };
    expect(await execute({ provider: "firecrawl" })).toMatchObject({
      success: false,
      error: expect.stringContaining("without embedded credentials"),
    });
    expect(ctx.checkPermission).toHaveBeenCalledExactlyOnceWith("network:read", PAGE);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("keeps delayed DNS inside the total deadline and cannot send a late request", async () => {
    vi.useFakeTimers();
    let resolveDns: (value: unknown) => void = () => {};
    mocks.lookup.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveDns = resolve;
        })
    );
    const pending = execute({ provider: "direct", timeout: 100 });
    await vi.advanceTimersByTimeAsync(101);
    expect(await pending).toEqual({ success: false, error: "Fetch timed out after 100ms" });
    resolveDns([{ address: "93.184.216.34", family: 4 }]);
    await vi.advanceTimersByTimeAsync(1);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("shares one deadline across cloud failure and direct fallback", async () => {
    vi.useFakeTimers();
    providers.deepseek = { enabled: true, apiKey: "fixture" };
    mocks.fetch
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) =>
            setTimeout(() => reject(new TypeError("Network failed")), 75)
          )
      )
      .mockImplementationOnce(() => new Promise(() => {}));
    const pending = execute({ timeout: 100 });
    await vi.advanceTimersByTimeAsync(101);
    expect(await pending).toEqual({ success: false, error: "Fetch timed out after 100ms" });
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.fetch.mock.calls[1]?.[1].signal.aborted).toBe(true);
  });
});

describe("DeepSeek standalone tool endpoints", () => {
  it.each([
    undefined,
    "https://api.deepseek.com",
    "https://api.deepseek.com/v1",
    "https://api.deepseek.com/v1/tools",
    "https://api.deepseek.com/v1/tools/search",
  ])("normalizes the fetch route from %s", (base) => {
    expect(deepseekToolEndpoint(base, "fetch")).toBe("https://api.deepseek.com/v1/tools/fetch");
  });
  it("preserves a configured proxy path and selects search", () => {
    expect(
      deepseekToolEndpoint("https://gateway.example.com/deepseek/v1/tools/fetch", "search")
    ).toBe("https://gateway.example.com/deepseek/v1/tools/search");
  });
  it("rejects endpoint credentials and unsupported protocols", () => {
    expect(() => deepseekToolEndpoint("https://user:secret@example.com", "fetch")).toThrow(
      /without credentials/
    );
    expect(() => deepseekToolEndpoint("file:///tmp/secret", "fetch")).toThrow(/HTTP/);
  });
});
