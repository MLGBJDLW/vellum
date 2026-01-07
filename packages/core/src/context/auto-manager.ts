/**
 * AutoContextManager - Unified Context Orchestrator
 *
 * Orchestrates all context management components (prune, truncate, compress, checkpoint)
 * with a state machine approach: healthy → warning → critical → overflow.
 *
 * Requirements covered:
 * - REQ-INT-001: Unified management with configurable options
 * - REQ-INT-002: Automatic state transitions based on token usage
 * - REQ-INT-003: Recovery strategies for overflow situations
 * - REQ-CFG-001: useAutoCondense flag respected
 *
 * @module @vellum/core/context/auto-manager
 */

import { CheckpointManager } from "./checkpoint.js";
import type { CompressionLLMClient } from "./compression.js";
import { NonDestructiveCompressor } from "./compression.js";
import { estimateTokens, truncate } from "./sliding-window.js";
import { getThresholdConfig } from "./threshold.js";
import { calculateTokenBudget, getModelContextWindow } from "./token-budget.js";
import {
  DEFAULT_MAX_OUTPUT_CHARS,
  DEFAULT_PROTECTED_TOOLS,
  PRUNE_MINIMUM_TOKENS,
  pruneToolOutputs,
} from "./tool-trimming.js";
import type {
  ContextMessage,
  ContextState,
  ManageResult,
  ThresholdConfig,
  TokenBudget,
} from "./types.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for AutoContextManager.
 *
 * @example
 * ```typescript
 * const config: AutoContextManagerConfig = {
 *   model: 'claude-3-5-sonnet',
 *   llmClient: myLLMClient,
 *   useAutoCondense: true,
 *   thresholds: { warning: 0.8, critical: 0.9, overflow: 0.95 },
 * };
 * ```
 */
export interface AutoContextManagerConfig {
  /** Model identifier for threshold lookup and context window detection */
  model: string;

  /**
   * Context window size (or auto-detect from model).
   * If not provided, uses getModelContextWindow() lookup.
   */
  contextWindow?: number;

  /**
   * LLM client for compression (required if useAutoCondense is true).
   * Must implement the summarize() method.
   */
  llmClient?: CompressionLLMClient;

  /**
   * Enable automatic compression.
   * When false, compression is skipped even in critical state.
   * @default true
   */
  useAutoCondense?: boolean;

  /**
   * Custom thresholds (override model defaults).
   * Partial values are merged with model-specific defaults.
   */
  thresholds?: Partial<ThresholdConfig>;

  /**
   * Tokenizer function for counting tokens.
   * If not provided, uses rough estimation (chars / 4).
   */
  tokenizer?: (text: string) => number;

  /**
   * Maximum tool output characters before pruning.
   * @default 10000
   */
  maxToolOutputChars?: number;

  /**
   * Protected tools that are never pruned.
   * @default ['skill', 'memory_search', 'code_review']
   */
  protectedTools?: string[];

  /**
   * Maximum checkpoints to retain (LRU eviction).
   * @default 5
   */
  maxCheckpoints?: number;

  /**
   * Recent messages to protect from truncation.
   * @default 3
   */
  recentCount?: number;

  /**
   * System reserve tokens (for system prompts).
   * @default 4000
   */
  systemReserve?: number;

  /**
   * Compression target ratio (summary size / original size).
   * @default 0.3
   */
  compressionTargetRatio?: number;
}

/**
 * Recovery strategy for overflow situations.
 *
 * - `rollback`: Restore from a checkpoint
 * - `aggressive_truncate`: Force truncation to a lower target
 * - `emergency_clear`: Keep only the most recent N messages
 */
export type RecoveryStrategy =
  | { type: "rollback"; checkpointId: string }
  | { type: "aggressive_truncate"; targetPercent: number }
  | { type: "emergency_clear"; keepCount: number };

/**
 * Extended ManageResult with modified messages.
 */
export interface AutoManageResult extends ManageResult {
  /** Modified messages after management actions */
  messages: ContextMessage[];
}

// ============================================================================
// Constants
// ============================================================================

/** Default recent count for truncation protection */
const DEFAULT_RECENT_COUNT = 3;

