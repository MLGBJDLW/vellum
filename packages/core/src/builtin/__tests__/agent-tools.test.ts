/**
 * @module builtin/__tests__/agent-tools.test
 */

import { describe, expect, it, vi } from "vitest";
import type { ToolContext } from "../../types/index.js";
import { askFollowupQuestionTool } from "../ask-followup.js";
import { attemptCompletionTool } from "../attempt-completion.js";

// Mock executeShell
vi.mock("../utils/index.js", async () => {
  const actual = await vi.importActual<typeof import("../utils/index.js")>("../utils/index.js");
  return {
    ...actual,
    executeShell: vi.fn().mockResolvedValue({
      stdout: "All tests passed!",
      stderr: "",
      exitCode: 0,
      killed: false,
      signal: null,
      duration: 100,
    }),
  };
});

const mockContext: ToolContext = {
  workingDir: "/test/dir",
  sessionId: "test-session",
  messageId: "test-message",
  callId: "test-call",
  abortSignal: new AbortController().signal,
  checkPermission: vi.fn().mockResolvedValue(true),
};

describe("attemptCompletionTool", () => {
  describe("definition", () => {
    it("should have correct name", () => {
      expect(attemptCompletionTool.definition.name).toBe("attempt_completion");
    });

    it("should have correct kind", () => {
      expect(attemptCompletionTool.definition.kind).toBe("agent");
    });

    it("should have description", () => {
      expect(attemptCompletionTool.definition.description).toBeTruthy();
    });
  });

  describe("execute", () => {
    it("should complete without verification command", async () => {
      const result = await attemptCompletionTool.execute(
        { result: "Task completed successfully" },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.result).toBe("Task completed successfully");
        expect(result.output.verified).toBe(false);
        expect(result.output.completed).toBe(true);
      }
    });

    it("should run verification command and report success", async () => {
      const result = await attemptCompletionTool.execute(
        {
          result: "Fixed the bug",
          command: "npm test",
        },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.verified).toBe(true);
        expect((result.output as { verificationPassed?: boolean }).verificationPassed).toBe(true);
        expect((result.output as { verificationOutput?: string }).verificationOutput).toBe(
          "All tests passed!"
        );
        expect(result.output.completed).toBe(true);
      }
    });

    it("should handle failing verification command", async () => {
      const { executeShell } = vi.mocked(await import("../utils/index.js"));
      executeShell.mockResolvedValueOnce({
        stdout: "",
        stderr: "Test failed",
        exitCode: 1,
        killed: false,
        signal: null,
        duration: 100,
      });

      const result = await attemptCompletionTool.execute(
        {
          result: "Attempted fix",
          command: "npm test",
        },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.verified).toBe(true);
        expect((result.output as { verificationPassed?: boolean }).verificationPassed).toBe(false);
        expect(result.output.completed).toBe(true);
      }
    });

    it("should fail when aborted", async () => {
      const abortController = new AbortController();
      abortController.abort();

      const result = await attemptCompletionTool.execute(
        { result: "Task completed" },
        { ...mockContext, abortSignal: abortController.signal }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("cancelled");
      }
    });
  });

  describe("shouldConfirm", () => {
    it("should not require confirmation", () => {
      expect(attemptCompletionTool.shouldConfirm?.({ result: "Done" }, mockContext)).toBe(false);
    });
  });
});

describe("askFollowupQuestionTool", () => {
  describe("definition", () => {
    it("should have correct name", () => {
      expect(askFollowupQuestionTool.definition.name).toBe("ask_followup_question");
    });

    it("should have correct kind", () => {
      expect(askFollowupQuestionTool.definition.kind).toBe("agent");
    });

    it("should have description", () => {
      expect(askFollowupQuestionTool.definition.description).toBeTruthy();
    });
  });

  describe("execute", () => {
    it("should return prompt signal for simple question", async () => {
      const result = await askFollowupQuestionTool.execute(
        { question: "Which framework should I use?" },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.response).toBe("__WAITING_FOR_USER_INPUT__");
        expect(result.output.cancelled).toBe(false);
        expect((result.output as unknown as Record<string, unknown>)._prompt).toHaveProperty(
          "question",
          "Which framework should I use?"
        );
      }
    });

    it("should include suggestions in prompt signal", async () => {
      const result = await askFollowupQuestionTool.execute(
        {
          question: "Which database?",
          suggestions: ["PostgreSQL", "MySQL", "MongoDB"],
        },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.output as unknown as Record<string, unknown>)._prompt).toHaveProperty(
          "suggestions",
          ["PostgreSQL", "MySQL", "MongoDB"]
        );
      }
    });

    it("should fail for empty question", async () => {
      const result = await askFollowupQuestionTool.execute({ question: "   " }, mockContext);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("empty");
      }
    });

    it("should fail when aborted", async () => {
      const abortController = new AbortController();
      abortController.abort();

      const result = await askFollowupQuestionTool.execute(
        { question: "Test question?" },
        { ...mockContext, abortSignal: abortController.signal }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("cancelled");
      }
    });
  });

  describe("shouldConfirm", () => {
    it("should not require confirmation", () => {
      expect(askFollowupQuestionTool.shouldConfirm?.({ question: "Test?" }, mockContext)).toBe(
        false
      );
    });
  });
});
