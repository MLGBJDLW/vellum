/**
 * Measurement Scheduler Unit Tests
 *
 * @module measurementScheduler.test
 */

import { describe, expect, it, vi } from "vitest";

import {
  calculateAdaptiveInterval,
  createInitialSchedulerState,
  DEFAULT_SCHEDULER_CONFIG,
  getNextBatch,
  type MeasurementTask,
  type SchedulerAction,
  type SchedulerState,
  schedulerReducer,
  sortByPriority,
} from "../measurementScheduler.js";

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a measurement task for testing
 */
function createTask(
  id: string,
  priority: "high" | "normal" | "low" = "normal",
  scheduledAt: number = Date.now()
): MeasurementTask {
  return {
    id,
    priority,
    callback: vi.fn(),
    scheduledAt,
  };
}

/**
 * Create initial state with optional overrides
 */
function createState(overrides?: Partial<SchedulerState>): SchedulerState {
  return {
    ...createInitialSchedulerState(),
    ...overrides,
  };
}

// ============================================================================
// schedulerReducer Tests
// ============================================================================

describe("measurementScheduler", () => {
  describe("schedulerReducer", () => {
    describe("SCHEDULE", () => {
      it("should add a task to empty queue", () => {
        const state = createState();
        const task = createTask("task-1", "normal");
        const action: SchedulerAction = { type: "SCHEDULE", task };

        const newState = schedulerReducer(state, action, DEFAULT_SCHEDULER_CONFIG);

        expect(newState.pendingTasks).toHaveLength(1);
        expect(newState.pendingTasks[0]).toBe(task);
      });

      it("should add multiple tasks to queue", () => {
        let state = createState();
        const task1 = createTask("task-1", "normal");
        const task2 = createTask("task-2", "high");

        state = schedulerReducer(
          state,
          { type: "SCHEDULE", task: task1 },
          DEFAULT_SCHEDULER_CONFIG
        );
        state = schedulerReducer(
          state,
          { type: "SCHEDULE", task: task2 },
          DEFAULT_SCHEDULER_CONFIG
        );

        expect(state.pendingTasks).toHaveLength(2);
        expect(state.pendingTasks.map((t: MeasurementTask) => t.id)).toEqual(["task-1", "task-2"]);
      });

      it("should deduplicate tasks with same id (replace existing)", () => {
        const state = createState({
          pendingTasks: [createTask("task-1", "low", 1000)],
        });
        const newTask = createTask("task-1", "high", 2000);
        const action: SchedulerAction = { type: "SCHEDULE", task: newTask };

        const newState = schedulerReducer(state, action, DEFAULT_SCHEDULER_CONFIG);

        expect(newState.pendingTasks).toHaveLength(1);
        expect(newState.pendingTasks[0]?.priority).toBe("high");
        expect(newState.pendingTasks[0]?.scheduledAt).toBe(2000);
      });

      it("should preserve other tasks when deduplicating", () => {
        const state = createState({
          pendingTasks: [
            createTask("task-1", "low"),
            createTask("task-2", "normal"),
            createTask("task-3", "high"),
          ],
        });
        const newTask = createTask("task-2", "high");
        const action: SchedulerAction = { type: "SCHEDULE", task: newTask };

        const newState = schedulerReducer(state, action, DEFAULT_SCHEDULER_CONFIG);

        expect(newState.pendingTasks).toHaveLength(3);
        expect(newState.pendingTasks.map((t: MeasurementTask) => t.id)).toEqual([
          "task-1",
          "task-3",
          "task-2",
        ]);
      });
    });

    describe("PROCESS_BATCH", () => {
      it("should update lastProcessTime with empty queue", () => {
        const state = createState();
        const action: SchedulerAction = { type: "PROCESS_BATCH", processTime: 12345 };

        const newState = schedulerReducer(state, action, DEFAULT_SCHEDULER_CONFIG);

        expect(newState.lastProcessTime).toBe(12345);
        expect(newState.stats.totalBatches).toBe(0); // No batch processed
      });

      it("should remove processed tasks from queue", () => {
        const state = createState({
          pendingTasks: [
            createTask("task-1", "high"),
            createTask("task-2", "normal"),
            createTask("task-3", "low"),
          ],
        });
        const config = { ...DEFAULT_SCHEDULER_CONFIG, maxBatchSize: 2 };
        const action: SchedulerAction = { type: "PROCESS_BATCH", processTime: 1000 };

        const newState = schedulerReducer(state, action, config);

        // Should process high and normal priority first (maxBatchSize: 2)
        expect(newState.pendingTasks).toHaveLength(1);
        expect(newState.pendingTasks[0]?.id).toBe("task-3"); // low priority remains
      });

      it("should update statistics correctly", () => {
        const state = createState({
          pendingTasks: [createTask("task-1"), createTask("task-2"), createTask("task-3")],
          stats: {
            totalProcessed: 10,
            totalBatches: 5,
            averageBatchSize: 2,
          },
        });
        const action: SchedulerAction = { type: "PROCESS_BATCH", processTime: 1000 };

        const newState = schedulerReducer(state, action, DEFAULT_SCHEDULER_CONFIG);

        expect(newState.stats.totalProcessed).toBe(13); // 10 + 3
        expect(newState.stats.totalBatches).toBe(6); // 5 + 1
        expect(newState.stats.averageBatchSize).toBeCloseTo(13 / 6);
      });

      it("should respect maxBatchSize", () => {
        const tasks = Array.from({ length: 30 }, (_, i) => createTask(`task-${i}`));
        const state = createState({ pendingTasks: tasks });
        const config = { ...DEFAULT_SCHEDULER_CONFIG, maxBatchSize: 5 };
        const action: SchedulerAction = { type: "PROCESS_BATCH", processTime: 1000 };

        const newState = schedulerReducer(state, action, config);

        expect(newState.pendingTasks).toHaveLength(25); // 30 - 5
        expect(newState.stats.totalProcessed).toBe(5);
      });
    });

    describe("ADJUST_INTERVAL", () => {
      it("should increase interval when over budget", () => {
        const state = createState({ currentInterval: 32 });
        // measuredFrameTime > targetFrameTime (16ms) => over budget
        const action: SchedulerAction = { type: "ADJUST_INTERVAL", measuredFrameTime: 32 };

        const newState = schedulerReducer(state, action, DEFAULT_SCHEDULER_CONFIG);

        expect(newState.currentInterval).toBeGreaterThan(32);
      });

      it("should decrease interval when under budget", () => {
        const state = createState({ currentInterval: 50 });
        // measuredFrameTime < targetFrameTime => under budget
        const action: SchedulerAction = { type: "ADJUST_INTERVAL", measuredFrameTime: 8 };

        const newState = schedulerReducer(state, action, DEFAULT_SCHEDULER_CONFIG);

        expect(newState.currentInterval).toBeLessThan(50);
      });

      it("should update currentLoad", () => {
        const state = createState({ currentLoad: 0 });
        const action: SchedulerAction = { type: "ADJUST_INTERVAL", measuredFrameTime: 24 };

        const newState = schedulerReducer(state, action, DEFAULT_SCHEDULER_CONFIG);

        // Load should be > 0 when over budget
        expect(newState.currentLoad).toBeGreaterThan(0);
      });

      it("should clamp interval to maxInterval", () => {
        const state = createState({ currentInterval: 90 });
        const action: SchedulerAction = { type: "ADJUST_INTERVAL", measuredFrameTime: 100 }; // Very high load

        const newState = schedulerReducer(state, action, DEFAULT_SCHEDULER_CONFIG);

        expect(newState.currentInterval).toBeLessThanOrEqual(DEFAULT_SCHEDULER_CONFIG.maxInterval);
      });

      it("should clamp interval to minInterval", () => {
        const state = createState({ currentInterval: 20 });
        const action: SchedulerAction = { type: "ADJUST_INTERVAL", measuredFrameTime: 1 }; // Very low load

        const newState = schedulerReducer(state, action, DEFAULT_SCHEDULER_CONFIG);

        expect(newState.currentInterval).toBeGreaterThanOrEqual(
          DEFAULT_SCHEDULER_CONFIG.minInterval
        );
      });
    });

    describe("CANCEL", () => {
      it("should remove task by id", () => {
        const state = createState({
          pendingTasks: [createTask("task-1"), createTask("task-2"), createTask("task-3")],
        });
        const action: SchedulerAction = { type: "CANCEL", id: "task-2" };

        const newState = schedulerReducer(state, action, DEFAULT_SCHEDULER_CONFIG);

        expect(newState.pendingTasks).toHaveLength(2);
        expect(newState.pendingTasks.map((t: MeasurementTask) => t.id)).toEqual([
          "task-1",
          "task-3",
        ]);
      });

      it("should do nothing when id not found", () => {
        const state = createState({
          pendingTasks: [createTask("task-1"), createTask("task-2")],
        });
        const action: SchedulerAction = { type: "CANCEL", id: "nonexistent" };

        const newState = schedulerReducer(state, action, DEFAULT_SCHEDULER_CONFIG);

        expect(newState.pendingTasks).toHaveLength(2);
      });

      it("should handle empty queue", () => {
        const state = createState({ pendingTasks: [] });
        const action: SchedulerAction = { type: "CANCEL", id: "task-1" };

        const newState = schedulerReducer(state, action, DEFAULT_SCHEDULER_CONFIG);

        expect(newState.pendingTasks).toHaveLength(0);
      });
    });

    describe("CLEAR", () => {
      it("should remove all tasks", () => {
        const state = createState({
          pendingTasks: [createTask("task-1"), createTask("task-2"), createTask("task-3")],
        });
        const action: SchedulerAction = { type: "CLEAR" };

        const newState = schedulerReducer(state, action, DEFAULT_SCHEDULER_CONFIG);

        expect(newState.pendingTasks).toHaveLength(0);
      });

      it("should preserve other state", () => {
        const state = createState({
          pendingTasks: [createTask("task-1")],
          currentInterval: 50,
          currentLoad: 0.5,
          stats: { totalProcessed: 100, totalBatches: 10, averageBatchSize: 10 },
        });
        const action: SchedulerAction = { type: "CLEAR" };

        const newState = schedulerReducer(state, action, DEFAULT_SCHEDULER_CONFIG);

        expect(newState.pendingTasks).toHaveLength(0);
        expect(newState.currentInterval).toBe(50);
        expect(newState.currentLoad).toBe(0.5);
        expect(newState.stats.totalProcessed).toBe(100);
      });

      it("should handle already empty queue", () => {
        const state = createState({ pendingTasks: [] });
        const action: SchedulerAction = { type: "CLEAR" };

        const newState = schedulerReducer(state, action, DEFAULT_SCHEDULER_CONFIG);

        expect(newState.pendingTasks).toHaveLength(0);
      });
    });
  });

  // ============================================================================
  // calculateAdaptiveInterval Tests
  // ============================================================================

  describe("calculateAdaptiveInterval", () => {
    it("should increase interval when over budget", () => {
      const currentInterval = 32;
      const measuredFrameTime = 32; // 2x target (16ms)

      const result = calculateAdaptiveInterval(
        currentInterval,
        measuredFrameTime,
        DEFAULT_SCHEDULER_CONFIG
      );

      expect(result).toBeGreaterThan(currentInterval);
    });

    it("should decrease interval when under budget", () => {
      const currentInterval = 50;
      const measuredFrameTime = 8; // 0.5x target (16ms)

      const result = calculateAdaptiveInterval(
        currentInterval,
        measuredFrameTime,
        DEFAULT_SCHEDULER_CONFIG
      );

      expect(result).toBeLessThan(currentInterval);
    });

    it("should clamp to minInterval", () => {
      const currentInterval = 20;
      const measuredFrameTime = 1; // Very fast => should decrease a lot

      const result = calculateAdaptiveInterval(
        currentInterval,
        measuredFrameTime,
        DEFAULT_SCHEDULER_CONFIG
      );

      expect(result).toBeGreaterThanOrEqual(DEFAULT_SCHEDULER_CONFIG.minInterval);
    });

    it("should clamp to maxInterval", () => {
      const currentInterval = 80;
      const measuredFrameTime = 200; // Very slow => should increase a lot

      const result = calculateAdaptiveInterval(
        currentInterval,
        measuredFrameTime,
        DEFAULT_SCHEDULER_CONFIG
      );

      expect(result).toBeLessThanOrEqual(DEFAULT_SCHEDULER_CONFIG.maxInterval);
    });

    it("should return integer value", () => {
      const result = calculateAdaptiveInterval(33, 17, DEFAULT_SCHEDULER_CONFIG);

      expect(Number.isInteger(result)).toBe(true);
    });

    it("should use custom config values", () => {
      const customConfig = {
        ...DEFAULT_SCHEDULER_CONFIG,
        minInterval: 50,
        maxInterval: 200,
        targetFrameTime: 20,
        loadFactor: 2.0,
      };

      // Under budget with custom config
      const result = calculateAdaptiveInterval(100, 5, customConfig);

      expect(result).toBeGreaterThanOrEqual(50); // Custom minInterval
    });

    it("should handle exactly on target", () => {
      const currentInterval = 32;
      const measuredFrameTime = 16; // Exactly at target

      const result = calculateAdaptiveInterval(
        currentInterval,
        measuredFrameTime,
        DEFAULT_SCHEDULER_CONFIG
      );

      // Should decrease slightly (under budget technically means ratio = 1)
      expect(result).toBeLessThanOrEqual(currentInterval);
    });
  });

  // ============================================================================
  // sortByPriority Tests
  // ============================================================================

  describe("sortByPriority", () => {
    it("should sort high > normal > low", () => {
      const tasks = [
        createTask("low", "low"),
        createTask("normal", "normal"),
        createTask("high", "high"),
      ];

      const sorted = sortByPriority(tasks);

      expect(sorted.map((t: MeasurementTask) => t.priority)).toEqual(["high", "normal", "low"]);
    });

    it("should preserve FIFO within same priority", () => {
      const tasks = [
        createTask("first", "normal", 1000),
        createTask("second", "normal", 2000),
        createTask("third", "normal", 3000),
      ];

      const sorted = sortByPriority(tasks);

      expect(sorted.map((t: MeasurementTask) => t.id)).toEqual(["first", "second", "third"]);
    });

    it("should handle mixed priorities with FIFO", () => {
      const tasks = [
        createTask("low-1", "low", 1000),
        createTask("high-1", "high", 2000),
        createTask("normal-1", "normal", 3000),
        createTask("high-2", "high", 4000),
        createTask("low-2", "low", 5000),
      ];

      const sorted = sortByPriority(tasks);

      expect(sorted.map((t: MeasurementTask) => t.id)).toEqual([
        "high-1",
        "high-2", // High priority first, FIFO
        "normal-1", // Normal priority
        "low-1",
        "low-2", // Low priority last, FIFO
      ]);
    });

    it("should not mutate original array", () => {
      const tasks = [createTask("low", "low"), createTask("high", "high")];
      const original = [...tasks];

      sortByPriority(tasks);

      expect(tasks).toEqual(original);
    });

    it("should handle empty array", () => {
      const sorted = sortByPriority([]);

      expect(sorted).toEqual([]);
    });

    it("should handle single task", () => {
      const task = createTask("only", "normal");
      const sorted = sortByPriority([task]);

      expect(sorted).toHaveLength(1);
      expect(sorted[0]).toBe(task);
    });

    it("should handle all same priority", () => {
      const tasks = [
        createTask("a", "high", 3000),
        createTask("b", "high", 1000),
        createTask("c", "high", 2000),
      ];

      const sorted = sortByPriority(tasks);

      // FIFO by scheduledAt
      expect(sorted.map((t: MeasurementTask) => t.id)).toEqual(["b", "c", "a"]);
    });
  });

  // ============================================================================
  // getNextBatch Tests
  // ============================================================================

  describe("getNextBatch", () => {
    it("should respect maxBatchSize", () => {
      const tasks = Array.from({ length: 10 }, (_, i) => createTask(`task-${i}`));

      const batch = getNextBatch(tasks, 5);

      expect(batch).toHaveLength(5);
    });

    it("should return high priority first", () => {
      const tasks = [
        createTask("low", "low"),
        createTask("normal", "normal"),
        createTask("high", "high"),
      ];

      const batch = getNextBatch(tasks, 2);

      expect(batch.map((t: MeasurementTask) => t.id)).toEqual(["high", "normal"]);
    });

    it("should return all tasks if less than maxSize", () => {
      const tasks = [createTask("a"), createTask("b")];

      const batch = getNextBatch(tasks, 10);

      expect(batch).toHaveLength(2);
    });

    it("should handle empty array", () => {
      const batch = getNextBatch([], 5);

      expect(batch).toEqual([]);
    });

    it("should handle maxSize of 0", () => {
      const tasks = [createTask("a"), createTask("b")];

      const batch = getNextBatch(tasks, 0);

      expect(batch).toHaveLength(0);
    });

    it("should return tasks sorted by priority", () => {
      const tasks = [
        createTask("low-1", "low", 1000),
        createTask("high-1", "high", 2000),
        createTask("normal-1", "normal", 3000),
        createTask("high-2", "high", 4000),
      ];

      const batch = getNextBatch(tasks, 3);

      expect(batch.map((t: MeasurementTask) => t.id)).toEqual(["high-1", "high-2", "normal-1"]);
    });

    it("should not mutate original array", () => {
      const tasks = [createTask("a", "low"), createTask("b", "high")];
      const original = [...tasks];

      getNextBatch(tasks, 1);

      expect(tasks).toEqual(original);
    });
  });

  // ============================================================================
  // createInitialSchedulerState Tests
  // ============================================================================

  describe("createInitialSchedulerState", () => {
    it("should create state with default config", () => {
      const state = createInitialSchedulerState();

      expect(state.currentInterval).toBe(DEFAULT_SCHEDULER_CONFIG.initialInterval);
      expect(state.pendingTasks).toEqual([]);
      expect(state.lastProcessTime).toBe(0);
      expect(state.currentLoad).toBe(0);
      expect(state.stats.totalProcessed).toBe(0);
      expect(state.stats.totalBatches).toBe(0);
      expect(state.stats.averageBatchSize).toBe(0);
    });

    it("should accept custom initial interval", () => {
      const state = createInitialSchedulerState({ initialInterval: 64 });

      expect(state.currentInterval).toBe(64);
    });

    it("should merge partial config with defaults", () => {
      const state = createInitialSchedulerState({
        minInterval: 8,
        // Other values should use defaults
      });

      // State should be created successfully with merged config
      expect(state.currentInterval).toBe(DEFAULT_SCHEDULER_CONFIG.initialInterval);
    });
  });

  // ============================================================================
  // Edge Cases & Boundary Conditions
  // ============================================================================

  describe("edge cases", () => {
    describe("empty queue handling", () => {
      it("PROCESS_BATCH should not throw on empty queue", () => {
        const state = createState({ pendingTasks: [] });
        const action: SchedulerAction = { type: "PROCESS_BATCH", processTime: 1000 };

        expect(() => schedulerReducer(state, action, DEFAULT_SCHEDULER_CONFIG)).not.toThrow();
      });

      it("should not increment batch count when queue is empty", () => {
        const state = createState({
          pendingTasks: [],
          stats: { totalProcessed: 0, totalBatches: 0, averageBatchSize: 0 },
        });
        const action: SchedulerAction = { type: "PROCESS_BATCH", processTime: 1000 };

        const newState = schedulerReducer(state, action, DEFAULT_SCHEDULER_CONFIG);

        expect(newState.stats.totalBatches).toBe(0);
      });
    });

    describe("high load scenario", () => {
      it("should stabilize at maxInterval under sustained high load", () => {
        let state = createState({ currentInterval: 32 });

        // Simulate multiple high-load adjustments
        for (let i = 0; i < 10; i++) {
          const action: SchedulerAction = { type: "ADJUST_INTERVAL", measuredFrameTime: 100 };
          state = schedulerReducer(state, action, DEFAULT_SCHEDULER_CONFIG);
        }

        expect(state.currentInterval).toBe(DEFAULT_SCHEDULER_CONFIG.maxInterval);
      });
    });

    describe("low load scenario", () => {
      it("should stabilize at minInterval under sustained low load", () => {
        let state = createState({ currentInterval: 50 });

        // Simulate multiple low-load adjustments
        for (let i = 0; i < 10; i++) {
          const action: SchedulerAction = { type: "ADJUST_INTERVAL", measuredFrameTime: 4 };
          state = schedulerReducer(state, action, DEFAULT_SCHEDULER_CONFIG);
        }

        expect(state.currentInterval).toBe(DEFAULT_SCHEDULER_CONFIG.minInterval);
      });
    });

    describe("large queue handling", () => {
      it("should handle queue with 1000+ tasks", () => {
        const tasks = Array.from({ length: 1000 }, (_, i) => createTask(`task-${i}`));
        const state = createState({ pendingTasks: tasks });
        const action: SchedulerAction = { type: "PROCESS_BATCH", processTime: 1000 };

        const newState = schedulerReducer(state, action, DEFAULT_SCHEDULER_CONFIG);

        expect(newState.pendingTasks).toHaveLength(1000 - DEFAULT_SCHEDULER_CONFIG.maxBatchSize);
      });
    });

    describe("interval boundary tests", () => {
      it("should handle interval exactly at minInterval", () => {
        const state = createState({ currentInterval: DEFAULT_SCHEDULER_CONFIG.minInterval });
        const action: SchedulerAction = { type: "ADJUST_INTERVAL", measuredFrameTime: 4 };

        const newState = schedulerReducer(state, action, DEFAULT_SCHEDULER_CONFIG);

        expect(newState.currentInterval).toBe(DEFAULT_SCHEDULER_CONFIG.minInterval);
      });

      it("should handle interval exactly at maxInterval", () => {
        const state = createState({ currentInterval: DEFAULT_SCHEDULER_CONFIG.maxInterval });
        const action: SchedulerAction = { type: "ADJUST_INTERVAL", measuredFrameTime: 100 };

        const newState = schedulerReducer(state, action, DEFAULT_SCHEDULER_CONFIG);

        expect(newState.currentInterval).toBe(DEFAULT_SCHEDULER_CONFIG.maxInterval);
      });
    });

    describe("stat calculations", () => {
      it("should calculate correct average after multiple batches", () => {
        let state = createState({
          pendingTasks: Array.from({ length: 100 }, (_, i) => createTask(`task-${i}`)),
        });
        const config = { ...DEFAULT_SCHEDULER_CONFIG, maxBatchSize: 10 };

        // Process 5 batches
        for (let i = 0; i < 5; i++) {
          // Replenish tasks
          state = {
            ...state,
            pendingTasks: Array.from({ length: 100 }, (_, j) => createTask(`task-${i}-${j}`)),
          };
          state = schedulerReducer(state, { type: "PROCESS_BATCH", processTime: i * 1000 }, config);
        }

        expect(state.stats.totalBatches).toBe(5);
        expect(state.stats.totalProcessed).toBe(50);
        expect(state.stats.averageBatchSize).toBe(10);
      });
    });
  });
});
