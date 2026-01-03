/**
 * Spec Command
 *
 * CLI command for managing spec workflows with subcommands:
 * - start: Begin a new spec workflow
 * - continue: Resume from checkpoint
 * - status: Show workflow status
 *
 * Usage:
 * - `vellum spec "feature description"` - Start new spec
 * - `vellum spec --continue` - Resume from latest checkpoint
 * - `vellum spec --status` - Show current status
 * - `vellum spec --from=design` - Start from specific phase
 *
 * @module cli/commands/spec
 */

import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  type PhaseResult,
  SPEC_PHASES,
  type SpecPhase,
  SpecWorkflowEngine,
  type SpecWorkflowEngineConfig,
  type SpecWorkflowStatus,
  type WorkflowResult,
} from "@vellum/core";
import chalk from "chalk";

import { EXIT_CODES } from "./exit-codes.js";
import type { CommandContext, CommandResult, SlashCommand } from "./types.js";
import { error, pending, success } from "./types.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Spec command options
 */
export interface SpecOptions {
  /** Feature description for new spec */
  description?: string;
  /** Continue from checkpoint */
  continue?: boolean;
  /** Show status only */
  status?: boolean;
  /** Start from specific phase */
  from?: SpecPhase;
  /** Phases to skip */
  skip?: SpecPhase[];
  /** Spec directory (defaults to .ouroboros/specs/<name>) */
  specDir?: string;
}

/**
 * Spec command result
 */
export interface SpecResult {
  /** Whether operation succeeded */
  success: boolean;
  /** Spec directory path */
  specDir?: string;
  /** Workflow result (if executed) */
  workflowResult?: WorkflowResult;
  /** Status information (if requested) */
  status?: SpecWorkflowStatus;
  /** Error message if failed */
  error?: string;
  /** Exit code */
  exitCode: number;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Default spec output directory
 */
const DEFAULT_SPEC_BASE = ".ouroboros/specs";

/**
 * Phase display names for formatting
 */
const PHASE_DISPLAY_NAMES: Record<SpecPhase, string> = {
  research: "📚 Research",
  requirements: "📋 Requirements",
  design: "🏗️ Design",
  tasks: "📝 Tasks",
  implementation: "⚙️ Implementation",
  validation: "✅ Validation",
};

// =============================================================================
// Helpers
// =============================================================================

/**
 * Generate a slug from a description
 */
function generateSlug(description: string): string {
  return description
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .substring(0, 50)
    .replace(/-$/, "");
}

/**
 * Ensure spec directory exists
 */
function ensureSpecDir(specDir: string): void {
  if (!existsSync(specDir)) {
    mkdirSync(specDir, { recursive: true });
  }
}

/**
 * Format phase status for display
 */
function formatPhaseStatus(phase: SpecPhase, status: string): string {
  const emoji =
    status === "completed"
      ? "✅"
      : status === "running"
        ? "🔄"
        : status === "failed"
          ? "❌"
          : status === "skipped"
            ? "⏭️"
            : "⏳";

  return `${emoji} ${PHASE_DISPLAY_NAMES[phase]}: ${status}`;
}

/**
 * Format workflow status for display
 */
function formatStatus(status: SpecWorkflowStatus): string {
  const lines: string[] = [];
  const currentPhase = status.state.currentPhase as SpecPhase;

  lines.push(chalk.bold.blue("📐 Spec Workflow Status"));
  lines.push("");
  lines.push(`Workflow: ${status.state.name}`);
  lines.push(
    `Progress: ${status.progress.completed}/${status.progress.total} (${status.progress.percentage}%)`
  );
  lines.push(`Current Phase: ${PHASE_DISPLAY_NAMES[currentPhase]}`);
  lines.push("");
  lines.push(chalk.bold("Phase Status:"));

  for (const phase of SPEC_PHASES) {
    const phaseState = status.state.phases[phase];
    const phaseStatus = phaseState?.status ?? "pending";
    lines.push(`  ${formatPhaseStatus(phase, phaseStatus)}`);
  }

  return lines.join("\n");
}

/**
 * Format workflow result for display
 */
function formatResult(result: WorkflowResult): string {
  const lines: string[] = [];

  if (result.success) {
    lines.push(chalk.green.bold("✅ Spec workflow completed successfully!"));
  } else {
    lines.push(chalk.red.bold("❌ Spec workflow failed"));
    if (result.error) {
      lines.push(chalk.red(`Error: ${result.error}`));
    }
  }

  lines.push("");
  lines.push(`Total duration: ${Math.round(result.totalDuration / 1000)}s`);
  lines.push(`Phases completed: ${result.phases.filter((p: PhaseResult) => p.success).length}`);

  return lines.join("\n");
}

/**
 * Validate phase name
 */
function isValidPhase(phase: string): phase is SpecPhase {
  return SPEC_PHASES.includes(phase as SpecPhase);
}

// =============================================================================
// Spec Command Executor
// =============================================================================

/**
 * Execute spec start command
 */
async function executeSpecStart(description: string, options: SpecOptions): Promise<SpecResult> {
  const slug = generateSlug(description);
  const specDir = options.specDir ?? resolve(join(process.cwd(), DEFAULT_SPEC_BASE, slug));

  console.log(chalk.bold.blue("\n📐 Starting Spec Workflow\n"));
  console.log(`Description: ${description}`);
  console.log(`Directory: ${specDir}`);
  if (options.from) {
    console.log(`Starting from: ${options.from}`);
  }
  console.log("");

  try {
    ensureSpecDir(specDir);

    const config: SpecWorkflowEngineConfig = {
      specDir,
      startFromPhase: options.from,
      skipPhases: options.skip,
    };

    const engine = new SpecWorkflowEngine(config);

    // Listen for phase events
    engine.on("phase:start", (phase: SpecPhase) => {
      console.log(chalk.cyan(`\n▶ Starting phase: ${PHASE_DISPLAY_NAMES[phase]}`));
    });

    engine.on("phase:complete", (result: PhaseResult) => {
      if (result.success) {
        console.log(chalk.green(`✓ Phase ${PHASE_DISPLAY_NAMES[result.phase]} complete`));
      } else {
        console.log(
          chalk.red(`✗ Phase ${PHASE_DISPLAY_NAMES[result.phase]} failed: ${result.error}`)
        );
      }
    });

    engine.on("checkpoint:saved", (checkpointId: string) => {
      console.log(chalk.gray(`  💾 Checkpoint saved: ${checkpointId}`));
    });

    const result = await engine.start(slug, description);

    console.log(`\n${formatResult(result)}`);

    return {
      success: result.success,
      specDir,
      workflowResult: result,
      exitCode: result.success ? EXIT_CODES.SUCCESS : EXIT_CODES.ERROR,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`\n❌ Failed to start spec workflow: ${message}`));
    return {
      success: false,
      specDir,
      error: message,
      exitCode: EXIT_CODES.ERROR,
    };
  }
}

