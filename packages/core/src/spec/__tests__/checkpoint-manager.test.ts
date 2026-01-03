// ============================================
// Checkpoint Manager Unit Tests
// ============================================

import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHECKPOINT_DIR,
  type Checkpoint,
  CheckpointManager,
  type CheckpointReason,
  DEFAULT_KEEP_COUNT,
} from "../checkpoint-manager.js";
import type { SpecWorkflowState } from "../types.js";

// Mock the filesystem
vi.mock("node:fs/promises");

const mockMkdir = vi.mocked(mkdir);
const mockReaddir = vi.mocked(readdir) as unknown as ReturnType<
  typeof vi.fn<() => Promise<string[]>>
>;
const mockReadFile = vi.mocked(readFile);
const mockRm = vi.mocked(rm);
const mockWriteFile = vi.mocked(writeFile);

describe("CheckpointManager", () => {
  const specDir = "/test/spec";
  const checkpointPath = join(specDir, CHECKPOINT_DIR);
  let manager: CheckpointManager;

  // Sample workflow state for testing
  const createTestState = (phase: string = "research"): SpecWorkflowState => ({
    id: "test-workflow-id",
    name: "test-workflow",
    description: "A test workflow",
    specDir,
    currentPhase: phase as SpecWorkflowState["currentPhase"],
    phases: {
      research: { phase: "research", status: "pending" },
      requirements: { phase: "requirements", status: "pending" },
      design: { phase: "design", status: "pending" },
      tasks: { phase: "tasks", status: "pending" },
      implementation: { phase: "implementation", status: "pending" },
      validation: { phase: "validation", status: "pending" },
    },
    createdAt: new Date("2025-01-01T00:00:00Z"),
    updatedAt: new Date("2025-01-01T00:00:00Z"),
  });

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new CheckpointManager(specDir);

    // Default mock implementations
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    mockRm.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ===========================================================================
  // Save Checkpoint Tests
  // ===========================================================================

  describe("save", () => {
    it("should create checkpoint directory if not exists", async () => {
      mockReaddir.mockResolvedValue([]);

      await manager.save(createTestState(), "phase_complete");

      expect(mockMkdir).toHaveBeenCalledWith(checkpointPath, { recursive: true });
    });

    it("should save checkpoint with correct structure", async () => {
      const state = createTestState("research");

      await manager.save(state, "phase_complete");

      expect(mockWriteFile).toHaveBeenCalledTimes(1);
      const [filepath, content] = mockWriteFile.mock.calls[0] as [string, string, string];

      expect(filepath).toMatch(/checkpoint-research-.*\.json$/);
      const parsed = JSON.parse(content);
      expect(parsed.workflowState).toMatchObject({
        id: "test-workflow-id",
        currentPhase: "research",
      });
      expect(parsed.reason).toBe("phase_complete");
      expect(parsed.id).toBeDefined();
    });

    it("should save checkpoint with metadata", async () => {
      const state = createTestState();
      const metadata = { attemptNumber: 2, triggeredBy: "user" };

      await manager.save(state, "user_pause", metadata);

      const [, content] = mockWriteFile.mock.calls[0] as [string, string, string];
      const parsed = JSON.parse(content);
      expect(parsed.metadata).toEqual(metadata);
    });

    it("should return created checkpoint", async () => {
      const state = createTestState();
      const checkpoint = await manager.save(state, "phase_complete");

      expect(checkpoint.id).toBeDefined();
      expect(checkpoint.workflowState).toEqual(state);
      expect(checkpoint.reason).toBe("phase_complete");
      expect(checkpoint.createdAt).toBeInstanceOf(Date);
    });

    it("should support all checkpoint reasons", async () => {
      const reasons: CheckpointReason[] = [
        "phase_complete",
        "user_pause",
        "error_recovery",
        "handoff",
      ];

      for (const reason of reasons) {
        const checkpoint = await manager.save(createTestState(), reason);
        expect(checkpoint.reason).toBe(reason);
      }
    });

    it("should generate unique checkpoint IDs", async () => {
      const state = createTestState();

      const checkpoint1 = await manager.save(state, "phase_complete");
      const checkpoint2 = await manager.save(state, "phase_complete");

      expect(checkpoint1.id).not.toBe(checkpoint2.id);
    });
  });

  // ===========================================================================
  // Load Checkpoint Tests
  // ===========================================================================

  describe("loadLatest", () => {
    it("should return null when no checkpoints exist", async () => {
      mockReaddir.mockResolvedValue([]);

      const result = await manager.loadLatest();
      expect(result).toBeNull();
    });

    it("should return null when checkpoint directory does not exist", async () => {
      const error = new Error("ENOENT") as NodeJS.ErrnoException;
      error.code = "ENOENT";
      mockReaddir.mockRejectedValue(error);

      const result = await manager.loadLatest();
      expect(result).toBeNull();
    });

    it("should return most recent checkpoint", async () => {
      const olderCheckpoint: Checkpoint = {
        id: "old-id",
        workflowState: createTestState("research"),
        reason: "phase_complete",
        createdAt: new Date("2025-01-01T00:00:00Z"),
      };

      const newerCheckpoint: Checkpoint = {
        id: "new-id",
        workflowState: createTestState("requirements"),
        reason: "phase_complete",
        createdAt: new Date("2025-01-02T00:00:00Z"),
      };

      mockReaddir.mockResolvedValue([
        "checkpoint-research-2025-01-01.json",
        "checkpoint-requirements-2025-01-02.json",
      ]);

      mockReadFile.mockImplementation(async (filepath) => {
        if (String(filepath).includes("research")) {
          return JSON.stringify(olderCheckpoint);
        }
        return JSON.stringify(newerCheckpoint);
      });

      const result = await manager.loadLatest();

      expect(result?.id).toBe("new-id");
      expect(result?.workflowState.currentPhase).toBe("requirements");
    });

    it("should skip non-checkpoint files", async () => {
      const checkpoint: Checkpoint = {
        id: "valid-id",
        workflowState: createTestState(),
        reason: "phase_complete",
        createdAt: new Date(),
      };

      mockReaddir.mockResolvedValue([
        "README.md",
        "checkpoint-research-2025-01-01.json",
        "other-file.txt",
      ]);

      mockReadFile.mockResolvedValue(JSON.stringify(checkpoint));

      const result = await manager.loadLatest();
      expect(result?.id).toBe("valid-id");
    });
  });

  describe("loadFromPhase", () => {
    it("should return null when no checkpoints for phase", async () => {
      const checkpoint: Checkpoint = {
        id: "design-id",
        workflowState: createTestState("design"),
        reason: "phase_complete",
        createdAt: new Date(),
      };

      mockReaddir.mockResolvedValue(["checkpoint-design-2025-01-01.json"]);
      mockReadFile.mockResolvedValue(JSON.stringify(checkpoint));

      const result = await manager.loadFromPhase("research");
      expect(result).toBeNull();
    });

    it("should return checkpoint for specified phase", async () => {
      const researchCheckpoint: Checkpoint = {
        id: "research-id",
        workflowState: createTestState("research"),
        reason: "phase_complete",
        createdAt: new Date("2025-01-01"),
      };

      const designCheckpoint: Checkpoint = {
        id: "design-id",
        workflowState: createTestState("design"),
        reason: "phase_complete",
        createdAt: new Date("2025-01-02"),
      };

      mockReaddir.mockResolvedValue([
        "checkpoint-research-2025-01-01.json",
        "checkpoint-design-2025-01-02.json",
      ]);

      mockReadFile.mockImplementation(async (filepath) => {
        if (String(filepath).includes("research")) {
          return JSON.stringify(researchCheckpoint);
        }
        return JSON.stringify(designCheckpoint);
      });

      const result = await manager.loadFromPhase("research");
      expect(result?.id).toBe("research-id");
    });

    it("should return most recent checkpoint when multiple exist for phase", async () => {
      const older: Checkpoint = {
        id: "old-research",
        workflowState: createTestState("research"),
        reason: "phase_complete",
        createdAt: new Date("2025-01-01"),
      };

      const newer: Checkpoint = {
        id: "new-research",
        workflowState: createTestState("research"),
        reason: "error_recovery",
        createdAt: new Date("2025-01-02"),
      };

      mockReaddir.mockResolvedValue([
        "checkpoint-research-2025-01-01.json",
        "checkpoint-research-2025-01-02.json",
      ]);

      let callCount = 0;
      mockReadFile.mockImplementation(async () => {
        callCount++;
        return JSON.stringify(callCount === 1 ? older : newer);
      });

      const result = await manager.loadFromPhase("research");
      expect(result?.id).toBe("new-research");
    });
  });

  describe("list", () => {
    it("should return empty array when no checkpoints", async () => {
      mockReaddir.mockResolvedValue([]);

      const result = await manager.list();
      expect(result).toEqual([]);
    });

    it("should return all valid checkpoints", async () => {
      const checkpoint1: Checkpoint = {
        id: "id-1",
        workflowState: createTestState("research"),
        reason: "phase_complete",
        createdAt: new Date(),
      };

      const checkpoint2: Checkpoint = {
        id: "id-2",
        workflowState: createTestState("design"),
        reason: "user_pause",
        createdAt: new Date(),
      };

      mockReaddir.mockResolvedValue([
        "checkpoint-research-2025-01-01.json",
        "checkpoint-design-2025-01-02.json",
      ]);

      let callCount = 0;
      mockReadFile.mockImplementation(async () => {
        callCount++;
        return JSON.stringify(callCount === 1 ? checkpoint1 : checkpoint2);
      });

      const result = await manager.list();
      expect(result).toHaveLength(2);
      expect(result.map((c) => c.id)).toContain("id-1");
      expect(result.map((c) => c.id)).toContain("id-2");
    });
  });

  // ===========================================================================
  // Prune Checkpoints Tests
  // ===========================================================================

  describe("prune", () => {
    it("should not delete when fewer checkpoints than keepCount", async () => {
      mockReaddir.mockResolvedValue([
        "checkpoint-research-2025-01-01.json",
        "checkpoint-requirements-2025-01-02.json",
      ]);

      const checkpoint: Checkpoint = {
        id: "some-id",
        workflowState: createTestState(),
        reason: "phase_complete",
        createdAt: new Date(),
      };
      mockReadFile.mockResolvedValue(JSON.stringify(checkpoint));

      const deleted = await manager.prune(5);

      expect(deleted).toBe(0);
      expect(mockRm).not.toHaveBeenCalled();
    });

    it("should delete old checkpoints keeping newest", async () => {
      const checkpoints: Checkpoint[] = [
        {
          id: "id-1",
          workflowState: createTestState(),
          reason: "phase_complete",
          createdAt: new Date("2025-01-01"),
        },
        {
          id: "id-2",
          workflowState: createTestState(),
          reason: "phase_complete",
          createdAt: new Date("2025-01-02"),
        },
        {
          id: "id-3",
          workflowState: createTestState(),
          reason: "phase_complete",
          createdAt: new Date("2025-01-03"),
        },
      ];

      mockReaddir.mockResolvedValue([
        "checkpoint-research-2025-01-01.json",
        "checkpoint-research-2025-01-02.json",
        "checkpoint-research-2025-01-03.json",
      ]);

      let listCallCount = 0;
      mockReadFile.mockImplementation(async (filepath) => {
        // For list() call
        if (listCallCount < 3) {
          return JSON.stringify(checkpoints[listCallCount++]);
        }
        // For findCheckpointFile calls
        const path = String(filepath);
        if (path.includes("2025-01-01")) return JSON.stringify({ id: "id-1" });
        if (path.includes("2025-01-02")) return JSON.stringify({ id: "id-2" });
        return JSON.stringify({ id: "id-3" });
      });

      const deleted = await manager.prune(2);

      // Should delete the oldest one (id-1)
      expect(deleted).toBe(1);
      expect(mockRm).toHaveBeenCalledTimes(1);
    });

    it("should use DEFAULT_KEEP_COUNT when not specified", async () => {
      expect(DEFAULT_KEEP_COUNT).toBe(5);

      // Create 6 checkpoints (one more than default)
      const checkpoints: Checkpoint[] = Array.from({ length: 6 }, (_, i) => ({
        id: `id-${i}`,
        workflowState: createTestState(),
        reason: "phase_complete" as CheckpointReason,
        createdAt: new Date(`2025-01-0${i + 1}`),
      }));

      mockReaddir.mockResolvedValue(
        checkpoints.map((_, i) => `checkpoint-research-2025-01-0${i + 1}.json`)
      );

      let idx = 0;
      mockReadFile.mockImplementation(async () => JSON.stringify(checkpoints[idx++ % 6]));

      const deleted = await manager.prune();

      expect(deleted).toBe(1); // 6 - 5 = 1
    });
  });

  // ===========================================================================
  // Delete Checkpoint Tests
  // ===========================================================================

  describe("delete", () => {
    it("should delete checkpoint by ID", async () => {
      const checkpoint: Checkpoint = {
        id: "target-id",
        workflowState: createTestState(),
        reason: "phase_complete",
        createdAt: new Date(),
      };

      mockReaddir.mockResolvedValue(["checkpoint-research-2025-01-01.json"]);
      mockReadFile.mockResolvedValue(JSON.stringify(checkpoint));

      const result = await manager.delete("target-id");

      expect(result).toBe(true);
      expect(mockRm).toHaveBeenCalledWith(
        expect.stringContaining("checkpoint-research-2025-01-01.json")
      );
    });

    it("should return false when checkpoint not found", async () => {
      mockReaddir.mockResolvedValue([]);

      const result = await manager.delete("nonexistent-id");

      expect(result).toBe(false);
      expect(mockRm).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Corrupted Checkpoint Handling
  // ===========================================================================

  describe("corrupted checkpoint handling", () => {
    it("should skip corrupted checkpoint files in list", async () => {
      const validCheckpoint: Checkpoint = {
        id: "valid-id",
        workflowState: createTestState(),
        reason: "phase_complete",
        createdAt: new Date(),
      };

      mockReaddir.mockResolvedValue([
        "checkpoint-research-corrupted.json",
        "checkpoint-design-valid.json",
      ]);

      mockReadFile.mockImplementation(async (filepath) => {
        if (String(filepath).includes("corrupted")) {
          return "{ invalid json";
        }
        return JSON.stringify(validCheckpoint);
      });

      const result = await manager.list();

      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe("valid-id");
    });

    it("should skip checkpoints with invalid schema", async () => {
      const validCheckpoint: Checkpoint = {
        id: "valid-id",
        workflowState: createTestState(),
        reason: "phase_complete",
        createdAt: new Date(),
      };

      mockReaddir.mockResolvedValue([
        "checkpoint-research-invalid.json",
        "checkpoint-design-valid.json",
      ]);

      mockReadFile.mockImplementation(async (filepath) => {
        if (String(filepath).includes("invalid")) {
          // Missing required fields
          return JSON.stringify({ id: "invalid", foo: "bar" });
        }
        return JSON.stringify(validCheckpoint);
      });

      const result = await manager.list();

      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe("valid-id");
    });

    it("should handle read errors gracefully", async () => {
      const validCheckpoint: Checkpoint = {
        id: "valid-id",
        workflowState: createTestState(),
        reason: "phase_complete",
        createdAt: new Date(),
      };

      mockReaddir.mockResolvedValue([
        "checkpoint-research-error.json",
        "checkpoint-design-valid.json",
      ]);

      mockReadFile.mockImplementation(async (filepath) => {
        if (String(filepath).includes("error")) {
          throw new Error("Permission denied");
        }
        return JSON.stringify(validCheckpoint);
      });

      const result = await manager.list();

      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe("valid-id");
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe("edge cases", () => {
    it("should handle empty checkpoint directory", async () => {
      mockReaddir.mockResolvedValue([]);

      const checkpoints = await manager.list();
      expect(checkpoints).toEqual([]);

      const latest = await manager.loadLatest();
      expect(latest).toBeNull();
    });

    it("should propagate non-ENOENT errors", async () => {
      const error = new Error("Permission denied") as NodeJS.ErrnoException;
      error.code = "EACCES";
      mockReaddir.mockRejectedValue(error);

      await expect(manager.list()).rejects.toThrow("Permission denied");
    });

    it("should handle checkpoint filenames with special characters in timestamp", async () => {
      const checkpoint: Checkpoint = {
        id: "special-id",
        workflowState: createTestState(),
        reason: "phase_complete",
        createdAt: new Date(),
      };

      mockReaddir.mockResolvedValue(["checkpoint-research-2025-01-01T12-30-00-000Z.json"]);
      mockReadFile.mockResolvedValue(JSON.stringify(checkpoint));

      const result = await manager.list();
      expect(result).toHaveLength(1);
    });
  });
});
