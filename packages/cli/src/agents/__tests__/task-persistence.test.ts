import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { TaskChain, TaskChainNode } from "@vellum/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createTaskPersistence,
  type PersistedTaskState,
  type TaskPersistence,
} from "../task-persistence.js";

describe("TaskPersistence", () => {
  let tempDir: string;
  let persistence: TaskPersistence;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `vellum-test-${Date.now()}`);
    persistence = createTaskPersistence(tempDir);
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  function createMockTaskChain(): TaskChain {
    const nodes = new Map<string, TaskChainNode>();
    nodes.set("task-1", {
      taskId: "task-1",
      parentTaskId: undefined,
      agentSlug: "orchestrator",
      depth: 0,
      createdAt: new Date("2025-01-01T00:00:00Z"),
      status: "completed",
    });
    nodes.set("task-2", {
      taskId: "task-2",
      parentTaskId: "task-1",
      agentSlug: "coder",
      depth: 1,
      createdAt: new Date("2025-01-01T00:01:00Z"),
      status: "running",
    });

    return {
      chainId: "chain-123",
      rootTaskId: "task-1",
      nodes,
      maxDepth: 3,
    };
  }

  function createMockState(overrides: Partial<PersistedTaskState> = {}): PersistedTaskState {
    return {
      chainId: "chain-123",
      chain: createMockTaskChain(),
      status: "running",
      lastTaskId: "task-2",
      checkpoint: {
        completedTasks: ["task-1"],
        pendingTasks: [],
        failedTasks: [],
      },
      savedAt: new Date("2025-01-01T00:02:00Z"),
      ...overrides,
    };
  }

  describe("saveTaskState", () => {
    it("should create directory and save state as JSON", async () => {
      const state = createMockState();

      await persistence.saveTaskState(state);

      const filePath = path.join(tempDir, "chain-123.json");
      const content = await fs.readFile(filePath, "utf-8");
      const parsed = JSON.parse(content);

      expect(parsed.chainId).toBe("chain-123");
      expect(parsed.status).toBe("running");
      expect(parsed.lastTaskId).toBe("task-2");
      expect(parsed.chain.nodes).toHaveLength(2);
    });

    it("should sanitize chainId to prevent path traversal", async () => {
      const state = createMockState({ chainId: "../../../evil" });

      await persistence.saveTaskState(state);

      // Should create sanitized file name (../../../evil -> _________evil)
      const files = await fs.readdir(tempDir);
      expect(files).toContain("_________evil.json");
      expect(files).not.toContain("evil.json");
    });

    it("should overwrite existing state", async () => {
      const state1 = createMockState({ status: "running" });
      const state2 = createMockState({ status: "paused" });

      await persistence.saveTaskState(state1);
      await persistence.saveTaskState(state2);

      const loaded = await persistence.loadTaskState("chain-123");
      expect(loaded?.status).toBe("paused");
    });
  });

  describe("loadTaskState", () => {
    it("should return null for non-existent chain", async () => {
      const result = await persistence.loadTaskState("non-existent");

      expect(result).toBeNull();
    });

    it("should load and deserialize saved state", async () => {
      const state = createMockState();
      await persistence.saveTaskState(state);

      const loaded = await persistence.loadTaskState("chain-123");

      expect(loaded).not.toBeNull();
      if (!loaded) throw new Error("loaded should not be null");
      expect(loaded.chainId).toBe("chain-123");
      expect(loaded.status).toBe("running");
      expect(loaded.chain.nodes.size).toBe(2);
      expect(loaded.chain.nodes.get("task-1")?.status).toBe("completed");
      expect(loaded.savedAt).toBeInstanceOf(Date);
      expect(loaded.chain.nodes.get("task-1")?.createdAt).toBeInstanceOf(Date);
    });

    it("should correctly restore Map from array", async () => {
      const state = createMockState();
      await persistence.saveTaskState(state);

      const loaded = await persistence.loadTaskState("chain-123");

      if (!loaded) throw new Error("loaded should not be null");
      expect(loaded.chain.nodes).toBeInstanceOf(Map);
      expect(loaded.chain.nodes.get("task-2")?.agentSlug).toBe("coder");
    });
  });

  describe("listResumable", () => {
    it("should return empty array when no tasks exist", async () => {
      const result = await persistence.listResumable();

      expect(result).toEqual([]);
    });

    it("should only list running and paused tasks", async () => {
      await persistence.saveTaskState(createMockState({ chainId: "running-1", status: "running" }));
      await persistence.saveTaskState(createMockState({ chainId: "paused-1", status: "paused" }));
      await persistence.saveTaskState(
        createMockState({ chainId: "completed-1", status: "completed" })
      );
      await persistence.saveTaskState(createMockState({ chainId: "failed-1", status: "failed" }));

      const result = await persistence.listResumable();

      expect(result).toHaveLength(2);
      expect(result.map((r) => r.chainId)).toContain("running-1");
      expect(result.map((r) => r.chainId)).toContain("paused-1");
      expect(result.map((r) => r.chainId)).not.toContain("completed-1");
      expect(result.map((r) => r.chainId)).not.toContain("failed-1");
    });

    it("should sort by savedAt descending", async () => {
      await persistence.saveTaskState(
        createMockState({
          chainId: "older",
          status: "running",
          savedAt: new Date("2025-01-01T00:00:00Z"),
        })
      );
      await persistence.saveTaskState(
        createMockState({
          chainId: "newer",
          status: "running",
          savedAt: new Date("2025-01-02T00:00:00Z"),
        })
      );

      const result = await persistence.listResumable();

      expect(result[0]!.chainId).toBe("newer");
      expect(result[1]!.chainId).toBe("older");
    });

    it("should include status and savedAt in results", async () => {
      await persistence.saveTaskState(
        createMockState({
          chainId: "test",
          status: "paused",
          savedAt: new Date("2025-06-15T12:30:00Z"),
        })
      );

      const result = await persistence.listResumable();

      expect(result[0]!.status).toBe("paused");
      expect(result[0]!.savedAt).toBeInstanceOf(Date);
    });
  });

  describe("deleteTaskState", () => {
    it("should return false for non-existent chain", async () => {
      const result = await persistence.deleteTaskState("non-existent");

      expect(result).toBe(false);
    });

    it("should delete existing state and return true", async () => {
      await persistence.saveTaskState(createMockState());

      const result = await persistence.deleteTaskState("chain-123");

      expect(result).toBe(true);

      const loaded = await persistence.loadTaskState("chain-123");
      expect(loaded).toBeNull();
    });
  });

  describe("createTaskPersistence", () => {
    it("should use default directory when not specified", () => {
      const defaultPersistence = createTaskPersistence();
      // Just verify it creates without error
      expect(defaultPersistence).toBeDefined();
    });
  });
});
