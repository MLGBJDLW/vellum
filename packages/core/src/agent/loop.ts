// ============================================
// Agent Loop Core
// ============================================

import { EventEmitter } from "node:events";
import type { StreamEvent, TokenUsage, ToolDefinition } from "@vellum/provider";
import type { OrchestratorCore } from "../agents/orchestrator/core.js";
import type { SubsessionManager } from "../agents/session/subsession-manager.js";
import { SessionAgentsIntegration } from "../context/agents/session-integration.js";
import type { LLMLogger } from "../logger/llm-logger.js";
import type { Logger } from "../logger/logger.js";
import { DefaultPermissionChecker } from "../permission/checker.js";
import type { TrustPreset } from "../permission/types.js";
import type { PromptBuilder } from "../prompts/prompt-builder.js";
import { classifyError, type ErrorInfo, isFatal, isRetryable } from "../session/errors.js";
import {
  LLM,
  type LLMStreamEvent,
  type SessionMessage,
  toModelMessages,
} from "../session/index.js";
import { RetryAbortedError } from "../session/retry.js";
import { SkillManager, type SkillManagerOptions } from "../skill/manager.js";
import type { MatchContext } from "../skill/matcher.js";
import type { SkillConfig, SkillLoaded } from "../skill/types.js";
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
  type PermissionDecision,
  PermissionDeniedError,
  ToolExecutor,
  ToolNotFoundError,
} from "../tool/index.js";
import type { Result } from "../types/result.js";
import type { ToolContext } from "../types/tool.js";
import { CancellationToken } from "./cancellation.js";
import type { AgentLevel } from "./level.js";
import { type CombinedLoopResult, detectLoop } from "./loop-detection.js";
import type { ModeConfig } from "./modes.js";
import { buildSystemPrompt, fromPromptBuilder, type SystemPromptConfig } from "./prompt.js";
import type { AgentState, StateContext } from "./state.js";
import { createStateContext, isValidTransition } from "./state.js";
import {
  createTerminationContext,
  TerminationChecker,
  type TerminationContext,
  type TerminationLimits,
  TerminationReason,
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
  /** Subsession manager for spawning subagents (T048) */
  subsessionManager?: SubsessionManager;
  /** Orchestrator core for task delegation (T048) */
  orchestrator?: OrchestratorCore;
  /** Parent session ID if running in a subsession (T048) */
  parentSessionId?: string;
  /** Agent level for hierarchy constraints (T048) */
  agentLevel?: AgentLevel;
  /** Enable AGENTS.md protocol integration (optional, defaults to false) */
  enableAgentsIntegration?: boolean;
  /** Enable Skills System integration (T053) */
  enableSkillsIntegration?: boolean;
  /** Skill manager options for Skills System (T053) */
  skillManagerOptions?: SkillManagerOptions;
  /** Skill configuration for permissions and limits (T053) */
  skillConfig?: SkillConfig;
  /** Optional PromptBuilder for new prompt system (T029) */
  promptBuilder?: PromptBuilder;
  /** ModeManager for coding mode integration (T057) */
  modeManager?: import("./mode-manager.js").ModeManager;
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

  /** AGENTS.md integration for tool filtering and prompt sections */
  private agentsIntegration?: SessionAgentsIntegration;

  /** SkillManager for skills system integration (T053) */
  private skillManager?: SkillManager;

  /** Currently active skills for this session (T053) */
  private activeSkills: SkillLoaded[] = [];

  /** ModeManager for coding mode integration (T057) */
  private readonly modeManager?: import("./mode-manager.js").ModeManager;

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

    // Initialize AGENTS.md integration if enabled
    if (config.enableAgentsIntegration && config.cwd) {
      this.agentsIntegration = new SessionAgentsIntegration({
        allowAllIfNoConfig: true, // Don't break existing behavior if no AGENTS.md found
      });
      // Initialize asynchronously - errors are logged but don't fail construction
      this.agentsIntegration
        .initialize(config.cwd)
        .then(() => {
          this.logger?.debug("AGENTS.md integration initialized", {
            hasConfig: this.agentsIntegration?.getConfig() !== null,
          });
        })
        .catch((error) => {
          this.logger?.warn("Failed to initialize AGENTS.md integration", { error });
          // Clear integration on failure to avoid partial state
          this.agentsIntegration = undefined;
        });
    }

    // Initialize Skills System integration if enabled (T053)
    if (config.enableSkillsIntegration && config.cwd) {
      this.skillManager = new SkillManager({
        ...config.skillManagerOptions,
        logger: this.logger,
        config: config.skillConfig,
        loader: {
          ...config.skillManagerOptions?.loader,
          discovery: {
            ...config.skillManagerOptions?.loader?.discovery,
            workspacePath: config.cwd,
          },
        },
      });

      // Initialize asynchronously - errors are logged but don't fail construction
      this.skillManager
        .initialize()
        .then((count) => {
          this.logger?.debug("Skills System initialized", {
            skillCount: count,
          });
        })
        .catch((error) => {
          this.logger?.warn("Failed to initialize Skills System", { error });
          // Clear manager on failure to avoid partial state
          this.skillManager = undefined;
        });
    }

    // Initialize ModeManager integration if provided (T057)
    this.modeManager = config.modeManager;
    if (this.modeManager) {
      // Listen for mode changes to update internal state
      this.modeManager.on("mode-changed", (event) => {
        this.logger?.debug("Mode changed via ModeManager", {
          previousMode: event.previousMode,
          currentMode: event.currentMode,
        });
      });
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
   * Gets the ModeManager instance if configured (T057).
   *
   * @returns The ModeManager instance or undefined
   */
  getModeManager(): import("./mode-manager.js").ModeManager | undefined {
    return this.modeManager;
  }

  /**
   * Processes a user message through the ModeManager handler (T057).
   *
   * If a ModeManager is configured, this method delegates message processing
   * to the active mode's handler, enabling mode-specific behavior.
   *
   * @param content - The user message content
   * @returns Handler result or undefined if no ModeManager configured
   */
  async processUserMessage(
    content: string
  ): Promise<import("./mode-handlers/types.js").HandlerResult | undefined> {
    if (!this.modeManager) {
      return undefined;
    }

    const message: import("./mode-handlers/types.js").UserMessage = {
      content,
      timestamp: Date.now(),
    };

    const result = await this.modeManager.processMessage(message);

    this.logger?.debug("Processed message through ModeManager", {
      mode: this.modeManager.getCurrentMode(),
      shouldContinue: result.shouldContinue,
      requiresCheckpoint: result.requiresCheckpoint,
    });

    return result;
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
   * Builds the system prompt for a run, combining base prompt with AGENTS.md and skills.
   */
  private async buildSystemPromptForRun(): Promise<string> {
    let systemPrompt: string;

    if (this.config.promptBuilder) {
      const result = fromPromptBuilder(this.config.promptBuilder);
      systemPrompt = result.prompt;
      this.logger?.debug("Using PromptBuilder for system prompt", {
        layerCount: this.config.promptBuilder.getLayers().length,
        promptSize: systemPrompt.length,
      });
    } else {
      const systemPromptConfig: SystemPromptConfig = {
        cwd: this.config.cwd,
        projectRoot: this.config.projectRoot,
        mode: this.config.mode.name,
        modePrompt: this.config.mode.prompt,
        providerType: this.config.providerType,
        includeEnvironment: true,
        includeRuleFiles: true,
      };
      systemPrompt = (await buildSystemPrompt(systemPromptConfig)).prompt;
    }

    // Append AGENTS.md prompt sections
    if (this.agentsIntegration?.getState() === "ready") {
      const agentsSections = this.agentsIntegration.getSystemPromptStrings();
      if (agentsSections.length > 0) {
        systemPrompt += `\n\n${agentsSections.join("\n\n")}`;
        this.logger?.debug("Added AGENTS.md sections to system prompt", {
          sectionCount: agentsSections.length,
        });
      }
    }

    // Match and load skills
    if (this.skillManager?.isInitialized()) {
      try {
        const matchContext = this.buildSkillMatchContext();
        this.activeSkills = await this.skillManager.getActiveSkills(matchContext);

        if (this.activeSkills.length > 0) {
          const skillPrompt = this.skillManager.buildCombinedPrompt(this.activeSkills);
          if (skillPrompt) {
            systemPrompt += `\n\n## Active Skills\n\n${skillPrompt}`;
            this.logger?.debug("Added skill sections to system prompt", {
              skillCount: this.activeSkills.length,
              skillNames: this.activeSkills.map((s) => s.name),
            });
          }
        }
      } catch (error) {
        this.logger?.warn("Failed to match skills", { error });
      }
    }

    return systemPrompt;
  }

  /**
   * Processes the LLM stream and collects tool calls.
   */
  private async processStreamResponse(
    stream: AsyncIterable<StreamEvent>,
    pendingToolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }>
  ): Promise<void> {
    if (this.useStreamProcessor && this.streamProcessor) {
      const wrappedStream = this.wrapStreamForProcessor(stream);
      const result = await this.streamProcessor.processStream(wrappedStream);

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
      this.streamProcessor.reset();
    } else {
      for await (const event of stream) {
        if (this.cancellation.isCancelled) {
          break;
        }
        await this.handleStreamEvent(event, pendingToolCalls);
      }
    }
  }

  /**
   * Handles errors during run with classification and retry logic.
   * @returns true if error was handled (retried or terminated), false if should rethrow
   */
  private async handleRunError(error: unknown): Promise<boolean> {
    const err = error instanceof Error ? error : new Error(String(error));
    const durationMs = this.llmRequestStartTime ? Date.now() - this.llmRequestStartTime : 0;

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

    if (error instanceof RetryAbortedError) {
      this.logger?.debug("Retry aborted, terminating");
      this.transitionTo("terminated");
      return true;
    }

    const errorInfo = classifyError(err);

    if (isFatal(errorInfo)) {
      this.logger?.error("Fatal error encountered", { errorInfo });
      this.emit("error", err);
      if (this.state !== "terminated" && this.state !== "shutdown") {
        this.transitionTo("recovering");
      }
      return false; // Signal to rethrow
    }

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

      try {
        await this.retryDelay(delay);
        await this.run();
        return true;
      } catch (retryError) {
        if (retryError instanceof RetryAbortedError) {
          this.transitionTo("terminated");
          return true;
        }
        throw retryError;
      }
    }

    // Non-retryable or retries exhausted
    this.emit("error", err);
    if (this.retryAttempt > 0) {
      this.emit("retryExhausted", err, this.retryAttempt);
    }
    if (this.state !== "terminated" && this.state !== "shutdown") {
      this.transitionTo("recovering");
    }
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
      const systemPrompt = await this.buildSystemPromptForRun();

      // Create abort controller for this stream
      this.abortController = new AbortController();
      this.cancellation.onCancel(() => this.abortController?.abort());

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

      // Track and process pending tool calls
      const pendingToolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> =
        [];
      await this.processStreamResponse(stream, pendingToolCalls);

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
        this.transitionTo("tool_executing");
        await this.executeToolCalls(pendingToolCalls);
      } else {
        this.transitionTo("idle");
        this.emit("complete");
      }
    } catch (error) {
      const handled = await this.handleRunError(error);
      if (!handled) {
        throw error;
      }
    } finally {
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

      // Check AGENTS.md tool allowlist if integration is available
      if (this.agentsIntegration && this.agentsIntegration.getState() === "ready") {
        const filter = this.agentsIntegration.getToolFilter();
        if (!filter.isAllowed(call.name)) {
          const error = `Tool "${call.name}" is not allowed by AGENTS.md configuration`;
          this.logger?.warn("Tool blocked by AGENTS.md allowlist", {
            toolName: call.name,
            callId: call.id,
          });
          this.emit("error", new Error(error));
          this.emit("toolEnd", call.id, call.name, {
            result: { success: false, error },
            timing: { startedAt: Date.now(), completedAt: Date.now(), durationMs: 0 },
            toolName: call.name,
            callId: call.id,
          });
          continue; // Skip to next tool call
        }
      }

      // Create tool context
      const toolContext = this.createToolContext(call.id);

      try {
        // Tool not found
        if (!this.toolExecutor.getTool(call.name)) {
          this.emit("error", new ToolNotFoundError(call.name));
          this.emit("toolEnd", call.id, call.name, {
            result: { success: false, error: `Tool not found: ${call.name}` },
            timing: { startedAt: Date.now(), completedAt: Date.now(), durationMs: 0 },
            toolName: call.name,
            callId: call.id,
          });
          continue;
        }

        // Check permission before emitting toolStart
        const permission: PermissionDecision = await this.toolExecutor.checkPermission(
          call.name,
          call.input,
          toolContext
        );

        if (permission === "deny") {
          const error = `Permission denied for tool: ${call.name}`;
          this.emit("permissionDenied", call.id, call.name, error);
          this.emit("toolEnd", call.id, call.name, {
            result: { success: false, error },
            timing: { startedAt: Date.now(), completedAt: Date.now(), durationMs: 0 },
            toolName: call.name,
            callId: call.id,
          });
          continue;
        }

        if (permission === "ask") {
          // Handle wait_permission state (T015)
          await this.handlePermissionRequired(call.id, call.name, call.input);
          continue;
        }

        // Permission allowed - now we can emit toolStart and execute
        this.emit("toolStart", call.id, call.name, call.input);
        const result = await this.toolExecutor.execute(call.name, call.input, toolContext);
        this.emit("toolEnd", call.id, call.name, result);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));

        if (err instanceof PermissionDeniedError) {
          this.emit("permissionDenied", call.id, call.name, err.message);
        }

        if (err instanceof ToolNotFoundError) {
          this.emit("error", err);
          this.emit("toolEnd", call.id, call.name, {
            result: { success: false, error: err.message },
            timing: { startedAt: Date.now(), completedAt: Date.now(), durationMs: 0 },
            toolName: call.name,
            callId: call.id,
          });
          continue;
        }

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
      // Emit complete after all tool calls finish (T038 fix)
      this.emit("complete");
    }
  }

  /**
   * Creates a ToolContext for tool execution.
   *
   * @param callId - Unique identifier for this tool call
   * @returns ToolContext instance
   */
  private createToolContext(callId: string): ToolContext {
    const trustPreset = this.getTrustPreset();
    const checkPermission = async (action: string, resource?: string): Promise<boolean> => {
      if (!this.config.permissionChecker) {
        return true;
      }

      const lowerAction = action.toLowerCase();
      const params: Record<string, unknown> = { action };

      if (resource) {
        if (
          lowerAction.includes("bash") ||
          lowerAction.includes("shell") ||
          lowerAction.includes("exec")
        ) {
          params.command = resource;
        } else if (
          lowerAction.includes("browser") ||
          lowerAction.includes("web") ||
          lowerAction.includes("fetch") ||
          lowerAction.includes("network")
        ) {
          params.url = resource;
        } else {
          params.path = resource;
        }
      }

      const decision = await this.config.permissionChecker.checkPermission(action, params, {
        workingDir: this.config.cwd,
        sessionId: this.config.sessionId,
        messageId: this.context.messageId,
        callId,
        abortSignal: this.abortController?.signal ?? new AbortController().signal,
        checkPermission,
        agentLevel: this.config.agentLevel,
        parentAgentId: this.config.parentSessionId,
        orchestrator: this.config.orchestrator,
      });

      return decision !== "deny";
    };

    return {
      workingDir: this.config.cwd,
      sessionId: this.config.sessionId,
      messageId: this.context.messageId,
      callId,
      abortSignal: this.abortController?.signal ?? new AbortController().signal,
      checkPermission,
      // Multi-agent context (T048/T049)
      agentLevel: this.config.agentLevel,
      parentAgentId: this.config.parentSessionId,
      orchestrator: this.config.orchestrator,
      trustPreset,
    };
  }

  /**
   * Resolve trust preset for sandbox-aware tool execution.
   */
  private getTrustPreset(): TrustPreset | undefined {
    const checker = this.config.permissionChecker;
    if (!checker) {
      return undefined;
    }

    if (checker instanceof DefaultPermissionChecker) {
      return checker.trustManager.getEffectivePreset().preset;
    }

    if ("trustManager" in checker) {
      const trustManager = (checker as DefaultPermissionChecker).trustManager;
      return trustManager.getEffectivePreset().preset;
    }

    return undefined;
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
        // toolStart should represent actual execution start (after approval)
        this.emit("toolStart", callId, name, input);

        const result = await this.toolExecutor.execute(name, input, toolContext, {
          permissionOverride: "allow",
        });
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

  // ============================================
  // Skills System Integration (T053)
  // ============================================

  /**
   * Returns the SkillManager instance if enabled.
   */
  getSkillManager(): SkillManager | undefined {
    return this.skillManager;
  }

  /**
   * Returns currently active skills for this session.
   */
  getActiveSkills(): SkillLoaded[] {
    return [...this.activeSkills];
  }

  /**
   * Extracts file paths from tool invocations in messages.
   * Used by buildSkillMatchContext to determine files involved in the session.
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Message traversal requires nested conditionals
  private extractFilePathsFromMessages(): string[] {
    const files: string[] = [];
    for (const msg of this.messages) {
      if (msg.role === "assistant") {
        for (const part of msg.parts) {
          if (part.type === "tool") {
            const input = part.input as Record<string, unknown>;
            if (input.path && typeof input.path === "string") {
              files.push(input.path);
            }
            if (input.paths && Array.isArray(input.paths)) {
              files.push(...input.paths.filter((p): p is string => typeof p === "string"));
            }
          }
        }
      }
    }
    return files;
  }

  /**
   * Build match context from current session state.
   * Used to match skills against the current request.
   */
  private buildSkillMatchContext(): MatchContext {
    // Extract the last user message as the request
    const lastUserMessage = [...this.messages].reverse().find((m) => m.role === "user");

    // Extract text from parts
    const request =
      lastUserMessage?.parts
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join(" ") ?? "";

    // Extract file paths from tool results
    const files = this.extractFilePathsFromMessages();

    // Extract slash command if present
    const command = request.startsWith("/") ? request.split(/\s/)[0]?.slice(1) : undefined;

    return {
      request,
      files,
      command,
      projectContext: {}, // Could be populated from config or context detection
    };
  }

  /**
   * Get tool restrictions from active skills.
   * Returns allowed and denied tool lists based on skill compatibility settings.
   */
  getSkillToolRestrictions(): { allowed: string[]; denied: string[] } {
    if (!this.skillManager || this.activeSkills.length === 0) {
      return { allowed: [], denied: [] };
    }

    return this.skillManager.getToolRestrictions(this.activeSkills);
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

    // Emit terminated event with reason (T038 fix)
    this.emit("terminated", TerminationReason.CANCELLED, {
      shouldTerminate: true,
      reason: TerminationReason.CANCELLED,
      metadata: reason ? { stepsExecuted: this.terminationContext.stepCount } : undefined,
    });

    // Also emit complete to finalize any pending operations (T038 fix)
    this.emit("complete");

    // Dispose AGENTS.md integration
    if (this.agentsIntegration) {
      this.agentsIntegration.dispose().catch((error) => {
        this.logger?.warn("Error disposing AGENTS.md integration", { error });
      });
    }
  }
}
