// ============================================
// Agent Loop Core
// ============================================

import { EventEmitter } from "node:events";
import type { StreamEvent, TokenUsage, ToolDefinition } from "@vellum/provider";
import type { LLMLogger } from "../logger/llm-logger.js";
import type { Logger } from "../logger/logger.js";
import { classifyError, type ErrorInfo, isFatal, isRetryable } from "../session/errors.js";
import {
  LLM,
  type LLMStreamEvent,
  type SessionMessage,
  toModelMessages,
} from "../session/index.js";
import { RetryAbortedError } from "../session/retry.js";
import {
  StreamProcessor,
  type StreamProcessorConfig,
  type StreamProcessorHooks,
  type UiEvent,
} from "../streaming/processor.js";
import type { TelemetryInstrumentor } from "../telemetry/instrumentor.js";
import {
  type ExecutionResult,
  type PermissionChecker,
  PermissionDeniedError,
  ToolExecutor,
  ToolNotFoundError,
} from "../tool/index.js";
import type { Result } from "../types/result.js";
import type { ToolContext } from "../types/tool.js";
import { CancellationToken } from "./cancellation.js";
import { type CombinedLoopResult, detectLoop } from "./loop-detection.js";
import type { ModeConfig } from "./modes.js";
import { buildSystemPrompt, type SystemPromptConfig } from "./prompt.js";
import type { AgentState, StateContext } from "./state.js";
import { createStateContext, isValidTransition } from "./state.js";
import {
  createTerminationContext,
  TerminationChecker,
  type TerminationContext,
  type TerminationLimits,
  type TerminationReason,
  type TerminationResult,
  type ToolCallInfo,
} from "./termination.js";

/**
 * Configuration for the AgentLoop.
 */
export interface AgentLoopConfig {
  /** Session identifier */
  sessionId: string;
  /** Mode configuration */
  mode: ModeConfig;
  /** Provider type (e.g., 'anthropic', 'openai') */
  providerType: string;
  /** Model identifier */
  model: string;
  /** Current working directory */
  cwd: string;
  /** Project root directory */
  projectRoot?: string;
  /** Available tools for the agent */
  tools?: ToolDefinition[];
  /** Tool executor for running tools (T014) */
  toolExecutor?: ToolExecutor;
  /** Permission checker for tool authorization (T015) */
  permissionChecker?: PermissionChecker;
  /** Enable extended thinking */
  thinking?: {
    enabled: boolean;
    budgetTokens?: number;
  };
  /** Maximum retry attempts for transient failures */
  maxRetries?: number;
  /** Timeout for individual operations in milliseconds */
  operationTimeout?: number;
  /** Termination limits for the agent loop (T021) */
  terminationLimits?: TerminationLimits;
  /** Logger instance for state transitions and debug output (T041) */
  logger?: Logger;
  /** LLM Logger for recording LLM requests/responses (T041) */
  llmLogger?: LLMLogger;
  /** Telemetry instrumentor for OpenTelemetry tracing (T042) */
  telemetryInstrumentor?: TelemetryInstrumentor;
  /** StreamProcessor configuration for unified stream handling (T042) */
  streamProcessor?: StreamProcessorConfig;
  /** StreamProcessor hooks for lifecycle events (T042) */
  streamProcessorHooks?: StreamProcessorHooks;
  /** Enable StreamProcessor for unified stream handling (T042) - defaults to false for backward compatibility */
  useStreamProcessor?: boolean;
}

/**
 * Events emitted by the AgentLoop.
 */
