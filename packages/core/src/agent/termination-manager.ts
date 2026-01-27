// ============================================
// Agent Termination Manager
// ============================================

/**
 * Termination Manager for Agent Loop.
 *
 * Extracted from AgentLoop to handle termination detection and loop state
 * tracking including:
 * - Token usage recording
 * - Tool execution tracking
 * - Loop detection (doom loop, LLM stuck)
 * - Termination condition checking
 * - Streaming loop detection
 *
 * @module @vellum/core/agent/termination-manager
 */

import type { TokenUsage } from "@vellum/shared";
import type { Logger } from "../logger/logger.js";
import type { SessionMessage, SessionMessageMetadata } from "../session/index.js";
import type { LLMLoopVerifier } from "./llm-loop-verifier.js";
import {
  type CombinedLoopResult,
  detectLoop,
  detectLoopWithVerification,
  type ExtendedLoopDetectionContext,
} from "./loop-detection.js";
import type { StreamingLoopConfig, StreamingLoopResult } from "./streaming-loop-detector.js";
import { StreamingLoopDetector } from "./streaming-loop-detector.js";
import {
  createTerminationContext,
  TerminationChecker,
  type TerminationContext,
  type TerminationLimits,
  TerminationReason,
  type TerminationResult,
  type ToolCallInfo,
} from "./termination.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for AgentTerminationManager
 */
export interface AgentTerminationManagerConfig {
  /** Termination limits */
  terminationLimits?: TerminationLimits;
  /** LLM loop verification configuration */
  llmLoopVerification?: {
    enabled: boolean;
    confidenceThreshold?: number;
    checkIntervalTurns?: number;
    maxHistoryMessages?: number;
  };
  /** Streaming loop detection configuration */
  streamingLoopDetection?: {
    enabled: boolean;
    config?: StreamingLoopConfig;
    interruptOnDetection?: boolean;
  };
}

/**
 * Dependencies for AgentTerminationManager
 */
export interface AgentTerminationManagerDeps {
  /** Logger for debugging */
  logger?: Logger;
  /** Get current messages */
  getMessages: () => SessionMessage[];
  /** Check if cancellation was requested */
  isCancelled: () => boolean;
  /** Emit terminated event */
  emitTerminated: (reason: TerminationReason, result: TerminationResult) => void;
  /** Emit loop detected event */
  emitLoopDetected: (result: CombinedLoopResult) => void;
  /** Emit streaming loop detected event */
  emitStreamingLoopDetected: (result: StreamingLoopResult) => void;
}

/**
 * Token usage with all optional fields for metadata building
 */
export interface MetadataTokens {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
}

/**
 * Turn usage for metadata building
 */
export interface TurnUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

/**
 * Callbacks for termination events
 */
export interface TerminationManagerCallbacks {
  /** Called when termination is triggered */
  onTerminated?: (reason: TerminationReason, result: TerminationResult) => void;
  /** Called when loop is detected */
  onLoopDetected?: (result: CombinedLoopResult) => void;
  /** Called when streaming loop is detected */
  onStreamingLoopDetected?: (result: StreamingLoopResult) => void;
}

// ============================================================================
// AgentTerminationManager Class
// ============================================================================

/**
 * Manages termination detection and loop state for the agent loop.
 *
 * This class encapsulates termination logic including:
 * - Token usage tracking
 * - Tool call recording
 * - Loop detection (doom loop, LLM stuck)
 * - Termination condition checking
 * - Streaming loop detection during LLM streaming
 *
 * @example
 * ```typescript
 * const terminationManager = new AgentTerminationManager(
 *   {
 *     terminationLimits: { maxSteps: 50 },
 *     streamingLoopDetection: { enabled: true },
 *   },
 *   {
 *     logger,
 *     getMessages: () => this.messages,
 *     isCancelled: () => this.cancellation.isCancelled,
 *     emitTerminated: (reason, result) => this.emit("terminated", reason, result),
 *     emitLoopDetected: (result) => this.emit("loopDetected", result),
 *     emitStreamingLoopDetected: (result) => this.emit("streaming:loopDetected", result),
 *   }
 * );
 *
 * // Record token usage
 * terminationManager.recordTokenUsage(usage);
 *
 * // Record tool execution
 * terminationManager.recordToolCall("call-1", "read_file", { path: "/foo" });
 *
 * // Check termination
 * const result = terminationManager.checkTermination();
 * if (result.shouldTerminate) {
 *   // Handle termination
 * }
 * ```
 */
