/**
 * Shell Tool
 *
 * Cross-platform shell command execution.
 * Uses PowerShell on Windows, bash on Unix.
 *
 * @module builtin/shell
 */

import { z } from "zod";

import { CONFIG_DEFAULTS } from "../config/defaults.js";
import { defineTool, fail, ok } from "../types/index.js";
import { detectShell, executeShell, getSandboxOptions, type ShellResult } from "./utils/index.js";

/** Default timeout for shell commands (2 minutes) */
const DEFAULT_TIMEOUT = CONFIG_DEFAULTS.timeouts.shell;

/**
 * Schema for shell tool parameters
 */
export const shellParamsSchema = z.object({
  /** Command to execute */
  command: z.string().describe("The shell command to execute"),
  /** Timeout in milliseconds (default: 120000) */
  timeout: z
    .number()
    .int()
    .positive()
    .optional()
    .default(DEFAULT_TIMEOUT)
    .describe("Timeout in milliseconds (default: 120000)"),
  /** Working directory for command execution */
  cwd: z.string().optional().describe("Working directory for command execution"),
});

/** Inferred type for shell parameters */
export type ShellParams = z.infer<typeof shellParamsSchema>;

/** Output type for shell tool */
export interface ShellOutput {
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
  /** Shell that was used */
  shell: string;
}

/**
 * Shell tool implementation
 *
 * Cross-platform shell command execution.
 * Automatically selects the appropriate shell for the current platform:
 * - Windows: PowerShell (pwsh or powershell)
 * - Unix: bash
 *
 * @example
 * ```typescript
 * // Execute a shell command
 * const result = await shellTool.execute(
 *   { command: "echo Hello World" },
 *   ctx
 * );
 *
 * // With custom working directory
 * const result = await shellTool.execute(
 *   { command: "npm install", cwd: "/path/to/project" },
 *   ctx
 * );
 *
 * // With timeout
 * const result = await shellTool.execute(
 *   { command: "npm test", timeout: 300000 },
 *   ctx
 * );
 * ```
 */
export const shellTool = defineTool({
  name: "shell",
  description:
    "Execute shell commands (cross-platform, recommended). Uses PowerShell on Windows and bash on Unix/macOS.",
  parameters: shellParamsSchema,
  kind: "shell",
  category: "execution",

  async execute(input, ctx) {
    // Check for cancellation
    if (ctx.abortSignal.aborted) {
      return fail("Operation was cancelled");
    }

    // Check permission for shell execution
    const hasPermission = await ctx.checkPermission("shell", input.command);
    if (!hasPermission) {
      return fail(`Permission denied: cannot execute shell command`);
    }

    // Detect the appropriate shell for this platform
    const { shell } = detectShell();

    // Determine working directory
    const workingDir = input.cwd ?? ctx.workingDir;

    try {
      const sandboxOptions = getSandboxOptions(ctx);
      const result: ShellResult = await executeShell(input.command, {
        cwd: workingDir,
        timeout: input.timeout,
        abortSignal: ctx.abortSignal,
        sandbox: sandboxOptions,
        onStdout: ctx.onStdout,
        onStderr: ctx.onStderr,
      });

      return ok({
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        killed: result.killed,
        duration: result.duration,
        shell,
      });
    } catch (error) {
      if (error instanceof Error) {
        return fail(`Failed to execute shell command: ${error.message}`);
      }
      return fail("Unknown error occurred while executing shell command");
    }
  },

  shouldConfirm(_input, _ctx) {
    // Shell commands should require confirmation
    return true;
  },
});