export interface AgentLoopEvents {
  /** Emitted when state changes */
  stateChange: [from: AgentState, to: AgentState, context: StateContext];
  /** Emitted when an error occurs */
  error: [error: Error];
  /** Emitted when a message is received */
  message: [content: string];
  /** Emitted when the loop completes */
  complete: [];
  /** Emitted when text is streamed from LLM */
  text: [text: string];
  /** Emitted when thinking/reasoning is streamed from LLM */
  thinking: [text: string];
  /** Emitted when a tool call is received */
  toolCall: [id: string, name: string, input: Record<string, unknown>];
  /** Emitted when token usage is reported */
  usage: [usage: TokenUsage];
  /** Emitted when a tool execution starts (T014) */
  toolStart: [callId: string, name: string, input: Record<string, unknown>];
  /** Emitted when a tool execution completes (T014) */
  toolEnd: [callId: string, name: string, result: ExecutionResult];
  /** Emitted when permission is required for a tool (T015) */
  permissionRequired: [callId: string, name: string, input: Record<string, unknown>];
  /** Emitted when permission is granted (T015) */
  permissionGranted: [callId: string, name: string];
  /** Emitted when permission is denied (T015) */
  permissionDenied: [callId: string, name: string, reason: string];
  /** Emitted when the loop is terminated with reason (T021) */
  terminated: [reason: TerminationReason, result: TerminationResult];
  /** Emitted when loop detection finds a potential issue (T021) */
  loopDetected: [result: CombinedLoopResult];
  /** Emitted when a retry is attempted (T025) */
  retry: [attempt: number, error: Error, delay: number];
  /** Emitted when all retries are exhausted (T025) */
  retryExhausted: [error: Error, attempts: number];
}

/**
 * AgentLoop orchestrates the agent execution cycle.
 *
 * The loop manages:
 * - State machine transitions
 * - LLM streaming
 * - Tool execution with cancellation
 * - Error recovery and retries
 *
 * @example
 * ```typescript
 * const loop = new AgentLoop({
 *   sessionId: "session-123",
 *   mode: MODE_CONFIGS.code,
 * });
 *
 * loop.on("stateChange", (from, to, context) => {
 *   console.log(`State: ${from} -> ${to}`);
 * });
 *
 * await loop.run();
 * ```
 */
export class AgentLoop extends EventEmitter<AgentLoopEvents> {
  private readonly config: AgentLoopConfig;
  private state: AgentState;
  private context: StateContext;
  private cancellation: CancellationToken;
  private messages: SessionMessage[] = [];
  private abortController: AbortController | null = null;

  /** Tool executor instance (T014) */
  private readonly toolExecutor: ToolExecutor;

  /** Pending tool calls awaiting permission (T015) */
  private pendingPermission: {
    callId: string;
    name: string;
    input: Record<string, unknown>;
    resolve: (granted: boolean) => void;
  } | null = null;

  /** Termination checker instance (T021) */
  private readonly terminationChecker: TerminationChecker;

  /** Termination context for tracking loop state (T021) */
  private terminationContext: TerminationContext;

  /** Recent tool calls for loop detection (T021) */
  private recentToolCalls: ToolCallInfo[] = [];

  /** Recent LLM responses for stuck detection (T021) */
  private recentResponses: string[] = [];

  /** Current retry attempt count (T025) */
  private retryAttempt = 0;

  /** Logger instance for state transitions (T041) */
  private readonly logger?: Logger;

  /** LLM Logger for request/response logging (T041) */
  private readonly llmLogger?: LLMLogger;

  /** Telemetry instrumentor for OpenTelemetry tracing (T042) */
  private readonly telemetryInstrumentor?: TelemetryInstrumentor;

  /** Current LLM request ID for correlation (T041) */
  private currentRequestId?: string;

  /** Timer for LLM request duration tracking (T041) */
  private llmRequestStartTime?: number;

  /** StreamProcessor for unified stream handling (T042) */
  private readonly streamProcessor?: StreamProcessor;

  /** Whether to use StreamProcessor (T042) */
  private readonly useStreamProcessor: boolean;

