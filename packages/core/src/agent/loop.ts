// ============================================
// Agent Loop Core
// ============================================

import { EventEmitter } from "node:events";
import type { StreamEvent, ToolDefinition } from "@vellum/provider";
import type { TokenUsage } from "@vellum/shared";
import type { OrchestratorCore, SubagentHandle } from "../agents/orchestrator/core.js";
import type { SubsessionManager } from "../agents/session/subsession-manager.js";
import type { UserPromptSignal } from "../builtin/ask-followup.js";
import type { AttemptCompletionOutput } from "../builtin/attempt-completion.js";
import type { DelegateAgentSignal } from "../builtin/delegate-agent.js";
import { SessionAgentsIntegration } from "../context/agents/session-integration.js";
import type { CostService } from "../cost/service.js";
import type { CostLimitsConfig } from "../cost/types-limits.js";
import { ErrorCode, VellumError } from "../errors/index.js";
import type { LLMLogger } from "../logger/llm-logger.js";
import type { Logger } from "../logger/logger.js";
import { DefaultPermissionChecker } from "../permission/checker.js";
import type { TrustPreset } from "../permission/types.js";
import type { PromptBuilder } from "../prompts/prompt-builder.js";
import {
  createAssistantMessage,
  createToolResultMessage,
  LLM,
  type LLMStreamEvent,
  type SessionMessage,
  type SessionMessageMetadata,
  SessionParts,
  toModelMessages,
} from "../session/index.js";
import { RetryAbortedError } from "../session/retry.js";
import type { SkillManager, SkillManagerOptions } from "../skill/manager.js";
import type { SkillConfig, SkillLoaded } from "../skill/types.js";
import { PauseSignal } from "../streaming/pause-signal.js";
import {
  StreamProcessor,
  type StreamProcessorConfig,
  type StreamProcessorHooks,
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
import type { ToolContext } from "../types/tool.js";
import { CancellationToken } from "./cancellation.js";
import {
  type ContextIntegration,
  type ContextManageResult,
  type ContextManagerConfig,
  createContextIntegrationFromLoopConfig,
} from "./context-integration.js";
import { AgentContextManager } from "./context-manager.js";
import type { CostLimitIntegration } from "./cost-limit-integration.js";
import { AgentCostManager } from "./cost-manager.js";
import type { AgentLevel } from "./level.js";
import type { LLMLoopVerifier } from "./llm-loop-verifier.js";
import type { CombinedLoopResult } from "./loop-detection.js";
import type { ModeConfig } from "./modes.js";
import { fromPromptBuilder } from "./prompt.js";
import { AgentRetryManager } from "./retry-manager.js";
import { AgentSkillsIntegration } from "./skills-integration.js";
import type { AgentState, StateContext } from "./state.js";
import { createStateContext, isValidTransition } from "./state.js";
import { AgentStreamHandler } from "./stream-handler.js";
import type {
  StreamingLoopConfig,
  StreamingLoopDetector,
  StreamingLoopResult,
} from "./streaming-loop-detector.js";
import {
  type TerminationChecker,
  type TerminationContext,
  type TerminationLimits,
  TerminationReason,
  type TerminationResult,
} from "./termination.js";
import { AgentTerminationManager } from "./termination-manager.js";

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
  /**
   * Cost limits configuration for guardrails (Phase 35+).
   * When configured, tracks cost/requests and can pause for approval.
   */
  costLimits?: CostLimitsConfig;
  /**
   * CostService instance for cost tracking (Phase 35+).
   * Required if costLimits is configured.
   */
  costService?: CostService;
  /**
   * Enable parallel tool execution (T075).
   * When true, multiple tool calls are executed concurrently.
   * Note: Tools requiring user permission (ask) will still block.
   * @default false
   */
  parallelToolExecution?: boolean;
  /**
   * Maximum number of tools to execute concurrently (T075).
   * Only applies when parallelToolExecution is true.
   * @default 5
   */
  maxToolConcurrency?: number;
  /**
   * LLM-based loop verification configuration (T041).
   * When enabled, uses an LLM to verify borderline loop detections.
   */
  llmLoopVerification?: {
    /**
     * Enable LLM-based loop verification.
     * @default false
     */
    enabled: boolean;
    /**
     * Confidence threshold for trusting LLM verification results.
     * @default 0.9
     */
    confidenceThreshold?: number;
    /**
     * Number of turns between LLM verification checks.
     * @default 30
     */
    checkIntervalTurns?: number;
    /**
     * Maximum messages to include in verification analysis.
     * @default 20
     */
    maxHistoryMessages?: number;
  };
  /**
   * Streaming loop detection configuration.
   * Detects loops during streaming, not just after turn completion.
   */
  streamingLoopDetection?: {
    /**
     * Enable streaming loop detection.
     * @default false
     */
    enabled: boolean;
    /**
     * Configuration options for the streaming loop detector.
     */
    config?: StreamingLoopConfig;
    /**
     * Interrupt the stream when a loop is detected.
     * When true, aborts the stream and adds partial response to history.
     * @default false
     */
    interruptOnDetection?: boolean;
  };
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
  /** Emitted when streaming loop detection finds a potential issue during streaming */
  "streaming:loopDetected": [result: StreamingLoopResult];
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
  /** Emitted when approaching a cost/request limit (Phase 35+) */
  "cost:warning": [
    event: { type: "cost" | "requests"; current: number; limit: number; percentUsed: number },
  ];
  /** Emitted when a cost/request limit is reached (Phase 35+) */
  "cost:limitReached": [
    event: { type: "cost" | "requests"; current: number; limit: number; requiresApproval: boolean },
  ];
  /** Emitted when awaiting user approval to continue past limit (Phase 35+) */
  "cost:awaitingApproval": [
    limits: {
      costUsed: number;
      costLimit?: number;
      requestsUsed: number;
      requestLimit?: number;
      percentUsed: number;
    },
  ];
  /** Emitted when auto-approval status changes (Phase 35+) */
  "autoApproval:statusChange": [
    status: {
      consecutiveRequests: number;
      requestLimit: number;
      consecutiveCost: number;
      costLimit: number;
      requestPercentUsed: number;
      costPercentUsed: number;
      limitReached: boolean;
      limitType?: "requests" | "cost";
    },
  ];
}

