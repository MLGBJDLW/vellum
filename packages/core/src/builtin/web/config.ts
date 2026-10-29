/** Search and extraction share the application's settings and credential owner. */
export const WEB_PROVIDER_IDS = [
  "deepseek",
  "tavily",
  "brave",
  "serpapi",
  "exa",
  "serper",
  "jina",
  "firecrawl",
  "anysearch",
  "searxng",
  "duckduckgo",
  "direct",
] as const;

export type WebProviderId = (typeof WEB_PROVIDER_IDS)[number];
export type WebSearchEngine =
  | "auto"
  | "google"
  | "bing"
  | "duckduckgo"
  | "deepseek"
  | "tavily"
  | "brave"
  | "serpapi"
  | "exa"
  | "serper"
  | "anysearch"
  | "searxng";
export type WebFetchProvider =
  | "auto"
  | "direct"
  | "native"
  | "deepseek"
  | "tavily"
  | "jina"
  | "firecrawl";

export interface WebProviderSettings {
  enabled?: boolean;
  apiKey?: string;
  baseUrl?: string;
}

export interface WebToolSettings {
  engine?: WebSearchEngine;
  searchDepth?: "basic" | "advanced";
  defaultMaxResults?: number;
  /** Read compatibility for settings saved by earlier versions. */
  tavilyApiKey?: string;
  serpApiKey?: string;
  fetchProvider?: WebFetchProvider;
  providers?: Partial<Record<WebProviderId, WebProviderSettings>>;
  /** Total tool deadline in milliseconds, including fallback attempts. */
  timeout?: number;
  fallback?: boolean;
}

export interface WebToolRuntime {
  getSettings?: () => WebToolSettings;
  resolveCredential?: (
    provider: string
  ) => Promise<{ apiKey: string; baseUrl?: string } | undefined>;
}

export interface ResolvedWebProvider {
  apiKey?: string;
  baseUrl?: string;
  enabled: boolean;
}

let runtime: WebToolRuntime = {};

/** Configure callbacks only; credentials and settings remain in their existing stores. */
export function configureWebTools(configuration: WebToolRuntime = {}): void {
  runtime = { ...configuration };
}

/** Read current settings for every invocation so interactive changes take effect immediately. */
export function getWebToolSettings(): WebToolSettings {
  return structuredClone(runtime.getSettings?.() ?? {});
}

const ENV_KEYS: Partial<Record<WebProviderId, readonly string[]>> = {
  deepseek: ["DEEPSEEK_API_KEY"],
  tavily: ["TAVILY_API_KEY"],
  brave: ["BRAVE_SEARCH_API_KEY", "BRAVE_API_KEY"],
  serpapi: ["SERPAPI_API_KEY", "SERPAPI_KEY"],
  exa: ["EXA_API_KEY"],
  serper: ["SERPER_API_KEY"],
  jina: ["JINA_API_KEY"],
  firecrawl: ["FIRECRAWL_API_KEY"],
  anysearch: ["ANYSEARCH_API_KEY"],
  searxng: ["SEARXNG_API_KEY"],
};

function nonEmpty(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Resolve one service only. A DeepSeek model credential may be reused for
 * DeepSeek's web API; no other provider's credential is ever requested.
 * Explicit settings win over the injected manager, then environment fallback.
 * The manager can prioritize a dedicated web credential over a shared model key.
 */
export async function resolveWebProvider(provider: string): Promise<ResolvedWebProvider> {
  const normalized = provider.trim().toLowerCase();
  const name = (normalized === "native" ? "direct" : normalized) as WebProviderId;
  if (!WEB_PROVIDER_IDS.includes(name)) return { enabled: false };
  const settings = getWebToolSettings();
  const configured = settings.providers?.[name];
  if (configured?.enabled === false) return { enabled: false };

  const legacyKey =
    name === "tavily"
      ? settings.tavilyApiKey
      : name === "serpapi"
        ? settings.serpApiKey
        : undefined;
  const environmentKey = ENV_KEYS[name]?.map((key) => nonEmpty(process.env[key])).find(Boolean);
  const explicitKey = nonEmpty(configured?.apiKey) ?? nonEmpty(legacyKey);
  const explicitBaseUrl =
    nonEmpty(configured?.baseUrl) ?? nonEmpty(process.env[`${name.toUpperCase()}_BASE_URL`]);
  // A credential-less local/raw provider does not need to consult key storage.
  let credential: { apiKey: string; baseUrl?: string } | undefined;
  if ((!explicitKey || !explicitBaseUrl) && name !== "direct" && name !== "duckduckgo") {
    try {
      credential = await runtime.resolveCredential?.(name);
    } catch {
      // An explicit key remains usable when optional key storage is unavailable.
      if (!explicitKey && !environmentKey)
        throw new Error(`Unable to resolve web credentials for ${name}`);
    }
  }
  const apiKey = explicitKey ?? nonEmpty(credential?.apiKey) ?? environmentKey;
  const baseUrl = explicitBaseUrl ?? nonEmpty(credential?.baseUrl);
  return {
    enabled: true,
    ...(apiKey && { apiKey }),
    ...(baseUrl && { baseUrl }),
  };
}
