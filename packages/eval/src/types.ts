/**
 * Agent Evaluation Framework - Type Definitions (V3)
 * @module @vellum/eval
 */

import type { TokenUsage } from "@vellum/shared";

// ============================================
// Task Categories & Difficulty
// ============================================

/** Task category for filtering and reporting */
export type TaskCategory =
  | "coding:bugfix" // Fix a bug in existing code
  | "coding:feature" // Add new functionality
  | "coding:refactor" // Improve code structure
  | "file:create" // Create new files
  | "file:edit" // Modify existing files
  | "file:delete" // Remove files
  | "search:find" // Find code/patterns
  | "search:explain"; // Explain code behavior

/** Difficulty level for stratified reporting */
export type Difficulty = "easy" | "medium" | "hard";

// ============================================
// Task Definition
// ============================================

/** Input file to setup in task environment */
export interface TaskFile {
  /** Relative path from task root */
  path: string;
  /** File content (inline or reference) */
  content: string;
}

/** LLM-as-Judge configuration */
export interface LLMJudgeConfig {
  /** Rubric describing evaluation criteria */
  rubric: string;
  /** Score threshold for passing (0.0-1.0, default: 0.7) */
  passingScore?: number;
  /** Model to use as judge (default: same as eval) */
  judgeModel?: string;
}

/** Expected output validation */
export interface ExpectedOutput {
  /** Files that should exist with specific content */
  files?: Array<{
    path: string;
    /** Exact match, contains, or regex */
    match: "exact" | "contains" | "regex";
    content: string;
    /** Weight for partial scoring (default: 1.0) */
    weight?: number;
  }>;
  /** Stdout should contain */
  stdout?: string[];
  /** Test command should pass */
  testCommand?: string;
  /** LLM-as-Judge evaluation */
  llmJudge?: LLMJudgeConfig;
}

/** Mock script for deterministic testing */
export interface MockScript {
  /** Sequence of responses to return */
  responses: Array<{
    /** Text content to return */
    content: string;
    /** Optional tool calls to simulate */
    toolCalls?: Array<{
      name: string;
      arguments: Record<string, unknown>;
    }>;
  }>;
}

/** Complete task definition */
export interface EvalTask {
  /** Unique task identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Task category for filtering */
  category: TaskCategory;
  /** Difficulty level */
  difficulty: Difficulty;
  /** Task description (shown to user, not agent) */
  description: string;
  /** Prompt sent to agent */
  prompt: string;
  /** Initial files in workspace */
  files: TaskFile[];
  /** How to validate success */
  expected: ExpectedOutput;
  /** Max execution time in ms (default: 60000) */
  timeout?: number;
  /** Tags for filtering */
  tags?: string[];
  /** Mock provider script (for framework testing only) */
  mockScript?: MockScript;
  /** Score threshold for passing (0.0-1.0, default: 1.0) */
  passingThreshold?: number;
}

// ============================================
// Check Results
// ============================================

/** Individual check result with weight support (V3) */
export interface CheckDetail {
  type: "file" | "stdout" | "test" | "llmJudge";
  name: string;
  /** Raw score before weight (0.0 - 1.0) */
  rawScore: number;
  /** Weight for this check (default: 1.0) */
  weight: number;
  pass: boolean;
  message?: string;
}

/** Result of validation checks */
export interface CheckResult {
  /** Overall weighted score (0.0 - 1.0) */
  score: number;
  /** Pass if score >= task.passingThreshold */
  pass: boolean;
  /** Individual check details */
  details: CheckDetail[];
  /** Error messages */
  errors: string[];
  filesChecked: number;
}

// ============================================
// Run Results (V3 - with Token/Cost tracking)
// ============================================

/** Per-run result with token tracking */
export interface RunResult {
  runIndex: number;
  score: number;
  pass: boolean;
  durationMs: number;
  errors: string[];
  turns: number;
  toolCalls: number;
  /** V3: Token usage from InstrumentedProvider */
  tokenUsage: TokenUsage;
  /** V3: Estimated cost based on model pricing */
  estimatedCost?: number;
}

/** Pass@K metrics */
export interface PassAtK {
  "pass@1": number;
  "pass@3": number;
  "pass@5"?: number;
}