  constructor(config: AgentLoopConfig) {
    super();
    this.config = config;
    this.state = "idle";
    this.context = createStateContext(config.sessionId);
    this.cancellation = new CancellationToken();

    // Initialize tool executor (T014)
    this.toolExecutor =
      config.toolExecutor ??
      new ToolExecutor({
        permissionChecker: config.permissionChecker,
      });

    // Initialize termination checker (T021)
    this.terminationChecker = new TerminationChecker(config.terminationLimits);
    this.terminationContext = createTerminationContext();

    // Initialize logger and telemetry (T041, T042)
    this.logger = config.logger;
    this.llmLogger = config.llmLogger;
    this.telemetryInstrumentor = config.telemetryInstrumentor;

    // Initialize StreamProcessor for unified stream handling (T042)
    this.useStreamProcessor = config.useStreamProcessor ?? false;
    if (this.useStreamProcessor) {
      this.streamProcessor = new StreamProcessor(config.streamProcessor);
      if (config.streamProcessorHooks) {
        this.streamProcessor.setHooks(config.streamProcessorHooks);
      }
      // Wire up StreamProcessor UI events to existing emitters
      this.streamProcessor.setUiHandler((event) => this.handleUiEvent(event));
    }
  }

  /**
   * Returns the current agent state.
   */
  getState(): AgentState {
    return this.state;
  }

  /**
   * Returns the current state context.
   */
  getContext(): StateContext {
    return this.context;
  }

  /**
   * Returns the cancellation token.
   */
  getCancellationToken(): CancellationToken {
    return this.cancellation;
  }

  /**
   * Returns the loop configuration.
   */
  getConfig(): AgentLoopConfig {
    return this.config;
  }

  /**
   * Returns the conversation messages.
   */
  getMessages(): SessionMessage[] {
    return [...this.messages];
  }

  /**
   * Adds a message to the conversation.
   */
  addMessage(message: SessionMessage): void {
    this.messages.push(message);
  }

  /**
   * Gets the termination checker instance (T021).
   */
  getTerminationChecker(): TerminationChecker {
    return this.terminationChecker;
  }

  /**
   * Gets the current termination context (T021).
   */
  getTerminationContext(): TerminationContext {
    return { ...this.terminationContext };
  }

  /**
   * Updates the termination context with new token usage (T021).
   */
  updateTokenUsage(usage: TokenUsage): void {
    this.terminationContext.tokenUsage = {
      inputTokens: this.terminationContext.tokenUsage.inputTokens + usage.inputTokens,
      outputTokens: this.terminationContext.tokenUsage.outputTokens + usage.outputTokens,
      totalTokens:
        this.terminationContext.tokenUsage.totalTokens + usage.inputTokens + usage.outputTokens,
    };
  }

  /**
   * Records a tool call for loop detection (T021).
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
   * Records an LLM response for stuck detection (T021).
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
   * Checks termination conditions and emits event if triggered (T021).
   *
   * @returns TerminationResult indicating whether to terminate
   */
  checkTermination(): TerminationResult {
    // Update cancellation status
    this.terminationContext.isCancelled = this.cancellation.isCancelled;

    // Increment step count
    this.terminationContext.stepCount++;

    // Check termination
    const result = this.terminationChecker.shouldTerminate(this.terminationContext);

    if (result.shouldTerminate && result.reason) {
      this.emit("terminated", result.reason, result);
    }

    return result;
  }

  /**
   * Runs loop detection and emits event if detected (T021).
   *
   * @returns CombinedLoopResult from loop detection
   */
  checkLoopDetection(): CombinedLoopResult {
    const result = detectLoop({
      toolCalls: this.recentToolCalls,
      responses: this.recentResponses,
    });

    if (result.detected) {
      this.emit("loopDetected", result);
    }

    return result;
  }

  /**
   * Resets the termination context for a new run (T021).
   */
  resetTerminationContext(): void {
    this.terminationContext = createTerminationContext();
    this.recentToolCalls = [];
    this.recentResponses = [];
  }

  /**
   * Transitions to a new state with validation.
   * Logs state transitions via Logger (T041).
   *
   * @param to - Target state
   * @returns true if transition was successful
   */
  private transitionTo(to: AgentState): boolean {
    if (!isValidTransition(this.state, to)) {
      this.logger?.debug(`Invalid state transition attempted: ${this.state} -> ${to}`);
      return false;
    }

    const from = this.state;
    const transitionTime = Date.now();
    const durationInState = transitionTime - (this.context.enteredAt ?? transitionTime);

    this.state = to;
    this.context.enteredAt = transitionTime;

    // Log state transition (T041)
    this.logger?.debug(`State transition: ${from} -> ${to}`, {
      sessionId: this.config.sessionId,
      from,
      to,
      durationInPreviousStateMs: durationInState,
      stepCount: this.terminationContext.stepCount,
    });

    this.emit("stateChange", from, to, this.context);
    return true;
  }