/** Default max checkpoints */
const DEFAULT_MAX_CHECKPOINTS = 5;

/** Default system reserve */
const DEFAULT_SYSTEM_RESERVE = 4000;

/** Default compression target ratio */
const DEFAULT_COMPRESSION_RATIO = 0.3;

/** Aggressive truncate target (percentage of budget) */
const AGGRESSIVE_TRUNCATE_TARGET = 0.7;

/** Emergency clear keep count */
const EMERGENCY_KEEP_COUNT = 5;

// ============================================================================
// Resolved Configuration (with defaults applied)
// ============================================================================

/**
 * Fully resolved configuration with all defaults applied.
 */
interface ResolvedConfig {
  model: string;
  contextWindow: number;
  llmClient: CompressionLLMClient | null;
  useAutoCondense: boolean;
  tokenizer: (text: string) => number;
  maxToolOutputChars: number;
  protectedTools: readonly string[];
  maxCheckpoints: number;
  recentCount: number;
  systemReserve: number;
  compressionTargetRatio: number;
}

/**
 * Resolve configuration with defaults.
 */
function resolveConfig(config: AutoContextManagerConfig): ResolvedConfig {
  const contextWindow = config.contextWindow ?? getModelContextWindow(config.model);

  return {
    model: config.model,
    contextWindow,
    llmClient: config.llmClient ?? null,
    useAutoCondense: config.useAutoCondense ?? true,
    tokenizer: config.tokenizer ?? ((text: string) => Math.ceil(text.length / 4)),
    maxToolOutputChars: config.maxToolOutputChars ?? DEFAULT_MAX_OUTPUT_CHARS,
    protectedTools: config.protectedTools ?? DEFAULT_PROTECTED_TOOLS,
    maxCheckpoints: config.maxCheckpoints ?? DEFAULT_MAX_CHECKPOINTS,
    recentCount: config.recentCount ?? DEFAULT_RECENT_COUNT,
    systemReserve: config.systemReserve ?? DEFAULT_SYSTEM_RESERVE,
    compressionTargetRatio: config.compressionTargetRatio ?? DEFAULT_COMPRESSION_RATIO,
  };
}

// ============================================================================
// AutoContextManager
// ============================================================================

/**
 * Unified context manager that orchestrates all components.
 *
 * Workflow:
 * 1. Calculate current token usage
 * 2. Determine state (healthy/warning/critical/overflow)
 * 3. Execute appropriate actions:
 *    - healthy: no action
 *    - warning: prune tool outputs
 *    - critical: truncate + compress (if enabled)
 *    - overflow: emergency recovery
 *
 * @example
 * ```typescript
 * const manager = new AutoContextManager({
 *   model: 'claude-3-5-sonnet',
 *   llmClient: myLLMClient,
 * });
 *
 * const result = await manager.manage(messages);
 * if (result.state === 'critical') {
 *   console.log('Context compressed:', result.actions);
 * }
 * ```
 */
export class AutoContextManager {
  private readonly config: ResolvedConfig;
  private readonly checkpointManager: CheckpointManager;
  private readonly compressor: NonDestructiveCompressor | null;
  private readonly thresholds: ThresholdConfig;
  private readonly budget: TokenBudget;

  /**
   * Create a new AutoContextManager.
   *
   * @param config - Configuration options
   */
  constructor(config: AutoContextManagerConfig) {
    this.config = resolveConfig(config);

    // Initialize checkpoint manager
    this.checkpointManager = new CheckpointManager({
      maxCheckpoints: this.config.maxCheckpoints,
    });

    // Initialize compressor if LLM client provided and auto-condense enabled
    if (this.config.llmClient && this.config.useAutoCondense) {
      this.compressor = new NonDestructiveCompressor({
        llmClient: this.config.llmClient,
        targetRatio: this.config.compressionTargetRatio,
      });
    } else {
      this.compressor = null;
    }

    // Get model-specific thresholds with user overrides
    const baseThresholds = getThresholdConfig(this.config.model);
    this.thresholds = {
      warning: config.thresholds?.warning ?? baseThresholds.warning,
      critical: config.thresholds?.critical ?? baseThresholds.critical,
      overflow: config.thresholds?.overflow ?? baseThresholds.overflow,
    };

    // Calculate token budget
    this.budget = calculateTokenBudget({
      contextWindow: this.config.contextWindow,
      systemReserve: this.config.systemReserve,
    });
  }

