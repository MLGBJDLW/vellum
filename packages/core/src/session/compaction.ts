// ============================================
// Session Compaction Service
// ============================================

/**
 * Session compaction service for pruning and truncating session data.
 *
 * Provides methods to reduce session size by:
 * - Pruning large tool outputs
 * - Truncating middle messages while preserving context
 *
 * All operations are immutable - original session is not modified.
 *
 * @module @vellum/core/session/compaction
 */

import { estimateTokenCount as providerEstimateTokenCount } from "@vellum/provider";

import type { SessionMessage, SessionMessagePart, SessionToolResultPart } from "./message.js";
import { createSystemMessage } from "./message.js";
import type { Session, SessionCheckpoint } from "./types.js";

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Configuration options for the CompactionService.
 */
export interface CompactionConfig {
  /** Maximum length for tool outputs before truncation (default: 1000) */
  maxToolOutputLength: number;
  /** Number of messages to keep at the start of session (default: 5) */
  keepFirstMessages: number;
  /** Number of messages to keep at the end of session (default: 10) */
  keepLastMessages: number;
  /** Marker text for pruned tool outputs */
  prunedMarker: string;
  /** Marker text for truncated middle section. Use {count} placeholder for message count */
  truncatedMarker: string;
}

/**
 * Strategy for auto-compaction behavior.
 *
 * - `prune`: Only prune large tool outputs
 * - `truncate`: Only truncate middle messages
 * - `both`: Prune first, then truncate if still over threshold
 */
export type CompactionStrategy = "prune" | "truncate" | "both";

/**
 * Extended configuration for auto-compaction functionality.
 */
export interface AutoCompactionConfig extends CompactionConfig {
  /** Token count threshold to trigger compaction (default: 100000) */
  tokenThreshold: number;
  /** Token count threshold to emit warning (default: 80000) */
  warningThreshold: number;
  /** Strategy for automatic compaction (default: 'both') */
  compactionStrategy: CompactionStrategy;
}

/**
 * Result of shouldCompact check.
 */
export type ShouldCompactResult = boolean | "warning";

/**
 * Callbacks for auto-compaction events.
 */
export interface CompactionCallbacks {
  /** Called when session token count reaches warning threshold */
  onWarning?: (session: Session, tokenCount: number) => void;
  /** Called after auto-compaction completes */
  onCompacted?: (session: Session, result: CompactionResult) => void;
}

/**
 * LLM call function type for generating summaries.
 */
export type LLMSummaryCall = (messages: SessionMessage[], prompt: string) => Promise<string>;

/**
 * Default configuration values for CompactionConfig.
 *
 * @remarks
 * maxToolOutputLength increased to 3000 (from 1000) to preserve more
 * context from tool outputs while still preventing excessive sizes.
 * This balances information retention with context window efficiency.
 */
export const DEFAULT_COMPACTION_CONFIG: CompactionConfig = {
  maxToolOutputLength: 3000,
  keepFirstMessages: 5,
  keepLastMessages: 10,
  prunedMarker: "[工具输出已裁剪]",
  truncatedMarker: "[中间消息已省略: {count} 条]",
};

/**
 * Default configuration values for AutoCompactionConfig.
 */
export const DEFAULT_AUTO_COMPACTION_CONFIG: AutoCompactionConfig = {
  ...DEFAULT_COMPACTION_CONFIG,
  tokenThreshold: 100000,
  warningThreshold: 80000,
  compactionStrategy: "both",
};

/**
 * Statistics about potential compaction savings.
 */
export interface SessionCompactionStats {
  /** Total bytes of tool output content */
  toolOutputBytes: number;
  /** Potential bytes saved if pruned */
  potentialSavings: number;
  /** Number of messages that would be removed in middle truncation */
  messagesInMiddle: number;
}

/**
 * Result of a compaction operation.
 */
export interface CompactionResult {
  /** Original token count before compaction */
  originalTokenCount: number;
  /** New token count after compaction */
  newTokenCount: number;
  /** Number of tool outputs that were pruned */
  prunedOutputs: number;
  /** Number of messages that were truncated/removed */
  truncatedMessages: number;
}