/**
 * Execute spec continue command
 */
async function executeSpecContinue(options: SpecOptions): Promise<SpecResult> {
  const specDir = options.specDir ?? resolve(join(process.cwd(), DEFAULT_SPEC_BASE));

  console.log(chalk.bold.blue("\n📐 Resuming Spec Workflow\n"));
  console.log(`Directory: ${specDir}`);
  console.log("");

  try {
    if (!existsSync(specDir)) {
      return {
        success: false,
        error: `Spec directory not found: ${specDir}`,
        exitCode: EXIT_CODES.ERROR,
      };
    }

    const config: SpecWorkflowEngineConfig = {
      specDir,
      skipPhases: options.skip,
    };

    const engine = new SpecWorkflowEngine(config);

    // Listen for phase events
    engine.on("phase:start", (phase: SpecPhase) => {
      console.log(chalk.cyan(`\n▶ Starting phase: ${PHASE_DISPLAY_NAMES[phase]}`));
    });

    engine.on("phase:complete", (result: PhaseResult) => {
      if (result.success) {
        console.log(chalk.green(`✓ Phase ${PHASE_DISPLAY_NAMES[result.phase]} complete`));
      } else {
        console.log(
          chalk.red(`✗ Phase ${PHASE_DISPLAY_NAMES[result.phase]} failed: ${result.error}`)
        );
      }
    });

    const result = await engine.resume();

    console.log(`\n${formatResult(result)}`);

    return {
      success: result.success,
      specDir,
      workflowResult: result,
      exitCode: result.success ? EXIT_CODES.SUCCESS : EXIT_CODES.ERROR,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`\n❌ Failed to resume spec workflow: ${message}`));
    return {
      success: false,
      specDir,
      error: message,
      exitCode: EXIT_CODES.ERROR,
    };
  }
}

/**
 * Execute spec status command
 */
async function executeSpecStatus(options: SpecOptions): Promise<SpecResult> {
  const specDir = options.specDir ?? resolve(join(process.cwd(), DEFAULT_SPEC_BASE));

  try {
    if (!existsSync(specDir)) {
      console.log(chalk.yellow("\nNo spec workflow found in this project."));
      console.log(chalk.gray('Run `vellum spec "description"` to start a new spec.\n'));
      return {
        success: true,
        exitCode: EXIT_CODES.SUCCESS,
      };
    }

    const config: SpecWorkflowEngineConfig = {
      specDir,
    };

    const engine = new SpecWorkflowEngine(config);
    const status = engine.getStatus();

    console.log(`\n${formatStatus(status)}\n`);

    return {
      success: true,
      specDir,
      status,
      exitCode: EXIT_CODES.SUCCESS,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`\n❌ Failed to get spec status: ${message}`));
    return {
      success: false,
      specDir,
      error: message,
      exitCode: EXIT_CODES.ERROR,
    };
  }
}

