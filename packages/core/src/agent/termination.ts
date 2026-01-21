// ============================================
// Agent Termination Checker (T017)
// ============================================

/**
 * Termination detection for the agent loop.
 *
 * Provides comprehensive termination checking including:
 * - Resource limits (steps, tokens, time)
 * - Natural completion detection
 * - Loop detection (doom loop, LLM stuck)
 * - Cancellation handling
 *
 * @module @vellum/core/agent/termination
 */

/**
 * Reasons for agent loop termination.
 */
export enum TerminationReason {
  /** Maximum number of steps reached */
  MAX_STEPS = "max_steps",
  /** Maximum tokens consumed */
  MAX_TOKENS = "max_tokens",
  /** Maximum execution time exceeded */
  MAX_TIME = "max_time",
  /** Natural completion (end_turn signal) */
  NATURAL_STOP = "natural_stop",
  /** Response contains only text (no tool calls) */
  TEXT_ONLY = "text_only",
  /** Doom loop detected (repeated identical tool calls) */
  DOOM_LOOP = "doom_loop",
  /** LLM stuck (high similarity in recent responses) */
  LLM_STUCK = "llm_stuck",
  /** User cancelled the operation */
  CANCELLED = "cancelled",
  /** Unrecoverable error occurred */
  ERROR = "error",
}

/**
 * Metadata associated with termination.
 */
export interface TerminationMetadata {
  /** Number of steps executed */
  stepsExecuted?: number;
  /** Total tokens consumed */
  tokensConsumed?: number;
  /** Execution time in milliseconds */
  elapsedMs?: number;
  /** The repeated tool call (for doom loop) */
  repeatedToolCall?: ToolCallInfo;
  /** Similarity score (for LLM stuck) */
  similarityScore?: number;
  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Tool call information for tracking.
 */
export interface ToolCallInfo {
  /** Tool call identifier */
  id: string;
  /** Tool name */
  name: string;
  /** Tool input parameters */
  input: Record<string, unknown>;
}

/**
 * Result of termination check.
 */
export interface TerminationResult {
  /** Whether the loop should terminate */
  shouldTerminate: boolean;
  /** Reason for termination (if shouldTerminate is true) */
  reason?: TerminationReason;
  /** Additional metadata about the termination */
  metadata?: TerminationMetadata;
}

/**
 * Context for evaluating termination conditions.
 */
export interface TerminationContext {
  /** Number of steps executed so far */
  stepCount: number;
  /** Total token usage across all steps */
  tokenUsage: TerminationTokenUsage;
  /** Start time of the loop (timestamp) */
  startTime: number;
  /** Whether the response contained only text (no tool calls) */
  hasTextOnly: boolean;
  /** Whether a natural stop signal was received */
  hasNaturalStop: boolean;
  /** Whether the operation was cancelled */
  isCancelled: boolean;
  /** Recent tool calls for doom loop detection */
  recentToolCalls: ToolCallInfo[];
  /** Recent LLM responses for stuck detection */
  recentResponses: string[];
  /** Current error, if any */
  error?: Error;
}

/**
 * Token usage for termination tracking.
 * Simplified version that aggregates input/output tokens.
 */
export interface TerminationTokenUsage {
  /** Total input tokens consumed */
  inputTokens: number;
  /** Total output tokens consumed */
  outputTokens: number;
  /** Combined total tokens */
  totalTokens: number;
}

/**
 * Configuration for termination limits.
 */
export interface TerminationLimits {
  /** Maximum number of agent loop iterations */
  maxSteps?: number;
  /** Maximum total tokens to consume */
  maxTokens?: number;
  /** Maximum execution time in milliseconds */
  maxTimeMs?: number;
  /** Whether to terminate on text-only responses */
  terminateOnTextOnly?: boolean;
  /** Doom loop detection settings */
  doomLoop?: {
    /** Enable doom loop detection */
    enabled?: boolean;
    /** Number of identical calls to trigger detection (default: 3) */
    threshold?: number;
  };
  /** LLM stuck detection settings */
  llmStuck?: {
    /** Enable LLM stuck detection */
    enabled?: boolean;
    /** Similarity threshold (0-1, default: 0.85) */
    threshold?: number;
    /** Number of responses to compare (default: 3) */
    windowSize?: number;
  };
}

/**
 * Default termination limits.
 */
export const DEFAULT_TERMINATION_LIMITS: TerminationLimits = {
  maxSteps: 100,
  maxTokens: 100000,
  maxTimeMs: 30 * 60 * 1000, // 30 minutes
  terminateOnTextOnly: true,
  doomLoop: {
    enabled: true,
    threshold: 3,
  },
  llmStuck: {
    enabled: true,
    threshold: 0.85,
    windowSize: 3,
  },
};

/**
 * Checks if the agent loop should terminate.
 *
 * Evaluates multiple termination conditions in priority order:
 * 1. Cancellation (highest priority)
 * 2. Errors
 * 3. Resource limits (steps, tokens, time)
 * 4. Loop detection (doom loop, LLM stuck)
 * 5. Natural completion (text-only, end_turn)
 *
 * @example
 * ```typescript
 * const checker = new TerminationChecker({
 *   maxSteps: 50,
 *   maxTokens: 10000,
 *   maxTimeMs: 60000,
 * });
 *
 * const result = checker.shouldTerminate({
 *   stepCount: 51,
 *   tokenUsage: { input: 5000, output: 3000, total: 8000 },
 *   startTime: Date.now() - 30000,
 *   hasTextOnly: false,
 *   hasNaturalStop: false,
 *   isCancelled: false,
 *   recentToolCalls: [],
 *   recentResponses: [],
 * });
 *
 * if (result.shouldTerminate) {
 *   console.log(`Terminating: ${result.reason}`);
 * }
 * ```
 */
export class TerminationChecker {
  private readonly limits: TerminationLimits;

