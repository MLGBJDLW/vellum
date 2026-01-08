/**
 * Output Assertions for CLI E2E Tests
 *
 * @module cli/test/e2e/assertions
 */

import type { AssertionFailure, CLIResult, OutputMatcher } from "./types.js";

/**
 * Assert CLI output against expected matchers
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Assertion function needs to check multiple output conditions
export function assertOutput(result: CLIResult, expected: OutputMatcher): AssertionFailure[] {
  const failures: AssertionFailure[] = [];

  // Check exit code
  if (expected.exitCode !== undefined && result.exitCode !== expected.exitCode) {
    failures.push({
      type: "exitCode",
      expected: expected.exitCode,
      actual: result.exitCode,
      message: `Expected exit code ${expected.exitCode}, got ${result.exitCode}`,
    });
  }

  // Check stdout
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

  // Check stderr
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

  // Check contains (stdout + stderr combined)
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

  // Check excludes (stdout + stderr combined)
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

  // Check timeout
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
 * Assert that output contains a string
 */
export function assertContains(result: CLIResult, text: string): void {
  const combined = result.stdout + result.stderr;
  if (!combined.includes(text)) {
    throw new Error(`Expected output to contain "${text}"\nActual:\n${combined}`);
  }
}

/**
 * Assert that output does not contain a string
 */
export function assertNotContains(result: CLIResult, text: string): void {
  const combined = result.stdout + result.stderr;
  if (combined.includes(text)) {
    throw new Error(`Expected output NOT to contain "${text}"\nActual:\n${combined}`);
  }
}

/**
 * Assert stdout matches exactly
 */
export function assertStdout(result: CLIResult, expected: string | RegExp): void {
  if (typeof expected === "string") {
    if (result.stdout !== expected) {
      throw new Error(`Expected stdout:\n${expected}\nActual:\n${result.stdout}`);
    }
  } else if (!expected.test(result.stdout)) {
    throw new Error(`Expected stdout to match ${expected.toString()}\nActual:\n${result.stdout}`);
  }
}

/**
 * Assert stderr matches exactly
 */
export function assertStderr(result: CLIResult, expected: string | RegExp): void {
  if (typeof expected === "string") {
    if (result.stderr !== expected) {
      throw new Error(`Expected stderr:\n${expected}\nActual:\n${result.stderr}`);
    }
  } else if (!expected.test(result.stderr)) {
    throw new Error(`Expected stderr to match ${expected.toString()}\nActual:\n${result.stderr}`);
  }
}

/**
 * Assert exit code
 */
export function assertExitCode(result: CLIResult, expected: number): void {
  if (result.exitCode !== expected) {
    throw new Error(
      `Expected exit code ${expected}, got ${result.exitCode}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`
    );
  }
}

/**
 * Assert process did not timeout
 */
export function assertNoTimeout(result: CLIResult): void {
  if (result.timedOut) {
    throw new Error(
      `Process timed out after ${result.duration}ms\nstdout: ${result.stdout}\nstderr: ${result.stderr}`
    );
  }
}

/**
 * Assert success (exit code 0, no timeout)
 */
export function assertSuccess(result: CLIResult): void {
  assertNoTimeout(result);
  assertExitCode(result, 0);
}

/**
 * Assert failure (non-zero exit code)
 */
export function assertFailure(result: CLIResult, expectedCode?: number): void {
  assertNoTimeout(result);
  if (expectedCode !== undefined) {
    assertExitCode(result, expectedCode);
  } else if (result.exitCode === 0) {
    throw new Error(
      `Expected non-zero exit code, got 0\nstdout: ${result.stdout}\nstderr: ${result.stderr}`
    );
  }
}

/**
 * Assert output contains JSON
 */
export function assertJSON(result: CLIResult): unknown {
  try {
    return JSON.parse(result.stdout) as unknown;
  } catch {
    throw new Error(`Expected stdout to be valid JSON\nActual:\n${result.stdout}`);
  }
}

/**
 * Assert output contains lines in order
 */
export function assertLinesInOrder(result: CLIResult, lines: string[]): void {
  const combined = result.stdout + result.stderr;
  let lastIndex = -1;

  for (const line of lines) {
    const index = combined.indexOf(line, lastIndex + 1);
    if (index === -1) {
      throw new Error(
        `Expected to find "${line}" after position ${lastIndex + 1}\nActual:\n${combined}`
      );
    }
    lastIndex = index;
  }
}

/**
 * Create matcher for use with vitest expect
 */
export const cliMatchers = {
  toContainOutput(result: CLIResult, expected: string) {
    const combined = result.stdout + result.stderr;
    const pass = combined.includes(expected);
    return {
      pass,
      message: () =>
        pass
          ? `Expected output NOT to contain "${expected}"`
          : `Expected output to contain "${expected}"\nActual:\n${combined}`,
    };
  },

  toExitWith(result: CLIResult, expected: number) {
    const pass = result.exitCode === expected;
    return {
      pass,
      message: () =>
        pass
          ? `Expected exit code NOT to be ${expected}`
          : `Expected exit code ${expected}, got ${result.exitCode}`,
    };
  },

  toSucceed(result: CLIResult) {
    const pass = result.exitCode === 0 && !result.timedOut;
    return {
      pass,
      message: () =>
        pass
          ? `Expected command NOT to succeed`
          : `Expected command to succeed\nexit code: ${result.exitCode}\ntimedOut: ${result.timedOut}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
    };
  },
};
