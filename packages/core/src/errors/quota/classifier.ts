// ============================================
// Quota Error Classifier
// ============================================

import { CONFIG_DEFAULTS } from "../../config/defaults.js";

/**
 * Result of classifying a quota-related error.
 */
export interface QuotaClassificationResult {
  /** Whether the error is terminal (cannot be retried) */
  isTerminal: boolean;
  /** Suggested delay before retry in milliseconds (only for retryable errors) */
  retryAfterMs?: number;
  /** Human-readable reason for the classification */
  reason: string;
}

/** Threshold above which any quota error becomes terminal (2 minutes) */
const TERMINAL_THRESHOLD_MS = 120000;

/** Default retry delay when uncertain (60 seconds) */
const DEFAULT_RETRY_DELAY_MS = CONFIG_DEFAULTS.timeouts.quotaRetryDelay;

/** Patterns indicating terminal quota errors (case-insensitive) */
const TERMINAL_PATTERNS = ["billing", "payment", "exceeded", "limit exceeded", "quota exceeded"];

/** Patterns indicating retryable quota errors (case-insensitive) */
const RETRYABLE_PATTERNS = [
  "rate limit",
  "rate-limit",
  "ratelimit",
  "throttled",
  "too many requests",
];

/**
 * Classifies a quota error as terminal or retryable based on message patterns
 * and retry-after duration.
 *
 * Classification rules (in order of precedence):
 * 1. retry-after > 2 minutes → terminal (regardless of message)
 * 2. Message contains terminal patterns → terminal
 * 3. Message contains retryable patterns → retryable
 * 4. Default → retryable with 60s delay
 *
 * @param message - The error message to analyze
 * @param retryAfterMs - Optional retry-after duration from the response
 * @returns Classification result with terminal flag, retry delay, and reason
 */
export function classifyQuotaError(
  message: string,
  retryAfterMs?: number
): QuotaClassificationResult {
  const lowerMessage = message.toLowerCase();

  // AC-002-3: retry-after > 2min → terminal regardless of message
  if (retryAfterMs !== undefined && retryAfterMs > TERMINAL_THRESHOLD_MS) {
    return {
      isTerminal: true,
      reason: `Retry-after duration (${retryAfterMs}ms) exceeds 2 minute threshold`,
    };
  }

  // AC-002-1: Check for terminal patterns
  for (const pattern of TERMINAL_PATTERNS) {
    if (lowerMessage.includes(pattern)) {
      return {
        isTerminal: true,
        reason: `Message contains terminal pattern: "${pattern}"`,
      };
    }
  }

  // AC-002-2: Check for retryable patterns
  for (const pattern of RETRYABLE_PATTERNS) {
    if (lowerMessage.includes(pattern)) {
      return {
        isTerminal: false,
        retryAfterMs: retryAfterMs ?? DEFAULT_RETRY_DELAY_MS,
        reason: `Message contains retryable pattern: "${pattern}"`,
      };
    }
  }

  // AC-002-4: Default to retryable with 60s delay when uncertain
  return {
    isTerminal: false,
    retryAfterMs: retryAfterMs ?? DEFAULT_RETRY_DELAY_MS,
    reason: "Default classification: retryable with 60s delay",
  };
}
