import { beforeEach, describe, expect, it } from "vitest";
import {
  AggregatedResultSchema,
  createResultAggregator,
  PartialFailureStrategySchema,
  type ResultAggregator,
  type TaskResult,
  TaskResultSchema,
  TaskStatusSchema,
} from "../orchestrator/aggregator.js";

describe("ResultAggregator", () => {
  let aggregator: ResultAggregator<string>;

  beforeEach(() => {
    aggregator = createResultAggregator<string>();
  });

  describe("addResult", () => {
    it("should add a valid result", () => {
      const result: TaskResult<string> = {
        taskId: "task-1",
        agentSlug: "worker-1",
        status: "success",
        data: "completed",
        startedAt: new Date("2025-01-01T00:00:00Z"),
        completedAt: new Date("2025-01-01T00:01:00Z"),
      };

      expect(() => aggregator.addResult(result)).not.toThrow();
    });

    it("should add multiple results", () => {
      const result1: TaskResult<string> = {
        taskId: "task-1",
        agentSlug: "worker-1",
        status: "success",
        startedAt: new Date(),
        completedAt: new Date(),
      };

      const result2: TaskResult<string> = {
        taskId: "task-2",
        agentSlug: "worker-2",
        status: "failure",
        error: new Error("Something went wrong"),
        startedAt: new Date(),
        completedAt: new Date(),
      };

      aggregator.addResult(result1);
      aggregator.addResult(result2);

      const aggregated = aggregator.aggregate();
      expect(aggregated.results).toHaveLength(2);
    });

    it("should throw on invalid taskId", () => {
      const result = {
        taskId: "",
        agentSlug: "worker-1",
        status: "success" as const,
        startedAt: new Date(),
        completedAt: new Date(),
      };

      expect(() => aggregator.addResult(result)).toThrow();
    });

    it("should throw on invalid agentSlug", () => {
      const result = {
        taskId: "task-1",
        agentSlug: "",
        status: "success" as const,
        startedAt: new Date(),
        completedAt: new Date(),
      };

      expect(() => aggregator.addResult(result)).toThrow();
    });
  });

  describe("isComplete", () => {
    it("should return true when expected count is reached", () => {
      aggregator.addResult({
        taskId: "task-1",
        agentSlug: "worker-1",
        status: "success",
        startedAt: new Date(),
        completedAt: new Date(),
      });

      expect(aggregator.isComplete(1)).toBe(true);
    });

    it("should return false when expected count is not reached", () => {
      aggregator.addResult({
        taskId: "task-1",
        agentSlug: "worker-1",
        status: "success",
        startedAt: new Date(),
        completedAt: new Date(),
      });

      expect(aggregator.isComplete(2)).toBe(false);
    });

    it("should return true when more results than expected", () => {
      aggregator.addResult({
        taskId: "task-1",
        agentSlug: "worker-1",
        status: "success",
        startedAt: new Date(),
        completedAt: new Date(),
      });

      aggregator.addResult({
        taskId: "task-2",
        agentSlug: "worker-2",
        status: "success",
        startedAt: new Date(),
        completedAt: new Date(),
      });

      expect(aggregator.isComplete(1)).toBe(true);
    });

    it("should return true for zero expected count with no results", () => {
      expect(aggregator.isComplete(0)).toBe(true);
    });
  });

  describe("aggregate", () => {
    it("should return success status when all tasks succeed", () => {
      aggregator.addResult({
        taskId: "task-1",
        agentSlug: "worker-1",
        status: "success",
        data: "result-1",
        startedAt: new Date(),
        completedAt: new Date(),
      });

      aggregator.addResult({
        taskId: "task-2",
        agentSlug: "worker-2",
        status: "success",
        data: "result-2",
        startedAt: new Date(),
        completedAt: new Date(),
      });

      const result = aggregator.aggregate();

      expect(result.overallStatus).toBe("success");
      expect(result.totalTasks).toBe(2);
      expect(result.succeeded).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.partial).toBe(0);
    });

    it("should return failure status when all tasks fail", () => {
      aggregator.addResult({
        taskId: "task-1",
        agentSlug: "worker-1",
        status: "failure",
        error: new Error("Error 1"),
        startedAt: new Date(),
        completedAt: new Date(),
      });

      aggregator.addResult({
        taskId: "task-2",
        agentSlug: "worker-2",
        status: "failure",
        error: new Error("Error 2"),
        startedAt: new Date(),
        completedAt: new Date(),
      });

      const result = aggregator.aggregate();

      expect(result.overallStatus).toBe("failure");
      expect(result.totalTasks).toBe(2);
      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(2);
      expect(result.partial).toBe(0);
    });

    it("should return partial status when some tasks fail", () => {
      aggregator.addResult({
        taskId: "task-1",
        agentSlug: "worker-1",
        status: "success",
        data: "result-1",
        startedAt: new Date(),
        completedAt: new Date(),
      });

      aggregator.addResult({
        taskId: "task-2",
        agentSlug: "worker-2",
        status: "failure",
        error: new Error("Error"),
        startedAt: new Date(),
        completedAt: new Date(),
      });

      const result = aggregator.aggregate();

      expect(result.overallStatus).toBe("partial");
      expect(result.totalTasks).toBe(2);
      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.partial).toBe(0);
    });

    it("should return partial status when tasks have partial status", () => {
      aggregator.addResult({
        taskId: "task-1",
        agentSlug: "worker-1",
        status: "partial",
        data: "partial-result",
        startedAt: new Date(),
        completedAt: new Date(),
      });

      aggregator.addResult({
        taskId: "task-2",
        agentSlug: "worker-2",
        status: "success",
        data: "result",
        startedAt: new Date(),
        completedAt: new Date(),
      });

      const result = aggregator.aggregate();

      expect(result.overallStatus).toBe("partial");
      expect(result.partial).toBe(1);
    });

    it("should return success for empty results", () => {
      const result = aggregator.aggregate();

      expect(result.overallStatus).toBe("success");
      expect(result.totalTasks).toBe(0);
    });

    it("should return a copy of results array", () => {
      aggregator.addResult({
        taskId: "task-1",
        agentSlug: "worker-1",
        status: "success",
        startedAt: new Date(),
        completedAt: new Date(),
      });

      const result1 = aggregator.aggregate();
      const result2 = aggregator.aggregate();

      expect(result1.results).not.toBe(result2.results);
      expect(result1.results).toEqual(result2.results);
    });
  });

  describe("handlePartialFailure", () => {
    it("should store continue strategy", () => {
      aggregator.handlePartialFailure("continue");
      expect(aggregator.getPartialFailureStrategy()).toBe("continue");
    });

    it("should store abort strategy", () => {
      aggregator.handlePartialFailure("abort");
      expect(aggregator.getPartialFailureStrategy()).toBe("abort");
    });

    it("should store retry strategy", () => {
      aggregator.handlePartialFailure("retry");
      expect(aggregator.getPartialFailureStrategy()).toBe("retry");
    });

    it("should throw on invalid strategy", () => {
      // biome-ignore lint/suspicious/noExplicitAny: testing invalid input rejection
      expect(() => aggregator.handlePartialFailure("invalid" as any)).toThrow();
    });

    it("should override previous strategy", () => {
      aggregator.handlePartialFailure("continue");
      aggregator.handlePartialFailure("abort");
      expect(aggregator.getPartialFailureStrategy()).toBe("abort");
    });
  });

  describe("reset", () => {
    it("should clear all results", () => {
      aggregator.addResult({
        taskId: "task-1",
        agentSlug: "worker-1",
        status: "success",
        startedAt: new Date(),
        completedAt: new Date(),
      });

      aggregator.reset();

      const result = aggregator.aggregate();
      expect(result.totalTasks).toBe(0);
      expect(result.results).toHaveLength(0);
    });

    it("should clear partial failure strategy", () => {
      aggregator.handlePartialFailure("continue");
      aggregator.reset();
      expect(aggregator.getPartialFailureStrategy()).toBeUndefined();
    });

    it("should allow adding new results after reset", () => {
      aggregator.addResult({
        taskId: "task-1",
        agentSlug: "worker-1",
        status: "success",
        startedAt: new Date(),
        completedAt: new Date(),
      });

      aggregator.reset();

      aggregator.addResult({
        taskId: "task-2",
        agentSlug: "worker-2",
        status: "failure",
        startedAt: new Date(),
        completedAt: new Date(),
      });

      const result = aggregator.aggregate();
      expect(result.totalTasks).toBe(1);
      expect(result.results[0]?.taskId).toBe("task-2");
    });
  });

  describe("Zod Schemas", () => {
    describe("TaskStatusSchema", () => {
      it("should validate success status", () => {
        expect(TaskStatusSchema.parse("success")).toBe("success");
      });

      it("should validate failure status", () => {
        expect(TaskStatusSchema.parse("failure")).toBe("failure");
      });

      it("should validate partial status", () => {
        expect(TaskStatusSchema.parse("partial")).toBe("partial");
      });

      it("should reject invalid status", () => {
        expect(() => TaskStatusSchema.parse("invalid")).toThrow();
      });
    });

    describe("TaskResultSchema", () => {
      it("should validate a complete task result", () => {
        const result = {
          taskId: "task-1",
          agentSlug: "worker-1",
          status: "success",
          data: { foo: "bar" },
          startedAt: new Date(),
          completedAt: new Date(),
        };

        expect(() => TaskResultSchema.parse(result)).not.toThrow();
      });

      it("should validate a task result with error", () => {
        const result = {
          taskId: "task-1",
          agentSlug: "worker-1",
          status: "failure",
          error: new Error("test"),
          startedAt: new Date(),
          completedAt: new Date(),
        };

        expect(() => TaskResultSchema.parse(result)).not.toThrow();
      });

      it("should reject task result with empty taskId", () => {
        const result = {
          taskId: "",
          agentSlug: "worker-1",
          status: "success",
          startedAt: new Date(),
          completedAt: new Date(),
        };

        expect(() => TaskResultSchema.parse(result)).toThrow();
      });
    });

    describe("AggregatedResultSchema", () => {
      it("should validate an aggregated result", () => {
        const result = {
          results: [
            {
              taskId: "task-1",
              agentSlug: "worker-1",
              status: "success",
              startedAt: new Date(),
              completedAt: new Date(),
            },
          ],
          totalTasks: 1,
          succeeded: 1,
          failed: 0,
          partial: 0,
          overallStatus: "success",
        };

        expect(() => AggregatedResultSchema.parse(result)).not.toThrow();
      });

      it("should reject negative counts", () => {
        const result = {
          results: [],
          totalTasks: -1,
          succeeded: 0,
          failed: 0,
          partial: 0,
          overallStatus: "success",
        };

        expect(() => AggregatedResultSchema.parse(result)).toThrow();
      });
    });

    describe("PartialFailureStrategySchema", () => {
      it("should validate continue strategy", () => {
        expect(PartialFailureStrategySchema.parse("continue")).toBe("continue");
      });

      it("should validate abort strategy", () => {
        expect(PartialFailureStrategySchema.parse("abort")).toBe("abort");
      });

      it("should validate retry strategy", () => {
        expect(PartialFailureStrategySchema.parse("retry")).toBe("retry");
      });

      it("should reject invalid strategy", () => {
        expect(() => PartialFailureStrategySchema.parse("invalid")).toThrow();
      });
    });
  });

  describe("Generic Type Support", () => {
    it("should work with complex data types", () => {
      interface ComplexData {
        message: string;
        count: number;
        nested: { value: boolean };
      }

      const complexAggregator = createResultAggregator<ComplexData>();

      complexAggregator.addResult({
        taskId: "task-1",
        agentSlug: "worker-1",
        status: "success",
        data: {
          message: "test",
          count: 42,
          nested: { value: true },
        },
        startedAt: new Date(),
        completedAt: new Date(),
      });

      const result = complexAggregator.aggregate();
      expect(result.results[0]?.data?.message).toBe("test");
      expect(result.results[0]?.data?.count).toBe(42);
      expect(result.results[0]?.data?.nested.value).toBe(true);
    });

    it("should work with array data types", () => {
      const arrayAggregator = createResultAggregator<string[]>();

      arrayAggregator.addResult({
        taskId: "task-1",
        agentSlug: "worker-1",
        status: "success",
        data: ["a", "b", "c"],
        startedAt: new Date(),
        completedAt: new Date(),
      });

      const result = arrayAggregator.aggregate();
      expect(result.results[0]?.data).toEqual(["a", "b", "c"]);
    });
  });
});
