/**
 * Delegate Agent Tool
 *
 * Spawns a subagent to handle a delegated task with optional context and configuration.
 * Returns a signal for the agent loop to spawn the subagent.
 *
 * @module builtin/delegate-agent
 */

import { z } from "zod";
import { defineTool, ok } from "../types/index.js";

/** Default maximum conversation turns for subagent */
const DEFAULT_MAX_TURNS = 10;

/**
 * Schema for delegate_agent tool parameters
 */
export const delegateAgentParamsSchema = z.object({
  /** Task description for the subagent */
  task: z.string().min(1).describe("The task description for the subagent to complete"),
  /** Target agent slug to spawn (e.g. 'coder', 'reviewer'). If not provided, defaults to 'subagent' */
  targetAgent: z
    .string()
    .optional()
    .describe("Target agent slug to spawn (e.g. 'coder', 'reviewer')"),
  /** Additional context to provide to the subagent */
  context: z.string().optional().describe("Additional context to help the subagent"),
  /** Model to use for the subagent (optional, uses default if not specified) */
  model: z.string().optional().describe("Model identifier for the subagent (optional)"),
  /** Maximum conversation turns allowed (default: 10) */
  maxTurns: z
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .default(DEFAULT_MAX_TURNS)
    .describe("Maximum conversation turns for the subagent (default: 10)"),
});

/** Inferred type for delegate_agent parameters */
export type DelegateAgentParams = z.infer<typeof delegateAgentParamsSchema>;

/**
 * Signal returned to indicate subagent should be spawned
 * The agent loop will handle the actual spawning
 */
export interface DelegateAgentSignal {
  /** Signal type identifier */
  type: "delegate_agent";
  /** Target agent slug to spawn (e.g. 'coder', 'reviewer') */
  targetAgent?: string;
  /** Task for the subagent */
  task: string;
  /** Additional context */
  context?: string;
  /** Model to use */
  model?: string;
  /** Maximum turns allowed */
  maxTurns: number;
  /** ID of this delegation for tracking */
  delegationId: string;
}

/** Output type for delegate_agent tool */
export interface DelegateAgentOutput {
  /** Signal for agent loop to process */
  signal: DelegateAgentSignal;
  /** Human-readable message */
  message: string;
}

/**
 * Generate a unique delegation ID
 */
function generateDelegationId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `delegate_${timestamp}_${random}`;
}

/**
 * Delegate agent tool implementation
 *
 * Creates a signal to spawn a subagent for handling a delegated task.
 * The actual subagent spawning is handled by the agent loop which processes
 * the signal in the tool result.
 *
 * @example
 * ```typescript
 * // Simple delegation
 * const result = await delegateAgentTool.execute(
 *   { task: "Review the code in src/utils for security issues" },
 *   ctx
 * );
 *
 * // Delegation with context and model override
 * const result = await delegateAgentTool.execute(
 *   {
 *     task: "Write unit tests for the UserService class",
 *     context: "Focus on edge cases and error handling",
 *     model: "claude-3-opus",
 *     maxTurns: 15
 *   },
 *   ctx
 * );
 * ```
 */
export const delegateAgentTool = defineTool({
  name: "delegate_agent",
  description:
    "Delegate a task to a subagent. The subagent will work independently to complete the task and return the result. Use this for complex subtasks that benefit from focused attention.",
  parameters: delegateAgentParamsSchema,
  kind: "agent",
  category: "agent",

  async execute(input, _ctx) {
    // Note: Cancellation is handled at the agent loop level for delegations

    const { task, targetAgent, context, model, maxTurns = DEFAULT_MAX_TURNS } = input;

    const delegationId = generateDelegationId();

    const signal: DelegateAgentSignal = {
      type: "delegate_agent",
      targetAgent,
      task,
      context,
      model,
      maxTurns,
      delegationId,
    };

    // Build message describing the delegation
    const parts = [`Delegating task to subagent (ID: ${delegationId})`];
    parts.push(`Task: ${task}`);
    if (context) {
      parts.push(`Context: ${context}`);
    }
    if (model) {
      parts.push(`Model: ${model}`);
    }
    parts.push(`Max turns: ${maxTurns}`);

    return ok({
      signal,
      message: parts.join("\n"),
    });
  },

  shouldConfirm(_input, _ctx) {
    // Subagent spawning should always require confirmation
    // as it consumes resources and has potential for extended execution
    return true;
  },
});
