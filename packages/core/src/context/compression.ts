/**
 * Non-Destructive Context Compression
 *
 * LLM-based compression that preserves original messages via condenseId/condenseParent
 * pointers, enabling traceability and rollback. Uses 6-section structured summaries.
 *
 * @module @vellum/core/context/compression
 *
 * @example
 * ```typescript
 * import { NonDestructiveCompressor, DEFAULT_SUMMARY_PROMPT } from './compression';
 *
 * const compressor = new NonDestructiveCompressor({
 *   llmClient: myLLMClient,
 *   targetRatio: 0.3,
 *   maxSummaryTokens: 500,
 * });
 *
 * const result = await compressor.compress(messages, { start: 2, end: 20 });
 * console.log(`Compressed ${result.originalTokens} → ${result.summaryTokens} (${result.ratio})`);
 * ```
 */

import { randomUUID } from "node:crypto";
import type { ContextMessage } from "./types.js";
import { MessagePriority as Priority } from "./types.js";

// ============================================================================
// Types
// ============================================================================

/**
 * LLM client interface for compression operations.
 *
 * The compressor depends on this interface rather than a concrete implementation,
 * allowing any LLM provider to be used for summarization.
 *
 * @example
 * ```typescript
 * const client: CompressionLLMClient = {
 *   summarize: async (messages, prompt) => {
 *     const response = await myLLM.complete({
 *       messages: [{ role: 'system', content: prompt }, ...messages],
 *     });
 *     return response.content;
 *   }
 * };
 * ```
 */
export interface CompressionLLMClient {
  /**
   * Generate a summary of the provided messages.
   *
   * @param messages - Messages to summarize
   * @param prompt - Summarization prompt template
   * @returns Summary text
   */
  summarize(messages: ContextMessage[], prompt: string): Promise<string>;
}

/**
 * Configuration options for the compressor.
 */
export interface CompressionOptions {
  /** LLM client for generating summaries */
  llmClient: CompressionLLMClient;

  /**
   * Target compression ratio (0-1).
   * E.g., 0.3 means summary should be ~30% of original token count.
   *
   * @default 0.3
   */
  targetRatio?: number;

  /**
   * Maximum tokens for summary output.
   *
   * @default 2000
   */
  maxSummaryTokens?: number;

  /**
   * Whether to preserve tool outputs in the summary.
   * When true, tool results are included more verbosely.
   *
   * @default false
   */
  preserveToolOutputs?: boolean;

  /**
   * Custom summarization prompt.
   * If not provided, DEFAULT_SUMMARY_PROMPT is used.
   */
  customPrompt?: string;

  /**
   * Minimum messages required for compression.
   * Compression is skipped if fewer messages are selected.
   *
   * @default 4
   */
  minMessagesToCompress?: number;
}

/**
 * Result of a compression operation.
 *
 * Contains the summary message, metadata about compressed messages,
 * and metrics for the compression.
 */
export interface CompressionResult {
  /** Summary message with condensed content */
  summary: ContextMessage;

  /** IDs of messages that were compressed */
  compressedMessageIds: string[];

  /** Original token count before compression */
  originalTokens: number;

  /** Summary token count after compression */
  summaryTokens: number;

  /** Compression ratio achieved (summaryTokens / originalTokens) */
  ratio: number;

  /** Unique ID for this compression operation */
  condenseId: string;
}

/**
 * Range specification for compression.
 */