  /**
   * Main entry point - manage context and return new state.
   *
   * Automatically determines the current state and executes appropriate
   * actions to bring context usage within acceptable limits.
   *
   * @param messages - Current message history
   * @returns Result with state, actions taken, and potentially modified messages
   */
  async manage(messages: ContextMessage[]): Promise<AutoManageResult> {
    const actions: string[] = [];
    let currentMessages = [...messages];
    let tokenCount = this.countTokens(currentMessages);
    let checkpoint: string | undefined;

    // Determine initial state
    let state = this.calculateState(tokenCount);

    // Handle based on state
    if (state === "healthy") {
      // No action needed
      return {
        state,
        tokenCount,
        budgetUsed: tokenCount / this.budget.historyBudget,
        actions: [],
        messages: currentMessages,
      };
    }

    // Warning state: prune tool outputs
    if (state === "warning" || state === "critical" || state === "overflow") {
      // Only prune if we have enough tokens to warrant it
      if (tokenCount >= PRUNE_MINIMUM_TOKENS) {
        const pruneResult = await this.executePrune(currentMessages);
        currentMessages = pruneResult.messages;
        actions.push(...pruneResult.actions);
        tokenCount = this.countTokens(currentMessages);
        state = this.calculateState(tokenCount);

        // If pruning brought us to healthy, we're done
        if (state === "healthy") {
          return {
            state,
            tokenCount,
            budgetUsed: tokenCount / this.budget.historyBudget,
            actions,
            messages: currentMessages,
          };
        }
      }
    }

    // Critical state: create checkpoint, truncate, then compress
    if (state === "critical" || state === "overflow") {
      // Create checkpoint before destructive operations
      const ckpt = this.checkpointManager.create(currentMessages, {
        reason: "pre-compression",
        tokenCount,
      });
      checkpoint = ckpt.id;
      actions.push(`checkpoint:${ckpt.id}`);

      // Truncate first
      const truncateResult = await this.executeTruncate(currentMessages);
      currentMessages = truncateResult.messages;
      actions.push(...truncateResult.actions);
      tokenCount = this.countTokens(currentMessages);
      state = this.calculateState(tokenCount);

      // If still critical and compression is enabled, compress
      if (
        (state === "critical" || state === "overflow") &&
        this.compressor &&
        this.config.useAutoCondense
      ) {
        const compressResult = await this.executeCompress(currentMessages);
        currentMessages = compressResult.messages;
        actions.push(...compressResult.actions);
        tokenCount = this.countTokens(currentMessages);
        state = this.calculateState(tokenCount);
      }
    }

    // Overflow state: emergency recovery
    if (state === "overflow") {
      const strategy = this.getRecoveryStrategy(currentMessages);
      const recoveryResult = await this.executeRecovery(currentMessages, strategy);
      currentMessages = recoveryResult.messages;
      actions.push(...recoveryResult.actions);
      tokenCount = this.countTokens(currentMessages);
      state = this.calculateState(tokenCount);
    }

    return {
      state,
      tokenCount,
      budgetUsed: tokenCount / this.budget.historyBudget,
      actions,
      checkpoint,
      messages: currentMessages,
    };
  }

  /**
   * Calculate current context state based on token usage.
   *
   * @param tokenCount - Current token count
   * @returns The context state
   */
  calculateState(tokenCount: number): ContextState {
    const usage = tokenCount / this.budget.historyBudget;

    if (usage >= this.thresholds.overflow) {
      return "overflow";
    }
    if (usage >= this.thresholds.critical) {
      return "critical";
    }
    if (usage >= this.thresholds.warning) {
      return "warning";
    }
    return "healthy";
  }