  /**
   * Runs the agent loop.
   *
   * This is the main entry point for starting the agent.
   * The loop will continue until:
   * - The task is complete
   * - User cancels the operation
   * - An unrecoverable error occurs
   *
   * Integrates with Logger (T041) and TelemetryInstrumentor (T042).
   */
  async run(): Promise<void> {
    // Check for cancellation before starting
    if (this.cancellation.isCancelled) {
      this.logger?.debug("Run cancelled before start");
      this.transitionTo("terminated");
      return;
    }

    // Transition to streaming state
    if (!this.transitionTo("streaming")) {
      throw new Error(`Cannot transition from ${this.state} to streaming`);
    }

    // Generate request ID for this run (T041)
    this.currentRequestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    this.llmRequestStartTime = Date.now();

    // Log LLM request start (T041)
    this.llmLogger?.logRequestStart(
      this.config.providerType,
      this.config.model,
      this.currentRequestId
    );

    this.logger?.debug("Starting LLM stream", {
      requestId: this.currentRequestId,
      provider: this.config.providerType,
      model: this.config.model,
      messageCount: this.messages.length,
    });

    try {
      // Build system prompt
      const systemPromptConfig: SystemPromptConfig = {
        cwd: this.config.cwd,
        projectRoot: this.config.projectRoot,
        mode: this.config.mode.name,
        modePrompt: this.config.mode.prompt,
        providerType: this.config.providerType,
        includeEnvironment: true,
        includeRuleFiles: true,
      };

      const { prompt: systemPrompt } = await buildSystemPrompt(systemPromptConfig);

      // Create abort controller for this stream
      this.abortController = new AbortController();

      // Register cancellation handler
      const onCancel = () => {
        this.abortController?.abort();
      };
      this.cancellation.onCancel(onCancel);

      // Convert session messages to provider format
      const providerMessages = toModelMessages(this.messages);

      // Create base stream from LLM
      const baseStream = LLM.stream({
        providerType: this.config.providerType,
        model: this.config.model,
        messages: providerMessages,
        system: systemPrompt,
        tools: this.config.tools,
        thinking: this.config.thinking,
        abortSignal: this.abortController.signal,
      });

      // Wrap with telemetry instrumentor if available (T042)
      const stream = this.telemetryInstrumentor
        ? this.telemetryInstrumentor.instrumentStream(
            {
              provider: this.config.providerType,
              model: this.config.model,
              operation: "chat",
              requestId: this.currentRequestId,
            },
            baseStream
          )
        : baseStream;

      // Track pending tool calls for Phase 3
      const pendingToolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> =
        [];

      // Process stream based on configuration (T042)
      if (this.useStreamProcessor && this.streamProcessor) {
        // Use unified StreamProcessor pipeline
        const wrappedStream = this.wrapStreamForProcessor(stream);
        const result = await this.streamProcessor.processStream(wrappedStream);

        // Collect tool calls from result for execution
        if (result.ok) {
          for (const part of result.value.parts) {
            if (part.type === "tool") {
              pendingToolCalls.push({
                id: part.id,
                name: part.name,
                input: part.arguments,
              });
            }
          }
        }
        // Reset processor for next run
        this.streamProcessor.reset();
      } else {
        // Legacy stream handling - iterate over stream events
        for await (const event of stream) {
          // Check for cancellation
          if (this.cancellation.isCancelled) {
            break;
          }

          // Handle event by type
          await this.handleStreamEvent(event, pendingToolCalls);
        }
      }

      // Calculate duration (T041)
      const durationMs = this.llmRequestStartTime ? Date.now() - this.llmRequestStartTime : 0;

      // Log LLM request completion (T041)
      this.llmLogger?.logRequestComplete({
        provider: this.config.providerType,
        model: this.config.model,
        requestId: this.currentRequestId,
        inputTokens: this.terminationContext.tokenUsage.inputTokens,
        outputTokens: this.terminationContext.tokenUsage.outputTokens,
        durationMs,
      });

      this.logger?.debug("LLM stream completed", {
        requestId: this.currentRequestId,
        durationMs,
        tokenUsage: this.terminationContext.tokenUsage,
        cancelled: this.cancellation.isCancelled,
      });

      // Determine next state based on stream completion
      if (this.cancellation.isCancelled) {
        this.transitionTo("terminated");
      } else if (pendingToolCalls.length > 0) {
        // Transition to tool_executing for Phase 3
        this.transitionTo("tool_executing");
        // Execute pending tool calls (T014)
        await this.executeToolCalls(pendingToolCalls);
      } else {
        // No tool calls, transition back to idle (task complete)
        this.transitionTo("idle");
        this.emit("complete");
      }
    } catch (error) {
      // Handle errors with retry logic (T025)
      const err = error instanceof Error ? error : new Error(String(error));
      const durationMs = this.llmRequestStartTime ? Date.now() - this.llmRequestStartTime : 0;

      // Log LLM request error (T041)
      this.llmLogger?.logRequestError({
        provider: this.config.providerType,
        model: this.config.model,
        requestId: this.currentRequestId ?? "unknown",
        durationMs,
        error: err,
      });

      this.logger?.error("LLM stream error", {
        requestId: this.currentRequestId,
        error: err.message,
        durationMs,
      });

      // Check if aborted - don't retry
      if (error instanceof RetryAbortedError) {
        this.logger?.debug("Retry aborted, terminating");
        this.transitionTo("terminated");
        return;
      }

      // Classify the error to determine handling strategy
      const errorInfo = classifyError(err);

      // Fatal errors throw immediately
      if (isFatal(errorInfo)) {
        this.logger?.error("Fatal error encountered", { errorInfo });
        this.emit("error", err);
        if (this.state !== "terminated" && this.state !== "shutdown") {
          this.transitionTo("recovering");
        }
        throw err;
      }

      // Transient/retryable errors trigger retry logic
      if (isRetryable(errorInfo) && this.shouldRetry(errorInfo)) {
        this.retryAttempt++;
        const delay = errorInfo.retryDelay ?? this.calculateRetryDelay(this.retryAttempt);

        this.logger?.debug("Retrying after error", {
          attempt: this.retryAttempt,
          delay,
          errorType: errorInfo.severity,
        });

        this.emit("retry", this.retryAttempt, err, delay);
        this.transitionTo("recovering");

        // Wait before retry (respects cancellation)
        try {
          await this.retryDelay(delay);
          // Retry the run
          await this.run();
          return;
        } catch (retryError) {
          if (retryError instanceof RetryAbortedError) {
            this.transitionTo("terminated");
            return;
          }
          throw retryError;
        }
      }

      // Non-retryable error or retries exhausted
      this.emit("error", err);
      if (this.retryAttempt > 0) {
        this.emit("retryExhausted", err, this.retryAttempt);
      }

      // Transition to recovering state
      if (this.state !== "terminated" && this.state !== "shutdown") {
        this.transitionTo("recovering");
      }
    } finally {
      // Cleanup abort controller
      this.abortController = null;
    }
  }

