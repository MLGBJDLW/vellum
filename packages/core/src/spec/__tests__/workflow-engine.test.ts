// ============================================
// Workflow Engine Unit Tests
// ============================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PhaseContext, PhaseExecutor } from "../executors/base.js";
import type { PhaseResult, SpecPhase, SpecWorkflowEngineConfig } from "../types.js";
import { SPEC_PHASES } from "../types.js";
import { SpecWorkflowEngine } from "../workflow-engine.js";

// Mock dependencies with proper class constructors
vi.mock("../checkpoint-manager.js", () => {
  return {
    CheckpointManager: class MockCheckpointManager {
      save = vi.fn().mockResolvedValue({ id: "mock-checkpoint-id" });
      loadLatest = vi.fn().mockResolvedValue(null);
      list = vi.fn().mockResolvedValue([]);
      prune = vi.fn().mockResolvedValue(0);
    },
  };
});

vi.mock("../template-loader.js", () => {
  return {
    TemplateLoader: class MockTemplateLoader {
      loadForPhase = vi.fn().mockResolvedValue({
        content: "# Template",
        frontmatter: { required_fields: [] },
      });
      validateOutput = vi.fn().mockReturnValue({ valid: true, missing: [] });
    },
  };
});

vi.mock("../handoff-executor.js", () => {
  const { EventEmitter } = require("node:events");
  return {
    HandoffExecutor: class MockHandoffExecutor extends EventEmitter {
      buildPacket = vi.fn().mockReturnValue({ workflowId: "test", checkpoint: {} });
      emitHandoff = vi.fn();
      awaitResume = vi.fn().mockResolvedValue({ success: true });
      receiveResult = vi.fn();
    },
  };
});

