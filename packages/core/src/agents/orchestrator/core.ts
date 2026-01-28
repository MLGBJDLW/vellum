// ============================================
// Orchestrator Core - Central Coordination Hub
// ============================================
// Implements REQ-007: Multi-Agent Orchestration
// Implements REQ-012: Task Execution Pipeline
// T031: Handle spec workflow handoff callbacks

import { BUILT_IN_AGENTS } from "../../agent/agent-config.js";
import type { AgentLevel } from "../../agent/level.js";
import { canSpawn } from "../../agent/level.js";
import type { ModeRegistry } from "../../agent/mode-registry.js";
import { CONFIG_DEFAULTS } from "../../config/defaults.js";
import type { ImplementationResult, SpecHandoffPacket } from "../../spec/index.js";
import { createTaskPacket } from "../protocol/task-packet.js";
import type { SubsessionManager } from "../session/subsession-manager.js";
import { executeWorkerTask, type WorkerExecutionConfig } from "../workers/worker-executor.js";
import type { AggregatedResult, ResultAggregator, TaskResult } from "./aggregator.js";
import { createResultAggregator } from "./aggregator.js";
import type { ApprovalForwarder, ApprovalRequest } from "./approval-forwarder.js";
import { createApprovalForwarder } from "./approval-forwarder.js";
import type { TaskDecomposer } from "./decomposer.js";
import { createTaskDecomposer } from "./decomposer.js";
import type { TaskRouter } from "./router.js";
import { createTaskRouter } from "./router.js";
import type { TaskChain, TaskChainManager } from "./task-chain.js";
import { createTaskChainManager, MAX_DELEGATION_DEPTH } from "./task-chain.js";

// ============================================
// Helper: Get agent level from mode or worker slug
// ============================================

/**
 * Mode/worker slug to agent name mapping.
 *
 * Maps both:
 * - Mode slugs (code, plan, spec, vibe) → corresponding agent
 * - Worker slugs don't have agents, so they're not listed here
 */
const SLUG_TO_AGENT: Record<string, keyof typeof BUILT_IN_AGENTS> = {
  // Mode slugs → agents
  code: "vibe-agent", // Legacy mode → vibe-agent (level 2)
  vibe: "vibe-agent", // Current mode → vibe-agent (level 2)
  plan: "plan-agent", // Plan mode → plan-agent (level 1)
  spec: "spec-orchestrator", // Spec mode → spec-orchestrator (level 0)
} as const;

/**
 * Worker slugs that are always level 2.
 * These don't have corresponding agents in BUILT_IN_AGENTS.
 */
const WORKER_SLUGS = new Set([
  "coder",
  "qa",
  "writer",
  "analyst",
  "devops",
  "architect",
  "security",
  "researcher",
  "requirements",
  "tasks",
  "validator",
]);

/**
 * Get the agent level for a mode or worker slug.
 *
 * Resolution order:
 * 1. Check if slug maps to a known agent in SLUG_TO_AGENT
 * 2. Check if slug is a known worker (WORKER_SLUGS)
 * 3. Default to worker level (2) for unknown slugs
 *
 * @param slug - Mode slug (code, plan, spec, vibe) or worker slug (coder, qa, etc.)
 * @returns AgentLevel (0=orchestrator, 1=workflow, 2=worker)
 */
function getAgentLevel(slug: string): AgentLevel {
  // Check if slug maps to a known agent
  const agentName = SLUG_TO_AGENT[slug];
  if (agentName && agentName in BUILT_IN_AGENTS) {
    return BUILT_IN_AGENTS[agentName].level;
  }

  // Worker slugs are always level 2
  if (WORKER_SLUGS.has(slug)) {
    return 2 as AgentLevel;
  }

  // Unknown slugs default to worker level (safe fallback)
  return 2 as AgentLevel;
}

// ============================================
// Types and Interfaces
// ============================================

/**
 * Configuration for creating an OrchestratorCore instance.
 *
 * @example
 * ```typescript
 * const config: OrchestratorConfig = {
 *   modeRegistry,
 *   maxConcurrentSubagents: 5,
 *   taskTimeout: 600000, // 10 minutes
 *   onApprovalRequired: async (req) => {
 *     return await promptUser(req);
 *   },
 * };
 * ```
 */
export interface OrchestratorConfig {
  /** Registry containing all registered agent modes */
  modeRegistry: ModeRegistry;
  /** Subsession manager for agent isolation (optional) */
  subsessionManager?: SubsessionManager;
  /** Maximum number of subagents that can run concurrently (default: 3) */
  maxConcurrentSubagents?: number;
  /** Timeout in milliseconds for task execution (default: 300000 = 5 min) */
  taskTimeout?: number;
  /** Callback invoked when approval is required from user */
  onApprovalRequired?: (request: ApprovalRequest) => Promise<boolean>;
}

