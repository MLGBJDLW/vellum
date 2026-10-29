import { CONFIG_DEFAULTS } from "../../config/defaults.js";
import type { ResolvedWebProvider } from "./config.js";
import { deepseekToolEndpoint } from "./endpoints.js";
import { requestWeb, requestWebJson, WebHttpError } from "./http.js";

export const SEARCH_ENGINES = [
  "auto",
  "deepseek",
  "brave",
  "tavily",
  "exa",
  "serper",
  "serpapi",
  "google",
  "bing",
  "anysearch",
  "searxng",
  "duckduckgo",
] as const;
export type SearchEngine = Exclude<(typeof SEARCH_ENGINES)[number], "auto">;
export interface SearchRequest {
  query: string;
  maxResults: number;
  timeRange?: "day" | "week" | "month" | "year";
  includeDomains?: string[];
  excludeDomains?: string[];
  searchDepth?: "basic" | "advanced";
  needContent?: boolean;
}
export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  position: number;
  summary?: string;
  content?: string;
}
export interface SearchResponse {
  results: SearchResult[];
  answer?: string;
}

const URLS: Record<SearchEngine, string> = {
  deepseek: "https://api.deepseek.com/v1/tools/search",
  brave: "https://api.search.brave.com/res/v1/web/search",
  tavily: CONFIG_DEFAULTS.externalApis.tavily,
  exa: "https://api.exa.ai/search",
  serper: "https://google.serper.dev/search",
  serpapi: CONFIG_DEFAULTS.externalApis.serpapi,
  google: CONFIG_DEFAULTS.externalApis.serpapi,
  bing: CONFIG_DEFAULTS.externalApis.serpapi,
  anysearch: "https://api.anysearch.com/v1/search",
  searxng: "",
  duckduckgo: CONFIG_DEFAULTS.externalApis.duckduckgoHtml,
};
const RANGE = { day: "d", week: "w", month: "m", year: "y" } as const;

/** Reject unsupported constraints before transport rather than dropping them on fallback. */
export function searchCapabilityIssue(
  engine: SearchEngine,
  input: SearchRequest
): string | undefined {
  if (engine === "deepseek" && [...input.query.trim()].length > 128)
    return "DeepSeek Search requires 1–128 Unicode characters; shorten the query without changing its intent.";
  if (
    (input.includeDomains?.length || input.excludeDomains?.length) &&
    engine !== "tavily" &&
    engine !== "exa"
  )
    return `${engine} does not support domain filters; choose Tavily or Exa, or auto with one configured.`;
  if (input.searchDepth && engine !== "tavily")
    return `${engine} does not support searchDepth; choose Tavily.`;
  if (input.needContent && !["deepseek", "tavily", "exa"].includes(engine))
    return `${engine} does not support needContent; choose DeepSeek, Tavily or Exa.`;
  if (
    input.timeRange &&
    (["deepseek", "duckduckgo", "bing"].includes(engine) ||
      (engine === "searxng" && input.timeRange === "week"))
  )
    return `${engine} does not support the requested time range; choose a compatible service or auto.`;
  return undefined;
}

