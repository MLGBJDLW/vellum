import { describe, expect, it } from "vitest";
import {
  createTerminationContext,
  DEFAULT_TERMINATION_LIMITS,
  TerminationChecker,
  TerminationReason,
} from "../termination.js";

describe("TerminationChecker", () => {
  describe("constructor", () => {
    it("should use default limits when none provided", () => {
      const checker = new TerminationChecker();
      const limits = checker.getLimits();

      expect(limits.maxSteps).toBe(DEFAULT_TERMINATION_LIMITS.maxSteps);
      expect(limits.maxTokens).toBe(DEFAULT_TERMINATION_LIMITS.maxTokens);
      expect(limits.maxTimeMs).toBe(DEFAULT_TERMINATION_LIMITS.maxTimeMs);
    });

    it("should override defaults with provided limits", () => {
      const checker = new TerminationChecker({
        maxSteps: 50,
        maxTokens: 5000,
      });
      const limits = checker.getLimits();

      expect(limits.maxSteps).toBe(50);
      expect(limits.maxTokens).toBe(5000);
      expect(limits.maxTimeMs).toBe(DEFAULT_TERMINATION_LIMITS.maxTimeMs);
    });
  });

  describe("shouldTerminate", () => {
    it("should return shouldTerminate=false when no limits reached", () => {
      const checker = new TerminationChecker({ maxSteps: 100 });
      const context = createTerminationContext({ stepCount: 50 });

      const result = checker.shouldTerminate(context);

      expect(result.shouldTerminate).toBe(false);
      expect(result.reason).toBeUndefined();
    });

    it("should terminate on max steps reached", () => {
      const checker = new TerminationChecker({ maxSteps: 10 });
      const context = createTerminationContext({ stepCount: 10 });

      const result = checker.shouldTerminate(context);

      expect(result.shouldTerminate).toBe(true);
      expect(result.reason).toBe(TerminationReason.MAX_STEPS);
      expect(result.metadata?.stepsExecuted).toBe(10);
    });

    it("should terminate on max tokens reached", () => {
      const checker = new TerminationChecker({ maxTokens: 1000 });
      const context = createTerminationContext({
        tokenUsage: { inputTokens: 500, outputTokens: 600, totalTokens: 1100 },
      });

      const result = checker.shouldTerminate(context);

      expect(result.shouldTerminate).toBe(true);
      expect(result.reason).toBe(TerminationReason.MAX_TOKENS);
      expect(result.metadata?.tokensConsumed).toBe(1100);
    });

    it("should terminate on max time exceeded", () => {
      const checker = new TerminationChecker({ maxTimeMs: 1000 });
      const context = createTerminationContext({
        startTime: Date.now() - 2000, // Started 2 seconds ago
      });

      const result = checker.shouldTerminate(context);

      expect(result.shouldTerminate).toBe(true);
      expect(result.reason).toBe(TerminationReason.MAX_TIME);
    });

    it("should terminate on cancellation (highest priority)", () => {
      const checker = new TerminationChecker();
      const context = createTerminationContext({
        isCancelled: true,
        stepCount: 1, // Below limits
      });

      const result = checker.shouldTerminate(context);

      expect(result.shouldTerminate).toBe(true);
      expect(result.reason).toBe(TerminationReason.CANCELLED);
    });

    it("should terminate on error", () => {
      const checker = new TerminationChecker();
      const context = createTerminationContext({
        error: new Error("Test error"),
      });

      const result = checker.shouldTerminate(context);

      expect(result.shouldTerminate).toBe(true);
      expect(result.reason).toBe(TerminationReason.ERROR);
    });

    it("should terminate on natural stop", () => {
      const checker = new TerminationChecker();
      const context = createTerminationContext({
        hasNaturalStop: true,
      });

      const result = checker.shouldTerminate(context);

      expect(result.shouldTerminate).toBe(true);
      expect(result.reason).toBe(TerminationReason.NATURAL_STOP);
    });

    it("should terminate on text-only response when enabled", () => {
      const checker = new TerminationChecker({ terminateOnTextOnly: true });
      const context = createTerminationContext({
        hasTextOnly: true,
      });

      const result = checker.shouldTerminate(context);

      expect(result.shouldTerminate).toBe(true);
      expect(result.reason).toBe(TerminationReason.TEXT_ONLY);
    });

    it("should not terminate on text-only response when disabled", () => {
      const checker = new TerminationChecker({ terminateOnTextOnly: false });
      const context = createTerminationContext({
        hasTextOnly: true,
      });

      const result = checker.shouldTerminate(context);

      expect(result.shouldTerminate).toBe(false);
    });

    it("should detect doom loop with 3+ identical tool calls", () => {
      const checker = new TerminationChecker({
        doomLoop: { enabled: true, threshold: 3 },
      });

      const toolCall = { id: "1", name: "read_file", input: { path: "test.txt" } };
      const context = createTerminationContext({
        recentToolCalls: [
          { ...toolCall, id: "1" },
          { ...toolCall, id: "2" },
          { ...toolCall, id: "3" },
        ],
      });

      const result = checker.shouldTerminate(context);

      expect(result.shouldTerminate).toBe(true);
      expect(result.reason).toBe(TerminationReason.DOOM_LOOP);
      expect(result.metadata?.repeatedToolCall?.name).toBe("read_file");
    });

    it("should not detect doom loop with different tool calls", () => {
      const checker = new TerminationChecker({
        doomLoop: { enabled: true, threshold: 3 },
      });

      const context = createTerminationContext({
        recentToolCalls: [
          { id: "1", name: "read_file", input: { path: "a.txt" } },
          { id: "2", name: "read_file", input: { path: "b.txt" } },
          { id: "3", name: "read_file", input: { path: "c.txt" } },
        ],
      });

      const result = checker.shouldTerminate(context);

      expect(result.shouldTerminate).toBe(false);
    });

    it("should detect LLM stuck with highly similar responses", () => {
      const checker = new TerminationChecker({
        llmStuck: { enabled: true, threshold: 0.85, windowSize: 3 },
      });

      const context = createTerminationContext({
        recentResponses: [
          "I cannot access that file because it does not exist.",
          "I cannot access that file because it does not exist.",
          "I cannot access that file because it does not exist.",
        ],
      });

      const result = checker.shouldTerminate(context);

      expect(result.shouldTerminate).toBe(true);
      expect(result.reason).toBe(TerminationReason.LLM_STUCK);
      expect(result.metadata?.similarityScore).toBeGreaterThanOrEqual(0.85);
    });

    it("should prioritize cancellation over other reasons", () => {
      const checker = new TerminationChecker({ maxSteps: 10 });
      const context = createTerminationContext({
        isCancelled: true,
        stepCount: 100, // Also exceeds max steps
        error: new Error("Also has error"),
      });

      const result = checker.shouldTerminate(context);

      expect(result.shouldTerminate).toBe(true);
      expect(result.reason).toBe(TerminationReason.CANCELLED);
    });
  });

  describe("createTerminationContext", () => {
    it("should create context with default values", () => {
      const context = createTerminationContext();

      expect(context.stepCount).toBe(0);
      expect(context.tokenUsage.totalTokens).toBe(0);
      expect(context.hasTextOnly).toBe(false);
      expect(context.hasNaturalStop).toBe(false);
      expect(context.isCancelled).toBe(false);
      expect(context.recentToolCalls).toHaveLength(0);
      expect(context.recentResponses).toHaveLength(0);
    });

    it("should apply overrides", () => {
      const context = createTerminationContext({
        stepCount: 5,
        isCancelled: true,
      });

      expect(context.stepCount).toBe(5);
      expect(context.isCancelled).toBe(true);
    });
  });
});
