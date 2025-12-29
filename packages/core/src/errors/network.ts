// ============================================
// Vellum Network Error Detection and Wrapping
// T023 - Network error detection and wrapping
// ============================================

import { ErrorCode, VellumError, type VellumErrorOptions } from "./types.js";

/**
 * Known network error codes that indicate transient network failures.
 * AC-010-1: ECONNRESET, ETIMEDOUT, ENOTFOUND detected as network errors
 */
export const NETWORK_ERROR_CODES = [
  "ECONNRESET", // Connection reset by peer
  "ETIMEDOUT", // Connection timed out
  "ENOTFOUND", // DNS lookup failed
  "ECONNREFUSED", // Connection refused
  "ENETUNREACH", // Network is unreachable
  "EAI_AGAIN", // DNS lookup timed out (temporary failure)
  "EPIPE", // Broken pipe
  "ECONNABORTED", // Connection aborted
  "EHOSTUNREACH", // Host is unreachable
  "ENETDOWN", // Network is down
  "EPROTO", // Protocol error
  "ENOENT", // No such file or directory (can occur with Unix sockets)
] as const;

/**
 * Type for network error codes
 */
export type NetworkErrorCode = (typeof NETWORK_ERROR_CODES)[number];

/**
 * User-friendly messages for network error codes
 */
const NETWORK_ERROR_MESSAGES: Record<NetworkErrorCode, string> = {
  ECONNRESET: "Connection was reset by the server",
  ETIMEDOUT: "Connection timed out",
  ENOTFOUND: "Could not resolve hostname",
  ECONNREFUSED: "Connection refused by the server",
  ENETUNREACH: "Network is unreachable",
  EAI_AGAIN: "DNS lookup timed out",
  EPIPE: "Connection was closed unexpectedly",
  ECONNABORTED: "Connection was aborted",
  EHOSTUNREACH: "Host is unreachable",
  ENETDOWN: "Network is down",
  EPROTO: "Protocol error",
  ENOENT: "Connection endpoint not found",
};

/**
 * Error interface with code property for Node.js system errors
 */
interface ErrorWithCode extends Error {
  code?: string;
}

/**
 * Checks if an error is a network-related error.
 * AC-010-1: ECONNRESET, ETIMEDOUT, ENOTFOUND detected as network errors
 *
 * @param error - Any error value
 * @returns True if the error is a network error
 *
 * @example
 * ```typescript
 * try {
 *   await fetch(url);
 * } catch (error) {
 *   if (isNetworkError(error)) {
 *     // Handle transient network failure
 *   }
 * }
 * ```
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof Error && "code" in error) {
    const code = (error as ErrorWithCode).code;
    if (typeof code === "string") {
      return (NETWORK_ERROR_CODES as readonly string[]).includes(code);
    }
  }
  return false;
}

/**
 * Gets the network error code from an error, if present.
 *
 * @param error - Any error value
 * @returns The network error code or null if not a network error
 */
export function getNetworkErrorCode(error: unknown): NetworkErrorCode | null {
  if (error instanceof Error && "code" in error) {
    const code = (error as ErrorWithCode).code;
    if (typeof code === "string" && (NETWORK_ERROR_CODES as readonly string[]).includes(code)) {
      return code as NetworkErrorCode;
    }
  }
  return null;
}

/**
 * Network error class for wrapping low-level network failures.
 * Extends VellumError with the original error code.
 */
export class NetworkError extends VellumError {
  /** The original system error code (e.g., ECONNRESET) */
  readonly originalCode: string;

  constructor(
    message: string,
    originalCode: string,
    options?: Omit<VellumErrorOptions, "isRetryable">
  ) {
    super(message, ErrorCode.NETWORK_ERROR, {
      ...options,
      context: { ...options?.context, originalCode },
      // Network errors are always retryable
      isRetryable: true,
    });
    this.name = "NetworkError";
    this.originalCode = originalCode;
  }
}

/**
 * Wraps a network error with a user-friendly NetworkError.
 *
 * @param error - The original network error
 * @returns A NetworkError with a friendly message
 * @throws If the error is not a network error
 *
 * @example
 * ```typescript
 * try {
 *   await fetch(url);
 * } catch (error) {
 *   if (isNetworkError(error)) {
 *     throw wrapNetworkError(error);
 *   }
 *   throw error;
 * }
 * ```
 */
export function wrapNetworkError(error: Error): NetworkError {
  const code = getNetworkErrorCode(error);
  if (!code) {
    throw new Error("wrapNetworkError called with non-network error");
  }

  const friendlyMessage = NETWORK_ERROR_MESSAGES[code] || `Network error: ${code}`;

  return new NetworkError(friendlyMessage, code, {
    cause: error,
    context: {
      originalMessage: error.message,
    },
  });
}

/**
 * Wraps a network error if it is one, otherwise returns the original error.
 * This is a safer version that doesn't throw for non-network errors.
 *
 * @param error - Any error
 * @returns NetworkError if it's a network error, otherwise the original error
 */
export function maybeWrapNetworkError(error: Error): Error {
  if (isNetworkError(error)) {
    return wrapNetworkError(error);
  }
  return error;
}
