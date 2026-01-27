/**
 * Web Search Tool
 *
 * Performs web searches using DuckDuckGo HTML search or SerpAPI.
 * Returns ranked search results with titles, URLs, and snippets.
 *
 * @module builtin/web-search
 */

import { fetchWithPool } from "@vellum/shared";
import { z } from "zod";
import { CONFIG_DEFAULTS } from "../config/defaults.js";
import { defineTool, fail, ok } from "../types/index.js";
import type { ToolResult } from "../types/tool.js";

/** Default maximum number of search results */
const DEFAULT_MAX_RESULTS = 10;

/** Retry configuration */
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,
} as const;

/**
 * Error class for HTTP errors with status code tracking
 */
class HttpError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/**
 * Determines if an error is retryable (429, 5xx, or network error)
 */
function isRetryableHttpError(error: unknown): boolean {
  if (error instanceof HttpError) {
    // Retry on rate limit (429) or server errors (5xx)
    return error.status === 429 || (error.status >= 500 && error.status < 600);
  }
  // Retry on network errors (fetch failures)
  if (error instanceof TypeError && error.message.includes("fetch")) {
    return true;
  }
  return false;
}

/**
 * Sleeps for specified duration, respecting AbortSignal
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error("Aborted"));
      return;
    }

    const abortHandler = () => {
      clearTimeout(timeoutId);
      reject(signal?.reason ?? new Error("Aborted"));
    };

    const timeoutId = setTimeout(() => {
      signal?.removeEventListener("abort", abortHandler);
      resolve();
    }, ms);

    signal?.addEventListener("abort", abortHandler, { once: true });
  });
}

/**
 * Wraps an async function with retry logic using exponential backoff.
 * Retries on HTTP 429, 5xx, and network errors.
 *
 * @param fn - The async function to execute with retries
 * @param signal - Optional AbortSignal to cancel retries
 * @returns The result of the function
 * @throws The last error if all retries are exhausted or non-retryable error
 */
async function withHttpRetry<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  let lastError: Error = new Error("No attempts made");

  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    // Check abort before each attempt
    if (signal?.aborted) {
      throw signal.reason ?? new Error("Aborted");
    }

    try {
      return await fn();
    } catch (error) {
      // If aborted during request, don't retry
      if (signal?.aborted) {
        throw error;
      }

      // Only retry on retryable errors
      if (!isRetryableHttpError(error)) {
        throw error;
      }

      lastError = error instanceof Error ? error : new Error(String(error));

      // Wait before retry (exponential backoff: 1s, 2s, 4s)
      if (attempt < RETRY_CONFIG.maxRetries) {
        const delayMs = RETRY_CONFIG.baseDelayMs * 2 ** attempt;
        await sleep(delayMs, signal);
      }
    }
  }

  throw lastError;
}

/** Default timeout for search requests (15 seconds) */
const DEFAULT_TIMEOUT = CONFIG_DEFAULTS.timeouts.webSearch;

/** DuckDuckGo HTML search base URL */
const DUCKDUCKGO_HTML_URL = CONFIG_DEFAULTS.externalApis.duckduckgoHtml;

/** SerpAPI base URL */
const SERPAPI_BASE_URL = CONFIG_DEFAULTS.externalApis.serpapi;

/** Tavily API base URL */
const TAVILY_API_URL = CONFIG_DEFAULTS.externalApis.tavily;

/**
 * Sanitize sensitive parameters from URLs/strings to prevent API key leakage in logs
 */
function sanitizeApiKey(text: string): string {
  return text.replace(/api_key=[^&\s]+/gi, "api_key=[REDACTED]");
}

/**
 * Schema for web_search tool parameters
 */