// =============================================================================
// CompactionService Class
// =============================================================================

/**
 * Service for compacting session data to reduce size.
 *
 * Supports two main operations:
 * - `pruneToolOutputs`: Truncates large tool result content
 * - `truncateMiddle`: Removes middle messages, keeping start and end
 *
 * Also provides auto-compaction functionality:
 * - `shouldCompact`: Check if compaction is needed or warning should be emitted
 * - `autoCompact`: Automatically compact based on configured strategy
 * - `generateCheckpointSummary`: Generate summary for checkpoint messages
 *
 * @example
 * ```typescript
 * const compactionService = new CompactionService({
 *   tokenThreshold: 100000,
 *   warningThreshold: 80000,
 *   onWarning: (session, tokenCount) => console.warn(`High token count: ${tokenCount}`)
 * });
 *
 * // Check potential savings
 * const stats = compactionService.getCompactionStats(session);
 *
 * // Check if compaction is needed
 * const shouldCompact = compactionService.shouldCompact(session);
 * if (shouldCompact === true) {
 *   const result = compactionService.autoCompact(session);
 * }
 * ```
 */
export class CompactionService {
  private readonly config: AutoCompactionConfig;
  private readonly callbacks: CompactionCallbacks;

  /**
   * Creates a new CompactionService instance.
   *
   * @param config - Partial configuration options (merged with defaults)
   * @param callbacks - Optional callbacks for compaction events
   */
  constructor(config?: Partial<AutoCompactionConfig>, callbacks?: CompactionCallbacks) {
    this.config = { ...DEFAULT_AUTO_COMPACTION_CONFIG, ...config };
    this.callbacks = callbacks ?? {};
  }

  /**
   * Prunes large tool outputs in a session.
   *
   * Tool result content exceeding maxToolOutputLength is truncated to:
   * first 200 chars + prunedMarker + last 200 chars
   *
   * @param session - The session to prune
   * @returns A new session with pruned tool outputs
   */
  pruneToolOutputs(session: Session): { session: Session; result: CompactionResult } {
    const originalTokenCount = session.metadata.tokenCount ?? 0;
    let prunedOutputs = 0;

    const newMessages = session.messages.map((message) => {
      const newParts = message.parts.map((part) => {
        if (part.type === "tool_result") {
          const toolResultPart = part as SessionToolResultPart;
          const content = this.getToolResultContent(toolResultPart);

          if (content.length > this.config.maxToolOutputLength) {
            prunedOutputs++;
            const truncatedContent = this.truncateToolContent(content);
            return {
              ...toolResultPart,
              content: truncatedContent,
            } as SessionMessagePart;
          }
        }
        return part;
      });

      return {
        ...message,
        parts: newParts,
      } as SessionMessage;
    });

    // Estimate new token count (rough approximation: 4 chars = 1 token)
    const newTokenCount = this.estimateTokenCount(newMessages);

    const newSession: Session = {
      metadata: {
        ...session.metadata,
        tokenCount: newTokenCount,
        updatedAt: new Date(),
      },
      messages: newMessages,
      checkpoints: [...session.checkpoints],
    };

    return {
      session: newSession,
      result: {
        originalTokenCount,
        newTokenCount,
        prunedOutputs,
        truncatedMessages: 0,
      },
    };
  }

