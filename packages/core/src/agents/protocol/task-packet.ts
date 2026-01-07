// ============================================
// TaskPacket Protocol Schema
// ============================================
// REQ-015: Inter-agent communication task packets

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { type DelegationTarget, DelegationTargetSchema } from "./delegation.js";

// ============================================
// Task Context Schema
// ============================================

/**
 * Context information for a task packet.
 *
 * Contains optional metadata about the task's origin and shared state.
 */
export interface TaskContext {
  /** Parent task ID for tracking delegation chains */
  parentTaskId?: string;
  /** Chain ID for grouping related tasks in a workflow */
  chainId?: string;
  /** Session ID for associating tasks with a user session */
  sessionId?: string;
  /** Related file paths for task context */
  files?: string[];
  /** Shared memory/context data between agents */
  memory?: Record<string, unknown>;
}

/**
 * Zod schema for TaskContext validation.
 */
export const TaskContextSchema = z.object({
  parentTaskId: z.string().uuid().optional(),
  chainId: z.string().uuid().optional(),
  sessionId: z.string().optional(),
  files: z.array(z.string()).optional(),
  memory: z.record(z.string(), z.unknown()).optional(),
});

// ============================================
// Task Constraints Schema
// ============================================

/**
 * Constraints for task execution.
 *
 * Defines resource limits and priority for task processing.
 */
export interface TaskConstraints {
  /** Timeout in milliseconds */
  timeout?: number;
  /** Maximum tokens for LLM response */
  maxTokens?: number;
  /** Priority level (0-10, higher = more urgent) */
  priority?: number;
}

/**
 * Zod schema for TaskConstraints validation.
 */
export const TaskConstraintsSchema = z.object({
  timeout: z.number().int().positive().optional(),
  maxTokens: z.number().int().positive().optional(),
  priority: z.number().int().min(0).max(10).optional(),
});

// ============================================
// TaskPacket Schema
// ============================================

/**
 * Task packet for inter-agent communication.
 *
 * Represents a unit of work to be delegated from one agent to another.
 * Contains all necessary information for task execution including
 * the target agent, context, and constraints.
 *
 * @example
 * ```typescript
 * const packet = createTaskPacket(
 *   'Implement the user authentication module',
 *   { kind: 'builtin', slug: 'coder' },
 *   'orchestrator',
 *   {
 *     context: { files: ['src/auth/login.ts'] },
 *     constraints: { priority: 8, timeout: 60000 },
 *   }
 * );
 * ```
 */
export interface TaskPacket {
  /** Auto-generated UUID for task identification */
  id: string;
  /** Task description */
  task: string;
  /** Delegation target (builtin, custom, or MCP) */
  target: DelegationTarget;
  /** Optional context information */
  context?: TaskContext;
  /** Optional execution constraints */
  constraints?: TaskConstraints;
  /** Timestamp when the packet was created */
  createdAt: Date;
  /** Agent slug that created this packet */
  createdBy: string;
}

/**
 * Zod schema for TaskPacket validation.
 *
 * @example
 * ```typescript
 * const result = TaskPacketSchema.safeParse({
 *   id: '550e8400-e29b-41d4-a716-446655440000',
 *   task: 'Write unit tests for auth module',
 *   target: { kind: 'builtin', slug: 'qa' },
 *   createdAt: new Date(),
 *   createdBy: 'orchestrator',
 * });
 *
 * if (result.success) {
 *   console.log('Valid packet:', result.data.id);
 * }
 * ```
 */
export const TaskPacketSchema = z.object({
  id: z.string().uuid(),
  task: z.string().min(1, "Task description cannot be empty"),
  target: DelegationTargetSchema,
  context: TaskContextSchema.optional(),
  constraints: TaskConstraintsSchema.optional(),
  createdAt: z.date(),
  createdBy: z.string().min(1, "Creator agent slug cannot be empty"),
});

// ============================================
// Type Inference
// ============================================

/**
 * Inferred type from TaskContextSchema.
 */
export type TaskContextInferred = z.infer<typeof TaskContextSchema>;

/**
 * Inferred type from TaskConstraintsSchema.
 */
export type TaskConstraintsInferred = z.infer<typeof TaskConstraintsSchema>;

/**
 * Inferred type from TaskPacketSchema.
 */
export type TaskPacketInferred = z.infer<typeof TaskPacketSchema>;

// ============================================
// Factory Function
// ============================================

/**
 * Options for creating a task packet.
 */
export type CreateTaskPacketOptions = Partial<Pick<TaskPacket, "context" | "constraints">>;

/**
 * Creates a new TaskPacket with auto-generated id and createdAt.
 *
 * Factory function for creating properly initialized task packets.
 * Automatically generates a UUID for the id field and sets createdAt
 * to the current timestamp.
 *
 * @param task - Description of the task to be performed
 * @param target - Delegation target (builtin agent, custom mode, or MCP)
 * @param createdBy - Slug of the agent creating this packet
 * @param options - Optional context and constraints
 * @returns A fully initialized TaskPacket
 *
 * @example
 * ```typescript
 * // Simple task delegation to builtin agent
 * const packet = createTaskPacket(
 *   'Review code for security vulnerabilities',
 *   { kind: 'builtin', slug: 'security' },
 *   'orchestrator'
 * );
 *
 * // Task with context and constraints
 * const detailedPacket = createTaskPacket(
 *   'Implement feature X',
 *   { kind: 'builtin', slug: 'coder' },
 *   'spec-agent',
 *   {
 *     context: {
 *       parentTaskId: '550e8400-e29b-41d4-a716-446655440000',
 *       files: ['src/features/x.ts'],
 *       memory: { requirements: ['REQ-001', 'REQ-002'] },
 *     },
 *     constraints: {
 *       priority: 7,
 *       timeout: 120000,
 *       maxTokens: 4096,
 *     },
 *   }
 * );
 * ```
 */
export function createTaskPacket(
  task: string,
  target: DelegationTarget,
  createdBy: string,
  options?: CreateTaskPacketOptions
): TaskPacket {
  return {
    id: randomUUID(),
    task,
    target,
    context: options?.context,
    constraints: options?.constraints,
    createdAt: new Date(),
    createdBy,
  };
}
