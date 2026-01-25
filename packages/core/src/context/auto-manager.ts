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
 * - REQ-002: Accurate token counting via provider-native SDK or tiktoken
 * - REQ-010: Profile-specific thresholds (autoCondensePercent)
 * - REQ-013: Sliding window fallback after ALL_MODELS_FAILED
 *
 * @module @vellum/core/context/auto-manager
 */

import type { Message } from "../types/message.js";
import { CheckpointManager } from "./checkpoint.js";
import type { CompressionLLMClient } from "./compression.js";
import { NonDestructiveCompressor } from "./compression.js";
import { CompactionError } from "./errors.js";
import {
  type ContextImprovementsConfig,
  ContextImprovementsManager,
  CrossSessionInheritanceResolver,
  type InheritedContext,
  type InheritedSummary,
  type SessionInheritanceConfig,
  type TruncationRecoveryOptions,
  type TruncationState,
  TruncationStateManager,
} from "./improvements/index.js";
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
   *
   * For accurate counting, use the provider's native tokenizer:
   * - Anthropic: Use `createAnthropicTokenizer(client)` from `@vellum/provider`
   * - OpenAI: Use `createTiktokenTokenizer(model)` from `@vellum/provider`
   * - Google: Use `createGoogleTokenizer(client)` from `@vellum/provider`
   *
   * @example
   * ```typescript
   * import { createTiktokenTokenizer } from '@vellum/provider';
   *
   * const tiktoken = createTiktokenTokenizer('gpt-4o');
   * const manager = new AutoContextManager({
   *   model: 'gpt-4o',
   *   tokenizer: async (text) => {
   *     const result = await tiktoken.countTokens(text);
   *     return result.tokens;
   *   },
   * });
   * ```
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

  /**
   * Profile-specific auto-condense threshold (REQ-010).
   * Overrides the default critical threshold for triggering auto-compression.
   * Value should be between 0 and 1 (e.g., 0.8 = 80% of budget).
   *
   * When set, compression is triggered at this threshold instead of the
   * model's default critical threshold.
   *
   * @example
   * ```typescript
   * // Compress earlier (at 70% budget usage)
   * const config: AutoContextManagerConfig = {
   *   model: 'gpt-4o',
   *   autoCondensePercent: 0.7,
   * };
   * ```
   */
  autoCondensePercent?: number;

  /**
   * Callback for logging warnings (REQ-013).
   * Called when fallback to sliding window truncation occurs.
   */
  onFallbackWarning?: (message: string) => void;

  /**
   * Callback for compaction warnings (REQ-011).
   * Called when compaction count exceeds 2 in a session.
   *
   * @param count - Current compaction count
   * @param totalTokensCompressed - Total tokens compressed in this session
   *
   * @example
   * ```typescript
   * const config: AutoContextManagerConfig = {
   *   model: 'gpt-4o',
   *   onCompactionWarning: (count, tokens) => {
   *     console.warn(`Compaction #${count}: ${tokens} tokens compressed total`);
   *   },
   * };
   * ```
   */
  onCompactionWarning?: (count: number, totalTokensCompressed: number) => void;

  /**
   * Truncation recovery options (P0-2).
   * Enables snapshot storage before truncation for potential recovery.
   *
   * @example
   * ```typescript
   * const config: AutoContextManagerConfig = {
   *   model: 'gpt-4o',
   *   truncationRecovery: {
   *     maxSnapshots: 3,
   *     maxSnapshotSize: 1024 * 1024, // 1MB
   *     enableCompression: true,
   *     expirationMs: 30 * 60 * 1000, // 30 minutes
   *   },
   * };
   * ```
   */
  truncationRecovery?: TruncationRecoveryOptions;

  /**
   * Session inheritance configuration (P1-1).
   * Enables cross-session context inheritance.
   *
   * @example
   * ```typescript
   * const config: AutoContextManagerConfig = {
   *   model: 'gpt-4o',
   *   sessionInheritance: {
   *     enabled: true,
   *     source: 'last_session',
   *     maxInheritedSummaries: 3,
   *     inheritTypes: ['summary', 'decisions'],
   *   },
   * };
   * ```
   */
  sessionInheritance?: SessionInheritanceConfig;

  /**
   * Storage directory for persistence features.
   * Used by truncation recovery and session inheritance.
   *
   * @default '.vellum'
   */
  storageDir?: string;

  /**
   * Unified improvements configuration (alternative to individual configs).
   * When provided, takes precedence over individual `truncationRecovery` and
   * `sessionInheritance` settings.
   *
   * @example
   * ```typescript
   * const config: AutoContextManagerConfig = {
   *   model: 'gpt-4o',
   *   improvements: {
   *     truncationRecovery: { maxSnapshots: 5 },
   *     sessionInheritance: { enabled: true },
   *     compactionStats: { enabled: true, persist: true },
   *   },
   * };
   * ```
   */
  improvements?: Partial<ContextImprovementsConfig>;
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
  /** Profile-specific auto-condense threshold (REQ-010) */
  autoCondensePercent: number | null;
  /** Callback for logging warnings (REQ-013) */
  onFallbackWarning: ((message: string) => void) | null;
  /** Callback for compaction warnings (REQ-011) */
  onCompactionWarning?: ((count: number, totalTokensCompressed: number) => void) | null;
  /** Storage directory for persistence features */
  storageDir: string;
  /** Truncation recovery options (P0-2) */
  truncationRecovery: TruncationRecoveryOptions | null;
  /** Session inheritance options (P1-1) */
  sessionInheritance: SessionInheritanceConfig | null;
  /** Unified improvements config */
  improvements: Partial<ContextImprovementsConfig> | null;
}