function serviceEndpoint(engine: SearchEngine, baseUrl?: string): string {
  if (engine === "deepseek") return deepseekToolEndpoint(baseUrl, "search");
  let url: URL;
  try {
    url = new URL(baseUrl || URLS[engine]);
  } catch {
    throw new WebHttpError("Invalid search provider endpoint", { code: "url" });
  }
  if (engine === "searxng" && !url.pathname.replace(/\/$/, "").endsWith("/search")) {
    url.pathname = `${url.pathname.replace(/\/$/, "")}/search`;
  } else if (url.pathname === "/" && URLS[engine]) {
    url.pathname = new URL(URLS[engine]).pathname;
  }
  return url.toString();
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
function resultUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  try {
    let url = new URL(value, "https://duckduckgo.com");
    if (url.hostname === "duckduckgo.com" || url.hostname.endsWith(".duckduckgo.com")) {
      const target = url.searchParams.get("uddg");
      if (!target) return undefined;
      url = new URL(target);
    }
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
      return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function normalizeResults(rows: unknown, maxResults: number): SearchResult[] {
  if (!Array.isArray(rows))
    throw new WebHttpError("Search service returned no results array", { code: "json" });
  const seen = new Set<string>();
  const results: SearchResult[] = [];
  for (const value of rows) {
    if (!value || typeof value !== "object") continue;
    const row = value as Record<string, unknown>;
    const url = resultUrl(row.url ?? row.link);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const highlights = Array.isArray(row.highlights)
      ? row.highlights.filter((item) => typeof item === "string").join("\n")
      : "";
    const snippet =
      text(row.snippet) ||
      text(row.description) ||
      highlights ||
      text(row.summary) ||
      text(row.content) ||
      text(row.text) ||
      text(row.raw_content);
    results.push({
      title: text(row.title).slice(0, 1000),
      url,
      snippet: snippet.slice(0, 4000),
      position: results.length + 1,
      ...(text(row.summary) && { summary: text(row.summary).slice(0, 8000) }),
      ...((text(row.raw_content) || text(row.text) || text(row.content)) && {
        content: (text(row.raw_content) || text(row.text) || text(row.content)).slice(0, 20000),
      }),
    });
    if (results.length >= maxResults) break;
  }
  return results;
}

export async function performSearch(
  engine: SearchEngine,
  input: SearchRequest,
  provider: ResolvedWebProvider,
  signal: AbortSignal,
  timeoutMs: number
): Promise<SearchResponse> {
  const issue = searchCapabilityIssue(engine, input);
  if (issue) throw new Error(issue);
  const url = new URL(serviceEndpoint(engine, provider.baseUrl));
  const headers: Record<string, string> = { Accept: "application/json" };
  const options = {
    signal,
    timeoutMs,
    maxBytes: 2 * 1024 * 1024,
    maxAttempts: 3,
    retryDelayMs: 250,
  };
  let body: Record<string, unknown> | undefined;
  const key = provider.apiKey ?? "";
  const range = input.timeRange && RANGE[input.timeRange];
  switch (engine) {
    case "deepseek":
      headers.Authorization = `Bearer ${key}`;
      body = {
        query: input.query,
        count: Math.min(input.maxResults, 50),
        need_content: input.needContent ?? false,
      };
      break;
    case "tavily":
      headers.Authorization = `Bearer ${key}`;
      body = {
        query: input.query,
        max_results: Math.min(input.maxResults, 20),
        search_depth: input.searchDepth ?? "basic",
        include_answer: true,
        ...(input.needContent && { include_raw_content: true }),
        ...(input.timeRange && { time_range: input.timeRange }),
        ...(input.includeDomains?.length && {
          include_domains: input.includeDomains,
          include_domains_mode: "restrict",
        }),
        ...(input.excludeDomains?.length && { exclude_domains: input.excludeDomains }),
      };
      break;
    case "exa":
      headers["x-api-key"] = key;
      body = {
        query: input.query,
        numResults: Math.min(input.maxResults, 100),
        type: "auto",
        contents: { highlights: true, ...(input.needContent && { text: true }) },
        ...(input.includeDomains?.length && { includeDomains: input.includeDomains }),
        ...(input.excludeDomains?.length && { excludeDomains: input.excludeDomains }),
        ...(input.timeRange && {
          startPublishedDate: new Date(
            Date.now() - { day: 1, week: 7, month: 30, year: 365 }[input.timeRange] * 86400000
          ).toISOString(),
        }),
      };
      break;
    case "brave":
      headers["X-Subscription-Token"] = key;
      url.searchParams.set("q", input.query);
      url.searchParams.set("count", String(Math.min(input.maxResults, 20)));
      if (range) url.searchParams.set("freshness", `p${range}`);
      break;
    case "serper":
      headers["X-API-KEY"] = key;
      body = {
        q: input.query,
        num: Math.min(input.maxResults, 100),
        ...(range && { tbs: `qdr:${range}` }),
      };
      break;
    case "serpapi":
    case "google":
    case "bing":
      url.searchParams.set("q", input.query);
      url.searchParams.set("api_key", key);
      url.searchParams.set("engine", engine === "bing" ? "bing" : "google");
      url.searchParams.set("num", String(Math.min(input.maxResults, 100)));
      if (range) url.searchParams.set("tbs", `qdr:${range}`);
      break;
    case "anysearch":
      if (key) headers.Authorization = `Bearer ${key}`;
      body = {
        query: input.query,
        max_results: Math.min(input.maxResults, 100),
        language: "en",
        zone: "intl",
        ...(input.timeRange && { constraint: { freshness: input.timeRange } }),
      };
      break;
    case "searxng":
      if (key) headers.Authorization = `Bearer ${key}`;
      url.searchParams.set("q", input.query);
      url.searchParams.set("format", "json");
      url.searchParams.set("pageno", "1");
      if (input.timeRange) url.searchParams.set("time_range", input.timeRange);
      break;
    case "duckduckgo": {
      url.searchParams.set("q", input.query);
      const response = await requestWeb(url.toString(), {
        ...options,
        headers: {
          Accept: "text/html",
          "User-Agent": "Mozilla/5.0 (compatible; Vellum web search)",
        },
      });
      if (/captcha|anomaly-modal|automated requests/i.test(response.body))
        throw new WebHttpError("DuckDuckGo returned a verification page", {
          code: "http",
          status: 429,
          retryable: true,
        });
      return {
        results: normalizeResults(
          parseDuckDuckGoResults(response.body, input.maxResults, input.query),
          input.maxResults
        ),
      };
    }
  }
  const data = await requestWebJson<Record<string, unknown>>(url.toString(), {
    ...options,
    headers: { ...headers, ...(body && { "Content-Type": "application/json" }) },
    ...(body && { method: "POST", body: JSON.stringify(body) }),
  });
  if (!data || typeof data !== "object")
    throw new WebHttpError("Search service returned an invalid response", { code: "json" });
  if (data.error) throw new WebHttpError("Search service rejected the request", { code: "http" });
  if (engine === "anysearch" && data.code !== undefined && data.code !== 0)
    throw new WebHttpError("AnySearch rejected the request", { code: "http" });
  // Exa may report that a constraint was ignored or relaxed: never present this as a constrained search.
  if (
    engine === "exa" &&
    ((Array.isArray(data.warnings) && data.warnings.length) ||
      (Array.isArray(data.notices) && data.notices.length))
  )
    throw new WebHttpError("Exa reported ignored or relaxed search constraints", { code: "json" });
  const rows =
    engine === "brave"
      ? (data.web as Record<string, unknown> | undefined)?.results
      : ["google", "bing", "serpapi"].includes(engine)
        ? data.organic_results
        : engine === "serper"
          ? data.organic
          : engine === "anysearch" && data.data && typeof data.data === "object"
            ? (data.data as Record<string, unknown>).results
            : data.results;
  return {
    results: normalizeResults(rows, input.maxResults),
    ...(typeof data.answer === "string" && { answer: data.answer.slice(0, 12000) }),
  };
}

function parseDuckDuckGoResults(html: string, maxResults: number, _query: string): SearchResult[] {
  const results: SearchResult[] = [];

  // Parse result blocks from DuckDuckGo HTML
  // DuckDuckGo HTML uses <div class="result"> or <div class="links_main"> patterns
  const resultRegex =
    /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([^<]*)/gi;

  // Alternative pattern for different HTML structure
  const altResultRegex =
    /<a[^>]*rel="nofollow"[^>]*href="([^"]*)"[^>]*>[\s\S]*?<span[^>]*>([^<]*)<\/span>[\s\S]*?<td[^>]*class="result-snippet"[^>]*>([^<]*)/gi;

  // Try primary pattern first
  let match: RegExpExecArray | null;
  let position = 0;

  // Reset regex state
  resultRegex.lastIndex = 0;
  // biome-ignore lint/suspicious/noAssignInExpressions: Standard regex iteration pattern
  while ((match = resultRegex.exec(html)) !== null && position < maxResults) {
    position++;
    const [, url, title, snippet] = match;
    if (url && title) {
      results.push({
        title: stripHtmlTags(decodeHTMLEntities(title.trim())),
        url: decodeHTMLEntities(url),
        snippet: stripHtmlTags(decodeHTMLEntities(snippet?.trim() || "")),
        position,
      });
    }
  }

  // If no results, try alternative pattern
  if (results.length === 0) {
    position = 0; // Reset position for alt pattern
    altResultRegex.lastIndex = 0;
    // biome-ignore lint/suspicious/noAssignInExpressions: Standard regex iteration pattern
    while ((match = altResultRegex.exec(html)) !== null && position < maxResults) {
      position++;
      const [, url, title, snippet] = match;
      if (url && title) {
        results.push({
          title: stripHtmlTags(decodeHTMLEntities(title.trim())),
          url: decodeHTMLEntities(url),
          snippet: stripHtmlTags(decodeHTMLEntities(snippet?.trim() || "")),
          position,
        });
      }
    }
  }

  // Fallback: try to extract any links with reasonable content
  if (results.length === 0) {
    const linkRegex = /<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([^<]{10,})<\/a>/gi;
    linkRegex.lastIndex = 0;
    const seenUrls = new Set<string>();

    // biome-ignore lint/suspicious/noAssignInExpressions: Standard regex iteration pattern
    while ((match = linkRegex.exec(html)) !== null && results.length < maxResults) {
      const [, url, title] = match;
      // Skip DuckDuckGo internal links and duplicates
      if (url && title && !url.includes("duckduckgo.com") && !seenUrls.has(url)) {
        seenUrls.add(url);
        results.push({
          title: stripHtmlTags(decodeHTMLEntities(title.trim())),
          url: decodeHTMLEntities(url),
          snippet: "",
          position: results.length + 1,
        });
      }
    }
  }

  return results;
}

/**
 * Decode HTML entities in text
 */
function decodeHTMLEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number.parseInt(dec, 10)));
}

/**
 * Strip HTML formatting tags from text (bold, italic, span, etc.)
 * Preserves decoded angle brackets that are part of content text.
 */
function stripHtmlTags(html: string): string {
  return (
    html
      // Remove common inline formatting tags (require word boundary or space after tag name)
      .replace(/<\/?b\s*>/gi, "")
      .replace(/<\/?i\s*>/gi, "")
      .replace(/<\/?em\s*>/gi, "")
      .replace(/<\/?strong\s*>/gi, "")
      .replace(/<\/?span(?:\s[^>]*)?\s*>/gi, "")
      .replace(/<br\s*\/?>/gi, " ")
      .trim()
  );
}
