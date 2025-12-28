/**
 * Context Management System - Summary Detection Module
 *
 * Provides utilities for detecting and tracking summary messages in context.
 * Summaries are created during context compression to preserve key information
 * while reducing token usage.
 *
 * Features:
 * - Recent summary detection within time windows
 * - Latest summary retrieval
 * - Summary message discovery and ordering
 * - Context state tracking for summaries
 *
 * @module @vellum/core/context/summary-detection
 */

import type { ContextMessage } from "./types.js";

// ============================================================================
// Constants
// ============================================================================

/**
 * Default time window for recent summary detection (5 minutes in milliseconds).
 * Summaries within this window are considered "recent" enough to skip re-summarization.
 */
export const DEFAULT_SUMMARY_WINDOW_MS = 5 * 60 * 1000;

// ============================================================================
// Summary Detection
// ============================================================================

/**
 * Check if a recent summary exists within the specified time window.
 *
 * This is used to prevent over-summarization by detecting if a summary
 * was already created recently. Helps avoid repeatedly compressing
 * the same context within short time spans.
 *
 * @param messages - Array of context messages to search
 * @param withinMs - Time window in milliseconds (default: 5 minutes)
 * @returns True if a summary exists within the time window
 *
 * @example
 * ```typescript
 * const messages: ContextMessage[] = [...];
 *
 * // Check with default 5-minute window
 * if (recentSummaryExists(messages)) {
 *   console.log('Skipping compression - recent summary exists');
 * }
 *
 * // Check with custom 10-minute window
 * if (recentSummaryExists(messages, 10 * 60 * 1000)) {
 *   console.log('Summary exists within last 10 minutes');
 * }
 * ```
 */
export function recentSummaryExists(
  messages: ContextMessage[],
  withinMs: number = DEFAULT_SUMMARY_WINDOW_MS
): boolean {
  if (!Array.isArray(messages) || messages.length === 0) {
    return false;
  }

  const now = Date.now();
  const cutoffTime = now - withinMs;

  return messages.some(
    (msg) =>
      msg.isSummary === true && typeof msg.createdAt === "number" && msg.createdAt >= cutoffTime
  );
}

/**
 * Get the latest (most recent) summary message.
 *
 * Finds the summary message with the highest `createdAt` timestamp.
 * Summaries without timestamps are considered older than those with timestamps.
 *
 * @param messages - Array of context messages to search
 * @returns The most recent summary message, or undefined if none exist
 *
 * @example
 * ```typescript
 * const messages: ContextMessage[] = [...];
 * const latest = getLatestSummary(messages);
 *
 * if (latest) {
 *   console.log(`Latest summary: ${latest.id}`);
 *   console.log(`Created at: ${new Date(latest.createdAt!)}`);
 * } else {
 *   console.log('No summaries found');
 * }
 * ```
 */
export function getLatestSummary(messages: ContextMessage[]): ContextMessage | undefined {
  if (!Array.isArray(messages) || messages.length === 0) {
    return undefined;
  }

  const summaries = messages.filter((msg) => msg.isSummary === true);

  if (summaries.length === 0) {
    return undefined;
  }

  // Sort by createdAt descending (newest first)
  // Messages without createdAt are sorted to the end
  return summaries.reduce((latest, current) => {
    const latestTime = latest.createdAt ?? 0;
    const currentTime = current.createdAt ?? 0;
    return currentTime > latestTime ? current : latest;
  });
}

// ============================================================================
// Context State
// ============================================================================

/**
 * Summary tracking state for context management.
 *
 * Tracks when summaries were created and how many have been generated
 * during a session.
 */
export interface SummaryTrackingState {
  /** Timestamp of the last summary creation, or null if never summarized */
  readonly lastSummaryTime: number | null;
  /** Total count of summaries created in this context */
  readonly summaryCount: number;
}

/**
 * Create initial context state for summary tracking.
 *
 * Returns a fresh state object with no summaries tracked.
 * This state can be used to track summary creation over time.
 *
 * @returns Initial summary tracking state
 *
 * @example
 * ```typescript
 * const state = createContextState();
 * // { lastSummaryTime: null, summaryCount: 0 }
 *
 * // After creating a summary:
 * const updatedState = {
 *   lastSummaryTime: Date.now(),
 *   summaryCount: state.summaryCount + 1,
 * };
 * ```
 */
export function createContextState(): SummaryTrackingState {
  return {
    lastSummaryTime: null,
    summaryCount: 0,
  };
}

// ============================================================================
// Summary Discovery
// ============================================================================

/**
 * Find all summary messages in chronological order.
 *
 * Returns summaries sorted by `createdAt` timestamp (oldest first).
 * Summaries without timestamps are placed at the beginning.
 *
 * @param messages - Array of context messages to search
 * @returns Array of summary messages in chronological order
 *
 * @example
 * ```typescript
 * const messages: ContextMessage[] = [...];
 * const summaries = findSummaries(messages);
 *
 * console.log(`Found ${summaries.length} summaries`);
 * summaries.forEach((s, i) => {
 *   console.log(`Summary ${i + 1}: ${s.id}`);
 * });
 * ```
 */
export function findSummaries(messages: ContextMessage[]): ContextMessage[] {
  if (!Array.isArray(messages) || messages.length === 0) {
    return [];
  }

  const summaries = messages.filter((msg) => msg.isSummary === true);

  // Sort by createdAt ascending (oldest first)
  // Messages without createdAt are sorted to the beginning
  return [...summaries].sort((a, b) => {
    const timeA = a.createdAt ?? 0;
    const timeB = b.createdAt ?? 0;
    return timeA - timeB;
  });
}

// ============================================================================
// Additional Utilities
// ============================================================================

/**
 * Check if a specific message is a summary.
 *
 * @param message - The message to check
 * @returns True if the message is marked as a summary
 *
 * @example
 * ```typescript
 * const msg: ContextMessage = { ... };
 * if (isSummaryMessage(msg)) {
 *   console.log('This is a summary message');
 * }
 * ```
 */
export function isSummaryMessage(message: ContextMessage): boolean {
  return message.isSummary === true;
}

/**
 * Count the number of summary messages in an array.
 *
 * @param messages - Array of context messages
 * @returns Number of summary messages
 *
 * @example
 * ```typescript
 * const count = countSummaries(messages);
 * console.log(`Total summaries: ${count}`);
 * ```
 */
export function countSummaries(messages: ContextMessage[]): number {
  if (!Array.isArray(messages) || messages.length === 0) {
    return 0;
  }
  return messages.filter((msg) => msg.isSummary === true).length;
}

/**
 * Get summaries created after a specific timestamp.
 *
 * @param messages - Array of context messages
 * @param afterTimestamp - Unix timestamp in milliseconds
 * @returns Array of summaries created after the timestamp
 *
 * @example
 * ```typescript
 * const oneHourAgo = Date.now() - 60 * 60 * 1000;
 * const recentSummaries = getSummariesAfter(messages, oneHourAgo);
 * ```
 */
export function getSummariesAfter(
  messages: ContextMessage[],
  afterTimestamp: number
): ContextMessage[] {
  if (!Array.isArray(messages) || messages.length === 0) {
    return [];
  }

  return messages.filter(
    (msg) =>
      msg.isSummary === true && typeof msg.createdAt === "number" && msg.createdAt > afterTimestamp
  );
}