/**
 * Resolve configuration with defaults.
 */
function resolveConfig(config: AutoContextManagerConfig): ResolvedConfig {
  const contextWindow = config.contextWindow ?? getModelContextWindow(config.model);

  // Resolve truncation recovery: improvements takes precedence
  const truncationRecovery =
    config.improvements?.truncationRecovery ?? config.truncationRecovery ?? null;

  // Resolve session inheritance: improvements takes precedence
  const sessionInheritance =
    config.improvements?.sessionInheritance ?? config.sessionInheritance ?? null;

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
    autoCondensePercent: config.autoCondensePercent ?? null,
    onFallbackWarning: config.onFallbackWarning ?? null,
    onCompactionWarning: config.onCompactionWarning ?? null,
    storageDir: config.storageDir ?? ".vellum",
    truncationRecovery,
    sessionInheritance,
    improvements: config.improvements ?? null,
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
/** Compaction warning threshold (REQ-011) */
const COMPACTION_WARNING_THRESHOLD = 2;

export class AutoContextManager {
  private readonly config: ResolvedConfig;
  private readonly checkpointManager: CheckpointManager;
  private readonly compressor: NonDestructiveCompressor | null;
  private readonly thresholds: ThresholdConfig;
  private readonly budget: TokenBudget;

  /** Track compaction count in session (REQ-011) */
  private compactionCount = 0;
  /** Track total tokens compressed in session (REQ-011) */
  private totalTokensCompressed = 0;

  /** Truncation state manager for recoverable truncation (P0-2) */
  private readonly truncationStateManager: TruncationStateManager | null;

  /** Cross-session inheritance resolver (P1-1) */
  private readonly inheritanceResolver: CrossSessionInheritanceResolver | null;

  /** Unified improvements manager (optional, for factory access) */
  private readonly improvementsManager: ContextImprovementsManager | null;

  /** Cached inherited context from previous session */
  private inheritedContext: InheritedContext | null = null;

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

    // Initialize improvements manager if unified config provided
    if (this.config.improvements) {
      this.improvementsManager = new ContextImprovementsManager(this.config.improvements);
      // Use components from the manager
      this.truncationStateManager = this.improvementsManager.truncationManager;
      this.inheritanceResolver = this.improvementsManager.inheritanceResolver;
    } else {
      this.improvementsManager = null;

      // Initialize truncation state manager (P0-2) from individual config
      if (this.config.truncationRecovery) {
        this.truncationStateManager = new TruncationStateManager(this.config.truncationRecovery);
      } else {
        this.truncationStateManager = null;
      }

      // Initialize inheritance resolver (P1-1) from individual config
      if (this.config.sessionInheritance?.enabled) {
        this.inheritanceResolver = new CrossSessionInheritanceResolver(
          this.config.sessionInheritance,
          this.config.storageDir
        );
      } else {
        this.inheritanceResolver = null;
      }
    }

    // Get model-specific thresholds with user overrides
    const baseThresholds = getThresholdConfig(this.config.model);

    // Apply profile-specific autoCondensePercent if provided (REQ-010)
    // This overrides the critical threshold for triggering compression
    const criticalThreshold =
      this.config.autoCondensePercent !== null
        ? this.config.autoCondensePercent
        : (config.thresholds?.critical ?? baseThresholds.critical);

    this.thresholds = {
      warning: config.thresholds?.warning ?? baseThresholds.warning,
      critical: criticalThreshold,
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
    truncationId?: string;
  }> {
    const tokensBefore = this.countTokens(messages);

    // Target: critical threshold to get back to warning level
    const targetTokens = Math.floor(this.budget.historyBudget * this.thresholds.warning);

    const truncateResult = truncate(messages, {
      targetTokens,
      recentCount: this.config.recentCount,
      preserveToolPairs: true,
      tokenizer: this.messageTokenizer.bind(this),
      // Pass truncation state manager for recoverable truncation (P0-2)
      stateManager: this.truncationStateManager ?? undefined,
      truncationReason: "sliding_window",
    });

    const tokensSaved = tokensBefore - truncateResult.tokenCount;

    const actions: string[] = [];
    if (truncateResult.removedCount > 0) {
      actions.push(`truncate:${truncateResult.removedCount} messages removed`);
      actions.push(`truncate:${tokensSaved} tokens saved`);
      if (truncateResult.truncationId) {
        actions.push(`truncate:snapshot saved (id=${truncateResult.truncationId})`);
      }
    }

    return {
      messages: truncateResult.messages,
      actions,
      tokensSaved,
      truncationId: truncateResult.truncationId,
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

      // T026/T027: Track compaction count and emit warning (REQ-011)
      this.compactionCount++;
      this.totalTokensCompressed += tokensSaved;

      if (this.compactionCount > COMPACTION_WARNING_THRESHOLD && this.config.onCompactionWarning) {
        this.config.onCompactionWarning(this.compactionCount, this.totalTokensCompressed);
      }

      return {
        messages: newMessages,
        actions: [
          `compress:${compressionResult.compressedMessageIds.length} messages → 1 summary`,
          `compress:${tokensSaved} tokens saved (ratio: ${compressionResult.ratio.toFixed(2)})`,
        ],
        tokensSaved,
      };
    } catch (error) {
      // Check if this is ALL_MODELS_FAILED error (REQ-013)
      if (CompactionError.isCompactionError(error) && error.code === "ALL_MODELS_FAILED") {
        // Log warning via callback if provided
        const warningMsg = `Compression failed (ALL_MODELS_FAILED): falling back to sliding window truncation`;
        if (this.config.onFallbackWarning) {
          this.config.onFallbackWarning(warningMsg);
        }

        // Fallback to sliding window truncation (REQ-013)
        const truncateFallbackResult = await this.executeSlidingWindowFallback(messages);
        return {
          messages: truncateFallbackResult.messages,
          actions: [
            `compress:failed - ALL_MODELS_FAILED`,
            `compress:fallback to sliding window truncation`,
            ...truncateFallbackResult.actions,
          ],
          tokensSaved: truncateFallbackResult.tokensSaved,
        };
      }

      // Other compression failures - return original messages
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      return {
        messages,
        actions: [`compress:failed - ${errorMsg}`],
        tokensSaved: 0,
      };
    }
  }

  /**
   * Fallback to sliding window truncation when compression fails (REQ-013).
   *
   * Called when ALL_MODELS_FAILED error occurs during compression.
   * Uses aggressive truncation to reduce context size.
   * Messages are marked with truncationParent instead of condenseParent (T030).
   *
   * @param messages - Current messages
   * @returns Truncated messages and actions taken
   */
  private async executeSlidingWindowFallback(messages: ContextMessage[]): Promise<{
    messages: ContextMessage[];
    actions: string[];
    tokensSaved: number;
  }> {
    const tokensBefore = this.countTokens(messages);

    // Target: warning threshold to ensure we're back in safe zone
    const targetTokens = Math.floor(this.budget.historyBudget * this.thresholds.warning);

    const truncateResult = truncate(messages, {
      targetTokens,
      recentCount: this.config.recentCount,
      preserveToolPairs: true,
      tokenizer: this.messageTokenizer.bind(this),
    });

    // T030: Mark truncation fallback messages with truncationParent (REQ-013)
    // Generate unique truncation ID
    const truncationId = `trunc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const markedMessages: ContextMessage[] = truncateResult.messages.map((msg) => {
      // Only mark retained messages that were present before truncation
      // Skip system messages and the summary placeholder (if any)
      if (msg.role === "system" || msg.isSummary) {
        return msg;
      }
      return {
        ...msg,
        truncationParent: truncationId,
      };
    });

    const tokensSaved = tokensBefore - truncateResult.tokenCount;

    const actions: string[] = [];
    if (truncateResult.removedCount > 0) {
      actions.push(`fallback-truncate:${truncateResult.removedCount} messages removed`);
      actions.push(`fallback-truncate:${tokensSaved} tokens saved`);
      actions.push(`fallback-truncate:marked with truncationParent=${truncationId}`);
    }

    return {
      messages: markedMessages,
      actions,
      tokensSaved,
    };
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
   * Get compaction count for this session (REQ-011).
   *
   * @returns Number of compactions performed
   */
  getCompactionCount(): number {
    return this.compactionCount;
  }

  /**
   * Get total tokens compressed in this session (REQ-011).
   *
   * @returns Total tokens saved via compression
   */
  getTotalTokensCompressed(): number {
    return this.totalTokensCompressed;
  }

  /**
   * Reset compaction statistics (useful for testing or session reset).
   */
  resetCompactionStats(): void {
    this.compactionCount = 0;
    this.totalTokensCompressed = 0;
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

  // ==========================================================================
  // Truncation Recovery (P0-2)
  // ==========================================================================

  /**
   * Recover truncated messages from a snapshot.
   *
   * @param truncationId - ID of the truncation to recover
   * @returns Recovered messages, or null if not found/expired
   *
   * @example
   * ```typescript
   * const manager = new AutoContextManager({ model: 'gpt-4o', truncationRecovery: { maxSnapshots: 3 } });
   *
   * // After a truncation operation...
   * const recovered = manager.recoverTruncated('trunc-123');
   * if (recovered) {
   *   // Merge recovered messages back into conversation
   * }
   * ```
   */
  recoverTruncated(truncationId: string): ContextMessage[] | null {
    return this.truncationStateManager?.recover(truncationId) ?? null;
  }

  /**
   * List all recoverable truncations.
   *
   * @returns Array of truncation states that can still be recovered
   *
   * @example
   * ```typescript
   * const truncations = manager.listRecoverableTruncations();
   * for (const t of truncations) {
   *   console.log(`Truncation ${t.truncationId}: ${t.truncatedMessageIds.length} messages`);
   * }
   * ```
   */
  listRecoverableTruncations(): TruncationState[] {
    return this.truncationStateManager?.listRecoverable() ?? [];
  }

  /**
   * Get truncation state manager for advanced operations.
   *
   * @returns The truncation state manager instance, or null if not configured
   */
  getTruncationStateManager(): TruncationStateManager | null {
    return this.truncationStateManager;
  }

  // ==========================================================================
  // Cross-Session Inheritance (P1-1)
  // ==========================================================================

  /**
   * Initialize with inherited context from a previous session.
   *
   * Call this at the start of a new session to load relevant context
   * from previous sessions.
   *
   * @param projectPath - Optional project path for project-specific inheritance
   * @returns Inherited context, or null if none available
   *
   * @example
   * ```typescript
   * const manager = new AutoContextManager({
   *   model: 'gpt-4o',
   *   sessionInheritance: {
   *     enabled: true,
   *     source: 'last_session',
   *     maxInheritedSummaries: 3,
   *     inheritTypes: ['summary', 'decisions'],
   *   },
   * });
   *
   * const inherited = await manager.initializeWithInheritance('/path/to/project');
   * if (inherited) {
   *   const contextMessage = manager.getInheritedContextMessage();
   *   // Prepend contextMessage to conversation
   * }
   * ```
   */
  async initializeWithInheritance(projectPath?: string): Promise<InheritedContext | null> {
    if (!this.inheritanceResolver) {
      return null;
    }

    this.inheritedContext = await this.inheritanceResolver.resolveInheritance(projectPath);
    return this.inheritedContext;
  }

  /**
   * Save session context for future inheritance.
   *
   * Call this at the end of a session to persist summaries for future sessions.
   *
   * @param sessionId - Current session ID
   * @param summaries - Summaries to save
   * @param projectPath - Optional project path for project-level context
   *
   * @example
   * ```typescript
   * // At session end
   * await manager.saveSessionContext('session-123', [
   *   { id: 'sum-1', content: 'Implemented authentication...', ... },
   * ], '/path/to/project');
   * ```
   */
  async saveSessionContext(
    sessionId: string,
    summaries: InheritedSummary[],
    projectPath?: string
  ): Promise<void> {
    if (!this.inheritanceResolver) {
      return;
    }

    await this.inheritanceResolver.saveSummaries(sessionId, summaries, projectPath);
  }

  /**
   * Get inherited context formatted as a message.
   *
   * Returns a message suitable for prepending to the conversation
   * to provide context from previous sessions.
   *
   * @returns Message with inherited context, or null if none available
   *
   * @example
   * ```typescript
   * const contextMessage = manager.getInheritedContextMessage();
   * if (contextMessage) {
   *   messages.unshift(contextMessage);
   * }
   * ```
   */
  getInheritedContextMessage(): Message | null {
    if (!this.inheritanceResolver || !this.inheritedContext) {
      return null;
    }

    return this.inheritanceResolver.formatAsMessage(this.inheritedContext);
  }

  /**
   * Get the cached inherited context.
   *
   * @returns Inherited context, or null if not loaded
   */
  getInheritedContext(): InheritedContext | null {
    return this.inheritedContext;
  }

  /**
   * Get inheritance resolver for advanced operations.
   *
   * @returns The inheritance resolver instance, or null if not configured
   */
  getInheritanceResolver(): CrossSessionInheritanceResolver | null {
    return this.inheritanceResolver;
  }

  // ==========================================================================
  // Improvements Manager (P3)
  // ==========================================================================

  /**
   * Get the unified improvements manager.
   *
   * Returns the ContextImprovementsManager if configured via the `improvements`
   * option. Provides access to all improvement components in one place.
   *
   * @returns The improvements manager instance, or null if not configured
   *
   * @example
   * ```typescript
   * const manager = new AutoContextManager({
   *   model: 'gpt-4o',
   *   improvements: {
   *     summaryQuality: { enableLLMValidation: true },
   *     compactionStats: { enabled: true },
   *   },
   * });
   *
   * const improvements = manager.getImprovementsManager();
   * if (improvements) {
   *   const stats = improvements.statsTracker.getStats();
   * }
   * ```
   */
  getImprovementsManager(): ContextImprovementsManager | null {
    return this.improvementsManager;
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