/**
 * Result of a single tool call execution (T075).
 * @internal
 */
interface SingleToolCallResult {
  id: string;
  name: string;
  result: string;
  isError: boolean;
  permissionBlocked: boolean;
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
  private lastTurnUsage: TokenUsage | null = null;

  /** Tool executor instance (T014) */
  private readonly toolExecutor: ToolExecutor;

  /** Pending tool calls awaiting permission (T015) */
  private pendingPermission: {
    callId: string;
    name: string;
    input: Record<string, unknown>;
    resolve: (granted: boolean) => void;
  } | null = null;

  /** Termination manager for loop detection and termination logic (Step 5 refactor) */
  private readonly terminationManager: AgentTerminationManager;

  /** Retry manager for error handling and backoff (Step 6 refactor) */
  private readonly retryManager: AgentRetryManager;

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

  /** Skills integration for loading, matching, and prompt building (T053) */
  private readonly skillsIntegration: AgentSkillsIntegration;

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

  /** Stream handler for processing LLM streams (Step 7 refactor) */
  private readonly streamHandler: AgentStreamHandler;

  /** Pause signal for controlling stream flow */
  private readonly pauseSignal: PauseSignal;

  /** Flag to signal completion was attempted (GAP 2 fix) */
  private completionAttempted = false;

  /** Maximum iterations allowed for the agentic loop (T058) */
  private readonly maxIterations: number;

  /** Whether to continue after tool execution (T058) */
  private readonly continueAfterTools: boolean;

  /** Context integration for automatic context management (T403) */
  private contextIntegration?: ContextIntegration;

  /** Context manager for public context operations (T403) */
  private readonly contextManager: AgentContextManager;

  /** Cost manager for guardrails (Phase 35+) */
  private readonly costManager: AgentCostManager;

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

    // Initialize termination manager (Step 5 refactor - extracted from AgentLoop)
    this.terminationManager = new AgentTerminationManager(
      {
        terminationLimits: config.terminationLimits,
        llmLoopVerification: config.llmLoopVerification,
        streamingLoopDetection: config.streamingLoopDetection,
      },
      {
        logger: this.logger,
        getMessages: () => this.messages,
        isCancelled: () => this.cancellation.isCancelled,
        emitTerminated: (reason, result) => this.emit("terminated", reason, result),
        emitLoopDetected: (result) => this.emit("loopDetected", result),
        emitStreamingLoopDetected: (result) => this.emit("streaming:loopDetected", result),
      }
    );

