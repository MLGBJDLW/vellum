/**
 * API History Filter
 *
 * Filters compressed messages from API calls by excluding originals
 * that have been condensed into summaries.
 *
 * When messages are compressed:
 * - Original messages get `condenseParent` pointing to summary's `condenseId`
 * - Only the summary is included in API calls, not the originals
 *
 * @module @vellum/core/context
 * @see REQ-CMP-003 - API History Filtering
 */

import type { ContextMessage } from "./types.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Options for filtering API history
 */
export interface ApiHistoryFilterOptions {
  /** Include summary messages (default: true) */
  includeSummaries?: boolean;

  /** Include original compressed messages (default: false) */
  includeCompressed?: boolean;

  /** Maximum messages to return (default: no limit) */
  maxMessages?: number;

  /** Maximum tokens to return (default: no limit) */
  maxTokens?: number;

  /** Tokenizer function for maxTokens calculation */
  tokenizer?: (message: ContextMessage) => number;
}

/**
 * Result of API history filtering
 */
export interface ApiHistoryFilterResult {
  /** Filtered messages for API call */
  messages: ContextMessage[];

  /** Number of messages excluded */
  excludedCount: number;

  /** IDs of excluded messages */
  excludedIds: string[];

  /** Total token count of filtered messages */
  tokenCount: number;

  /** Whether any compression summaries were included */
  hasSummaries: boolean;
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Build a map of condenseId -> summary message
 *
 * Used to quickly look up if a summary exists for a given condenseId.
 *
 * @param messages - Array of context messages
 * @returns Map of condenseId to summary message
 *
 * @example
 * ```typescript
 * const map = buildSummaryMap(messages);
 * const summary = map.get('summary-123');
 * ```
 */
export function buildSummaryMap(messages: ContextMessage[]): Map<string, ContextMessage> {
  const map = new Map<string, ContextMessage>();

  for (const message of messages) {
    if (message.isSummary && message.condenseId) {
      map.set(message.condenseId, message);
    }
  }

  return map;
}

/**
 * Check if a summary message exists for a condenseId
 *
 * @param messages - Array of context messages
 * @param condenseId - The condenseId to check
 * @returns True if a summary with the given condenseId exists
 *
 * @example
 * ```typescript
 * if (summaryExistsForCondenseId(messages, 'summary-123')) {
 *   // Original messages can be excluded
 * }
 * ```
 */
export function summaryExistsForCondenseId(
  messages: ContextMessage[],
  condenseId: string
): boolean {
  return messages.some((msg) => msg.isSummary && msg.condenseId === condenseId);
}

/**
 * Get all messages with a specific condenseParent
 *
 * Returns messages that were compressed into the summary with the given condenseId.
 *
 * @param messages - Array of context messages
 * @param condenseId - The condenseId to match against condenseParent
 * @returns Array of messages with the matching condenseParent
 *
 * @example
 * ```typescript
 * const originals = getMessagesWithCondenseParent(messages, 'summary-123');
 * // Returns messages that were compressed into summary-123
 * ```
 */
export function getMessagesWithCondenseParent(
  messages: ContextMessage[],
  condenseId: string
): ContextMessage[] {
  return messages.filter((msg) => msg.condenseParent === condenseId);
}

/**
 * Check if a message should be included in API history
 *
 * Include if:
 * - No condenseParent, OR
 * - Has condenseParent but summary doesn't exist in messages
 *
 * Exclude if:
 * - Has condenseParent AND summary exists in messages
 * - Is a summary AND includeSummaries is false
 *
 * @param message - The message to check
 * @param allMessages - All messages for context
 * @param options - Filter options
 * @returns True if message should be included in API history
 *
 * @example
 * ```typescript
 * if (shouldIncludeInApiHistory(message, allMessages)) {
 *   apiMessages.push(message);
 * }
 * ```
 */
export function shouldIncludeInApiHistory(
  message: ContextMessage,
  allMessages: ContextMessage[],
  options?: ApiHistoryFilterOptions
): boolean {
  const includeSummaries = options?.includeSummaries ?? true;
  const includeCompressed = options?.includeCompressed ?? false;

  // Check if this is a summary message
  if (message.isSummary) {
    return includeSummaries;
  }

  // If explicitly including compressed messages
  if (includeCompressed) {
    return true;
  }

  // If message has no condenseParent, include it
  if (!message.condenseParent) {
    return true;
  }

  // Message has condenseParent - check if its summary exists
  // If summary exists, exclude this message (it's been compressed)
  // If summary doesn't exist, include this message (orphaned reference)
  return !summaryExistsForCondenseId(allMessages, message.condenseParent);
}

/**
 * Get compression chain for a message
 *
 * Returns array of summaries from oldest to newest by following
 * the condenseParent chain.
 *
 * @param messages - Array of context messages
 * @param startingCondenseId - The condenseId to start the chain from
 * @returns Array of summary messages in the chain
 *
 * @example
 * ```typescript
 * // If summary A was compressed into summary B, and B into C:
 * const chain = getCompressionChain(messages, 'condense-a');
 * // Returns [summaryA, summaryB, summaryC] (oldest to newest)
 * ```
 */
export function getCompressionChain(
  messages: ContextMessage[],
  startingCondenseId: string
): ContextMessage[] {
  const chain: ContextMessage[] = [];
  const visited = new Set<string>();
  let currentId: string | undefined = startingCondenseId;

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);