export class AgentTerminationManager {
  // Configuration
  private readonly config: AgentTerminationManagerConfig;
  private readonly logger?: Logger;

  // Dependencies
  private readonly getMessages: () => SessionMessage[];
  private readonly isCancelled: () => boolean;
  private readonly emitTerminated: (reason: TerminationReason, result: TerminationResult) => void;
  private readonly emitLoopDetected: (result: CombinedLoopResult) => void;
  private readonly emitStreamingLoopDetected: (result: StreamingLoopResult) => void;

  // Core components
  private readonly terminationChecker: TerminationChecker;
  private terminationContext: TerminationContext;

  // Loop detection state
  private recentToolCalls: ToolCallInfo[] = [];
  private recentResponses: string[] = [];

  // Token tracking
  private lastAssistantTokens: TokenUsage | undefined;
  private lastTurnUsage: TurnUsage | null = null;
  private loopState: CombinedLoopResult | undefined;

  // LLM Loop Verifier (lazy-initialized)
  private llmLoopVerifier?: LLMLoopVerifier;

  // Streaming loop detector
  private readonly streamingLoopDetector?: StreamingLoopDetector;
  private readonly interruptOnStreamingLoop: boolean;

  constructor(config: AgentTerminationManagerConfig, deps: AgentTerminationManagerDeps) {
    this.config = config;
    this.logger = deps.logger;
    this.getMessages = deps.getMessages;
    this.isCancelled = deps.isCancelled;
    this.emitTerminated = deps.emitTerminated;
    this.emitLoopDetected = deps.emitLoopDetected;
    this.emitStreamingLoopDetected = deps.emitStreamingLoopDetected;

    // Initialize termination checker
    this.terminationChecker = new TerminationChecker(config.terminationLimits);
    this.terminationContext = createTerminationContext();

    // Initialize streaming loop detector if enabled
    if (config.streamingLoopDetection?.enabled) {
      this.streamingLoopDetector = new StreamingLoopDetector(config.streamingLoopDetection.config);
      this.interruptOnStreamingLoop = config.streamingLoopDetection.interruptOnDetection ?? false;

      this.logger?.debug("Streaming loop detector initialized", {
        interruptOnDetection: this.interruptOnStreamingLoop,
        config: this.streamingLoopDetector.getConfig(),
      });
    } else {
      this.interruptOnStreamingLoop = false;
    }

    this.logger?.debug("AgentTerminationManager initialized", {
      limits: this.terminationChecker.getLimits(),
      streamingLoopEnabled: !!this.streamingLoopDetector,
      llmLoopVerificationEnabled: config.llmLoopVerification?.enabled ?? false,
    });
  }

  // ===========================================================================
  // Token Usage Tracking
  // ===========================================================================

  /**
   * Gets the last assistant token usage.
   */
  getLastAssistantTokens(): TokenUsage | undefined {
    return this.lastAssistantTokens;
  }

  /**
   * Records token usage for tracking.
   *
   * @param tokens - Token usage from LLM response
   */
  recordTokenUsage(tokens: TokenUsage): void {
    this.lastAssistantTokens = tokens;

    // Update termination context token tracking
    this.terminationContext.tokenUsage.inputTokens += tokens.inputTokens ?? 0;
    this.terminationContext.tokenUsage.outputTokens += tokens.outputTokens ?? 0;
    this.terminationContext.tokenUsage.totalTokens =
      this.terminationContext.tokenUsage.inputTokens +
      this.terminationContext.tokenUsage.outputTokens;

    this.logger?.debug("Token usage recorded", {
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
      totalTracked: this.terminationContext.tokenUsage.totalTokens,
    });
  }