/**
 * Options for spawning a subagent.
 *
 * @example
 * ```typescript
 * const options: SpawnOptions = {
 *   taskId: "task-123",
 *   parentTaskId: "parent-456",
 *   timeout: 60000,
 *   priority: 10,
 * };
 * ```
 */
export interface SpawnOptions {
  /** Custom task ID (auto-generated if not provided) */
  taskId?: string;
  /** ID of the parent task in the chain */
  parentTaskId?: string;
  /** Timeout in milliseconds for this specific task */
  timeout?: number;
  /** Priority level for task scheduling (higher = more urgent) */
  priority?: number;
}

/**
 * Handle representing an active or completed subagent.
 *
 * @example
 * ```typescript
 * const handle: SubagentHandle = {
 *   id: "handle-abc123",
 *   agentSlug: "code-worker",
 *   taskId: "task-456",
 *   status: "running",
 *   startedAt: new Date(),
 * };
 * ```
 */
export interface SubagentHandle {
  /** Unique identifier for this handle */
  id: string;
  /** Slug of the agent being executed */
  agentSlug: string;
  /** ID of the task being executed */
  taskId: string;
  /** ID of the subsession for isolation (if subsessionManager is configured) */
  subsessionId?: string;
  /** Current status of the subagent */
  status: "spawning" | "running" | "completed" | "failed" | "cancelled";
  /** Timestamp when the subagent was spawned */
  startedAt: Date;
  /** Timestamp when the subagent completed (if applicable) */
  completedAt?: Date;
  /**
   * Promise that resolves when the subagent reaches a terminal state
   * (completed, failed, or cancelled). Use with Promise.race() for
   * event-based waiting instead of polling.
   */
  completion: Promise<void>;
  /**
   * Internal resolver for the completion promise.
   * Called automatically when status transitions to terminal.
   * @internal
   */
  _resolveCompletion?: () => void;
}

/**
 * Core orchestrator interface for multi-agent coordination.
 *
 * Provides methods for spawning and managing subagents, executing tasks,
 * and accessing the underlying components.
 *
 * @example
 * ```typescript
 * const orchestrator = createOrchestrator(config);
 *
 * // Spawn a subagent
 * const handle = await orchestrator.spawnSubagent(
 *   "code-worker",
 *   "implement login feature"
 * );
 *
 * // Execute a task with full pipeline
 * const result = await orchestrator.executeTask(
 *   "build authentication system",
 *   AgentLevel.orchestrator
 * );
 * ```
 */
export interface OrchestratorCore {
  /**
   * Spawn a subagent to execute a specific task.
   *
   * Validates level hierarchy, creates task chain node, and tracks handle.
   *
   * @param agentSlug - The slug of the agent mode to spawn
   * @param task - The task description for the subagent
   * @param options - Optional spawn configuration
   * @returns Promise resolving to the subagent handle
   * @throws Error if agent not found or level hierarchy violated
   */
  spawnSubagent(agentSlug: string, task: string, options?: SpawnOptions): Promise<SubagentHandle>;

  /**
   * Execute a task through the full orchestration pipeline.
   *
   * Routes the task, decomposes if complex, spawns subagents, and aggregates results.
   *
   * @param task - The task description to execute
   * @param level - The agent level to execute at
   * @returns Promise resolving to aggregated results from all subtasks
   */
  executeTask(task: string, level: AgentLevel): Promise<AggregatedResult<unknown>>;

  /**
   * Cancel all active subagents.
   *
   * Stops all running subagents and cleans up resources.
   *
   * @returns Promise resolving when all subagents are cancelled
   */
  cancelAll(): Promise<void>;

  /**
   * Cancel a specific subagent by its handle ID.
   *
   * @param handleId - The ID of the subagent handle to cancel
   * @returns Promise resolving to true if cancelled, false if not found
   */
  cancelSubagent(handleId: string): Promise<boolean>;

  /**
   * Get all currently active subagent handles.
   *
   * @returns Array of active subagent handles
   */
  getActiveSubagents(): SubagentHandle[];

  /**
   * Get a task chain by its ID.
   *
   * @param chainId - The ID of the task chain
   * @returns The task chain if found, undefined otherwise
   */
  getTaskChain(chainId: string): TaskChain | undefined;

