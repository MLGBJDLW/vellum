// ============================================
// T003: MCP Error Type Hierarchy
// ============================================

/**
 * Error codes specific to MCP operations.
 * Using 38xx range to avoid conflicts with core ErrorCode enum (3xxx for tools).
 */
export enum McpErrorCode {
  /** Connection to MCP server failed */
  MCP_CONNECTION = 3800,
  /** MCP operation timed out */
  MCP_TIMEOUT = 3801,
  /** MCP tool execution failed */
  MCP_TOOL_ERROR = 3802,
  /** OAuth flow timed out */
  OAUTH_TIMEOUT = 3803,
  /** OAuth client registration required (RFC 7591) */
  NEEDS_CLIENT_REGISTRATION = 3804,
  /** MCP server configuration invalid */
  CONFIG_INVALID = 3805,
  /** MCP transport error */
  TRANSPORT_ERROR = 3806,
}

/**
 * Options for MCP error construction.
 */
export interface McpErrorOptions {
  /** The underlying cause of this error */
  cause?: Error;
  /** Server name associated with this error */
  serverName?: string;
  /** Additional context about the error */
  context?: Record<string, unknown>;
  /** Whether this error can be retried */
  isRetryable?: boolean;
  /** Suggested delay before retry in milliseconds */
  retryDelay?: number;
}

/**
 * Base error class for all MCP-related errors.
 */
export class McpError extends Error {
  public readonly code: McpErrorCode;
  public readonly serverName?: string;
  public readonly context?: Record<string, unknown>;
  public readonly isRetryable: boolean;
  public readonly retryDelay?: number;

  constructor(message: string, code: McpErrorCode, options?: McpErrorOptions) {
    super(message, { cause: options?.cause });
    this.name = "McpError";
    this.code = code;
    this.serverName = options?.serverName;
    this.context = options?.context;
    this.isRetryable = options?.isRetryable ?? false;
    this.retryDelay = options?.retryDelay;

    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, McpError);
    }
  }

  /**
   * Returns a JSON-serializable representation of this error.
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      serverName: this.serverName,
      context: this.context,
      isRetryable: this.isRetryable,
      retryDelay: this.retryDelay,
      cause: this.cause instanceof Error ? this.cause.message : undefined,
    };
  }
}

/**
 * Error thrown when connection to an MCP server fails.
 * This includes transport establishment failures and handshake errors.
 */
export class McpConnectionError extends McpError {
  constructor(message: string, serverName: string, options?: Omit<McpErrorOptions, "serverName">) {
    super(message, McpErrorCode.MCP_CONNECTION, {
      ...options,
      serverName,
      isRetryable: options?.isRetryable ?? true,
      retryDelay: options?.retryDelay ?? 1000,
    });
    this.name = "McpConnectionError";
  }
}

/**
 * Error thrown when an MCP operation times out.
 */
export class McpTimeoutError extends McpError {
  public readonly timeoutMs: number;

  constructor(
    message: string,
    serverName: string,
    timeoutMs: number,
    options?: Omit<McpErrorOptions, "serverName">
  ) {
    super(message, McpErrorCode.MCP_TIMEOUT, {
      ...options,
      serverName,
      context: { ...options?.context, timeoutMs },
      isRetryable: options?.isRetryable ?? true,
      retryDelay: options?.retryDelay ?? 500,
    });
    this.name = "McpTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Error thrown when an MCP tool execution fails.
 */
export class McpToolError extends McpError {
  public readonly toolName: string;

  constructor(
    message: string,
    serverName: string,
    toolName: string,
    options?: Omit<McpErrorOptions, "serverName">
  ) {
    super(message, McpErrorCode.MCP_TOOL_ERROR, {
      ...options,
      serverName,
      context: { ...options?.context, toolName },
      isRetryable: options?.isRetryable ?? false,
    });
    this.name = "McpToolError";
    this.toolName = toolName;
  }
}

/**
 * Error thrown when OAuth flow times out waiting for user authorization.
 */
export class OAuthTimeoutError extends McpError {
  constructor(message: string, serverName: string, options?: Omit<McpErrorOptions, "serverName">) {
    super(message, McpErrorCode.OAUTH_TIMEOUT, {
      ...options,
      serverName,
      isRetryable: false,
    });
    this.name = "OAuthTimeoutError";
  }
}

/**
 * Error thrown when RFC 7591 Dynamic Client Registration is required.
 * This indicates the server requires OAuth client registration before connecting.
 */
export class NeedsClientRegistrationError extends McpError {
  public readonly registrationEndpoint?: string;

  constructor(
    message: string,
    serverName: string,
    registrationEndpoint?: string,
    options?: Omit<McpErrorOptions, "serverName">
  ) {
    super(message, McpErrorCode.NEEDS_CLIENT_REGISTRATION, {
      ...options,
      serverName,
      context: { ...options?.context, registrationEndpoint },
      isRetryable: false,
    });
    this.name = "NeedsClientRegistrationError";
    this.registrationEndpoint = registrationEndpoint;
  }
}

/**
 * Error thrown when MCP server configuration is invalid.
 */
export class McpConfigError extends McpError {
  public readonly validationErrors?: string[];

  constructor(
    message: string,
    serverName: string,
    validationErrors?: string[],
    options?: Omit<McpErrorOptions, "serverName">
  ) {
    super(message, McpErrorCode.CONFIG_INVALID, {
      ...options,
      serverName,
      context: { ...options?.context, validationErrors },
      isRetryable: false,
    });
    this.name = "McpConfigError";
    this.validationErrors = validationErrors;
  }
}

/**
 * Error thrown when MCP transport fails.
 */
export class McpTransportError extends McpError {
  public readonly transportType: string;

  constructor(
    message: string,
    serverName: string,
    transportType: string,
    options?: Omit<McpErrorOptions, "serverName">
  ) {
    super(message, McpErrorCode.TRANSPORT_ERROR, {
      ...options,
      serverName,
      context: { ...options?.context, transportType },
      isRetryable: options?.isRetryable ?? true,
      retryDelay: options?.retryDelay ?? 1000,
    });
    this.name = "McpTransportError";
    this.transportType = transportType;
  }
}

/**
 * Type guard to check if an error is an MCP error.
 */
export function isMcpError(error: unknown): error is McpError {
  return error instanceof McpError;
}

/**
 * Type guard to check if an error indicates authentication is needed.
 */
export function isAuthRequiredError(error: unknown): boolean {
  if (error instanceof NeedsClientRegistrationError) {
    return true;
  }
  // Check for SDK's UnauthorizedError pattern
  if (error instanceof Error && error.name === "UnauthorizedError") {
    return true;
  }
  return false;
}
