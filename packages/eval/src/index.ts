/**
 * @vellum/eval - Agent Evaluation Framework
 * @module @vellum/eval
 */

// ============================================
// Types
// ============================================

export type {
  CheckDetail,
  CheckResult,
  CostSummary,
  Difficulty,
  EvalEnvironment,
  EvalResult,
  EvalRunnerEvents,
  EvalTask,
  ExpectedOutput,
  GroupStats,
  HarnessOptions,
  LLMJudgeConfig,
  MockScript,
  PassAtK,
  PassRateReport,
  RegressionAnalysis,
  RegressionComparison,
  ReporterOptions,
  ReportMeta,
  RunOptions,
  RunResult,
  TaskCategory,
  TaskFile,
  TaskFilter,
} from "./types.js";

// ============================================
// Classes
// ============================================

export {
  type LLMJudgeProvider,
  ResultChecker,
  type ResultCheckerOptions,
} from "./checker.js";
export { type EvalAgentConfig, EvalHarness } from "./harness.js";
export { EvalTaskSchema, TaskLoader, type TaskLoaderOptions } from "./loader.js";
export { Reporter } from "./reporter.js";
export {
  type AgentExecutionResult,
  type AgentExecutor,
  createMockAgentExecutor,
  EvalRunner,
  type EvalRunnerOptions,
} from "./runner.js";

// ============================================
// Pricing utilities
// ============================================

export {
  aggregateTokenUsage,
  calculateCost,
  emptyTokenUsage,
  getModelPricing,
  hasKnownPricing,
  MODEL_PRICING,
  type ModelPricing,
} from "./pricing.js";
