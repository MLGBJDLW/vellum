/** Read-only page extraction with shared credentials, permissions and bounded HTTP transport. */
import { z } from "zod";
import { CONFIG_DEFAULTS } from "../config/defaults.js";
import { defineTool, fail, ok } from "../types/index.js";
import type { ToolContext } from "../types/tool.js";
import { isCloudMetadata, validateUrlWithDNS } from "./security/url-validator.js";
import { getWebToolSettings, type ResolvedWebProvider, resolveWebProvider } from "./web/config.js";
import { deepseekToolEndpoint } from "./web/endpoints.js";
import { requestWeb, requestWebJson, WebHttpError } from "./web/http.js";

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const DEFAULT_MAX_CHARS = 12_000;
const FETCH_PROVIDERS = ["auto", "deepseek", "jina", "firecrawl", "direct", "native"] as const;
type FetchProvider = "deepseek" | "jina" | "firecrawl" | "direct";

export const fetchToolParamsSchema = z.object({
  url: z.string().url().max(8192).describe("Public HTTP(S) page URL without embedded credentials"),
  provider: z
    .enum(FETCH_PROVIDERS)
    .optional()
    .describe(
      "Extraction provider; auto prefers configured DeepSeek and can fall back. native is an alias for direct."
    ),
  maxChars: z
    .number()
    .int()
    .positive()
    .max(200_000)
    .optional()
    .default(DEFAULT_MAX_CHARS)
    .describe("Maximum content characters returned (default: 12000)"),
  timeout: z
    .number()
    .int()
    .positive()
    .max(120_000)
    .optional()
    .describe("Total deadline in milliseconds, including validation and fallback (default: 30000)"),
});

export type FetchToolParams = z.infer<typeof fetchToolParamsSchema>;
export interface FetchToolOutput {
  url: string;
  finalUrl: string;
  title: string;
  content: string;
  contentType: string;
  providerUsed: FetchProvider;
  truncated: boolean;
  fallbacks?: { provider: FetchProvider; code: string; message: string }[];
}

interface Page {
  finalUrl: string;
  title: string;
  content: string;
  contentType: string;
}

class FetchToolError extends Error {}

/** Bound non-network stages too, so a late permission or DNS result cannot start a request. */
async function waitFor<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    void pending.catch(() => {});
    throw signal.reason;
  }
  return new Promise<T>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    const onAbort = () => {
      cleanup();
      reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    pending.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      }
    );
  });
}

function parseTarget(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new FetchToolError("Invalid fetch URL");
  }
  if (
    value.length > 8192 ||
    !["http:", "https:"].includes(url.protocol) ||
    !url.hostname ||
    url.username ||
    url.password
  ) {
    throw new FetchToolError(
      "Fetch URL must be HTTP(S), at most 8192 characters, and contain no username or password"
    );
  }
  url.hash = "";
  return url;
}

function assertCloudTarget(url: URL): void {
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    !host.includes(".") ||
    /(?:^|\.)(?:localhost|local|localdomain|internal|intranet|lan|home|corp)$/.test(host)
  ) {
    throw new FetchToolError("Internal URLs cannot be submitted to cloud extraction providers");
  }
}

async function requirePermission(
  ctx: ToolContext,
  url: string,
  signal: AbortSignal
): Promise<void> {
  signal.throwIfAborted();
  if (!(await waitFor(ctx.checkPermission("network:read", url), signal))) {
    throw new FetchToolError("Permission denied: cannot fetch this URL");
  }
  signal.throwIfAborted();
}

async function validateTarget(
  url: URL,
  signal: AbortSignal,
  remaining: () => number
): Promise<void> {
  signal.throwIfAborted();
  if (isCloudMetadata(url).isMetadata) throw new FetchToolError("Cloud metadata URLs are blocked");
  const validation = await waitFor(
    validateUrlWithDNS(url.toString(), { timeout: Math.min(5000, remaining()) }),
    signal
  );
  if (!validation.valid || validation.resolvedIPs.length === 0) {
    throw new FetchToolError("URL is private, internal, or could not be resolved safely");
  }
  signal.throwIfAborted();
}

