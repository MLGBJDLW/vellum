import {
  configureWebTools,
  fetchTool,
  searchTool,
  type ToolContext,
  WEB_PROVIDER_IDS,
  type WebToolSettings,
} from "@vellum/core";
import { fetchWithPool } from "@vellum/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { webSearchCommand } from "../search.js";
import type { CommandContext } from "../types.js";
import { configureWebToolsForCli } from "../web-tools-runtime.js";

const persistence = vi.hoisted(() => ({ settings: {} as { search?: WebToolSettings } }));
vi.mock("../../tui/i18n/settings-integration.js", () => ({
  loadSettings: () => structuredClone(persistence.settings),
  saveSettings: (settings: typeof persistence.settings) => {
    persistence.settings = structuredClone(settings);
    return true;
  },
}));
vi.mock("@vellum/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@vellum/shared")>()),
  fetchWithPool: vi.fn(),
}));
vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]),
}));

interface CapturedRequest {
  url: URL;
  authorization: string | null;
  body: Record<string, unknown>;
}
const requests: CapturedRequest[] = [];
const fetchMock = vi.mocked(fetchWithPool);

function commandContext(
  keys = new Map([["deepseek", "fixture-existing-model-key"]])
): CommandContext {
  return {
    parsedArgs: { positional: [], named: {}, raw: "", command: "websearch" },
    credentials: {
      resolve: vi.fn(async (provider: string) => ({
        ok: true,
        value: keys.has(provider) ? { type: "api_key", value: keys.get(provider) } : null,
      })),
      store: vi.fn(async (input: { provider: string; value: string }) => {
        keys.set(input.provider, input.value);
        return { ok: true, value: input };
      }),
    },
  } as unknown as CommandContext;
}

function toolContext(): ToolContext {
  return {
    workingDir: process.cwd(),
    sessionId: "fixture",
    messageId: "fixture",
    callId: "fixture",
    abortSignal: new AbortController().signal,
    checkPermission: vi.fn(async () => true),
  };
}

async function configure(ctx: CommandContext, ...args: string[]): Promise<void> {
  const result = await webSearchCommand.execute({
    ...ctx,
    parsedArgs: { ...ctx.parsedArgs, positional: args },
  });
  expect(result.kind).toBe("success");
}

function recordRequest(
  url: string | URL,
  options: Parameters<typeof fetchWithPool>[1]
): CapturedRequest {
  const request = {
    url: new URL(url.toString()),
    authorization: new Headers(options?.headers as Record<string, string>).get("authorization"),
    body:
      typeof options?.body === "string"
        ? (JSON.parse(options.body) as Record<string, unknown>)
        : {},
  };
  requests.push(request);
  return request;
}

beforeEach(() => {
  persistence.settings = {
    search: { providers: { deepseek: { baseUrl: "https://deepseek.fixture" } } },
  };
  requests.length = 0;
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url, options) => {
    const request = recordRequest(url, options);
    return new Response(
      JSON.stringify(
        request.url.pathname.endsWith("/fetch")
          ? { title: "Fixture page", content: "Extracted fixture content" }
          : {
              results: [
                {
                  title: "Fixture source",
                  url: "https://example.com/page",
                  snippet: "Fixture result",
                },
              ],
            }
      ),
      { headers: { "content-type": "application/json" } }
    );
  });
  for (const provider of WEB_PROVIDER_IDS) {
    vi.stubEnv(`${provider.toUpperCase()}_API_KEY`, "");
    vi.stubEnv(`${provider.toUpperCase()}_BASE_URL`, "");
  }
  vi.stubEnv("BRAVE_SEARCH_API_KEY", "");
  vi.stubEnv("SERPAPI_KEY", "");
});
afterEach(() => {
  configureWebTools();
  vi.unstubAllEnvs();
});

