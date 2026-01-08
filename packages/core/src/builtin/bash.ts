/**
 * Bash Tool
 *
 * Executes bash commands on Unix systems.
 * Returns an error on Windows directing users to use the cross-platform shell tool.
 *
 * @module builtin/bash
 */

import { platform } from "node:os";
import { z } from "zod";

import { CONFIG_DEFAULTS } from "../config/defaults.js";
import { defineTool, fail, ok } from "../types/index.js";
import { executeShell, getSandboxOptions, type ShellResult } from "./utils/index.js";

/** Default timeout for bash commands (2 minutes) */
const DEFAULT_TIMEOUT = CONFIG_DEFAULTS.timeouts.bashExecution;

/**
 * Schema for bash tool parameters
 */
export const bashParamsSchema = z.object({
  /** Command to execute in bash */
  command: z.string().describe("The bash command to execute"),
  /** Timeout in milliseconds (default: 120000) */
  timeout: z
    .number()
    .int()
    .positive()
    .optional()
    .default(DEFAULT_TIMEOUT)
    .describe("Timeout in milliseconds (default: 120000)"),
});

/** Inferred type for bash parameters */
export type BashParams = z.infer<typeof bashParamsSchema>;

/** Output type for bash tool */
export interface BashOutput {
  /** Standard output from the command */
  stdout: string;
  /** Standard error from the command */
  stderr: string;
  /** Exit code of the process (null if killed) */
  exitCode: number | null;
  /** Whether the process was killed (timeout or abort) */
  killed: boolean;
  /** Execution duration in milliseconds */
  duration: number;
}

/**
 * Bash tool implementation
 *
 * Executes bash commands on Unix systems.
 * On Windows, returns an error directing users to use the cross-platform shell tool.
 *
 * @example
 * ```typescript
 * // Execute a bash command
 * const result = await bashTool.execute(
 *   { command: "ls -la" },
 *   ctx
 * );
 *
 * // With custom timeout
 * const result = await bashTool.execute(
 *   { command: "npm install", timeout: 300000 },
 *   ctx
 * );
 * ```
 */
export const bashTool = defineTool({
  name: "bash",
  description:
    "Execute a bash command. Only available on Unix systems (Linux, macOS). Use 'shell' tool for cross-platform commands.",
  parameters: bashParamsSchema,
  kind: "shell",
  category: "execution",

  async execute(input, ctx) {
    // Check for cancellation
    if (ctx.abortSignal.aborted) {
      return fail("Operation was cancelled");
    }

    // Check platform - bash is Unix only
    const currentPlatform = platform();
    if (currentPlatform === "win32") {
      return fail(
        "bash tool is only available on Unix systems. Use 'shell' for cross-platform commands."
      );
    }

    // Check permission for shell execution
    const hasPermission = await ctx.checkPermission("shell", input.command);
    if (!hasPermission) {
      return fail(`Permission denied: cannot execute shell command`);
    }

    try {
      const sandboxOptions = getSandboxOptions(ctx);
      const result: ShellResult = await executeShell(input.command, {
        cwd: ctx.workingDir,
        timeout: input.timeout,
        abortSignal: ctx.abortSignal,
        shell: "/bin/bash",
        sandbox: sandboxOptions,
      });

      return ok({
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        killed: result.killed,
        duration: result.duration,
      });
    } catch (error) {
      if (error instanceof Error) {
        return fail(`Failed to execute bash command: ${error.message}`);
      }
      return fail("Unknown error occurred while executing bash command");
    }
  },

  shouldConfirm(_input, _ctx) {
    // Shell commands should require confirmation
    return true;
  },
});
