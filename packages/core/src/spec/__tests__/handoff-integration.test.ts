// ============================================
// Handoff Integration Tests
// ============================================

/**
 * End-to-end integration tests for the full handoff flow.
 *
 * Tests the complete cycle:
 * 1. Spec workflow starts
 * 2. Reaches implementation phase
 * 3. Emits handoff to orchestrator
 * 4. Orchestrator routes to coder
 * 5. Callback returns to spec
 * 6. Validation phase runs to completion
 *
 * @module @vellum/core/spec/__tests__/handoff-integration
 */

import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PhaseContext, PhaseExecutor } from "../executors/base.js";
import type { ImplementationResult, SpecHandoffPacket } from "../handoff-executor.js";
import type { PhaseResult, SpecPhase, SpecWorkflowEngineConfig } from "../types.js";
import { SpecWorkflowEngine } from "../workflow-engine.js";

// =============================================================================
// Mock Orchestrator
// =============================================================================

/**
 * Mock orchestrator that simulates routing handoffs to coder.
 */
class MockOrchestrator extends EventEmitter {
  private mockCoderResponse: ImplementationResult;
  public receivedPackets: SpecHandoffPacket[] = [];
  public routedToCoder = false;
  private handoffProcessed = false;

  constructor(coderResponse: ImplementationResult) {
    super();
    this.mockCoderResponse = coderResponse;
  }

  /**
   * Handles incoming handoff packet from spec workflow.
   * Only processes the first handoff to avoid duplicate routing.
   */
  handleHandoff(packet: SpecHandoffPacket): void {
    if (this.handoffProcessed) return;
    this.handoffProcessed = true;

    this.receivedPackets.push(packet);
    // Simulate routing to coder
    this.routeToCoder(packet);
  }

  /**
   * Simulates routing to coder agent and receiving response.
   * Uses queueMicrotask for immediate async execution within same event loop tick.
   */
  private routeToCoder(packet: SpecHandoffPacket): void {
    this.routedToCoder = true;

    // Use queueMicrotask to emit synchronously within the same tick
    // This prevents race conditions where test completes before callback
    queueMicrotask(() => {
      this.emit("coder:complete", {
        packet,
        result: this.mockCoderResponse,
      });
    });
  }
}

// =============================================================================
// Mock Dependencies
// =============================================================================

vi.mock("../checkpoint-manager.js", () => {
  return {
    CheckpointManager: class MockCheckpointManager {
      private checkpointCounter = 0;

      async save() {
        const id = `mock-checkpoint-${++this.checkpointCounter}`;
        return { id };
      }
      async loadLatest() {
        return null;
      }
      async list() {
        return [];
      }
      async prune() {
        return 0;
      }
    },
  };
});

vi.mock("../template-loader.js", () => {
  return {
    TemplateLoader: class MockTemplateLoader {
      async loadForPhase() {
        return {
          content: "# Template",
          frontmatter: { required_fields: [] },
        };
      }
      validateOutput() {
        return { valid: true, missing: [] };
      }
    },
  };
});

vi.mock("../handoff-executor.js", () => {
  const { EventEmitter } = require("node:events");

  return {
    HandoffExecutor: class MockHandoffExecutor extends EventEmitter {
      private specDir: string;
      private pendingResolve: ((result: ImplementationResult) => void) | null = null;

      constructor(specDir: string) {
        super();
        this.specDir = specDir;
      }

      buildPacket(workflowId: string, checkpointId: string): SpecHandoffPacket {
        return {
          type: "spec_handoff",
          workflowId,
          specDir: this.specDir,
          tasksFile: `${this.specDir}/tasks.md`,
          currentPhase: "implementation",
          callback: {
            returnTo: "spec",
            resumePhase: "validation",
            checkpointId,
          },
        };
      }

      emitHandoff(packet: SpecHandoffPacket): boolean {
        return this.emit("handoff", packet);
      }

      awaitResume(): Promise<ImplementationResult> {
        return new Promise<ImplementationResult>((resolve) => {
          this.pendingResolve = resolve;
        });
      }

      receiveResult(result: ImplementationResult): void {
        if (this.pendingResolve) {
          this.pendingResolve(result);
          this.pendingResolve = null;
        }
      }
    },
  };
});

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Creates a mock phase executor.
 */