export const webSearchParamsSchema = z.object({
  /** Search query string */
  query: z.string().min(1).describe("The search query"),
  /** Maximum number of results to return (default: 10) */
  maxResults: z
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .default(DEFAULT_MAX_RESULTS)
    .describe("Maximum number of results to return (default: 10)"),
  /** Search engine to use (default: auto) */
  engine: z
    .enum(["google", "duckduckgo", "bing", "tavily", "auto"])
    .optional()
    .default("auto")
    .describe(
      "Search engine to use (default: auto - uses Tavily if API key available, else DuckDuckGo)"
    ),
  /** Time range filter for search results (Tavily only) */
  timeRange: z
    .enum(["day", "week", "month", "year"])
    .optional()
    .describe("Filter results by time range (Tavily only)"),
  /** Domains to include in search (Tavily only) */
  includeDomains: z
    .array(z.string())
    .optional()
    .describe("Only include results from these domains (Tavily only)"),
  /** Domains to exclude from search (Tavily only) */
  excludeDomains: z
    .array(z.string())
    .optional()
    .describe("Exclude results from these domains (Tavily only)"),
  /** Search depth - basic is faster, advanced is more thorough (Tavily only) */
  searchDepth: z
    .enum(["basic", "advanced"])
    .optional()
    .describe("Search depth - basic is faster, advanced is more thorough (Tavily only)"),
});

/** Inferred type for web_search parameters */
export type WebSearchParams = z.infer<typeof webSearchParamsSchema>;

/** Single search result */
export interface SearchResult {
  /** Title of the search result */
  title: string;
  /** URL of the search result */
  url: string;
  /** Snippet/description text */
  snippet: string;
  /** Position in search results (1-indexed) */
  position: number;
}

/** Output type for web_search tool */
export interface WebSearchOutput {
  /** Search query that was executed */
  query: string;
  /** Search engine used */
  engine: string;
  /** Actual engine used (may differ from requested if fallback occurred) */
  engineUsed: string;
  /** Array of search results */
  results: SearchResult[];
  /** Total number of results returned */
  totalResults: number;
  /** AI-generated answer summary (Tavily only) */
  answer?: string;
}

/**
 * Parse DuckDuckGo HTML search results
 */
function parseDuckDuckGoResults(html: string, maxResults: number, query: string): SearchResult[] {
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

  // Warn when all parsing patterns failed - helps debug when DuckDuckGo changes HTML structure
  if (results.length === 0) {
    console.warn("[web-search] DuckDuckGo HTML parsing failed for all patterns", {
      query,
      htmlLength: html.length,
      htmlPreview: html.slice(0, 200),
    });
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

/**
 * Search using DuckDuckGo HTML interface
 */
async function searchDuckDuckGo(
  query: string,
  maxResults: number,
  signal: AbortSignal
): Promise<ToolResult<WebSearchOutput>> {
  const params = new URLSearchParams({
    q: query,
    kl: "us-en", // US English results
  });

  try {
    return await withHttpRetry(async () => {
      const response = await fetchWithPool(`${DUCKDUCKGO_HTML_URL}?${params.toString()}`, {
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal,
      });

      if (!response.ok) {
        // Throw HttpError to trigger retry for 429/5xx
        throw new HttpError(
          `DuckDuckGo search failed with status ${response.status}`,
          response.status
        );
      }

      const html = await response.text();
      const results = parseDuckDuckGoResults(html, maxResults, query);

      return ok({
        query,
        engine: "duckduckgo",
        engineUsed: "duckduckgo",
        results,
        totalResults: results.length,
      });
    }, signal);
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        return fail("Search request was cancelled");
      }
      return fail(`DuckDuckGo search failed: ${error.message}`);
    }
    return fail("Unknown error during DuckDuckGo search");
  }
}

/**
 * Search using SerpAPI (requires API key in environment)
 */