  /**
   * Handle a spec workflow handoff packet (T031).
   *
   * Receives a handoff packet from the spec workflow, routes to the coder
   * agent for implementation, and calls the callback when complete.
   *
   * @param packet - The spec handoff packet
   * @param onComplete - Callback to invoke when implementation completes
   */
  handleSpecHandoff(
    packet: SpecHandoffPacket,
    onComplete: (result: ImplementationResult) => void
  ): Promise<void>;

  // Component access (readonly)
  /** Task router for determining agent assignment */
  readonly router: TaskRouter;
  /** Task decomposer for breaking down complex tasks */
  readonly decomposer: TaskDecomposer;
  /** Result aggregator for combining subagent outputs */
  readonly aggregator: ResultAggregator<unknown>;
  /** Approval forwarder for handling permission requests */
  readonly approvalForwarder: ApprovalForwarder;
  /** Task chain manager for tracking delegation depth */
  readonly taskChainManager: TaskChainManager;

  /**
   * Register an event handler for orchestrator events.
   *
   * @param event - The event type to listen for
   * @param handler - The handler function to call when event fires
   */
  on(event: OrchestratorEventType, handler: OrchestratorEventHandler): void;

  /**
   * Remove a previously registered event handler.
   *
   * @param event - The event type to unsubscribe from
   * @param handler - The handler function to remove
   */
  off(event: OrchestratorEventType, handler: OrchestratorEventHandler): void;

  /**
   * Clean up all terminal (completed/failed/cancelled) handles.
   *
   * Call during orchestrator shutdown to release resources.
   * Safe to call multiple times.
   */
  cleanupAll(): void;
}

// ============================================
// Event Types
// ============================================

/**
 * Types of events emitted by the orchestrator.
 */
export type OrchestratorEventType =
  | "subagent_spawned"
  | "task_started"
  | "task_progress"
  | "task_completed"
  | "task_failed"
  | "subagent_cancelled";

/**
 * Event payload emitted by the orchestrator.
 *
 * @example
 * ```typescript
 * const event: OrchestratorEvent = {
 *   type: "task_started",
 *   timestamp: new Date(),
 *   data: {
 *     taskId: "task-123",
 *     agentSlug: "code-worker",
 *   },
 * };
 * ```
 */
export interface OrchestratorEvent {
  /** The type of event that occurred */
  type: OrchestratorEventType;
  /** When the event occurred */
  timestamp: Date;
  /** Event-specific data */
  data: {
    taskId?: string;
    agentSlug?: string;
    handleId?: string;
    /** Progress percentage (0-100) for task_progress events */
    progress?: number;
    /** Error that caused task_failed event */
    error?: Error;
    /** Result from completed task */
    result?: unknown;
  };
}

/**
 * Handler function for orchestrator events.
 */
export type OrchestratorEventHandler = (event: OrchestratorEvent) => void;

// ============================================
// Default Values
// ============================================

const DEFAULT_MAX_CONCURRENT_SUBAGENTS = CONFIG_DEFAULTS.limits.maxConcurrentAgents;
const DEFAULT_TASK_TIMEOUT = CONFIG_DEFAULTS.limits.orchestratorTaskTimeout;

// ============================================
// Implementation
// ============================================

/**
 * Generates a unique handle ID.
 */