    // Initialize retry manager (Step 6 refactor - extracted from AgentLoop)
    this.retryManager = new AgentRetryManager({
      config: {
        maxRetries: config.maxRetries ?? 3,
        baseDelayMs: 1000,
        maxDelayMs: 30000,
      },
      logger: this.logger,
      getCancellationToken: () => this.cancellation,
      emitRetryAttempt: (attempt, error, delay) => this.emit("retry", attempt, error, delay),
      emitRetryExhausted: (error, attempts) => this.emit("retryExhausted", error, attempts),
    });

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
      // Note: UI events are handled by streamHandler.handleUiEvent()
    }

    // Initialize pause signal for stream flow control
    this.pauseSignal = new PauseSignal();

    // Initialize stream handler (Step 7 refactor - extracted from AgentLoop)
    this.streamHandler = new AgentStreamHandler(
      { useStreamProcessor: this.useStreamProcessor },
      {
        streamProcessor: this.streamProcessor,
        logger: this.logger,
        isCancelled: () => this.cancellation.isCancelled,
        isPaused: () => this.pauseSignal.isPaused(),
        waitForResume: () => this.pauseSignal.waitIfPaused(),
        emitText: (text) => this.emit("text", text),
        emitThinking: (text) => this.emit("thinking", text),
        emitToolCall: (id, name, input) => this.emit("toolCall", id, name, input),
        emitError: (err) => this.emit("error", err),
        recordUsage: (usage) => this.recordUsage(usage),
        checkStreamingLoop: (event) => {
          const detector = this.terminationManager.getStreamingLoopDetector();
          if (!detector) return { detected: false };
          const result = detector.addAndCheck(event);
          if (result.detected) {
            this.emit("streaming:loopDetected", result);
            this.logger?.warn("Streaming loop detected", {
              type: result.type,
              evidence: result.evidence,
              confidence: result.confidence,
            });
            return {
              detected: this.terminationManager.shouldInterruptOnStreamingLoop(),
              result,
            };
          }
          return { detected: false };
        },
      }
    );

    // Wire up StreamProcessor UI events to stream handler
    if (this.streamProcessor) {
      this.streamProcessor.setUiHandler((event) => this.streamHandler.handleUiEvent(event));
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

    // Initialize Skills System integration (T053)
    this.skillsIntegration = new AgentSkillsIntegration(
      {
        enabled: config.enableSkillsIntegration ?? false,
        cwd: config.cwd,
        skillManagerOptions: config.skillManagerOptions,
        skillConfig: config.skillConfig,
        providerType: config.providerType,
        model: config.model,
        modeName: config.mode?.name,
      },
      {
        logger: this.logger,
        getMessages: () => this.messages,
      }
    );

    // Initialize skills asynchronously if enabled
    if (config.enableSkillsIntegration && config.cwd) {
      this.skillsIntegration.initialize().catch((error) => {
        this.logger?.warn("Failed to initialize Skills System", { error });
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

    // Initialize context manager for public API (T403)
    this.contextManager = new AgentContextManager({
      contextIntegration: this.contextIntegration,
      logger: this.logger,
      getMessages: () => this.messages,
      setMessages: (messages) => {
        this.messages = messages;
      },
      emitContextManaged: (result) => this.emit("contextManaged", result),
    });

    // Initialize Cost Manager (Phase 35+)
    this.costManager = new AgentCostManager(
      {
        integrationConfig:
          config.costLimits && config.costService
            ? {
                costService: config.costService,
                limits: config.costLimits,
                providerType: config.providerType,
                model: config.model,
                logger: this.logger,
              }
            : undefined,
        logger: this.logger,
      },
      {
        onCostWarning: (event) => this.emit("cost:warning", event),
        onCostLimitReached: (event) => this.emit("cost:limitReached", event),
        onCostAwaitingApproval: (limits) => this.emit("cost:awaitingApproval", limits),
      }
    );

    // Note: LLM Loop Verifier is lazy-initialized when first needed
    // via setLLMLoopVerifier() method, as it requires an LLMProvider instance.
    // The config.llmLoopVerification settings are stored for later use.
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
   *
   * If this is a user message, resets auto-approval counters to ensure
   * the user stays engaged with the agent's actions (safety measure).
   */
  addMessage(message: SessionMessage): void {
    this.messages.push(message);

    // Reset auto-approval counters on user message for safety
    if (message.role === "user") {
      this.resetAutoApprovalCounters();
    }
  }

  /**
   * Resets auto-approval counters on user interaction.
   *
   * This is a safety measure to ensure the user stays engaged with
   * the agent's autonomous actions. Called automatically when a user
   * message is added.
   *
   * @example
   * ```typescript
   * // Manual reset (if needed)
   * loop.resetAutoApprovalCounters();
   * ```
   */
  resetAutoApprovalCounters(): void {
    const checker = this.config.permissionChecker;
    if (checker instanceof DefaultPermissionChecker) {
      const handler = checker.autoApprovalHandler;
      handler.resetOnUserMessage();

      // Emit status update
      const state = handler.getState();
      this.emit("autoApproval:statusChange", {
        consecutiveRequests: state.consecutiveRequests,
        requestLimit: state.requestLimit,
        consecutiveCost: state.consecutiveCost,
        costLimit: state.costLimit,
        requestPercentUsed: state.requestPercentUsed,
        costPercentUsed: state.costPercentUsed,
        limitReached: state.requestLimitReached || state.costLimitReached,
        limitType: state.requestLimitReached
          ? "requests"
          : state.costLimitReached
            ? "cost"
            : undefined,
      });

      this.logger?.debug("Auto-approval counters reset on user interaction", state);
    }
  }

  /**
   * Gets the current auto-approval status.
   *
   * @returns Auto-approval state or null if not using DefaultPermissionChecker
   */
  getAutoApprovalStatus(): import("../permission/auto-approval.js").AutoApprovalState | null {
    const checker = this.config.permissionChecker;
    if (checker instanceof DefaultPermissionChecker) {
      return checker.autoApprovalHandler.getState();
    }
    return null;
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
    return this.contextManager.compactContext();
  }

  /**
   * Get the current context state (T403).
   *
   * @returns Current context state or null if context management is disabled
   */
  getContextState(): import("../context/types.js").ContextState | null {
    return this.contextManager.getContextState();
  }

  /**
   * Check if context management is enabled (T403).
   *
   * @returns true if context management is enabled and active
   */
  isContextManagementEnabled(): boolean {
    return this.contextManager.isContextManagementEnabled();
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
   * Updates the termination context with new token usage (T021).
   * Delegates to TerminationManager.
   */
  updateTokenUsage(usage: TokenUsage): void {
    this.terminationManager.recordTokenUsage(usage);
  }

  private normalizeUsage(usage: TokenUsage): TokenUsage {
    const normalized: TokenUsage = {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
    };

    if (usage.thinkingTokens !== undefined) {
      normalized.thinkingTokens = usage.thinkingTokens;
    }
    if (usage.cacheReadTokens !== undefined) {
      normalized.cacheReadTokens = usage.cacheReadTokens;
    }
    if (usage.cacheWriteTokens !== undefined) {
      normalized.cacheWriteTokens = usage.cacheWriteTokens;
    }

    return normalized;
  }

  private recordUsage(rawUsage: TokenUsage): void {
    const usage = this.normalizeUsage(rawUsage);

    this.lastTurnUsage = usage;
    this.updateTokenUsage(usage);

    // Emit usage statistics (including thinkingTokens for extended thinking models)
    this.emit("usage", usage);

    // Track usage with cost manager (Phase 35+)
    this.costManager.trackUsage(usage);
  }

  private buildAssistantMetadata(): Partial<Omit<SessionMessageMetadata, "createdAt">> {
    const metadata: Partial<Omit<SessionMessageMetadata, "createdAt">> = {
      model: this.config.model,
      provider: this.config.providerType,
    };

    if (this.lastTurnUsage) {
      const tokens: NonNullable<SessionMessageMetadata["tokens"]> = {
        input: this.lastTurnUsage.inputTokens,
        output: this.lastTurnUsage.outputTokens,
      };

      if (this.lastTurnUsage.thinkingTokens !== undefined) {
        tokens.reasoning = this.lastTurnUsage.thinkingTokens;
      }
      if (this.lastTurnUsage.cacheReadTokens !== undefined) {
        tokens.cacheRead = this.lastTurnUsage.cacheReadTokens;
      }
      if (this.lastTurnUsage.cacheWriteTokens !== undefined) {
        tokens.cacheWrite = this.lastTurnUsage.cacheWriteTokens;
      }

      metadata.tokens = tokens;
    }

    return metadata;
  }

  /**
   * Records a tool call for loop detection (T021).
   * Delegates to TerminationManager.
   */
  recordToolCall(id: string, name: string, input: Record<string, unknown>): void {
    this.terminationManager.recordToolCall(id, name, input);
  }

  /**
   * Records tool execution for termination tracking.
   * Delegates to TerminationManager.
   */
  recordToolExecution(tool: { id: string; name: string; input: Record<string, unknown> }): void {
    this.terminationManager.recordToolExecution(tool);
  }

  /**
   * Records an LLM response for stuck detection (T021).
   * Delegates to TerminationManager.
   */
  recordResponse(text: string): void {
    this.terminationManager.recordResponse(text);
  }

  /**
   * Records a stuck state from an assistant message.
   * Delegates to TerminationManager.
   */
  recordStuckState(assistantMessage: string): void {
    this.terminationManager.recordStuckState(assistantMessage);
  }

  /**
   * Records token usage for loop detection.
   * Delegates to TerminationManager.
   */
  recordTokenUsage(tokens: TokenUsage): void {
    this.terminationManager.recordTokenUsage(tokens);
  }

  /**
   * Gets the last assistant token usage.
   * Delegates to TerminationManager.
   */
  getLastAssistantTokens(): TokenUsage | undefined {
    return this.terminationManager.getLastAssistantTokens();
  }

  /**
   * Gets the current loop state.
   * Delegates to TerminationManager.
   */
  getLoopState(): CombinedLoopResult | undefined {
    return this.terminationManager.getLoopState();
  }

  /**
   * Checks termination conditions and emits event if triggered (T021).
   * Delegates to TerminationManager.
   *
   * @returns TerminationResult indicating whether to terminate
   */
  checkTermination(): TerminationResult {
    return this.terminationManager.checkTermination();
  }

  /**
   * Synchronous termination check.
   * Delegates to TerminationManager.
   *
   * @returns TerminationResult indicating whether to terminate
   */
  checkTerminationSync(): TerminationResult {
    return this.terminationManager.checkTerminationSync();
  }

  /**
   * Async termination check with optional LLM verification.
   * Delegates to TerminationManager.
   *
   * @returns Promise resolving to TerminationResult
   */
  async checkTerminationWithVerification(): Promise<TerminationResult> {
    return this.terminationManager.checkTerminationWithVerification();
  }

  /**
   * Runs loop detection and emits event if detected (T021).
   * Delegates to TerminationManager.
   *
   * @returns CombinedLoopResult from loop detection
   */
  checkLoopDetection(): CombinedLoopResult {
    return this.terminationManager.checkLoopDetection();
  }

  /**
   * Runs enhanced loop detection with LLM verification for borderline cases (T041).
   * Delegates to TerminationManager.
   *
   * @returns Promise resolving to CombinedLoopResult with optional LLM verification
   */
  async checkLoopDetectionAsync(): Promise<CombinedLoopResult> {
    return this.terminationManager.checkLoopDetectionAsync();
  }

  /**
   * Sets the LLM loop verifier instance for borderline case verification (T041).
   * Delegates to TerminationManager.
   *
   * @param verifier - LLMLoopVerifier instance
   */
  setLLMLoopVerifier(verifier: LLMLoopVerifier): void {
    this.terminationManager.setLLMLoopVerifier(verifier);
    this.logger?.debug("LLM loop verifier set via AgentLoop", {
      config: verifier.getConfig(),
    });
  }

  /**
   * Gets the LLM loop verifier instance if set.
   * Delegates to TerminationManager.
   */
  getLLMLoopVerifier(): LLMLoopVerifier | undefined {
    return this.terminationManager.getLLMLoopVerifier();
  }

  /**
   * Gets the streaming loop detector instance if enabled.
   * Delegates to TerminationManager.
   */
  getStreamingLoopDetector(): StreamingLoopDetector | undefined {
    return this.terminationManager.getStreamingLoopDetector();
  }

  /**
   * Gets the underlying termination checker instance.
   * Delegates to TerminationManager.
   */
  getTerminationChecker(): TerminationChecker {
    return this.terminationManager.getTerminationChecker();
  }

  /**
   * Resets the termination context for a new run (T021).
   * Delegates to TerminationManager.
   */
  resetTerminationTracking(): void {
    this.terminationManager.resetTerminationTracking();
    // GAP 2 FIX: Reset completion state as well
    this.completionAttempted = false;
  }

  /**
   * Legacy alias for resetTerminationTracking.
   * @deprecated Use resetTerminationTracking() instead.
   */
  resetTerminationContext(): void {
    this.resetTerminationTracking();
  }

  /**
   * Gets the current termination context (T021).
   * Delegates to TerminationManager.
   */
  getTerminationContext(): TerminationContext {
    return this.terminationManager.getTerminationContext();
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
      stepCount: this.terminationManager.getStepCount(),
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

    // Match and load skills via skills integration (T053)
    try {
      const skillPrompt = await this.skillsIntegration.matchAndBuildPrompt();
      if (skillPrompt) {
        systemPrompt += `\n\n## Active Skills\n\n${skillPrompt}`;
      }
    } catch (error) {
      this.logger?.warn("Failed to match skills", { error });
    }

    return systemPrompt;
  }

  /**
   * Processes the LLM stream and collects tool calls.
   * Delegates to AgentStreamHandler for stream processing (Step 7 refactor).
   */
  private async processStreamResponse(
    stream: AsyncIterable<StreamEvent>,
    pendingToolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }>
  ): Promise<{ interrupted: boolean }> {
    // Reset streaming loop detector at start of new stream
    this.terminationManager.getStreamingLoopDetector()?.reset();

    // Delegate to stream handler
    const result = await this.streamHandler.processStream(stream as AsyncIterable<LLMStreamEvent>);

    // Copy pending tool calls from result
    for (const toolCall of result.pendingToolCalls) {
      pendingToolCalls.push(toolCall);
    }

    // Handle abort on interruption
    if (result.interrupted) {
      this.abortController?.abort();
    }

    return { interrupted: result.interrupted };
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

    // Delegate retry decision to RetryManager (Step 6 refactor)
    const result = this.retryManager.handleError(err);

    if (result.isFatal) {
      this.emit("error", err);
      if (this.state !== "terminated" && this.state !== "shutdown") {
        this.transitionTo("recovering");
      }
      return false; // Signal to rethrow
    }

    if (result.shouldRetry && result.delay !== undefined) {
      this.transitionTo("recovering");

      try {
        await this.retryManager.waitForRetry(result.delay);
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
  async run(): Promise<void> {
    // Check for cancellation before starting
    if (this.cancellation.isCancelled) {
      this.logger?.debug("Run cancelled before start");
      this.transitionTo("terminated");
      return;
    }

    // Reset stream state for this run
    this.streamHandler.resetState();
    this.lastTurnUsage = null;

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
      const streamResult = await this.processStreamResponse(stream, pendingToolCalls);

      // Handle stream interruption due to loop detection
      if (streamResult.interrupted) {
        const streamState = this.streamHandler.getState();
        this.logger?.warn("Stream interrupted due to loop detection", {
          accumulatedTextLength: streamState.accumulatedText.length,
          pendingToolCalls: pendingToolCalls.length,
        });

        // Add partial response to history if we have any content
        if (streamState.accumulatedText.trim() || streamState.accumulatedReasoning.trim()) {
          const assistantParts: import("../session/index.js").SessionMessagePart[] = [];
          if (streamState.accumulatedReasoning.trim()) {
            assistantParts.push(SessionParts.reasoning(streamState.accumulatedReasoning));
          }
          if (streamState.accumulatedText.trim()) {
            assistantParts.push(
              SessionParts.text(`${streamState.accumulatedText}\n[Interrupted: Loop detected]`)
            );
          }
          const assistantMessage = createAssistantMessage(
            assistantParts,
            this.buildAssistantMetadata()
          );
          this.messages.push(assistantMessage);
        }

        this.transitionTo("idle");
        this.emit("complete");
        return;
      }

      const streamState = this.streamHandler.getState();
      if (
        !this.cancellation.isCancelled &&
        pendingToolCalls.length === 0 &&
        !streamState.hasText &&
        !streamState.hasToolCalls
      ) {
        const hasThinkingOnly = streamState.hasThinking;
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

      // Get token usage from termination manager
      const terminationContext = this.terminationManager.getTerminationContext();

      // Log LLM request completion (T041)
      this.llmLogger?.logRequestComplete({
        provider: this.config.providerType,
        model: this.config.model,
        requestId: this.currentRequestId,
        inputTokens: terminationContext.tokenUsage.inputTokens,
        outputTokens: terminationContext.tokenUsage.outputTokens,
        durationMs,
      });

      this.logger?.debug("LLM stream completed", {
        requestId: this.currentRequestId,
        durationMs,
        tokenUsage: terminationContext.tokenUsage,
        cancelled: this.cancellation.isCancelled,
      });

      // GAP 3 & 4 FIX: Update termination flags based on stream result
      // Set hasTextOnly if we got a response with no tool calls
      if (pendingToolCalls.length === 0) {
        this.terminationManager.setTextOnly(true);
      }
      // Set hasNaturalStop - the stream completed normally (done event received)
      // This flag indicates the LLM finished its turn without requesting more action
      this.terminationManager.setNaturalStop(pendingToolCalls.length === 0);

      // Determine next state based on stream completion
      if (this.cancellation.isCancelled) {
        this.transitionTo("terminated");
      } else if (pendingToolCalls.length > 0) {
        this.transitionTo("tool_executing");
        await this.executeToolCalls(pendingToolCalls);
      } else {
        // Pure text response - add assistant message to history
        const finalStreamState = this.streamHandler.getState();
        const assistantParts: import("../session/index.js").SessionMessagePart[] = [];
        if (finalStreamState.accumulatedReasoning.trim()) {
          assistantParts.push(SessionParts.reasoning(finalStreamState.accumulatedReasoning));
        }
        if (finalStreamState.accumulatedText.trim()) {
          assistantParts.push(SessionParts.text(finalStreamState.accumulatedText));
        }
        if (assistantParts.length > 0) {
          const assistantMessage = createAssistantMessage(
            assistantParts,
            this.buildAssistantMetadata()
          );
          this.messages.push(assistantMessage);
        }

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

  // ============================================
  // Retry Methods (delegate to RetryManager)
  // ============================================

  /**
   * Resets retry state (T025).
   * Call this when starting a fresh operation.
   * @deprecated Use resetRetryCounter() instead
   */
  resetRetryState(): void {
    this.retryManager.resetRetryCounter();
  }

  /**
   * Resets the retry counter (T025).
   * Call this when starting a fresh operation.
   */
  resetRetryCounter(): void {
    this.retryManager.resetRetryCounter();
  }

  /**
   * Gets current retry attempt count (T025).
   * @deprecated Use getRetryAttempts() instead
   */
  getRetryAttempt(): number {
    return this.retryManager.getRetryAttempts();
  }

  /**
   * Gets current retry attempt count (T025).
   */
  getRetryAttempts(): number {
    return this.retryManager.getRetryAttempts();
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
   * Execute a single tool call with all validation and permission checks.
   *
   * @param call - The tool call to execute
   * @returns Result of the tool execution
   * @internal
   */
  private async executeSingleToolCall(call: {
    id: string;
    name: string;
    input: Record<string, unknown>;
  }): Promise<SingleToolCallResult> {
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
      return {
        id: call.id,
        name: call.name,
        result: error,
        isError: true,
        permissionBlocked: false,
      };
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
        return {
          id: call.id,
          name: call.name,
          result: error,
          isError: true,
          permissionBlocked: false,
        };
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
        return {
          id: call.id,
          name: call.name,
          result: error,
          isError: true,
          permissionBlocked: false,
        };
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
        return {
          id: call.id,
          name: call.name,
          result: error,
          isError: true,
          permissionBlocked: false,
        };
      }

      if (permission === "ask") {
        // Handle wait_permission state (T015)
        // Note: Permission blocking stops auto-continuation
        await this.handlePermissionRequired(call.id, call.name, call.input);
        return {
          id: call.id,
          name: call.name,
          result: "",
          isError: false,
          permissionBlocked: true,
        };
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

      return {
        id: call.id,
        name: call.name,
        result: resultContent,
        isError: !executionResult.result.success,
        permissionBlocked: false,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      if (err instanceof PermissionDeniedError) {
        this.emit("permissionDenied", call.id, call.name, err.message);
        return {
          id: call.id,
          name: call.name,
          result: err.message,
          isError: true,
          permissionBlocked: true,
        };
      }

      if (err instanceof ToolNotFoundError) {
        this.emit("error", err);
        this.emit("toolEnd", call.id, call.name, {
          result: { success: false, error: err.message },
          timing: { startedAt: Date.now(), completedAt: Date.now(), durationMs: 0 },
          toolName: call.name,
          callId: call.id,
        });
        return {
          id: call.id,
          name: call.name,
          result: err.message,
          isError: true,
          permissionBlocked: false,
        };
      }

      this.emit("error", err);
      this.emit("toolEnd", call.id, call.name, {
        result: { success: false, error: err.message },
        timing: { startedAt: Date.now(), completedAt: Date.now(), durationMs: 0 },
        toolName: call.name,
        callId: call.id,
      });
      return {
        id: call.id,
        name: call.name,
        result: err.message,
        isError: true,
        permissionBlocked: false,
      };
    }
  }

  /**
   * Execute pending tool calls (T014) with auto-continuation (T058).
   *
   * Executes all pending tool calls, collects results, adds them to message
   * history, and automatically re-invokes the LLM if configured.
   *
   * Supports parallel execution (T075) when config.parallelToolExecution is true.
   * Uses a semaphore to limit concurrency to config.maxToolConcurrency (default 5).
   *
   * @param toolCalls - Array of tool calls from LLM
   */
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

    // T075: Parallel tool execution support
    const parallelEnabled = this.config.parallelToolExecution ?? false;
    const maxConcurrency = this.config.maxToolConcurrency ?? 5;

    if (parallelEnabled && toolCalls.length > 1) {
      // Parallel execution with concurrency limit using semaphore pattern
      this.logger?.debug("Executing tool calls in parallel", {
        toolCount: toolCalls.length,
        maxConcurrency,
      });

      let permits = maxConcurrency;
      const waiting: Array<() => void> = [];

      const acquire = async (): Promise<void> => {
        if (permits > 0) {
          permits--;
          return;
        }
        return new Promise<void>((resolve) => {
          waiting.push(resolve);
        });
      };

      const release = (): void => {
        const next = waiting.shift();
        if (next) {
          next();
        } else {
          permits++;
        }
      };

      // Create execution promises with concurrency control
      const executionPromises = toolCalls.map(async (call): Promise<void> => {
        // Check for cancellation before acquiring permit
        if (this.cancellation.isCancelled) {
          return;
        }

        await acquire();
        try {
          // Double-check cancellation after acquiring permit
          if (this.cancellation.isCancelled) {
            return;
          }

          const result = await this.executeSingleToolCall(call);

          // Collect result (thread-safe - push is atomic in JS)
          if (!result.permissionBlocked) {
            toolResults.push({
              id: result.id,
              name: result.name,
              result: result.result,
              isError: result.isError,
            });
          }

          if (result.permissionBlocked) {
            permissionBlocked = true;
          }
        } finally {
          release();
        }
      });

      // Wait for all executions to complete
      await Promise.all(executionPromises);
    } else {
      // Sequential execution (original behavior)
      for (const call of toolCalls) {
        // Check for cancellation between tool calls
        if (this.cancellation.isCancelled) {
          break;
        }

        const result = await this.executeSingleToolCall(call);

        if (!result.permissionBlocked) {
          toolResults.push({
            id: result.id,
            name: result.name,
            result: result.result,
            isError: result.isError,
          });
        }

        if (result.permissionBlocked) {
          permissionBlocked = true;
        }
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
    const assistantMessage = createAssistantMessage(assistantParts, this.buildAssistantMetadata());
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
    // Use explicit targetAgent if provided, fallback to first word of task for backward compat
    const agent = signal.targetAgent ?? signal.task.split(" ")[0] ?? "subagent";

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
    this.terminationManager.setNaturalStop(true);

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
   * Uses executeTask to actually run the delegated work (Issue A fix).
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

    // Get agent level for executeTask (default to worker level 2)
    const level = 2 as import("./level.js").AgentLevel;

    // Use executeTask to spawn AND execute the task (Issue A fix)
    // This ensures runWorkerTask is called and work actually executes
    const result = await orchestrator.executeTask(signal.task, level);

    // Get the handle from the orchestrator's active subagents or create a synthetic one
    // for compatibility with waitForSubagentCompletion
    const activeSubagents = orchestrator.getActiveSubagents();
    let handle = activeSubagents.find((h) => h.agentSlug === agentSlug);

    // If no active handle (task already completed), create a completed handle for the flow
    if (!handle) {
      // Create a synthetic completed handle to maintain API compatibility
      handle = {
        id: `handle-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        agentSlug,
        taskId: `task-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        status: result.overallStatus === "success" ? "completed" : "failed",
        startedAt: new Date(),
        completedAt: new Date(),
        completion: Promise.resolve(),
      };
    }

    this.logger?.debug("Subagent executed via executeTask", {
      delegationId: signal.delegationId,
      handleId: handle.id,
      agentSlug: handle.agentSlug,
      taskId: handle.taskId,
      overallStatus: result.overallStatus,
    });

    return handle;
  }

  /**
   * Wait for subagent completion and forward events (GAP 2 fix - T059).
   * Uses event-based completion notification with timeout fallback (Issue #5 fix).
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
    const maxWaitTime = 300000; // 5 minutes default timeout

    // Helper to get current status (avoids TypeScript control flow narrowing)
    const getStatus = (): SubagentHandle["status"] => handle.status;

    // Check if already in terminal state
    const initialStatus = getStatus();
    if (initialStatus === "completed") {
      return;
    }
    if (initialStatus === "failed" || initialStatus === "cancelled") {
      throw new Error(`Subagent ${initialStatus}: ${handle.agentSlug}`);
    }

    // AbortController to stop the polling loop when race resolves (Issue B fix)
    const abortController = new AbortController();

    // Create timeout promise as fallback safety
    const timeoutPromise = new Promise<"timeout">((resolve) => {
      const timer = setTimeout(() => resolve("timeout"), maxWaitTime);
      // Clean up timer if aborted
      abortController.signal.addEventListener("abort", () => clearTimeout(timer));
    });

    // Create cancellation check promise with abort support (Issue B fix)
    const cancellationCheck = async (): Promise<"cancelled"> => {
      // Poll for cancellation at lower frequency (avoids busy loop but catches cancellation)
      const checkInterval = 500;
      while (!this.cancellation.isCancelled && !abortController.signal.aborted) {
        await new Promise((resolve) => setTimeout(resolve, checkInterval));
      }
      return "cancelled";
    };

    // Emit initial progress
    this.emit("subagentTool", delegationId, agent, "processing...");

    // Race between completion, timeout, and cancellation
    const result = await Promise.race([
      handle.completion.then(() => "completed" as const),
      timeoutPromise,
      cancellationCheck(),
    ]);

    // Stop the polling loop and clear timeout (Issue B fix)
    abortController.abort();

    if (result === "cancelled") {
      throw new Error("Delegation cancelled");
    }

    if (result === "timeout") {
      throw new Error("Subagent execution timed out");
    }

    // Completion resolved - check final status (status may have changed after promise resolved)
    const finalStatus = getStatus();
    if (finalStatus === "failed" || finalStatus === "cancelled") {
      throw new Error(`Subagent ${finalStatus}: ${handle.agentSlug}`);
    }
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
   * Returns the stream handler instance (Step 7 refactor).
   *
   * This allows external consumers to access stream state
   * or configure callbacks.
   */
  getStreamHandler(): AgentStreamHandler {
    return this.streamHandler;
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
    return this.skillsIntegration.getSkillManager();
  }

  /**
   * Returns currently active skills for this session.
   */
  getActiveSkills(): SkillLoaded[] {
    return this.skillsIntegration.getActiveSkills();
  }

  // ============================================
  // Cost Limit Integration (Phase 35+)
  // ============================================

  /**
   * Returns the CostLimitIntegration instance if configured.
   */
  getCostLimitIntegration(): CostLimitIntegration | undefined {
    return this.costManager.getIntegration();
  }

  /**
   * Check if cost limits allow continuation.
   *
   * @returns true if within limits or no limits configured
   */
  checkCostLimits(): boolean {
    return this.costManager.checkLimits();
  }

  /**
   * Grant approval to continue past cost limit.
   *
   * @param extendLimit - Optional new limits to set
   */
  grantCostApproval(extendLimit?: { cost?: number; requests?: number }): void {
    this.costManager.grantApproval(extendLimit);
  }

  /**
   * Deny approval (stop execution due to cost limit).
   */
  denyCostApproval(): void {
    this.costManager.denyApproval();
  }

  /**
   * Get tool restrictions from active skills.
   * Returns allowed and denied tool lists based on skill compatibility settings.
   */
  getSkillToolRestrictions(): { allowed: string[]; denied: string[] } {
    return this.skillsIntegration.getSkillToolRestrictions();
  }

  /**
   * Pause stream processing.
   * Call resume() to continue.
   */
  pause(): void {
    if (this.state === "streaming") {
      this.pauseSignal.pause();
      this.transitionTo("paused");
    }
  }

  /**
   * Resume paused stream processing.
   */
  resume(): void {
    if (this.state === "paused") {
      this.pauseSignal.resume();
      this.transitionTo("streaming");
    }
  }

  /**
   * Check if stream processing is currently paused.
   */
  isPaused(): boolean {
    return this.pauseSignal.isPaused();
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
    this.pauseSignal.reset();
    this.transitionTo("terminated");

    // Emit terminated event with reason (T038 fix)
    this.emit("terminated", TerminationReason.CANCELLED, {
      shouldTerminate: true,
      reason: TerminationReason.CANCELLED,
      metadata: reason ? { stepsExecuted: this.terminationManager.getStepCount() } : undefined,
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
