/**
 * CLI Resume Command (T045 - REQ-034)
 *
 * Implements the `vellum resume [chainId]` CLI command
 * for resuming interrupted task chains.
 *
 * @module cli/agents/commands/resume
 */

import type { Command } from "commander";
import { getOrCreateOrchestrator, getOrchestrator } from "../../orchestrator-singleton.js";
import { ICONS } from "../../utils/icons.js";

import { createTaskPersistence, type TaskPersistence } from "../task-persistence.js";
import {
  createTaskResumption,
  type ResumeOptions,
  type ResumeResult,
  type TaskResumption,
} from "../task-resumption.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Options for the resume command.
 *
 * @example
 * ```typescript
 * const options: ResumeCommandOptions = {
 *   skipFailed: true,
 *   retryFailed: false,
 *   from: 'task-123',
 * };
 * ```
 */
export interface ResumeCommandOptions {
  /** Skip tasks that previously failed */
  skipFailed?: boolean;
  /** Retry failed tasks instead of skipping */
  retryFailed?: boolean;
  /** Resume from a specific task ID */
  from?: string;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Format a date for display in the CLI.
 *
 * @param date - Date to format
 * @returns Formatted date string
 */
function formatDate(date: Date): string {
  return date.toLocaleString();
}

/**
 * Format a chain status for display with emoji indicator.
 *
 * @param status - Chain status
 * @returns Formatted status string with emoji
 */
function formatStatus(status: string): string {
  switch (status) {
    case "paused":
      return "[PAUSE] paused";
    case "running":
      return `${ICONS.interrupted} interrupted`;
    case "completed":
      return `${ICONS.success} completed`;
    case "failed":
      return `${ICONS.error} failed`;
    default:
      return status;
  }
}

/**
 * Display a list of resumable chains in the terminal.
 *
 * @param chains - Array of resumable chain metadata
 */
function displayResumableChains(
  chains: Array<{ chainId: string; savedAt: Date; status: string }>
): void {
  if (chains.length === 0) {
    console.log("\nNo resumable task chains found.");
    console.log("   Task chains become resumable when paused or interrupted.\n");
    return;
  }

  console.log(`\n${ICONS.workflow} Resumable Task Chains:\n`);
  console.log("   %-40s  %-20s  %s", "Chain ID", "Status", "Saved At");
  console.log(`   ${"-".repeat(80)}`);

  for (const chain of chains) {
    console.log(
      "   %-40s  %-20s  %s",
      chain.chainId,
      formatStatus(chain.status),
      formatDate(chain.savedAt)
    );
  }

  console.log("\n   Use 'vellum resume <chainId>' to resume a specific chain.\n");
}

/**
 * Display detailed resume options for a chain.
 *
 * @param chainId - The chain ID
 * @param options - Resume options for the chain
 */
function displayResumeOptions(
  chainId: string,
  options: {
    lastCompletedTask: string;
    pendingTasks: string[];
    failedTasks: string[];
  }
): void {
  console.log(`\n📊 Chain Status: ${chainId}\n`);

  if (options.lastCompletedTask) {
    console.log(`   Last Completed: ${options.lastCompletedTask}`);
  } else {
    console.log("   Last Completed: (none)");
  }

  console.log(`   Pending Tasks:  ${options.pendingTasks.length}`);
  if (options.pendingTasks.length > 0 && options.pendingTasks.length <= 5) {
    for (const task of options.pendingTasks) {
      console.log(`     - ${task}`);
    }
  } else if (options.pendingTasks.length > 5) {
    for (const task of options.pendingTasks.slice(0, 3)) {
      console.log(`     - ${task}`);
    }
    console.log(`     ... and ${options.pendingTasks.length - 3} more`);
  }

  console.log(`   Failed Tasks:   ${options.failedTasks.length}`);
  if (options.failedTasks.length > 0) {
    for (const task of options.failedTasks) {
      console.log(`     - ${task}`);
    }
  }

  console.log("");
}

/**
 * Display the result of a resume operation.
 *
 * @param result - Resume operation result
 */
function displayResumeResult(result: ResumeResult): void {
  if (!result.resumed) {
    console.error(`\n${ICONS.error} Failed to resume chain: ${result.chainId}`);
    console.error("   Chain may not exist or is not in a resumable state.\n");
    return;
  }

  console.log(`\n${ICONS.success} Successfully resumed chain: ${result.chainId}`);
  console.log(`   From Task:        ${result.fromTaskId || "(start)"}`);
  console.log(`   Tasks Remaining:  ${result.totalRemaining}`);

  if (result.skippedCount > 0) {
    console.log(`   Tasks Skipped:    ${result.skippedCount}`);
  }

  console.log("");
}

// =============================================================================
// Command Actions
// =============================================================================

/**
 * List all resumable task chains.
 *
 * @param persistence - Task persistence instance
 */
async function listResumableChains(persistence: TaskPersistence): Promise<void> {
  const chains = await persistence.listResumable();
  displayResumableChains(chains);
}

/**
 * Resume a specific task chain.
 *
 * @param chainId - The chain ID to resume
 * @param options - Resume command options
 * @param persistence - Task persistence instance
 * @param resumption - Task resumption instance
 */
async function resumeChain(
  chainId: string,
  options: ResumeCommandOptions,
  _persistence: TaskPersistence,
  resumption: TaskResumption
): Promise<void> {
  // First, check if the chain can be resumed
  const canResume = await resumption.canResume(chainId);

  if (!canResume) {
    console.error(`\n${ICONS.error} Chain '${chainId}' cannot be resumed.`);
    console.error("   It may not exist or is not in a resumable state (paused/interrupted).\n");
    process.exit(1);
  }

  // Get and display resume options
  const resumeOptions = await resumption.getResumeOptions(chainId);

  if (resumeOptions) {
    displayResumeOptions(chainId, resumeOptions);
  }

  // Build resume options
  const resumeParams: ResumeOptions = {
    skipFailed: options.skipFailed,
    retryFailed: options.retryFailed,
    fromTask: options.from,
  };

  // Validate options
  if (options.skipFailed && options.retryFailed) {
    console.error(`\n${ICONS.error} Cannot use both --skip-failed and --retry-failed options.\n`);
    process.exit(1);
  }

  // If --from is specified, validate it exists in pending or failed tasks
  if (options.from && resumeOptions) {
    const allTasks = [...resumeOptions.pendingTasks, ...resumeOptions.failedTasks];
    if (!allTasks.includes(options.from)) {
      console.error(
        `\n${ICONS.error} Task '${options.from}' not found in pending or failed tasks.\n`
      );
      console.error("   Available tasks:");
      for (const task of allTasks.slice(0, 10)) {
        console.error(`     - ${task}`);
      }
      if (allTasks.length > 10) {
        console.error(`     ... and ${allTasks.length - 10} more`);
      }
      console.log("");
      process.exit(1);
    }
  }

  // Execute resume
  console.log(`${ICONS.running} Resuming task chain...`);
  const result = await resumption.resume(chainId, resumeParams);

  displayResumeResult(result);

  if (!result.resumed) {
    process.exit(1);
  }
}

// =============================================================================
// Command Registration
// =============================================================================

/**
 * Register the resume command with Commander.js.
 *
 * Command: `vellum resume [chainId]`
 *
 * If no chainId is provided, lists all resumable chains.
 *
 * Options:
 *   --skip-failed      Skip previously failed tasks
 *   --retry-failed     Retry previously failed tasks
 *   --from <taskId>    Resume from specific task
 *
 * @example
 * ```bash
 * # List all resumable chains
 * vellum resume
 *
 * # Resume a specific chain
 * vellum resume chain-abc123
 *
 * # Resume and skip failed tasks
 * vellum resume chain-abc123 --skip-failed
 *
 * # Resume and retry failed tasks
 * vellum resume chain-abc123 --retry-failed
 *
 * # Resume from a specific task
 * vellum resume chain-abc123 --from task-456
 * ```
 *
 * @param program - Commander program instance
 */
export function registerResumeCommand(program: Command): void {
  program
    .command("resume [chainId]")
    .description("Resume an interrupted task chain")
    .option("--skip-failed", "Skip previously failed tasks")
    .option("--retry-failed", "Retry previously failed tasks")
    .option("--from <taskId>", "Resume from specific task")
    .action(async (chainId: string | undefined, options: Record<string, unknown>) => {
      try {
        // Parse options
        const commandOptions: ResumeCommandOptions = {
          skipFailed: options.skipFailed === true,
          retryFailed: options.retryFailed === true,
          from: options.from as string | undefined,
        };

        // Create persistence and resumption instances
        const persistence = createTaskPersistence();
        const orchestrator = getOrchestrator() ?? getOrCreateOrchestrator();
        const resumption = createTaskResumption(persistence, orchestrator);

        if (!chainId) {
          // List all resumable chains
          await listResumableChains(persistence);
        } else {
          // Resume specific chain
          await resumeChain(chainId, commandOptions, persistence, resumption);
        }
      } catch (error) {
        console.error(`\n${ICONS.error} Error:`, error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });
}
