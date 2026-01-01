// ============================================
// BaseWorker Interface
// ============================================
// REQ-027: Base interface for all worker agents

import { AgentLevel } from "../../agent/level.js";
import type { TaskPacket } from "../protocol/task-packet.js";
import type { Subsession } from "../session/subsession-manager.js";

// ============================================
// Worker Capabilities
// ============================================

/**
 * Defines the capabilities of a worker agent.
 *
 * These capabilities determine what operations the worker
 * is allowed and capable of performing.
 *
 * @example
 * ```typescript
 * const capabilities: WorkerCapabilities = {
 *   canEdit: true,
 *   canExecute: false,
 *   canNetwork: false,
 *   specializations: ['typescript', 'testing'],
 * };
 * ```
 */
export interface WorkerCapabilities {
  /** Whether the worker can edit files */
  canEdit: boolean;
  /** Whether the worker can execute commands */
  canExecute: boolean;
  /** Whether the worker can make network requests */
  canNetwork: boolean;
  /** Specialization areas for task routing (e.g., ['typescript', 'testing', 'documentation']) */
  specializations: string[];
}

// ============================================
// Worker Context
// ============================================

/**
 * Execution context provided to a worker when executing a task.
 *
 * Contains the isolated subsession, task packet, and optional abort signal
 * for cancellation support.
 *
 * @example
 * ```typescript
 * const context: WorkerContext = {
 *   subsession,
 *   taskPacket,
 *   signal: controller.signal,
 * };
 * await worker.execute(context);
 * ```
 */
export interface WorkerContext {
  /** Isolated subsession for worker execution */
  subsession: Subsession;
  /** Task packet containing the work to be done */
  taskPacket: TaskPacket;
  /** Optional abort signal for task cancellation */
  signal?: AbortSignal;
}

// ============================================
// Worker Result
// ============================================

/**
 * Result returned by a worker after task execution.
 *
 * Contains success status, optional data, error information,
 * and metadata about the execution.
 *
 * @typeParam T - Type of the result data
 *
 * @example
 * ```typescript
 * const result: WorkerResult<{ compiled: boolean }> = {
 *   success: true,
 *   data: { compiled: true },
 *   filesModified: ['src/index.ts'],
 *   tokensUsed: 1500,
 * };
 * ```
 */
export interface WorkerResult<T = unknown> {
  /** Whether the task completed successfully */
  success: boolean;
  /** Optional result data from the task */
  data?: T;
  /** Error if the task failed */
  error?: Error;
  /** List of files modified during execution */
  filesModified?: string[];
  /** Number of LLM tokens consumed */
  tokensUsed?: number;
}

// ============================================
// BaseWorker Interface
// ============================================

/**
 * Base interface for all worker agents.
 *
 * Workers are level-2 agents that execute specific tasks delegated
 * by workflow agents. They cannot spawn other agents and must
 * return results via handoff.
 *
 * @example
 * ```typescript
 * const coder: BaseWorker = {
 *   slug: 'ouroboros-coder',
 *   name: 'Coder',
 *   level: AgentLevel.worker,
 *   capabilities: {
 *     canEdit: true,
 *     canExecute: true,
 *     canNetwork: false,
 *     specializations: ['typescript', 'implementation'],
 *   },
 *   execute: async (ctx) => ({ success: true }),
 *   canHandle: (desc) => desc.includes('implement'),
 *   getCapabilities: () => coder.capabilities,
 * };
 * ```
 */
export interface BaseWorker {
  /** Unique slug identifier for the worker */
  readonly slug: string;
  /** Human-readable name for the worker */
  readonly name: string;
  /** Agent level - MUST be level 2 (worker) */
  readonly level: AgentLevel.worker;
  /** Worker capabilities defining allowed operations */
  readonly capabilities: WorkerCapabilities;

  /**
   * Execute a task in the given context.
   *
   * @typeParam T - Type of the result data
   * @param context - Execution context with subsession and task
   * @returns Promise resolving to the worker result
   */
  execute<T>(context: WorkerContext): Promise<WorkerResult<T>>;

  /**
   * Check if this worker can handle a given task description.
   *
   * Used by orchestrators for task routing decisions.
   *
   * @param taskDescription - Description of the task
   * @returns True if this worker can handle the task
   */
  canHandle(taskDescription: string): boolean;

  /**
   * Get the worker's capabilities.
   *
   * @returns The worker's capability configuration
   */
  getCapabilities(): WorkerCapabilities;
}

// ============================================
// Worker Configuration
// ============================================

/**
 * Configuration for creating a base worker.
 */
export interface BaseWorkerConfig {
  /** Unique slug identifier for the worker */
  slug: string;
  /** Human-readable name for the worker */
  name: string;
  /** Worker capabilities */
  capabilities: WorkerCapabilities;
  /** Handler function for task execution */
  handler: (context: WorkerContext) => Promise<WorkerResult>;
  /** Optional custom canHandle implementation */
  canHandleFn?: (taskDescription: string) => boolean;
}

// ============================================
// Factory Function
// ============================================

/**
 * Creates a base worker instance from configuration.
 *
 * This factory function enforces level 2 and provides a default
 * `canHandle` implementation based on specializations.
 *
 * @param config - Worker configuration
 * @returns A BaseWorker instance
 *
 * @example
 * ```typescript
 * const coder = createBaseWorker({
 *   slug: 'ouroboros-coder',
 *   name: 'Coder',
 *   capabilities: {
 *     canEdit: true,
 *     canExecute: true,
 *     canNetwork: false,
 *     specializations: ['typescript', 'implementation', 'refactoring'],
 *   },
 *   handler: async (context) => {
 *     // Implementation logic
 *     return { success: true, filesModified: ['src/index.ts'] };
 *   },
 * });
 * ```
 */
export function createBaseWorker(config: BaseWorkerConfig): BaseWorker {
  const { slug, name, capabilities, handler, canHandleFn } = config;

  // Default canHandle: check if task description contains any specialization
  const defaultCanHandle = (taskDescription: string): boolean => {
    const lowerDesc = taskDescription.toLowerCase();
    return capabilities.specializations.some((spec) => lowerDesc.includes(spec.toLowerCase()));
  };

  return {
    slug,
    name,
    level: AgentLevel.worker, // Enforced as level 2
    capabilities,

    async execute<T>(context: WorkerContext): Promise<WorkerResult<T>> {
      return handler(context) as Promise<WorkerResult<T>>;
    },

    canHandle: canHandleFn ?? defaultCanHandle,

    getCapabilities(): WorkerCapabilities {
      return capabilities;
    },
  };
}