/** Aggregated task result with pass@K and costs (V3) */
export interface EvalResult {
  taskId: string;
  category: TaskCategory;
  difficulty: Difficulty;
  /** Individual run results */
  runs: RunResult[];
  /** pass@K metrics */
  passAtK: PassAtK;
  /** Average score across runs */
  avgScore: number;
  /** Best score across runs */
  bestScore: number;
  /** Legacy compatibility */
  pass: boolean;
  durationMs: number;
  errors: string[];
  turns: number;
  toolCalls: number;
  /** V3: Aggregated token usage */
  totalTokenUsage: TokenUsage;
  /** V3: Total estimated cost */
  totalEstimatedCost: number;
}

// ============================================
// Environment
// ============================================

/** Isolated evaluation environment */
export interface EvalEnvironment {
  taskId: string;
  workingDir: string;
  initialFiles: string[];
}

// ============================================
// Reporting (V3 Enhanced)
// ============================================

/** Category/difficulty stats */
export interface GroupStats {
  passed: number;
  total: number;
  rate: number;
}

/** V3: Enhanced regression comparison */
export interface RegressionComparison {
  taskId: string;
  baseline: { passAt1: number; avgScore: number };
  current: { passAt1: number; avgScore: number };
  delta: { passAt1: number; avgScore: number };
  /** V3: Check both pass@1 AND avgScore */
  regressed: boolean;
  regressionReason?: string;
}

/** Regression analysis result */
export interface RegressionAnalysis {
  baselinePath: string;
  comparisons: RegressionComparison[];
  overallRegressed: boolean;
  regressedTasks: string[];
}

/** V3: Cost summary */
export interface CostSummary {
  totalEstimatedCost: number;
  totalTokenUsage: TokenUsage;
  averageCostPerTask: number;
}

/** Report metadata */
export interface ReportMeta {
  timestamp: string;
  runsPerTask: number;
  provider?: string;
  model?: string;
}

/** Complete pass rate report (V3) */
export interface PassRateReport {
  overall: GroupStats;
  passAtK: PassAtK;
  byCategory: Record<string, GroupStats>;
  byDifficulty: Record<string, GroupStats>;
  results: EvalResult[];
  regression?: RegressionAnalysis;
  meta: ReportMeta;
  /** V3: Cost summary */
  costSummary?: CostSummary;
}

// ============================================
// Runner Options & Events (V3)
// ============================================

/** Task filter options */
export interface TaskFilter {
  category?: string;
  difficulty?: Difficulty;
  tags?: string[];
  ids?: string[];
}

/** Run options */
export interface RunOptions {
  /** Number of runs per task (default: 3) */
  runs?: number;
  /** Use mock provider */
  useMock?: boolean;
  /** Provider type */
  providerType?: string;
  /** Model name */
  model?: string;
  /** Baseline path for regression */
  baseline?: string;
  /** Fail on regression */
  failOnRegression?: boolean;
  /** V3: avgScore regression threshold */
  regressionThreshold?: number;
}

/** V3: Event types for progress reporting */
export interface EvalRunnerEvents {
  /** Emitted when a task run starts */
  taskStart: (taskId: string, runIndex: number, totalRuns: number) => void;
  /** Emitted when a task run completes */
  taskComplete: (taskId: string, runIndex: number, result: RunResult) => void;
  /** Emitted periodically during suite execution */
  suiteProgress: (completed: number, total: number, currentPassRate: number) => void;
  /** Emitted when all tasks complete */
  suiteComplete: (report: PassRateReport) => void;
  /** Emitted on errors that don't stop execution */
  taskError: (taskId: string, error: Error) => void;
}

// ============================================
// Harness Options
// ============================================

/** Harness configuration */
export interface HarnessOptions {
  /** Use mock provider (for framework testing only) */
  useMockProvider?: boolean;
  /** Provider type */
  providerType?: string;
  /** Model */
  model?: string;
  /** Extra tools to enable */
  extraTools?: string[];
  /** Auto-approve all permission requests (default: true) */
  autoApproveAll?: boolean;
}

// ============================================
// Reporter Options
// ============================================

/** Reporter configuration */
export interface ReporterOptions {
  /** V3: Threshold for avgScore regression (default: 0.1) */
  regressionThreshold?: number;
}