  constructor(limits: Partial<TerminationLimits> = {}) {
    this.limits = { ...DEFAULT_TERMINATION_LIMITS, ...limits };
  }

  /**
   * Gets the configured termination limits.
   */
  getLimits(): TerminationLimits {
    return { ...this.limits };
  }

  /**
   * Evaluates whether the agent loop should terminate.
   *
   * @param context - Current termination context
   * @returns TerminationResult indicating whether to terminate and why
   */
  shouldTerminate(context: TerminationContext): TerminationResult {
    // Priority 1: Cancellation
    if (context.isCancelled) {
      return {
        shouldTerminate: true,
        reason: TerminationReason.CANCELLED,
        metadata: {
          stepsExecuted: context.stepCount,
          tokensConsumed: context.tokenUsage.totalTokens,
          elapsedMs: Date.now() - context.startTime,
        },
      };
    }

    // Priority 2: Error
    if (context.error) {
      return {
        shouldTerminate: true,
        reason: TerminationReason.ERROR,
        metadata: {
          stepsExecuted: context.stepCount,
          tokensConsumed: context.tokenUsage.totalTokens,
          elapsedMs: Date.now() - context.startTime,
          context: { error: context.error.message },
        },
      };
    }

    // Priority 3a: Max steps
    if (this.limits.maxSteps !== undefined && context.stepCount >= this.limits.maxSteps) {
      return {
        shouldTerminate: true,
        reason: TerminationReason.MAX_STEPS,
        metadata: {
          stepsExecuted: context.stepCount,
          tokensConsumed: context.tokenUsage.totalTokens,
          elapsedMs: Date.now() - context.startTime,
          context: { limit: this.limits.maxSteps },
        },
      };
    }

    // Priority 3b: Max tokens
    if (
      this.limits.maxTokens !== undefined &&
      context.tokenUsage.totalTokens >= this.limits.maxTokens
    ) {
      return {
        shouldTerminate: true,
        reason: TerminationReason.MAX_TOKENS,
        metadata: {
          stepsExecuted: context.stepCount,
          tokensConsumed: context.tokenUsage.totalTokens,
          elapsedMs: Date.now() - context.startTime,
          context: { limit: this.limits.maxTokens },
        },
      };
    }

    // Priority 3c: Max time
    const elapsedMs = Date.now() - context.startTime;
    if (this.limits.maxTimeMs !== undefined && elapsedMs >= this.limits.maxTimeMs) {
      return {
        shouldTerminate: true,
        reason: TerminationReason.MAX_TIME,
        metadata: {
          stepsExecuted: context.stepCount,
          tokensConsumed: context.tokenUsage.totalTokens,
          elapsedMs,
          context: { limit: this.limits.maxTimeMs },
        },
      };
    }

    // Priority 4a: Doom loop detection
    if (this.limits.doomLoop?.enabled) {
      const doomLoopResult = this.checkDoomLoop(
        context.recentToolCalls,
        this.limits.doomLoop.threshold ?? 3
      );
      if (doomLoopResult.detected) {
        return {
          shouldTerminate: true,
          reason: TerminationReason.DOOM_LOOP,
          metadata: {
            stepsExecuted: context.stepCount,
            tokensConsumed: context.tokenUsage.totalTokens,
            elapsedMs: Date.now() - context.startTime,
            repeatedToolCall: doomLoopResult.repeatedCall,
          },
        };
      }
    }

    // Priority 4b: LLM stuck detection
    if (this.limits.llmStuck?.enabled) {
      const stuckResult = this.checkLLMStuck(
        context.recentResponses,
        this.limits.llmStuck.threshold ?? 0.85,
        this.limits.llmStuck.windowSize ?? 3
      );
      if (stuckResult.detected) {
        return {
          shouldTerminate: true,
          reason: TerminationReason.LLM_STUCK,
          metadata: {
            stepsExecuted: context.stepCount,
            tokensConsumed: context.tokenUsage.totalTokens,
            elapsedMs: Date.now() - context.startTime,
            similarityScore: stuckResult.similarity,
          },
        };
      }
    }

    // Priority 5a: Natural stop
    if (context.hasNaturalStop) {
      return {
        shouldTerminate: true,
        reason: TerminationReason.NATURAL_STOP,
        metadata: {
          stepsExecuted: context.stepCount,
          tokensConsumed: context.tokenUsage.totalTokens,
          elapsedMs: Date.now() - context.startTime,
        },
      };
    }

    // Priority 5b: Text-only response
    if (this.limits.terminateOnTextOnly && context.hasTextOnly) {
      // Check if the response indicates continuation intent
      const lastResponse = context.recentResponses?.[context.recentResponses.length - 1];
      if (lastResponse && this.detectContinuationIntent(lastResponse)) {
        // Agent expressed intent to continue - don't terminate
        return { shouldTerminate: false };
      }
      return {
        shouldTerminate: true,
        reason: TerminationReason.TEXT_ONLY,
        metadata: {
          stepsExecuted: context.stepCount,
          tokensConsumed: context.tokenUsage.totalTokens,
          elapsedMs: Date.now() - context.startTime,
        },
      };
    }

    // Continue execution
    return { shouldTerminate: false };
  }

