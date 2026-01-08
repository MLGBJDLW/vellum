/**
 * CLI Test Harness
 *
 * Spawns CLI processes, captures output, and handles interactive input.
 *
 * @module cli/test/e2e/harness
 */

import { type ChildProcess, spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  AssertionFailure,
  BatchResult,
  CLIResult,
  HarnessConfig,
  HarnessEvent,
  HarnessEventListener,
  InputStep,
  OutputMatcher,
  ResolvedHarnessConfig,
  ScenarioResult,
  TestScenario,
} from "./types.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

/**
 * Assert CLI output against expected matchers (inline to avoid circular import)
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Assertion function needs to check multiple output conditions
function assertOutput(result: CLIResult, expected: OutputMatcher): AssertionFailure[] {
  const failures: AssertionFailure[] = [];

  if (expected.exitCode !== undefined && result.exitCode !== expected.exitCode) {
    failures.push({
      type: "exitCode",
      expected: expected.exitCode,
      actual: result.exitCode,
      message: `Expected exit code ${expected.exitCode}, got ${result.exitCode}`,
    });
  }

  if (expected.stdout !== undefined) {
    if (typeof expected.stdout === "string") {
      if (!result.stdout.includes(expected.stdout)) {
        failures.push({
          type: "stdout",
          expected: expected.stdout,
          actual: result.stdout,
          message: `stdout does not contain expected string: "${expected.stdout}"`,
        });
      }
    } else if (!expected.stdout.test(result.stdout)) {
      failures.push({
        type: "stdout",
        expected: expected.stdout.toString(),
        actual: result.stdout,
        message: `stdout does not match pattern: ${expected.stdout.toString()}`,
      });
    }
  }

  if (expected.stderr !== undefined) {
    if (typeof expected.stderr === "string") {
      if (!result.stderr.includes(expected.stderr)) {
        failures.push({
          type: "stderr",
          expected: expected.stderr,
          actual: result.stderr,
          message: `stderr does not contain expected string: "${expected.stderr}"`,
        });
      }
    } else if (!expected.stderr.test(result.stderr)) {
      failures.push({
        type: "stderr",
        expected: expected.stderr.toString(),
        actual: result.stderr,
        message: `stderr does not match pattern: ${expected.stderr.toString()}`,
      });
    }
  }

  if (expected.contains) {
    const combined = result.stdout + result.stderr;
    for (const text of expected.contains) {
      if (!combined.includes(text)) {
        failures.push({
          type: "contains",
          expected: text,
          actual: combined,
          message: `Output does not contain: "${text}"`,
        });
      }
    }
  }

  if (expected.excludes) {
    const combined = result.stdout + result.stderr;
    for (const text of expected.excludes) {
      if (combined.includes(text)) {
        failures.push({
          type: "excludes",
          expected: `not "${text}"`,
          actual: combined,
          message: `Output should NOT contain: "${text}"`,
        });
      }
    }
  }

  if (result.timedOut) {
    failures.push({
      type: "timeout",
      expected: "no timeout",
      actual: "timed out",
      message: `Process timed out after ${result.duration}ms`,
    });
  }

  return failures;
}

/**
 * Default harness configuration
 */
const DEFAULT_CONFIG: ResolvedHarnessConfig = {
  cliPath: resolve(__dirname, "../../../dist/index.js"),
  timeout: 30000,
  cwd: process.cwd(),
  env: {},
  inheritEnv: true,
  encoding: "utf-8",
  debug: false,
};

/**
 * CLI Test Harness for E2E testing
 */
export class CLITestHarness {
  private readonly config: ResolvedHarnessConfig;
  private readonly listeners: Set<HarnessEventListener> = new Set();
  private activeProcess: ChildProcess | null = null;