async function searchWithSerpAPI(
  query: string,
  maxResults: number,
  engine: "google" | "bing",
  signal: AbortSignal
): Promise<ToolResult<WebSearchOutput>> {
  const apiKey = process.env.SERPAPI_KEY || process.env.SERPAPI_API_KEY;

  if (!apiKey) {
    return fail(
      `SerpAPI key not found. Set SERPAPI_KEY environment variable to use ${engine} search, or use 'duckduckgo' engine instead.`
    );
  }

  const params = new URLSearchParams({
    q: query,
    api_key: apiKey,
    engine,
    num: String(maxResults),
  });

  try {
    return await withHttpRetry(async () => {
      const response = await fetchWithPool(`${SERPAPI_BASE_URL}?${params.toString()}`, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        signal,
      });

      if (!response.ok) {
        // Throw HttpError to trigger retry for 429/5xx
        const errorText = await response.text();
        throw new HttpError(
          `SerpAPI request failed (${response.status}): ${sanitizeApiKey(errorText)}`,
          response.status
        );
      }

      interface SerpApiResult {
        title?: string;
        link?: string;
        snippet?: string;
      }

      const data = (await response.json()) as { organic_results?: SerpApiResult[] };
      const organicResults = data.organic_results || [];

      const results: SearchResult[] = organicResults.slice(0, maxResults).map((item, index) => ({
        title: item.title || "",
        url: item.link || "",
        snippet: item.snippet || "",
        position: index + 1,
      }));

      return ok({
        query,
        engine,
        engineUsed: engine,
        results,
        totalResults: results.length,
      });
    }, signal);
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        return fail("Search request was cancelled");
      }
      return fail(`SerpAPI search failed: ${sanitizeApiKey(error.message)}`);
    }
    return fail("Unknown error during SerpAPI search");
  }
}

/** Tavily time range mapping from user-friendly to API format */
const TAVILY_TIME_RANGE_MAP: Record<string, "d" | "w" | "m" | "y"> = {
  day: "d",
  week: "w",
  month: "m",
  year: "y",
};

/**
 * Tavily API response types
 */
interface TavilyApiResult {
  title: string;
  url: string;
  content: string;
  score?: number;
}

interface TavilyApiResponse {
  results: TavilyApiResult[];
  answer?: string;
  query: string;
}

/**
 * Search using Tavily API (requires TAVILY_API_KEY)
 * Tavily provides AI-powered search with optional answer generation.
 */
async function searchTavily(
  query: string,
  options: {
    apiKey: string;
    maxResults?: number;
    searchDepth?: "basic" | "advanced";
    includeDomains?: string[];
    excludeDomains?: string[];
    timeRange?: "d" | "w" | "m" | "y";
  },
  signal: AbortSignal
): Promise<{ results: SearchResult[]; answer?: string }> {
  const requestBody = {
    api_key: options.apiKey,
    query,
    search_depth: options.searchDepth || "basic",
    include_answer: true,
    max_results: options.maxResults || DEFAULT_MAX_RESULTS,
    ...(options.includeDomains?.length && { include_domains: options.includeDomains }),
    ...(options.excludeDomains?.length && { exclude_domains: options.excludeDomains }),
    ...(options.timeRange && { time_range: options.timeRange }),
  };

  const response = await fetchWithPool(TAVILY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new HttpError(
      `Tavily API request failed (${response.status}): ${sanitizeApiKey(errorText)}`,
      response.status
    );
  }

  const data = (await response.json()) as TavilyApiResponse;

  const results: SearchResult[] = (data.results || []).map((item, index) => ({
    title: item.title || "",
    url: item.url || "",
    snippet: item.content || "",
    position: index + 1,
  }));

  return {
    results,
    answer: data.answer,
  };
}

/**
 * Web search tool implementation
 *
 * Performs web searches using DuckDuckGo (default) or SerpAPI for Google/Bing.
 * DuckDuckGo is free and requires no API key.
 * Google/Bing searches require a SerpAPI key in the environment.
 *
 * @example
 * ```typescript
 * // Simple DuckDuckGo search
 * const result = await webSearchTool.execute(
 *   { query: "typescript best practices" },
 *   ctx
 * );
 *
 * // Google search with SerpAPI
 * const result = await webSearchTool.execute(
 *   { query: "react hooks tutorial", engine: "google", maxResults: 5 },
 *   ctx
 * );
 * ```
 */