  /**
   * Get recovery strategy for overflow situations.
   *
   * Strategy selection:
   * 1. If recent checkpoint exists, suggest rollback
   * 2. Otherwise, suggest aggressive truncation
   * 3. If all else fails, emergency clear
   *
   * @param messages - Current messages (used for analysis)
   * @returns Recovery strategy to execute
   */
  getRecoveryStrategy(messages: ContextMessage[]): RecoveryStrategy {
    // Check for recent checkpoint
    const checkpoints = this.checkpointManager.list();

    if (checkpoints.length > 0) {
      const latestCheckpoint = checkpoints[0];
      if (!latestCheckpoint) {
        return { type: "aggressive_truncate", targetPercent: AGGRESSIVE_TRUNCATE_TARGET };
      }
      // Use rollback if checkpoint is reasonable (not too old)
      const checkpointAge = Date.now() - latestCheckpoint.createdAt;
      const maxCheckpointAge = 10 * 60 * 1000; // 10 minutes

      if (checkpointAge < maxCheckpointAge) {
        return {
          type: "rollback",
          checkpointId: latestCheckpoint.id,
        };
      }
    }

    // No suitable checkpoint - try aggressive truncation
    const tokenCount = this.countTokens(messages);
    const currentUsage = tokenCount / this.budget.historyBudget;

    if (currentUsage > 1.0) {
      // Way over budget - emergency clear
      return {
        type: "emergency_clear",
        keepCount: EMERGENCY_KEEP_COUNT,
      };
    }

    // Try aggressive truncation to 70% of budget
    return {
      type: "aggressive_truncate",
      targetPercent: AGGRESSIVE_TRUNCATE_TARGET,
    };
  }

  /**
   * Execute prune action (warning state).
   * Trims large tool outputs to reduce token usage.
   *
   * @param messages - Current messages
   * @returns Pruned messages, actions taken, and tokens saved
   */
  private async executePrune(messages: ContextMessage[]): Promise<{
    messages: ContextMessage[];
    actions: string[];
    tokensSaved: number;
  }> {
    const tokensBefore = this.countTokens(messages);

    const pruneResult = pruneToolOutputs(messages, {
      maxOutputChars: this.config.maxToolOutputChars,
      protectedTools: this.config.protectedTools,
    });

    const tokensAfter = this.countTokens(pruneResult.messages);
    const tokensSaved = tokensBefore - tokensAfter;

    const actions: string[] = [];
    if (pruneResult.trimmedCount > 0) {
      actions.push(`prune:${pruneResult.trimmedCount} tools trimmed`);
      actions.push(`prune:${tokensSaved} tokens saved`);
    }

    return {
      messages: pruneResult.messages,
      actions,
      tokensSaved,
    };
  }

  /**
   * Execute truncate action (critical state).
   * Removes low-priority messages to fit within budget.
   *
   * @param messages - Current messages
   * @returns Truncated messages, actions taken, and tokens saved
   */
  private async executeTruncate(messages: ContextMessage[]): Promise<{
    messages: ContextMessage[];
    actions: string[];
    tokensSaved: number;
  }> {
    const tokensBefore = this.countTokens(messages);

    // Target: critical threshold to get back to warning level
    const targetTokens = Math.floor(this.budget.historyBudget * this.thresholds.warning);

    const truncateResult = truncate(messages, {
      targetTokens,
      recentCount: this.config.recentCount,
      preserveToolPairs: true,
      tokenizer: this.messageTokenizer.bind(this),
    });

    const tokensSaved = tokensBefore - truncateResult.tokenCount;

    const actions: string[] = [];
    if (truncateResult.removedCount > 0) {
      actions.push(`truncate:${truncateResult.removedCount} messages removed`);
      actions.push(`truncate:${tokensSaved} tokens saved`);
    }

    return {
      messages: truncateResult.messages,
      actions,
      tokensSaved,
    };
  }

