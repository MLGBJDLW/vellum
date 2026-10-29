import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  configureWebTools,
  getWebToolSettings,
  resolveWebProvider,
  WEB_PROVIDER_IDS,
  type WebToolSettings,
} from "../config.js";

beforeEach(() => {
  for (const provider of WEB_PROVIDER_IDS) {
    vi.stubEnv(`${provider.toUpperCase()}_API_KEY`, "");
    vi.stubEnv(`${provider.toUpperCase()}_BASE_URL`, "");
  }
  vi.stubEnv("SERPAPI_KEY", "");
  vi.stubEnv("BRAVE_SEARCH_API_KEY", "");
});

afterEach(() => {
  configureWebTools();
  vi.unstubAllEnvs();
});

describe("web tool configuration and credential owner", () => {
  it("automatically reuses only the DeepSeek model credential", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    vi.stubEnv("DEEPSEEK_BASE_URL", "");
    const resolveCredential = vi.fn(async (provider: string) =>
      provider === "deepseek"
        ? { apiKey: "stored-deepseek", baseUrl: "https://deepseek-gateway.example/v1" }
        : undefined
    );
    configureWebTools({ resolveCredential });
    expect(await resolveWebProvider("deepseek")).toEqual({
      enabled: true,
      apiKey: "stored-deepseek",
      baseUrl: "https://deepseek-gateway.example/v1",
    });
    expect(resolveCredential).toHaveBeenCalledExactlyOnceWith("deepseek");
  });

  it("honors provider settings and legacy keys before environment and manager values", async () => {
    vi.stubEnv("TAVILY_API_KEY", "environment");
    vi.stubEnv("TAVILY_BASE_URL", "https://env.example");
    const settings: WebToolSettings = {
      tavilyApiKey: "legacy",
      providers: { tavily: { apiKey: "explicit", baseUrl: "https://explicit.example" } },
    };
    const resolveCredential = vi.fn(
      async (): Promise<{ apiKey: string } | undefined> => ({ apiKey: "stored" })
    );
    configureWebTools({ getSettings: () => settings, resolveCredential });
    expect(await resolveWebProvider("tavily")).toEqual({
      enabled: true,
      apiKey: "explicit",
      baseUrl: "https://explicit.example",
    });
    delete settings.providers?.tavily?.apiKey;
    expect((await resolveWebProvider("tavily")).apiKey).toBe("legacy");
    expect(resolveCredential).not.toHaveBeenCalled();
    delete settings.tavilyApiKey;
    expect((await resolveWebProvider("tavily")).apiKey).toBe("stored");
    resolveCredential.mockResolvedValue(undefined);
    expect((await resolveWebProvider("tavily")).apiKey).toBe("environment");
  });

  it("a disabled provider ignores all credential sources", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "environment");
    const resolveCredential = vi.fn();
    configureWebTools({
      getSettings: () => ({ providers: { deepseek: { enabled: false, apiKey: "explicit" } } }),
      resolveCredential,
    });
    expect(await resolveWebProvider("deepseek")).toEqual({ enabled: false });
    expect(resolveCredential).not.toHaveBeenCalled();
  });

  it("never falls back to a different provider key", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "deepseek-only");
    vi.stubEnv("TAVILY_API_KEY", "");
    const resolveCredential = vi.fn(async () => undefined);
    configureWebTools({ resolveCredential });
    expect(await resolveWebProvider("tavily")).toEqual({ enabled: true });
    expect(resolveCredential).toHaveBeenCalledExactlyOnceWith("tavily");
    expect(await resolveWebProvider("openai")).toEqual({ enabled: false });
    expect(resolveCredential).toHaveBeenCalledTimes(1);
  });

  it("supports SerpAPI legacy env and credentialless SearXNG/native", async () => {
    vi.stubEnv("SERPAPI_API_KEY", "");
    vi.stubEnv("SERPAPI_KEY", "legacy-env");
    const resolveCredential = vi.fn();
    configureWebTools({
      getSettings: () => ({ providers: { searxng: { baseUrl: "https://search.example" } } }),
      resolveCredential,
    });
    expect((await resolveWebProvider("serpapi")).apiKey).toBe("legacy-env");
    expect(await resolveWebProvider("searxng")).toEqual({
      enabled: true,
      baseUrl: "https://search.example",
    });
    expect(await resolveWebProvider("native")).toEqual({ enabled: true });
    expect(resolveCredential).toHaveBeenCalledWith("serpapi");
    expect(resolveCredential).toHaveBeenCalledWith("searxng");
    expect(resolveCredential).not.toHaveBeenCalledWith("direct");
    resolveCredential.mockResolvedValue({ apiKey: "optional-instance-key" });
    expect((await resolveWebProvider("searxng")).apiKey).toBe("optional-instance-key");
  });

  it("prefers dedicated manager credentials over a shared model environment key", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "environment");
    vi.stubEnv("DEEPSEEK_BASE_URL", "");
    configureWebTools({
      resolveCredential: async () => ({ apiKey: "stored", baseUrl: "https://gateway.example/v1" }),
    });
    expect(await resolveWebProvider("deepseek")).toEqual({
      enabled: true,
      apiKey: "stored",
      baseUrl: "https://gateway.example/v1",
    });
  });

  it("reads current settings but returns independent snapshots", () => {
    const settings: WebToolSettings = {
      engine: "deepseek",
      providers: { deepseek: { enabled: true } },
    };
    configureWebTools({ getSettings: () => settings });
    const first = getWebToolSettings();
    if (first.providers?.deepseek) first.providers.deepseek.enabled = false;
    expect(getWebToolSettings().providers?.deepseek?.enabled).toBe(true);
    settings.engine = "searxng";
    expect(getWebToolSettings().engine).toBe("searxng");
  });
});