export interface CompressionRange {
  /** Start index (inclusive) */
  start: number;
  /** End index (exclusive) */
  end: number;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default summarization prompt template.
 *
 * Generates a 6-section structured summary optimized for coding agent context:
 * 1. Task Overview - What the user wants to accomplish
 * 2. Key Decisions Made - Important choices and their rationale
 * 3. Code Changes - Files modified and key changes
 * 4. Current State - Where we are and what's working
 * 5. Pending Items - What still needs to be done
 * 6. Important Context - Critical information for future turns
 *
 * This format is derived from Kilocode's proven summarization approach.
 */
export const DEFAULT_SUMMARY_PROMPT = `Provide a structured summary with exactly 6 sections:

## 1. Task Overview
Brief description of what the user is trying to accomplish.

## 2. Key Decisions Made
Bullet list of important decisions and their rationale.

## 3. Code Changes
Summary of files modified and key changes made.

## 4. Current State
Where we are in the task and what's working.

## 5. Pending Items
What still needs to be done.

## 6. Important Context
Any critical information needed for future turns.

Keep the summary concise but preserve all important technical details.
Use bullet points for lists. Prioritize actionable information.`;

/**
 * Prefix added to summary messages for visual identification.
 */
const SUMMARY_PREFIX = "[📦 Context Summary]";

/**
 * Default configuration values.
 */
const DEFAULTS = {
  targetRatio: 0.3,
  maxSummaryTokens: 2000,
  preserveToolOutputs: false,
  minMessagesToCompress: 4,
} as const;

// ============================================================================
// NonDestructiveCompressor
// ============================================================================

/**
 * Non-destructive compressor for context management.
 *
 * Compresses message history into structured summaries while preserving
 * original messages via condenseId/condenseParent pointers. This enables:
 * - Full traceability from summary back to originals
 * - Potential rollback via checkpoint restoration
 * - API history filtering to exclude compressed originals
 *
 * Algorithm:
 * 1. Validate range and message count requirements
 * 2. Extract messages to compress (respecting range)
 * 3. Generate 6-section structured summary via LLM
 * 4. Create summary message with unique condenseId
 * 5. Calculate compression metrics
 *
 * @example
 * ```typescript
 * const compressor = new NonDestructiveCompressor({
 *   llmClient: anthropicClient,
 *   targetRatio: 0.3,
 * });
 *
 * // Compress messages 5-25, keeping recent 3 turns
 * const result = await compressor.compress(messages, { start: 5, end: 25 });
 *
 * // Link original messages to summary
 * const linkedMessages = messages.map(m =>
 *   result.compressedMessageIds.includes(m.id)
 *     ? { ...m, condenseParent: result.condenseId }
 *     : m
 * );
 * ```
 */
export class NonDestructiveCompressor {
  private readonly llmClient: CompressionLLMClient;
  private readonly targetRatio: number;
  private readonly maxSummaryTokens: number;
  private readonly preserveToolOutputs: boolean;
  private readonly customPrompt?: string;
  private readonly minMessagesToCompress: number;

  constructor(options: CompressionOptions) {
    this.llmClient = options.llmClient;
    this.targetRatio = options.targetRatio ?? DEFAULTS.targetRatio;
    this.maxSummaryTokens = options.maxSummaryTokens ?? DEFAULTS.maxSummaryTokens;
    this.preserveToolOutputs = options.preserveToolOutputs ?? DEFAULTS.preserveToolOutputs;
    this.customPrompt = options.customPrompt;
    this.minMessagesToCompress = options.minMessagesToCompress ?? DEFAULTS.minMessagesToCompress;
  }

  /**
   * Get the configured target compression ratio.
   */
  getTargetRatio(): number {
    return this.targetRatio;
  }

  /**
   * Get the configured maximum summary tokens.
   */
  getMaxSummaryTokens(): number {
    return this.maxSummaryTokens;
  }

  /**
   * Get whether tool outputs should be preserved in summaries.
   */
  getPreserveToolOutputs(): boolean {
    return this.preserveToolOutputs;
  }

  /**
   * Compress a range of messages into a structured summary.
   *
   * @param messages - Full message array
   * @param range - Start/end indices to compress. If not provided, compresses
   *                all messages except the last 3 turns (6 messages).
   * @returns Compression result with summary and metadata
   * @throws Error if fewer than minMessagesToCompress messages in range
   *
   * @example
   * ```typescript
   * // Compress specific range
   * const result = await compressor.compress(messages, { start: 0, end: 20 });
   *
   * // Auto-detect range (all except recent 3 turns)
   * const result = await compressor.compress(messages);
   * ```
   */
  async compress(messages: ContextMessage[], range?: CompressionRange): Promise<CompressionResult> {
    // Default range: all except last 6 messages (3 turns)
    const effectiveRange = range ?? this.calculateDefaultRange(messages);
    const toCompress = messages.slice(effectiveRange.start, effectiveRange.end);

    // Validate minimum messages
    if (toCompress.length < this.minMessagesToCompress) {
      throw new Error(
        `Compression requires at least ${this.minMessagesToCompress} messages, ` +
          `but only ${toCompress.length} were selected`
      );
    }

    // Calculate original token count
    const originalTokens = this.calculateTotalTokens(toCompress);

    // Generate summary via LLM
    const summaryText = await this.generateSummary(toCompress);

    // Create unique condense ID
    const condenseId = generateCondenseId();

    // Collect compressed message IDs
    const compressedMessageIds = toCompress.map((m) => m.id);

    // Create summary message
    const summary = this.createSummaryMessage(summaryText, toCompress, condenseId);

    // Calculate metrics
    const summaryTokens = summary.tokens ?? this.estimateTokens(summaryText);
    const ratio = this.calculateRatio(originalTokens, summaryTokens);

    return {
      summary,
      compressedMessageIds,
      originalTokens,
      summaryTokens,
      ratio,
      condenseId,
    };
  }

