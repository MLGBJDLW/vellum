// ============================================
// Handoff Protocol Tests
// ============================================
// REQ-016: Agent-to-agent handoff protocol for result passing

import { describe, expect, it } from "vitest";
import {
  createHandoff,
  type HandoffRequest,
  HandoffRequestSchema,
  type HandoffResult,
  HandoffResultSchema,
} from "../handoff.js";

// UUID regex pattern for validation
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("Handoff Protocol", () => {
  // ============================================
  // HandoffRequestSchema Tests
  // ============================================
  describe("HandoffRequestSchema", () => {
    const validRequest: HandoffRequest = {
      requestId: "550e8400-e29b-41d4-a716-446655440000",
      fromAgent: "coder",
      toAgent: "qa",
      taskPacketId: "660e8400-e29b-41d4-a716-446655440001",
      reason: "Code implementation complete, needs testing",
      preserveContext: true,
      createdAt: new Date(),
    };

    it("validates correct handoff request with all fields", () => {
      const result = HandoffRequestSchema.safeParse(validRequest);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.requestId).toBe(validRequest.requestId);
        expect(result.data.fromAgent).toBe("coder");
        expect(result.data.toAgent).toBe("qa");
        expect(result.data.taskPacketId).toBe(validRequest.taskPacketId);
        expect(result.data.reason).toBe("Code implementation complete, needs testing");
        expect(result.data.preserveContext).toBe(true);
      }
    });

    it("validates request with preserveContext false", () => {
      const request = {
        ...validRequest,
        preserveContext: false,
      };

      const result = HandoffRequestSchema.safeParse(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.preserveContext).toBe(false);
      }
    });

    it("validates various agent slug combinations", () => {
      const agentPairs = [
        ["orchestrator", "coder"],
        ["coder", "qa"],
        ["qa", "writer"],
        ["writer", "orchestrator"],
        ["analyst", "architect"],
      ];

      for (const [from, to] of agentPairs) {
        const request = {
          ...validRequest,
          fromAgent: from,
          toAgent: to,
        };

        const result = HandoffRequestSchema.safeParse(request);
        expect(result.success).toBe(true);
      }
    });

    it("rejects invalid requestId (not UUID)", () => {
      const request = {
        ...validRequest,
        requestId: "not-a-uuid",
      };

      const result = HandoffRequestSchema.safeParse(request);

      expect(result.success).toBe(false);
    });

    it("rejects empty fromAgent", () => {
      const request = {
        ...validRequest,
        fromAgent: "",
      };

      const result = HandoffRequestSchema.safeParse(request);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("cannot be empty");
      }
    });

    it("rejects empty toAgent", () => {
      const request = {
        ...validRequest,
        toAgent: "",
      };

      const result = HandoffRequestSchema.safeParse(request);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("cannot be empty");
      }
    });

    it("rejects invalid taskPacketId (not UUID)", () => {
      const request = {
        ...validRequest,
        taskPacketId: "invalid-id",
      };

      const result = HandoffRequestSchema.safeParse(request);

      expect(result.success).toBe(false);
    });

    it("rejects empty reason", () => {
      const request = {
        ...validRequest,
        reason: "",
      };

      const result = HandoffRequestSchema.safeParse(request);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("cannot be empty");
      }
    });

    it("rejects missing preserveContext", () => {
      const { preserveContext, ...requestWithoutPreserveContext } = validRequest;

      const result = HandoffRequestSchema.safeParse(requestWithoutPreserveContext);

      expect(result.success).toBe(false);
    });

    it("rejects non-boolean preserveContext", () => {
      const request = {
        ...validRequest,
        preserveContext: "true", // String, not boolean
      };

      const result = HandoffRequestSchema.safeParse(request);

      expect(result.success).toBe(false);
    });

    it("rejects missing createdAt", () => {
      const { createdAt, ...requestWithoutCreatedAt } = validRequest;

      const result = HandoffRequestSchema.safeParse(requestWithoutCreatedAt);

      expect(result.success).toBe(false);
    });

    it("rejects invalid createdAt (not Date)", () => {
      const request = {
        ...validRequest,
        createdAt: "2024-01-01T00:00:00Z", // String, not Date
      };

      const result = HandoffRequestSchema.safeParse(request);

      expect(result.success).toBe(false);
    });
  });

  // ============================================
  // HandoffResultSchema Tests
  // ============================================
  describe("HandoffResultSchema", () => {
    describe("Accepted Cases", () => {
      it("validates accepted handoff with targetAgentId", () => {
        const result: HandoffResult = {
          requestId: "550e8400-e29b-41d4-a716-446655440000",
          accepted: true,
          targetAgentId: "qa-instance-001",
          completedAt: new Date(),
        };

        const parseResult = HandoffResultSchema.safeParse(result);

        expect(parseResult.success).toBe(true);
        if (parseResult.success) {
          expect(parseResult.data.accepted).toBe(true);
          expect(parseResult.data.targetAgentId).toBe("qa-instance-001");
          expect(parseResult.data.rejectionReason).toBeUndefined();
        }
      });

      it("validates accepted handoff without targetAgentId", () => {
        // Schema allows this even though semantically it might be odd
        const result: HandoffResult = {
          requestId: "550e8400-e29b-41d4-a716-446655440000",
          accepted: true,
          completedAt: new Date(),
        };

        const parseResult = HandoffResultSchema.safeParse(result);

        expect(parseResult.success).toBe(true);
      });
    });

    describe("Rejected Cases", () => {
      it("validates rejected handoff with rejectionReason", () => {
        const result: HandoffResult = {
          requestId: "550e8400-e29b-41d4-a716-446655440000",
          accepted: false,
          rejectionReason: "Target agent unavailable",
          completedAt: new Date(),
        };

        const parseResult = HandoffResultSchema.safeParse(result);

        expect(parseResult.success).toBe(true);
        if (parseResult.success) {
          expect(parseResult.data.accepted).toBe(false);
          expect(parseResult.data.rejectionReason).toBe("Target agent unavailable");
          expect(parseResult.data.targetAgentId).toBeUndefined();
        }
      });

      it("validates rejected handoff without rejectionReason", () => {
        // Schema allows this even though semantically it might be odd
        const result: HandoffResult = {
          requestId: "550e8400-e29b-41d4-a716-446655440000",
          accepted: false,
          completedAt: new Date(),
        };

        const parseResult = HandoffResultSchema.safeParse(result);

        expect(parseResult.success).toBe(true);
      });

      it("validates rejected handoff with various rejection reasons", () => {
        const reasons = [
          "Target agent unavailable",
          "Resource limit exceeded",
          "Permission denied",
          "Invalid task packet",
          "Agent is busy",
        ];

        for (const reason of reasons) {
          const result: HandoffResult = {
            requestId: "550e8400-e29b-41d4-a716-446655440000",
            accepted: false,
            rejectionReason: reason,
            completedAt: new Date(),
          };

          const parseResult = HandoffResultSchema.safeParse(result);
          expect(parseResult.success).toBe(true);
        }
      });
    });

    describe("Validation Errors", () => {
      it("rejects invalid requestId (not UUID)", () => {
        const result = {
          requestId: "not-a-uuid",
          accepted: true,
          completedAt: new Date(),
        };

        const parseResult = HandoffResultSchema.safeParse(result);

        expect(parseResult.success).toBe(false);
      });

      it("rejects missing accepted field", () => {
        const result = {
          requestId: "550e8400-e29b-41d4-a716-446655440000",
          completedAt: new Date(),
        };

        const parseResult = HandoffResultSchema.safeParse(result);

        expect(parseResult.success).toBe(false);
      });

      it("rejects non-boolean accepted field", () => {
        const result = {
          requestId: "550e8400-e29b-41d4-a716-446655440000",
          accepted: "true",
          completedAt: new Date(),
        };

        const parseResult = HandoffResultSchema.safeParse(result);

        expect(parseResult.success).toBe(false);
      });

      it("rejects missing completedAt", () => {
        const result = {
          requestId: "550e8400-e29b-41d4-a716-446655440000",
          accepted: true,
        };

        const parseResult = HandoffResultSchema.safeParse(result);

        expect(parseResult.success).toBe(false);
      });

      it("rejects invalid completedAt (not Date)", () => {
        const result = {
          requestId: "550e8400-e29b-41d4-a716-446655440000",
          accepted: true,
          completedAt: "2024-01-01",
        };

        const parseResult = HandoffResultSchema.safeParse(result);

        expect(parseResult.success).toBe(false);
      });
    });
  });

  // ============================================
  // createHandoff() Factory Function Tests
  // ============================================
  describe("createHandoff()", () => {
    const taskPacketId = "660e8400-e29b-41d4-a716-446655440001";

    it("auto-generates requestId in UUID format", () => {
      const request = createHandoff("coder", "qa", taskPacketId, "Testing needed");

      expect(request.requestId).toMatch(UUID_REGEX);
    });

    it("generates unique requestIds for each handoff", () => {
      const request1 = createHandoff("coder", "qa", taskPacketId, "Reason 1");
      const request2 = createHandoff("coder", "qa", taskPacketId, "Reason 2");

      expect(request1.requestId).not.toBe(request2.requestId);
    });

    it("auto-generates createdAt as Date", () => {
      const beforeCreate = new Date();
      const request = createHandoff("coder", "qa", taskPacketId, "Testing needed");
      const afterCreate = new Date();

      expect(request.createdAt).toBeInstanceOf(Date);
      expect(request.createdAt.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
      expect(request.createdAt.getTime()).toBeLessThanOrEqual(afterCreate.getTime());
    });

    it("sets fromAgent correctly", () => {
      const request = createHandoff("coder", "qa", taskPacketId, "Testing needed");

      expect(request.fromAgent).toBe("coder");
    });

    it("sets toAgent correctly", () => {
      const request = createHandoff("coder", "qa", taskPacketId, "Testing needed");

      expect(request.toAgent).toBe("qa");
    });

    it("sets taskPacketId correctly", () => {
      const request = createHandoff("coder", "qa", taskPacketId, "Testing needed");

      expect(request.taskPacketId).toBe(taskPacketId);
    });

    it("sets reason correctly", () => {
      const request = createHandoff("coder", "qa", taskPacketId, "Code complete, needs testing");

      expect(request.reason).toBe("Code complete, needs testing");
    });

    it("defaults preserveContext to true", () => {
      const request = createHandoff("coder", "qa", taskPacketId, "Testing needed");

      expect(request.preserveContext).toBe(true);
    });

    it("allows overriding preserveContext to false", () => {
      const request = createHandoff("coder", "qa", taskPacketId, "Fresh start", false);

      expect(request.preserveContext).toBe(false);
    });

    it("allows explicit preserveContext true", () => {
      const request = createHandoff("coder", "qa", taskPacketId, "With context", true);

      expect(request.preserveContext).toBe(true);
    });

    it("creates handoff that passes schema validation", () => {
      const request = createHandoff("coder", "qa", taskPacketId, "Testing needed");

      const result = HandoffRequestSchema.safeParse(request);

      expect(result.success).toBe(true);
    });

    it("creates handoff with preserveContext=false that passes validation", () => {
      const request = createHandoff("orchestrator", "coder", taskPacketId, "New task", false);

      const result = HandoffRequestSchema.safeParse(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.preserveContext).toBe(false);
      }
    });

    it("works with various agent slug combinations", () => {
      const combinations: [string, string][] = [
        ["orchestrator", "coder"],
        ["coder", "qa"],
        ["qa", "writer"],
        ["writer", "devops"],
        ["devops", "security"],
        ["security", "architect"],
        ["architect", "analyst"],
      ];

      for (const [from, to] of combinations) {
        const request = createHandoff(from, to, taskPacketId, `Handoff from ${from} to ${to}`);

        expect(request.fromAgent).toBe(from);
        expect(request.toAgent).toBe(to);

        const result = HandoffRequestSchema.safeParse(request);
        expect(result.success).toBe(true);
      }
    });
  });

  // ============================================
  // Edge Cases
  // ============================================
  describe("Edge Cases", () => {
    it("handles very long reason strings", () => {
      const longReason = "R".repeat(10000);
      const request = createHandoff(
        "coder",
        "qa",
        "660e8400-e29b-41d4-a716-446655440001",
        longReason
      );

      const result = HandoffRequestSchema.safeParse(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.reason.length).toBe(10000);
      }
    });

    it("handles agent slugs with special characters", () => {
      const request = createHandoff(
        "custom-agent-v2",
        "worker_specialized",
        "660e8400-e29b-41d4-a716-446655440001",
        "Testing"
      );

      const result = HandoffRequestSchema.safeParse(request);

      expect(result.success).toBe(true);
    });

    it("rejects null request", () => {
      const result = HandoffRequestSchema.safeParse(null);

      expect(result.success).toBe(false);
    });

    it("rejects undefined request", () => {
      const result = HandoffRequestSchema.safeParse(undefined);

      expect(result.success).toBe(false);
    });

    it("rejects null result", () => {
      const result = HandoffResultSchema.safeParse(null);

      expect(result.success).toBe(false);
    });

    it("rejects undefined result", () => {
      const result = HandoffResultSchema.safeParse(undefined);

      expect(result.success).toBe(false);
    });

    it("handles result with both targetAgentId and rejectionReason", () => {
      // Schema allows this even though it's semantically odd
      const result: HandoffResult = {
        requestId: "550e8400-e29b-41d4-a716-446655440000",
        accepted: true,
        targetAgentId: "agent-001",
        rejectionReason: "This shouldn't happen",
        completedAt: new Date(),
      };

      const parseResult = HandoffResultSchema.safeParse(result);

      // Schema allows it (no refinement to prevent this)
      expect(parseResult.success).toBe(true);
    });

    it("validates handoff request with same fromAgent and toAgent", () => {
      // Schema doesn't prevent self-handoff (business logic concern)
      const request = {
        requestId: "550e8400-e29b-41d4-a716-446655440000",
        fromAgent: "coder",
        toAgent: "coder",
        taskPacketId: "660e8400-e29b-41d4-a716-446655440001",
        reason: "Self-delegation",
        preserveContext: true,
        createdAt: new Date(),
      };

      const result = HandoffRequestSchema.safeParse(request);

      // Schema allows it (business logic should prevent this)
      expect(result.success).toBe(true);
    });
  });
});