function generateHandleId(): string {
  return `handle-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Generates a unique task ID.
 */
function generateTaskId(): string {
  return `task-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Terminal statuses that indicate the subagent has finished execution.
 */
const TERMINAL_STATUSES = new Set<SubagentHandle["status"]>(["completed", "failed", "cancelled"]);

/**
 * Set the status on a SubagentHandle, resolving the completion promise
 * if the status is terminal (completed, failed, or cancelled).
 *
 * @param handle - The handle to update
 * @param status - The new status value
 */
function setHandleStatus(handle: SubagentHandle, status: SubagentHandle["status"]): void {
  handle.status = status;
  if (TERMINAL_STATUSES.has(status) && handle._resolveCompletion) {
    handle._resolveCompletion();
    handle._resolveCompletion = undefined; // Prevent double-resolve
  }
}

/**
 * Create completion promise and resolver for a SubagentHandle.
 * Returns an object with the promise and resolver function.
 */
function createCompletionPromise(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void; // Definite assignment - Promise executor runs synchronously
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/**
 * Internal implementation of OrchestratorCore.
 */
class OrchestratorCoreImpl implements OrchestratorCore {
  readonly router: TaskRouter;
  readonly decomposer: TaskDecomposer;
  readonly aggregator: ResultAggregator<unknown>;
  readonly approvalForwarder: ApprovalForwarder;
  readonly taskChainManager: TaskChainManager;

  private readonly handles = new Map<string, SubagentHandle>();
  private readonly taskToChain = new Map<string, string>(); // taskId -> chainId
  private readonly taskDeadlines = new Map<string, number>(); // taskId -> deadline timestamp
  private readonly deadlineTimers = new Map<string, NodeJS.Timeout>(); // taskId -> deadline timer
  private readonly maxConcurrent: number;
  private readonly defaultTaskTimeout: number;
  private readonly eventListeners = new Map<OrchestratorEventType, Set<OrchestratorEventHandler>>();
  private readonly subsessionManager?: SubsessionManager;

  constructor(private readonly config: OrchestratorConfig) {
    // Initialize all components
    this.router = createTaskRouter(config.modeRegistry);
    this.decomposer = createTaskDecomposer();
    this.aggregator = createResultAggregator<unknown>();
    this.approvalForwarder = createApprovalForwarder(
      config.onApprovalRequired ?? (() => Promise.resolve(false))
    );
    this.taskChainManager = createTaskChainManager();
    this.subsessionManager = config.subsessionManager;

    // Apply defaults
    this.maxConcurrent = config.maxConcurrentSubagents ?? DEFAULT_MAX_CONCURRENT_SUBAGENTS;
    this.defaultTaskTimeout = config.taskTimeout ?? DEFAULT_TASK_TIMEOUT;
  }

  /**
   * Emit an event to all registered handlers.
   */
  private emit(event: OrchestratorEvent): void {
    const handlers = this.eventListeners.get(event.type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch {
          // Swallow handler errors to prevent disrupting orchestration
        }
      }
    }
  }

  /**
   * Enforce deadline for a task. Called by setTimeout when deadline passes.
   * Cancels the task if it's still running or spawning.
   */
  private enforceDeadline(taskId: string): void {
    // Clean up the timer reference
    this.deadlineTimers.delete(taskId);

    // Find handle by taskId
    let targetHandle: SubagentHandle | undefined;
    for (const handle of this.handles.values()) {
      if (handle.taskId === taskId) {
        targetHandle = handle;
        break;
      }
    }

    if (!targetHandle) {
      return; // Task already cleaned up
    }

    // Only cancel if still active
    if (targetHandle.status === "running" || targetHandle.status === "spawning") {
      setHandleStatus(targetHandle, "cancelled");
      targetHandle.completedAt = new Date();

      // Update chain status
      const chainId = this.taskToChain.get(taskId);
      if (chainId) {
        this.taskChainManager.updateStatus(chainId, taskId, "failed");
      }

      // Emit timeout event
      this.emit({
        type: "task_failed",
        timestamp: new Date(),
        data: {
          taskId,
          agentSlug: targetHandle.agentSlug,
          handleId: targetHandle.id,
          error: new Error("Task exceeded deadline"),
        },
      });

      // Cleanup the handle
      this.cleanup(targetHandle.id);
    }
  }

  on(event: OrchestratorEventType, handler: OrchestratorEventHandler): void {
    let handlers = this.eventListeners.get(event);
    if (!handlers) {
      handlers = new Set();
      this.eventListeners.set(event, handlers);
    }
    handlers.add(handler);
  }

  off(event: OrchestratorEventType, handler: OrchestratorEventHandler): void {
    const handlers = this.eventListeners.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  /**
   * Clean up resources for a completed/failed/cancelled handle.
   * Removes entries from handles, taskToChain, and taskDeadlines maps.
   * Safe to call with non-existent handleId.
   */
  private cleanup(handleId: string): void {
    const handle = this.handles.get(handleId);
    if (!handle) {
      return;
    }

    // Only cleanup terminal statuses
    if (
      handle.status !== "completed" &&
      handle.status !== "failed" &&
      handle.status !== "cancelled"
    ) {
      return;
    }

    const taskId = handle.taskId;

    // Clear deadline timer if exists (prevent timer leak)
    const timer = this.deadlineTimers.get(taskId);
    if (timer) {
      clearTimeout(timer);
      this.deadlineTimers.delete(taskId);
    }

    // Remove from all maps (safe - Map.delete handles missing keys)
    this.handles.delete(handleId);
    this.taskToChain.delete(taskId);
    this.taskDeadlines.delete(taskId);
  }

  /**
   * Clean up all terminal handles. Call during orchestrator shutdown.
   */
  cleanupAll(): void {
    // Clear all deadline timers first to prevent leaks
    for (const timer of this.deadlineTimers.values()) {
      clearTimeout(timer);
    }
    this.deadlineTimers.clear();

    const terminalHandleIds: string[] = [];

    for (const [handleId, handle] of this.handles) {
      if (
        handle.status === "completed" ||
        handle.status === "failed" ||
        handle.status === "cancelled"
      ) {
        terminalHandleIds.push(handleId);
      }
    }

    for (const handleId of terminalHandleIds) {
      this.cleanup(handleId);
    }
  }

  async spawnSubagent(
    agentSlug: string,
    _task: string,
    options?: SpawnOptions
  ): Promise<SubagentHandle> {
    // Note: _task is available for future use in task execution/logging

    // Check concurrent limit before spawning (Issue #8)
    const activeCount = this.getActiveSubagents().filter(
      (h) => h.status === "running" || h.status === "spawning"
    ).length;

    if (activeCount >= this.maxConcurrent) {
      throw new Error(
        `Concurrent subagent limit exceeded: ${activeCount}/${this.maxConcurrent} subagents active. ` +
          `Cannot spawn "${agentSlug}" until a slot becomes available.`
      );
    }

    // Validate agent exists
    const targetMode = this.config.modeRegistry.get(agentSlug);
    if (!targetMode) {
      throw new Error(`Agent "${agentSlug}" not found in mode registry`);
    }

    // Generate IDs
    const taskId = options?.taskId ?? generateTaskId();
    const handleId = generateHandleId();

    // Handle task chain creation/addition
    let chainId: string;

    if (options?.parentTaskId) {
      // Find existing chain for parent
      const existingChainId = this.taskToChain.get(options.parentTaskId);
      if (!existingChainId) {
        throw new Error(`Parent task "${options.parentTaskId}" not found in any chain`);
      }

      // Validate level hierarchy
      const chain = this.taskChainManager.getChain(existingChainId);
      if (!chain) {
        throw new Error(`Chain "${existingChainId}" not found`);
      }

      const parentNode = chain.nodes.get(options.parentTaskId);
      if (!parentNode) {
        throw new Error(`Parent task node not found in chain`);
      }

      // Get levels from agent config lookup
      const parentLevel = getAgentLevel(parentNode.agentSlug);
      const targetLevel = getAgentLevel(agentSlug);

      if (!canSpawn(parentLevel, targetLevel)) {
        throw new Error(
          `Level hierarchy violation: ${parentNode.agentSlug} (level ${parentLevel}) ` +
            `cannot spawn ${agentSlug} (level ${targetLevel})`
        );
      }

      // Add to existing chain
      const newNode = this.taskChainManager.addTask(
        existingChainId,
        taskId,
        options.parentTaskId,
        agentSlug
      );

      if (!newNode) {
        throw new Error(
          `Cannot add task to chain: maximum delegation depth (${MAX_DELEGATION_DEPTH}) exceeded`
        );
      }

      chainId = existingChainId;
    } else {
      // Create new chain
      const chain = this.taskChainManager.createTaskChain(taskId, agentSlug);
      chainId = chain.chainId;
    }

    // Track task -> chain mapping
    this.taskToChain.set(taskId, chainId);

    // Calculate and track deadline
    const timeout = options?.timeout ?? this.defaultTaskTimeout;
    const deadline = Date.now() + timeout;
    this.taskDeadlines.set(taskId, deadline);

    // Set timer to enforce deadline (Issue #7: deadline enforcement)
    const timer = setTimeout(() => this.enforceDeadline(taskId), timeout);
    this.deadlineTimers.set(taskId, timer);

    // Create subsession for isolation if manager is configured
    let subsessionId: string | undefined;
    if (this.subsessionManager && options?.parentTaskId) {
      const subsession = this.subsessionManager.create({
        parentId: options.parentTaskId,
        agentSlug,
        level: getAgentLevel(agentSlug),
      });
      subsessionId = subsession.id;
    }

    // Create completion promise for event-based waiting (Issue #5 fix)
    const { promise: completion, resolve: resolveCompletion } = createCompletionPromise();

    // Create handle
    const handle: SubagentHandle = {
      id: handleId,
      agentSlug,
      taskId,
      subsessionId,
      status: "spawning",
      startedAt: new Date(),
      completion,
      _resolveCompletion: resolveCompletion,
    };

    this.handles.set(handleId, handle);

    // Update status to running
    handle.status = "running";
    this.taskChainManager.updateStatus(chainId, taskId, "running");

    // Emit subagent_spawned event
    this.emit({
      type: "subagent_spawned",
      timestamp: new Date(),
      data: {
        taskId,
        agentSlug,
        handleId,
      },
    });

    return handle;
  }

  async executeTask(task: string, level: AgentLevel): Promise<AggregatedResult<unknown>> {
    // Emit task_started event
    const executionTaskId = generateTaskId();
    this.emit({
      type: "task_started",
      timestamp: new Date(),
      data: {
        taskId: executionTaskId,
      },
    });

    // Reset aggregator for fresh execution
    this.aggregator.reset();

    // Analyze and potentially decompose the task
    const analysis = this.decomposer.analyze(task);

    if (!analysis.shouldDecompose) {
      // Simple task - route directly
      const routeResult = this.router.route(task, level);

      if (!routeResult.selectedAgent) {
        // No agent found - return failure
        const noAgentError = new Error(`No agent found to handle task at level ${level}`);
        const failResult: TaskResult<unknown> = {
          taskId: executionTaskId,
          agentSlug: "",
          status: "failure",
          error: noAgentError,
          startedAt: new Date(),
          completedAt: new Date(),
        };
        this.aggregator.addResult(failResult);

        // Emit task_failed event
        this.emit({
          type: "task_failed",
          timestamp: new Date(),
          data: {
            taskId: executionTaskId,
            error: noAgentError,
          },
        });

        return this.aggregator.aggregate();
      }

      // Spawn single agent
      const handle = await this.spawnSubagent(routeResult.selectedAgent, task);

      // Execute the worker task (Issue #3 fix: actually run the task)
      const execResult = await this.runWorkerTask(handle, task);

      const result: TaskResult<unknown> = {
        taskId: handle.taskId,
        agentSlug: handle.agentSlug,
        status: execResult.success ? "success" : "failure",
        data: execResult.output,
        error: execResult.error,
        startedAt: handle.startedAt,
        completedAt: handle.completedAt ?? new Date(),
      };

      this.aggregator.addResult(result);

      // Emit task_completed event
      this.emit({
        type: "task_completed",
        timestamp: new Date(),
        data: {
          taskId: executionTaskId,
          agentSlug: handle.agentSlug,
          handleId: handle.id,
        },
      });

      // Cleanup completed handle (Issue #6: memory leak prevention)
      this.cleanup(handle.id);

      return this.aggregator.aggregate();
    }

    // Complex task - decompose and execute subtasks
    const decomposition = this.decomposer.decompose(task);

    // Execute subtasks in order, respecting parallelization groups
    for (const parallelGroup of decomposition.canParallelize) {
      // Execute all tasks in this group (up to maxConcurrent at a time)
      const groupPromises: Promise<void>[] = [];

      for (const subtaskId of parallelGroup) {
        const subtask = decomposition.subtasks.find((s) => s.id === subtaskId);
        if (!subtask) continue;

        // Check concurrent limit
        const activeCount = this.getActiveSubagents().filter(
          (h) => h.status === "running" || h.status === "spawning"
        ).length;

        if (activeCount >= this.maxConcurrent) {
          // Wait for some to complete (simplified - in real impl would use proper queue)
          await Promise.race(groupPromises);
        }

        // Route subtask
        const routeResult = this.router.route(subtask.description, level);
        const agentSlug = subtask.suggestedAgent ?? routeResult.selectedAgent;

        if (!agentSlug) {
          // Record failure for this subtask
          const failResult: TaskResult<unknown> = {
            taskId: subtaskId,
            agentSlug: "",
            status: "failure",
            error: new Error(`No agent found for subtask: ${subtask.description}`),
            startedAt: new Date(),
            completedAt: new Date(),
          };
          this.aggregator.addResult(failResult);
          continue;
        }

        // Spawn and track
        const subtaskPromise = (async () => {
          try {
            const handle = await this.spawnSubagent(agentSlug, subtask.description, {
              taskId: subtaskId,
            });

            // Execute the worker task (Issue #3 fix: actually run the task)
            const execResult = await this.runWorkerTask(handle, subtask.description);

            const result: TaskResult<unknown> = {
              taskId: handle.taskId,
              agentSlug: handle.agentSlug,
              status: execResult.success ? "success" : "failure",
              data: execResult.output,
              error: execResult.error,
              startedAt: handle.startedAt,
              completedAt: handle.completedAt ?? new Date(),
            };

            this.aggregator.addResult(result);

            // Cleanup completed handle (Issue #6: memory leak prevention)
            this.cleanup(handle.id);
          } catch (error) {
            const failResult: TaskResult<unknown> = {
              taskId: subtaskId,
              agentSlug,
              status: "failure",
              error: error instanceof Error ? error : new Error(String(error)),
              startedAt: new Date(),
              completedAt: new Date(),
            };
            this.aggregator.addResult(failResult);
          }
        })();

        groupPromises.push(subtaskPromise);
      }

      // Wait for all in group to complete
      await Promise.all(groupPromises);

      // Emit task_progress event after each parallel group completes
      const totalGroups = decomposition.canParallelize.length;
      const currentGroupIndex = decomposition.canParallelize.indexOf(parallelGroup);
      const progress = Math.round(((currentGroupIndex + 1) / totalGroups) * 100);
      this.emit({
        type: "task_progress",
        timestamp: new Date(),
        data: {
          taskId: executionTaskId,
          progress,
        },
      });
    }

    // Emit task_completed event for the entire complex task
    const aggregated = this.aggregator.aggregate();
    this.emit({
      type: "task_completed",
      timestamp: new Date(),
      data: {
        taskId: executionTaskId,
        result: aggregated,
      },
    });

    return aggregated;
  }

  async cancelAll(): Promise<void> {
    const activeHandles = this.getActiveSubagents();

    for (const handle of activeHandles) {
      await this.cancelSubagent(handle.id);
    }
  }

  async cancelSubagent(handleId: string): Promise<boolean> {
    const handle = this.handles.get(handleId);
    if (!handle) {
      return false;
    }

    // Only cancel if still active
    if (handle.status === "spawning" || handle.status === "running") {
      setHandleStatus(handle, "cancelled");
      handle.completedAt = new Date();

      // Update chain status
      const chainId = this.taskToChain.get(handle.taskId);
      if (chainId) {
        this.taskChainManager.updateStatus(chainId, handle.taskId, "failed");
      }

      // Emit subagent_cancelled event
      this.emit({
        type: "subagent_cancelled",
        timestamp: new Date(),
        data: {
          taskId: handle.taskId,
          agentSlug: handle.agentSlug,
          handleId: handle.id,
        },
      });

      // Cleanup cancelled handle (Issue #6: memory leak prevention)
      this.cleanup(handleId);

      return true;
    }

    return false;
  }

  getActiveSubagents(): SubagentHandle[] {
    return Array.from(this.handles.values()).filter(
      (h) => h.status === "spawning" || h.status === "running"
    );
  }

  getTaskChain(chainId: string): TaskChain | undefined {
    return this.taskChainManager.getChain(chainId);
  }

  /**
   * Execute a worker task using the worker executor.
   *
   * This method is used by executeTask to actually run spawned subagents.
   * It mirrors the execution logic in handleSpecHandoff but is reusable
   * for any task execution path.
   *
   * @param handle - The subagent handle from spawnSubagent
   * @param taskDescription - Description of the task to execute
   * @returns Promise resolving to execution result with success/failure status
   */
  private async runWorkerTask(
    handle: SubagentHandle,
    taskDescription: string
  ): Promise<{ success: boolean; output?: unknown; error?: Error }> {
    // Execute actual task using worker executor if subsession manager is available
    if (this.subsessionManager && handle.subsessionId) {
      const subsession = this.subsessionManager.get(handle.subsessionId);
      if (subsession) {
        // Create task packet for the worker
        const taskPacket = createTaskPacket(
          taskDescription,
          { kind: "builtin", slug: handle.agentSlug },
          "orchestrator",
          {
            context: {
              chainId: this.taskToChain.get(handle.taskId),
            },
          }
        );

        // Configure worker execution
        const execConfig: WorkerExecutionConfig = {
          maxIterations: 20, // Standard iterations for task execution
          timeout: 180000, // 3 minutes for standard tasks
        };

        try {
          // Execute the worker task
          const workerResult = await executeWorkerTask(
            handle.agentSlug,
            {
              subsession,
              taskPacket,
            },
            execConfig
          );

          // Update handle based on result
          if (workerResult.success) {
            setHandleStatus(handle, "completed");
          } else {
            setHandleStatus(handle, "failed");
          }

          handle.completedAt = new Date();
          const chainId = this.taskToChain.get(handle.taskId);
          if (chainId) {
            this.taskChainManager.updateStatus(
              chainId,
              handle.taskId,
              workerResult.success ? "completed" : "failed"
            );
          }

          return {
            success: workerResult.success,
            output: workerResult.data,
            error: workerResult.error,
          };
        } catch (error) {
          setHandleStatus(handle, "failed");
          handle.completedAt = new Date();
          const chainId = this.taskToChain.get(handle.taskId);
          if (chainId) {
            this.taskChainManager.updateStatus(chainId, handle.taskId, "failed");
          }

          return {
            success: false,
            error: error instanceof Error ? error : new Error(String(error)),
          };
        }
      }
    }

    // Fallback: No subsession manager - mark as completed (legacy behavior)
    setHandleStatus(handle, "completed");
    handle.completedAt = new Date();
    const chainId = this.taskToChain.get(handle.taskId);
    if (chainId) {
      this.taskChainManager.updateStatus(chainId, handle.taskId, "completed");
    }

    return { success: true };
  }

  /**
   * Handle a spec workflow handoff packet (T031).
   *
   * Routes tasks from the spec workflow to the coder agent for implementation,
   * then calls the callback to allow the spec workflow to resume.
   *
   * @param packet - The spec handoff packet containing implementation tasks
   * @param onComplete - Callback to invoke when implementation completes
   */
  async handleSpecHandoff(
    packet: SpecHandoffPacket,
    onComplete: (result: ImplementationResult) => void
  ): Promise<void> {
    const { workflowId, tasksFile, callback } = packet;

    // Emit event for handoff receipt
    this.emit({
      type: "task_started",
      timestamp: new Date(),
      data: {
        taskId: `spec-impl-${workflowId}`,
        agentSlug: "coder",
      },
    });

    try {
      // Route to coder agent for implementation
      const taskDescription = `Implement tasks from ${tasksFile}`;
      const handle = await this.spawnSubagent("coder", taskDescription, {
        taskId: `spec-impl-${workflowId}`,
      });

      // Execute actual task using worker executor if subsession manager is available
      if (this.subsessionManager && handle.subsessionId) {
        const subsession = this.subsessionManager.get(handle.subsessionId);
        if (subsession) {
          // Create task packet for the worker
          const taskPacket = createTaskPacket(
            taskDescription,
            { kind: "builtin", slug: "coder" },
            "orchestrator",
            {
              context: {
                chainId: this.taskToChain.get(handle.taskId),
                files: tasksFile ? [tasksFile] : undefined,
              },
            }
          );

          // Configure worker execution
          const execConfig: WorkerExecutionConfig = {
            maxIterations: 25, // Allow more iterations for implementation tasks
            timeout: 300000, // 5 minutes for implementation
          };

          // Execute the worker task
          const workerResult = await executeWorkerTask(
            "coder",
            {
              subsession,
              taskPacket,
            },
            execConfig
          );

          // Update handle based on result
          if (workerResult.success) {
            setHandleStatus(handle, "completed");
          } else {
            setHandleStatus(handle, "failed");
            throw workerResult.error ?? new Error("Worker execution failed");
          }
        } else {
          // Subsession not found, mark as completed (fallback behavior)
          setHandleStatus(handle, "completed");
        }
      } else {
        // No subsession manager - use legacy behavior (mark as completed)
        setHandleStatus(handle, "completed");
      }

      handle.completedAt = new Date();

      const chainId = this.taskToChain.get(handle.taskId);
      if (chainId) {
        this.taskChainManager.updateStatus(chainId, handle.taskId, "completed");
      }

      // Call the callback to resume spec workflow
      const result: ImplementationResult = {
        success: true,
        completedTasks: [handle.taskId],
      };

      this.emit({
        type: "task_completed",
        timestamp: new Date(),
        data: {
          taskId: handle.taskId,
          agentSlug: handle.agentSlug,
          handleId: handle.id,
          result,
        },
      });

      // Cleanup completed handle (Issue #6: memory leak prevention)
      this.cleanup(handle.id);

      // Verify callback target is spec before invoking
      if (callback.returnTo === "spec") {
        onComplete(result);
      }
    } catch (error) {
      const errorResult: ImplementationResult = {
        success: false,
        completedTasks: [],
        failedTasks: [`spec-impl-${workflowId}`],
        error: error instanceof Error ? error.message : String(error),
      };

      this.emit({
        type: "task_failed",
        timestamp: new Date(),
        data: {
          taskId: `spec-impl-${workflowId}`,
          error: error instanceof Error ? error : new Error(String(error)),
        },
      });

      if (callback.returnTo === "spec") {
        onComplete(errorResult);
      }
    }
  }
}

// ============================================
// Factory Function
// ============================================

/**
 * Create a new OrchestratorCore instance.
 *
 * This is the main entry point for creating an orchestrator that coordinates
 * multi-agent task execution.
 *
 * @param config - Configuration for the orchestrator
 * @returns A fully initialized OrchestratorCore instance
 *
 * @example
 * ```typescript
 * const registry = createModeRegistry();
 * // ... register modes ...
 *
 * const orchestrator = createOrchestrator({
 *   modeRegistry: registry,
 *   maxConcurrentSubagents: 5,
 *   taskTimeout: 600000,
 *   onApprovalRequired: async (request) => {
 *     console.log(`Approval needed: ${request.tool}`);
 *     return true;
 *   },
 * });
 *
 * // Use the orchestrator
 * const result = await orchestrator.executeTask(
 *   "build user dashboard",
 *   AgentLevel.orchestrator
 * );
 * ```
 */
export function createOrchestrator(config: OrchestratorConfig): OrchestratorCore {
  return new OrchestratorCoreImpl(config);
}