  /**
   * Truncates middle messages, keeping first N and last M messages.
   *
   * Middle section is replaced with a single system message containing
   * the truncatedMarker with the count of removed messages.
   *
   * @param session - The session to truncate
   * @returns A new session with middle messages truncated
   */
  truncateMiddle(session: Session): { session: Session; result: CompactionResult } {
    const originalTokenCount = session.metadata.tokenCount ?? 0;
    const { keepFirstMessages, keepLastMessages } = this.config;
    const totalMessages = session.messages.length;

    // If we don't need to truncate, return a copy
    if (totalMessages <= keepFirstMessages + keepLastMessages) {
      return {
        session: this.cloneSession(session),
        result: {
          originalTokenCount,
          newTokenCount: originalTokenCount,
          prunedOutputs: 0,
          truncatedMessages: 0,
        },
      };
    }

    const firstMessages = session.messages.slice(0, keepFirstMessages);
    const lastMessages = session.messages.slice(-keepLastMessages);
    const truncatedCount = totalMessages - keepFirstMessages - keepLastMessages;

    // Create marker message
    const markerText = this.config.truncatedMarker.replace("{count}", String(truncatedCount));
    const markerMessage = createSystemMessage(markerText);

    const newMessages: SessionMessage[] = [...firstMessages, markerMessage, ...lastMessages];

    // Estimate new token count
    const newTokenCount = this.estimateTokenCount(newMessages);

    const newSession: Session = {
      metadata: {
        ...session.metadata,
        tokenCount: newTokenCount,
        messageCount: newMessages.length,
        updatedAt: new Date(),
      },
      messages: newMessages,
      checkpoints: [...session.checkpoints],
    };

    return {
      session: newSession,
      result: {
        originalTokenCount,
        newTokenCount,
        prunedOutputs: 0,
        truncatedMessages: truncatedCount,
      },
    };
  }

  /**
   * Gets statistics about potential compaction savings for a session.
   *
   * @param session - The session to analyze
   * @returns Statistics about potential savings
   */
  getCompactionStats(session: Session): SessionCompactionStats {
    let toolOutputBytes = 0;
    let potentialSavings = 0;

    for (const message of session.messages) {
      for (const part of message.parts) {
        if (part.type === "tool_result") {
          const toolResultPart = part as SessionToolResultPart;
          const content = this.getToolResultContent(toolResultPart);
          const contentLength = content.length;

          toolOutputBytes += contentLength;

          if (contentLength > this.config.maxToolOutputLength) {
            // Calculate savings: original - (200 + marker + 200)
            const truncatedLength = 400 + this.config.prunedMarker.length;
            potentialSavings += contentLength - truncatedLength;
          }
        }
      }
    }

    // Calculate messages in middle
    const { keepFirstMessages, keepLastMessages } = this.config;
    const totalMessages = session.messages.length;
    const messagesInMiddle = Math.max(0, totalMessages - keepFirstMessages - keepLastMessages);

    return {
      toolOutputBytes,
      potentialSavings,
      messagesInMiddle,
    };
  }

  // ===========================================================================
  // Auto-Compaction Methods
  // ===========================================================================

  /**
   * Checks if a session should be compacted based on token count thresholds.
   *
   * @param session - The session to check
   * @returns `true` if compaction is needed, `'warning'` if approaching threshold, `false` otherwise
   *
   * @example
   * ```typescript
   * const result = compactionService.shouldCompact(session);
   * if (result === true) {
   *   // Compaction needed
   * } else if (result === 'warning') {
   *   // Approaching threshold
   * }
   * ```
   */
  shouldCompact(session: Session): ShouldCompactResult {
    const tokenCount = session.metadata.tokenCount ?? 0;

    if (tokenCount >= this.config.tokenThreshold) {
      return true;
    }

    if (tokenCount >= this.config.warningThreshold) {
      return "warning";
    }

    return false;
  }

