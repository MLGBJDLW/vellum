import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeepSeekProvider } from "../deepseek.js";
import { OpenAIProvider } from "../openai.js";
import { ProviderRegistry } from "../registry.js";

const providers = [
  "deepseek",
  "qwen",
  "groq",
  "xai",
  "openrouter",
  "zhipu",
  "moonshot",
  "mistral",
  "minimax",
  "yi",
  "baichuan",
  "doubao",
] as const;
beforeEach(() => {
  for (const provider of providers) {
    vi.stubEnv(`${provider.toUpperCase()}_API_KEY`, "");
    vi.stubEnv(`${provider.toUpperCase()}_BASE_URL`, "");
  }
  for (const alias of [
    "DASHSCOPE_API_KEY",
    "MOONSHOTAI_API_KEY",
    "ZHIPUAI_API_KEY",
    "ZAI_API_KEY",
    "ARK_API_KEY",
  ])
    vi.stubEnv(alias, "");
  vi.stubEnv("OPENAI_API_KEY", "sk-openai-only-fixture");
  vi.stubEnv("OPENAI_ORG_ID", "org-openai-only");
  vi.stubEnv("OPENAI_PROJECT_ID", "proj-openai-only");
  vi.stubEnv("OPENAI_BASE_URL", "https://openai-only.example/v1");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("provider credential isolation", () => {
  it.each(providers)("never borrows OpenAI credentials for %s", async (type) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const registry = new ProviderRegistry();
    expect(registry.getSync(type).isConfigured?.()).toBe(false);
    await expect(registry.get({ type })).rejects.toMatchObject({ retryable: false });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses only DeepSeek env credentials and endpoint, without OpenAI account headers", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "deepseek-own-fixture");
    vi.stubEnv("DEEPSEEK_BASE_URL", "https://deepseek-only.example/v1");
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { role: "assistant", content: "OK" }, finish_reason: "stop" }],
          }),
          { headers: { "content-type": "application/json" } }
        )
    );
    vi.stubGlobal("fetch", fetch);
    const provider = new DeepSeekProvider();
    expect(provider.isConfigured()).toBe(true);
    await provider.initialize({});
    await provider.complete({
      model: "deepseek-flash",
      messages: [{ role: "user", content: "OK" }],
    });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toBe("https://deepseek-only.example/v1/chat/completions");
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBe("Bearer deepseek-own-fixture");
    expect(headers.has("openai-organization")).toBe(false);
    expect(headers.has("openai-project")).toBe(false);
  });

  it("keeps native OpenAI env configuration available", async () => {
    const provider = new OpenAIProvider();
    expect(provider.isConfigured()).toBe(true);
    await expect(provider.initialize({})).resolves.toBeUndefined();
  });
});
