/**
 * Web Search Tool
 *
 * Performs web searches using DuckDuckGo HTML search or SerpAPI.
 * Returns ranked search results with titles, URLs, and snippets.
 *
 * @module builtin/web-search
 */

import { z } from "zod";
import { CONFIG_DEFAULTS } from "../config/defaults.js";
import { defineTool, fail, ok } from "../types/index.js";
import type { ToolResult } from "../types/tool.js";

/** Default maximum number of search results */
const DEFAULT_MAX_RESULTS = 10;

/** Default timeout for search requests (15 seconds) */
const DEFAULT_TIMEOUT = CONFIG_DEFAULTS.timeouts.webSearch;

/** DuckDuckGo HTML search base URL */
const DUCKDUCKGO_HTML_URL = CONFIG_DEFAULTS.externalApis.duckduckgoHtml;

/** SerpAPI base URL */
const SERPAPI_BASE_URL = CONFIG_DEFAULTS.externalApis.serpapi;

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
  /** Search engine to use (default: duckduckgo) */
  engine: z
    .enum(["google", "duckduckgo", "bing"])
    .optional()
    .default("duckduckgo")
    .describe("Search engine to use (default: duckduckgo)"),
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
  /** Array of search results */
  results: SearchResult[];
  /** Total number of results returned */
  totalResults: number;
}

/**
 * Parse DuckDuckGo HTML search results
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: HTML parsing requires comprehensive pattern matching
function parseDuckDuckGoResults(html: string, maxResults: number): SearchResult[] {
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
        title: decodeHTMLEntities(title.trim()),
        url: decodeHTMLEntities(url),
        snippet: decodeHTMLEntities(snippet?.trim() || ""),
        position,
      });
    }
  }

  // If no results, try alternative pattern
  if (results.length === 0) {
    altResultRegex.lastIndex = 0;
    // biome-ignore lint/suspicious/noAssignInExpressions: Standard regex iteration pattern
    while ((match = altResultRegex.exec(html)) !== null && position < maxResults) {
      position++;
      const [, url, title, snippet] = match;
      if (url && title) {
        results.push({
          title: decodeHTMLEntities(title.trim()),
          url: decodeHTMLEntities(url),
          snippet: decodeHTMLEntities(snippet?.trim() || ""),
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
          title: decodeHTMLEntities(title.trim()),
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
    const response = await fetch(`${DUCKDUCKGO_HTML_URL}?${params.toString()}`, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal,
    });

    if (!response.ok) {
      return fail(`DuckDuckGo search failed with status ${response.status}`);
    }

    const html = await response.text();
    const results = parseDuckDuckGoResults(html, maxResults);

    return ok({
      query,
      engine: "duckduckgo",
      results,
      totalResults: results.length,
    });
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
    const response = await fetch(`${SERPAPI_BASE_URL}?${params.toString()}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return fail(`SerpAPI request failed (${response.status}): ${errorText}`);
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
      results,
      totalResults: results.length,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        return fail("Search request was cancelled");
      }
      return fail(`SerpAPI search failed: ${error.message}`);
    }
    return fail("Unknown error during SerpAPI search");
  }
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
    "Search the web for information. Returns ranked results with titles, URLs, and snippets. Uses DuckDuckGo by default (free, no API key needed). For Google or Bing, requires SERPAPI_KEY environment variable.",
  parameters: webSearchParamsSchema,
  kind: "read",
  category: "network",

  async execute(input, ctx) {
    // Check for cancellation
    if (ctx.abortSignal.aborted) {
      return fail("Operation was cancelled");
    }

    const { query, maxResults = DEFAULT_MAX_RESULTS, engine = "duckduckgo" } = input;

    // Check permission for network access
    const hasPermission = await ctx.checkPermission("network:read", `search:${engine}`);
    if (!hasPermission) {
      return fail(`Permission denied: cannot perform web search using ${engine}`);
    }

    // Create timeout controller
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), DEFAULT_TIMEOUT);

    // Combine abort signals
    const abortHandler = () => timeoutController.abort();
    ctx.abortSignal.addEventListener("abort", abortHandler);

    try {
      if (engine === "duckduckgo") {
        return await searchDuckDuckGo(query, maxResults, timeoutController.signal);
      }
      // Google or Bing via SerpAPI
      return await searchWithSerpAPI(query, maxResults, engine, timeoutController.signal);
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
