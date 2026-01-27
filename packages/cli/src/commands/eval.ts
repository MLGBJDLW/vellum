/**
 * CLI Eval Command
 *
 * Run agent evaluation tasks with various filtering and reporting options.
 *
 * @module cli/commands/eval
 */

import { writeFile } from "node:fs/promises";
import {
  type Difficulty,
  EvalRunner,
  type RunOptions,
  type RunResult,
  type TaskFilter,
} from "@vellum/eval";
import chalk from "chalk";
import { Command } from "commander";

/**
 * Helper to collect multiple option values into an array.
 */
function collect(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

/**
 * Parse an integer option value.
 * @throws Error if value is not a valid integer
 */
function parseIntOption(value: string): number {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid number: ${value}`);
  }
  return parsed;
}

/**
 * Parse a float option value.
 * @throws Error if value is not a valid number
 */
function parseFloatOption(value: string): number {
  const parsed = parseFloat(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid number: ${value}`);
  }
  return parsed;
}

interface EvalOptions {
  all?: boolean;
  category?: string;
  difficulty?: string;
  tag?: string[];
  provider?: string;
  model?: string;
  mock?: boolean;
  runs?: number;
  baseline?: string;
  failOnRegression?: boolean;
  regressionThreshold?: number;
  report?: string;
  tasksDir?: string;
  quiet?: boolean;
}

/**
 * Build a TaskFilter from CLI options.
 */
function buildFilter(taskId: string | undefined, options: EvalOptions): TaskFilter {
  const filter: TaskFilter = {};

  // If taskId provided with --all, treat it as a specific ID filter
  if (taskId && options.all) {
    filter.ids = [taskId];
  }

  if (options.category) {
    filter.category = options.category;
  }

  if (options.difficulty) {
    filter.difficulty = options.difficulty as Difficulty;
  }

  if (options.tag && options.tag.length > 0) {
    filter.tags = options.tag;
  }

  return filter;
}

/**
 * Run the evaluation with the given options.
 */
async function runEval(taskId: string | undefined, options: EvalOptions): Promise<void> {
  const runner = new EvalRunner({
    tasksDir: options.tasksDir,
  });

  // Setup progress logging if not quiet
  if (!options.quiet) {
    runner.on("taskStart", (id: string, runIndex: number, totalRuns: number) => {
      console.log(chalk.blue(`🔄 Task ${id} - Run ${runIndex + 1}/${totalRuns}`));
    });

    runner.on("taskComplete", (_id: string, _runIndex: number, result: RunResult) => {
      const status = result.pass ? chalk.green("✅") : chalk.red("❌");
      console.log(`  ${status} Score: ${result.score.toFixed(2)} (${result.durationMs}ms)`);
    });

    runner.on("suiteProgress", (completed: number, total: number, passRate: number) => {
      console.log(
        chalk.cyan(
          `📊 Progress: ${completed}/${total} tasks (${(passRate * 100).toFixed(1)}% pass rate)`
        )
      );
    });

    runner.on("taskError", (id: string, error: Error) => {
      console.error(chalk.yellow(`⚠️ Error in task ${id}: ${error.message}`));
    });
  }

  // Build run options
  const runOptions: RunOptions = {
    runs: options.runs ?? 3,
    useMock: options.mock ?? false,
    providerType: options.provider ?? "anthropic",
    model: options.model ?? "claude-sonnet-4-20250514",
    baseline: options.baseline,
    failOnRegression: options.failOnRegression ?? false,
    regressionThreshold: options.regressionThreshold ?? 0.1,
  };

  try {
    if (taskId && !options.all) {
      // Run single task
      console.log(chalk.bold(`\n🎯 Running evaluation for task: ${taskId}\n`));
      const result = await runner.runTask(taskId, runOptions);

      // Print single task result
      console.log(`\nTask: ${chalk.bold(result.taskId)}`);
      console.log(`  Pass@1: ${chalk.cyan((result.passAtK["pass@1"] * 100).toFixed(1))}%`);
      console.log(`  Pass@3: ${chalk.cyan((result.passAtK["pass@3"] * 100).toFixed(1))}%`);
      console.log(`  Avg Score: ${chalk.cyan(result.avgScore.toFixed(3))}`);
      console.log(`  Cost: ${chalk.yellow(`$${result.totalEstimatedCost.toFixed(4)}`)}`);

      if (result.errors.length > 0) {
        console.log(`  Errors: ${chalk.red(result.errors.slice(0, 3).join(", "))}`);
      }

      // Exit with error if task failed and fail-on-regression is set
      if (!result.pass && options.failOnRegression) {
        process.exit(1);
      }
    } else {
      // Run suite
      const filter = buildFilter(taskId, options);

      console.log(chalk.bold(`\n🧪 Running evaluation suite\n`));
      if (filter.category) console.log(`  Category: ${chalk.cyan(filter.category)}`);
      if (filter.difficulty) console.log(`  Difficulty: ${chalk.cyan(filter.difficulty)}`);
      if (filter.tags?.length) console.log(`  Tags: ${chalk.cyan(filter.tags.join(", "))}`);
      console.log(`  Runs per task: ${chalk.cyan(runOptions.runs)}`);
      console.log();

      const report = await runner.runSuite(filter, runOptions);

      // Print report
      runner.getReporter().printReport(report);

      // Save report if requested
      if (options.report) {
        await writeFile(options.report, JSON.stringify(report, null, 2), "utf-8");
        console.log(chalk.green(`📄 Report saved to: ${options.report}`));
      }

      // Check for regression failures
      if (options.failOnRegression && runner.getReporter().hasRegressions(report)) {
        console.error(chalk.red("\n❌ Regression detected - exiting with error"));
        process.exit(1);
      }
    }
  } catch (error) {
    console.error(chalk.red(`\n❌ Evaluation failed: ${error}`));
    process.exit(1);
  }
}

/**
 * Create the eval command with all CLI options.
 */
export function createEvalCommand(): Command {
  const cmd = new Command("eval")
    .description("Run agent evaluation tasks")
    .argument("[taskId]", "Specific task ID to run")
    .option("--all", "Run all tasks")
    .option("--category <category>", "Filter by category (e.g., 'coding:bugfix')")
    .option("--difficulty <level>", "Filter by difficulty (easy, medium, hard)")
    .option("--tag <tag>", "Filter by tag (repeatable)", collect, [])
    .option("--provider <name>", "LLM provider to use", "anthropic")
    .option("--model <name>", "Model to use", "claude-sonnet-4-20250514")
    .option("--mock", "Use mock provider (for testing)")
    .option("--runs <n>", "Number of runs per task", parseIntOption, 3)
    .option("--baseline <path>", "Baseline JSON for regression comparison")
    .option("--fail-on-regression", "Exit with code 1 if regression detected")
    .option("--regression-threshold <n>", "avgScore drop threshold", parseFloatOption, 0.1)
    .option("--report <path>", "Save JSON report to file")
    .option("--tasks-dir <path>", "Directory containing task definitions", "./tasks")
    .option("--quiet", "Suppress progress output")
    .action(async (taskId: string | undefined, options: EvalOptions) => {
      await runEval(taskId, options);
    });

  return cmd;
}

export default createEvalCommand;
