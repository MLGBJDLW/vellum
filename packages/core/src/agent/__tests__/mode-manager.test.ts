// ============================================
// ModeManager Tests
// ============================================
// T036: Write ModeManager unit tests
// ============================================

import { beforeEach, describe, expect, it, vi } from "vitest";
import { type CodingMode, PLAN_MODE, SPEC_MODE, VIBE_MODE } from "../coding-modes.js";
import type { ModeHandler } from "../mode-handlers/types.js";
import {
  createModeManager,
  type ModeChangedEvent,
  ModeManager,
  type ModeSwitchFailedEvent,
  type SpecConfirmationRequiredEvent,
} from "../mode-manager.js";
import { SimpleActivityTracker } from "../mode-switching.js";

describe("ModeManager", () => {
  let manager: ModeManager;

  beforeEach(() => {
    manager = new ModeManager();
  });

  describe("constructor", () => {
    it("should create with default configuration", () => {
      expect(manager).toBeInstanceOf(ModeManager);
      expect(manager.getCurrentMode()).toBe("vibe");
    });

    it("should accept initial mode", () => {
      const planManager = new ModeManager({ initialMode: "plan" });
      expect(planManager.getCurrentMode()).toBe("plan");
    });

    it("should accept custom modes configuration", () => {
      const customManager = new ModeManager({
        modes: {
          vibe: { ...VIBE_MODE, description: "Custom Vibe" },
          plan: PLAN_MODE,
          spec: SPEC_MODE,
        },
      });
      expect(customManager.getModeConfig("vibe").description).toBe("Custom Vibe");
    });
  });

  describe("getCurrentMode", () => {
    it("should return current mode", () => {
      expect(manager.getCurrentMode()).toBe("vibe");
    });

    it("should update after mode switch", async () => {
      await manager.switchMode("plan");
      expect(manager.getCurrentMode()).toBe("plan");
    });
  });

  describe("getPreviousMode", () => {
    it("should return previous mode after switch", async () => {
      await manager.switchMode("plan");
      expect(manager.getPreviousMode()).toBe("vibe");
    });

    it("should track multiple switches", async () => {
      await manager.switchMode("plan");
      await manager.switchMode("vibe");
      expect(manager.getPreviousMode()).toBe("plan");
    });
  });

  describe("getCurrentHandler", () => {
    it("should return handler for current mode", () => {
      const handler = manager.getCurrentHandler();
      expect(handler).toBeDefined();
      expect(handler.config.codingMode).toBe("vibe");
    });

    it("should return different handler after mode switch", async () => {
      await manager.switchMode("plan");
      const handler = manager.getCurrentHandler();
      expect(handler.config.codingMode).toBe("plan");
    });
  });

  describe("getHandler", () => {
    it("should return handler for specified mode", () => {
      const vibeHandler = manager.getHandler("vibe");
      expect(vibeHandler).toBeDefined();
      expect(vibeHandler?.config.codingMode).toBe("vibe");

      const planHandler = manager.getHandler("plan");
      expect(planHandler).toBeDefined();
      expect(planHandler?.config.codingMode).toBe("plan");
    });
  });

  describe("getModeConfig", () => {
    it("should return config for specified mode", () => {
      expect(manager.getModeConfig("vibe")).toEqual(VIBE_MODE);
      expect(manager.getModeConfig("plan")).toEqual(PLAN_MODE);
      expect(manager.getModeConfig("spec")).toEqual(SPEC_MODE);
    });
  });

  describe("getAllHandlers", () => {
    it("should return all registered handlers", () => {
      const handlers = manager.getAllHandlers();
      expect(handlers.size).toBe(3);
      expect(handlers.has("vibe")).toBe(true);
      expect(handlers.has("plan")).toBe(true);
      expect(handlers.has("spec")).toBe(true);
    });
  });

  describe("detectMode", () => {
    it("should detect vibe mode for quick tasks", () => {
      const result = manager.detectMode("quick fix for the typo");
      expect(result.suggestedMode).toBe("vibe");
    });

    it("should detect plan mode for analysis tasks", () => {
      const result = manager.detectMode("explain how this algorithm works");
      expect(result.suggestedMode).toBe("plan");
    });

    it("should detect spec mode for comprehensive tasks", () => {
      const result = manager.detectMode("comprehensive production system redesign");
      expect(result.suggestedMode).toBe("spec");
    });

    it("should return confidence score", () => {
      const result = manager.detectMode("quick fix");
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe("canSwitchMode", () => {
    it("should allow switch to valid mode", () => {
      const result = manager.canSwitchMode("plan");
      expect(result.canSwitch).toBe(true);
    });

    it("should block switch during active operations", async () => {
      const tracker = new SimpleActivityTracker();
      const blockedManager = new ModeManager({ activityTracker: tracker });

      tracker.startOperation("file-write");

      const result = blockedManager.canSwitchMode("plan");
      expect(result.canSwitch).toBe(false);
      expect(result.reason).toContain("file operation in progress");
    });

    it("should allow switch with force flag during operations", async () => {
      const tracker = new SimpleActivityTracker();
      const blockedManager = new ModeManager({ activityTracker: tracker });

      tracker.startOperation("file-write");

      const result = blockedManager.canSwitchMode("plan", true);
      expect(result.canSwitch).toBe(true);
    });
  });

  describe("switchMode", () => {
    it("should switch to valid mode", async () => {
      const result = await manager.switchMode("plan");
      expect(result.success).toBe(true);
      expect(result.currentMode).toBe("plan");
      expect(manager.getCurrentMode()).toBe("plan");
    });

    it("should require confirmation for spec mode", async () => {
      const result = await manager.switchMode("spec");
      expect(result.success).toBe(false);
      expect(result.requiresConfirmation).toBe(true);
      expect(manager.getCurrentMode()).toBe("vibe");
    });

    it("should skip confirmation with skipConfirmation option", async () => {
      const result = await manager.switchMode("spec", { skipConfirmation: true });
      expect(result.success).toBe(true);
      expect(result.currentMode).toBe("spec");
    });

    it("should block switch during active operations", async () => {
      const tracker = new SimpleActivityTracker();
      const blockedManager = new ModeManager({ activityTracker: tracker });

      tracker.startOperation("tool-execution");

      const result = await blockedManager.switchMode("plan");
      expect(result.success).toBe(false);
      expect(result.reason).toContain("tool execution in progress");
    });

    it("should force switch with force option", async () => {
      const tracker = new SimpleActivityTracker();
      const blockedManager = new ModeManager({ activityTracker: tracker });

      tracker.startOperation("file-write");

      const result = await blockedManager.switchMode("plan", { force: true });
      expect(result.success).toBe(true);
    });

    it("should track previous mode", async () => {
      await manager.switchMode("plan");
      const result = await manager.switchMode("vibe");
      expect(result.previousMode).toBe("plan");
    });
  });

  describe("confirmSpecMode", () => {
    it("should complete pending spec switch", async () => {
      // Request spec mode (requires confirmation)
      await manager.switchMode("spec");
      expect(manager.isPendingSpecConfirmation()).toBe(true);

      // Confirm the switch
      const result = await manager.confirmSpecMode();
      expect(result.success).toBe(true);
      expect(manager.getCurrentMode()).toBe("spec");
    });

    it("should fail if no pending confirmation", async () => {
      const result = await manager.confirmSpecMode();
      expect(result.success).toBe(false);
      expect(result.reason).toContain("No pending spec mode switch");
    });
  });

  describe("cancelSpecSwitch", () => {
    it("should cancel pending spec switch", async () => {
      await manager.switchMode("spec");
      expect(manager.isPendingSpecConfirmation()).toBe(true);

      const result = manager.cancelSpecSwitch();
      expect(result.success).toBe(false);
      expect(result.reason).toContain("cancelled");
      expect(manager.isPendingSpecConfirmation()).toBe(false);
    });
  });

  describe("forceSwitch", () => {
    it("should force switch bypassing all checks", async () => {
      const tracker = new SimpleActivityTracker();
      const blockedManager = new ModeManager({ activityTracker: tracker });

      tracker.startOperation("file-write");

      const result = await blockedManager.forceSwitch("spec");
      expect(result.success).toBe(true);
      expect(blockedManager.getCurrentMode()).toBe("spec");
    });
  });

  describe("processMessage", () => {
    it("should delegate to current handler", async () => {
      const result = await manager.processMessage({ content: "test message" });
      expect(result).toBeDefined();
      expect(result.shouldContinue).toBe(true);
    });

    it("should use correct handler after mode switch", async () => {
      await manager.switchMode("plan");

      // In planning phase, certain messages trigger checkpoints
      const result = await manager.processMessage({
        content: "Plan complete, ready to execute",
      });

      // Plan handler should recognize this as a checkpoint trigger
      expect(result.requiresCheckpoint).toBe(true);
    });
  });

  describe("registerHandler", () => {
    it("should register custom handler", () => {
      const customHandler: ModeHandler = {
        config: VIBE_MODE,
        processMessage: async () => ({ shouldContinue: true }),
        getToolAccess: () => ({ enabled: [], disabled: [], groups: ["all"] }),
        onEnter: async () => {},
        onExit: async () => {},
      };

      manager.registerHandler("vibe", customHandler);

      expect(manager.getHandler("vibe")).toBe(customHandler);
    });
  });

  describe("getActivityTracker", () => {
    it("should return the activity tracker", () => {
      const tracker = manager.getActivityTracker();
      expect(tracker).toBeDefined();
    });
  });

  describe("events", () => {
    describe("mode-changed event", () => {
      it("should emit on successful mode switch", async () => {
        const listener = vi.fn();
        manager.on("mode-changed", listener);

        await manager.switchMode("plan");

        expect(listener).toHaveBeenCalledTimes(1);
        const event = listener.mock.calls[0]![0] as ModeChangedEvent;
        expect(event.previousMode).toBe("vibe");
        expect(event.currentMode).toBe("plan");
        expect(event.timestamp).toBeDefined();
      });

      it("should not emit on failed switch", async () => {
        const tracker = new SimpleActivityTracker();
        const blockedManager = new ModeManager({ activityTracker: tracker });

        const listener = vi.fn();
        blockedManager.on("mode-changed", listener);

        tracker.startOperation("file-write");
        await blockedManager.switchMode("plan");

        expect(listener).not.toHaveBeenCalled();
      });
    });

    describe("mode-switch-failed event", () => {
      it("should emit on failed switch", async () => {
        const tracker = new SimpleActivityTracker();
        const blockedManager = new ModeManager({ activityTracker: tracker });

        const listener = vi.fn();
        blockedManager.on("mode-switch-failed", listener);

        tracker.startOperation("file-write");
        await blockedManager.switchMode("plan");

        expect(listener).toHaveBeenCalledTimes(1);
        const event = listener.mock.calls[0]![0] as ModeSwitchFailedEvent;
        expect(event.attemptedMode).toBe("plan");
        expect(event.reason).toContain("file operation");
      });
    });

    describe("spec-confirmation-required event", () => {
      it("should emit when spec confirmation is needed", async () => {
        const listener = vi.fn();
        manager.on("spec-confirmation-required", listener);

        await manager.switchMode("spec");

        expect(listener).toHaveBeenCalledTimes(1);
        const event = listener.mock.calls[0]![0] as SpecConfirmationRequiredEvent;
        expect(event.currentMode).toBe("vibe");
        expect(event.timestamp).toBeDefined();
      });
    });

    describe("handler lifecycle events", () => {
      it("should emit handler-exited and handler-entered on switch", async () => {
        const exitedListener = vi.fn();
        const enteredListener = vi.fn();

        manager.on("handler-exited", exitedListener);
        manager.on("handler-entered", enteredListener);

        await manager.switchMode("plan");

        expect(exitedListener).toHaveBeenCalledWith("vibe");
        expect(enteredListener).toHaveBeenCalledWith("plan");
      });
    });
  });

  describe("createModeManager factory", () => {
    it("should create manager with default config", () => {
      const manager = createModeManager();
      expect(manager).toBeInstanceOf(ModeManager);
    });

    it("should create manager with custom config", () => {
      const manager = createModeManager({ initialMode: "plan" });
      expect(manager.getCurrentMode()).toBe("plan");
    });
  });
});

describe("ModeManager with custom handlers", () => {
  it("should use provided handlers map", () => {
    const customVibeHandler: ModeHandler = {
      config: { ...VIBE_MODE, description: "Custom" },
      processMessage: async () => ({ shouldContinue: true }),
      getToolAccess: () => ({ enabled: [], disabled: [], groups: ["all"] }),
      onEnter: async () => {},
      onExit: async () => {},
    };

    const handlers = new Map<CodingMode, ModeHandler>();
    handlers.set("vibe", customVibeHandler);

    const manager = new ModeManager({ handlers });

    expect(manager.getHandler("vibe")).toBe(customVibeHandler);
  });
});

describe("ModeManager spec mode workflow", () => {
  let manager: ModeManager;

  beforeEach(() => {
    manager = new ModeManager({ requireSpecConfirmation: true });
  });

  it("should require confirmation to enter spec mode", async () => {
    const result = await manager.switchMode("spec");

    expect(result.success).toBe(false);
    expect(result.requiresConfirmation).toBe(true);
    expect(manager.getCurrentMode()).toBe("vibe");
    expect(manager.isPendingSpecConfirmation()).toBe(true);
  });

  it("should enter spec mode after confirmation", async () => {
    await manager.switchMode("spec");
    const result = await manager.confirmSpecMode();

    expect(result.success).toBe(true);
    expect(manager.getCurrentMode()).toBe("spec");
  });

  it("should clear pending confirmation on cancel", async () => {
    await manager.switchMode("spec");
    manager.cancelSpecSwitch();

    expect(manager.isPendingSpecConfirmation()).toBe(false);
    expect(manager.getCurrentMode()).toBe("vibe");
  });

  it("should allow direct spec mode with skipConfirmation", async () => {
    const result = await manager.switchMode("spec", { skipConfirmation: true });

    expect(result.success).toBe(true);
    expect(manager.getCurrentMode()).toBe("spec");
  });

  it("should allow spec mode without confirmation when disabled", async () => {
    const noConfirmManager = new ModeManager({ requireSpecConfirmation: false });
    const result = await noConfirmManager.switchMode("spec");

    expect(result.success).toBe(true);
    expect(noConfirmManager.getCurrentMode()).toBe("spec");
  });
});

describe("ModeManager activity blocking", () => {
  let tracker: SimpleActivityTracker;
  let manager: ModeManager;

  beforeEach(() => {
    tracker = new SimpleActivityTracker();
    manager = new ModeManager({ activityTracker: tracker });
  });

  it("should block switch during file-write", async () => {
    tracker.startOperation("file-write");

    const result = await manager.switchMode("plan");

    expect(result.success).toBe(false);
    expect(result.reason).toContain("file operation in progress");
  });

  it("should block switch during file-delete", async () => {
    tracker.startOperation("file-delete");

    const result = await manager.switchMode("plan");

    expect(result.success).toBe(false);
    expect(result.reason).toContain("file operation in progress");
  });

  it("should block switch during tool-execution", async () => {
    tracker.startOperation("tool-execution");

    const result = await manager.switchMode("plan");

    expect(result.success).toBe(false);
    expect(result.reason).toContain("tool execution in progress");
  });

  it("should block switch during bash-execution", async () => {
    tracker.startOperation("bash-execution");

    const result = await manager.switchMode("plan");

    expect(result.success).toBe(false);
    expect(result.reason).toContain("tool execution in progress");
  });

  it("should allow switch after operation completes", async () => {
    tracker.startOperation("file-write");
    tracker.endOperation("file-write");

    const result = await manager.switchMode("plan");

    expect(result.success).toBe(true);
  });

  it("should allow force switch during operations", async () => {
    tracker.startOperation("file-write");

    const result = await manager.switchMode("plan", { force: true });

    expect(result.success).toBe(true);
  });
});
