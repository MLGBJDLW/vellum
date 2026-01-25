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
import type { ContextGrowthValidator, GrowthValidationResult } from "./context-growth-check.js";
import type { FallbackChain, SummaryFallbackResult } from "./fallback-chain.js";
import {
  type CompactionMessageInfo,
  CompactionStatsTracker,
} from "./improvements/compaction-stats-tracker.js";
import { SummaryProtectionFilter } from "./improvements/summary-protection-filter.js";
import { SummaryQualityValidator } from "./improvements/summary-quality-validator.js";
import type {
  CompactionStatsConfig,
  SummaryProtectionConfig,
  SummaryQualityConfig,
  SummaryQualityReport,
} from "./improvements/types.js";
import type { ReasoningBlockHandler } from "./reasoning-block.js";
import { adjustRangeForToolPairs } from "./tool-pairing.js";
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

  /**
   * Growth validator for ensuring summaries are smaller than originals.
   * When provided, compression will validate that the summary doesn't
   * grow the context (REQ-005).
   *
   * @example
   * ```typescript
   * import { ContextGrowthValidator } from './context-growth-check';
   *
   * const compressor = new NonDestructiveCompressor({
   *   llmClient,
   *   growthValidator: new ContextGrowthValidator(),
   * });
   * ```
   */
  growthValidator?: ContextGrowthValidator;

  /**
   * Reasoning block handler for models that require explicit CoT.
   * When provided and targeting DeepSeek models, summaries will include
   * synthetic `<thinking>` blocks (REQ-004).
   *
   * @example
   * ```typescript
   * import { ReasoningBlockHandler } from './reasoning-block';
   *
   * const compressor = new NonDestructiveCompressor({
   *   llmClient,
   *   reasoningBlockHandler: new ReasoningBlockHandler(),
   * });
   * ```
   */
  reasoningBlockHandler?: ReasoningBlockHandler;

  /**
   * Target model name for compression operations.
   * Used to determine if reasoning blocks should be added.
   */
  targetModel?: string;

  /**
   * Fallback chain for multi-model summarization (REQ-009).
   * When provided, compression will use the fallback chain instead of
   * the direct llmClient, enabling automatic failover between models.
   *
   * @example
   * ```typescript
   * import { FallbackChain } from './fallback-chain';
   *
   * const compressor = new NonDestructiveCompressor({
   *   llmClient, // Used as fallback if chain not provided
   *   fallbackChain: new FallbackChain({
   *     models: [
   *       { model: 'gpt-4o', timeout: 30000 },
   *       { model: 'claude-3-haiku', timeout: 20000 },
   *     ],
   *     createClient: myClientFactory,
   *   }),
   * });
   * ```
   */
  fallbackChain?: FallbackChain;

  /**
   * Callback invoked when fallback chain is used.
   * Logs which model was actually used for summarization.
   */
  onFallbackUsed?: (result: SummaryFallbackResult) => void;

  /**
   * Summary quality validation configuration (P0-1).
   * When provided, validates summary quality after compression.
   *
   * @example
   * ```typescript
   * const compressor = new NonDestructiveCompressor({
   *   llmClient,
   *   summaryQualityConfig: {
   *     enableRuleValidation: true,
   *     enableLLMValidation: false,
   *     minTechTermRetention: 0.8,
   *     minCodeRefRetention: 0.9,
   *     maxCompressionRatio: 10,
   *   },
   * });
   * ```
   */
  summaryQualityConfig?: SummaryQualityConfig;

  /**
   * Summary protection configuration (P1-2).
   * When provided, protects existing summaries from cascade compression.
   *
   * @example
   * ```typescript
   * const compressor = new NonDestructiveCompressor({
   *   llmClient,
   *   summaryProtectionConfig: {
   *     enabled: true,
   *     strategy: 'recent',
   *     maxProtectedSummaries: 5,
   *   },
   * });
   * ```
   */
  summaryProtectionConfig?: SummaryProtectionConfig;

  /**
   * Compaction statistics tracking configuration (P2-2).
   * When provided, tracks compression statistics including cascade detection.
   *
   * @example
   * ```typescript
   * const compressor = new NonDestructiveCompressor({
   *   llmClient,
   *   compactionStatsConfig: {
   *     enabled: true,
   *     persist: true,
   *     maxHistoryEntries: 100,
   *   },
   * });
   * ```
   */
  compactionStatsConfig?: CompactionStatsConfig;
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

  /** Growth validation result (when validator is configured) */
  growthValidation?: GrowthValidationResult;

  /** Whether reasoning block was added to summary */
  reasoningBlockAdded?: boolean;

  /**
   * Fallback chain result when using multi-model summarization (REQ-009).
   * Populated when fallbackChain is configured and used.
   */
  fallbackResult?: SummaryFallbackResult;

  /**
   * Model that was actually used for summarization.
   * Populated when fallbackChain is used.
   */
  modelUsed?: string;

  /**
   * Quality validation report (P0-1).
   * Populated when summaryQualityConfig is provided.
   */
  qualityReport?: SummaryQualityReport;
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
  private readonly growthValidator?: ContextGrowthValidator;
  private readonly reasoningBlockHandler?: ReasoningBlockHandler;
  private readonly targetModel?: string;
  private readonly fallbackChain?: FallbackChain;
  private readonly onFallbackUsed?: (result: SummaryFallbackResult) => void;
  private readonly summaryQualityValidator?: SummaryQualityValidator;
  private readonly summaryProtectionFilter?: SummaryProtectionFilter;
  private readonly compactionStatsTracker?: CompactionStatsTracker;

  constructor(options: CompressionOptions) {
    this.llmClient = options.llmClient;
    this.targetRatio = options.targetRatio ?? DEFAULTS.targetRatio;
    this.maxSummaryTokens = options.maxSummaryTokens ?? DEFAULTS.maxSummaryTokens;
    this.preserveToolOutputs = options.preserveToolOutputs ?? DEFAULTS.preserveToolOutputs;
    this.customPrompt = options.customPrompt;
    this.minMessagesToCompress = options.minMessagesToCompress ?? DEFAULTS.minMessagesToCompress;
    this.growthValidator = options.growthValidator;
    this.reasoningBlockHandler = options.reasoningBlockHandler;
    this.targetModel = options.targetModel;
    this.fallbackChain = options.fallbackChain;
    this.onFallbackUsed = options.onFallbackUsed;

    // Initialize quality validator if config provided (P0-1)
    if (options.summaryQualityConfig) {
      this.summaryQualityValidator = new SummaryQualityValidator(options.summaryQualityConfig);
    }

    // Initialize summary protection filter if config provided (P1-2)
    if (options.summaryProtectionConfig) {
      this.summaryProtectionFilter = new SummaryProtectionFilter(options.summaryProtectionConfig);
    }

    // Initialize compaction stats tracker if config provided (P2-2)
    if (options.compactionStatsConfig) {
      this.compactionStatsTracker = new CompactionStatsTracker(options.compactionStatsConfig);
    }
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
   * The compression range is automatically adjusted to respect tool pair
   * boundaries (REQ-006). If the specified range would split a tool_use/tool_result
   * pair, the range is expanded to include the full pair.
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
    const rawRange = range ?? this.calculateDefaultRange(messages);

    // Adjust range to respect tool pair boundaries (REQ-006)
    // Ensures tool_use/tool_result pairs are not split during compression
    const effectiveRange = adjustRangeForToolPairs(messages, rawRange.start, rawRange.end);
    let toCompress = messages.slice(effectiveRange.start, effectiveRange.end);

    // Filter out protected summaries to prevent cascade compression (P1-2)
    // This prevents: M1-M50 → Summary1, Summary1 + M51 → Summary2 (detail loss)
    if (this.summaryProtectionFilter) {
      toCompress = this.summaryProtectionFilter.filterCandidates(toCompress, messages);
    }

    // Validate minimum messages
    if (toCompress.length < this.minMessagesToCompress) {
      throw new Error(
        `Compression requires at least ${this.minMessagesToCompress} messages, ` +
          `but only ${toCompress.length} were selected`
      );
    }

    // Calculate original token count
    const originalTokens = this.calculateTotalTokens(toCompress);

    // Generate summary via LLM (using fallback chain if configured)
    const summaryResult = await this.generateSummary(toCompress);

    // Create unique condense ID
    const condenseId = generateCondenseId();

    // Collect compressed message IDs
    const compressedMessageIds = toCompress.map((m) => m.id);

    // Create summary message
    let summary = this.createSummaryMessage(summaryResult.text, toCompress, condenseId);

    // Calculate metrics
    const summaryTokens = summary.tokens ?? this.estimateTokens(summaryResult.text);
    const ratio = this.calculateRatio(originalTokens, summaryTokens);

    // Validate growth if validator is configured (REQ-005)
    let growthValidation: GrowthValidationResult | undefined;
    if (this.growthValidator) {
      growthValidation = this.growthValidator.validate(originalTokens, summaryTokens);
    }

    // Add reasoning block for DeepSeek models if handler is configured (REQ-004)
    let reasoningBlockAdded = false;
    if (this.reasoningBlockHandler && this.targetModel) {
      const result = this.reasoningBlockHandler.processForModel(summary, this.targetModel);
      if (result.wasAdded) {
        summary = result.message;
        reasoningBlockAdded = true;
      }
    }

    // Validate summary quality if configured (P0-1)
    let qualityReport: SummaryQualityReport | undefined;
    if (this.summaryQualityValidator) {
      qualityReport = await this.summaryQualityValidator.validate(toCompress, summaryResult.text);
    }

    // Record compaction statistics if tracker is configured (P2-2)
    if (this.compactionStatsTracker) {
      // Detect cascade compaction
      const messageInfos: CompactionMessageInfo[] = toCompress.map((m) => ({
        id: m.id,
        isSummary: m.isSummary,
        condenseId: m.condenseId,
      }));
      const isCascade = this.compactionStatsTracker.isCascadeCompaction(messageInfos);

      // Record the compaction
      await this.compactionStatsTracker.record({
        timestamp: Date.now(),
        originalTokens,
        compressedTokens: summaryTokens,
        messageCount: toCompress.length,
        isCascade,
        qualityReport,
      });

      // Track compacted message IDs for future cascade detection
      this.compactionStatsTracker.trackCompactedMessages(compressedMessageIds, condenseId);
    }

    return {
      summary,
      compressedMessageIds,
      originalTokens,
      summaryTokens,
      ratio,
      condenseId,
      growthValidation,
      reasoningBlockAdded,
      fallbackResult: summaryResult.fallbackResult,
      modelUsed: summaryResult.modelUsed,
      qualityReport,
    };
  }

  /**
   * Internal result type for summary generation.
   */
  private generateSummaryResult(
    text: string,
    fallbackResult?: SummaryFallbackResult,
    modelUsed?: string
  ): { text: string; fallbackResult?: SummaryFallbackResult; modelUsed?: string } {
    return { text, fallbackResult, modelUsed };
  }

  /**
   * Generate summary text via LLM.
   *
   * Uses fallback chain if configured (REQ-009), otherwise falls back
   * to the direct llmClient.
   *
   * @param messages - Messages to summarize
   * @returns Summary result with text and optional fallback metadata
   */
  private async generateSummary(
    messages: ContextMessage[]
  ): Promise<{ text: string; fallbackResult?: SummaryFallbackResult; modelUsed?: string }> {
    const prompt = this.customPrompt ?? DEFAULT_SUMMARY_PROMPT;

    // Use fallback chain if configured (REQ-009)
    if (this.fallbackChain) {
      const fallbackResult = await this.fallbackChain.summarize(messages, prompt);

      // Invoke callback if configured
      if (this.onFallbackUsed) {
        this.onFallbackUsed(fallbackResult);
      }

      return this.generateSummaryResult(
        fallbackResult.summary,
        fallbackResult,
        fallbackResult.model
      );
    }

    // Fall back to direct LLM client
    const text = await this.llmClient.summarize(messages, prompt);
    return this.generateSummaryResult(text);
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

// ============================================================================
// Session Storage for Condensed Messages (REQ-003)
// ============================================================================

/**
 * Stored data for a compression operation.
 *
 * Contains the original messages and metadata needed for recovery.
 */
export interface CondensedMessageEntry {
  /** Unique identifier for this compression operation */
  readonly condenseId: string;
  /** Original messages that were compressed */
  readonly originalMessages: ContextMessage[];
  /** Compression result metadata */
  readonly compressionResult: CompressionResult;
  /** Timestamp when compression occurred */
  readonly compressedAt: number;
}

/**
 * Session-scoped storage for condensed message data.
 *
 * This class provides in-memory storage for compressed message data,
 * enabling recovery of original messages via condenseId lookup.
 *
 * @example
 * ```typescript
 * const store = new CondensedMessageStore();
 *
 * // Store compressed messages
 * store.store(condenseId, originalMessages, compressionResult);
 *
 * // Later, recover the originals
 * const recovered = store.recover(condenseId);
 * if (recovered) {
 *   console.log(`Recovered ${recovered.originalMessages.length} messages`);
 * }
 * ```
 */
export class CondensedMessageStore {
  private readonly entries = new Map<string, CondensedMessageEntry>();

  /**
   * Store original messages with their compression metadata.
   *
   * @param condenseId - Unique identifier for this compression
   * @param originalMessages - The original messages that were compressed
   * @param compressionResult - The compression result with summary and metrics
   */
  store(
    condenseId: string,
    originalMessages: ContextMessage[],
    compressionResult: CompressionResult
  ): void {
    this.entries.set(condenseId, {
      condenseId,
      originalMessages,
      compressionResult,
      compressedAt: Date.now(),
    });
  }

  /**
   * Retrieve stored entry by condenseId.
   *
   * @param condenseId - The condense ID to look up
   * @returns The stored entry, or undefined if not found
   */
  get(condenseId: string): CondensedMessageEntry | undefined {
    return this.entries.get(condenseId);
  }

  /**
   * Check if a condenseId exists in storage.
   *
   * @param condenseId - The condense ID to check
   * @returns True if the entry exists
   */
  has(condenseId: string): boolean {
    return this.entries.has(condenseId);
  }

  /**
   * Remove an entry from storage.
   *
   * @param condenseId - The condense ID to remove
   * @returns True if an entry was removed
   */
  delete(condenseId: string): boolean {
    return this.entries.delete(condenseId);
  }

  /**
   * Get all stored condenseIds.
   *
   * @returns Array of all stored condense IDs
   */
  keys(): string[] {
    return [...this.entries.keys()];
  }

  /**
   * Get the number of stored entries.
   */
  get size(): number {
    return this.entries.size;
  }

  /**
   * Clear all stored entries.
   */
  clear(): void {
    this.entries.clear();
  }
}

/**
 * Result of a message recovery operation.
 */
export interface RecoveryResult {
  /** Original messages that were restored */
  readonly restoredMessages: ContextMessage[];
  /** Messages after recovery (summary removed, originals restored) */
  readonly messages: ContextMessage[];
  /** The condenseId that was recovered */
  readonly condenseId: string;
  /** Whether recovery was successful */
  readonly success: boolean;
}

/**
 * Recover condensed messages by condenseId.
 *
 * Restores original messages from the store and removes the summary message
 * from the message array. Also clears condenseParent pointers from restored
 * messages.
 *
 * @param messages - Current message array (with summary)
 * @param condenseId - The condenseId to recover
 * @param store - The condensed message store
 * @returns Recovery result with restored messages, or null if not found
 *
 * @example
 * ```typescript
 * const store = new CondensedMessageStore();
 * // ... after compression, store.store(result.condenseId, originalMessages, result);
 *
 * // Later, to recover:
 * const recovery = recoverCondensed(currentMessages, condenseId, store);
 * if (recovery?.success) {
 *   messages = recovery.messages;
 *   console.log(`Recovered ${recovery.restoredMessages.length} messages`);
 * }
 * ```
 */
export function recoverCondensed(
  messages: ContextMessage[],
  condenseId: string,
  store: CondensedMessageStore
): RecoveryResult | null {
  // Look up the stored entry
  const entry = store.get(condenseId);
  if (!entry) {
    return null;
  }

  // Find the summary message index
  const summaryIndex = messages.findIndex((m) => m.isSummary && m.condenseId === condenseId);

  // Clear condenseParent from restored messages
  const restoredMessages = entry.originalMessages.map((m) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { condenseParent, ...rest } = m;
    return rest as ContextMessage;
  });

  // Build new message array:
  // 1. Remove the summary message
  // 2. Insert original messages at the summary's position
  // 3. Clear condenseParent from any messages that pointed to this condenseId
  let newMessages: ContextMessage[];

  if (summaryIndex >= 0) {
    // Insert restored messages where the summary was
    newMessages = [
      ...messages.slice(0, summaryIndex),
      ...restoredMessages,
      ...messages.slice(summaryIndex + 1),
    ];
  } else {
    // Summary not in array, just append restored messages
    newMessages = [...messages, ...restoredMessages];
  }

  // Clear condenseParent from any messages pointing to this condenseId
  newMessages = newMessages.map((m) => {
    if (m.condenseParent === condenseId) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { condenseParent, ...rest } = m;
      return rest as ContextMessage;
    }
    return m;
  });

  // Remove from store after successful recovery
  store.delete(condenseId);

  return {
    restoredMessages,
    messages: newMessages,
    condenseId,
    success: true,
  };
}
