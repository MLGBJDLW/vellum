// ============================================
// Error Classification (T039)
// ============================================

/**
 * Error classification for determining handling strategy.
 *
 * Classifies errors by severity, retryability, and suggested action
 * to enable intelligent error recovery.
 *
 * @module @vellum/core/session/errors
 */

import { ErrorCode, ErrorSeverity, inferSeverity, VellumError } from "../errors/index.js";

/**
 * Severity levels for error classification.
 */
export type ErrorClassSeverity = "fatal" | "recoverable" | "transient";

/**
 * Suggested actions for error handling.
 */
export type SuggestedAction = "retry" | "abort" | "escalate" | "ignore";

/**
 * Information about a classified error.
 */
export interface ErrorInfo {
  /** The original error */
  error: Error;
  /** Classified severity level */
  severity: ErrorClassSeverity;
  /** Whether the error can be retried */
  retryable: boolean;
  /** Suggested action to take */
  suggestedAction: SuggestedAction;
  /** Error code if available */
  code?: ErrorCode;
  /** Suggested retry delay in milliseconds */
  retryDelay?: number;
  /** Maximum retry attempts suggested */
  maxRetries?: number;
  /** User-friendly error message */
  userMessage?: string;
  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Mapping of error codes to classification properties.
 */
const ERROR_CLASSIFICATIONS: Record<ErrorCode, Omit<ErrorInfo, "error" | "code">> = {
  // ═══════════════════════════════════════════
  // 1xxx - General/System Errors
  // ═══════════════════════════════════════════
  [ErrorCode.UNKNOWN]: {
    severity: "fatal",
    retryable: false,
    suggestedAction: "abort",
    userMessage: "An unexpected error occurred.",
  },
  [ErrorCode.INTERNAL_ERROR]: {
    severity: "fatal",
    retryable: false,
    suggestedAction: "abort",
    userMessage: "An internal error occurred.",
  },
  [ErrorCode.INVALID_ARGUMENT]: {
    severity: "recoverable",
    retryable: false,
    suggestedAction: "escalate",
    userMessage: "Invalid argument provided.",
  },
  [ErrorCode.NOT_IMPLEMENTED]: {
    severity: "fatal",
    retryable: false,
    suggestedAction: "abort",
    userMessage: "This feature is not yet implemented.",
  },
  [ErrorCode.TIMEOUT]: {
    severity: "transient",
    retryable: true,
    suggestedAction: "retry",
    retryDelay: 2000,
    maxRetries: 3,
    userMessage: "Operation timed out. Retrying...",
  },
  [ErrorCode.SYSTEM_IO_ERROR]: {
    severity: "transient",
    retryable: true,
    suggestedAction: "retry",
    retryDelay: 1000,
    maxRetries: 3,
    userMessage: "I/O error occurred.",
  },
  [ErrorCode.SYSTEM_OUT_OF_MEMORY]: {
    severity: "fatal",
    retryable: false,
    suggestedAction: "abort",
    userMessage: "Out of memory. Please restart the application.",
  },

  // ═══════════════════════════════════════════
  // 2xxx - Network/API Errors
  // ═══════════════════════════════════════════
  [ErrorCode.NETWORK_ERROR]: {
    severity: "transient",
    retryable: true,
    suggestedAction: "retry",
    retryDelay: 5000,
    maxRetries: 3,
    userMessage: "Network error. Retrying...",
  },
  [ErrorCode.API_ERROR]: {
    severity: "recoverable",
    retryable: true,
    suggestedAction: "retry",
    retryDelay: 2000,
    maxRetries: 2,
    userMessage: "API error occurred. Retrying...",
  },
  [ErrorCode.RATE_LIMITED]: {
    severity: "transient",
    retryable: true,
    suggestedAction: "retry",
    retryDelay: 60000,
    maxRetries: 5,
    userMessage: "Rate limit reached. Waiting before retry.",
  },
  [ErrorCode.SERVICE_UNAVAILABLE]: {
    severity: "transient",
    retryable: true,
    suggestedAction: "retry",
    retryDelay: 10000,
    maxRetries: 3,
    userMessage: "Service temporarily unavailable. Retrying...",
  },
  [ErrorCode.QUOTA_TERMINAL]: {
    severity: "fatal",
    retryable: false,
    suggestedAction: "abort",
    userMessage: "Quota permanently exceeded. Please check your billing or usage limits.",
  },
  [ErrorCode.QUOTA_RETRYABLE]: {
    severity: "transient",
    retryable: true,
    suggestedAction: "retry",
    retryDelay: 60000,
    maxRetries: 3,
    userMessage: "Rate limit reached. Waiting before retry.",
  },
  [ErrorCode.CIRCUIT_OPEN]: {
    severity: "transient",
    retryable: true,
    suggestedAction: "retry",
    retryDelay: 30000,
    maxRetries: 3,
    userMessage: "Service temporarily unavailable. Circuit breaker is open.",
  },

  // ═══════════════════════════════════════════
  // 3xxx - Configuration Errors
  // ═══════════════════════════════════════════
  [ErrorCode.CONFIG_INVALID]: {
    severity: "fatal",
    retryable: false,
    suggestedAction: "abort",
    userMessage: "Invalid configuration. Please check your settings.",
  },
  [ErrorCode.CONFIG_NOT_FOUND]: {
    severity: "fatal",
    retryable: false,
    suggestedAction: "abort",
    userMessage: "Configuration file not found.",
  },
  [ErrorCode.CONFIG_PARSE_ERROR]: {
    severity: "fatal",
    retryable: false,
    suggestedAction: "abort",
    userMessage: "Failed to parse configuration file.",
  },

  // ═══════════════════════════════════════════
  // 4xxx - Credential/Auth Errors
  // ═══════════════════════════════════════════
  [ErrorCode.CREDENTIAL_NOT_FOUND]: {
    severity: "fatal",
    retryable: false,
    suggestedAction: "abort",
    userMessage: "Credentials not found. Please configure your API keys.",
  },
  [ErrorCode.CREDENTIAL_EXPIRED]: {
    severity: "recoverable",
    retryable: false,
    suggestedAction: "escalate",
    userMessage: "Credentials have expired. Please refresh your API keys.",
  },
  [ErrorCode.CREDENTIAL_INVALID_FORMAT]: {
    severity: "fatal",
    retryable: false,
    suggestedAction: "abort",
    userMessage: "Invalid credential format.",
  },
  [ErrorCode.CREDENTIAL_VALIDATION_FAILED]: {
    severity: "fatal",
    retryable: false,
    suggestedAction: "abort",
    userMessage: "Credential validation failed. Please check your API keys.",
  },
  [ErrorCode.KEYCHAIN_NOT_AVAILABLE]: {
    severity: "recoverable",
    retryable: false,
    suggestedAction: "escalate",
    userMessage: "System keychain not available. Using fallback storage.",
  },
  [ErrorCode.ENCRYPTION_FAILED]: {
    severity: "fatal",
    retryable: false,
    suggestedAction: "abort",
    userMessage: "Failed to encrypt credentials.",
  },
  [ErrorCode.DECRYPTION_FAILED]: {
    severity: "fatal",
    retryable: false,
    suggestedAction: "abort",
    userMessage: "Failed to decrypt credentials.",
  },
  [ErrorCode.REFRESH_TOKEN_EXPIRED]: {
    severity: "recoverable",
    retryable: false,
    suggestedAction: "escalate",
    userMessage: "Refresh token has expired. Please re-authenticate.",
  },
  [ErrorCode.CREDENTIAL_STORE_UNAVAILABLE]: {
    severity: "recoverable",
    retryable: true,
    suggestedAction: "retry",
    retryDelay: 1000,
    maxRetries: 2,
    userMessage: "Credential store temporarily unavailable.",
  },

  // ═══════════════════════════════════════════
  // 5xxx - Provider/LLM Errors
  // ═══════════════════════════════════════════
  [ErrorCode.PROVIDER_NOT_FOUND]: {
    severity: "fatal",
    retryable: false,
    suggestedAction: "abort",
    userMessage: "Provider not found. Please check your configuration.",
  },
  [ErrorCode.PROVIDER_INITIALIZATION_FAILED]: {
    severity: "fatal",
    retryable: false,
    suggestedAction: "abort",
    userMessage: "Failed to initialize provider.",
  },
  [ErrorCode.PROVIDER_AUTH_FAILED]: {
    severity: "fatal",
    retryable: false,
    suggestedAction: "abort",
    userMessage: "Provider authentication failed. Please check your API key.",
  },
  [ErrorCode.LLM_RATE_LIMIT]: {
    severity: "transient",
    retryable: true,
    suggestedAction: "retry",
    retryDelay: 60000, // 1 minute
    maxRetries: 5,
    userMessage: "Rate limit reached. Waiting before retry.",
  },
  [ErrorCode.LLM_CONTEXT_LENGTH]: {
    severity: "recoverable",
    retryable: false,
    suggestedAction: "escalate",
    userMessage: "Context too long. Consider summarizing the conversation.",
  },
  [ErrorCode.LLM_AUTH_FAILED]: {
    severity: "fatal",
    retryable: false,
    suggestedAction: "abort",
    userMessage: "Authentication failed. Please check your API key.",
  },
  [ErrorCode.LLM_NETWORK_ERROR]: {
    severity: "transient",
    retryable: true,
    suggestedAction: "retry",
    retryDelay: 5000,
    maxRetries: 3,
    userMessage: "Network error. Retrying...",
  },
  [ErrorCode.LLM_TIMEOUT]: {
    severity: "transient",
    retryable: true,
    suggestedAction: "retry",
    retryDelay: 2000,
    maxRetries: 3,
    userMessage: "Request timed out. Retrying...",
  },
  [ErrorCode.LLM_INVALID_RESPONSE]: {
    severity: "recoverable",
    retryable: true,
    suggestedAction: "retry",
    retryDelay: 1000,
    maxRetries: 2,
    userMessage: "Received invalid response. Retrying...",
  },

  // ═══════════════════════════════════════════
  // 6xxx - Tool/MCP Errors
  // ═══════════════════════════════════════════
  [ErrorCode.TOOL_NOT_FOUND]: {
    severity: "recoverable",
    retryable: false,
    suggestedAction: "escalate",
    userMessage: "Requested tool not found.",
  },
  [ErrorCode.TOOL_VALIDATION_FAILED]: {
    severity: "recoverable",
    retryable: true,
    suggestedAction: "retry",
    retryDelay: 0,
    maxRetries: 1,
    userMessage: "Tool input validation failed.",
  },
  [ErrorCode.TOOL_EXECUTION_FAILED]: {
    severity: "recoverable",
    retryable: true,
    suggestedAction: "retry",
    retryDelay: 1000,
    maxRetries: 2,
    userMessage: "Tool execution failed.",
  },
  [ErrorCode.TOOL_PERMISSION_DENIED]: {
    severity: "recoverable",
    retryable: false,
    suggestedAction: "escalate",
    userMessage: "Permission denied for tool execution.",
  },
  [ErrorCode.TOOL_TIMEOUT]: {
    severity: "transient",
    retryable: true,
    suggestedAction: "retry",
    retryDelay: 2000,
    maxRetries: 2,
    userMessage: "Tool execution timed out.",
  },
  [ErrorCode.TOOL_ABORTED]: {
    severity: "recoverable",
    retryable: false,
    suggestedAction: "abort",
    userMessage: "Tool execution was aborted.",
  },
  [ErrorCode.PATH_SECURITY]: {
    severity: "recoverable",
    retryable: false,
    suggestedAction: "escalate",
    userMessage: "Path security validation failed.",
  },
  [ErrorCode.MCP_CONNECTION]: {
    severity: "transient",
    retryable: true,
    suggestedAction: "retry",
    retryDelay: 5000,
    maxRetries: 3,
    userMessage: "MCP connection failed. Retrying...",
  },
  [ErrorCode.MCP_PROTOCOL]: {
    severity: "recoverable",
    retryable: false,
    suggestedAction: "escalate",
    userMessage: "MCP protocol error.",
  },
  [ErrorCode.MCP_TIMEOUT]: {
    severity: "transient",
    retryable: true,
    suggestedAction: "retry",
    retryDelay: 3000,
    maxRetries: 2,
    userMessage: "MCP request timed out.",
  },
  [ErrorCode.SMART_EDIT_FAILED]: {
    severity: "recoverable",
    retryable: true,
    suggestedAction: "retry",
    retryDelay: 1000,
    maxRetries: 2,
    userMessage: "Smart edit operation failed.",
  },

  // ═══════════════════════════════════════════
  // 7xxx - Session Errors
  // ═══════════════════════════════════════════
  [ErrorCode.SESSION_NOT_FOUND]: {
    severity: "fatal",
    retryable: false,
    suggestedAction: "abort",
    userMessage: "Session not found.",
  },
  [ErrorCode.SESSION_EXPIRED]: {
    severity: "fatal",
    retryable: false,
    suggestedAction: "abort",
    userMessage: "Session expired. Please start a new session.",
  },
  [ErrorCode.SESSION_CONFLICT]: {
    severity: "recoverable",
    retryable: true,
    suggestedAction: "retry",
    retryDelay: 1000,
    maxRetries: 1,
    userMessage: "Session conflict detected.",
  },

  // ═══════════════════════════════════════════
  // 8xxx - Agent Errors
  // ═══════════════════════════════════════════
  [ErrorCode.AGENT_NOT_FOUND]: {
    severity: "fatal",
    retryable: false,
    suggestedAction: "abort",
    userMessage: "Agent not found.",
  },
  [ErrorCode.AGENT_LOOP_ERROR]: {
    severity: "fatal",
    retryable: false,
    suggestedAction: "abort",
    userMessage: "Agent loop error detected.",
  },
  [ErrorCode.CONTEXT_OVERFLOW]: {
    severity: "recoverable",
    retryable: false,
    suggestedAction: "escalate",
    userMessage: "Context window overflow. Consider summarizing the conversation.",
  },

  // ═══════════════════════════════════════════
  // 9xxx - Git/Snapshot Errors
  // ═══════════════════════════════════════════
  [ErrorCode.GIT_NOT_INITIALIZED]: {
    severity: "recoverable",
    retryable: false,
    suggestedAction: "escalate",
    userMessage: "Git repository not initialized. Run 'git init' to enable snapshots.",
  },
  [ErrorCode.GIT_SNAPSHOT_DISABLED]: {
    severity: "recoverable",
    retryable: false,
    suggestedAction: "ignore",
    userMessage: "Git snapshots are disabled in configuration.",
  },
  [ErrorCode.GIT_PROTECTED_PATH]: {
    severity: "recoverable",
    retryable: false,
    suggestedAction: "escalate",
    userMessage: "Cannot modify protected path.",
  },
  [ErrorCode.GIT_OPERATION_FAILED]: {
    severity: "recoverable",
    retryable: true,
    suggestedAction: "retry",
    retryDelay: 1000,
    maxRetries: 2,
    userMessage: "Git operation failed.",
  },
  [ErrorCode.GIT_LOCK_TIMEOUT]: {
    severity: "transient",
    retryable: true,
    suggestedAction: "retry",
    retryDelay: 500,
    maxRetries: 5,
    userMessage: "Git lock timeout. Retrying...",
  },
  [ErrorCode.GIT_CONFLICT]: {
    severity: "recoverable",
    retryable: false,
    suggestedAction: "escalate",
    userMessage: "Git conflict detected. Please resolve conflicts manually.",
  },
  [ErrorCode.GIT_DIRTY_WORKDIR]: {
    severity: "recoverable",
    retryable: false,
    suggestedAction: "escalate",
    userMessage: "Working directory has uncommitted changes. Please commit or stash changes first.",
  },
  [ErrorCode.GIT_BRANCH_EXISTS]: {
    severity: "recoverable",
    retryable: false,
    suggestedAction: "escalate",
    userMessage: "Branch already exists.",
  },
  [ErrorCode.GIT_BRANCH_NOT_FOUND]: {
    severity: "recoverable",
    retryable: false,
    suggestedAction: "escalate",
    userMessage: "Branch not found.",
  },
  [ErrorCode.GIT_REMOTE_ERROR]: {
    severity: "transient",
    retryable: true,
    suggestedAction: "retry",
    retryDelay: 5000,
    maxRetries: 3,
    userMessage: "Git remote operation failed. Retrying...",
  },
  [ErrorCode.GIT_TIMEOUT]: {
    severity: "transient",
    retryable: true,
    suggestedAction: "retry",
    retryDelay: 1000,
    maxRetries: 3,
    userMessage: "Git operation timed out. Retrying...",
  },
  [ErrorCode.GIT_NO_STAGED_CHANGES]: {
    severity: "recoverable",
    retryable: false,
    suggestedAction: "escalate",
    userMessage: "No staged changes to commit.",
  },
  [ErrorCode.GIT_STASH_EMPTY]: {
    severity: "recoverable",
    retryable: false,
    suggestedAction: "escalate",
    userMessage: "No stash entries found.",
  },
};

/**
 * Classifies an error to determine handling strategy.
 *
 * @example
 * ```typescript
 * try {
 *   await callLLM();
 * } catch (error) {
 *   const info = classifyError(error);
 *
 *   if (info.retryable && info.maxRetries) {
 *     await sleep(info.retryDelay);
 *     await retry(info.maxRetries);
 *   } else if (info.suggestedAction === "abort") {
 *     throw error;
 *   }
 * }
 * ```
 *
 * @param error - Error to classify
 * @returns ErrorInfo with classification details
 */
export function classifyError(error: unknown): ErrorInfo {
  // Handle VellumError with known code
  if (error instanceof VellumError) {
    const classification = ERROR_CLASSIFICATIONS[error.code];
    if (classification) {
      return {
        error,
        code: error.code,
        ...classification,
        context: error.context,
      };
    }

    // Fallback based on severity
    const severity = inferSeverity(error.code);
    return {
      error,
      code: error.code,
      severity: mapErrorSeverity(severity),
      retryable: error.isRetryable,
      suggestedAction: getSuggestedAction(severity, error.isRetryable),
      retryDelay: error.retryDelay,
      context: error.context,
    };
  }

  // Convert to Error if not already
  const err = error instanceof Error ? error : new Error(String(error));

  // Classify based on error message patterns
  return classifyByMessage(err);
}

/**
 * Maps ErrorSeverity enum to ErrorClassSeverity.
 */
function mapErrorSeverity(severity: ErrorSeverity): ErrorClassSeverity {
  switch (severity) {
    case ErrorSeverity.FATAL:
      return "fatal";
    case ErrorSeverity.RECOVERABLE:
      return "transient";
    case ErrorSeverity.USER_ACTION:
      return "recoverable";
    default:
      return "fatal";
  }
}

/**
 * Determines suggested action based on severity and retryability.
 */
function getSuggestedAction(severity: ErrorSeverity, retryable: boolean): SuggestedAction {
  if (severity === ErrorSeverity.FATAL) {
    return "abort";
  }
  if (retryable) {
    return "retry";
  }
  if (severity === ErrorSeverity.USER_ACTION) {
    return "escalate";
  }
  return "abort";
}

/**
 * Classifies errors based on message patterns.
 */
function classifyByMessage(error: Error): ErrorInfo {
  const message = error.message.toLowerCase();

  // Network-related patterns
  if (
    message.includes("network") ||
    message.includes("econnrefused") ||
    message.includes("enotfound") ||
    message.includes("dns")
  ) {
    return {
      error,
      severity: "transient",
      retryable: true,
      suggestedAction: "retry",
      retryDelay: 5000,
      maxRetries: 3,
      userMessage: "Network connection error.",
    };
  }

  // Timeout patterns
  if (message.includes("timeout") || message.includes("timed out")) {
    return {
      error,
      severity: "transient",
      retryable: true,
      suggestedAction: "retry",
      retryDelay: 2000,
      maxRetries: 3,
      userMessage: "Operation timed out.",
    };
  }

  // Rate limit patterns
  if (
    message.includes("rate limit") ||
    message.includes("429") ||
    message.includes("too many requests")
  ) {
    return {
      error,
      severity: "transient",
      retryable: true,
      suggestedAction: "retry",
      retryDelay: 60000,
      maxRetries: 5,
      userMessage: "Rate limit reached.",
    };
  }

  // Auth patterns
  if (
    message.includes("unauthorized") ||
    message.includes("401") ||
    message.includes("authentication") ||
    message.includes("api key")
  ) {
    return {
      error,
      severity: "fatal",
      retryable: false,
      suggestedAction: "abort",
      userMessage: "Authentication failed.",
    };
  }

  // Permission patterns
  if (message.includes("permission") || message.includes("403") || message.includes("forbidden")) {
    return {
      error,
      severity: "recoverable",
      retryable: false,
      suggestedAction: "escalate",
      userMessage: "Permission denied.",
    };
  }

  // Not found patterns
  if (message.includes("not found") || message.includes("404")) {
    return {
      error,
      severity: "recoverable",
      retryable: false,
      suggestedAction: "escalate",
      userMessage: "Resource not found.",
    };
  }

  // Default - unknown error
  return {
    error,
    severity: "fatal",
    retryable: false,
    suggestedAction: "abort",
    userMessage: "An unexpected error occurred.",
  };
}

/**
 * Checks if an error is retryable.
 */
export function isRetryable(error: unknown): boolean {
  return classifyError(error).retryable;
}

/**
 * Checks if an error is fatal.
 */
export function isFatal(error: unknown): boolean {
  return classifyError(error).severity === "fatal";
}

/**
 * Checks if an error is transient.
 */
export function isTransient(error: unknown): boolean {
  return classifyError(error).severity === "transient";
}

/**
 * Gets the retry delay for an error.
 */
export function getRetryDelay(error: unknown): number {
  return classifyError(error).retryDelay ?? 0;
}

/**
 * Gets the suggested action for an error.
 */
export function getSuggestedErrorAction(error: unknown): SuggestedAction {
  return classifyError(error).suggestedAction;
}
