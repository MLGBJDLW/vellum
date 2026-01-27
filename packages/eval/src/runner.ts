/**
 * EvalRunner - Orchestrates evaluation runs with V3 features
 * @module @vellum/eval
 */

import { EventEmitter } from "node:events";
import type { TokenUsage } from "@vellum/shared";
import { type LLMJudgeProvider, ResultChecker } from "./checker.js";
import { EvalHarness } from "./harness.js";
import { TaskLoader } from "./loader.js";
import { aggregateTokenUsage, calculateCost, emptyTokenUsage } from "./pricing.js";
import { Reporter } from "./reporter.js";
import type {
  EvalEnvironment,
  EvalResult,
  EvalRunnerEvents,
  EvalTask,
  PassRateReport,
  ReportMeta,
  RunOptions,
  RunResult,
  TaskFilter,
} from "./types.js";

export interface EvalRunnerOptions {
  /** Directory containing task definitions */
  tasksDir?: string;
  /** LLM provider for judge evaluation */
  judgeProvider?: LLMJudgeProvider;
  /** Agent executor function - must be provided to actually run agents */
  agentExecutor?: AgentExecutor;
}

/**
 * Agent executor interface
 * This abstracts the actual agent execution to allow different implementations
 */
export interface AgentExecutor {
  /**
   * Execute agent with given prompt in the environment
   * Returns completion result with token usage
   */
  execute(
    prompt: string,
    env: EvalEnvironment,
    options: {
      model: string;
      providerType: string;
      timeout: number;
    }
  ): Promise<AgentExecutionResult>;
}

export interface AgentExecutionResult {
  /** Whether agent completed successfully (no errors) */
  success: boolean;
  /** Number of conversation turns */
  turns: number;
  /** Number of tool calls made */
  toolCalls: number;
  /** Token usage */
  tokenUsage: TokenUsage;
  /** Any errors encountered */
  errors: string[];
  /** Execution time in ms */
  durationMs: number;
}

/**
 * EvalRunner orchestrates evaluation with V3 enhancements
 * - Progress events for TUI integration
 * - Token/cost tracking per run
 * - Multi-run support with pass@K
 */
export class EvalRunner extends EventEmitter {
  private loader: TaskLoader;
  private reporter: Reporter;
  private checker: ResultChecker;
  private agentExecutor?: AgentExecutor;

  constructor(options: EvalRunnerOptions = {}) {
    super();
    this.loader = new TaskLoader({ tasksDir: options.tasksDir ?? "./tasks" });
    this.reporter = new Reporter();
    this.checker = new ResultChecker({ judgeProvider: options.judgeProvider });
    this.agentExecutor = options.agentExecutor;
  }

