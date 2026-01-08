// ============================================
// Delegation Module
// ============================================
// Types and utilities for agent task delegation
// Migrated from @vellum/tool for consolidation into @vellum/core

import { z } from "zod";
import { AgentLevel } from "../../agent/level.js";
import { type DelegationTarget, DelegationTargetSchema } from "../protocol/delegation.js";
import { createTaskPacket, type TaskPacket } from "../protocol/task-packet.js";

// ============================================
// Type Definitions
// ============================================

/**
 * Parameters for the delegate_task tool.
 *
 * @example
 * ```typescript
 * const params: DelegateTaskParams = {
 *   target: { kind: 'builtin', slug: 'coder' },
 *   task: 'Implement the authentication module',
 *   context: { files: ['src/auth/login.ts'] },
 *   timeout: 60000,
 * };
 * ```
 */
export interface DelegateTaskParams {
  /** Delegation target (builtin, custom, or mcp) */
  target: DelegationTarget;
  /** Task description for the delegated agent */
  task: string;
  /** Optional context for the task */
  context?: {
    /** Related file paths */
    files?: string[];
    /** Shared memory/state between agents */
    memory?: Record<string, unknown>;
  };
  /** Timeout in milliseconds (default: 300000 = 5 minutes) */
  timeout?: number;
}

/**
 * Result of a delegate_task invocation.
 *
 * @example
 * ```typescript
 * const result: DelegateTaskResult = {
 *   success: true,
 *   taskPacketId: '550e8400-e29b-41d4-a716-446655440000',
 *   agentId: 'coder-550e8400',
 * };
 * ```
 */
export interface DelegateTaskResult {
  /** Whether the delegation was successful */
  success: boolean;
  /** UUID of the created task packet */
  taskPacketId: string;
  /** Agent ID if spawned successfully */
  agentId?: string;
  /** Task result if completed synchronously */
  result?: unknown;
  /** Error message if delegation failed */
  error?: string;
}

// ============================================
// Zod Schemas
// ============================================

/**
 * Context schema for delegation.
 */
