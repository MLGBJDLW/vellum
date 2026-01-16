/**
 * Attempt Completion Tool
 *
 * Signals task completion with optional verification command.
 *
 * @module builtin/attempt-completion
 */

import { z } from "zod";

import { defineTool, fail, ok } from "../types/index.js";
import { executeShell, getSandboxOptions } from "./utils/index.js";

/**
 * Schema for attempt_completion tool parameters
 */
export const attemptCompletionParamsSchema = z.object({
  /** Summary of the completed task */
  result: z.string().describe("Summary of the completed task and what was accomplished"),
  /** Optional command to verify completion */
  command: z
    .string()
    .optional()
    .describe("Optional shell command to verify the task was completed successfully"),
});

/** Inferred type for attempt_completion parameters */
export type AttemptCompletionParams = z.infer<typeof attemptCompletionParamsSchema>;

/** Output type for attempt_completion tool */
export interface AttemptCompletionOutput {
  /** The completion result summary */
  result: string;
  /** Whether verification command was run */
  verified: boolean;
  /** Verification command output (if run) */
  verificationOutput?: string;
  /** Whether verification passed (if run) */
  verificationPassed?: boolean;
  /** Signal that the agent loop should stop */
  completed: true;
}

/**
 * Attempt completion tool implementation
 *
 * Signals that the agent believes the task is complete.
 * Optionally runs a verification command to confirm completion.
 *
 * @example
 * ```typescript
 * // Simple completion
 * const result = await attemptCompletionTool.execute(
 *   { result: "Created the user authentication module with login and logout functions." },
 *   ctx
 * );
 *
 * // Completion with verification
 * const result = await attemptCompletionTool.execute(
 *   {
 *     result: "Fixed the failing test in auth.test.ts",
 *     command: "npm test -- auth.test.ts"
 *   },
 *   ctx
 * );
 * ```
 */
export const attemptCompletionTool = defineTool({
  name: "attempt_completion",
  description:
    "Signal that you believe the task is complete. Provide a summary of what was accomplished. Optionally include a command to verify the completion.",
  parameters: attemptCompletionParamsSchema,
  kind: "agent",
  category: "agent",
  enabled: false,

  async execute(input, ctx) {
    // Check for cancellation
    if (ctx.abortSignal.aborted) {
      return fail("Operation was cancelled");
    }

    // If no verification command, just return completion
    if (!input.command) {
      return ok({
        result: input.result,
        verified: false,
        completed: true,
      });
    }

    // Run verification command
    try {
      const sandboxOptions = getSandboxOptions(ctx);
      const shellResult = await executeShell(input.command, {
        cwd: ctx.workingDir,
        timeout: 60000, // 1 minute timeout for verification
        abortSignal: ctx.abortSignal,
        sandbox: sandboxOptions,
      });

      const output = shellResult.stdout + shellResult.stderr;
      const passed = shellResult.exitCode === 0 && !shellResult.killed;

      return ok({
        result: input.result,
        verified: true,
        verificationOutput: output.trim(),
        verificationPassed: passed,
        completed: true,
      });
    } catch (error) {
      if (error instanceof Error) {
        return ok({
          result: input.result,
          verified: true,
          verificationOutput: `Verification command failed: ${error.message}`,
          verificationPassed: false,
          completed: true,
        });
      }
      return ok({
        result: input.result,
        verified: true,
        verificationOutput: "Unknown error during verification",
        verificationPassed: false,
        completed: true,
      });
    }
  },

  shouldConfirm(_input, _ctx) {
    // Completion signals don't need confirmation
    return false;
  },
});
