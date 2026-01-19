// ============================================
// Agent Loop Core
// ============================================

import { EventEmitter } from "node:events";
import type { StreamEvent, TokenUsage, ToolDefinition } from "@vellum/provider";
import type { OrchestratorCore, SubagentHandle } from "../agents/orchestrator/core.js";
import type { SubsessionManager } from "../agents/session/subsession-manager.js";
import type { UserPromptSignal } from "../builtin/ask-followup.js";
import type { AttemptCompletionOutput } from "../builtin/attempt-completion.js";
import type { DelegateAgentSignal } from "../builtin/delegate-agent.js";
import { SessionAgentsIntegration } from "../context/agents/session-integration.js";
import { ErrorCode, VellumError } from "../errors/index.js";
import type { LLMLogger } from "../logger/llm-logger.js";
import type { Logger } from "../logger/logger.js";
import { DefaultPermissionChecker } from "../permission/checker.js";
import type { TrustPreset } from "../permission/types.js";
import type { PromptBuilder } from "../prompts/prompt-builder.js";
import { classifyError, type ErrorInfo, isFatal, isRetryable } from "../session/errors.js";
import {
  createAssistantMessage,
  createToolResultMessage,
  LLM,
  type LLMStreamEvent,
  type SessionMessage,
  SessionParts,
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
import { getToolsForMode } from "../tool/mode-filter.js";
import type { Result } from "../types/result.js";
import type { ToolContext } from "../types/tool.js";
import { CancellationToken } from "./cancellation.js";
import {
  type ContextIntegration,
  type ContextManageResult,
  type ContextManagerConfig,
  createContextIntegrationFromLoopConfig,
} from "./context-integration.js";
import type { AgentLevel } from "./level.js";
import { type CombinedLoopResult, detectLoop } from "./loop-detection.js";
import type { ModeConfig } from "./modes.js";
import { fromPromptBuilder } from "./prompt.js";
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
  /**
   * Dynamic thinking config getter for runtime thinking state.
   * If provided, this is called at each LLM.stream() to get the effective
   * thinking configuration, enabling runtime toggling via /think command.
   * Falls back to static `thinking` config if not provided.
   *
   * @param modeExtendedThinking - The mode's extendedThinking setting
   * @returns Effective thinking config for the LLM call
   */
  getThinkingConfig?: (modeExtendedThinking?: boolean) => {
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
  /** Whether the session is interactive (enables interactive-only tools like ask_followup_question) */
  interactive?: boolean;
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
  /**
   * Context management configuration (T403).
   * Enables automatic context window management with sliding window and compression.
   */
  contextManagement?: ContextManagerConfig["contextManagement"];
  /**
   * Maximum iterations for the agentic loop (T058).
   * When the agent executes tools, it will automatically re-invoke the LLM
   * to continue reasoning until:
   * - The LLM returns a text-only response (no tool calls)
   * - This limit is reached
   * - Cancellation is requested
   * - Permission is blocked
   * @default 50
   */
  maxIterations?: number;
  /**
   * Enable automatic continuation after tool execution (T058).
   * When true, the agent will re-invoke the LLM after each tool execution
   * to continue reasoning. When false, the agent stops after first response.
   * @default true
   */
  continueAfterTools?: boolean;
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
  /** Emitted when agentic loop starts a new iteration (T058) */
  iterationStart: [iteration: number, maxIterations: number];
  /** Emitted when agentic loop continues after tool execution (T058) */
  iterationContinue: [iteration: number, toolCallCount: number];
  /** Emitted when agentic loop reaches max iterations (T058) */
  maxIterationsReached: [iteration: number, maxIterations: number];
  /** Emitted when delegation to a subagent starts (T059) */
  delegationStart: [delegationId: string, agent: string, task: string];
  /** Emitted when delegation to a subagent completes (T059) */
  delegationComplete: [delegationId: string, agent: string, result: string];
  /** Emitted when text is streamed from a subagent (T059) */
  subagentText: [delegationId: string, agent: string, chunk: string];
  /** Emitted when a subagent executes a tool (T059) */
  subagentTool: [delegationId: string, agent: string, toolName: string];
  /** Emitted when context management modifies the message history (T403) */
  contextManaged: [result: ContextManageResult];
  /** Emitted when user input is required (GAP 1 fix - ask_followup_question) */
  "userPrompt:required": [prompt: { question: string; suggestions?: string[] }];
  /** Emitted when user responds to a prompt (GAP 1 fix - ask_followup_question) */
  "userPrompt:response": [response: string];
  /** Emitted when agent attempts completion (GAP 2 fix - attempt_completion) */
  "completion:attempted": [
    completion: { result: string; verified: boolean; verificationPassed?: boolean },
  ];
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

  /** Current iteration count for the agentic loop (T058) */
  private iterationCount = 0;

  /** Pending user prompt awaiting response (GAP 1 fix) */
  private pendingUserPrompt: {
    question: string;
    suggestions?: string[];
    resolve: (response: string) => void;
  } | null = null;

  /** Track whether the current stream produced any text content */
  private streamHasText = false;

  /** Track whether the current stream produced any reasoning content */
  private streamHasThinking = false;

  /** Track whether the current stream produced any tool calls */
  private streamHasToolCalls = false;

  /** Accumulated text content from streaming (for pure text responses) */
  private accumulatedText = "";

  /** Accumulated reasoning content from streaming (for pure text responses) */
  private accumulatedReasoning = "";

  /** Flag to signal completion was attempted (GAP 2 fix) */
  private completionAttempted = false;

  /** Maximum iterations allowed for the agentic loop (T058) */
  private readonly maxIterations: number;

  /** Whether to continue after tool execution (T058) */
  private readonly continueAfterTools: boolean;

  /** Context integration for automatic context management (T403) */
  private contextIntegration?: ContextIntegration;

  constructor(config: AgentLoopConfig) {
    super();
    this.config = config;
    this.state = "idle";
    this.context = createStateContext(config.sessionId);
    this.cancellation = new CancellationToken();

    // Initialize agentic loop settings (T058)
    this.maxIterations = config.maxIterations ?? 50;
    this.continueAfterTools = config.continueAfterTools ?? true;

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

    // Initialize Context Management integration if enabled (T403)
    if (config.contextManagement?.enabled) {
      this.contextIntegration = createContextIntegrationFromLoopConfig(
        config.model,
        config.contextManagement,
        this.logger
      );
      this.logger?.debug("Context management integration initialized", {
        model: config.model,
        enabled: true,
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
   * Manually compact/condense the context (T403).
   *
   * This can be triggered via /condense command to force context
   * window optimization without waiting for automatic triggers.
   *
   * @returns Result of the context management operation, or null if not enabled
   */
  async compactContext(): Promise<ContextManageResult | null> {
    if (!this.contextIntegration?.enabled) {
      this.logger?.debug("Context compaction requested but context management is disabled");
      return null;
    }

    this.logger?.debug("Manual context compaction requested", {
      currentMessageCount: this.messages.length,
    });

    const result = await this.contextIntegration.beforeApiCall(this.messages);

    if (result.modified) {
      // Update internal messages with compacted version
      this.messages = result.messages;
      this.emit("contextManaged", result);

      this.logger?.info("Context compacted successfully", {
        originalCount: this.messages.length + (result.messages.length - this.messages.length),
        newCount: result.messages.length,
        state: result.state,
        actions: result.actions,
      });
    } else {
      this.logger?.debug("Context compaction: no changes needed", {
        state: result.state,
      });
    }

    return result;
  }

  /**
   * Get the current context state (T403).
   *
   * @returns Current context state or null if context management is disabled
   */
  getContextState(): import("../context/types.js").ContextState | null {
    return this.contextIntegration?.getState() ?? null;
  }

  /**
   * Check if context management is enabled (T403).
   *
   * @returns true if context management is enabled and active
   */
  isContextManagementEnabled(): boolean {
    return this.contextIntegration?.enabled ?? false;
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
   * Get tools filtered by current coding mode (T057).
   *
   * If a ModeManager is configured, filters the available tools
   * to only those allowed for the current mode.
   * Falls back to all configured tools if no ModeManager.
   *
   * @returns Filtered tool definitions for current mode
   */
  private getFilteredTools(): ToolDefinition[] | undefined {
    // No tools configured, return undefined
    if (!this.config.tools) {
      return undefined;
    }

    // No ModeManager, return all tools (backward compatibility)
    if (!this.modeManager) {
      return this.config.tools;
    }

    // Get current mode and allowed tools
    const currentMode = this.modeManager.getCurrentMode();
    const interactive = this.config.interactive ?? false;
    const allowedToolNames = new Set(getToolsForMode(currentMode, { interactive }));

    // Filter tools by allowed names and session capabilities
    const filtered = this.config.tools.filter((tool) => {
      if (!allowedToolNames.has(tool.name)) {
        return false;
      }

      if (tool.name === "attempt_completion") {
        return false;
      }

      return true;
    });

    // Log if tools were filtered
    if (filtered.length !== this.config.tools.length) {
      this.logger?.debug("Tools filtered by mode", {
        mode: currentMode,
        totalTools: this.config.tools.length,
        allowedTools: filtered.length,
        filteredOut: this.config.tools.length - filtered.length,
      });
    }

    return filtered;
  }

  /**
   * Get the effective thinking configuration for LLM calls.
   *
   * Uses the dynamic `getThinkingConfig` callback if provided,
   * falling back to the static `thinking` config.
   *
   * This enables runtime toggling of thinking mode via /think command,
   * merging global state with mode's extendedThinking setting.
   *
   * @returns Effective thinking config for LLM.stream()
   * @private
   */
  private getEffectiveThinkingConfig():
    | {
        enabled: boolean;
        budgetTokens?: number;
      }
    | undefined {
    // Use dynamic getter if provided (enables runtime /think toggling)
    if (this.config.getThinkingConfig) {
      const modeExtendedThinking = this.config.mode.extendedThinking;
      return this.config.getThinkingConfig(modeExtendedThinking);
    }

    // Fall back to static config
    return this.config.thinking;
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
    // GAP 2 FIX: Reset completion state as well
    this.completionAttempted = false;
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
      // No promptBuilder provided - use mode prompt as base
      systemPrompt = this.config.mode.prompt ?? "";
      this.logger?.debug("Using mode prompt as system prompt (no PromptBuilder)", {
        promptSize: systemPrompt.length,
      });
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
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Core stream processing with many event types
  private async processStreamResponse(
    stream: AsyncIterable<StreamEvent>,
    pendingToolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }>
  ): Promise<void> {
    if (this.useStreamProcessor && this.streamProcessor) {
      const wrappedStream = this.wrapStreamForProcessor(stream);
      const result = await this.streamProcessor.processStream(wrappedStream);

      if (result.ok) {
        const hasTextPart = result.value.parts.some(
          (part) => part.type === "text" && part.content.trim().length > 0
        );
        const hasThinkingPart = result.value.parts.some(
          (part) => part.type === "reasoning" && part.content.trim().length > 0
        );

        if (hasTextPart) {
          this.streamHasText = true;
        }
        if (hasThinkingPart) {
          this.streamHasThinking = true;
        }

        for (const part of result.value.parts) {
          if (part.type === "tool") {
            this.streamHasToolCalls = true;
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
   * - The LLM returns a text-only response (no tool calls)
   * - Maximum iterations reached
   * - User cancels the operation
   * - An unrecoverable error occurs
   * - Permission is blocked
   *
   * (T058) Implements agentic auto-continuation:
   * After tool execution, the loop automatically re-invokes the LLM
   * to continue reasoning until a natural stopping point.
   *
   * Integrates with Logger (T041) and TelemetryInstrumentor (T042).
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Main agent loop with many state transitions and error handling paths
  async run(): Promise<void> {
    // Check for cancellation before starting
    if (this.cancellation.isCancelled) {
      this.logger?.debug("Run cancelled before start");
      this.transitionTo("terminated");
      return;
    }

    // Reset stream state for this run
    this.streamHasText = false;
    this.streamHasThinking = false;
    this.streamHasToolCalls = false;
    this.accumulatedText = "";
    this.accumulatedReasoning = "";

    // Check max iterations limit (T058)
    if (this.iterationCount >= this.maxIterations) {
      this.logger?.warn("Max iterations reached, stopping agentic loop", {
        iterations: this.iterationCount,
        maxIterations: this.maxIterations,
      });
      this.emit("maxIterationsReached", this.iterationCount, this.maxIterations);
      this.emit("terminated", TerminationReason.MAX_STEPS, {
        shouldTerminate: true,
        reason: TerminationReason.MAX_STEPS,
        metadata: {
          stepsExecuted: this.iterationCount,
          context: { limit: this.maxIterations },
        },
      });
      this.transitionTo("idle");
      this.emit("complete");
      return;
    }

    // Increment iteration count (T058)
    this.iterationCount++;
    this.emit("iterationStart", this.iterationCount, this.maxIterations);

    this.logger?.debug("Starting agentic loop iteration", {
      iteration: this.iterationCount,
      maxIterations: this.maxIterations,
    });

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
      iteration: this.iterationCount,
    });

    try {
      const systemPrompt = await this.buildSystemPromptForRun();

      // Create abort controller for this stream
      this.abortController = new AbortController();
      this.cancellation.onCancel(() => this.abortController?.abort());

      // Apply context management before converting to provider format (T403)
      let messagesToSend = this.messages;
      if (this.contextIntegration?.enabled) {
        const contextResult = await this.contextIntegration.beforeApiCall(this.messages);
        if (contextResult.modified) {
          messagesToSend = contextResult.messages;
          this.emit("contextManaged", contextResult);
          this.logger?.debug("Context management applied", {
            originalCount: this.messages.length,
            newCount: contextResult.messages.length,
            state: contextResult.state,
            actions: contextResult.actions,
          });
        }
      }

      // Convert session messages to provider format
      const providerMessages = toModelMessages(messagesToSend);

      // Get effective thinking config (dynamic if getter provided, static otherwise)
      const effectiveThinking = this.getEffectiveThinkingConfig();

      // Create base stream from LLM
      const baseStream = LLM.stream({
        providerType: this.config.providerType,
        model: this.config.model,
        messages: providerMessages,
        system: systemPrompt,
        tools: this.getFilteredTools(),
        thinking: effectiveThinking,
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

      if (
        !this.cancellation.isCancelled &&
        pendingToolCalls.length === 0 &&
        !this.streamHasText &&
        !this.streamHasToolCalls
      ) {
        const hasThinkingOnly = this.streamHasThinking;
        throw new VellumError(
          hasThinkingOnly
            ? "Model stream ended with only reasoning content."
            : "Model stream ended with no response text.",
          ErrorCode.LLM_INVALID_RESPONSE,
          {
            isRetryable: true,
            retryDelay: 1000,
            context: {
              provider: this.config.providerType,
              model: this.config.model,
              requestId: this.currentRequestId,
              hasThinkingOnly,
            },
          }
        );
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

      // GAP 3 & 4 FIX: Update termination flags based on stream result
      // Set hasTextOnly if we got a response with no tool calls
      if (pendingToolCalls.length === 0) {
        this.terminationContext.hasTextOnly = true;
      }
      // Set hasNaturalStop - the stream completed normally (done event received)
      // This flag indicates the LLM finished its turn without requesting more action
      this.terminationContext.hasNaturalStop = pendingToolCalls.length === 0;

      // Determine next state based on stream completion
      if (this.cancellation.isCancelled) {
        this.transitionTo("terminated");
      } else if (pendingToolCalls.length > 0) {
        this.transitionTo("tool_executing");
        await this.executeToolCalls(pendingToolCalls);
      } else {
        // Pure text response - add assistant message to history
        const assistantParts: import("../session/index.js").SessionMessagePart[] = [];
        if (this.accumulatedReasoning.trim()) {
          assistantParts.push(SessionParts.reasoning(this.accumulatedReasoning));
        }
        if (this.accumulatedText.trim()) {
          assistantParts.push(SessionParts.text(this.accumulatedText));
        }
        if (assistantParts.length > 0) {
          const assistantMessage = createAssistantMessage(assistantParts, {
            model: this.config.model,
            provider: this.config.providerType,
          });
          this.messages.push(assistantMessage);
        }
        // Reset accumulators
        this.accumulatedText = "";
        this.accumulatedReasoning = "";

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
   * Resets iteration counter (T058).
   * Call this when starting a fresh agentic session.
   */
  resetIterationCount(): void {
    this.iterationCount = 0;
  }

  /**
   * Gets current iteration count (T058).
   */
  getIterationCount(): number {
    return this.iterationCount;
  }

  /**
   * Gets the maximum iterations setting (T058).
   */
  getMaxIterations(): number {
    return this.maxIterations;
  }

  /**
   * Execute pending tool calls (T014) with auto-continuation (T058).
   *
   * Executes all pending tool calls, collects results, adds them to message
   * history, and automatically re-invokes the LLM if configured.
   *
   * @param toolCalls - Array of tool calls from LLM
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Tool execution requires multiple permission checks, error handling branches, state transitions, and agentic continuation logic
  private async executeToolCalls(
    toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }>
  ): Promise<void> {
    // Collect tool results for adding to message history (T058)
    const toolResults: Array<{
      id: string;
      name: string;
      result: string;
      isError: boolean;
    }> = [];

    // Track if any permission was blocked (stops continuation)
    let permissionBlocked = false;

    for (const call of toolCalls) {
      // Check for cancellation between tool calls
      if (this.cancellation.isCancelled) {
        break;
      }

      // Check for unknown tool marker from repairToolCall
      if (call.name.startsWith("__unknown_")) {
        const originalName = call.name.replace(/^__unknown_|__$/g, "");
        const error = `LLM requested unknown tool: ${originalName}`;
        this.emit("error", new VellumError(error, ErrorCode.TOOL_NOT_FOUND));
        this.emit("toolEnd", call.id, call.name, {
          result: { success: false, error },
          timing: { startedAt: Date.now(), completedAt: Date.now(), durationMs: 0 },
          toolName: call.name,
          callId: call.id,
        });
        toolResults.push({ id: call.id, name: call.name, result: error, isError: true });
        continue;
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
          toolResults.push({ id: call.id, name: call.name, result: error, isError: true });
          continue; // Skip to next tool call
        }
      }

      // Create tool context
      const toolContext = this.createToolContext(call.id);

      try {
        // Tool not found
        if (!this.toolExecutor.getTool(call.name)) {
          const error = `Tool not found: ${call.name}`;
          this.emit("error", new ToolNotFoundError(call.name));
          this.emit("toolEnd", call.id, call.name, {
            result: { success: false, error },
            timing: { startedAt: Date.now(), completedAt: Date.now(), durationMs: 0 },
            toolName: call.name,
            callId: call.id,
          });
          toolResults.push({ id: call.id, name: call.name, result: error, isError: true });
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
          toolResults.push({ id: call.id, name: call.name, result: error, isError: true });
          continue;
        }

        if (permission === "ask") {
          // Handle wait_permission state (T015)
          // Note: Permission blocking stops auto-continuation
          permissionBlocked = true;
          await this.handlePermissionRequired(call.id, call.name, call.input);
          continue;
        }

        // Permission allowed - now we can emit toolStart and execute
        this.emit("toolStart", call.id, call.name, call.input);
        const executionResult = await this.toolExecutor.execute(call.name, call.input, toolContext);
        this.emit("toolEnd", call.id, call.name, executionResult);

        // Process tool result through unified signal dispatcher (GAP 1, 2, 5 fix)
        let resultContent: string;
        if (executionResult.result.success) {
          const output = executionResult.result.output;
          // Use unified signal dispatcher to handle all signal types
          resultContent = await this.processToolResultSignals(output, call.id, call.name);
        } else {
          resultContent = executionResult.result.error ?? "Unknown error";
        }

        toolResults.push({
          id: call.id,
          name: call.name,
          result: resultContent,
          isError: !executionResult.result.success,
        });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));

        if (err instanceof PermissionDeniedError) {
          this.emit("permissionDenied", call.id, call.name, err.message);
          permissionBlocked = true;
        }

        if (err instanceof ToolNotFoundError) {
          this.emit("error", err);
          this.emit("toolEnd", call.id, call.name, {
            result: { success: false, error: err.message },
            timing: { startedAt: Date.now(), completedAt: Date.now(), durationMs: 0 },
            toolName: call.name,
            callId: call.id,
          });
          toolResults.push({ id: call.id, name: call.name, result: err.message, isError: true });
          continue;
        }

        this.emit("error", err);
        this.emit("toolEnd", call.id, call.name, {
          result: { success: false, error: err.message },
          timing: { startedAt: Date.now(), completedAt: Date.now(), durationMs: 0 },
          toolName: call.name,
          callId: call.id,
        });
        toolResults.push({ id: call.id, name: call.name, result: err.message, isError: true });
      }
    }

    // After all tools executed, handle state transition and auto-continuation (T058)
    if (this.cancellation.isCancelled) {
      this.transitionTo("terminated");
      this.emit("complete");
      return;
    }

    // Add assistant message with tool calls to history (T058)
    const assistantParts = toolCalls.map((call) =>
      SessionParts.tool(call.id, call.name, call.input)
    );
    const assistantMessage = createAssistantMessage(assistantParts, {
      model: this.config.model,
      provider: this.config.providerType,
    });
    this.messages.push(assistantMessage);

    // Add tool results to message history (T058)
    for (const toolResult of toolResults) {
      const resultMessage = createToolResultMessage(
        toolResult.id,
        toolResult.result,
        toolResult.isError
      );
      this.messages.push(resultMessage);
    }

    // Check if we should auto-continue (T058)
    // GAP 2 FIX: Don't continue if completion was attempted
    if (
      this.continueAfterTools &&
      !permissionBlocked &&
      !this.completionAttempted &&
      toolResults.length > 0 &&
      this.iterationCount < this.maxIterations &&
      this.state === "tool_executing"
    ) {
      this.logger?.debug("Auto-continuing agentic loop after tool execution", {
        iteration: this.iterationCount,
        maxIterations: this.maxIterations,
        toolCallCount: toolResults.length,
      });

      this.emit("iterationContinue", this.iterationCount, toolResults.length);

      // Transition back to idle before next run (state machine requirement)
      this.transitionTo("idle");

      // Auto-continue: re-invoke the LLM to continue reasoning
      await this.run();
      return;
    }

    // No continuation - complete the loop
    if (this.state === "tool_executing") {
      this.transitionTo("idle");
    }
    this.emit("complete");
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
   * Handle delegation signal from delegate_agent tool (GAP 1 fix - T059).
   *
   * Detects if the tool output contains a DelegateAgentSignal and spawns
   * a subagent through the orchestrator. Pipes subagent events back to parent.
   *
   * @param output - Tool execution output to check for delegation signal
   * @param callId - Original tool call ID for tracking
   * @param toolName - Name of the tool that returned the signal
   * @returns Subagent result string if delegation occurred, null otherwise
   */
  private async handleDelegationSignal(
    output: unknown,
    _callId: string,
    _toolName: string
  ): Promise<string | null> {
    // Check if output is a delegation signal
    if (!this.isDelegateAgentSignal(output)) {
      return null;
    }

    const signal = this.extractDelegationSignal(output);
    const agent = signal.task.split(" ")[0] ?? "subagent"; // Extract agent hint from task

    // Emit delegation start event
    this.emit("delegationStart", signal.delegationId, agent, signal.task);

    this.logger?.debug("Delegation signal detected", {
      delegationId: signal.delegationId,
      task: signal.task,
      model: signal.model,
      maxTurns: signal.maxTurns,
    });

    // Check if orchestrator is available for spawning subagents
    if (!this.config.orchestrator) {
      this.logger?.warn("Delegation requested but no orchestrator configured", {
        delegationId: signal.delegationId,
      });
      // Return the signal message as-is when no orchestrator
      return `Delegation requested (ID: ${signal.delegationId}) but no orchestrator available to spawn subagent. Task: ${signal.task}`;
    }

    try {
      // Spawn subagent through orchestrator
      const handle = await this.spawnSubagentWithEvents(signal, agent);

      // Wait for subagent completion
      await this.waitForSubagentCompletion(handle, signal.delegationId, agent);

      // Emit delegation complete event
      const result = `Subagent ${agent} completed task: ${signal.task}`;
      this.emit("delegationComplete", signal.delegationId, agent, result);

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger?.error("Subagent delegation failed", {
        delegationId: signal.delegationId,
        error: errorMessage,
      });

      this.emit(
        "delegationComplete",
        signal.delegationId,
        agent,
        `Delegation failed: ${errorMessage}`
      );

      return `Delegation failed: ${errorMessage}`;
    }
  }

  /**
   * Type guard to check if output is a DelegateAgentSignal.
   */
  private isDelegateAgentSignal(output: unknown): output is DelegateAgentSignal {
    if (!output || typeof output !== "object") {
      return false;
    }

    // Check for signal wrapper pattern from delegate_agent tool
    const maybeWrapper = output as { signal?: unknown; message?: string };
    if (maybeWrapper.signal && typeof maybeWrapper.signal === "object") {
      const signal = maybeWrapper.signal as Record<string, unknown>;
      return signal.type === "delegate_agent" && typeof signal.task === "string";
    }

    // Check for direct signal pattern
    const maybeSignal = output as Record<string, unknown>;
    return maybeSignal.type === "delegate_agent" && typeof maybeSignal.task === "string";
  }

  /**
   * Extract the actual signal from the tool output.
   */
  private extractDelegationSignal(output: unknown): DelegateAgentSignal {
    const maybeWrapper = output as { signal?: DelegateAgentSignal };
    if (maybeWrapper.signal) {
      return maybeWrapper.signal;
    }
    return output as DelegateAgentSignal;
  }

  // ============================================
  // GAP 1 FIX: UserPromptSignal Handling
  // ============================================

  /**
   * Type guard to check if output is a UserPromptSignal (from ask_followup_question).
   * The signal is embedded in the output as _prompt field.
   */
  private isUserPromptSignal(output: unknown): output is { _prompt: UserPromptSignal } {
    if (!output || typeof output !== "object") {
      return false;
    }

    const maybeSignal = output as { _prompt?: unknown };
    if (!maybeSignal._prompt || typeof maybeSignal._prompt !== "object") {
      return false;
    }

    const prompt = maybeSignal._prompt as Record<string, unknown>;
    return prompt.type === "user_prompt" && typeof prompt.question === "string";
  }

  /**
   * Handle UserPromptSignal from ask_followup_question tool.
   * Emits event for TUI/CLI and waits for user response.
   *
   * @param output - The tool output containing the signal
   * @returns Promise resolving to user's response
   */
  private async handleUserPromptSignal(output: { _prompt: UserPromptSignal }): Promise<string> {
    const prompt = output._prompt;

    this.logger?.debug("User prompt signal detected", {
      question: prompt.question,
      hasSuggestions: !!prompt.suggestions?.length,
    });

    // Emit event for TUI/CLI to handle
    this.emit("userPrompt:required", {
      question: prompt.question,
      suggestions: prompt.suggestions,
    });

    // Wait for user response via event
    const userResponse = await this.waitForUserInput(prompt.question, prompt.suggestions);

    return userResponse;
  }

  /**
   * Wait for user input via event-based communication.
   * TUI/CLI should emit 'userPrompt:response' with the user's answer.
   *
   * @param question - The question being asked
   * @param suggestions - Optional suggestions
   * @returns Promise resolving to user's response
   */
  private waitForUserInput(_question: string, _suggestions?: string[]): Promise<string> {
    return new Promise((resolve) => {
      this.pendingUserPrompt = {
        question: _question,
        suggestions: _suggestions,
        resolve,
      };

      // Listen for user response
      this.once("userPrompt:response", (response: string) => {
        this.pendingUserPrompt = null;
        resolve(response);
      });
    });
  }

  /**
   * Submit a user response to a pending prompt.
   * Call this from TUI/CLI when user provides input.
   *
   * @param response - The user's response text
   */
  submitUserResponse(response: string): void {
    if (this.pendingUserPrompt) {
      this.pendingUserPrompt.resolve(response);
      this.pendingUserPrompt = null;
    } else {
      // Also emit the event for listeners
      this.emit("userPrompt:response", response);
    }
  }

  /**
   * Check if there's a pending user prompt.
   */
  hasPendingUserPrompt(): boolean {
    return this.pendingUserPrompt !== null;
  }

  /**
   * Get the pending user prompt details.
   */
  getPendingUserPrompt(): { question: string; suggestions?: string[] } | null {
    if (!this.pendingUserPrompt) {
      return null;
    }
    return {
      question: this.pendingUserPrompt.question,
      suggestions: this.pendingUserPrompt.suggestions,
    };
  }

  // ============================================
  // GAP 2 FIX: Completion Signal Handling
  // ============================================

  /**
   * Type guard to check if output is a completion signal (from attempt_completion).
   */
  private isCompletionSignal(output: unknown): output is AttemptCompletionOutput {
    if (!output || typeof output !== "object") {
      return false;
    }

    const maybeCompletion = output as Record<string, unknown>;
    return maybeCompletion.completed === true && typeof maybeCompletion.result === "string";
  }

  /**
   * Handle completion signal from attempt_completion tool.
   * Sets termination flags and emits event.
   *
   * @param output - The completion signal output
   */
  private handleCompletionSignal(output: AttemptCompletionOutput): void {
    this.logger?.debug("Completion signal detected", {
      result: output.result,
      verified: output.verified,
      verificationPassed: output.verificationPassed,
    });

    // Set completion flag - this will prevent auto-continuation
    this.completionAttempted = true;

    // Set termination flags for the termination checker
    this.terminationContext.hasNaturalStop = true;

    // Emit event for TUI/CLI to display completion
    this.emit("completion:attempted", {
      result: output.result,
      verified: output.verified,
      verificationPassed: output.verificationPassed,
    });
  }

  /**
   * Check if completion was attempted in this session.
   */
  isCompletionAttempted(): boolean {
    return this.completionAttempted;
  }

  /**
   * Reset completion state (for new tasks in same session).
   */
  resetCompletionState(): void {
    this.completionAttempted = false;
  }

  // ============================================
  // GAP 5 FIX: Unified Signal Dispatcher
  // ============================================

  /**
   * Process tool result and handle any embedded signals.
   * This is the unified entry point for all signal handling.
   *
   * Signal priority:
   * 1. Delegation signal (delegate_agent) - spawns subagent
   * 2. User prompt signal (ask_followup_question) - waits for user
   * 3. Completion signal (attempt_completion) - marks task complete
   * 4. Default - stringify and return
   *
   * @param output - The tool execution output
   * @param callId - The tool call ID
   * @param toolName - The tool name
   * @returns Processed result string
   */
  private async processToolResultSignals(
    output: unknown,
    callId: string,
    toolName: string
  ): Promise<string> {
    // 1. Check for delegation signal (handled first as it spawns subagent)
    const delegationResult = await this.handleDelegationSignal(output, callId, toolName);
    if (delegationResult !== null) {
      return delegationResult;
    }

    // 2. Check for user prompt signal
    if (this.isUserPromptSignal(output)) {
      return await this.handleUserPromptSignal(output);
    }

    // 3. Check for completion signal
    if (this.isCompletionSignal(output)) {
      this.handleCompletionSignal(output);
      return output.result;
    }

    // 4. Default: stringify and return
    return typeof output === "string" ? output : JSON.stringify(output);
  }

  /**
   * Spawn subagent and wire up event forwarding (GAP 2 fix - T059).
   *
   * @param signal - Delegation signal with task details
   * @param agentSlug - Agent slug to spawn
   * @returns Subagent handle
   */
  private async spawnSubagentWithEvents(
    signal: DelegateAgentSignal,
    agentSlug: string
  ): Promise<SubagentHandle> {
    const orchestrator = this.config.orchestrator;
    if (!orchestrator) {
      throw new Error("Orchestrator not configured for delegation");
    }

    // Spawn the subagent
    const handle = await orchestrator.spawnSubagent(agentSlug, signal.task, {
      timeout: signal.maxTurns ? signal.maxTurns * 60000 : undefined, // Convert turns to rough timeout
    });

    this.logger?.debug("Subagent spawned", {
      delegationId: signal.delegationId,
      handleId: handle.id,
      agentSlug: handle.agentSlug,
      taskId: handle.taskId,
    });

    return handle;
  }

  /**
   * Wait for subagent completion and forward events (GAP 2 fix - T059).
   *
   * @param handle - Subagent handle to wait on
   * @param delegationId - Delegation ID for event correlation
   * @param agent - Agent name for event attribution
   */
  private async waitForSubagentCompletion(
    handle: SubagentHandle,
    delegationId: string,
    agent: string
  ): Promise<void> {
    // For now, poll the handle status until complete
    // In a full implementation, this would use proper event subscription
    const pollInterval = 1000; // 1 second
    const maxWaitTime = 300000; // 5 minutes default
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      if (this.cancellation.isCancelled) {
        throw new Error("Delegation cancelled");
      }

      // Check handle status
      if (handle.status === "completed") {
        return;
      }

      if (handle.status === "failed" || handle.status === "cancelled") {
        throw new Error(`Subagent ${handle.status}: ${handle.agentSlug}`);
      }

      // Emit periodic progress for UI
      this.emit("subagentTool", delegationId, agent, "processing...");

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error("Subagent execution timed out");
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
      case "text": {
        const textContent = event.content ?? (event as { text?: string }).text ?? "";
        if (textContent.trim().length > 0) {
          this.streamHasText = true;
        }
        // Accumulate text for message history
        this.accumulatedText += textContent;
        // Emit text delta
        this.emit("text", textContent);
        break;
      }

      case "reasoning": {
        const thinkingContent = event.content ?? (event as { text?: string }).text ?? "";
        if (thinkingContent.trim().length > 0) {
          this.streamHasThinking = true;
        }
        // Accumulate reasoning for message history
        this.accumulatedReasoning += thinkingContent;
        // Emit thinking/reasoning delta
        this.emit("thinking", thinkingContent);
        break;
      }

      case "toolCall":
        this.streamHasToolCalls = true;
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
        // Emit usage statistics (including thinkingTokens for extended thinking models)
        this.emit("usage", {
          inputTokens: event.inputTokens,
          outputTokens: event.outputTokens,
          thinkingTokens: event.thinkingTokens,
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

        if (event.type === "error") {
          yield {
            ok: false as const,
            error: new Error(`[${event.code}] ${event.message}`),
          };
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
        return {
          type: "text",
          content: event.content ?? (event as { text?: string }).text ?? "",
        };

      case "reasoning":
        return {
          type: "reasoning",
          content: event.content ?? (event as { text?: string }).text ?? "",
        };

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
