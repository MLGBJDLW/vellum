/**
 * CLI E2E Test Harness
 *
 * Provides utilities for end-to-end testing of the Vellum CLI.
 *
 * @module cli/test/e2e
 *
 * @example
 * ```typescript
 * import { createHarness, TempDir, assertSuccess } from '../test/e2e/index.js';
 *
 * const harness = createHarness({ timeout: 10000 });
 * const result = await harness.run(['--version']);
 * assertSuccess(result);
 * ```
 */

// Assertions
export {
  assertContains,
  assertExitCode,
  assertFailure,
  assertJSON,
  assertLinesInOrder,
  assertNoTimeout,
  assertNotContains,
  assertOutput,
  assertStderr,
  assertStdout,
  assertSuccess,
  cliMatchers,
} from "./assertions.js";
// Fixtures
export type { TempDirOptions } from "./fixtures.js";
export {
  createGitFixture,
  createProjectFixture,
  FixtureManager,
  TempDir,
  useFixtures,
} from "./fixtures.js";
// Harness
export { CLITestHarness, createHarness, runCLI } from "./harness.js";
// Types
export type {
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