  /**
   * Detects if response contains continuation intent phrases.
   * These phrases indicate the agent plans to take more actions.
   */
  private detectContinuationIntent(response: string): boolean {
    const patterns = [
      // Chinese patterns
      /我将继续|接下来我会|让我继续|正在进行|下一步|我会继续|我来|现在我/,
      // English patterns
      /i will continue|let me continue|next i'll|proceeding to|moving on to|i'll now|let me now|now i'll|i'm going to/i,
      // Action verbs indicating continuation
      /i'll read|i'll check|i'll implement|i'll fix|i'll update|i'll create|i'll run|i'll execute/i,
    ];
    return patterns.some((p) => p.test(response));
  }

  /**
   * Checks for doom loop (repeated identical tool calls).
   */
  private checkDoomLoop(
    toolCalls: ToolCallInfo[],
    threshold: number
  ): { detected: boolean; repeatedCall?: ToolCallInfo } {
    if (toolCalls.length < threshold) {
      return { detected: false };
    }

    // Get the last N tool calls
    const recentCalls = toolCalls.slice(-threshold);

    // Compare by serializing to JSON (excluding id which is always unique)
    const serialized = recentCalls.map((call) =>
      JSON.stringify({ name: call.name, input: call.input })
    );

    // Check if all are identical
    const first = serialized[0];
    const allIdentical = serialized.every((s) => s === first);

    if (allIdentical) {
      return {
        detected: true,
        repeatedCall: recentCalls[0],
      };
    }

    return { detected: false };
  }

  /**
   * Checks for LLM stuck (high similarity in recent responses).
   */
  private checkLLMStuck(
    responses: string[],
    threshold: number,
    windowSize: number
  ): { detected: boolean; similarity?: number } {
    if (responses.length < windowSize) {
      return { detected: false };
    }

    // Get the last N responses
    const recentResponses = responses.slice(-windowSize);

    // Calculate average pairwise similarity
    let totalSimilarity = 0;
    let pairCount = 0;

    for (let i = 0; i < recentResponses.length; i++) {
      for (let j = i + 1; j < recentResponses.length; j++) {
        const respI = recentResponses[i] as string;
        const respJ = recentResponses[j] as string;
        const sim = this.calculateJaccardSimilarity(respI, respJ);
        totalSimilarity += sim;
        pairCount++;
      }
    }

    const averageSimilarity = pairCount > 0 ? totalSimilarity / pairCount : 0;

    if (averageSimilarity >= threshold) {
      return {
        detected: true,
        similarity: averageSimilarity,
      };
    }

    return { detected: false };
  }

  /**
   * Calculates Jaccard similarity between two strings using 3-grams.
   */
  private calculateJaccardSimilarity(a: string, b: string): number {
    const ngramSize = 3;

    const tokenizeToNgrams = (text: string): Set<string> => {
      const ngrams = new Set<string>();
      const normalized = text.toLowerCase().replace(/\s+/g, " ");
      for (let i = 0; i <= normalized.length - ngramSize; i++) {
        ngrams.add(normalized.substring(i, i + ngramSize));
      }
      return ngrams;
    };

    const setA = tokenizeToNgrams(a);
    const setB = tokenizeToNgrams(b);

    if (setA.size === 0 && setB.size === 0) {
      return 1; // Both empty = identical
    }

    let intersection = 0;
    for (const gram of setA) {
      if (setB.has(gram)) {
        intersection++;
      }
    }

    const union = setA.size + setB.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }
}

/**
 * Creates a default termination context with initial values.
 */
export function createTerminationContext(
  overrides: Partial<TerminationContext> = {}
): TerminationContext {
  return {
    stepCount: 0,
    tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    startTime: Date.now(),
    hasTextOnly: false,
    hasNaturalStop: false,
    isCancelled: false,
    recentToolCalls: [],
    recentResponses: [],
    ...overrides,
  };
}