  /**
   * Sets the last turn usage for metadata building.
   *
   * @param usage - Turn usage data
   */
  setLastTurnUsage(usage: TurnUsage | null): void {
    this.lastTurnUsage = usage;
  }

  /**
   * Normalizes token usage to standard format.
   *
   * @param usage - Raw token usage
   * @returns Normalized TokenUsage object
   */
  normalizeTokenUsage(usage: TokenUsage): TokenUsage {
    return {
      inputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
    };
  }

  // ===========================================================================
  // Tool Execution Tracking
  // ===========================================================================

  /**
   * Records a tool call for loop detection.
   *
   * @param id - Tool call ID
   * @param name - Tool name
   * @param input - Tool input parameters
   */
  recordToolCall(id: string, name: string, input: Record<string, unknown>): void {
    this.recentToolCalls.push({ id, name, input });
    // Keep only last 10 tool calls
    if (this.recentToolCalls.length > 10) {
      this.recentToolCalls.shift();
    }
    this.terminationContext.recentToolCalls = [...this.recentToolCalls];
  }

  /**
   * Records a tool execution for termination tracking.
   * Alias for recordToolCall for API compatibility.
   *
   * @param tool - Tool call info
   */
  recordToolExecution(tool: { id: string; name: string; input: Record<string, unknown> }): void {
    this.recordToolCall(tool.id, tool.name, tool.input);
  }

  // ===========================================================================
  // Response Tracking (Stuck Detection)
  // ===========================================================================

  /**
   * Records an LLM response for stuck detection.
   *
   * @param text - Response text
   */
  recordResponse(text: string): void {
    if (text.trim().length > 0) {
      this.recentResponses.push(text);
      // Keep only last 10 responses
      if (this.recentResponses.length > 10) {
        this.recentResponses.shift();
      }
      this.terminationContext.recentResponses = [...this.recentResponses];
    }
  }

  /**
   * Records a stuck state from an assistant message.
   *
   * @param assistantMessage - The assistant message text
   */
  recordStuckState(assistantMessage: string): void {
    this.recordResponse(assistantMessage);
  }

  // ===========================================================================
  // Termination Checking
  // ===========================================================================

  /**
   * Checks termination conditions and emits event if triggered.
   *
   * @returns TerminationResult indicating whether to terminate
   */
  checkTermination(): TerminationResult {
    // Update cancellation status
    this.terminationContext.isCancelled = this.isCancelled();

    // Increment step count
    this.terminationContext.stepCount++;

    // Check termination
    const result = this.terminationChecker.shouldTerminate(this.terminationContext);

    if (result.shouldTerminate && result.reason) {
      this.emitTerminated(result.reason, result);
    }

    return result;
  }

  /**
   * Synchronous termination check (alias for checkTermination).
   *
   * @returns TerminationResult indicating whether to terminate
   */
  checkTerminationSync(): TerminationResult {
    return this.checkTermination();
  }

  /**
   * Async termination check with optional LLM verification for borderline cases.
   *
   * @returns Promise resolving to TerminationResult
   */
  async checkTerminationWithVerification(): Promise<TerminationResult> {
    // Run basic termination check first
    const basicResult = this.checkTermination();
    if (basicResult.shouldTerminate) {
      return basicResult;
    }

    // Run loop detection with LLM verification
    const loopResult = await this.checkLoopDetectionAsync();
    if (loopResult.detected && loopResult.suggestedAction === "terminate") {
      return {
        shouldTerminate: true,
        reason:
          loopResult.type === "doom_loop"
            ? TerminationReason.DOOM_LOOP
            : TerminationReason.LLM_STUCK,
        metadata: {
          stepsExecuted: this.terminationContext.stepCount,
          tokensConsumed: this.terminationContext.tokenUsage.totalTokens,
          elapsedMs: Date.now() - this.terminationContext.startTime,
          similarityScore: loopResult.stuckDetection?.similarityScore,
          context: {
            loopType: loopResult.type,
            confidence: loopResult.confidence,
            llmVerification: loopResult.llmVerification,
          },
        },
      };
    }

    return { shouldTerminate: false };
  }