const DelegateTaskContextSchema = z.object({
  files: z.array(z.string()).optional(),
  memory: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Zod schema for DelegateTaskParams validation.
 */
export const DelegateTaskParamsSchema = z.object({
  target: DelegationTargetSchema,
  task: z.string().min(1, "Task description cannot be empty"),
  context: DelegateTaskContextSchema.optional(),
  timeout: z.number().int().positive().optional().default(300000),
});

/**
 * Zod schema for DelegateTaskResult validation.
 */
export const DelegateTaskResultSchema = z.object({
  success: z.boolean(),
  taskPacketId: z.string().uuid(),
  agentId: z.string().optional(),
  result: z.unknown().optional(),
  error: z.string().optional(),
});

// ============================================
// Type Inference
// ============================================

export type DelegateTaskParamsInferred = z.infer<typeof DelegateTaskParamsSchema>;
export type DelegateTaskResultInferred = z.infer<typeof DelegateTaskResultSchema>;

// ============================================
// Constants
// ============================================

/** Default timeout for delegated tasks (5 minutes) */
export const DEFAULT_DELEGATION_TIMEOUT = 300000;

// ============================================
// Extended Tool Context
// ============================================

/**
 * Extended context for the delegate_task tool.
 *
 * Includes agent-specific information for anti-recursion checks.
 */
export interface DelegateTaskContext {
  /** Current working directory */
  workingDir: string;
  /** Session identifier */
  sessionId: string;
  /** Message identifier */
  messageId: string;
  /** Tool call identifier */
  callId: string;
  /** Abort signal for cancellation */
  abortSignal: AbortSignal;
  /** Current agent's level in the hierarchy */
  agentLevel: AgentLevel;
  /** Current agent's slug/identifier */
  agentSlug: string;
  /** Permission check function */
  checkPermission(action: string, resource?: string): Promise<boolean>;
}

// ============================================
// Anti-Recursion Check (REQ-037)
// ============================================

/**
 * Error thrown when a worker agent attempts to delegate.
 */
export class WorkerDelegationError extends Error {
  constructor(agentSlug: string) {
    super(`Worker agents cannot delegate tasks. Agent '${agentSlug}' is at level 2 (worker).`);
    this.name = "WorkerDelegationError";
  }
}

/**
 * Check if the current agent can delegate tasks.
 *
 * @param level - The agent's level in the hierarchy
 * @returns `true` if the agent can delegate, `false` otherwise
 *
 * @example
 * ```typescript
 * canDelegate(AgentLevel.orchestrator); // true
 * canDelegate(AgentLevel.workflow);     // true
 * canDelegate(AgentLevel.worker);       // false
 * ```
 */
export function canDelegate(level: AgentLevel): boolean {
  // REQ-037: Workers (level 2) cannot delegate tasks
  return level !== AgentLevel.worker;
}

// ============================================
// Delegation Handler
// ============================================

/**
 * Handler interface for processing delegations.
 *
 * Implementations route tasks to the appropriate target (builtin, custom, mcp).
 */
export interface DelegationHandler {
  /**
   * Process a task packet and return the result.
   *
   * @param packet - The task packet to process
   * @param timeout - Timeout in milliseconds
   * @returns Promise resolving to the delegation result
   */
  process(packet: TaskPacket, timeout: number): Promise<DelegateTaskResult>;
}

// ============================================
// Default Handler (Stub)
// ============================================

/**
 * Default delegation handler that creates task packets but doesn't spawn agents.
 *
 * This is a minimal implementation that validates and creates task packets.
 * In a full implementation, this would be replaced by the orchestrator's
 * actual delegation mechanism.
 */
const defaultHandler: DelegationHandler = {
  async process(packet: TaskPacket, _timeout: number): Promise<DelegateTaskResult> {
    // In a full implementation, this would:
    // 1. Route to builtin/custom/mcp based on target.kind
    // 2. Spawn the agent or invoke the MCP tool
    // 3. Wait for completion or timeout
    // 4. Return the result

    // For now, we just return the packet ID indicating successful creation
    return {
      success: true,
      taskPacketId: packet.id,
      // agentId would be set when the agent is actually spawned
    };
  },
};

// Global handler reference (can be replaced for testing or integration)
let delegationHandler: DelegationHandler = defaultHandler;

/**
 * Set the delegation handler.
 *
 * Used by the orchestrator to inject its actual delegation mechanism.
 *
 * @param handler - The delegation handler to use
 */
export function setDelegationHandler(handler: DelegationHandler): void {
  delegationHandler = handler;
}

/**
 * Get the current delegation handler.
 *
 * @returns The current delegation handler
 */
export function getDelegationHandler(): DelegationHandler {
  return delegationHandler;
}

// ============================================
// Tool Execution
// ============================================

/**
 * Execute the delegate_task tool.
 *
 * Validates input, checks anti-recursion rules, creates a task packet,
 * and routes to the appropriate handler.
 *
 * @param params - Validated delegation parameters
 * @param context - Tool execution context with agent info
 * @returns Promise resolving to the delegation result
 *
 * @throws {WorkerDelegationError} If the current agent is a worker
 *
 * @example
 * ```typescript
 * const result = await executeDelegateTask(
 *   {
 *     target: { kind: 'builtin', slug: 'coder' },
 *     task: 'Implement feature X',
 *   },
 *   {
 *     workingDir: '/project',
 *     sessionId: 'session-1',
 *     messageId: 'msg-1',
 *     callId: 'call-1',
 *     abortSignal: new AbortController().signal,
 *     agentLevel: AgentLevel.workflow,
 *     agentSlug: 'orchestrator',
 *     checkPermission: async () => true,
 *   }
 * );
 * ```
 */
export async function executeDelegateTask(
  params: DelegateTaskParams,
  context: DelegateTaskContext
): Promise<DelegateTaskResult> {
  // REQ-037: Anti-recursion check
  if (!canDelegate(context.agentLevel)) {
    return {
      success: false,
      taskPacketId: "",
      error: `Worker agents cannot delegate tasks. Agent '${context.agentSlug}' is at level 2 (worker).`,
    };
  }

  // Check for abort signal
  if (context.abortSignal.aborted) {
    return {
      success: false,
      taskPacketId: "",
      error: "Delegation aborted",
    };
  }

  // Create task packet
  const timeout = params.timeout ?? DEFAULT_DELEGATION_TIMEOUT;
  const packet = createTaskPacket(params.task, params.target, context.agentSlug, {
    context: {
      sessionId: context.sessionId,
      files: params.context?.files,
      memory: params.context?.memory,
    },
    constraints: {
      timeout,
    },
  });

  // Route to handler
  try {
    const result = await delegationHandler.process(packet, timeout);
    return result;
  } catch (error) {
    return {
      success: false,
      taskPacketId: packet.id,
      error: error instanceof Error ? error.message : "Unknown delegation error",
    };
  }
}

/**
 * The delegate_task tool for multi-agent orchestration.
 *
 * Allows agents to delegate tasks to other agents (builtin, custom, or MCP).
 * Implements anti-recursion to prevent worker agents from delegating.
 *
 * @example
 * ```typescript
 * import { delegateTaskTool } from '@vellum/core';
 *
 * // Use in tool registry
 * registry.register(delegateTaskTool);
 *
 * // Execute delegation
 * const result = await delegateTaskTool.execute(
 *   {
 *     target: { kind: 'builtin', slug: 'coder' },
 *     task: 'Implement authentication module',
 *   },
 *   toolContext
 * );
 * ```
 */
export const delegateTaskTool = {
  definition: {
    name: "delegate_task",
    description:
      "Delegate a task to another agent. Supports builtin agents (by slug), " +
      "custom mode agents, and MCP server tools. Worker agents cannot use this tool.",
    parameters: DelegateTaskParamsSchema,
    kind: "agent" as const,
    category: "orchestration",
    enabled: true,
  },

  /**
   * Execute the delegate_task tool.
   *
   * @param input - Validated input parameters
   * @param ctx - Tool execution context (must include agentLevel and agentSlug)
   * @returns Promise resolving to the tool result
   */
  async execute(
    input: z.infer<typeof DelegateTaskParamsSchema>,
    ctx: DelegateTaskContext
  ): Promise<{ success: true; output: DelegateTaskResult } | { success: false; error: string }> {
    const result = await executeDelegateTask(input as DelegateTaskParams, ctx);

    if (result.success) {
      return { success: true, output: result };
    }

    return { success: false, error: result.error ?? "Delegation failed" };
  },

  /**
   * Check if this delegation requires confirmation.
   *
   * Delegations to MCP servers may require confirmation for security.
   *
   * @param input - The delegation parameters
   * @returns Whether confirmation is required
   */
  shouldConfirm(input: z.infer<typeof DelegateTaskParamsSchema>): boolean {
    // MCP delegations may require confirmation
    const target = input.target as DelegationTarget;
    return target.kind === "mcp";
  },
};