    // Find the summary with this condenseId
    const summary = messages.find((msg) => msg.isSummary && msg.condenseId === currentId);

    if (summary) {
      chain.push(summary);
      // Check if this summary was also compressed
      currentId = summary.condenseParent;
    } else {
      break;
    }
  }

  return chain;
}

/**
 * Get effective API history by filtering out compressed originals
 *
 * When messages are compressed:
 * - Original messages get condenseParent pointing to summary's condenseId
 * - Only include the summary, not the originals
 *
 * @param messages - Array of context messages
 * @param options - Filter options
 * @returns Filtered result with messages, stats, and metadata
 *
 * @example
 * ```typescript
 * // Messages: [msg1, msg2, summary(of msg1,msg2), msg3]
 * // msg1 and msg2 have condenseParent = summary.condenseId
 * const result = getEffectiveApiHistory(messages);
 * // result.messages = [summary, msg3]
 * // result.excludedCount = 2
 * ```
 */
export function getEffectiveApiHistory(
  messages: ContextMessage[],
  options?: ApiHistoryFilterOptions
): ApiHistoryFilterResult {
  const maxMessages = options?.maxMessages;
  const maxTokens = options?.maxTokens;
  const tokenizer = options?.tokenizer;

  const filteredMessages: ContextMessage[] = [];
  const excludedIds: string[] = [];
  let tokenCount = 0;
  let hasSummaries = false;

  for (const message of messages) {
    // Check if we've hit max messages limit
    if (maxMessages !== undefined && filteredMessages.length >= maxMessages) {
      excludedIds.push(message.id);
      continue;
    }

    // Check inclusion criteria
    if (!shouldIncludeInApiHistory(message, messages, options)) {
      excludedIds.push(message.id);
      continue;
    }

    // Calculate token count if needed
    const messageTokens = tokenizer ? tokenizer(message) : (message.tokens ?? 0);

    // Check if we've hit max tokens limit
    if (maxTokens !== undefined && tokenCount + messageTokens > maxTokens) {
      excludedIds.push(message.id);
      continue;
    }

    // Include this message
    filteredMessages.push(message);
    tokenCount += messageTokens;

    if (message.isSummary) {
      hasSummaries = true;
    }
  }

  return {
    messages: filteredMessages,
    excludedCount: excludedIds.length,
    excludedIds,
    tokenCount,
    hasSummaries,
  };
}

/**
 * Filter messages to API-safe format
 *
 * Removes internal fields like condenseId, condenseParent, priority
 * to produce clean messages suitable for LLM API calls.
 *
 * @param messages - Array of context messages
 * @returns Array of API-safe message objects
 *
 * @example
 * ```typescript
 * const apiMessages = toApiFormat(filteredMessages);
 * // apiMessages only contain role and content
 * ```
 */
export function toApiFormat(
  messages: ContextMessage[]
): Array<{ role: string; content: string | unknown[] }> {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}