function decodeHtml(text: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    ndash: "–",
    mdash: "—",
    hellip: "…",
    copy: "©",
    reg: "®",
  };
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, value: string) => {
    if (!value.startsWith("#")) return named[value.toLowerCase()] ?? match;
    const point =
      value[1]?.toLowerCase() === "x"
        ? Number.parseInt(value.slice(2), 16)
        : Number.parseInt(value.slice(1), 10);
    return Number.isFinite(point) &&
      point > 0 &&
      point <= 0x10ffff &&
      !(point >= 0xd800 && point <= 0xdfff)
      ? String.fromCodePoint(point)
      : "�";
  });
}

/** Conservative static HTML extraction; it never executes page scripts. */
function extractHtml(html: string): { title: string; content: string } {
  const title = decodeHtml(
    /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html)?.[1]?.replace(/<[^>]*>/g, "") ?? ""
  ).trim();
  let text = html
    .replace(/<(script|style|noscript|template|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  text =
    /<(main|article)\b[^>]*>([\s\S]*?)<\/\1\s*>/i.exec(text)?.[2] ??
    /<body\b[^>]*>([\s\S]*?)<\/body\s*>/i.exec(text)?.[1] ??
    text;
  text = text
    .replace(/<(nav|header|footer)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(
      /<br\s*\/?\s*>|<\/(?:p|div|section|article|main|h[1-6]|li|tr|pre|blockquote)\s*>/gi,
      "\n"
    )
    .replace(/<[^>]*>/g, "");
  return {
    title,
    content: decodeHtml(text)
      .replace(/[\t ]+/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  };
}

async function fetchDirect(
  url: URL,
  ctx: ToolContext,
  signal: AbortSignal,
  remaining: () => number
): Promise<Page> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (hop > 0) {
      await requirePermission(ctx, current.toString(), signal);
    }
    await validateTarget(current, signal, remaining);
    const response = await requestWeb(current.toString(), {
      signal,
      timeoutMs: remaining(),
      maxBytes: MAX_BODY_BYTES,
      redirect: "manual",
      headers: {
        Accept: "text/html,application/xhtml+xml,text/plain,application/json;q=0.9,*/*;q=0.1",
      },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || hop === MAX_REDIRECTS)
        throw new FetchToolError("Page redirect limit exceeded or redirect target is missing");
      current = parseTarget(new URL(location, current).toString());
      continue;
    }
    const mime = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
    const html =
      mime === "text/html" ||
      mime === "application/xhtml+xml" ||
      (!mime && /^\s*(?:<!doctype html|<html\b)/i.test(response.body));
    if (
      !html &&
      mime &&
      !mime.startsWith("text/") &&
      !/^application\/(?:json|xml|[\w.+-]+\+(?:json|xml))$/.test(mime)
    ) {
      throw new FetchToolError(
        "Direct fetching only supports readable text, HTML, JSON and XML pages"
      );
    }
    if (response.body.includes("\0"))
      throw new FetchToolError("Page contains binary data rather than readable text");
    return {
      finalUrl: current.toString(),
      ...(html ? extractHtml(response.body) : { title: "", content: response.body }),
      contentType: "text/plain",
    };
  }
  throw new FetchToolError("Page redirect limit exceeded");
}

function firecrawlEndpoint(baseUrl?: string): string {
  const url = new URL(baseUrl || "https://api.firecrawl.dev");
  const path = url.pathname.replace(/\/+$/, "");
  url.pathname = path.endsWith("/scrape")
    ? path
    : /\/v[12]$/.test(path)
      ? `${path}/scrape`
      : `${path}/v2/scrape`;
  url.hash = "";
  return url.toString();
}

const deepseekPageSchema = z.object({ title: z.string(), content: z.string() });
const jinaPageSchema = z.object({
  data: z.object({ title: z.string().optional(), content: z.string(), url: z.string().optional() }),
});
const firecrawlPageSchema = z.object({
  success: z.literal(true),
  data: z.object({
    markdown: z.string(),
    metadata: z
      .object({
        title: z.string().optional(),
        sourceURL: z.string().optional(),
        url: z.string().optional(),
      })
      .optional(),
  }),
});

async function fetchCloud(
  provider: Exclude<FetchProvider, "direct">,
  configured: ResolvedWebProvider,
  url: URL,
  ctx: ToolContext,
  signal: AbortSignal,
  remaining: () => number
): Promise<Page> {
  assertCloudTarget(url);
  let endpoint: string;
  let method = "POST";
  const headers: Record<string, string> = { Accept: "application/json" };
  if (configured.apiKey) headers.Authorization = `Bearer ${configured.apiKey}`;
  let body: string | undefined;
  if (provider === "deepseek") {
    endpoint = deepseekToolEndpoint(configured.baseUrl, "fetch");
    body = JSON.stringify({ url: url.toString() });
  } else if (provider === "firecrawl") {
    endpoint = firecrawlEndpoint(configured.baseUrl);
    body = JSON.stringify({
      url: url.toString(),
      formats: ["markdown"],
      onlyMainContent: true,
      skipTlsVerification: false,
      timeout: Math.max(1000, remaining()),
    });
  } else {
    const base = new URL(configured.baseUrl || "https://r.jina.ai");
    if (base.search || base.hash)
      throw new FetchToolError("Jina Reader endpoint must not contain a query or fragment");
    endpoint = `${base.toString().replace(/\/+$/, "")}/${url.toString()}`;
    method = "GET";
    headers["X-Return-Format"] = "markdown";
  }
  if (body) headers["Content-Type"] = "application/json";
  const serviceUrl = new URL(endpoint);
  if (
    !["https:", "http:"].includes(serviceUrl.protocol) ||
    serviceUrl.username ||
    serviceUrl.password
  ) {
    throw new FetchToolError(
      "Extraction service endpoint must be HTTP(S) without embedded credentials"
    );
  }
  await requirePermission(ctx, endpoint, signal);
  const response = await requestWebJson(endpoint, {
    method,
    headers,
    body,
    signal,
    timeoutMs: remaining(),
    maxBytes: MAX_BODY_BYTES,
  });
  let page: Page;
  if (provider === "deepseek") {
    const parsed = deepseekPageSchema.safeParse(response);
    if (!parsed.success) throw new FetchToolError("DeepSeek returned an invalid page response");
    page = { finalUrl: url.toString(), ...parsed.data, contentType: "text/markdown" };
  } else if (provider === "jina") {
    const parsed = jinaPageSchema.safeParse(response);
    if (!parsed.success) throw new FetchToolError("Jina Reader returned an invalid page response");
    page = {
      finalUrl: parsed.data.data.url || url.toString(),
      title: parsed.data.data.title ?? "",
      content: parsed.data.data.content,
      contentType: "text/markdown",
    };
  } else {
    const parsed = firecrawlPageSchema.safeParse(response);
    if (!parsed.success) throw new FetchToolError("Firecrawl returned an invalid page response");
    page = {
      finalUrl:
        parsed.data.data.metadata?.url || parsed.data.data.metadata?.sourceURL || url.toString(),
      title: parsed.data.data.metadata?.title ?? "",
      content: parsed.data.data.markdown,
      contentType: "text/markdown",
    };
  }
  if (page.finalUrl !== url.toString()) {
    const finalUrl = parseTarget(page.finalUrl);
    assertCloudTarget(finalUrl);
    await requirePermission(ctx, finalUrl.toString(), signal);
    await validateTarget(finalUrl, signal, remaining);
    page.finalUrl = finalUrl.toString();
  }
  return page;
}

export const fetchTool = defineTool({
  name: "fetch_tool",
  description:
    "Read a public web page and extract its title and readable content. Uses configured DeepSeek, Jina, Firecrawl or direct HTTP reading. Read-only; no page scripts or actions are executed locally.",
  parameters: fetchToolParamsSchema,
  kind: "read",
  category: "network",
  async execute(input, ctx) {
    const settings = getWebToolSettings();
    const timeout = Math.max(
      1,
      Math.min(input.timeout ?? settings.timeout ?? CONFIG_DEFAULTS.timeouts.webFetch, 120_000)
    );
    const deadline = Date.now() + timeout;
    const timeoutController = new AbortController();
    const timer = setTimeout(
      () => timeoutController.abort(new DOMException("Fetch deadline exceeded", "TimeoutError")),
      timeout
    );
    const signal = AbortSignal.any([ctx.abortSignal, timeoutController.signal]);
    const remaining = () => {
      signal.throwIfAborted();
      const milliseconds = deadline - Date.now();
      if (milliseconds <= 0) {
        timeoutController.abort(new DOMException("Fetch deadline exceeded", "TimeoutError"));
        signal.throwIfAborted();
      }
      return milliseconds;
    };
    try {
      signal.throwIfAborted();
      const url = parseTarget(input.url);
      await requirePermission(ctx, url.toString(), signal);
      await validateTarget(url, signal, remaining);
      const requested = input.provider ?? settings.fetchProvider ?? "auto";
      const selected = requested === "native" ? "direct" : requested;
      if (!(FETCH_PROVIDERS as readonly string[]).includes(selected))
        throw new FetchToolError(
          "Unsupported fetch provider; choose auto, deepseek, jina, firecrawl or direct"
        );
      const providers: FetchProvider[] =
        selected === "auto"
          ? ["deepseek", "firecrawl", "jina", "direct"]
          : [selected as FetchProvider];
      const fallbacks: NonNullable<FetchToolOutput["fallbacks"]> = [];
      for (const provider of providers) {
        signal.throwIfAborted();
        const configured = await waitFor(resolveWebProvider(provider), signal);
        signal.throwIfAborted();
        if (
          !configured.enabled ||
          ((provider === "deepseek" || provider === "firecrawl") && !configured.apiKey)
        ) {
          if (selected === "auto") continue;
          throw new FetchToolError(
            !configured.enabled
              ? `${provider} fetching is disabled`
              : `${provider} fetching requires an API key in web settings, the provider configuration, or its environment variable`
          );
        }
        if (
          selected === "auto" &&
          provider === "jina" &&
          !configured.apiKey &&
          settings.providers?.jina?.enabled !== true
        )
          continue;
        try {
          const page =
            provider === "direct"
              ? await fetchDirect(url, ctx, signal, remaining)
              : await fetchCloud(provider, configured, url, ctx, signal, remaining);
          signal.throwIfAborted();
          const limit = Math.max(1, Math.min(input.maxChars ?? DEFAULT_MAX_CHARS, 200_000));
          let content = page.content.slice(0, limit);
          if (/[\uD800-\uDBFF]$/.test(content)) content = content.slice(0, -1);
          return ok<FetchToolOutput>({
            url: input.url,
            ...page,
            title: page.title.slice(0, 512),
            content,
            truncated: content.length < page.content.length,
            providerUsed: provider,
            ...(fallbacks.length > 0 && { fallbacks }),
          });
        } catch (error) {
          signal.throwIfAborted();
          if (
            selected !== "auto" ||
            settings.fallback === false ||
            !(error instanceof WebHttpError) ||
            !error.retryable
          )
            throw error;
          fallbacks.push({ provider, code: error.code, message: error.message });
        }
      }
      return fail(
        fallbacks.length > 0
          ? `Page fetch failed after ${fallbacks.length} provider attempt(s)`
          : "No enabled fetch provider is available"
      );
    } catch (error) {
      if (ctx.abortSignal.aborted) return fail("Operation was cancelled");
      if (timeoutController.signal.aborted) return fail(`Fetch timed out after ${timeout}ms`);
      return fail(
        error instanceof FetchToolError || error instanceof WebHttpError
          ? error.message
          : "Unable to fetch the page"
      );
    } finally {
      clearTimeout(timer);
    }
  },
  shouldConfirm() {
    return false;
  },
});
