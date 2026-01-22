/**
 * Error Severity Types
 *
 * Shared severity definitions for the error system.
 *
 * @module @vellum/shared/errors/severity
 */

import { ErrorCode } from "./codes.js";

// =============================================================================
// Severity Types
// =============================================================================

/**
 * Error severity levels as string literals.
 * Used for new code, provides more flexibility than enums.
 */
export type ErrorSeverity = "low" | "medium" | "high" | "critical";

/**
 * Infers the appropriate severity level from an error code.
 *
 * Severity mapping:
 * - low: Transient errors that will likely resolve on their own
 * - medium: User-correctable errors or recoverable states
 * - high: Serious errors requiring attention
 * - critical: Fatal errors that cannot be recovered from
 *
 * @param code - The error code to infer severity from
 * @returns The inferred severity level
 */
export function inferSeverity(code: ErrorCode): ErrorSeverity {
  switch (code) {
    // ═══════════════════════════════════════════
    // Low severity - Transient, auto-retryable
    // ═══════════════════════════════════════════
    case ErrorCode.RATE_LIMITED:
    case ErrorCode.SERVICE_UNAVAILABLE:
    case ErrorCode.QUOTA_RETRYABLE:
    case ErrorCode.CIRCUIT_OPEN:
    case ErrorCode.LLM_RATE_LIMIT:
    case ErrorCode.LLM_TIMEOUT:
    case ErrorCode.LLM_NETWORK_ERROR:
    case ErrorCode.TOOL_TIMEOUT:
    case ErrorCode.MCP_TIMEOUT:
    case ErrorCode.MCP_CONNECTION:
    case ErrorCode.GIT_LOCK_TIMEOUT:
    case ErrorCode.GIT_TIMEOUT:
      return "low";

    // ═══════════════════════════════════════════
    // Medium severity - User correctable / recoverable
    // ═══════════════════════════════════════════
    case ErrorCode.TIMEOUT:
    case ErrorCode.NETWORK_ERROR:
    case ErrorCode.API_ERROR:
    case ErrorCode.CREDENTIAL_NOT_FOUND:
    case ErrorCode.CREDENTIAL_EXPIRED:
    case ErrorCode.CREDENTIAL_STORE_UNAVAILABLE:
    case ErrorCode.REFRESH_TOKEN_EXPIRED:
    case ErrorCode.LLM_CONTEXT_LENGTH:
    case ErrorCode.LLM_INVALID_RESPONSE:
    case ErrorCode.TOOL_NOT_FOUND:
    case ErrorCode.TOOL_VALIDATION_FAILED:
    case ErrorCode.TOOL_EXECUTION_FAILED:
    case ErrorCode.TOOL_PERMISSION_DENIED:
    case ErrorCode.TOOL_ABORTED:
    case ErrorCode.MCP_PROTOCOL:
    case ErrorCode.SMART_EDIT_FAILED:
    case ErrorCode.PATH_SECURITY:
    case ErrorCode.CONFIG_INVALID:
    case ErrorCode.CONFIG_NOT_FOUND:
    case ErrorCode.CONFIG_PARSE_ERROR:
    case ErrorCode.GIT_CONFLICT:
    case ErrorCode.GIT_DIRTY_WORKDIR:
    case ErrorCode.GIT_BRANCH_EXISTS:
    case ErrorCode.GIT_BRANCH_NOT_FOUND:
    case ErrorCode.GIT_REMOTE_ERROR:
    case ErrorCode.GIT_NO_STAGED_CHANGES:
    case ErrorCode.GIT_STASH_EMPTY:
    case ErrorCode.SESSION_NOT_FOUND:
    case ErrorCode.SESSION_EXPIRED:
    case ErrorCode.SESSION_CONFLICT:
    case ErrorCode.AGENT_NOT_FOUND:
    case ErrorCode.AGENT_LOOP_ERROR:
    case ErrorCode.CONTEXT_OVERFLOW:
      return "medium";

    // ═══════════════════════════════════════════
    // High severity - Requires attention
    // ═══════════════════════════════════════════
    case ErrorCode.SYSTEM_IO_ERROR:
    case ErrorCode.CREDENTIAL_INVALID_FORMAT:
    case ErrorCode.CREDENTIAL_VALIDATION_FAILED:
    case ErrorCode.KEYCHAIN_NOT_AVAILABLE:
    case ErrorCode.ENCRYPTION_FAILED:
    case ErrorCode.DECRYPTION_FAILED:
    case ErrorCode.PROVIDER_NOT_FOUND:
    case ErrorCode.PROVIDER_INITIALIZATION_FAILED:
    case ErrorCode.PROVIDER_AUTH_FAILED:
    case ErrorCode.LLM_AUTH_FAILED:
    case ErrorCode.GIT_NOT_INITIALIZED:
    case ErrorCode.GIT_SNAPSHOT_DISABLED:
    case ErrorCode.GIT_PROTECTED_PATH:
    case ErrorCode.GIT_OPERATION_FAILED:
      return "high";

    // ═══════════════════════════════════════════
    // Critical severity - Fatal, cannot recover
    // ═══════════════════════════════════════════
    case ErrorCode.UNKNOWN:
    case ErrorCode.INTERNAL_ERROR:
    case ErrorCode.NOT_IMPLEMENTED:
    case ErrorCode.SYSTEM_OUT_OF_MEMORY:
    case ErrorCode.QUOTA_TERMINAL:
    case ErrorCode.INVALID_ARGUMENT:
      return "critical";

    // Default to high for unknown codes
    default:
      return "high";
  }
}
