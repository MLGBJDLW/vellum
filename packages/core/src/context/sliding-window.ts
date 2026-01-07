/**
 * Sliding Window Manager
 *
 * Priority-based sliding window truncation for context management.
 * Removes lowest-priority messages first while preserving:
 * - System messages (never removed)
 * - Anchor messages (first user message)
 * - Recent messages (last N)
 * - Tool pairs (kept together)
 *
 * @module @vellum/core/context/sliding-window
 */

import { analyzeToolPairs, getLinkedIndices, type ToolPairAnalysis } from "./tool-pairing.js";
import { type ContextMessage, MessagePriority } from "./types.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Options for sliding window truncation.
 */
export interface TruncateOptions {
  /** Target token budget to fit within */
  readonly targetTokens: number;

  /** Number of recent messages to protect (default: 3) */
  readonly recentCount?: number;

  /** Whether to preserve tool pairs (default: true) */
  readonly preserveToolPairs?: boolean;

  /** Custom tokenizer function (default: estimate) */
  readonly tokenizer?: (message: ContextMessage) => number;
}

/**
 * Result of truncation operation.
 */
export interface TruncateResult {
  /** Messages after truncation */
  readonly messages: ContextMessage[];

  /** Number of messages removed */
  readonly removedCount: number;

  /** Token count after truncation */
  readonly tokenCount: number;

  /** IDs of removed messages (for rollback tracking) */
  readonly removedIds: string[];
}

/**
 * Truncation candidate with priority and token info.
 */
export interface TruncationCandidate {
  /** Index in the original message array */
  readonly index: number;

  /** Calculated priority for this message */
  readonly priority: number;

  /** Token count for this message */
  readonly tokens: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Default number of recent messages to protect */
const DEFAULT_RECENT_COUNT = 3;

/** Estimated characters per token for rough estimation */
const CHARS_PER_TOKEN = 4;

// ============================================================================
// Token Estimation
// ============================================================================

/**
 * Default token estimator (rough, for fallback).
 * Estimates ~4 chars per token for text content.
 *
 * @param message - The context message to estimate tokens for
 * @returns Estimated token count
 *
 * @example
 * ```typescript
 * const tokens = estimateTokens({
 *   id: '1',
 *   role: 'user',
 *   content: 'Hello, world!',
 *   priority: MessagePriority.NORMAL,
 * });
 * // tokens ≈ 4
 * ```
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Token estimation requires handling multiple content types
export function estimateTokens(message: ContextMessage): number {
  // If already has token count, use it
  if (message.tokens !== undefined) {
    return message.tokens;
  }

  const content = message.content;

  // String content: estimate based on character count
  if (typeof content === "string") {
    return Math.ceil(content.length / CHARS_PER_TOKEN);
  }

  // Array content: sum up all blocks
  let totalChars = 0;

  for (const block of content) {
    switch (block.type) {
      case "text":
        totalChars += block.text.length;
        break;
      case "tool_use":
        // Tool name + serialized input
        totalChars += block.name.length + JSON.stringify(block.input).length;
        break;
      case "tool_result": {
        // Tool result content
        const resultContent = block.content;
        if (typeof resultContent === "string") {
          totalChars += resultContent.length;
        } else {
          // Nested content blocks - recursive estimation
          for (const nested of resultContent) {
            if (nested.type === "text") {
              totalChars += nested.text.length;
            }
          }
        }
        break;
      }
      case "image":
        // Images: rough estimate based on dimensions or fixed cost
        if (block.width && block.height) {
          // Anthropic-style: pixels / 750
          totalChars += Math.ceil((block.width * block.height) / 750) * CHARS_PER_TOKEN;
        } else {
          // Fixed estimate for unknown size
          totalChars += 258 * CHARS_PER_TOKEN; // Gemini-style fixed cost
        }
        break;
    }
  }

  return Math.ceil(totalChars / CHARS_PER_TOKEN);
}

// ============================================================================
// Priority Calculation
// ============================================================================

/**
 * Calculate priority for a message based on context.
 *
 * Priority rules (REQ-WIN-001):
 * - SYSTEM (100): role === 'system'
 * - ANCHOR (90): First user message, or explicitly marked
 * - RECENT (80): Within recentCount of end
 * - TOOL_PAIR (70): Part of tool_use/tool_result pair
 * - NORMAL (30): Everything else
 *
 * @param message - The message to calculate priority for
 * @param index - Position in the message array (0-based)
 * @param totalMessages - Total number of messages in the array
 * @param recentCount - Number of recent messages to protect
 * @param toolPairAnalysis - Analysis of tool pairs in the messages
 * @returns The calculated priority value
 *
 * @example
 * ```typescript
 * const analysis = analyzeToolPairs(messages);
 * const priority = calculatePriority(
 *   messages[0],
 *   0,
 *   messages.length,
 *   3,
 *   analysis
 * );
 * ```
 */
export function calculatePriority(
  message: ContextMessage,
  index: number,
  totalMessages: number,
  recentCount: number,
  toolPairAnalysis: ToolPairAnalysis
): number {
  // SYSTEM messages: highest priority (never remove)
  if (message.role === "system") {
    return MessagePriority.SYSTEM;
  }

  // ANCHOR: first user message (index 0 or 1 if system is at 0)
  // System messages are typically at index 0, so first user is often at 1
  if (index === 0 && message.role === "user") {
    return MessagePriority.ANCHOR;
  }

  // Check if this is the first user message after system messages
  if (message.role === "user" && index <= 1) {
    return MessagePriority.ANCHOR;
  }

  // RECENT: within last N messages
  const recentThreshold = totalMessages - recentCount;
  if (index >= recentThreshold) {
    return MessagePriority.RECENT;
  }

  // TOOL_PAIR: part of tool_use/tool_result pair
  if (toolPairAnalysis.pairedMessageIndices.has(index)) {
    return MessagePriority.TOOL_PAIR;
  }

  // NORMAL: everything else
  return MessagePriority.NORMAL;
}

/**
 * Assign priorities to all messages (mutates priority field).
 *
 * Creates new message objects with updated priority values.
 * Does not mutate the original messages.
 *
 * @param messages - Array of messages to assign priorities to
 * @param recentCount - Number of recent messages to protect
 * @param toolPairAnalysis - Analysis of tool pairs in the messages
 *
 * @example
 * ```typescript
 * const analysis = analyzeToolPairs(messages);
 * assignPriorities(messages, 3, analysis);
 * // Each message now has a priority assigned
 * ```
 */
export function assignPriorities(
  messages: ContextMessage[],
  recentCount: number,
  toolPairAnalysis: ToolPairAnalysis
): void {
  const totalMessages = messages.length;

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    if (!message) continue;
    const priority = calculatePriority(message, i, totalMessages, recentCount, toolPairAnalysis);

    // Mutate the priority field (as per interface contract)
    (message as { priority: number }).priority = priority;
  }
}

