// ============================================
// New Task Tool (REQ-017)
// ============================================
// Shorthand tool for delegating to builtin agents

import { z } from "zod";
import {
  type DelegateTaskContext,
  type DelegateTaskResult,
  executeDelegateTask,
} from "./delegate-task.js";

// ============================================
// Type Definitions
// ============================================

/**
 * Parameters for the new_task tool.
 *
 * Simplified interface for delegating to builtin agents.
 *
 * @example
 * ```typescript
 * const params: NewTaskParams = {
 *   agent: 'coder',
 *   task: 'Implement the authentication module',
 *   files: ['src/auth/login.ts'],
 *   timeout: 60000,
 * };
 * ```
 */
export interface NewTaskParams {
  /** Builtin agent slug (e.g., 'coder', 'qa', 'writer') */
  agent: string;
  /** Task description for the delegated agent */
  task: string;
  /** Optional related file paths */
  files?: string[];
  /** Timeout in milliseconds (default: 300000 = 5 minutes) */
  timeout?: number;
}

// ============================================
// Zod Schemas
// ============================================

/**
 * Zod schema for NewTaskParams validation.
 */
export const NewTaskParamsSchema = z.object({
  agent: z.string().min(1, "Agent slug cannot be empty"),
  task: z.string().min(1, "Task description cannot be empty"),
  files: z.array(z.string()).optional(),
  timeout: z.number().int().positive().optional(),
});

// ============================================
// Type Inference
// ============================================

export type NewTaskParamsInferred = z.infer<typeof NewTaskParamsSchema>;

// ============================================
// Tool Definition
// ============================================

/**
 * The new_task tool for quick delegation to builtin agents.
 *
 * Provides a simplified interface for the common case of delegating
 * to builtin agents, mapping to `delegate_task` with `kind: 'builtin'`.
 *
 * @example
 * ```typescript
 * import { newTaskTool } from '@vellum/tool/agent/new-task';
 *
 * // Use in tool registry
 * registry.register(newTaskTool);
 *
 * // Execute delegation
 * const result = await newTaskTool.execute(
 *   {
 *     agent: 'coder',
 *     task: 'Implement authentication module',
 *     files: ['src/auth/login.ts'],
 *   },
 *   toolContext
 * );
 * ```
 */
export const newTaskTool = {
  definition: {
    name: "new_task",
    description:
      "Quick delegation to a builtin agent. Simpler interface for delegating " +
      "tasks to builtin agents like 'coder', 'qa', or 'writer'. " +
      "Worker agents cannot use this tool.",
    parameters: NewTaskParamsSchema,
    kind: "agent" as const,
    category: "orchestration",
    enabled: true,
  },

  /**
   * Execute the new_task tool.
   *
   * Converts the simplified parameters to delegate_task format
   * and delegates to a builtin agent.
   *
   * @param input - Validated input parameters
   * @param ctx - Tool execution context (must include agentLevel and agentSlug)
   * @returns Promise resolving to the tool result
   */
  async execute(
    input: z.infer<typeof NewTaskParamsSchema>,
    ctx: DelegateTaskContext
  ): Promise<{ success: true; output: DelegateTaskResult } | { success: false; error: string }> {
    // Convert to delegate_task format with kind: 'builtin'
    const result = await executeDelegateTask(
      {
        target: { kind: "builtin", slug: input.agent },
        task: input.task,
        context: input.files ? { files: input.files } : undefined,
        timeout: input.timeout,
      },
      ctx
    );

    if (result.success) {
      return { success: true, output: result };
    }

    return { success: false, error: result.error ?? "Delegation failed" };
  },

  /**
   * Check if this delegation requires confirmation.
   *
   * Builtin agent delegations do not require confirmation.
   *
   * @returns Always false for builtin agents
   */
  shouldConfirm(): boolean {
    // Builtin agent delegations don't require confirmation
    return false;
  },
};