  // Type-safe event emitter overrides
  override on<K extends keyof EvalRunnerEvents>(event: K, listener: EvalRunnerEvents[K]): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }

  override emit<K extends keyof EvalRunnerEvents>(
    event: K,
    ...args: Parameters<EvalRunnerEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }

  /**
   * Run evaluation for a single task
   */
  async runTask(taskId: string, options: RunOptions = {}): Promise<EvalResult> {
    const task = await this.loader.loadTask(taskId);
    return this.executeTask(task, options);
  }

  /**
   * Run evaluation for all tasks matching filter
   */
  async runSuite(filter: TaskFilter = {}, options: RunOptions = {}): Promise<PassRateReport> {
    const tasks = await this.loader.loadAll(filter);
    const results: EvalResult[] = [];
    let completed = 0;

    for (const task of tasks) {
      try {
        const result = await this.executeTask(task, options);
        results.push(result);
        completed++;

        // V3: Emit suite progress
        const passRate = results.filter((r) => r.pass).length / results.length;
        this.emit("suiteProgress", completed, tasks.length, passRate);
      } catch (error) {
        this.emit("taskError", task.id, error as Error);
        // Continue with other tasks
      }
    }

    const meta: ReportMeta = {
      timestamp: new Date().toISOString(),
      runsPerTask: options.runs ?? 3,
      provider: options.providerType,
      model: options.model,
    };

    const report = this.reporter.generateReport(results, meta, options.baseline);
    this.emit("suiteComplete", report);

    return report;
  }

  /**
   * List all available task IDs
   */
  async listTasks(): Promise<string[]> {
    return this.loader.listTaskIds();
  }

  /**
   * Get the reporter instance for external use
   */
  getReporter(): Reporter {
    return this.reporter;
  }

  // ============================================
  // Private Methods
  // ============================================

  private async executeTask(task: EvalTask, options: RunOptions): Promise<EvalResult> {
    const runs: RunResult[] = [];
    const numRuns = options.runs ?? 3;
    const model = options.model ?? "claude-sonnet-4-20250514";
    const providerType = options.providerType ?? "anthropic";

    for (let i = 0; i < numRuns; i++) {
      // V3: Emit progress event
      this.emit("taskStart", task.id, i, numRuns);

      const result = await this.executeSingleRun(task, i, {
        ...options,
        model,
        providerType,
      });
      runs.push(result);

      // V3: Emit completion event
      this.emit("taskComplete", task.id, i, result);
    }

    return this.aggregateResults(task, runs);
  }

  private async executeSingleRun(
    task: EvalTask,
    runIndex: number,
    options: RunOptions & { model: string; providerType: string }
  ): Promise<RunResult> {
    const harness = new EvalHarness({
      providerType: options.providerType,
      model: options.model,
      useMockProvider: options.useMock,
    });

    const startTime = Date.now();
    let tokenUsage: TokenUsage = emptyTokenUsage();
    let turns = 0;
    let toolCalls = 0;
    const errors: string[] = [];
    let checkResult: {
      score: number;
      pass: boolean;
      details: unknown[];
      errors: string[];
      filesChecked: number;
    } = { score: 0, pass: false, details: [], errors: [], filesChecked: 0 };

    try {
      // Setup environment
      const env = await harness.setup(task);

      // Execute agent (if executor provided)
      if (this.agentExecutor) {
        const execResult = await this.agentExecutor.execute(task.prompt, env, {
          model: options.model,
          providerType: options.providerType,
          timeout: task.timeout ?? 60000,
        });

        tokenUsage = execResult.tokenUsage;
        turns = execResult.turns;
        toolCalls = execResult.toolCalls;
        errors.push(...execResult.errors);
      } else {
        // No executor - this is a dry run or mock scenario
        errors.push("No agent executor configured - dry run");
      }

      // Validate results
      checkResult = await this.checker.validate(env, task.expected, task);
      errors.push(...checkResult.errors);
    } catch (error) {
      errors.push(`Execution error: ${error}`);
    } finally {
      // Always cleanup
      await harness.cleanup();
    }

    const durationMs = Date.now() - startTime;

    // V3: Calculate cost
    const estimatedCost = calculateCost(tokenUsage, options.model);

    return {
      runIndex,
      score: checkResult.score,
      pass: checkResult.pass,
      durationMs,
      errors,
      turns,
      toolCalls,
      tokenUsage,
      estimatedCost,
    };
  }

  private aggregateResults(task: EvalTask, runs: RunResult[]): EvalResult {
    const passAtK = this.reporter.computePassAtK(runs);
    const scores = runs.map((r) => r.score);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const bestScore = Math.max(...scores);

    // Aggregate token usage and costs
    const totalTokenUsage = aggregateTokenUsage(runs.map((r) => r.tokenUsage));
    const totalEstimatedCost = runs.reduce((sum, r) => sum + (r.estimatedCost ?? 0), 0);

    // Total duration and error collection
    const totalDuration = runs.reduce((sum, r) => sum + r.durationMs, 0);
    const allErrors = runs.flatMap((r) => r.errors);
    const totalTurns = runs.reduce((sum, r) => sum + r.turns, 0);
    const totalToolCalls = runs.reduce((sum, r) => sum + r.toolCalls, 0);

    return {
      taskId: task.id,
      category: task.category,
      difficulty: task.difficulty,
      runs,
      passAtK,
      avgScore,
      bestScore,
      // Legacy pass: use pass@1 > 0.5
      pass: passAtK["pass@1"] >= 0.5,
      durationMs: totalDuration,
      errors: [...new Set(allErrors)], // Deduplicate
      turns: totalTurns,
      toolCalls: totalToolCalls,
      totalTokenUsage,
      totalEstimatedCost,
    };
  }
}

/**
 * Create a simple mock agent executor for testing
 */
export function createMockAgentExecutor(): AgentExecutor {
  return {
    async execute(_prompt, _env, _options) {
      // Simulate some work
      await new Promise((resolve) => setTimeout(resolve, 100));

      return {
        success: true,
        turns: 3,
        toolCalls: 5,
        tokenUsage: {
          inputTokens: 1000,
          outputTokens: 500,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
        errors: [],
        durationMs: 100,
      };
    },
  };
}