  /**
   * Automatically compacts a session based on the configured strategy.
   *
   * Applies compaction strategy:
   * - `'prune'`: Only prunes tool outputs
   * - `'truncate'`: Only truncates middle messages
   * - `'both'`: Prunes first, then truncates if still over threshold
   *
   * Emits onWarning callback if approaching threshold.
   * Emits onCompacted callback after successful compaction.
   *
   * @param session - The session to compact
   * @returns Object containing the compacted session and result, or null if no compaction needed
   *
   * @example
   * ```typescript
   * const compacted = compactionService.autoCompact(session);
   * if (compacted) {
   *   console.log(`Reduced from ${compacted.result.originalTokenCount} to ${compacted.result.newTokenCount}`);
   * }
   * ```
   */
  autoCompact(session: Session): { session: Session; result: CompactionResult } | null {
    const shouldCompactResult = this.shouldCompact(session);

    // Emit warning if approaching threshold
    if (shouldCompactResult === "warning") {
      this.callbacks.onWarning?.(session, session.metadata.tokenCount ?? 0);
      return null;
    }

    // No compaction needed
    if (shouldCompactResult === false) {
      return null;
    }

    // Compaction needed - apply strategy
    let currentSession = session;
    const combinedResult: CompactionResult = {
      originalTokenCount: session.metadata.tokenCount ?? 0,
      newTokenCount: session.metadata.tokenCount ?? 0,
      prunedOutputs: 0,
      truncatedMessages: 0,
    };

    const strategy = this.config.compactionStrategy;

    // Apply prune strategy
    if (strategy === "prune" || strategy === "both") {
      const pruneResult = this.pruneToolOutputs(currentSession);
      currentSession = pruneResult.session;
      combinedResult.prunedOutputs = pruneResult.result.prunedOutputs;
      combinedResult.newTokenCount = pruneResult.result.newTokenCount;
    }

    // Apply truncate strategy (only if 'truncate' or 'both' and still over threshold)
    if (
      strategy === "truncate" ||
      (strategy === "both" &&
        (currentSession.metadata.tokenCount ?? 0) >= this.config.tokenThreshold)
    ) {
      const truncateResult = this.truncateMiddle(currentSession);
      currentSession = truncateResult.session;
      combinedResult.truncatedMessages = truncateResult.result.truncatedMessages;
      combinedResult.newTokenCount = truncateResult.result.newTokenCount;
    }

    // Emit onCompacted callback
    this.callbacks.onCompacted?.(currentSession, combinedResult);

    return {
      session: currentSession,
      result: combinedResult,
    };
  }