  // ===========================================================================
  // Loop Detection
  // ===========================================================================

  /**
   * Gets the current loop state.
   *
   * @returns CombinedLoopResult or undefined if not yet detected
   */
  getLoopState(): CombinedLoopResult | undefined {
    return this.loopState;
  }

  /**
   * Runs loop detection and emits event if detected.
   *
   * @returns CombinedLoopResult from loop detection
   */
  checkLoopDetection(): CombinedLoopResult {
    const result = detectLoop({
      toolCalls: this.recentToolCalls,
      responses: this.recentResponses,
    });

    this.loopState = result;

    if (result.detected) {
      this.emitLoopDetected(result);
    }

    return result;
  }

  /**
   * Runs enhanced loop detection with LLM verification for borderline cases.
   *
   * Uses the LLM loop verifier when:
   * - LLM verification is enabled in config
   * - A verifier instance is set
   * - The similarity-based detection is in a borderline state
   *
   * @returns Promise resolving to CombinedLoopResult with optional LLM verification
   */
  async checkLoopDetectionAsync(): Promise<CombinedLoopResult> {
    const llmVerificationConfig = this.config.llmLoopVerification;

    // If LLM verification is not enabled or no verifier is set, use sync detection
    if (!llmVerificationConfig?.enabled || !this.llmLoopVerifier) {
      return this.checkLoopDetection();
    }

    // Build extended context for verification
    const extendedContext: ExtendedLoopDetectionContext = {
      toolCalls: this.recentToolCalls,
      responses: this.recentResponses,
      llmVerifier: this.llmLoopVerifier,
      messages: this.getMessages(),
    };

    // Run detection with LLM verification support
    const result = await detectLoopWithVerification(extendedContext, {
      enableLLMVerification: true,
      llmVerifierConfig: {
        confidenceThreshold: llmVerificationConfig.confidenceThreshold,
        checkIntervalTurns: llmVerificationConfig.checkIntervalTurns,
        maxHistoryMessages: llmVerificationConfig.maxHistoryMessages,
      },
    });

    this.loopState = result;

    if (result.detected) {
      this.emitLoopDetected(result);
    }

    // Log LLM verification if it was performed
    if (result.llmVerification) {
      this.logger?.debug("LLM loop verification performed", {
        isStuck: result.llmVerification.isStuck,
        confidence: result.llmVerification.confidence,
        analysis: result.llmVerification.analysis,
      });
    }

    return result;
  }

  // ===========================================================================
  // LLM Loop Verifier
  // ===========================================================================

  /**
   * Sets the LLM loop verifier instance for borderline case verification.
   *
   * The verifier requires an initialized LLMProvider, so it must be set
   * externally after the provider is ready.
   *
   * @param verifier - LLMLoopVerifier instance
   */
  setLLMLoopVerifier(verifier: LLMLoopVerifier): void {
    this.llmLoopVerifier = verifier;
    this.logger?.debug("LLM loop verifier set", {
      config: verifier.getConfig(),
    });
  }

  /**
   * Gets the LLM loop verifier instance if set.
   */
  getLLMLoopVerifier(): LLMLoopVerifier | undefined {
    return this.llmLoopVerifier;
  }

  // ===========================================================================
  // Streaming Loop Detection
  // ===========================================================================

  /**
   * Gets the streaming loop detector instance if enabled.
   */
  getStreamingLoopDetector(): StreamingLoopDetector | undefined {
    return this.streamingLoopDetector;
  }