describe("CLI configuration reaches search and fetch transports", () => {
  it("uses the existing DeepSeek model key for both actual tool API requests", async () => {
    const cli = commandContext();
    configureWebToolsForCli(cli.credentials);
    const ctx = toolContext();
    const search = await searchTool.execute(
      searchTool.definition.parameters.parse({ query: "Vellum fixture" }),
      ctx
    );
    const fetch = await fetchTool.execute(
      fetchTool.definition.parameters.parse({ url: "https://example.com/page" }),
      ctx
    );
    expect(search).toMatchObject({
      success: true,
      output: { engineUsed: "deepseek", totalResults: 1 },
    });
    expect(fetch).toMatchObject({
      success: true,
      output: { providerUsed: "deepseek", content: "Extracted fixture content" },
    });
    expect(requests.map((request) => request.url.toString())).toEqual([
      "https://deepseek.fixture/v1/tools/search",
      "https://deepseek.fixture/v1/tools/fetch",
    ]);
    expect(requests.map((request) => request.authorization)).toEqual([
      "Bearer fixture-existing-model-key",
      "Bearer fixture-existing-model-key",
    ]);
    expect(requests[0]?.body).toMatchObject({
      query: "Vellum fixture",
      count: 10,
      need_content: false,
    });
    expect(requests[1]?.body).toEqual({ url: "https://example.com/page" });
    expect(cli.credentials.store).not.toHaveBeenCalled();
    expect(JSON.stringify(persistence.settings)).not.toContain("fixture-existing-model-key");
  });

  it("uses persisted command changes and a dedicated key on the next call without restarting", async () => {
    const cli = commandContext();
    configureWebToolsForCli(cli.credentials);
    const ctx = toolContext();
    expect(
      (await searchTool.execute(searchTool.definition.parameters.parse({ query: "First" }), ctx))
        .success
    ).toBe(true);
    await configure(cli, "results", "3");
    await configure(cli, "endpoint", "deepseek", "https://changed.fixture/v1");
    await configure(cli, "key", "deepseek", "fixture-dedicated-web-key");
    vi.stubEnv("DEEPSEEK_API_KEY", "fixture-shared-env-key");
    const search = await searchTool.execute(
      searchTool.definition.parameters.parse({ query: "Second" }),
      ctx
    );
    const fetch = await fetchTool.execute(
      fetchTool.definition.parameters.parse({ url: "https://example.com/page" }),
      ctx
    );
    expect(search.success).toBe(true);
    expect(fetch.success).toBe(true);
    expect(requests[1]?.url.toString()).toBe("https://changed.fixture/v1/tools/search");
    expect(requests[2]?.url.toString()).toBe("https://changed.fixture/v1/tools/fetch");
    expect(requests[1]?.body.count).toBe(3);
    expect(
      requests
        .slice(1)
        .every((request) => request.authorization === "Bearer fixture-dedicated-web-key")
    ).toBe(true);
    expect(JSON.stringify(persistence.settings)).not.toContain("fixture-dedicated-web-key");
  });

  it("honors explicit plaintext overrides and provider disable for both tools", async () => {
    persistence.settings.search = {
      engine: "deepseek",
      fetchProvider: "deepseek",
      providers: {
        deepseek: { apiKey: "fixture-explicit-key", baseUrl: "https://explicit.fixture" },
      },
    };
    const cli = commandContext();
    configureWebToolsForCli(cli.credentials);
    const ctx = toolContext();
    expect(
      (await searchTool.execute(searchTool.definition.parameters.parse({ query: "First" }), ctx))
        .success
    ).toBe(true);
    expect(
      (
        await fetchTool.execute(
          fetchTool.definition.parameters.parse({ url: "https://example.com/page" }),
          ctx
        )
      ).success
    ).toBe(true);
    expect(
      requests.every((request) => request.authorization === "Bearer fixture-explicit-key")
    ).toBe(true);
    await configure(cli, "disable", "deepseek");
    expect(
      await searchTool.execute(searchTool.definition.parameters.parse({ query: "Second" }), ctx)
    ).toMatchObject({ success: false, error: expect.stringContaining("disabled") });
    expect(
      await fetchTool.execute(
        fetchTool.definition.parameters.parse({ url: "https://example.com/page" }),
        ctx
      )
    ).toMatchObject({ success: false, error: expect.stringContaining("disabled") });
    expect(requests).toHaveLength(2);
  });

  it.each(["search", "fetch"] as const)(
    "includes permission waits in %s's configured total deadline",
    async (tool) => {
      persistence.settings.search = { engine: "deepseek", fetchProvider: "deepseek", timeout: 30 };
      configureWebToolsForCli(commandContext().credentials);
      const ctx = toolContext();
      ctx.checkPermission = vi.fn(() => new Promise<boolean>(() => {}));
      const result =
        tool === "search"
          ? await searchTool.execute(
              searchTool.definition.parameters.parse({ query: "Fixture" }),
              ctx
            )
          : await fetchTool.execute(
              fetchTool.definition.parameters.parse({ url: "https://example.com/page" }),
              ctx
            );
      expect(result).toMatchObject({ success: false, error: expect.stringMatching(/timed out/i) });
      expect(requests).toHaveLength(0);
    }
  );

  it("preserves domain, time and content constraints when auto falls back between configured services", async () => {
    persistence.settings.search = {
      engine: "auto",
      timeout: 5000,
      providers: {
        tavily: { baseUrl: "https://tavily.fixture/search" },
        exa: { baseUrl: "https://exa.fixture/search" },
      },
    };
    const cli = commandContext(
      new Map([
        ["deepseek", "fixture-model-key"],
        ["web:tavily", "fixture-tavily-key"],
        ["web:exa", "fixture-exa-key"],
      ])
    );
    configureWebToolsForCli(cli.credentials);
    fetchMock.mockImplementation(async (url, options) => {
      const request = recordRequest(url, options);
      if (request.url.hostname === "tavily.fixture")
        return new Response("temporary failure", { status: 503 });
      return new Response(
        JSON.stringify({
          results: [
            { title: "Filtered", url: "https://example.com/source", text: "Fixture content" },
          ],
        })
      );
    });
    const result = await searchTool.execute(
      searchTool.definition.parameters.parse({
        query: "Constraint fixture",
        includeDomains: ["example.com"],
        excludeDomains: ["excluded.example.com"],
        timeRange: "week",
        needContent: true,
      }),
      toolContext()
    );
    expect(result).toMatchObject({ success: true, output: { engineUsed: "exa (fallback)" } });
    expect(requests).toHaveLength(4);
    expect(requests.map((request) => request.url.hostname)).toEqual([
      "tavily.fixture",
      "tavily.fixture",
      "tavily.fixture",
      "exa.fixture",
    ]);
    expect(requests[0]?.body).toMatchObject({
      include_domains: ["example.com"],
      exclude_domains: ["excluded.example.com"],
      time_range: "week",
      include_raw_content: true,
    });
    expect(requests[3]?.body).toMatchObject({
      includeDomains: ["example.com"],
      excludeDomains: ["excluded.example.com"],
      startPublishedDate: expect.any(String),
      contents: { text: true },
    });
  });
});