// ============================================================================
// Truncation Candidates
// ============================================================================

/**
 * Get truncation candidates sorted by priority (lowest first).
 * Excludes SYSTEM and ANCHOR messages which should never be removed.
 *
 * @param messages - Array of context messages
 * @param recentCount - Number of recent messages to protect
 * @param toolPairAnalysis - Analysis of tool pairs in the messages
 * @returns Array of candidates sorted by priority (ascending)
 *
 * @example
 * ```typescript
 * const analysis = analyzeToolPairs(messages);
 * const candidates = getTruncationCandidates(messages, 3, analysis);
 * // candidates[0] has lowest priority (remove first)
 * ```
 */
export function getTruncationCandidates(
  messages: ContextMessage[],
  recentCount: number,
  toolPairAnalysis: ToolPairAnalysis
): TruncationCandidate[] {
  const candidates: TruncationCandidate[] = [];
  const totalMessages = messages.length;

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    if (!message) continue;
    const priority = calculatePriority(message, i, totalMessages, recentCount, toolPairAnalysis);

    // Skip SYSTEM and ANCHOR - they should never be removed
    if (priority >= MessagePriority.ANCHOR) {
      continue;
    }

    candidates.push({
      index: i,
      priority,
      tokens: message.tokens ?? estimateTokens(message),
    });
  }

  // Sort by priority ascending (lowest priority = remove first)
  // For same priority, prefer removing older messages (lower index)
  candidates.sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    return a.index - b.index;
  });

  return candidates;
}

// ============================================================================
// Budget Checking
// ============================================================================

/**
 * Check if messages fit within budget.
 *
 * @param messages - Array of context messages
 * @param budget - Token budget to fit within
 * @param tokenizer - Optional custom tokenizer function
 * @returns true if total tokens <= budget
 *
 * @example
 * ```typescript
 * if (fitsInBudget(messages, 10000)) {
 *   console.log('No truncation needed');
 * }
 * ```
 */
export function fitsInBudget(
  messages: ContextMessage[],
  budget: number,
  tokenizer?: (m: ContextMessage) => number
): boolean {
  const getTokens = tokenizer ?? estimateTokens;
  let total = 0;

  for (const message of messages) {
    total += getTokens(message);
    if (total > budget) {
      return false;
    }
  }

  return true;
}