/**
 * Main spec command executor
 */
export async function executeSpec(options: SpecOptions = {}): Promise<SpecResult> {
  // Validate --from option if provided
  if (options.from && !isValidPhase(options.from)) {
    console.error(chalk.red(`Invalid phase: ${options.from}`));
    console.log(chalk.gray(`Valid phases: ${SPEC_PHASES.join(", ")}`));
    return {
      success: false,
      error: `Invalid phase: ${options.from}`,
      exitCode: EXIT_CODES.ERROR,
    };
  }

  // Validate --skip option if provided
  if (options.skip) {
    for (const phase of options.skip) {
      if (!isValidPhase(phase)) {
        console.error(chalk.red(`Invalid skip phase: ${phase}`));
        console.log(chalk.gray(`Valid phases: ${SPEC_PHASES.join(", ")}`));
        return {
          success: false,
          error: `Invalid skip phase: ${phase}`,
          exitCode: EXIT_CODES.ERROR,
        };
      }
    }
  }

  // Route to appropriate subcommand
  if (options.status) {
    return executeSpecStatus(options);
  }

  if (options.continue) {
    return executeSpecContinue(options);
  }

  if (options.description) {
    return executeSpecStart(options.description, options);
  }

  // No subcommand specified - show help
  console.log(chalk.bold.blue("\n📐 Spec Workflow Commands\n"));
  console.log('  vellum spec "description"  Start a new spec workflow');
  console.log("  vellum spec --continue     Resume from checkpoint");
  console.log("  vellum spec --status       Show workflow status");
  console.log("");
  console.log(chalk.bold("Options:"));
  console.log("  --from=<phase>             Start from specific phase");
  console.log("  --skip=<phase1,phase2>     Skip specific phases");
  console.log("  --dir=<path>               Custom spec directory");
  console.log("");
  console.log(chalk.gray(`Valid phases: ${SPEC_PHASES.join(", ")}`));
  console.log("");

  return {
    success: true,
    exitCode: EXIT_CODES.SUCCESS,
  };
}

// =============================================================================
// Slash Command Definition (for TUI)
// =============================================================================

/**
 * /spec slash command for TUI
 *
 * Manages spec workflows from within the TUI.
 */
export const specSlashCommand: SlashCommand = {
  name: "spec",
  description: "Manage spec workflows",
  kind: "builtin",
  category: "system",
  aliases: [],
  positionalArgs: [
    {
      name: "description",
      type: "string",
      description: "Feature description for new spec",
      required: false,
    },
  ],
  namedArgs: [
    {
      name: "continue",
      shorthand: "c",
      type: "boolean",
      description: "Resume from checkpoint",
      required: false,
      default: false,
    },
    {
      name: "status",
      shorthand: "s",
      type: "boolean",
      description: "Show workflow status",
      required: false,
      default: false,
    },
    {
      name: "from",
      shorthand: "f",
      type: "string",
      description: "Start from specific phase",
      required: false,
    },
    {
      name: "skip",
      type: "string",
      description: "Comma-separated phases to skip",
      required: false,
    },
    {
      name: "dir",
      shorthand: "d",
      type: "string",
      description: "Custom spec directory",
      required: false,
    },
  ],
  examples: [
    '/spec "Add user authentication"  - Start new spec',
    "/spec --continue                 - Resume from checkpoint",
    "/spec --status                   - Show status",
    "/spec --from=design              - Start from design phase",
    '/spec "Feature" --skip=research  - Skip research phase',
  ],

  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    const description = ctx.parsedArgs.positional[0] as string | undefined;
    const continueOpt = ctx.parsedArgs.named.continue as boolean | undefined;
    const statusOpt = ctx.parsedArgs.named.status as boolean | undefined;
    const fromOpt = ctx.parsedArgs.named.from as string | undefined;
    const skipOpt = ctx.parsedArgs.named.skip as string | undefined;
    const dirOpt = ctx.parsedArgs.named.dir as string | undefined;

    // Parse skip phases
    const skipPhases = skipOpt ? (skipOpt.split(",") as SpecPhase[]) : undefined;

    return pending({
      message: "Running spec workflow...",
      showProgress: true,
      promise: (async (): Promise<CommandResult> => {
        const result = await executeSpec({
          description,
          continue: continueOpt,
          status: statusOpt,
          from: fromOpt as SpecPhase | undefined,
          skip: skipPhases,
          specDir: dirOpt,
        });

        if (result.success) {
          if (result.status) {
            return success(formatStatus(result.status), { status: result.status });
          }
          if (result.workflowResult) {
            return success(formatResult(result.workflowResult), {
              workflowResult: result.workflowResult,
            });
          }
          return success("Spec command completed");
        }

        return error("INTERNAL_ERROR", result.error ?? "Spec command failed");
      })(),
    });
  },
};
