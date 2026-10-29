import { STATUS_CODES } from "node:http";
import { type FetchWithPoolOptions, fetchWithPool } from "@vellum/shared";

export type WebHttpErrorCode = "http" | "network" | "timeout" | "aborted" | "size" | "json" | "url";

/** Errors deliberately omit response bodies, credential-bearing URLs and native fetch causes. */
export class WebHttpError extends Error {
  readonly status?: number;
  readonly retryable: boolean;
  readonly code: WebHttpErrorCode;

  constructor(
    message: string,
    options: { code: WebHttpErrorCode; status?: number; retryable?: boolean }
  ) {
    super(message);
    this.name = "WebHttpError";
    this.code = options.code;
    this.status = options.status;
    this.retryable = options.retryable ?? false;
  }
}

export interface WebRequestOptions {
  method?: string;
  headers?: FetchWithPoolOptions["headers"];
  body?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxBytes?: number;
  /** Explicit retries for idempotent API calls; defaults to one attempt and is capped at three. */
  maxAttempts?: number;
  retryDelayMs?: number;
  /** Manual redirects are returned for the caller to validate before following. */
  redirect?: "error" | "manual";
}

export interface WebResponse {
  status: number;
  statusText: string;
  headers: Headers;
  body: string;
}

function boundedNumber(value: number | undefined, fallback: number, maximum: number): number {
  return Number.isFinite(value) && (value as number) > 0
    ? Math.max(1, Math.min(Math.floor(value as number), maximum))
    : fallback;
}

function isTimeoutReason(signal?: AbortSignal): boolean {
  return signal?.reason instanceof Error && signal.reason.name === "TimeoutError";
}

function waitFor<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    // The request/read may already have started evaluating before cancellation.
    void promise.catch(() => {});
    return Promise.reject(signal.reason);
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(signal.reason);
    };
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
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

async function readBody(
  response: Response,
  maxBytes: number,
  signal: AbortSignal
): Promise<string> {
  const advertised = Number(response.headers.get("content-length"));
  if (Number.isFinite(advertised) && advertised > maxBytes) {
    void response.body?.cancel().catch(() => {});
    throw new WebHttpError(`Web response exceeds the ${maxBytes} byte limit`, { code: "size" });
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { value, done } = await waitFor(reader.read(), signal);
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes)
        throw new WebHttpError(`Web response exceeds the ${maxBytes} byte limit`, { code: "size" });
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder().decode(bytes);
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}

async function retryDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await waitFor(
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, milliseconds);
      }),
      signal
    );
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** One bounded deadline covers connection, body reads and retries. No automatic redirects. */
export async function requestWeb(
  url: string,
  options: WebRequestOptions = {}
): Promise<WebResponse> {
  if (options.timeoutMs !== undefined && options.timeoutMs <= 0)
    throw new WebHttpError("Web request timed out", { code: "timeout" });
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new WebHttpError("Invalid web service URL", { code: "url" });
  }
  if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password)
    throw new WebHttpError("Web service URL must use HTTP(S) without embedded credentials", {
      code: "url",
    });

  const timeoutMs = boundedNumber(options.timeoutMs, 30_000, 120_000);
  const maxBytes = boundedNumber(options.maxBytes, 5 * 1024 * 1024, 20 * 1024 * 1024);
  const attempts = boundedNumber(options.maxAttempts, 1, 3);
  const delayMs = options.retryDelayMs === 0 ? 0 : boundedNumber(options.retryDelayMs, 250, 2000);
  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) abortFromCaller();
  else options.signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const abortError = () =>
    new WebHttpError(
      timedOut || isTimeoutReason(options.signal)
        ? "Web request timed out"
        : "Web request was cancelled",
      { code: timedOut || isTimeoutReason(options.signal) ? "timeout" : "aborted" }
    );

  try {
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (controller.signal.aborted) throw abortError();
      try {
        const response = await waitFor(
          fetchWithPool(parsed.toString(), {
            method: options.method ?? "GET",
            headers: options.headers,
            body: options.body,
            signal: controller.signal,
            redirect: options.redirect ?? "error",
          }),
          controller.signal
        );
        const statusText = STATUS_CODES[response.status] ?? "HTTP response";
        if (options.redirect === "manual" && response.status >= 300 && response.status < 400) {
          void response.body?.cancel().catch(() => {});
          return { status: response.status, statusText, headers: response.headers, body: "" };
        }
        if (!response.ok) {
          void response.body?.cancel().catch(() => {});
          throw new WebHttpError(`Web service returned HTTP ${response.status} ${statusText}`, {
            code: "http",
            status: response.status,
            retryable:
              response.status === 408 ||
              response.status === 429 ||
              (response.status >= 500 && response.status < 600),
          });
        }
        const body = await readBody(response, maxBytes, controller.signal);
        return { status: response.status, statusText, headers: response.headers, body };
      } catch (error) {
        if (controller.signal.aborted) throw abortError();
        const safeError =
          error instanceof WebHttpError
            ? error
            : new WebHttpError("Web request failed due to a network error", {
                code: "network",
                retryable: true,
              });
        if (!safeError.retryable || attempt + 1 >= attempts) throw safeError;
        try {
          await retryDelay(delayMs * 2 ** attempt, controller.signal);
        } catch {
          throw abortError();
        }
      }
    }
    throw new WebHttpError("Web request failed", { code: "network" });
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abortFromCaller);
  }
}

export async function requestWebJson<T = unknown>(
  url: string,
  options: WebRequestOptions = {}
): Promise<T> {
  const response = await requestWeb(url, options);
  try {
    return JSON.parse(response.body) as T;
  } catch {
    throw new WebHttpError("Web service returned invalid JSON", { code: "json" });
  }
}
