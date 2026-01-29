/**
 * SignalExtractor Unit Tests
 * @module context/evidence/__tests__/signal-extractor
 */

import { describe, expect, it } from "vitest";
import type { ErrorContext, SignalInput } from "../signal-extractor.js";
import { SignalExtractor } from "../signal-extractor.js";

// =============================================================================
// Factory Functions
// =============================================================================

function createErrorContext(overrides: Partial<ErrorContext> = {}): ErrorContext {
  return {
    message: "TypeError: undefined is not a function",
    stack: undefined,
    code: undefined,
    ...overrides,
  };
}

function createSignalInput(overrides: Partial<SignalInput> = {}): SignalInput {
  return {
    userMessage: undefined,
    errors: undefined,
    workingSet: undefined,
    gitDiff: undefined,
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe("SignalExtractor", () => {
  describe("extract", () => {
    it("should extract symbols from camelCase identifiers", () => {
      const extractor = new SignalExtractor();
      const input = createSignalInput({
        userMessage: "Fix the handleClick function in Button component",
      });

      const signals = extractor.extract(input);

      const symbols = signals.filter((s) => s.type === "symbol");
      const values = symbols.map((s) => s.value);

      expect(values).toContain("handleClick");
      expect(symbols.every((s) => s.source === "user_message")).toBe(true);
    });

    it("should extract symbols from snake_case identifiers", () => {
      const extractor = new SignalExtractor();
      const input = createSignalInput({
        userMessage: "The user_name and access_token variables are undefined",
      });

      const signals = extractor.extract(input);

      const symbols = signals.filter((s) => s.type === "symbol");
      const values = symbols.map((s) => s.value);

      expect(values).toContain("user_name");
      expect(values).toContain("access_token");
    });

    it("should extract file paths", () => {
      const extractor = new SignalExtractor();
      const input = createSignalInput({
        userMessage: "Check the file src/components/Button.ts for issues",
      });

      const signals = extractor.extract(input);

      const paths = signals.filter((s) => s.type === "path");
      const values = paths.map((s) => s.value);

      expect(values).toContain("src/components/Button.ts");
      expect(paths[0]?.confidence).toBeGreaterThan(0.5);
    });

    it("should extract error tokens from TypeScript errors", () => {
      const extractor = new SignalExtractor();
      const input = createSignalInput({
        errors: [
          createErrorContext({
            message: "Property handleSubmit does not exist on type FormProps",
          }),
        ],
      });

      const signals = extractor.extract(input);

      const errorTokens = signals.filter((s) => s.type === "error_token");
      const values = errorTokens.map((s) => s.value);

      expect(values).toContain("Property");
      expect(values).toContain("handleSubmit");
      expect(values).toContain("FormProps");
      // Noise words should be filtered
      expect(values).not.toContain("on");
      expect(values).not.toContain("not");
    });

    it("should filter signals below minimum confidence threshold", () => {
      const extractor = new SignalExtractor({ minConfidence: 0.9 });
      const input = createSignalInput({
        userMessage: "Fix handleClick in src/Button.tsx",
      });

      const signals = extractor.extract(input);

      // Symbols have 0.6 confidence, should be filtered out
      const symbols = signals.filter((s) => s.type === "symbol");
      expect(symbols).toHaveLength(0);

      // Paths have 0.8 confidence, also filtered at 0.9 threshold
      // Only working_set paths have 1.0 confidence
    });

    it("should extract paths from working set with high confidence", () => {
      const extractor = new SignalExtractor();
      const input = createSignalInput({
        workingSet: ["src/index.ts", "src/utils/helpers.ts"],
      });

      const signals = extractor.extract(input);

      const workingSetSignals = signals.filter((s) => s.source === "working_set");
      expect(workingSetSignals).toHaveLength(2);
      expect(workingSetSignals.every((s) => s.confidence === 1.0)).toBe(true);
    });

    it("should extract paths from git diff", () => {
      const extractor = new SignalExtractor();
      const input = createSignalInput({
        gitDiff: {
          files: [
            { path: "src/new-file.ts", type: "added" },
            { path: "src/modified.ts", type: "modified" },
          ],
        },
      });

      const signals = extractor.extract(input);

      const diffSignals = signals.filter((s) => s.source === "git_diff");
      expect(diffSignals).toHaveLength(2);
      expect(diffSignals.every((s) => s.type === "path")).toBe(true);
    });

    it("should deduplicate signals keeping highest confidence", () => {
      const extractor = new SignalExtractor();
      // Same path from multiple sources
      const input = createSignalInput({
        userMessage: "Fix src/Button.tsx",
        workingSet: ["src/Button.tsx"],
      });

      const signals = extractor.extract(input);

      const buttonPaths = signals.filter((s) => s.type === "path" && s.value === "src/Button.tsx");
      // Should be deduplicated to single entry with highest confidence
      expect(buttonPaths).toHaveLength(1);
      expect(buttonPaths[0]?.confidence).toBe(1.0); // working_set has 1.0
    });
  });

  describe("parseStackTrace", () => {
    it("should parse Node.js stack frames", () => {
      const extractor = new SignalExtractor();
      const stack = `Error: Something went wrong
    at processFile (/app/src/processor.ts:42:15)
    at handleRequest (/app/src/handler.ts:88:3)
    at Object.<anonymous> (/app/src/index.ts:10:1)`;

      const input = createSignalInput({
        errors: [createErrorContext({ message: "Error", stack })],
      });

      const signals = extractor.extract(input);
      const stackFrames = signals.filter((s) => s.type === "stack_frame");

      expect(stackFrames.length).toBeGreaterThanOrEqual(3);

      // Check first frame has highest confidence
      const firstFrame = stackFrames.find((s) => s.value.includes("processor.ts:42"));
      expect(firstFrame).toBeDefined();
      expect(firstFrame?.metadata?.stackDepth).toBe(0);
    });

    it("should parse Python stack frames", () => {
      const extractor = new SignalExtractor();
      const stack = `Traceback (most recent call last):
  File "/app/main.py", line 25
  File "/app/utils.py", line 102`;

      const input = createSignalInput({
        errors: [createErrorContext({ message: "Error", stack })],
      });

      const signals = extractor.extract(input);
      const stackFrames = signals.filter((s) => s.type === "stack_frame");

      expect(stackFrames.length).toBeGreaterThanOrEqual(2);

      const mainFrame = stackFrames.find((s) => s.value.includes("main.py"));
      expect(mainFrame).toBeDefined();
    });

    it("should extract file paths and line numbers", () => {
      const extractor = new SignalExtractor();
      const stack = `Error: Test
    at myFunction (/project/src/file.ts:100:5)`;

      const input = createSignalInput({
        errors: [createErrorContext({ message: "Error", stack })],
      });

      const signals = extractor.extract(input);
      const stackFrames = signals.filter((s) => s.type === "stack_frame");

      expect(stackFrames.length).toBeGreaterThan(0);
      expect(stackFrames[0]?.value).toContain(":100");
    });

    it("should apply confidence decay by stack depth", () => {
      const extractor = new SignalExtractor();
      const stack = `Error: Test
    at first (/a.ts:1:1)
    at second (/b.ts:2:1)
    at third (/c.ts:3:1)`;

      const input = createSignalInput({
        errors: [createErrorContext({ message: "Error", stack })],
      });

      const signals = extractor.extract(input);
      const stackFrames = signals.filter((s) => s.type === "stack_frame");

      // Confidence should decrease with depth
      const depth0 = stackFrames.find((s) => s.metadata?.stackDepth === 0);
      const depth1 = stackFrames.find((s) => s.metadata?.stackDepth === 1);
      const depth2 = stackFrames.find((s) => s.metadata?.stackDepth === 2);

      expect(depth0?.confidence).toBeGreaterThan(depth1?.confidence ?? 0);
      expect(depth1?.confidence).toBeGreaterThan(depth2?.confidence ?? 0);
    });

    it("should handle empty or undefined stack trace", () => {
      const extractor = new SignalExtractor();
      const input = createSignalInput({
        errors: [createErrorContext({ message: "Error", stack: undefined })],
      });

      const signals = extractor.extract(input);
      const stackFrames = signals.filter((s) => s.type === "stack_frame");

      expect(stackFrames).toHaveLength(0);
    });
  });
});