export const webSearchTool = defineTool({
  name: "web_search",
  description:
    "Search the web for information. Returns ranked results with titles, URLs, and snippets. Uses auto engine selection by default (Tavily if TAVILY_API_KEY is set, else DuckDuckGo). For Google or Bing, requires SERPAPI_KEY. Tavily supports advanced options like time filtering and domain restrictions.",
  parameters: webSearchParamsSchema,
  kind: "read",
  category: "network",

  async execute(input, ctx) {
    // Track start time for timeout budget management
    const startTime = Date.now();

    // Check for cancellation
    if (ctx.abortSignal.aborted) {
      return fail("Operation was cancelled");
    }

    const {
      query,
      maxResults = DEFAULT_MAX_RESULTS,
      engine = "auto",
      timeRange,
      includeDomains,
      excludeDomains,
      searchDepth,
    } = input;

    // Determine actual engine to use
    const tavilyApiKey = process.env.TAVILY_API_KEY;
    let actualEngine: "google" | "duckduckgo" | "bing" | "tavily";

    if (engine === "auto") {
      // Auto: prefer Tavily if API key available, else DuckDuckGo
      actualEngine = tavilyApiKey ? "tavily" : "duckduckgo";
    } else if (engine === "tavily") {
      if (!tavilyApiKey) {
        return fail(
          "Tavily API key not found. Set TAVILY_API_KEY environment variable, or use 'duckduckgo' engine instead."
        );
      }
      actualEngine = "tavily";
    } else {
      actualEngine = engine;
    }

    // Check permission for network access
    const hasPermission = await ctx.checkPermission("network:read", `search:${actualEngine}`);
    if (!hasPermission) {
      return fail(`Permission denied: cannot perform web search using ${actualEngine}`);
    }

    // Create timeout controller
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), DEFAULT_TIMEOUT);

    // Combine abort signals
    const abortHandler = () => timeoutController.abort();
    ctx.abortSignal.addEventListener("abort", abortHandler);

    try {
      // Tavily search with fallback to DuckDuckGo
      if (actualEngine === "tavily") {
        try {
          const tavilyResult = await withHttpRetry(async () => {
            return await searchTavily(
              query,
              {
                apiKey: tavilyApiKey as string,
                maxResults,
                searchDepth,
                includeDomains,
                excludeDomains,
                timeRange: timeRange ? TAVILY_TIME_RANGE_MAP[timeRange] : undefined,
              },
              timeoutController.signal
            );
          }, timeoutController.signal);

          return ok({
            query,
            engine: engine === "auto" ? "auto" : "tavily",
            engineUsed: "tavily",
            results: tavilyResult.results,
            totalResults: tavilyResult.results.length,
            answer: tavilyResult.answer,
          });
        } catch (tavilyError) {
          // Fallback to DuckDuckGo on Tavily failure (only for non-abort errors)
          if (
            tavilyError instanceof Error &&
            (tavilyError.name === "AbortError" || timeoutController.signal.aborted)
          ) {
            return fail("Search request was cancelled");
          }

          console.warn(
            `[web-search] Tavily search failed, falling back to DuckDuckGo: ${tavilyError instanceof Error ? sanitizeApiKey(tavilyError.message) : "Unknown error"}`
          );

          // Check remaining timeout budget before fallback (5s safety margin)
          const TIMEOUT_SAFETY_MARGIN = 5000;
          const elapsed = Date.now() - startTime;
          if (elapsed > DEFAULT_TIMEOUT - TIMEOUT_SAFETY_MARGIN) {
            console.warn(
              `[web-search] Timeout budget exhausted (${elapsed}ms elapsed), skipping fallback`
            );
            return fail(
              `Tavily search failed and no time remaining for fallback: ${tavilyError instanceof Error ? sanitizeApiKey(tavilyError.message) : "Unknown error"}`
            );
          }

          const fallbackResult = await searchDuckDuckGo(
            query,
            maxResults,
            timeoutController.signal
          );
          if (fallbackResult.success) {
            // Mark as fallback in the response
            return ok({
              ...fallbackResult.output,
              engine: engine === "auto" ? "auto" : "tavily",
              engineUsed: "duckduckgo (fallback)",
            });
          }
          return fallbackResult;
        }
      }

      if (actualEngine === "duckduckgo") {
        return await searchDuckDuckGo(query, maxResults, timeoutController.signal);
      }

      // Google or Bing via SerpAPI
      return await searchWithSerpAPI(query, maxResults, actualEngine, timeoutController.signal);
    } finally {
      clearTimeout(timeoutId);
      ctx.abortSignal.removeEventListener("abort", abortHandler);
    }
  },

  shouldConfirm(_input, _ctx) {
    // Read-only operation, no confirmation needed
    return false;
  },
});