function createMockExecutor(
  phase: SpecPhase,
  options: { success?: boolean; outputFile?: string; error?: string; delay?: number } = {}
): PhaseExecutor {
  return {
    phase,
    execute: vi.fn().mockImplementation(async () => {
      if (options.delay) {
        await new Promise((resolve) => setTimeout(resolve, options.delay));
      }
      return {
        phase,
        success: options.success ?? true,
        outputFile: options.outputFile ?? `${phase}.md`,
        error: options.error,
        duration: 100,
      } as PhaseResult;
    }),
  };
}

// =============================================================================
// Integration Tests
// =============================================================================

describe("Handoff Integration Tests", () => {
  const defaultConfig: SpecWorkflowEngineConfig = {
    specDir: "/test/spec",
    templateDirs: ["/test/templates"],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ===========================================================================
  // Full Handoff Flow Tests
  // ===========================================================================

  describe("full handoff flow", () => {
    it("should complete entire workflow with handoff to orchestrator and coder", async () => {
      // Setup
      const engine = new SpecWorkflowEngine(defaultConfig);
      const orchestrator = new MockOrchestrator({
        success: true,
        completedTasks: ["T001", "T002", "T003"],
      });

      // Track events
      const events: { type: string; data?: unknown }[] = [];
      let handoffPacket: SpecHandoffPacket | null = null;

      // Register phase executors
      const phases: SpecPhase[] = ["research", "requirements", "design", "tasks", "validation"];
      for (const phase of phases) {
        engine.registerExecutor(createMockExecutor(phase));
      }

      // Listen for workflow events
      engine.on("workflow:start", (state) => {
        events.push({ type: "workflow:start", data: state.id });
      });

      engine.on("phase:start", (phase) => {
        events.push({ type: "phase:start", data: phase });
      });

      engine.on("phase:complete", (result) => {
        events.push({ type: "phase:complete", data: result.phase });
      });

      // handoff:implementation may fire twice due to event forwarding
      // MockOrchestrator.handleHandoff already guards against duplicates
      engine.on("handoff:implementation", (packet) => {
        if (!handoffPacket) {
          handoffPacket = packet;
          events.push({ type: "handoff:implementation", data: packet.workflowId });
        }
        orchestrator.handleHandoff(packet);
      });

      engine.on("workflow:complete", () => {
        events.push({ type: "workflow:complete" });
      });

      // Orchestrator listens for coder completion (use once to avoid duplicate handling)
      orchestrator.once("coder:complete", async ({ result }) => {
        // Callback to spec workflow with coder result
        await engine.resumeAfterImplementation(result);
      });

      // Execute workflow
      const result = await engine.start("Integration Test", "Test full handoff flow");

      // Verify workflow completed successfully
      expect(result.success).toBe(true);

      // Verify handoff occurred
      expect(handoffPacket).not.toBeNull();
      const pkt = handoffPacket!;
      expect(pkt.type).toBe("spec_handoff");
      expect(pkt.callback.returnTo).toBe("spec");
      expect(pkt.callback.resumePhase).toBe("validation");

      // Verify orchestrator received packet and routed to coder
      expect(orchestrator.receivedPackets).toHaveLength(1);
      expect(orchestrator.routedToCoder).toBe(true);

      // Verify all phases executed in order
      const phaseStarts = events
        .filter((e) => e.type === "phase:start")
        .map((e) => e.data as string);
      expect(phaseStarts).toContain("research");
      expect(phaseStarts).toContain("requirements");
      expect(phaseStarts).toContain("design");
      expect(phaseStarts).toContain("tasks");
      expect(phaseStarts).toContain("validation");

      // Verify validation ran after handoff callback
      const validationIndex = events.findIndex(
        (e) => e.type === "phase:start" && e.data === "validation"
      );
      const handoffIndex = events.findIndex((e) => e.type === "handoff:implementation");
      expect(validationIndex).toBeGreaterThan(handoffIndex);
    });

    it("should handle failed implementation from coder", async () => {
      const engine = new SpecWorkflowEngine(defaultConfig);
      const orchestrator = new MockOrchestrator({
        success: false,
        completedTasks: ["T001"],
        failedTasks: ["T002", "T003"],
        error: "Coder failed to implement T002 and T003",
      });

      // Register phase executors (excluding implementation)
      const phases: SpecPhase[] = ["research", "requirements", "design", "tasks", "validation"];
      for (const phase of phases) {
        engine.registerExecutor(createMockExecutor(phase));
      }

      let handoffReceived = false;

      engine.on("handoff:implementation", (packet) => {
        handoffReceived = true;
        orchestrator.handleHandoff(packet);
      });

      orchestrator.once("coder:complete", async ({ result }) => {
        await engine.resumeAfterImplementation(result);
      });

      const result = await engine.start("Failed Implementation Test", "Test failed coder");

      expect(handoffReceived).toBe(true);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Coder failed to implement");
    });

    it("should pass correct checkpoint info in handoff packet", async () => {
      const engine = new SpecWorkflowEngine(defaultConfig);
      const orchestrator = new MockOrchestrator({
        success: true,
        completedTasks: ["T001"],
      });

      const phases: SpecPhase[] = ["research", "requirements", "design", "tasks", "validation"];
      for (const phase of phases) {
        engine.registerExecutor(createMockExecutor(phase));
      }

      let capturedPacket: SpecHandoffPacket | null = null;

      engine.on("handoff:implementation", (packet) => {
        if (!capturedPacket) capturedPacket = packet;
        orchestrator.handleHandoff(packet);
      });

      orchestrator.once("coder:complete", async ({ result }) => {
        await engine.resumeAfterImplementation(result);
      });

      await engine.start("Checkpoint Test", "Verify checkpoint in handoff");

      expect(capturedPacket).not.toBeNull();
      const pkt = capturedPacket!;
      expect(pkt.callback).toEqual({
        returnTo: "spec",
        resumePhase: "validation",
        checkpointId: expect.any(String),
      });
      expect(pkt.specDir).toBe("/test/spec");
      expect(pkt.tasksFile).toBe("/test/spec/tasks.md");
    });
  });

  // ===========================================================================
  // Orchestrator Routing Tests
  // ===========================================================================

  describe("orchestrator routing", () => {
    it("should route handoff to coder and receive callback", async () => {
      const engine = new SpecWorkflowEngine(defaultConfig);

      const coderResult: ImplementationResult = {
        success: true,
        completedTasks: ["T001", "T002"],
      };

      const orchestrator = new MockOrchestrator(coderResult);

      const phases: SpecPhase[] = ["research", "requirements", "design", "tasks", "validation"];
      for (const phase of phases) {
        engine.registerExecutor(createMockExecutor(phase));
      }

      let coderReceivedWork = false;

      engine.on("handoff:implementation", (packet) => {
        orchestrator.handleHandoff(packet);
      });

      orchestrator.once("coder:complete", async ({ result }) => {
        coderReceivedWork = true;
        expect(result).toEqual(coderResult);
        await engine.resumeAfterImplementation(result);
      });

      const result = await engine.start("Routing Test", "Test orchestrator routing");

      expect(coderReceivedWork).toBe(true);
      expect(orchestrator.routedToCoder).toBe(true);
      expect(result.success).toBe(true);
    });

    it("should handle multiple tasks from coder response", async () => {
      const engine = new SpecWorkflowEngine(defaultConfig);

      const coderResult: ImplementationResult = {
        success: true,
        completedTasks: ["T001", "T002", "T003", "T004", "T005"],
      };

      const orchestrator = new MockOrchestrator(coderResult);

      const phases: SpecPhase[] = ["research", "requirements", "design", "tasks", "validation"];
      for (const phase of phases) {
        engine.registerExecutor(createMockExecutor(phase));
      }

      engine.on("handoff:implementation", (packet) => {
        orchestrator.handleHandoff(packet);
      });

      orchestrator.once("coder:complete", async ({ result }) => {
        await engine.resumeAfterImplementation(result);
      });

      const result = await engine.start("Multi-Task Test", "Test multiple task completion");

      expect(result.success).toBe(true);
    });
  });

  // ===========================================================================
  // Validation Phase Tests
  // ===========================================================================

  describe("validation phase after callback", () => {
    it("should run validation phase to completion after successful handoff", async () => {
      const engine = new SpecWorkflowEngine(defaultConfig);
      const orchestrator = new MockOrchestrator({
        success: true,
        completedTasks: ["T001"],
      });

      const validationExecuted = { called: false, context: null as PhaseContext | null };

      const phases: SpecPhase[] = ["research", "requirements", "design", "tasks"];
      for (const phase of phases) {
        engine.registerExecutor(createMockExecutor(phase));
      }

      // Custom validation executor to track execution
      engine.registerExecutor({
        phase: "validation",
        execute: vi.fn().mockImplementation(async (context: PhaseContext) => {
          validationExecuted.called = true;
          validationExecuted.context = context;
          return {
            phase: "validation",
            success: true,
            outputFile: "validation.md",
            duration: 50,
          };
        }),
      });

      let handoffHandled = false;
      engine.on("handoff:implementation", (packet) => {
        if (handoffHandled) return;
        handoffHandled = true;
        orchestrator.handleHandoff(packet);
      });

      orchestrator.once("coder:complete", async ({ result }) => {
        await engine.resumeAfterImplementation(result);
      });

      const result = await engine.start("Validation Test", "Test validation after handoff");

      expect(result.success).toBe(true);
      expect(validationExecuted.called).toBe(true);
      expect(validationExecuted.context?.specDir).toBe("/test/spec");
    });

    it("should not run validation if implementation fails", async () => {
      const engine = new SpecWorkflowEngine(defaultConfig);
      const orchestrator = new MockOrchestrator({
        success: false,
        completedTasks: [],
        error: "All tasks failed",
      });

      const validationCalled = { value: false };

      const phases: SpecPhase[] = ["research", "requirements", "design", "tasks"];
      for (const phase of phases) {
        engine.registerExecutor(createMockExecutor(phase));
      }

      engine.registerExecutor({
        phase: "validation",
        execute: vi.fn().mockImplementation(async () => {
          validationCalled.value = true;
          return { phase: "validation", success: true, duration: 50 };
        }),
      });

      engine.on("handoff:implementation", (packet) => {
        orchestrator.handleHandoff(packet);
      });

      orchestrator.once("coder:complete", async ({ result }) => {
        await engine.resumeAfterImplementation(result);
      });

      const result = await engine.start("No Validation Test", "Test validation skip on failure");

      expect(result.success).toBe(false);
      expect(validationCalled.value).toBe(false);
    });
  });

  // ===========================================================================
  // Event Sequencing Tests
  // ===========================================================================

  describe("event sequencing", () => {
    it("should emit events in correct order throughout handoff flow", async () => {
      const engine = new SpecWorkflowEngine(defaultConfig);
      const orchestrator = new MockOrchestrator({
        success: true,
        completedTasks: ["T001"],
      });

      const eventSequence: string[] = [];

      const phases: SpecPhase[] = ["research", "requirements", "design", "tasks", "validation"];
      for (const phase of phases) {
        engine.registerExecutor(createMockExecutor(phase));
      }

      engine.on("workflow:start", () => eventSequence.push("workflow:start"));
      engine.on("phase:start", (phase) => eventSequence.push(`phase:start:${phase}`));
      engine.on("phase:complete", (result) => eventSequence.push(`phase:complete:${result.phase}`));
      engine.on("checkpoint:saved", () => eventSequence.push("checkpoint:saved"));
      engine.on("workflow:complete", () => eventSequence.push("workflow:complete"));

      let handoffRecorded = false;
      engine.on("handoff:implementation", (packet) => {
        if (!handoffRecorded) {
          handoffRecorded = true;
          eventSequence.push("handoff:implementation");
        }
        orchestrator.handleHandoff(packet);
      });

      orchestrator.once("coder:complete", async ({ result }) => {
        await engine.resumeAfterImplementation(result);
      });

      await engine.start("Event Sequence Test", "Test event order");

      // Verify critical ordering
      const workflowStartIdx = eventSequence.indexOf("workflow:start");
      const handoffIdx = eventSequence.indexOf("handoff:implementation");
      const validationStartIdx = eventSequence.indexOf("phase:start:validation");
      const workflowCompleteIdx = eventSequence.indexOf("workflow:complete");

      expect(workflowStartIdx).toBe(0);
      expect(handoffIdx).toBeGreaterThan(workflowStartIdx);
      expect(validationStartIdx).toBeGreaterThan(handoffIdx);
      expect(workflowCompleteIdx).toBeGreaterThan(validationStartIdx);

      // Verify phase order before handoff
      const tasksCompleteIdx = eventSequence.indexOf("phase:complete:tasks");
      expect(tasksCompleteIdx).toBeLessThan(handoffIdx);
    });

    it("should emit checkpoint before handoff", async () => {
      const engine = new SpecWorkflowEngine(defaultConfig);
      const orchestrator = new MockOrchestrator({
        success: true,
        completedTasks: ["T001"],
      });

      const eventSequence: string[] = [];

      const phases: SpecPhase[] = ["research", "requirements", "design", "tasks", "validation"];
      for (const phase of phases) {
        engine.registerExecutor(createMockExecutor(phase));
      }

      engine.on("checkpoint:saved", () => eventSequence.push("checkpoint:saved"));

      let handoffRecorded = false;
      engine.on("handoff:implementation", (packet) => {
        if (!handoffRecorded) {
          handoffRecorded = true;
          eventSequence.push("handoff:implementation");
        }
        orchestrator.handleHandoff(packet);
      });

      orchestrator.once("coder:complete", async ({ result }) => {
        await engine.resumeAfterImplementation(result);
      });

      await engine.start("Checkpoint Order Test", "Test checkpoint before handoff");

      // Find the checkpoint right before handoff (there may be multiple checkpoints)
      const handoffIdx = eventSequence.indexOf("handoff:implementation");
      const checkpointBeforeHandoff = eventSequence
        .slice(0, handoffIdx)
        .filter((e) => e === "checkpoint:saved");

      expect(checkpointBeforeHandoff.length).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe("edge cases", () => {
    it("should handle empty completed tasks list", async () => {
      const engine = new SpecWorkflowEngine(defaultConfig);
      const orchestrator = new MockOrchestrator({
        success: true,
        completedTasks: [],
      });

      const phases: SpecPhase[] = ["research", "requirements", "design", "tasks", "validation"];
      for (const phase of phases) {
        engine.registerExecutor(createMockExecutor(phase));
      }

      let handoffHandled = false;
      engine.on("handoff:implementation", (packet) => {
        if (handoffHandled) return;
        handoffHandled = true;
        orchestrator.handleHandoff(packet);
      });

      orchestrator.on("coder:complete", async ({ result }) => {
        await engine.resumeAfterImplementation(result);
      });

      const result = await engine.start("Empty Tasks Test", "Test empty completed tasks");

      // Empty but success should still complete workflow
      expect(result.success).toBe(true);
    });

    it("should handle partial task completion", async () => {
      const engine = new SpecWorkflowEngine(defaultConfig);
      const orchestrator = new MockOrchestrator({
        success: true,
        completedTasks: ["T001", "T003"],
        failedTasks: ["T002"],
      });

      const phases: SpecPhase[] = ["research", "requirements", "design", "tasks", "validation"];
      for (const phase of phases) {
        engine.registerExecutor(createMockExecutor(phase));
      }

      let handoffHandled = false;
      engine.on("handoff:implementation", (packet) => {
        if (handoffHandled) return;
        handoffHandled = true;
        orchestrator.handleHandoff(packet);
      });

      orchestrator.on("coder:complete", async ({ result }) => {
        await engine.resumeAfterImplementation(result);
      });

      const result = await engine.start("Partial Completion Test", "Test partial task completion");

      // Success=true means continue even with some failures
      expect(result.success).toBe(true);
    });

    it("should work with skip phases config", async () => {
      const configWithSkip: SpecWorkflowEngineConfig = {
        ...defaultConfig,
        skipPhases: ["implementation"],
      };
      const engine = new SpecWorkflowEngine(configWithSkip);

      const phases: SpecPhase[] = ["research", "requirements", "design", "tasks", "validation"];
      for (const phase of phases) {
        engine.registerExecutor(createMockExecutor(phase));
      }

      let handoffEmitted = false;
      engine.on("handoff:implementation", () => {
        handoffEmitted = true;
      });

      const result = await engine.start("Skip Phase Test", "Test with implementation skipped");

      expect(result.success).toBe(true);
      // When implementation is skipped, no handoff should occur
      expect(handoffEmitted).toBe(false);
    });
  });
});