  constructor(config: HarnessConfig = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      env: { ...DEFAULT_CONFIG.env, ...config.env },
    };
  }

  /**
   * Add event listener
   */
  on(listener: HarnessEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Emit event to all listeners
   */
  private emit(event: HarnessEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Ignore listener errors
      }
    }
  }

  /**
   * Debug log if enabled
   */
  private debug(...args: unknown[]): void {
    if (this.config.debug) {
      console.log("[CLITestHarness]", ...args);
    }
  }

  /**
   * Run CLI with arguments and capture output
   */
  async run(args: string[], options?: Partial<HarnessConfig>): Promise<CLIResult> {
    const config = { ...this.config, ...options };
    const startTime = Date.now();

    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    let timedOut = false;

    return new Promise<CLIResult>((resolve, reject) => {
      this.debug("Spawning:", "node", config.cliPath, ...args);

      const env = config.inheritEnv ? { ...process.env, ...config.env } : config.env;

      const proc = spawn("node", [config.cliPath, ...args], {
        cwd: config.cwd,
        env,
        stdio: ["pipe", "pipe", "pipe"],
      });

      this.activeProcess = proc;

      if (proc.pid !== undefined) {
        this.emit({ type: "spawn", pid: proc.pid });
      }

      // Timeout handling
      const timeoutId = setTimeout(() => {
        timedOut = true;
        this.emit({ type: "timeout" });
        proc.kill("SIGTERM");

        // Force kill after grace period
        setTimeout(() => {
          if (!proc.killed) {
            proc.kill("SIGKILL");
          }
        }, 1000);
      }, config.timeout);

      // Capture stdout
      proc.stdout?.setEncoding(config.encoding);
      proc.stdout?.on("data", (data: string) => {
        this.debug("stdout:", data);
        stdoutChunks.push(data);
        this.emit({ type: "stdout", data });
      });

      // Capture stderr
      proc.stderr?.setEncoding(config.encoding);
      proc.stderr?.on("data", (data: string) => {
        this.debug("stderr:", data);
        stderrChunks.push(data);
        this.emit({ type: "stderr", data });
      });

      // Handle errors
      proc.on("error", (error) => {
        clearTimeout(timeoutId);
        this.activeProcess = null;
        this.emit({ type: "error", error });
        reject(error);
      });

      // Handle exit
      proc.on("close", (code, signal) => {
        clearTimeout(timeoutId);
        this.activeProcess = null;
        this.emit({ type: "exit", code, signal });

        resolve({
          stdout: stdoutChunks.join(""),
          stderr: stderrChunks.join(""),
          exitCode: code,
          signal,
          duration: Date.now() - startTime,
          timedOut,
          stdoutChunks,
          stderrChunks,
        });
      });
    });
  }

  /**
   * Run CLI with interactive input
   */
  async runInteractive(
    args: string[],
    inputs: InputStep[],
    options?: Partial<HarnessConfig>
  ): Promise<CLIResult> {
    const config = { ...this.config, ...options };
    const startTime = Date.now();

    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    let timedOut = false;

    return new Promise<CLIResult>((resolve, reject) => {
      this.debug("Spawning interactive:", "node", config.cliPath, ...args);

      const env = config.inheritEnv ? { ...process.env, ...config.env } : config.env;

      const proc = spawn("node", [config.cliPath, ...args], {
        cwd: config.cwd,
        env,
        stdio: ["pipe", "pipe", "pipe"],
      });

      this.activeProcess = proc;

      if (proc.pid !== undefined) {
        this.emit({ type: "spawn", pid: proc.pid });
      }

      let outputBuffer = "";
      let inputIndex = 0;

      // Process input steps
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Input processing requires handling multiple step types and timing conditions
      const processNextInput = async (): Promise<void> => {
        if (inputIndex >= inputs.length) return;

        const step = inputs[inputIndex];
        if (!step) return;

        // Wait for specific output if specified
        if (step.waitFor) {
          const waitTimeout = step.waitTimeout ?? 5000;
          const waitStart = Date.now();

          const checkOutput = (): boolean => {
            if (typeof step.waitFor === "string") {
              return outputBuffer.includes(step.waitFor);
            }
            return step.waitFor?.test(outputBuffer) ?? false;
          };

          while (!checkOutput()) {
            if (Date.now() - waitStart > waitTimeout) {
              this.debug(`Wait timeout for: ${String(step.waitFor)}`);
              break;
            }
            await new Promise((r) => setTimeout(r, 50));
          }
        }

        // Delay before input
        if (step.delay) {
          await new Promise((r) => setTimeout(r, step.delay));
        }

        // Send input
        this.debug("Sending input:", step.input);
        proc.stdin?.write(step.input);
        this.emit({ type: "input", data: step.input });

        inputIndex++;

        // Schedule next input
        if (inputIndex < inputs.length) {
          setTimeout(() => void processNextInput(), 100);
        }
      };

      // Timeout handling
      const timeoutId = setTimeout(() => {
        timedOut = true;
        this.emit({ type: "timeout" });
        proc.kill("SIGTERM");

        setTimeout(() => {
          if (!proc.killed) {
            proc.kill("SIGKILL");
          }
        }, 1000);
      }, config.timeout);

      // Capture stdout
      proc.stdout?.setEncoding(config.encoding);
      proc.stdout?.on("data", (data: string) => {
        this.debug("stdout:", data);
        stdoutChunks.push(data);
        outputBuffer += data;
        this.emit({ type: "stdout", data });
      });

      // Capture stderr
      proc.stderr?.setEncoding(config.encoding);
      proc.stderr?.on("data", (data: string) => {
        this.debug("stderr:", data);
        stderrChunks.push(data);
        outputBuffer += data;
        this.emit({ type: "stderr", data });
      });

      // Start processing inputs after process spawns
      proc.on("spawn", () => {
        void processNextInput();
      });

      // Handle errors
      proc.on("error", (error) => {
        clearTimeout(timeoutId);
        this.activeProcess = null;
        this.emit({ type: "error", error });
        reject(error);
      });

      // Handle exit
      proc.on("close", (code, signal) => {
        clearTimeout(timeoutId);
        this.activeProcess = null;
        this.emit({ type: "exit", code, signal });

        resolve({
          stdout: stdoutChunks.join(""),
          stderr: stderrChunks.join(""),
          exitCode: code,
          signal,
          duration: Date.now() - startTime,
          timedOut,
          stdoutChunks,
          stderrChunks,
        });
      });
    });
  }

  /**
   * Execute a test scenario
   */
  async runScenario(scenario: TestScenario): Promise<ScenarioResult> {
    if (scenario.skip) {
      return {
        scenario,
        result: {
          stdout: "",
          stderr: "",
          exitCode: null,
          signal: null,
          duration: 0,
          timedOut: false,
          stdoutChunks: [],
          stderrChunks: [],
        },
        passed: false,
        failures: [
          {
            type: "exitCode",
            expected: "not skipped",
            actual: "skipped",
            message: "Scenario was skipped",
          },
        ],
      };
    }

    try {
      // Run setup
      if (scenario.setup) {
        await scenario.setup();
      }

      // Execute CLI
      const options: Partial<HarnessConfig> = {
        timeout: scenario.timeout,
        env: scenario.env,
        cwd: scenario.cwd,
      };

      const result = scenario.inputs?.length
        ? await this.runInteractive(scenario.args, scenario.inputs, options)
        : await this.run(scenario.args, options);

      // Assert output
      const failures = assertOutput(result, scenario.expected);

      // Run teardown
      if (scenario.teardown) {
        await scenario.teardown();
      }

      return {
        scenario,
        result,
        passed: failures.length === 0,
        failures,
      };
    } catch (error) {
      return {
        scenario,
        result: {
          stdout: "",
          stderr: "",
          exitCode: null,
          signal: null,
          duration: 0,
          timedOut: false,
          stdoutChunks: [],
          stderrChunks: [],
        },
        passed: false,
        failures: [],
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Run multiple scenarios
   */
  async runBatch(scenarios: TestScenario[]): Promise<BatchResult> {
    const startTime = Date.now();
    const results: ScenarioResult[] = [];

    // Check for .only scenarios
    const onlyScenarios = scenarios.filter((s) => s.only);
    const toRun = onlyScenarios.length > 0 ? onlyScenarios : scenarios;

    let passed = 0;
    let failed = 0;
    let skipped = 0;

    for (const scenario of toRun) {
      if (scenario.skip) {
        skipped++;
        continue;
      }

      const result = await this.runScenario(scenario);
      results.push(result);

      if (result.passed) {
        passed++;
      } else {
        failed++;
      }
    }

    // Count skipped from original list
    skipped += scenarios.filter((s) => !toRun.includes(s)).length;

    return {
      total: scenarios.length,
      passed,
      failed,
      skipped,
      results,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Kill active process if any
   */
  kill(signal: NodeJS.Signals = "SIGTERM"): boolean {
    if (this.activeProcess && !this.activeProcess.killed) {
      this.activeProcess.kill(signal);
      return true;
    }
    return false;
  }

  /**
   * Create a new harness with merged config
   */
  withConfig(config: Partial<HarnessConfig>): CLITestHarness {
    return new CLITestHarness({
      ...this.config,
      ...config,
    });
  }
}

/**
 * Create a pre-configured harness instance
 */
export function createHarness(config?: HarnessConfig): CLITestHarness {
  return new CLITestHarness(config);
}

/**
 * Quick run helper for simple test cases
 */
export async function runCLI(args: string[], options?: HarnessConfig): Promise<CLIResult> {
  const harness = new CLITestHarness(options);
  return harness.run(args);
}
