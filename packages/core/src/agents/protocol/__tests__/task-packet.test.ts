// ============================================
// TaskPacket Protocol Tests
// ============================================
// REQ-015: Inter-agent communication task packets

import { describe, expect, it } from "vitest";
import { AgentLevel } from "../../../agent/level.js";
import type { DelegationTarget } from "../delegation.js";
import {
  createTaskPacket,
  type TaskConstraints,
  TaskConstraintsSchema,
  type TaskContext,
  TaskContextSchema,
  type TaskPacket,
  TaskPacketSchema,
} from "../task-packet.js";

// UUID regex pattern for validation
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("TaskPacket Protocol", () => {
  // ============================================
  // TaskContextSchema Tests
  // ============================================
  describe("TaskContextSchema", () => {
    it("validates empty context (all fields optional)", () => {
      const context = {};

      const result = TaskContextSchema.safeParse(context);

      expect(result.success).toBe(true);
    });

    it("validates context with parentTaskId (UUID)", () => {
      const context = {
        parentTaskId: "550e8400-e29b-41d4-a716-446655440000",
      };

      const result = TaskContextSchema.safeParse(context);

      expect(result.success).toBe(true);
    });

    it("validates context with chainId (UUID)", () => {
      const context = {
        chainId: "660e8400-e29b-41d4-a716-446655440001",
      };

      const result = TaskContextSchema.safeParse(context);

      expect(result.success).toBe(true);
    });

    it("validates context with sessionId (string)", () => {
      const context = {
        sessionId: "session-abc-123",
      };

      const result = TaskContextSchema.safeParse(context);

      expect(result.success).toBe(true);
    });

    it("validates context with files array", () => {
      const context = {
        files: ["src/auth/login.ts", "src/auth/logout.ts"],
      };

      const result = TaskContextSchema.safeParse(context);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.files).toHaveLength(2);
      }
    });

    it("validates context with memory object", () => {
      const context = {
        memory: {
          requirements: ["REQ-001", "REQ-002"],
          lastError: null,
          iterationCount: 3,
        },
      };

      const result = TaskContextSchema.safeParse(context);

      expect(result.success).toBe(true);
    });

    it("validates full context with all fields", () => {
      const context: TaskContext = {
        parentTaskId: "550e8400-e29b-41d4-a716-446655440000",
        chainId: "660e8400-e29b-41d4-a716-446655440001",
        sessionId: "session-123",
        files: ["src/index.ts"],
        memory: { key: "value" },
      };

      const result = TaskContextSchema.safeParse(context);

      expect(result.success).toBe(true);
    });

    it("rejects invalid parentTaskId (not UUID)", () => {
      const context = {
        parentTaskId: "not-a-uuid",
      };

      const result = TaskContextSchema.safeParse(context);

      expect(result.success).toBe(false);
    });

    it("rejects invalid chainId (not UUID)", () => {
      const context = {
        chainId: "invalid",
      };

      const result = TaskContextSchema.safeParse(context);

      expect(result.success).toBe(false);
    });

    it("rejects invalid files (not array)", () => {
      const context = {
        files: "src/index.ts", // Should be array
      };

      const result = TaskContextSchema.safeParse(context);

      expect(result.success).toBe(false);
    });
  });

  // ============================================
  // TaskConstraintsSchema Tests
  // ============================================
  describe("TaskConstraintsSchema", () => {
    it("validates empty constraints (all fields optional)", () => {
      const constraints = {};

      const result = TaskConstraintsSchema.safeParse(constraints);

      expect(result.success).toBe(true);
    });

    it("validates timeout (positive integer)", () => {
      const constraints = {
        timeout: 60000,
      };

      const result = TaskConstraintsSchema.safeParse(constraints);

      expect(result.success).toBe(true);
    });

    it("validates maxTokens (positive integer)", () => {
      const constraints = {
        maxTokens: 4096,
      };

      const result = TaskConstraintsSchema.safeParse(constraints);

      expect(result.success).toBe(true);
    });

    it("validates priority (0-10 range)", () => {
      for (let priority = 0; priority <= 10; priority++) {
        const result = TaskConstraintsSchema.safeParse({ priority });
        expect(result.success).toBe(true);
      }
    });

    it("validates full constraints with all fields", () => {
      const constraints: TaskConstraints = {
        timeout: 120000,
        maxTokens: 8192,
        priority: 7,
      };

      const result = TaskConstraintsSchema.safeParse(constraints);

      expect(result.success).toBe(true);
    });

    it("rejects negative timeout", () => {
      const constraints = {
        timeout: -1000,
      };

      const result = TaskConstraintsSchema.safeParse(constraints);

      expect(result.success).toBe(false);
    });

    it("rejects zero timeout", () => {
      const constraints = {
        timeout: 0,
      };

      const result = TaskConstraintsSchema.safeParse(constraints);

      expect(result.success).toBe(false);
    });

    it("rejects non-integer timeout", () => {
      const constraints = {
        timeout: 1000.5,
      };

      const result = TaskConstraintsSchema.safeParse(constraints);

      expect(result.success).toBe(false);
    });

    it("rejects priority below 0", () => {
      const constraints = {
        priority: -1,
      };

      const result = TaskConstraintsSchema.safeParse(constraints);

      expect(result.success).toBe(false);
    });

    it("rejects priority above 10", () => {
      const constraints = {
        priority: 11,
      };

      const result = TaskConstraintsSchema.safeParse(constraints);

      expect(result.success).toBe(false);
    });

    it("rejects negative maxTokens", () => {
      const constraints = {
        maxTokens: -100,
      };

      const result = TaskConstraintsSchema.safeParse(constraints);

      expect(result.success).toBe(false);
    });
  });

  // ============================================
  // TaskPacketSchema Tests
  // ============================================
  describe("TaskPacketSchema", () => {
    const validPacket = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      task: "Implement user authentication module",
      target: { kind: "builtin", slug: "coder" },
      createdAt: new Date(),
      createdBy: "orchestrator",
    };

    it("validates correct task packet with all required fields", () => {
      const result = TaskPacketSchema.safeParse(validPacket);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe(validPacket.id);
        expect(result.data.task).toBe(validPacket.task);
        expect(result.data.target.kind).toBe("builtin");
        expect(result.data.createdBy).toBe("orchestrator");
      }
    });

    it("validates packet with optional context field", () => {
      const packet = {
        ...validPacket,
        context: {
          parentTaskId: "660e8400-e29b-41d4-a716-446655440001",
          files: ["src/auth/index.ts"],
        },
      };

      const result = TaskPacketSchema.safeParse(packet);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.context?.parentTaskId).toBe("660e8400-e29b-41d4-a716-446655440001");
        expect(result.data.context?.files).toContain("src/auth/index.ts");
      }
    });

    it("validates packet with optional constraints field", () => {
      const packet = {
        ...validPacket,
        constraints: {
          priority: 8,
          timeout: 60000,
          maxTokens: 4096,
        },
      };

      const result = TaskPacketSchema.safeParse(packet);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.constraints?.priority).toBe(8);
        expect(result.data.constraints?.timeout).toBe(60000);
      }
    });

    it("validates packet with both context and constraints", () => {
      const packet: TaskPacket = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        task: "Full task with all options",
        target: { kind: "builtin", slug: "qa" },
        context: {
          sessionId: "session-abc",
          memory: { test: true },
        },
        constraints: {
          priority: 5,
        },
        createdAt: new Date(),
        createdBy: "spec-agent",
      };

      const result = TaskPacketSchema.safeParse(packet);

      expect(result.success).toBe(true);
    });

    it("validates packet with custom agent target", () => {
      const packet = {
        ...validPacket,
        target: {
          kind: "custom",
          slug: "test-writer",
        },
      };

      const result = TaskPacketSchema.safeParse(packet);

      expect(result.success).toBe(true);
    });

    it("validates packet with custom mode target", () => {
      const packet = {
        ...validPacket,
        target: {
          kind: "custom-mode",
          slug: "custom-analyzer",
          modeConfig: {
            name: "plan",
            description: "Custom analyzer",
            tools: { edit: false, bash: false },
            prompt: "Analyze code",
            level: AgentLevel.worker,
          },
        },
      };

      const result = TaskPacketSchema.safeParse(packet);

      expect(result.success).toBe(true);
    });

    it("validates packet with MCP target", () => {
      const packet = {
        ...validPacket,
        target: {
          kind: "mcp",
          serverId: "github",
          toolName: "create_issue",
          params: { title: "Bug report" },
        },
      };

      const result = TaskPacketSchema.safeParse(packet);

      expect(result.success).toBe(true);
    });

    it("rejects invalid id (not UUID)", () => {
      const packet = {
        ...validPacket,
        id: "not-a-uuid",
      };

      const result = TaskPacketSchema.safeParse(packet);

      expect(result.success).toBe(false);
    });

    it("rejects empty task description", () => {
      const packet = {
        ...validPacket,
        task: "",
      };

      const result = TaskPacketSchema.safeParse(packet);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("cannot be empty");
      }
    });

    it("rejects missing target", () => {
      const { target, ...packetWithoutTarget } = validPacket;

      const result = TaskPacketSchema.safeParse(packetWithoutTarget);

      expect(result.success).toBe(false);
    });

    it("rejects invalid target", () => {
      const packet = {
        ...validPacket,
        target: { kind: "invalid" },
      };

      const result = TaskPacketSchema.safeParse(packet);

      expect(result.success).toBe(false);
    });

    it("rejects missing createdAt", () => {
      const { createdAt, ...packetWithoutCreatedAt } = validPacket;

      const result = TaskPacketSchema.safeParse(packetWithoutCreatedAt);

      expect(result.success).toBe(false);
    });

    it("rejects invalid createdAt (not Date)", () => {
      const packet = {
        ...validPacket,
        createdAt: "2024-01-01", // String, not Date
      };

      const result = TaskPacketSchema.safeParse(packet);

      expect(result.success).toBe(false);
    });

    it("rejects empty createdBy", () => {
      const packet = {
        ...validPacket,
        createdBy: "",
      };

      const result = TaskPacketSchema.safeParse(packet);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("cannot be empty");
      }
    });

    it("rejects invalid context in packet", () => {
      const packet = {
        ...validPacket,
        context: {
          parentTaskId: "invalid-uuid",
        },
      };

      const result = TaskPacketSchema.safeParse(packet);

      expect(result.success).toBe(false);
    });

    it("rejects invalid constraints in packet", () => {
      const packet = {
        ...validPacket,
        constraints: {
          priority: 15, // Out of range
        },
      };

      const result = TaskPacketSchema.safeParse(packet);

      expect(result.success).toBe(false);
    });
  });

  // ============================================
  // createTaskPacket() Factory Function Tests
  // ============================================
  describe("createTaskPacket()", () => {
    const target: DelegationTarget = { kind: "builtin", slug: "coder" };

    it("auto-generates id in UUID format", () => {
      const packet = createTaskPacket("Test task", target, "orchestrator");

      expect(packet.id).toMatch(UUID_REGEX);
    });

    it("generates unique ids for each packet", () => {
      const packet1 = createTaskPacket("Task 1", target, "orchestrator");
      const packet2 = createTaskPacket("Task 2", target, "orchestrator");

      expect(packet1.id).not.toBe(packet2.id);
    });

    it("auto-generates createdAt as Date", () => {
      const beforeCreate = new Date();
      const packet = createTaskPacket("Test task", target, "orchestrator");
      const afterCreate = new Date();

      expect(packet.createdAt).toBeInstanceOf(Date);
      expect(packet.createdAt.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
      expect(packet.createdAt.getTime()).toBeLessThanOrEqual(afterCreate.getTime());
    });

    it("sets task description correctly", () => {
      const packet = createTaskPacket("Implement authentication", target, "orchestrator");

      expect(packet.task).toBe("Implement authentication");
    });

    it("sets target correctly", () => {
      const customTarget: DelegationTarget = {
        kind: "custom",
        slug: "test-writer",
      };

      const packet = createTaskPacket("Test", customTarget, "orchestrator");

      expect(packet.target).toEqual(customTarget);
    });

    it("sets target correctly with custom mode", () => {
      const customModeTarget: DelegationTarget = {
        kind: "custom-mode",
        slug: "custom-worker",
        modeConfig: {
          name: "code",
          description: "Worker",
          tools: { edit: true, bash: true },
          prompt: "Work",
        },
      };

      const packet = createTaskPacket("Test", customModeTarget, "orchestrator");

      expect(packet.target).toEqual(customModeTarget);
    });

    it("sets createdBy correctly", () => {
      const packet = createTaskPacket("Test task", target, "spec-agent");

      expect(packet.createdBy).toBe("spec-agent");
    });

    it("accepts optional context", () => {
      const context = {
        parentTaskId: "550e8400-e29b-41d4-a716-446655440000",
        files: ["src/index.ts"],
      };

      const packet = createTaskPacket("Test", target, "orchestrator", { context });

      expect(packet.context).toEqual(context);
    });

    it("accepts optional constraints", () => {
      const constraints = {
        priority: 8,
        timeout: 60000,
      };

      const packet = createTaskPacket("Test", target, "orchestrator", { constraints });

      expect(packet.constraints).toEqual(constraints);
    });

    it("accepts both context and constraints", () => {
      const options = {
        context: {
          sessionId: "session-123",
        },
        constraints: {
          priority: 5,
        },
      };

      const packet = createTaskPacket("Test", target, "orchestrator", options);

      expect(packet.context?.sessionId).toBe("session-123");
      expect(packet.constraints?.priority).toBe(5);
    });

    it("leaves context undefined when not provided", () => {
      const packet = createTaskPacket("Test", target, "orchestrator");

      expect(packet.context).toBeUndefined();
    });

    it("leaves constraints undefined when not provided", () => {
      const packet = createTaskPacket("Test", target, "orchestrator");

      expect(packet.constraints).toBeUndefined();
    });

    it("creates packet that passes schema validation", () => {
      const packet = createTaskPacket("Valid task", target, "orchestrator", {
        context: { sessionId: "session-1" },
        constraints: { priority: 3 },
      });

      const result = TaskPacketSchema.safeParse(packet);

      expect(result.success).toBe(true);
    });

    it("works with MCP target", () => {
      const mcpTarget: DelegationTarget = {
        kind: "mcp",
        serverId: "github",
        toolName: "create_pr",
        params: { title: "Feature" },
      };

      const packet = createTaskPacket("Create PR", mcpTarget, "orchestrator");

      expect(packet.target.kind).toBe("mcp");
      const result = TaskPacketSchema.safeParse(packet);
      expect(result.success).toBe(true);
    });
  });

  // ============================================
  // Edge Cases
  // ============================================
  describe("Edge Cases", () => {
    it("handles very long task descriptions", () => {
      const longTask = "A".repeat(10000);
      const target: DelegationTarget = { kind: "builtin", slug: "coder" };

      const packet = createTaskPacket(longTask, target, "orchestrator");
      const result = TaskPacketSchema.safeParse(packet);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.task.length).toBe(10000);
      }
    });

    it("handles empty files array in context", () => {
      const context = { files: [] };

      const result = TaskContextSchema.safeParse(context);

      expect(result.success).toBe(true);
    });

    it("handles empty memory object in context", () => {
      const context = { memory: {} };

      const result = TaskContextSchema.safeParse(context);

      expect(result.success).toBe(true);
    });

    it("rejects null packet", () => {
      const result = TaskPacketSchema.safeParse(null);

      expect(result.success).toBe(false);
    });

    it("rejects undefined packet", () => {
      const result = TaskPacketSchema.safeParse(undefined);

      expect(result.success).toBe(false);
    });
  });
});
