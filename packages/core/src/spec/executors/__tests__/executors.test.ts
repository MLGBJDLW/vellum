/**
 * Phase Executor Tests
 *
 * Tests for the 5 phase executors (research, requirements, design, tasks, validation).
 *
 * @module @vellum/core/spec/executors/__tests__/executors
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";

import type { SpecWorkflowState } from "../../types.js";
import type { PhaseContext, PhaseExecutor } from "../base.js";
import { createPhaseExecutor, createPhaseExecutorWithHooks, isPhaseExecutor } from "../base.js";
import { DesignExecutor } from "../design.js";
import { RequirementsExecutor } from "../requirements.js";
import type { AgentSpawner, AgentSpawnResult } from "../research.js";
import { ResearchExecutor } from "../research.js";
import { TasksExecutor } from "../tasks.js";
import { ValidationExecutor } from "../validation.js";

// =============================================================================
// Test Fixtures
// =============================================================================

let tempDir: string;
let specDir: string;

const createMockWorkflowState = (): SpecWorkflowState => ({
  id: "test-workflow-id",
  name: "Test Workflow",
  description: "A test spec workflow",
  specDir: specDir,
  currentPhase: "research",
  phases: {
    research: { phase: "research", status: "pending" },
    requirements: { phase: "requirements", status: "pending" },
    design: { phase: "design", status: "pending" },
    tasks: { phase: "tasks", status: "pending" },
    implementation: { phase: "implementation", status: "pending" },
    validation: { phase: "validation", status: "pending" },
  },
  createdAt: new Date(),
  updatedAt: new Date(),
});

const createMockContext = (overrides?: Partial<PhaseContext>): PhaseContext => ({
  workflowState: createMockWorkflowState(),
  specDir: specDir,
  ...overrides,
});

const createMockSpawner = (result: AgentSpawnResult): AgentSpawner & Mock => {
  return vi.fn().mockResolvedValue(result);
};

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "vellum-executor-test-"));
  specDir = path.join(tempDir, "spec");
  await fs.mkdir(specDir, { recursive: true });
});

afterEach(async () => {
  try {
    await fs.rm(tempDir, { recursive: true });
  } catch {
    // Ignore cleanup errors
  }
});

// =============================================================================
// PhaseExecutor Interface Compliance Tests
// =============================================================================

describe("PhaseExecutor Interface Compliance", () => {
  describe("isPhaseExecutor", () => {
    it("should return true for valid executors", () => {
      const mockSpawner = createMockSpawner({ success: true, output: "test" });

      expect(isPhaseExecutor(new ResearchExecutor(mockSpawner))).toBe(true);
      expect(isPhaseExecutor(new RequirementsExecutor(mockSpawner))).toBe(true);
      expect(isPhaseExecutor(new DesignExecutor(mockSpawner))).toBe(true);
      expect(isPhaseExecutor(new TasksExecutor(mockSpawner))).toBe(true);
      expect(isPhaseExecutor(new ValidationExecutor(mockSpawner))).toBe(true);
    });

    it("should return false for invalid objects", () => {
      expect(isPhaseExecutor(null)).toBe(false);
      expect(isPhaseExecutor(undefined)).toBe(false);
      expect(isPhaseExecutor({})).toBe(false);
      expect(isPhaseExecutor({ phase: "research" })).toBe(false);
      expect(isPhaseExecutor({ execute: () => {} })).toBe(false);
    });
  });

  describe("createPhaseExecutor", () => {
    it("should create a valid executor from a function", async () => {
      const executor = createPhaseExecutor("research", async () => ({
        phase: "research",
        success: true,
        duration: 100,
      }));

      expect(isPhaseExecutor(executor)).toBe(true);
      expect(executor.phase).toBe("research");

      const result = await executor.execute(createMockContext());
      expect(result.success).toBe(true);
      expect(result.phase).toBe("research");
    });
  });

  describe("createPhaseExecutorWithHooks", () => {
    it("should create an executor with hooks", async () => {
      const beforeHook = vi.fn();
      const afterHook = vi.fn();

      const executor = createPhaseExecutorWithHooks("design", {
        execute: async () => ({
          phase: "design",
          success: true,
          duration: 100,
        }),
        beforeExecute: beforeHook,
        afterExecute: afterHook,
      });

      expect(isPhaseExecutor(executor)).toBe(true);
      expect(executor.beforeExecute).toBeDefined();
      expect(executor.afterExecute).toBeDefined();
    });
  });

  describe("All Executors have correct phase property", () => {
    it("should have correct phase values", () => {
      const mockSpawner = createMockSpawner({ success: true, output: "test" });

      const research = new ResearchExecutor(mockSpawner);
      const requirements = new RequirementsExecutor(mockSpawner);
      const design = new DesignExecutor(mockSpawner);
      const tasks = new TasksExecutor(mockSpawner);
      const validation = new ValidationExecutor(mockSpawner);

      expect(research.phase).toBe("research");
      expect(requirements.phase).toBe("requirements");
      expect(design.phase).toBe("design");
      expect(tasks.phase).toBe("tasks");
      expect(validation.phase).toBe("validation");
    });
  });
});

// =============================================================================
// ResearchExecutor Tests
// =============================================================================

describe("ResearchExecutor", () => {
  it("should execute successfully and write output file", async () => {
    const mockOutput = "# Research Results\n\nThis is the research output.";
    const mockSpawner = createMockSpawner({ success: true, output: mockOutput });
    const executor = new ResearchExecutor(mockSpawner);
    const context = createMockContext();

    const result = await executor.execute(context);

    expect(result.success).toBe(true);
    expect(result.phase).toBe("research");
    expect(result.outputFile).toBe(path.join(specDir, "research.md"));
    expect(result.duration).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeUndefined();

    // Verify file was written
    const content = await fs.readFile(result.outputFile!, "utf-8");
    expect(content).toBe(mockOutput);
  });

  it("should call agent spawner with correct agent name", async () => {
    const mockSpawner = createMockSpawner({ success: true, output: "test" });
    const executor = new ResearchExecutor(mockSpawner);

    await executor.execute(createMockContext());

    expect(mockSpawner).toHaveBeenCalledTimes(1);
    expect(mockSpawner).toHaveBeenCalledWith("spec-researcher", expect.any(String));
  });

  it("should return error when agent fails", async () => {
    const mockSpawner = createMockSpawner({
      success: false,
      error: "Agent crashed",
    });
    const executor = new ResearchExecutor(mockSpawner);

    const result = await executor.execute(createMockContext());

    expect(result.success).toBe(false);
    expect(result.error).toBe("Agent crashed");
    expect(result.outputFile).toBeUndefined();
  });

  it("should return error when agent returns no output", async () => {
    const mockSpawner = createMockSpawner({ success: true });
    const executor = new ResearchExecutor(mockSpawner);

    const result = await executor.execute(createMockContext());

    expect(result.success).toBe(false);
    expect(result.error).toBe("Research agent returned no output");
  });
});

// =============================================================================
// RequirementsExecutor Tests
// =============================================================================

describe("RequirementsExecutor", () => {
  it("should execute successfully and write output file", async () => {
    const mockOutput = "# Requirements\n\nREQ-001: The system shall...";
    const mockSpawner = createMockSpawner({ success: true, output: mockOutput });
    const executor = new RequirementsExecutor(mockSpawner);
    const context = createMockContext();

    const result = await executor.execute(context);

    expect(result.success).toBe(true);
    expect(result.phase).toBe("requirements");
    expect(result.outputFile).toBe(path.join(specDir, "requirements.md"));

    const content = await fs.readFile(result.outputFile!, "utf-8");
    expect(content).toBe(mockOutput);
  });

  it("should call agent spawner with correct agent name", async () => {
    const mockSpawner = createMockSpawner({ success: true, output: "test" });
    const executor = new RequirementsExecutor(mockSpawner);

    await executor.execute(createMockContext());

    expect(mockSpawner).toHaveBeenCalledWith("spec-requirements", expect.any(String));
  });

  it("should use previousPhaseOutput when available", async () => {
    const mockSpawner = createMockSpawner({ success: true, output: "requirements" });
    const executor = new RequirementsExecutor(mockSpawner);
    const context = createMockContext({
      previousPhaseOutput: "Previous research content",
    });

    await executor.execute(context);

    // Verify the spawner was called with prompt containing previous output
    const call = mockSpawner.mock.calls[0]!;
    expect(call[1]).toContain("Previous research content");
  });

  it("should have beforeExecute hook", async () => {
    const mockSpawner = createMockSpawner({ success: true, output: "test" });
    const executor = new RequirementsExecutor(mockSpawner);

    expect(executor.beforeExecute).toBeDefined();

    // Should not throw
    await executor.beforeExecute?.(createMockContext());
  });
});

// =============================================================================
// DesignExecutor Tests
// =============================================================================

describe("DesignExecutor", () => {
  it("should execute successfully and write output file", async () => {
    const mockOutput = "# Design\n\n## Architecture\n\nComponent diagram...";
    const mockSpawner = createMockSpawner({ success: true, output: mockOutput });
    const executor = new DesignExecutor(mockSpawner);
    const context = createMockContext();

    const result = await executor.execute(context);

    expect(result.success).toBe(true);
    expect(result.phase).toBe("design");
    expect(result.outputFile).toBe(path.join(specDir, "design.md"));
  });

  it("should call agent spawner with correct agent name", async () => {
    const mockSpawner = createMockSpawner({ success: true, output: "design content" });
    const executor = new DesignExecutor(mockSpawner);

    await executor.execute(createMockContext());

    expect(mockSpawner).toHaveBeenCalledWith("spec-architect", expect.any(String));
  });

  it("should read requirements from file when previousPhaseOutput not available", async () => {
    // Write requirements file first
    await fs.writeFile(path.join(specDir, "requirements.md"), "# Requirements from file");

    const mockSpawner = createMockSpawner({ success: true, output: "design" });
    const executor = new DesignExecutor(mockSpawner);

    await executor.execute(createMockContext());

    const call = mockSpawner.mock.calls[0]!;
    expect(call[1]).toContain("Requirements from file");
  });
});

// =============================================================================
// TasksExecutor Tests
// =============================================================================

describe("TasksExecutor", () => {
  it("should execute successfully and write output file", async () => {
    const mockOutput = "# Tasks\n\n## T001 - Setup project\n\n...";
    const mockSpawner = createMockSpawner({ success: true, output: mockOutput });
    const executor = new TasksExecutor(mockSpawner);
    const context = createMockContext();

    const result = await executor.execute(context);

    expect(result.success).toBe(true);
    expect(result.phase).toBe("tasks");
    expect(result.outputFile).toBe(path.join(specDir, "tasks.md"));

    const content = await fs.readFile(result.outputFile!, "utf-8");
    expect(content).toBe(mockOutput);
  });

  it("should call agent spawner with correct agent name", async () => {
    const mockSpawner = createMockSpawner({ success: true, output: "tasks content" });
    const executor = new TasksExecutor(mockSpawner);

    await executor.execute(createMockContext());

    expect(mockSpawner).toHaveBeenCalledWith("spec-tasks", expect.any(String));
  });

  it("should include design context in prompt", async () => {
    // Write design file first
    await fs.writeFile(path.join(specDir, "design.md"), "# Design content here");

    const mockSpawner = createMockSpawner({ success: true, output: "tasks" });
    const executor = new TasksExecutor(mockSpawner);

    await executor.execute(createMockContext());

    const call = mockSpawner.mock.calls[0]!;
    expect(call[1]).toContain("Design content here");
  });
});

// =============================================================================
// ValidationExecutor Tests
// =============================================================================

describe("ValidationExecutor", () => {
  it("should execute successfully and write output file", async () => {
    const mockOutput = "# Validation Report\n\n## Summary\n\nAll checks passed.";
    const mockSpawner = createMockSpawner({ success: true, output: mockOutput });
    const executor = new ValidationExecutor(mockSpawner);
    const context = createMockContext();

    const result = await executor.execute(context);

    expect(result.success).toBe(true);
    expect(result.phase).toBe("validation");
    expect(result.outputFile).toBe(path.join(specDir, "validation-report.md"));

    const content = await fs.readFile(result.outputFile!, "utf-8");
    expect(content).toBe(mockOutput);
  });

  it("should call agent spawner with correct agent name", async () => {
    const mockSpawner = createMockSpawner({ success: true, output: "validation" });
    const executor = new ValidationExecutor(mockSpawner);

    await executor.execute(createMockContext());

    expect(mockSpawner).toHaveBeenCalledWith("spec-validator", expect.any(String));
  });

  it("should accept custom command executor", async () => {
    const mockSpawner = createMockSpawner({ success: true, output: "validation" });
    const mockCommandExecutor = vi.fn().mockResolvedValue({
      command: "pnpm test",
      stdout: "All tests passed",
      stderr: "",
      exitCode: 0,
    });

    const executor = new ValidationExecutor(mockSpawner, mockCommandExecutor);

    expect(executor).toBeInstanceOf(ValidationExecutor);
  });

  it("should return error when agent fails", async () => {
    const mockSpawner = createMockSpawner({
      success: false,
      error: "Validation failed",
    });
    const executor = new ValidationExecutor(mockSpawner);

    const result = await executor.execute(createMockContext());

    expect(result.success).toBe(false);
    expect(result.error).toBe("Validation failed");
  });

  it("should gather artifacts from spec directory", async () => {
    // Create some spec files
    await fs.writeFile(path.join(specDir, "research.md"), "# Research");
    await fs.writeFile(path.join(specDir, "requirements.md"), "# Requirements");

    const mockSpawner = createMockSpawner({ success: true, output: "validation" });
    const executor = new ValidationExecutor(mockSpawner);

    await executor.execute(createMockContext());

    // Verify spawner was called (artifacts would be in the prompt)
    expect(mockSpawner).toHaveBeenCalled();
    const call = mockSpawner.mock.calls[0]!;
    expect(call[1]).toContain("research.md");
  });
});

// =============================================================================
// Output File Path Tests
// =============================================================================

describe("Output File Paths", () => {
  const executors: Array<{ name: string; executor: PhaseExecutor; expectedFile: string }> = [];

  beforeEach(() => {
    const mockSpawner = createMockSpawner({ success: true, output: "test output" });

    executors.length = 0;
    executors.push(
      {
        name: "ResearchExecutor",
        executor: new ResearchExecutor(mockSpawner),
        expectedFile: "research.md",
      },
      {
        name: "RequirementsExecutor",
        executor: new RequirementsExecutor(mockSpawner),
        expectedFile: "requirements.md",
      },
      {
        name: "DesignExecutor",
        executor: new DesignExecutor(mockSpawner),
        expectedFile: "design.md",
      },
      { name: "TasksExecutor", executor: new TasksExecutor(mockSpawner), expectedFile: "tasks.md" },
      {
        name: "ValidationExecutor",
        executor: new ValidationExecutor(mockSpawner),
        expectedFile: "validation-report.md",
      }
    );
  });

  it("should write to correct output files", async () => {
    for (const { name, executor, expectedFile } of executors) {
      const context = createMockContext();
      const result = await executor.execute(context);

      expect(result.success, `${name} should succeed`).toBe(true);
      expect(result.outputFile, `${name} should have correct output path`).toBe(
        path.join(specDir, expectedFile)
      );

      // Verify file exists
      const stats = await fs.stat(result.outputFile!);
      expect(stats.isFile(), `${name} should create a file`).toBe(true);
    }
  });
});

// =============================================================================
// Error Handling Tests
// =============================================================================

describe("Error Handling", () => {
  it("should handle agent spawn exceptions gracefully", async () => {
    const mockSpawner = vi.fn().mockRejectedValue(new Error("Network error"));
    const executor = new ResearchExecutor(mockSpawner);

    const result = await executor.execute(createMockContext());

    expect(result.success).toBe(false);
    expect(result.error).toBe("Network error");
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it("should handle file write errors gracefully", async () => {
    // Create a read-only directory scenario by making specDir a file
    const blockingFile = path.join(tempDir, "blocking-file");
    await fs.writeFile(blockingFile, "I am a file, not a directory");

    const mockSpawner = createMockSpawner({ success: true, output: "test" });
    const executor = new ResearchExecutor(mockSpawner);

    // Use the file path as specDir - writing to file/research.md should fail
    const context = createMockContext({
      specDir: blockingFile,
    });

    const result = await executor.execute(context);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("should include duration even on failure", async () => {
    const mockSpawner = createMockSpawner({
      success: false,
      error: "Failed",
    });
    const executor = new RequirementsExecutor(mockSpawner);

    const result = await executor.execute(createMockContext());

    expect(result.success).toBe(false);
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });
});