  /**
   * Execute compress action (critical state, after truncate).
   * Uses LLM to generate a summary of older messages.
   *
   * @param messages - Current messages
   * @returns Compressed messages, actions taken, and tokens saved
   */
  private async executeCompress(messages: ContextMessage[]): Promise<{
    messages: ContextMessage[];
    actions: string[];
    tokensSaved: number;
  }> {
    if (!this.compressor) {
      return { messages, actions: [], tokensSaved: 0 };
    }

    const tokensBefore = this.countTokens(messages);

    // Determine compression range: skip system messages and recent messages
    // Find first non-system message
    let startIndex = 0;
    for (let i = 0; i < messages.length; i++) {
      if (messages[i]?.role !== "system") {
        startIndex = i;
        break;
      }
    }

    // End index: leave recent messages uncompressed
    const endIndex = Math.max(startIndex + 1, messages.length - this.config.recentCount);

    // Need at least 4 messages to compress
    if (endIndex - startIndex < 4) {
      return { messages, actions: [], tokensSaved: 0 };
    }

    try {
      const compressionResult = await this.compressor.compress(messages, {
        start: startIndex,
        end: endIndex,
      });

      // Build new message array:
      // 1. System messages (before startIndex)
      // 2. Summary message
      // 3. Recent messages (from endIndex onwards)
      const newMessages: ContextMessage[] = [
        ...messages.slice(0, startIndex),
        compressionResult.summary,
        ...messages.slice(endIndex),
      ];

      const tokensAfter = this.countTokens(newMessages);
      const tokensSaved = tokensBefore - tokensAfter;

      return {
        messages: newMessages,
        actions: [
          `compress:${compressionResult.compressedMessageIds.length} messages → 1 summary`,
          `compress:${tokensSaved} tokens saved (ratio: ${compressionResult.ratio.toFixed(2)})`,
        ],
        tokensSaved,
      };
    } catch (error) {
      // Compression failed - return original messages
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      return {
        messages,
        actions: [`compress:failed - ${errorMsg}`],
        tokensSaved: 0,
      };
    }
  }

  /**
   * Execute emergency recovery (overflow state).
   *
   * @param messages - Current messages
   * @param strategy - Recovery strategy to execute
   * @returns Recovered messages and actions taken
   */
  private async executeRecovery(
    messages: ContextMessage[],
    strategy: RecoveryStrategy
  ): Promise<{ messages: ContextMessage[]; actions: string[] }> {
    switch (strategy.type) {
      case "rollback": {
        try {
          const result = this.checkpointManager.rollback(strategy.checkpointId, messages);
          return {
            messages: result.messages,
            actions: [
              `recovery:rollback to ${strategy.checkpointId}`,
              `recovery:discarded ${result.discardedMessages} messages`,
            ],
          };
        } catch {
          // Rollback failed, fall through to aggressive truncate
          return this.executeRecovery(messages, {
            type: "aggressive_truncate",
            targetPercent: AGGRESSIVE_TRUNCATE_TARGET,
          });
        }
      }

      case "aggressive_truncate": {
        const targetTokens = Math.floor(this.budget.historyBudget * strategy.targetPercent);

        const truncateResult = truncate(messages, {
          targetTokens,
          recentCount: this.config.recentCount,
          preserveToolPairs: false, // Aggressive: can break pairs
          tokenizer: this.messageTokenizer.bind(this),
        });

        return {
          messages: truncateResult.messages,
          actions: [
            `recovery:aggressive truncate to ${Math.round(strategy.targetPercent * 100)}%`,
            `recovery:removed ${truncateResult.removedCount} messages`,
          ],
        };
      }

      case "emergency_clear": {
        // Keep only system messages and most recent N messages
        const systemMessages = messages.filter((m) => m.role === "system");
        const nonSystemMessages = messages.filter((m) => m.role !== "system");
        const recentMessages = nonSystemMessages.slice(-strategy.keepCount);

        return {
          messages: [...systemMessages, ...recentMessages],
          actions: [
            `recovery:emergency clear`,
            `recovery:kept ${systemMessages.length} system + ${recentMessages.length} recent`,
          ],
        };
      }
    }
  }

  /**
   * Count tokens in messages.
   *
   * @param messages - Messages to count tokens for
   * @returns Total token count
   */
  countTokens(messages: ContextMessage[]): number {
    let total = 0;
    for (const message of messages) {
      total += this.messageTokenizer(message);
    }
    return total;
  }

