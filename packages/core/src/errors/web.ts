// ============================================
// Web Browsing Error Codes
// ============================================

/**
 * Web browsing error codes (31xx range)
 * Used for SSRF protection, DNS validation, and web tool errors
 */
export enum WebErrorCode {
  // SSRF Protection (3100-3109)
  PRIVATE_IP_BLOCKED = 3100,
  DNS_REBINDING_DETECTED = 3101,
  CLOUD_METADATA_BLOCKED = 3102,
  UNSAFE_REDIRECT = 3103,
  DNS_RESOLUTION_FAILED = 3104,

  // Domain Control (3110-3119)
  DOMAIN_BLOCKED = 3110,
  DOMAIN_NOT_WHITELISTED = 3111,

  // Rate Limiting (3120-3129)
  RATE_LIMIT_EXCEEDED = 3120,
  CONCURRENT_LIMIT_EXCEEDED = 3121,

  // Connection Errors (3130-3139)
  CONNECTION_TIMEOUT = 3130,
  CONNECTION_REFUSED = 3131,
  TLS_ERROR = 3132,

  // Response Errors (3140-3149)
  RESPONSE_TOO_LARGE = 3140,
  INVALID_CONTENT_TYPE = 3141,
  PARSE_ERROR = 3142,

  // Browser Errors (3150-3159)
  BROWSER_NOT_AVAILABLE = 3150,
  CDP_CONNECTION_FAILED = 3151,
  PAGE_LOAD_TIMEOUT = 3152,
  NAVIGATION_FAILED = 3153,
}

// ============================================
// Web Error Classes
// ============================================

/**
 * Base class for all web browsing errors.
 * Uses WebErrorCode for specific categorization of web-related errors.
 */
export class WebError extends Error {
  public readonly errorId: string;
  public readonly timestamp: string;
  public readonly webCode: WebErrorCode;
  public readonly webContext?: Record<string, unknown>;
  private readonly _isRetryable: boolean;

  constructor(
    message: string,
    webCode: WebErrorCode,
    isRetryable = false,
    context?: Record<string, unknown>
  ) {
    super(message);
    this.name = "WebError";
    this.webCode = webCode;
    this._isRetryable = isRetryable;
    this.webContext = context;
    this.errorId = crypto.randomUUID();
    this.timestamp = new Date().toISOString();

    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, WebError);
    }
  }

  /**
   * Whether this error can be retried.
   */
  get isRetryable(): boolean {
    return this._isRetryable;
  }

  /**
   * Returns the error category based on code range
   */
  category(): string {
    const code = this.webCode;
    if (code >= 3100 && code < 3110) return "ssrf";
    if (code >= 3110 && code < 3120) return "domain";
    if (code >= 3120 && code < 3130) return "rate_limit";
    if (code >= 3130 && code < 3140) return "connection";
    if (code >= 3140 && code < 3150) return "response";
    if (code >= 3150 && code < 3160) return "browser";
    return "unknown";
  }

  /**
   * User-friendly error message
   */
  toUserMessage(): string {
    return `[${this.category().toUpperCase()}] ${this.message}`;
  }
}

// SSRF Errors
export class PrivateIPError extends WebError {
  constructor(ip: string, url?: string) {
    super(`Access to private IP address blocked: ${ip}`, WebErrorCode.PRIVATE_IP_BLOCKED, false, {
      ip,
      url,
    });
    this.name = "PrivateIPError";
  }
}

export class DNSRebindingError extends WebError {
  constructor(hostname: string, resolvedIPs: string[]) {
    super(
      `DNS rebinding attack detected for ${hostname}`,
      WebErrorCode.DNS_REBINDING_DETECTED,
      false,
      { hostname, resolvedIPs }
    );
    this.name = "DNSRebindingError";
  }
}

export class CloudMetadataError extends WebError {
  constructor(url: string, provider?: string) {
    super(
      `Access to cloud metadata endpoint blocked: ${url}`,
      WebErrorCode.CLOUD_METADATA_BLOCKED,
      false,
      { url, provider }
    );
    this.name = "CloudMetadataError";
  }
}

export class UnsafeRedirectError extends WebError {
  constructor(originalUrl: string, redirectUrl: string, reason: string) {
    super(`Unsafe redirect blocked: ${reason}`, WebErrorCode.UNSAFE_REDIRECT, false, {
      originalUrl,
      redirectUrl,
      reason,
    });
    this.name = "UnsafeRedirectError";
  }
}

export class RateLimitError extends WebError {
  readonly retryAfter?: number;

  constructor(domain: string, retryAfterMs?: number) {
    super(
      `Rate limit exceeded for ${domain}`,
      WebErrorCode.RATE_LIMIT_EXCEEDED,
      true, // Retryable
      { domain, retryAfterMs }
    );
    this.name = "RateLimitError";
    this.retryAfter = retryAfterMs ? Math.ceil(retryAfterMs / 1000) : undefined;
  }
}

export class DomainBlockedError extends WebError {
  constructor(domain: string, reason: "blacklist" | "not_whitelisted") {
    const code =
      reason === "blacklist" ? WebErrorCode.DOMAIN_BLOCKED : WebErrorCode.DOMAIN_NOT_WHITELISTED;
    super(
      `Domain ${domain} is ${reason === "blacklist" ? "blocked" : "not in whitelist"}`,
      code,
      false,
      { domain, reason }
    );
    this.name = "DomainBlockedError";
  }
}

// Connection Errors
export class ConnectionError extends WebError {
  constructor(
    message: string,
    code:
      | WebErrorCode.CONNECTION_TIMEOUT
      | WebErrorCode.CONNECTION_REFUSED
      | WebErrorCode.TLS_ERROR,
    url: string,
    isRetryable = true
  ) {
    super(message, code, isRetryable, { url });
    this.name = "ConnectionError";
  }
}

// Browser Errors
export class BrowserError extends WebError {
  constructor(message: string, code: WebErrorCode, context?: Record<string, unknown>) {
    super(message, code, false, context);
    this.name = "BrowserError";
  }
}

export class CDPConnectionError extends BrowserError {
  constructor(endpoint: string, cause?: string) {
    super(`Failed to connect to CDP endpoint: ${endpoint}`, WebErrorCode.CDP_CONNECTION_FAILED, {
      endpoint,
      cause,
    });
    this.name = "CDPConnectionError";
  }
}