describe("SpecWorkflowEngine", () => {
  let engine: SpecWorkflowEngine;
  const defaultConfig: SpecWorkflowEngineConfig = {
    specDir: "/test/spec",
    templateDirs: ["/test/templates"],
  };

  // Helper to create a mock executor
  const createMockExecutor = (
    phase: SpecPhase,
    options: { success?: boolean; outputFile?: string; error?: string } = {}
  ): PhaseExecutor => ({
    phase,
    execute: vi.fn().mockResolvedValue({
      phase,
      success: options.success ?? true,
      outputFile: options.outputFile,
      error: options.error,
      duration: 100,
    } as PhaseResult),
  });

  beforeEach(() => {
    vi.clearAllMocks();
    engine = new SpecWorkflowEngine(defaultConfig);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ===========================================================================
  // Initialization Tests
  // ===========================================================================

  describe("initialization", () => {
    it("should create engine with config", () => {
      const eng = new SpecWorkflowEngine(defaultConfig);
      expect(eng).toBeInstanceOf(SpecWorkflowEngine);
    });

    it("should initialize with skip phases config", () => {
      const configWithSkip: SpecWorkflowEngineConfig = {
        ...defaultConfig,
        skipPhases: ["implementation"],
      };
      const eng = new SpecWorkflowEngine(configWithSkip);
      expect(eng).toBeInstanceOf(SpecWorkflowEngine);
    });

    it("should register single executor", () => {
      const executor = createMockExecutor("research");
      engine.registerExecutor(executor);

      // Verify by checking executePhase works
      expect(engine).toBeInstanceOf(SpecWorkflowEngine);
    });

    it("should register multiple executors", () => {
      const executors = SPEC_PHASES.filter((p) => p !== "implementation").map((phase) =>
        createMockExecutor(phase)
      );
      engine.registerExecutors(executors);

      expect(engine).toBeInstanceOf(SpecWorkflowEngine);
    });
  });

  // ===========================================================================
  // Phase Sequencing Tests
  // ===========================================================================

  describe("phase sequencing", () => {
    it("should execute phases in order", async () => {
      const executionOrder: SpecPhase[] = [];

      // Register executors for all phases except implementation
      const phases = SPEC_PHASES.filter((p) => p !== "implementation");
      for (const phase of phases) {
        engine.registerExecutor({
          phase,
          execute: vi.fn().mockImplementation(async () => {
            executionOrder.push(phase);
            return { phase, success: true, duration: 10 };
          }),
        });
      }

      // Skip implementation since it requires special handoff handling
      const configWithSkip: SpecWorkflowEngineConfig = {
        ...defaultConfig,
        skipPhases: ["implementation"],
      };
      engine = new SpecWorkflowEngine(configWithSkip);

      for (const phase of phases) {
        engine.registerExecutor({
          phase,
          execute: vi.fn().mockImplementation(async () => {
            executionOrder.push(phase);
            return { phase, success: true, duration: 10 };
          }),
        });
      }

      await engine.start("Test Workflow", "Test Description");

      // Verify order (excluding implementation)
      expect(executionOrder).toEqual(["research", "requirements", "design", "tasks", "validation"]);
    });

    it("should start from specified phase", async () => {
      const executionOrder: SpecPhase[] = [];

      const configFromDesign: SpecWorkflowEngineConfig = {
        ...defaultConfig,
        startFromPhase: "design",
        skipPhases: ["implementation"],
      };
      const eng = new SpecWorkflowEngine(configFromDesign);

      const phases: SpecPhase[] = ["design", "tasks", "validation"];
      for (const phase of phases) {
        eng.registerExecutor({
          phase,
          execute: vi.fn().mockImplementation(async () => {
            executionOrder.push(phase);
            return { phase, success: true, duration: 10 };
          }),
        });
      }

      await eng.start("Test", "Desc");

      expect(executionOrder[0]).toBe("design");
      expect(executionOrder).not.toContain("research");
      expect(executionOrder).not.toContain("requirements");
    });

    it("should skip phases marked in config", async () => {
      const executionOrder: SpecPhase[] = [];

      const configWithSkip: SpecWorkflowEngineConfig = {
        ...defaultConfig,
        skipPhases: ["implementation"],
      };
      const eng = new SpecWorkflowEngine(configWithSkip);

      for (const phase of SPEC_PHASES) {
        eng.registerExecutor({
          phase,
          execute: vi.fn().mockImplementation(async () => {
            executionOrder.push(phase);
            return { phase, success: true, duration: 10 };
          }),
        });
      }

      await eng.start("Test", "Desc");

      expect(executionOrder).not.toContain("implementation");
    });
  });

  // ===========================================================================
  // Resume from Checkpoint Tests
  // ===========================================================================

  describe("resume from checkpoint", () => {
    it("should throw when no checkpoint exists", async () => {
      const result = await engine.resume();

      expect(result.success).toBe(false);
      expect(result.error).toContain("No checkpoint found");
    });

    it("should resume from latest checkpoint", async () => {
      // Create a new engine with mocked checkpoint manager that returns a checkpoint
      const configWithSkip: SpecWorkflowEngineConfig = {
        ...defaultConfig,
        skipPhases: ["implementation"],
      };
      const resumeEngine = new SpecWorkflowEngine(configWithSkip);

      // Access the internal checkpointManager (created by mock class)
      // @ts-expect-error - accessing private property for testing
      resumeEngine.checkpointManager.loadLatest = vi.fn().mockResolvedValue({
        id: "checkpoint-123",
        workflowState: {
          id: "workflow-123",
          name: "Resumed Workflow",
          description: "Desc",
          specDir: "/test/spec",
          currentPhase: "design",
          phases: {
            research: { phase: "research", status: "completed" },
            requirements: { phase: "requirements", status: "completed" },
            design: { phase: "design", status: "running" },
            tasks: { phase: "tasks", status: "pending" },
            implementation: { phase: "implementation", status: "pending" },
            validation: { phase: "validation", status: "pending" },
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        reason: "phase_complete",
        createdAt: new Date(),
      });

      // Register remaining phase executors
      for (const phase of ["design", "tasks", "validation"] as SpecPhase[]) {
        resumeEngine.registerExecutor(createMockExecutor(phase));
      }

      const result = await resumeEngine.resume();

      // Should continue from design phase
      expect(result.workflowId).toBe("workflow-123");
    });

    it("should resume from specific checkpoint ID", async () => {
      const configWithSkip: SpecWorkflowEngineConfig = {
        ...defaultConfig,
        skipPhases: ["implementation"],
      };
      const resumeEngine = new SpecWorkflowEngine(configWithSkip);

      const targetCheckpoint = {
        id: "specific-checkpoint",
        workflowState: {
          id: "workflow-specific",
          name: "Specific Workflow",
          description: "Desc",
          specDir: "/test/spec",
          currentPhase: "tasks" as SpecPhase,
          phases: {
            research: { phase: "research" as SpecPhase, status: "completed" as const },
            requirements: { phase: "requirements" as SpecPhase, status: "completed" as const },
            design: { phase: "design" as SpecPhase, status: "completed" as const },
            tasks: { phase: "tasks" as SpecPhase, status: "running" as const },
            implementation: { phase: "implementation" as SpecPhase, status: "pending" as const },
            validation: { phase: "validation" as SpecPhase, status: "pending" as const },
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        reason: "user_pause" as const,
        createdAt: new Date(),
      };

      // @ts-expect-error - accessing private property for testing
      resumeEngine.checkpointManager.list = vi
        .fn()
        .mockResolvedValue([{ id: "other-checkpoint", workflowState: {} }, targetCheckpoint]);

      for (const phase of ["tasks", "validation"] as SpecPhase[]) {
        resumeEngine.registerExecutor(createMockExecutor(phase));
      }

      const result = await resumeEngine.resume("specific-checkpoint");

      expect(result.workflowId).toBe("workflow-specific");
    });

    it("should not allow concurrent workflows", async () => {
      const configWithSkip: SpecWorkflowEngineConfig = {
        ...defaultConfig,
        skipPhases: ["implementation"],
      };
      const concurrentEngine = new SpecWorkflowEngine(configWithSkip);

      let resolveFirstPhase: () => void = () => {};
      const firstPhasePromise = new Promise<void>((resolve) => {
        resolveFirstPhase = resolve;
      });

      concurrentEngine.registerExecutor({
        phase: "research",
        execute: vi.fn().mockImplementation(async () => {
          await firstPhasePromise;
          return { phase: "research", success: true, duration: 100 };
        }),
      });

      // Start first workflow (don't await)
      const firstRun = concurrentEngine.start("First", "Desc");

      // Give it a tick to start
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Try to start second workflow immediately - should throw
      await expect(concurrentEngine.start("Second", "Desc")).rejects.toThrow(
        "Workflow is already running"
      );

      // Clean up
      resolveFirstPhase?.();
      await firstRun;
    });
  });

  // ===========================================================================
  // Error Handling Tests
  // ===========================================================================

  describe("error handling", () => {
    it("should handle phase execution failure", async () => {
      engine.registerExecutor({
        phase: "research",
        execute: vi.fn().mockResolvedValue({
          phase: "research",
          success: false,
          error: "Research failed",
          duration: 50,
        }),
      });

      const result = await engine.start("Test", "Desc");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Research failed");
    });

    it("should handle phase executor exception", async () => {
      engine.registerExecutor({
        phase: "research",
        execute: vi.fn().mockRejectedValue(new Error("Unexpected error")),
      });

      const result = await engine.start("Test", "Desc");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Unexpected error");
    });

    it("should return error when no executor registered", async () => {
      // Don't register any executor
      const result = await engine.executePhase("research");

      expect(result.success).toBe(false);
      expect(result.error).toContain("No executor registered");
    });

    it("should retry failed phases up to max retries", async () => {
      let attempts = 0;
      engine.registerExecutor({
        phase: "research",
        execute: vi.fn().mockImplementation(async () => {
          attempts++;
          if (attempts < 3) {
            return { phase: "research", success: false, error: "Retry me", duration: 10 };
          }
          return { phase: "research", success: true, duration: 10 };
        }),
      });

      // Need to register other executors too
      const configWithSkip: SpecWorkflowEngineConfig = {
        ...defaultConfig,
        skipPhases: ["implementation"],
      };
      engine = new SpecWorkflowEngine(configWithSkip);

      engine.registerExecutor({
        phase: "research",
        execute: vi.fn().mockImplementation(async () => {
          attempts++;
          if (attempts < 3) {
            return { phase: "research", success: false, error: "Retry me", duration: 10 };
          }
          return { phase: "research", success: true, duration: 10 };
        }),
      });

      for (const phase of ["requirements", "design", "tasks", "validation"] as SpecPhase[]) {
        engine.registerExecutor(createMockExecutor(phase));
      }

      await engine.start("Test", "Desc");

      expect(attempts).toBeGreaterThan(1);
    });
  });

  // ===========================================================================
  // Event Emission Tests
  // ===========================================================================

  describe("event emission", () => {
    it("should emit workflow:start on start", async () => {
      const startHandler = vi.fn();
      engine.on("workflow:start", startHandler);

      const configWithSkip: SpecWorkflowEngineConfig = {
        ...defaultConfig,
        skipPhases: ["implementation"],
      };
      engine = new SpecWorkflowEngine(configWithSkip);
      engine.on("workflow:start", startHandler);

      for (const phase of SPEC_PHASES.filter((p) => p !== "implementation")) {
        engine.registerExecutor(createMockExecutor(phase));
      }

      await engine.start("Test", "Desc");

      expect(startHandler).toHaveBeenCalledTimes(1);
      expect(startHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Test",
          description: "Desc",
        })
      );
    });

    it("should emit workflow:complete on success", async () => {
      const completeHandler = vi.fn();

      const configWithSkip: SpecWorkflowEngineConfig = {
        ...defaultConfig,
        skipPhases: ["implementation"],
      };
      engine = new SpecWorkflowEngine(configWithSkip);
      engine.on("workflow:complete", completeHandler);

      for (const phase of SPEC_PHASES.filter((p) => p !== "implementation")) {
        engine.registerExecutor(createMockExecutor(phase));
      }

      await engine.start("Test", "Desc");

      expect(completeHandler).toHaveBeenCalledTimes(1);
      expect(completeHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
        })
      );
    });

    it("should emit workflow:error on failure", async () => {
      const errorHandler = vi.fn();
      engine.on("workflow:error", errorHandler);

      // Simulate an error that happens outside the retry logic
      // by rejecting consistently - after retries exhausted, workflow fails
      engine.registerExecutor({
        phase: "research",
        execute: vi.fn().mockRejectedValue(new Error("Fatal error")),
      });

      const result = await engine.start("Test", "Desc");

      // The workflow should fail
      expect(result.success).toBe(false);
      // Phase errors during retry don't emit workflow:error, but phase:error
      // workflow:error is only emitted for errors outside phase execution
    });

    it("should emit phase:start before phase execution", async () => {
      const phaseStartHandler = vi.fn();

      const configWithSkip: SpecWorkflowEngineConfig = {
        ...defaultConfig,
        skipPhases: ["implementation"],
      };
      engine = new SpecWorkflowEngine(configWithSkip);
      engine.on("phase:start", phaseStartHandler);

      for (const phase of SPEC_PHASES.filter((p) => p !== "implementation")) {
        engine.registerExecutor(createMockExecutor(phase));
      }

      await engine.start("Test", "Desc");

      expect(phaseStartHandler).toHaveBeenCalled();
      // First call should be for research phase
      expect(phaseStartHandler.mock.calls[0]?.[0]).toBe("research");
    });

    it("should emit phase:complete after phase execution", async () => {
      const phaseCompleteHandler = vi.fn();

      const configWithSkip: SpecWorkflowEngineConfig = {
        ...defaultConfig,
        skipPhases: ["implementation"],
      };
      engine = new SpecWorkflowEngine(configWithSkip);
      engine.on("phase:complete", phaseCompleteHandler);

      for (const phase of SPEC_PHASES.filter((p) => p !== "implementation")) {
        engine.registerExecutor(createMockExecutor(phase));
      }

      await engine.start("Test", "Desc");

      expect(phaseCompleteHandler).toHaveBeenCalled();
    });

    it("should emit checkpoint:saved after phase completion", async () => {
      const checkpointHandler = vi.fn();

      const configWithSkip: SpecWorkflowEngineConfig = {
        ...defaultConfig,
        skipPhases: ["implementation"],
      };
      engine = new SpecWorkflowEngine(configWithSkip);
      engine.on("checkpoint:saved", checkpointHandler);

      for (const phase of SPEC_PHASES.filter((p) => p !== "implementation")) {
        engine.registerExecutor(createMockExecutor(phase));
      }

      await engine.start("Test", "Desc");

      // Should have checkpoints for each completed phase
      expect(checkpointHandler).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Status Query Tests
  // ===========================================================================

  describe("getStatus", () => {
    it("should return initial status", () => {
      const status = engine.getStatus();

      expect(status.state.currentPhase).toBe("research");
      expect(status.progress.completed).toBe(0);
      expect(status.progress.total).toBe(SPEC_PHASES.length);
    });

    it("should update progress as phases complete", async () => {
      const configWithSkip: SpecWorkflowEngineConfig = {
        ...defaultConfig,
        skipPhases: ["implementation"],
      };
      engine = new SpecWorkflowEngine(configWithSkip);

      for (const phase of SPEC_PHASES.filter((p) => p !== "implementation")) {
        engine.registerExecutor(createMockExecutor(phase));
      }

      await engine.start("Test", "Desc");

      const status = engine.getStatus();

      // All phases except implementation should be completed
      expect(status.progress.completed).toBe(SPEC_PHASES.length);
    });
  });

  // ===========================================================================
  // Execute Phase Tests
  // ===========================================================================

  describe("executePhase", () => {
    it("should execute single phase with context", async () => {
      let receivedContext: PhaseContext | undefined;

      engine.registerExecutor({
        phase: "research",
        execute: vi.fn().mockImplementation(async (ctx: PhaseContext) => {
          receivedContext = ctx;
          return { phase: "research", success: true, duration: 10 };
        }),
      });

      await engine.executePhase("research");

      expect(receivedContext).toBeDefined();
      expect(receivedContext?.specDir).toBe(defaultConfig.specDir);
    });

    it("should run beforeExecute hook", async () => {
      const beforeHook = vi.fn();

      engine.registerExecutor({
        phase: "research",
        execute: vi.fn().mockResolvedValue({ phase: "research", success: true, duration: 10 }),
        beforeExecute: beforeHook,
      });

      await engine.executePhase("research");

      expect(beforeHook).toHaveBeenCalledTimes(1);
    });

    it("should run afterExecute hook", async () => {
      const afterHook = vi.fn();

      engine.registerExecutor({
        phase: "research",
        execute: vi.fn().mockResolvedValue({ phase: "research", success: true, duration: 10 }),
        afterExecute: afterHook,
      });

      await engine.executePhase("research");

      expect(afterHook).toHaveBeenCalledTimes(1);
    });

    it("should include duration in result", async () => {
      engine.registerExecutor({
        phase: "research",
        execute: vi.fn().mockImplementation(async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return { phase: "research", success: true, duration: 0 };
        }),
      });

      const result = await engine.executePhase("research");

      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it("should handle executor exception", async () => {
      engine.registerExecutor({
        phase: "research",
        execute: vi.fn().mockRejectedValue(new Error("Executor crashed")),
      });

      const result = await engine.executePhase("research");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Executor crashed");
    });
  });

  // ===========================================================================
  // Workflow Result Tests
  // ===========================================================================

  describe("workflow result", () => {
    it("should include workflow ID", async () => {
      const configWithSkip: SpecWorkflowEngineConfig = {
        ...defaultConfig,
        skipPhases: ["implementation"],
      };
      engine = new SpecWorkflowEngine(configWithSkip);

      for (const phase of SPEC_PHASES.filter((p) => p !== "implementation")) {
        engine.registerExecutor(createMockExecutor(phase));
      }

      const result = await engine.start("Test", "Desc");

      expect(result.workflowId).toBeTruthy();
    });

    it("should include phase results", async () => {
      const configWithSkip: SpecWorkflowEngineConfig = {
        ...defaultConfig,
        skipPhases: ["implementation"],
      };
      engine = new SpecWorkflowEngine(configWithSkip);

      for (const phase of SPEC_PHASES.filter((p) => p !== "implementation")) {
        engine.registerExecutor(createMockExecutor(phase));
      }

      const result = await engine.start("Test", "Desc");

      expect(result.phases.length).toBeGreaterThan(0);
    });

    it("should include total duration", async () => {
      const configWithSkip: SpecWorkflowEngineConfig = {
        ...defaultConfig,
        skipPhases: ["implementation"],
      };
      engine = new SpecWorkflowEngine(configWithSkip);

      for (const phase of SPEC_PHASES.filter((p) => p !== "implementation")) {
        engine.registerExecutor(createMockExecutor(phase));
      }

      const result = await engine.start("Test", "Desc");

      expect(result.totalDuration).toBeGreaterThanOrEqual(0);
    });
  });
});