  /**
   * Tokenizer for a single message.
   * Uses cached tokens if available, otherwise estimates.
   *
   * @param message - Message to count tokens for
   * @returns Token count for the message
   */
  private messageTokenizer(message: ContextMessage): number {
    // Use cached token count if available
    if (message.tokens !== undefined) {
      return message.tokens;
    }

    // Use provided tokenizer or estimation
    return estimateTokens(message);
  }

  /**
   * Get current configuration (readonly).
   *
   * @returns Copy of current configuration
   */
  getConfig(): Readonly<AutoContextManagerConfig> {
    return {
      model: this.config.model,
      contextWindow: this.config.contextWindow,
      llmClient: this.config.llmClient ?? undefined,
      useAutoCondense: this.config.useAutoCondense,
      maxToolOutputChars: this.config.maxToolOutputChars,
      protectedTools: [...this.config.protectedTools],
      maxCheckpoints: this.config.maxCheckpoints,
      recentCount: this.config.recentCount,
    };
  }

  /**
   * Get current thresholds (readonly).
   *
   * @returns Copy of current thresholds
   */
  getThresholds(): Readonly<ThresholdConfig> {
    return { ...this.thresholds };
  }

  /**
   * Get token budget (readonly).
   *
   * @returns Copy of current budget
   */
  getBudget(): Readonly<TokenBudget> {
    return { ...this.budget };
  }

  /**
   * Create checkpoint manually.
   *
   * @param messages - Messages to checkpoint
   * @param label - Optional label for the checkpoint
   * @returns Checkpoint ID
   */
  createCheckpoint(messages: ContextMessage[], label?: string): string {
    const checkpoint = this.checkpointManager.create(messages, {
      label,
      reason: "user-request",
      tokenCount: this.countTokens(messages),
    });
    return checkpoint.id;
  }

  /**
   * Rollback to checkpoint.
   *
   * @param checkpointId - Checkpoint to rollback to
   * @param currentMessages - Current messages (for tracking)
   * @returns Restored messages from checkpoint
   */
  rollbackToCheckpoint(checkpointId: string, currentMessages: ContextMessage[]): ContextMessage[] {
    const result = this.checkpointManager.rollback(checkpointId, currentMessages);
    return result.messages;
  }

  /**
   * Get checkpoint manager for advanced operations.
   *
   * @returns The checkpoint manager instance
   */
  getCheckpointManager(): CheckpointManager {
    return this.checkpointManager;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create default configuration with sensible defaults.
 *
 * @param model - Model identifier
 * @param llmClient - Optional LLM client for compression
 * @returns Default configuration for the model
 *
 * @example
 * ```typescript
 * const config = createDefaultConfig('claude-3-5-sonnet', myLLMClient);
 * const manager = new AutoContextManager(config);
 * ```
 */
export function createDefaultConfig(
  model: string,
  llmClient?: CompressionLLMClient
): AutoContextManagerConfig {
  return {
    model,
    llmClient,
    useAutoCondense: !!llmClient,
    recentCount: DEFAULT_RECENT_COUNT,
    maxCheckpoints: DEFAULT_MAX_CHECKPOINTS,
  };
}

/**
 * Estimate actions needed for a token count.
 *
 * Useful for predicting what management actions will be taken
 * without actually executing them.
 *
 * @param tokenCount - Current token count
 * @param budget - Token budget
 * @param thresholds - Threshold configuration
 * @returns Array of predicted action names
 *
 * @example
 * ```typescript
 * const actions = estimateRequiredActions(85000, budget, thresholds);
 * // ['prune', 'truncate'] if at critical level
 * ```
 */
export function estimateRequiredActions(
  tokenCount: number,
  budget: TokenBudget,
  thresholds: ThresholdConfig
): string[] {
  const usage = tokenCount / budget.historyBudget;
  const actions: string[] = [];

  if (usage >= thresholds.overflow) {
    actions.push("prune", "checkpoint", "truncate", "compress", "recovery");
  } else if (usage >= thresholds.critical) {
    actions.push("prune", "checkpoint", "truncate", "compress");
  } else if (usage >= thresholds.warning) {
    actions.push("prune");
  }
  // healthy: no actions

  return actions;
}
