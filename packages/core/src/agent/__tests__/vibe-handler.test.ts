// ============================================
// VibeModeHandler Tests
// ============================================
// T021: Write VibeModeHandler unit tests
// ============================================

import { beforeEach, describe, expect, it } from "vitest";
import { VIBE_MODE } from "../coding-modes.js";
import { AgentLevel } from "../level.js";
import type { UserMessage } from "../mode-handlers/index.js";
import { VibeModeHandler } from "../mode-handlers/vibe.js";

describe("VibeModeHandler", () => {
  let handler: VibeModeHandler;

  beforeEach(() => {
    handler = new VibeModeHandler(VIBE_MODE);
  });

  describe("constructor", () => {
    it("should initialize with VIBE_MODE config", () => {
      expect(handler.config).toBe(VIBE_MODE);
    });

    it("should have correct coding mode", () => {
      expect(handler.config.codingMode).toBe("vibe");
    });
  });

  describe("processMessage", () => {
    it("should pass through messages unchanged", async () => {
      const message: UserMessage = {
        content: "Fix the bug in app.ts",
        timestamp: Date.now(),
      };

      const result = await handler.processMessage(message);

      expect(result.shouldContinue).toBe(true);
      expect(result.modifiedMessage).toBeDefined();
      expect(result.modifiedMessage?.content).toBe(message.content);
    });

    it("should not require checkpoints", async () => {
      const message: UserMessage = {
        content: "Create a new feature",
      };

      const result = await handler.processMessage(message);

      expect(result.requiresCheckpoint).toBeUndefined();
    });

    it("should preserve message metadata", async () => {
      const message: UserMessage = {
        content: "Test message",
        metadata: { key: "value", nested: { foo: "bar" } },
      };

      const result = await handler.processMessage(message);

      expect(result.modifiedMessage?.metadata).toEqual(message.metadata);
    });

    it("should handle empty content", async () => {
      const message: UserMessage = {
        content: "",
      };

      const result = await handler.processMessage(message);

      expect(result.shouldContinue).toBe(true);
      expect(result.modifiedMessage?.content).toBe("");
    });

    it("should handle messages with special characters", async () => {
      const message: UserMessage = {
        content: "Fix `const x = 1 && y || z` in file.ts",
      };

      const result = await handler.processMessage(message);

      expect(result.shouldContinue).toBe(true);
      expect(result.modifiedMessage?.content).toBe(message.content);
    });
  });

  describe("getToolAccess", () => {
    it("should return full access with 'all' group", () => {
      const access = handler.getToolAccess();

      expect(access.groups).toContain("all");
    });

    it("should have no disabled tools", () => {
      const access = handler.getToolAccess();

      expect(access.disabled).toHaveLength(0);
    });

    it("should have no explicitly enabled tools (all enabled by group)", () => {
      const access = handler.getToolAccess();

      expect(access.enabled).toHaveLength(0);
    });

    it("should consistently return the same access config", () => {
      const access1 = handler.getToolAccess();
      const access2 = handler.getToolAccess();

      expect(access1.groups).toEqual(access2.groups);
      expect(access1.enabled).toEqual(access2.enabled);
      expect(access1.disabled).toEqual(access2.disabled);
    });
  });

  describe("onEnter", () => {
    it("should complete without error", async () => {
      await expect(handler.onEnter()).resolves.toBeUndefined();
    });

    it("should be idempotent", async () => {
      await handler.onEnter();
      await handler.onEnter();
      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe("onExit", () => {
    it("should complete without error", async () => {
      await expect(handler.onExit()).resolves.toBeUndefined();
    });

    it("should be idempotent", async () => {
      await handler.onExit();
      await handler.onExit();
      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe("agentLevel", () => {
    it("should return worker level", () => {
      expect(handler.agentLevel).toBe(AgentLevel.worker);
    });
  });

  describe("requiresCheckpoints", () => {
    it("should return false", () => {
      expect(handler.requiresCheckpoints).toBe(false);
    });
  });

  describe("checkpointCount", () => {
    it("should return 0", () => {
      expect(handler.checkpointCount).toBe(0);
    });
  });

  describe("canSpawnAgents", () => {
    it("should return false for VIBE_MODE", () => {
      expect(handler.canSpawnAgents).toBe(false);
    });
  });

  describe("config values", () => {
    it("should have correct approval policy", () => {
      expect(handler.config.approvalPolicy).toBe("full-auto");
    });

    it("should have correct sandbox policy", () => {
      expect(handler.config.sandboxPolicy).toBe("full-access");
    });

    it("should have full tool permissions", () => {
      expect(handler.config.tools.edit).toBe(true);
      expect(handler.config.tools.bash).toBe(true);
    });
  });

  describe("lifecycle integration", () => {
    it("should work correctly through full lifecycle", async () => {
      // Enter
      await handler.onEnter();

      // Process messages
      const msg1: UserMessage = { content: "First message" };
      const result1 = await handler.processMessage(msg1);
      expect(result1.shouldContinue).toBe(true);

      const msg2: UserMessage = { content: "Second message" };
      const result2 = await handler.processMessage(msg2);
      expect(result2.shouldContinue).toBe(true);

      // Tool access remains constant
      const access = handler.getToolAccess();
      expect(access.groups).toContain("all");

      // Exit
      await handler.onExit();
    });
  });
});