  /**
   * Generate summary text via LLM.
   *
   * @param messages - Messages to summarize
   * @returns Generated summary text
   */
  private async generateSummary(messages: ContextMessage[]): Promise<string> {
    const prompt = this.customPrompt ?? DEFAULT_SUMMARY_PROMPT;
    return this.llmClient.summarize(messages, prompt);
  }

  /**
   * Create a summary ContextMessage with proper metadata.
   *
   * @param summaryText - Generated summary content
   * @param originalMessages - Messages that were compressed
   * @param condenseId - Unique ID for this compression
   * @returns Summary message
   */
  private createSummaryMessage(
    summaryText: string,
    originalMessages: ContextMessage[],
    condenseId: string
  ): ContextMessage {
    const formattedContent = `${SUMMARY_PREFIX}\n\n${summaryText}`;
    const estimatedTokens = this.estimateTokens(formattedContent);

    return {
      id: condenseId,
      role: "assistant",
      content: formattedContent,
      priority: Priority.ANCHOR, // High priority - summaries are important context
      tokens: estimatedTokens,
      isSummary: true,
      condenseId,
      createdAt: Date.now(),
      metadata: {
        compressedCount: originalMessages.length,
        compressedRange: {
          firstId: originalMessages[0]?.id,
          lastId: originalMessages[originalMessages.length - 1]?.id,
        },
      },
    };
  }

  /**
   * Calculate compression ratio.
   *
   * @param originalTokens - Token count before compression
   * @param summaryTokens - Token count after compression
   * @returns Ratio as decimal (0-1)
   */
  private calculateRatio(originalTokens: number, summaryTokens: number): number {
    if (originalTokens === 0) return 0;
    return summaryTokens / originalTokens;
  }

  /**
   * Calculate default compression range.
   * Preserves last 3 turns (6 messages) as "recent".
   */
  private calculateDefaultRange(messages: ContextMessage[]): CompressionRange {
    const recentTurns = 3;
    const recentMessages = recentTurns * 2; // user + assistant per turn
    const end = Math.max(0, messages.length - recentMessages);
    return { start: 0, end };
  }

  /**
   * Calculate total tokens for a message array.
   */
  private calculateTotalTokens(messages: ContextMessage[]): number {
    return messages.reduce((sum, m) => sum + (m.tokens ?? 0), 0);
  }