  /**
   * Generates a summary of messages up to a specific checkpoint.
   *
   * If an LLM call function is provided, uses it for intelligent summarization.
   * Otherwise, falls back to rule-based summary generation.
   *
   * @param session - The session containing messages to summarize
   * @param checkpointId - The checkpoint ID to summarize up to
   * @param llmCall - Optional LLM function for generating intelligent summaries
   * @returns Promise resolving to the generated summary string
   *
   * @example
   * ```typescript
   * // Rule-based summary
   * const summary = await compactionService.generateCheckpointSummary(session, 'checkpoint-1');
   *
   * // LLM-based summary
   * const summary = await compactionService.generateCheckpointSummary(session, 'checkpoint-1', async (msgs, prompt) => {
   *   return await llm.complete(prompt);
   * });
   * ```
   */
  async generateCheckpointSummary(
    session: Session,
    checkpointId: string,
    llmCall?: LLMSummaryCall
  ): Promise<string> {
    // Find the checkpoint
    const checkpoint = session.checkpoints.find((cp) => cp.id === checkpointId);
    if (!checkpoint) {
      return `Checkpoint ${checkpointId} not found`;
    }

    // Get messages up to checkpoint
    const messagesUpToCheckpoint = session.messages.slice(0, checkpoint.messageIndex + 1);

    if (messagesUpToCheckpoint.length === 0) {
      return "No messages to summarize";
    }

    // If LLM call provided, use it
    if (llmCall) {
      const prompt = this.buildSummaryPrompt(messagesUpToCheckpoint, checkpoint);
      return await llmCall(messagesUpToCheckpoint, prompt);
    }

    // Fall back to rule-based summary
    return this.generateRuleBasedSummary(messagesUpToCheckpoint, checkpoint);
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Builds a prompt for LLM-based summary generation.
   */
  private buildSummaryPrompt(messages: SessionMessage[], checkpoint: SessionCheckpoint): string {
    const messageCount = messages.length;
    const description = checkpoint.description ?? "checkpoint";

    return `Please provide a concise summary of the following conversation up to the ${description}. The conversation contains ${messageCount} messages. Focus on:
1. Main topics discussed
2. Key decisions made
3. Important code changes or files modified
4. Any pending items or next steps

Keep the summary under 200 words.`;
  }

  /**
   * Generates a rule-based summary without LLM.
   */
  private generateRuleBasedSummary(
    messages: SessionMessage[],
    checkpoint: SessionCheckpoint
  ): string {
    const stats = {
      userMessages: 0,
      assistantMessages: 0,
      toolCalls: 0,
      filesModified: new Set<string>(),
    };

    for (const message of messages) {
      if (message.role === "user") stats.userMessages++;
      if (message.role === "assistant") stats.assistantMessages++;

      for (const part of message.parts) {
        if (part.type === "tool") {
          stats.toolCalls++;
          // Try to extract file paths from tool inputs
          const toolPart = part as { name: string; input: unknown };
          if (toolPart.input && typeof toolPart.input === "object") {
            const input = toolPart.input as Record<string, unknown>;
            if (typeof input.path === "string") {
              stats.filesModified.add(input.path);
            }
            if (typeof input.filePath === "string") {
              stats.filesModified.add(input.filePath);
            }
          }
        }
      }
    }

    const parts: string[] = [];

    parts.push(`Checkpoint: ${checkpoint.description ?? checkpoint.id}`);
    parts.push(
      `Messages: ${messages.length} total (${stats.userMessages} user, ${stats.assistantMessages} assistant)`
    );

    if (stats.toolCalls > 0) {
      parts.push(`Tool calls: ${stats.toolCalls}`);
    }

    if (stats.filesModified.size > 0) {
      const files = Array.from(stats.filesModified).slice(0, 5);
      parts.push(
        `Files involved: ${files.join(", ")}${stats.filesModified.size > 5 ? ` (+${stats.filesModified.size - 5} more)` : ""}`
      );
    }

    if (checkpoint.snapshotHash) {
      parts.push(`Git snapshot: ${checkpoint.snapshotHash.slice(0, 8)}`);
    }

    return parts.join("\n");
  }

  /**
   * Extracts string content from a tool result part.
   */
  private getToolResultContent(part: SessionToolResultPart): string {
    if (typeof part.content === "string") {
      return part.content;
    }
    // For non-string content, serialize to JSON
    return JSON.stringify(part.content);
  }

  /**
   * Truncates tool content with first/last 200 chars and marker.
   */
  private truncateToolContent(content: string): string {
    const first = content.slice(0, 200);
    const last = content.slice(-200);
    return `${first}\n${this.config.prunedMarker}\n${last}`;
  }

  /**
   * Estimates token count for messages using provider's intelligent estimation.
   * Supports code detection and CJK language handling for more accurate counts.
   */
  private estimateTokenCount(messages: SessionMessage[]): number {
    let totalTokens = 0;

    for (const message of messages) {
      for (const part of message.parts) {
        if (part.type === "text") {
          totalTokens += providerEstimateTokenCount((part as { text: string }).text);
        } else if (part.type === "tool_result") {
          const content = this.getToolResultContent(part as SessionToolResultPart);
          totalTokens += providerEstimateTokenCount(content);
        } else if (part.type === "reasoning") {
          const text = (part as { text: string }).text ?? "";
          totalTokens += providerEstimateTokenCount(text);
        } else if (part.type === "tool") {
          // Tool calls include name and stringified input
          const toolPart = part as { name: string; input: unknown };
          totalTokens += providerEstimateTokenCount(toolPart.name);
          totalTokens += providerEstimateTokenCount(JSON.stringify(toolPart.input));
        }
      }
    }

    return totalTokens;
  }

  /**
   * Creates a shallow clone of a session (immutable operation).
   */
  private cloneSession(session: Session): Session {
    return {
      metadata: { ...session.metadata },
      messages: session.messages.map((msg) => ({
        ...msg,
        parts: [...msg.parts],
      })),
      checkpoints: [...session.checkpoints],
    };
  }
}
