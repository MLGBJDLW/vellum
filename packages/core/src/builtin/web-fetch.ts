/**
 * Web Fetch Tool
 *
 * Performs HTTP requests using the native fetch API.
 * Supports GET, POST, PUT, DELETE methods with custom headers and timeout.
 *
 * @module builtin/web-fetch
 */

import { z } from "zod";
import { defineTool, fail, ok } from "../types/index.js";
import type { ToolResult } from "../types/tool.js";

/** Default timeout for HTTP requests (30 seconds) */
const DEFAULT_TIMEOUT = 30000;

/** Maximum response body size to capture (5MB) */
const MAX_RESPONSE_SIZE = 5 * 1024 * 1024;

/**
 * Schema for web_fetch tool parameters
 */
export const webFetchParamsSchema = z.object({
  /** URL to fetch (must be a valid URL) */
  url: z.string().url().describe("The URL to fetch"),
  /** HTTP method (default: GET) */
  method: z
    .enum(["GET", "POST", "PUT", "DELETE"])
    .optional()
    .default("GET")
    .describe("HTTP method (default: GET)"),
  /** Custom headers to include in the request */
  headers: z.record(z.string()).optional().describe("Custom headers as key-value pairs"),
  /** Request body for POST/PUT requests */
  body: z.string().optional().describe("Request body for POST/PUT requests"),
  /** Timeout in milliseconds (default: 30000) */
  timeout: z
    .number()
    .int()
    .positive()
    .optional()
    .default(DEFAULT_TIMEOUT)
    .describe("Timeout in milliseconds (default: 30000)"),
});

/** Inferred type for web_fetch parameters */
export type WebFetchParams = z.infer<typeof webFetchParamsSchema>;

/** Output type for web_fetch tool */
export interface WebFetchOutput {
  /** HTTP status code */
  status: number;
  /** HTTP status text */
  statusText: string;
  /** Response headers as key-value pairs */
  headers: Record<string, string>;
  /** Response body as string */
  body: string;
  /** Request timing information */
  timing: {
    /** Time to first byte in milliseconds */
    startTime: number;
    /** Total duration in milliseconds */
    duration: number;
  };
}

/**
 * Determine tool kind based on HTTP method
 * GET is 'read', others are 'write'
 */
function getToolKind(method: string): "read" | "write" {
  return method === "GET" ? "read" : "write";
}

/**
 * Check if the method should not have a body
 */
function methodShouldNotHaveBody(method: string): boolean {
  return method === "GET" || method === "DELETE";
}

/**
 * Extract headers from response to plain object
 */
function extractResponseHeaders(response: Response): Record<string, string> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return headers;
}

/**
 * Check if response size exceeds limit
 */
function checkContentLength(response: Response): ToolResult<WebFetchOutput> | null {
  const contentLength = response.headers.get("content-length");
  if (contentLength && Number.parseInt(contentLength, 10) > MAX_RESPONSE_SIZE) {
    return fail(
      `Response body too large (${contentLength} bytes exceeds ${MAX_RESPONSE_SIZE} byte limit)`
    );
  }
  return null;
}

/**
 * Categorize and handle fetch errors
 */
function handleFetchError(
  error: Error,
  url: string,
  timeout: number,
  wasCancelled: boolean
): ToolResult<WebFetchOutput> {
  if (error.name === "AbortError") {
    return wasCancelled
      ? fail("Operation was cancelled")
      : fail(`Request timed out after ${timeout}ms`);
  }

  if (error.message.includes("fetch failed") || error.message.includes("ENOTFOUND")) {
    return fail(`Network error: Unable to connect to ${url}`);
  }

  if (error.message.includes("Invalid URL")) {
    return fail(`Invalid URL: ${url}`);
  }

  return fail(`HTTP request failed: ${error.message}`);
}

/**
 * Web fetch tool implementation
 *
 * Performs HTTP requests using native fetch API.
 * Includes timeout handling, response capture, and timing information.
 *
 * @example
 * ```typescript
 * // Simple GET request
 * const result = await webFetchTool.execute(
 *   { url: "https://api.example.com/data" },
 *   ctx
 * );
 *
 * // POST with JSON body
 * const result = await webFetchTool.execute(
 *   {
 *     url: "https://api.example.com/submit",
 *     method: "POST",
 *     headers: { "Content-Type": "application/json" },
 *     body: JSON.stringify({ key: "value" })
 *   },
 *   ctx
 * );
 * ```
 */
export const webFetchTool = defineTool({
  name: "web_fetch",
  description:
    "Fetch data from a URL using HTTP. Supports GET, POST, PUT, DELETE methods with custom headers and timeout.",
  parameters: webFetchParamsSchema,
  kind: "read", // Default kind, actual behavior depends on method
  category: "network",

  async execute(input, ctx) {
    // Check for cancellation
    if (ctx.abortSignal.aborted) {
      return fail("Operation was cancelled");
    }

    const method = input.method ?? "GET";
    const timeout = input.timeout ?? DEFAULT_TIMEOUT;

    // Check permission for network access
    const action = getToolKind(method) === "read" ? "network:read" : "network:write";
    const hasPermission = await ctx.checkPermission(action, input.url);
    if (!hasPermission) {
      return fail(`Permission denied: cannot perform ${method} request to ${input.url}`);
    }

    // Body should not be present for GET/DELETE
    if (methodShouldNotHaveBody(method) && input.body) {
      return fail(`${method} requests should not include a body`);
    }

    // Create abort controller for timeout
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), timeout);

    // Combine abort signals
    const abortHandler = () => timeoutController.abort();
    ctx.abortSignal.addEventListener("abort", abortHandler);

    const startTime = Date.now();

    try {
      const fetchOptions: RequestInit = {
        method,
        headers: input.headers,
        body: input.body,
        signal: timeoutController.signal,
      };

      const response = await fetch(input.url, fetchOptions);

      // Check content length before reading body
      const sizeError = checkContentLength(response);
      if (sizeError) return sizeError;

      // Read response body as text
      const body = await response.text();

      // Check actual body size
      if (body.length > MAX_RESPONSE_SIZE) {
        return fail(
          `Response body too large (${body.length} bytes exceeds ${MAX_RESPONSE_SIZE} byte limit)`
        );
      }

      const endTime = Date.now();

      return ok({
        status: response.status,
        statusText: response.statusText,
        headers: extractResponseHeaders(response),
        body,
        timing: {
          startTime,
          duration: endTime - startTime,
        },
      });
    } catch (error) {
      if (error instanceof Error) {
        return handleFetchError(error, input.url, timeout, ctx.abortSignal.aborted);
      }

      return fail("Unknown error occurred during HTTP request");
    } finally {
      clearTimeout(timeoutId);
      ctx.abortSignal.removeEventListener("abort", abortHandler);
    }
  },

  shouldConfirm(input, _ctx) {
    // Write operations should require confirmation
    const method = input.method ?? "GET";
    return method !== "GET";
  },
});