  /**
   * Estimate tokens for text (fallback when not provided).
   * Uses simple heuristic: ~4 chars per token.
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a unique condense ID for compression operations.
 *
 * Format: `condense-{uuid}`
 *
 * @returns Unique condense ID string
 *
 * @example
 * ```typescript
 * const id = generateCondenseId();
 * // => "condense-550e8400-e29b-41d4-a716-446655440000"
 * ```
 */
export function generateCondenseId(): string {
  return `condense-${randomUUID()}`;
}

/**
 * Check if a message is a summary message.
 *
 * A message is considered a summary if:
 * - It has `isSummary: true`, OR
 * - It has a `condenseId` set
 *
 * @param message - Message to check
 * @returns True if message is a summary
 *
 * @example
 * ```typescript
 * if (isSummaryMessage(msg)) {
 *   console.log('This is a summary of', msg.condenseId);
 * }
 * ```
 */
export function isSummaryMessage(message: ContextMessage): boolean {
  return message.isSummary === true || message.condenseId !== undefined;
}

/**
 * Get messages that were compressed into a specific summary.
 *
 * Finds all messages whose `condenseParent` points to the given condenseId.
 *
 * @param messages - Full message array to search
 * @param condenseId - The condense ID to match
 * @returns Array of messages that were compressed into this summary
 *
 * @example
 * ```typescript
 * const compressed = getCompressedMessages(allMessages, result.condenseId);
 * console.log(`Summary contains ${compressed.length} original messages`);
 * ```
 */
export function getCompressedMessages(
  messages: ContextMessage[],
  condenseId: string
): ContextMessage[] {
  return messages.filter((m) => m.condenseParent === condenseId);
}

/**
 * Estimate tokens for compression planning.
 *
 * Given a set of messages and target ratio, estimates how many tokens
 * will be needed for input (original messages) and output (summary).
 *
 * @param messages - Messages to potentially compress
 * @param targetRatio - Target compression ratio (0-1)
 * @returns Estimated input and output token counts
 *
 * @example
 * ```typescript
 * const estimate = estimateCompressionTokens(messages, 0.3);
 * console.log(`Will use ~${estimate.input} input tokens`);
 * console.log(`Will produce ~${estimate.output} output tokens`);
 * ```
 */
export function estimateCompressionTokens(
  messages: ContextMessage[],
  targetRatio: number
): { input: number; output: number } {
  const input = messages.reduce((sum, m) => sum + (m.tokens ?? 0), 0);
  const output = Math.ceil(input * targetRatio);
  return { input, output };
}

/**
 * Filter messages to get effective API history.
 *
 * Excludes messages that have been compressed (have condenseParent pointing
 * to an existing summary) while keeping the summaries themselves.
 *
 * @param messages - Full message array
 * @returns Messages suitable for API calls (summaries + non-compressed)
 *
 * @example
 * ```typescript
 * const apiMessages = getEffectiveApiHistory(allMessages);
 * await llm.complete({ messages: apiMessages });
 * ```
 */
export function getEffectiveApiHistory(messages: ContextMessage[]): ContextMessage[] {
  // First, collect all condenseIds from summaries
  const summaryIds = new Set<string>();
  for (const msg of messages) {
    if (msg.isSummary && msg.condenseId) {
      summaryIds.add(msg.condenseId);
    }
  }

  // Filter out messages whose condenseParent points to an existing summary
  return messages.filter((msg) => {
    // Keep summaries
    if (msg.isSummary) return true;

    // Exclude if compressed into an existing summary
    if (msg.condenseParent && summaryIds.has(msg.condenseParent)) {
      return false;
    }

    return true;
  });
}

/**
 * Link original messages to their summary via condenseParent.
 *
 * Returns a new array with original messages updated to point to the summary.
 * Does not mutate the input array.
 *
 * @param messages - Full message array
 * @param result - Compression result containing the condenseId
 * @returns New array with linked messages
 *
 * @example
 * ```typescript
 * const result = await compressor.compress(messages);
 * const linked = linkCompressedMessages(messages, result);
 * // Now filtered via getEffectiveApiHistory will exclude originals
 * ```
 */
export function linkCompressedMessages(
  messages: ContextMessage[],
  result: CompressionResult
): ContextMessage[] {
  const compressedIds = new Set(result.compressedMessageIds);

  return messages.map((msg) => {
    if (compressedIds.has(msg.id)) {
      return {
        ...msg,
        condenseParent: result.condenseId,
      };
    }
    return msg;
  });
}

/**
 * Calculate compression savings.
 *
 * @param result - Compression result
 * @returns Object with token savings and percentage
 *
 * @example
 * ```typescript
 * const savings = calculateCompressionSavings(result);
 * console.log(`Saved ${savings.tokens} tokens (${savings.percentage}%)`);
 * ```
 */
export function calculateCompressionSavings(result: CompressionResult): {
  tokens: number;
  percentage: number;
} {
  const tokens = result.originalTokens - result.summaryTokens;
  const percentage =
    result.originalTokens > 0
      ? Math.round(((result.originalTokens - result.summaryTokens) / result.originalTokens) * 100)
      : 0;
  return { tokens, percentage };
}
