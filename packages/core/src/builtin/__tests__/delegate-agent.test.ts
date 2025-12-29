/**
 * Tests for delegate_agent tool
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "../../types/tool.js";
import { type DelegateAgentSignal, delegateAgentTool } from "../delegate-agent.js";

describe("delegateAgentTool", () => {
  let ctx: ToolContext;

  beforeEach(() => {
    ctx = {
      workingDir: "/test",
      sessionId: "test-session",
      messageId: "test-message",
      callId: "test-call",
      abortSignal: new AbortController().signal,
      checkPermission: vi.fn().mockResolvedValue(true),
    };
  });

  describe("tool definition", () => {
    it("should have correct metadata", () => {
      expect(delegateAgentTool.definition.name).toBe("delegate_agent");
      expect(delegateAgentTool.definition.kind).toBe("agent");
      expect(delegateAgentTool.definition.category).toBe("agent");
    });

    it("should always require confirmation", () => {
      expect(delegateAgentTool.shouldConfirm?.({ task: "any task", maxTurns: 10 }, ctx)).toBe(true);
    });
  });

  describe("execute", () => {
    it("should return signal with task details", async () => {
      const result = await delegateAgentTool.execute(
        { task: "Review the code for security issues", maxTurns: 10 },
        ctx
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.signal.type).toBe("delegate_agent");
        expect(result.output.signal.task).toBe("Review the code for security issues");
        expect(result.output.signal.delegationId).toMatch(/^delegate_/);
      }
    });

    it("should include optional context in signal", async () => {
      const result = await delegateAgentTool.execute(
        {
          task: "Write tests",
          context: "Focus on edge cases",
          maxTurns: 10,
        },
        ctx
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.signal.context).toBe("Focus on edge cases");
      }
    });

    it("should include optional model in signal", async () => {
      const result = await delegateAgentTool.execute(
        {
          task: "Analyze complexity",
          model: "claude-3-opus",
          maxTurns: 10,
        },
        ctx
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.signal.model).toBe("claude-3-opus");
      }
    });

    it("should use default maxTurns when not specified", async () => {
      const result = await delegateAgentTool.execute({ task: "Simple task", maxTurns: 10 }, ctx);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.signal.maxTurns).toBe(10);
      }
    });

    it("should use custom maxTurns when specified", async () => {
      const result = await delegateAgentTool.execute({ task: "Complex task", maxTurns: 25 }, ctx);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.signal.maxTurns).toBe(25);
      }
    });

    it("should generate unique delegation IDs", async () => {
      const result1 = await delegateAgentTool.execute({ task: "Task 1", maxTurns: 10 }, ctx);
      const result2 = await delegateAgentTool.execute({ task: "Task 2", maxTurns: 10 }, ctx);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);

      if (result1.success && result2.success) {
        expect(result1.output.signal.delegationId).not.toBe(result2.output.signal.delegationId);
      }
    });

    it("should include task in message", async () => {
      const result = await delegateAgentTool.execute({ task: "Important task", maxTurns: 10 }, ctx);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.message).toContain("Important task");
      }
    });

    it("should include all details in message when provided", async () => {
      const result = await delegateAgentTool.execute(
        {
          task: "Test task",
          context: "Extra context",
          model: "test-model",
          maxTurns: 15,
        },
        ctx
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.message).toContain("Test task");
        expect(result.output.message).toContain("Extra context");
        expect(result.output.message).toContain("test-model");
        expect(result.output.message).toContain("15");
      }
    });
  });

  describe("signal structure", () => {
    it("should produce valid DelegateAgentSignal", async () => {
      const result = await delegateAgentTool.execute(
        {
          task: "Complete task",
          context: "With context",
          model: "claude-3-sonnet",
          maxTurns: 20,
        },
        ctx
      );

      expect(result.success).toBe(true);
      if (result.success) {
        const signal: DelegateAgentSignal = result.output.signal;
        expect(signal).toMatchObject({
          type: "delegate_agent",
          task: "Complete task",
          context: "With context",
          model: "claude-3-sonnet",
          maxTurns: 20,
        });
        expect(typeof signal.delegationId).toBe("string");
      }
    });
  });
});