/**
 * Calculate total token count for messages.
 *
 * @param messages - Array of context messages
 * @param tokenizer - Optional custom tokenizer function
 * @returns Total token count
 */
function calculateTotalTokens(
  messages: ContextMessage[],
  tokenizer: (m: ContextMessage) => number
): number {
  let total = 0;
  for (const message of messages) {
    total += tokenizer(message);
  }
  return total;
}

// ============================================================================
// Main Truncation Logic
// ============================================================================

/**
 * Truncate messages to fit within token budget.
 *
 * Algorithm:
 * 1. Calculate priority for each message
 * 2. Sort candidates by priority (ascending = remove first)
 * 3. Remove lowest priority messages until under budget
 * 4. Never split tool pairs (REQ-WIN-002)
 *
 * @param messages - Array of context messages to truncate
 * @param options - Truncation options
 * @returns Result containing truncated messages and removal info
 *
 * @example
 * ```typescript
 * const result = truncate(messages, {
 *   targetTokens: 10000,
 *   recentCount: 3,
 *   preserveToolPairs: true,
 * });
 * console.log(`Removed ${result.removedCount} messages`);
 * ```
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Truncation algorithm requires complex priority-based selection logic
export function truncate(messages: ContextMessage[], options: TruncateOptions): TruncateResult {
  const {
    targetTokens,
    recentCount = DEFAULT_RECENT_COUNT,
    preserveToolPairs = true,
    tokenizer = estimateTokens,
  } = options;

  // Empty or already fitting
  if (messages.length === 0) {
    return {
      messages: [],
      removedCount: 0,
      tokenCount: 0,
      removedIds: [],
    };
  }

  // Calculate current token count
  let currentTokens = calculateTotalTokens(messages, tokenizer);

  // Already within budget?
  if (currentTokens <= targetTokens) {
    return {
      messages: [...messages],
      removedCount: 0,
      tokenCount: currentTokens,
      removedIds: [],
    };
  }

  // Analyze tool pairs
  const toolPairAnalysis = analyzeToolPairs(messages);

  // Get truncation candidates (excludes SYSTEM and ANCHOR)
  const candidates = getTruncationCandidates(messages, recentCount, toolPairAnalysis);

  // Track which indices to remove
  const indicesToRemove = new Set<number>();
  const removedIds: string[] = [];

  // Remove candidates until we're under budget
  for (const candidate of candidates) {
    if (currentTokens <= targetTokens) {
      break;
    }

    // Skip if already marked for removal
    if (indicesToRemove.has(candidate.index)) {
      continue;
    }

    // Check if this is part of a tool pair
    if (preserveToolPairs) {
      const linkedIndices = getLinkedIndices(toolPairAnalysis, candidate.index);

      if (linkedIndices.length > 0) {
        // This is part of a tool pair - must remove all linked messages together
        let pairTokens = 0;
        const pairIds: string[] = [];

        for (const idx of linkedIndices) {
          if (!indicesToRemove.has(idx)) {
            const msg = messages[idx];
            if (msg) {
              pairTokens += tokenizer(msg);
              if (msg.id) {
                pairIds.push(msg.id);
              }
            }
          }
        }

        // Only remove if removing the entire pair helps
        // and all parts can be removed (none are protected)
        const allRemovable = linkedIndices.every((idx) => {
          const msg = messages[idx];
          if (!msg) return false;
          const priority = calculatePriority(
            msg,
            idx,
            messages.length,
            recentCount,
            toolPairAnalysis
          );
          return priority < MessagePriority.ANCHOR;
        });

        if (allRemovable && pairTokens > 0) {
          for (const idx of linkedIndices) {
            indicesToRemove.add(idx);
          }
          removedIds.push(...pairIds);
          currentTokens -= pairTokens;
        }
        // If not all removable, skip this candidate and try the next
        continue;
      }
    }

    // Not part of a tool pair (or not preserving pairs) - remove individually
    indicesToRemove.add(candidate.index);
    const msgId = messages[candidate.index]?.id;
    if (msgId) {
      removedIds.push(msgId);
    }
    currentTokens -= candidate.tokens;
  }

  // Build result message array (preserving order)
  const resultMessages: ContextMessage[] = [];
  for (let i = 0; i < messages.length; i++) {
    if (!indicesToRemove.has(i)) {
      const msg = messages[i];
      if (msg) resultMessages.push(msg);
    }
  }

  return {
    messages: resultMessages,
    removedCount: indicesToRemove.size,
    tokenCount: currentTokens,
    removedIds,
  };
}

// ============================================================================
// Exports
// ============================================================================

export type { ToolPairAnalysis };