  /**
   * Whether to interrupt stream on loop detection.
   */
  shouldInterruptOnStreamingLoop(): boolean {
    return this.interruptOnStreamingLoop;
  }

  /**
   * Process a stream event for streaming loop detection.
   *
   * @param event - Stream event from LLM
   * @returns StreamingLoopResult if loop detected, undefined otherwise
   */
  processStreamEvent(
    event: import("@vellum/provider").StreamEvent
  ): StreamingLoopResult | undefined {
    if (!this.streamingLoopDetector) {
      return undefined;
    }

    const result = this.streamingLoopDetector.addAndCheck(event);
    if (result.detected) {
      this.emitStreamingLoopDetected(result);
    }
    return result;
  }

  // ===========================================================================
  // Termination Checker Access
  // ===========================================================================

  /**
   * Gets the underlying termination checker instance.
   */
  getTerminationChecker(): TerminationChecker {
    return this.terminationChecker;
  }

  // ===========================================================================
  // Reset
  // ===========================================================================

  /**
   * Resets the termination context for a new run.
   */
  resetTerminationTracking(): void {
    this.terminationContext = createTerminationContext();
    this.recentToolCalls = [];
    this.recentResponses = [];
    this.lastAssistantTokens = undefined;
    this.lastTurnUsage = null;
    this.loopState = undefined;
    // Reset streaming loop detector
    this.streamingLoopDetector?.reset();

    this.logger?.debug("Termination tracking reset");
  }

  // ===========================================================================
  // Metadata Building
  // ===========================================================================

  /**
   * Builds partial message metadata including token usage.
   * Note: This returns a partial metadata object without createdAt,
   * which should be set when creating the full message.
   *
   * @returns Partial SessionMessageMetadata (without createdAt)
   */
  buildMetadata(): Partial<Omit<SessionMessageMetadata, "createdAt">> {
    const metadata: Partial<Omit<SessionMessageMetadata, "createdAt">> = {};

    if (this.lastTurnUsage) {
      // Tokens require input and output to be numbers, not undefined
      if (
        this.lastTurnUsage.inputTokens !== undefined &&
        this.lastTurnUsage.outputTokens !== undefined
      ) {
        const tokens: NonNullable<SessionMessageMetadata["tokens"]> = {
          input: this.lastTurnUsage.inputTokens,
          output: this.lastTurnUsage.outputTokens,
        };

        if (this.lastTurnUsage.cacheReadTokens !== undefined) {
          tokens.cacheRead = this.lastTurnUsage.cacheReadTokens;
        }
        if (this.lastTurnUsage.cacheWriteTokens !== undefined) {
          tokens.cacheWrite = this.lastTurnUsage.cacheWriteTokens;
        }

        metadata.tokens = tokens;
      }
    }

    return metadata;
  }

  // ===========================================================================
  // Context State Updates
  // ===========================================================================

  /**
   * Sets whether the response contains only text (no tool calls).
   *
   * @param hasTextOnly - Whether response is text-only
   */
  setTextOnly(hasTextOnly: boolean): void {
    this.terminationContext.hasTextOnly = hasTextOnly;
  }

  /**
   * Sets whether a natural stop signal was received.
   *
   * @param hasNaturalStop - Whether natural stop was received
   */
  setNaturalStop(hasNaturalStop: boolean): void {
    this.terminationContext.hasNaturalStop = hasNaturalStop;
  }

  /**
   * Sets an error in the termination context.
   *
   * @param error - Error that occurred
   */
  setError(error: Error | undefined): void {
    this.terminationContext.error = error;
  }

  /**
   * Gets the current step count.
   */
  getStepCount(): number {
    return this.terminationContext.stepCount;
  }

  /**
   * Gets the termination context (for testing/debugging).
   */
  getTerminationContext(): TerminationContext {
    return { ...this.terminationContext };
  }
}