  /**
   * Determines if a retry should be attempted based on error and config (T025).
   *
   * @param errorInfo - Classified error information
   * @returns true if retry should be attempted
   */
  private shouldRetry(errorInfo: ErrorInfo): boolean {
    const maxRetries = this.config.maxRetries ?? 3;
    const maxErrorRetries = errorInfo.maxRetries ?? maxRetries;
    return this.retryAttempt < Math.min(maxRetries, maxErrorRetries);
  }

  /**
   * Calculates retry delay using exponential backoff (T025).
   *
   * @param attempt - Current retry attempt (1-based)
   * @returns Delay in milliseconds
   */
  private calculateRetryDelay(attempt: number): number {
    const baseDelay = 1000;
    const maxDelay = 30000;
    const exponentialDelay = baseDelay * 2 ** (attempt - 1);
    return Math.min(exponentialDelay, maxDelay);
  }

  /**
   * Waits for retry delay with cancellation support (T025).
   *
   * @param delay - Delay in milliseconds
   * @throws RetryAbortedError if cancelled during wait
   */
  private async retryDelay(delay: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (this.cancellation.isCancelled) {
        reject(new RetryAbortedError("Retry cancelled"));
        return;
      }

      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      let unsubscribe: (() => void) | undefined;

      const cleanup = () => {
        if (timeoutId !== undefined) {
          clearTimeout(timeoutId);
        }
        if (unsubscribe) {
          unsubscribe();
        }
      };

      const cancelHandler = () => {
        cleanup();
        reject(new RetryAbortedError("Retry cancelled"));
      };

      unsubscribe = this.cancellation.onCancel(cancelHandler);

      timeoutId = setTimeout(() => {
        cleanup();
        resolve();
      }, delay);
    });
  }

  /**
   * Resets retry state (T025).
   * Call this when starting a fresh operation.
   */
  resetRetryState(): void {
    this.retryAttempt = 0;
  }

  /**
   * Gets current retry attempt count (T025).
   */
  getRetryAttempt(): number {
    return this.retryAttempt;
  }

  /**
   * Execute pending tool calls (T014).
   *
   * @param toolCalls - Array of tool calls from LLM
   */
  private async executeToolCalls(
    toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }>
  ): Promise<void> {
    for (const call of toolCalls) {
      // Check for cancellation between tool calls
      if (this.cancellation.isCancelled) {
        break;
      }

      // Create tool context
      const toolContext = this.createToolContext(call.id);

      // Emit tool start event
      this.emit("toolStart", call.id, call.name, call.input);

      try {
        // Check permission first using executeWithPermissionCheck
        const checkResult = await this.toolExecutor.executeWithPermissionCheck(
          call.name,
          call.input,
          toolContext
        );

        switch (checkResult.status) {
          case "completed":
            // Tool executed successfully
            this.emit("toolEnd", call.id, call.name, checkResult.result);
            break;

          case "permission_required":
            // Handle wait_permission state (T015)
            await this.handlePermissionRequired(call.id, call.name, call.input);
            break;

          case "denied":
            // Permission was denied
            this.emit("permissionDenied", call.id, call.name, checkResult.error);
            this.emit("toolEnd", call.id, call.name, {
              result: { success: false, error: checkResult.error },
              timing: { startedAt: Date.now(), completedAt: Date.now(), durationMs: 0 },
              toolName: call.name,
              callId: call.id,
            });
            break;

          case "not_found":
            // Tool not found
            this.emit("error", new ToolNotFoundError(call.name));
            this.emit("toolEnd", call.id, call.name, {
              result: { success: false, error: `Tool not found: ${call.name}` },
              timing: { startedAt: Date.now(), completedAt: Date.now(), durationMs: 0 },
              toolName: call.name,
              callId: call.id,
            });
            break;
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.emit("error", err);
        this.emit("toolEnd", call.id, call.name, {
          result: { success: false, error: err.message },
          timing: { startedAt: Date.now(), completedAt: Date.now(), durationMs: 0 },
          toolName: call.name,
          callId: call.id,
        });
      }
    }

    // After all tools executed, transition back to streaming or idle
    if (!this.cancellation.isCancelled && this.state === "tool_executing") {
      this.transitionTo("streaming");
    }
  }

  /**
   * Creates a ToolContext for tool execution.
   *
   * @param callId - Unique identifier for this tool call
   * @returns ToolContext instance
   */
  private createToolContext(callId: string): ToolContext {
    return {
      workingDir: this.config.cwd,
      sessionId: this.config.sessionId,
      messageId: this.context.messageId,
      callId,
      abortSignal: this.abortController?.signal ?? new AbortController().signal,
      checkPermission: async (_action: string, _resource?: string) => {
        // Delegate to the ToolExecutor's permission checker
        return true;
      },
    };
  }

  /**
   * Handle permission required state (T015).
   *
   * Transitions to wait_permission and waits for user response.
   *
   * @param callId - Tool call identifier
   * @param name - Tool name
   * @param input - Tool input parameters
   */
  private async handlePermissionRequired(
    callId: string,
    name: string,
    input: Record<string, unknown>
  ): Promise<void> {
    // Transition to wait_permission state
    this.transitionTo("wait_permission");

    // Emit permission required event
    this.emit("permissionRequired", callId, name, input);

    // Create a promise that will be resolved when permission is granted/denied
    const granted = await new Promise<boolean>((resolve) => {
      this.pendingPermission = {
        callId,
        name,
        input,
        resolve,
      };
    });

    // Clear pending permission
    this.pendingPermission = null;

    if (granted) {
      // Permission granted - emit event and execute
      this.emit("permissionGranted", callId, name);

      // Transition back to tool_executing
      this.transitionTo("tool_executing");

      // Execute the tool now that permission is granted
      const toolContext = this.createToolContext(callId);
      try {
        const result = await this.toolExecutor.execute(name, input, toolContext);
        this.emit("toolEnd", callId, name, result);
      } catch (error) {
        if (error instanceof PermissionDeniedError) {
          this.emit("permissionDenied", callId, name, error.message);
        }
        this.emit("toolEnd", callId, name, {
          result: { success: false, error: error instanceof Error ? error.message : String(error) },
          timing: { startedAt: Date.now(), completedAt: Date.now(), durationMs: 0 },
          toolName: name,
          callId,
        });
      }
    } else {
      // Permission denied by user
      this.emit("permissionDenied", callId, name, "User denied permission");
      this.emit("toolEnd", callId, name, {
        result: { success: false, error: "Permission denied by user" },
        timing: { startedAt: Date.now(), completedAt: Date.now(), durationMs: 0 },
        toolName: name,
        callId,
      });

      // Return to idle state
      this.transitionTo("idle");
    }
  }

  /**
   * Grant permission for a pending tool call (T015).
   *
   * Call this method when the user approves a tool execution.
   */
  grantPermission(): void {
    if (this.pendingPermission) {
      this.pendingPermission.resolve(true);
    }
  }

  /**
   * Deny permission for a pending tool call (T015).
   *
   * Call this method when the user rejects a tool execution.
   */
  denyPermission(): void {
    if (this.pendingPermission) {
      this.pendingPermission.resolve(false);
    }
  }

  /**
   * Returns the pending permission request, if any (T015).
   */
  getPendingPermission(): { callId: string; name: string; input: Record<string, unknown> } | null {
    if (!this.pendingPermission) {
      return null;
    }
    const { callId, name, input } = this.pendingPermission;
    return { callId, name, input };
  }

  /**
   * Returns the tool executor instance.
   */
  getToolExecutor(): ToolExecutor {
    return this.toolExecutor;
  }

  /**
   * Handles a single stream event.
   *
   * @param event - Stream event from LLM
   * @param pendingToolCalls - Array to collect pending tool calls
   */
  private async handleStreamEvent(
    event: LLMStreamEvent,
    pendingToolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }>
  ): Promise<void> {
    switch (event.type) {
      case "text":
        // Emit text delta
        this.emit("text", event.content);
        break;

      case "reasoning":
        // Emit thinking/reasoning delta
        this.emit("thinking", event.content);
        break;

      case "toolCall":
        // Collect tool call for execution (Phase 3)
        pendingToolCalls.push({
          id: event.id,
          name: event.name,
          input: event.input,
        });
        // Emit tool call event
        this.emit("toolCall", event.id, event.name, event.input);
        break;

      case "toolCallDelta":
        // Partial tool call - ignore for now, handled when complete
        break;

      case "usage":
        // Emit usage statistics
        this.emit("usage", {
          inputTokens: event.inputTokens,
          outputTokens: event.outputTokens,
          cacheReadTokens: event.cacheReadTokens,
          cacheWriteTokens: event.cacheWriteTokens,
        });
        break;

      case "error":
        // Emit error
        this.emit("error", new Error(`[${event.code}] ${event.message}`));
        break;

      case "done":
        // Stream complete - handle in run() after loop exits
        break;
    }
  }

  /**
   * Wraps LLM stream for StreamProcessor consumption (T042).
   *
   * Converts LLMStreamEvent to Result<StreamEvent, Error> format
   * expected by StreamProcessor.
   *
   * @param stream - Raw LLM stream
   * @returns Wrapped stream compatible with StreamProcessor
   */
  private async *wrapStreamForProcessor(
    stream: AsyncIterable<LLMStreamEvent>
  ): AsyncIterable<Result<StreamEvent, Error>> {
    try {
      for await (const event of stream) {
        // Check for cancellation
        if (this.cancellation.isCancelled) {
          return;
        }

        // Convert LLMStreamEvent to StreamEvent
        const streamEvent = this.convertToStreamEvent(event);
        if (streamEvent) {
          yield { ok: true as const, value: streamEvent };
        }
      }
    } catch (error) {
      yield {
        ok: false as const,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Converts LLMStreamEvent to StreamEvent format (T042).
   *
   * @param event - LLM stream event
   * @returns Converted StreamEvent or undefined if not mappable
   */
  private convertToStreamEvent(event: LLMStreamEvent): StreamEvent | undefined {
    switch (event.type) {
      case "text":
        return { type: "text", content: event.content };

      case "reasoning":
        return { type: "reasoning", content: event.content };

      case "toolCall":
        // Complete tool call - emit as tool_call_start + end combo
        return {
          type: "toolCall",
          id: event.id,
          name: event.name,
          input: event.input,
        };

      case "toolCallDelta":
        return {
          type: "tool_call_delta",
          id: event.id,
          arguments: event.inputDelta,
          index: 0,
        };

      case "usage":
        return {
          type: "usage",
          inputTokens: event.inputTokens,
          outputTokens: event.outputTokens,
          cacheReadTokens: event.cacheReadTokens,
          cacheWriteTokens: event.cacheWriteTokens,
        };

      case "error":
        // StreamEvent has a different error format
        // Return undefined since error is handled via Result
        return undefined;

      case "done":
        return { type: "end", stopReason: "end_turn" };

      default:
        return undefined;
    }
  }

  /**
   * Handles UI events from StreamProcessor (T042).
   *
   * Dispatches events to existing emitters for backward compatibility.
   *
   * @param event - UI event from StreamProcessor
   */
  private handleUiEvent(event: UiEvent): void {
    switch (event.type) {
      case "text_chunk":
        this.emit("text", event.content);
        break;

      case "reasoning_chunk":
        this.emit("thinking", event.content);
        break;

      case "tool_started":
        // Tool started events don't have direct mapping yet
        // Tool calls are collected from the result
        break;

      case "tool_completed":
        // Tool completed events don't have direct mapping yet
        break;

      case "tool_error":
        this.emit("error", new Error(`Tool ${event.id} error: ${event.error}`));
        break;

      case "usage":
        this.emit("usage", event.usage);
        break;

      case "complete":
        // Complete is handled after processStream returns
        break;

      case "error":
        this.emit("error", new Error(`[${event.error.code}] ${event.error.message}`));
        break;

      case "citation":
        // Citations can be logged but don't have an existing emitter
        this.logger?.debug("Citation received", { chunk: event.chunk });
        break;
    }
  }

  /**
   * Returns the StreamProcessor instance if enabled (T042).
   *
   * This allows external consumers to configure additional hooks
   * or access the processor directly.
   */
  getStreamProcessor(): StreamProcessor | undefined {
    return this.streamProcessor;
  }

  /**
   * Cancels the current operation.
   *
   * This will:
   * - Abort any pending LLM requests
   * - Cancel pending tool executions
   * - Transition to terminated state
   *
   * @param reason - Optional reason for cancellation
   */
  cancel(reason?: string): void {
    this.cancellation.cancel(reason);
    this.abortController?.abort();
    this.transitionTo("terminated");
  }
}
