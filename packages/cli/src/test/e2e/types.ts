/**
 * E2E Test Harness Type Definitions
 *
 * @module cli/test/e2e/types
 */

/**
 * Configuration for the CLI test harness
 */
export interface HarnessConfig {
  /** Path to CLI entry point (default: dist/index.js) */
  cliPath?: string;

  /** Default timeout in milliseconds (default: 30000) */
  timeout?: number;

  /** Working directory for CLI execution */
  cwd?: string;

  /** Environment variables to inject */
  env?: Record<string, string>;

  /** Whether to inherit parent env (default: true) */
  inheritEnv?: boolean;

  /** Encoding for stdout/stderr (default: utf-8) */
  encoding?: BufferEncoding;

  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Resolved harness configuration with defaults applied
 */
export interface ResolvedHarnessConfig {
  cliPath: string;
  timeout: number;
  cwd: string;
  env: Record<string, string>;
  inheritEnv: boolean;
  encoding: BufferEncoding;
  debug: boolean;
}

/**
 * Input step for interactive CLI testing
 */
export interface InputStep {
  /** The input to send to stdin */
  input: string;

  /** Delay before sending input (ms) */
  delay?: number;

  /** Wait for specific output before sending */
  waitFor?: string | RegExp;

  /** Timeout for waitFor (ms) */
  waitTimeout?: number;
}

/**
 * Expected output matcher
 */
export interface OutputMatcher {
  /** Match stdout */
  stdout?: string | RegExp;

  /** Match stderr */
  stderr?: string | RegExp;

  /** Expected exit code */
  exitCode?: number;

  /** Output should contain all of these */
  contains?: string[];

  /** Output should NOT contain any of these */
  excludes?: string[];
}

/**
 * Test scenario definition
 */
export interface TestScenario {
  /** Scenario name for reporting */
  name: string;

  /** Description of what this scenario tests */
  description?: string;

  /** CLI arguments to pass */
  args: string[];

  /** Interactive input steps */
  inputs?: InputStep[];

  /** Expected output/behavior */
  expected: OutputMatcher;

  /** Scenario-specific timeout (overrides harness default) */
  timeout?: number;

  /** Environment variables for this scenario */
  env?: Record<string, string>;

  /** Working directory for this scenario */
  cwd?: string;

  /** Skip this scenario */
  skip?: boolean;

  /** Run only this scenario */
  only?: boolean;

  /** Setup function before scenario runs */
  setup?: () => Promise<void>;

  /** Teardown function after scenario completes */
  teardown?: () => Promise<void>;
}

/**
 * Result of a CLI execution
 */
export interface CLIResult {
  /** Combined stdout output */
  stdout: string;

  /** Combined stderr output */
  stderr: string;

  /** Exit code (null if process was killed) */
  exitCode: number | null;

  /** Signal that terminated the process (if any) */
  signal: NodeJS.Signals | null;

  /** Execution duration in milliseconds */
  duration: number;

  /** Whether the process timed out */
  timedOut: boolean;

  /** Raw stdout chunks for streaming analysis */
  stdoutChunks: string[];

  /** Raw stderr chunks for streaming analysis */
  stderrChunks: string[];
}

/**
 * Scenario execution result
 */
export interface ScenarioResult {
  /** The executed scenario */
  scenario: TestScenario;

  /** CLI execution result */
  result: CLIResult;

  /** Whether all assertions passed */
  passed: boolean;

  /** Assertion failures (if any) */
  failures: AssertionFailure[];

  /** Execution error (if any) */
  error?: Error;
}

/**
 * Assertion failure details
 */
export interface AssertionFailure {
  /** Type of assertion that failed */
  type: "stdout" | "stderr" | "exitCode" | "contains" | "excludes" | "timeout";

  /** Expected value */
  expected: unknown;

  /** Actual value */
  actual: unknown;

  /** Human-readable message */
  message: string;
}

/**
 * Batch run result
 */
export interface BatchResult {
  /** Total scenarios executed */
  total: number;

  /** Passed scenarios */
  passed: number;

  /** Failed scenarios */
  failed: number;

  /** Skipped scenarios */
  skipped: number;

  /** Individual results */
  results: ScenarioResult[];

  /** Total duration in milliseconds */
  duration: number;
}

/**
 * Event emitted during CLI execution
 */
export type HarnessEvent =
  | { type: "spawn"; pid: number }
  | { type: "stdout"; data: string }
  | { type: "stderr"; data: string }
  | { type: "input"; data: string }
  | { type: "exit"; code: number | null; signal: NodeJS.Signals | null }
  | { type: "timeout" }
  | { type: "error"; error: Error };

/**
 * Event listener for harness events
 */
export type HarnessEventListener = (event: HarnessEvent) => void;
