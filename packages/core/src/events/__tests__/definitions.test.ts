// ============================================
// T055 - Event Definitions Tests
// ============================================

import { describe, expect, it } from "vitest";
import {
  type EventPayload,
  Events,
  errorEvent,
  messageCreated,
  messageUpdated,
  sessionEnd,
  sessionStart,
  streamEnd,
  streamToken,
  toolEnd,
  toolStart,
  toolStateChange,
} from "../definitions.js";

describe("Event Definitions", () => {
  // ============================================
  // Structure Tests - All events are valid EventDefinitions
  // ============================================

  describe("structure validation", () => {
    it("should have all events as valid EventDefinitions", () => {
      const eventKeys = Object.keys(Events) as (keyof typeof Events)[];

      for (const key of eventKeys) {
        const event = Events[key];
        expect(event).toHaveProperty("name");
        expect(event).toHaveProperty("schema");
        expect(typeof event.name).toBe("string");
        expect(event.schema).toBeDefined();
      }
    });

    it("should have unique event names", () => {
      const names = Object.values(Events).map((e) => e.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });

    it("should follow naming convention (namespace:action)", () => {
      const eventKeys = Object.keys(Events) as (keyof typeof Events)[];

      for (const key of eventKeys) {
        const event = Events[key];
        // All events except 'error' follow namespace:action pattern
        // Action part can include hyphens (e.g., circuit:half-open)
        if (key !== "error") {
          expect(event.name).toMatch(/^[a-z]+:[a-zA-Z-]+$/);
        }
      }
    });
  });

  // ============================================
  // T051 - Message Events Tests
  // ============================================

  describe("message events", () => {
    const validMessage = {
      id: "msg_123",
      role: "assistant" as const,
      content: [{ type: "text" as const, content: "Hello!" }],
      createdAt: new Date().toISOString(),
    };

    describe("messageCreated", () => {
      it("should have correct event name", () => {
        expect(messageCreated.name).toBe("message:created");
      });

      it("should validate correct payload", () => {
        const payload = { message: validMessage };
        const result = messageCreated.schema.safeParse(payload);
        expect(result.success).toBe(true);
      });

      it("should reject payload without message", () => {
        const result = messageCreated.schema.safeParse({});
        expect(result.success).toBe(false);
      });

      it("should reject invalid message structure", () => {
        const result = messageCreated.schema.safeParse({
          message: { invalid: true },
        });
        expect(result.success).toBe(false);
      });
    });

    describe("messageUpdated", () => {
      it("should have correct event name", () => {
        expect(messageUpdated.name).toBe("message:updated");
      });

      it("should validate payload with message only", () => {
        const payload = { message: validMessage };
        const result = messageUpdated.schema.safeParse(payload);
        expect(result.success).toBe(true);
      });

      it("should validate payload with previousContent", () => {
        const payload = {
          message: validMessage,
          previousContent: [{ type: "text" as const, content: "Old content" }],
        };
        const result = messageUpdated.schema.safeParse(payload);
        expect(result.success).toBe(true);
      });

      it("should reject invalid previousContent", () => {
        const payload = {
          message: validMessage,
          previousContent: [{ invalid: true }],
        };
        const result = messageUpdated.schema.safeParse(payload);
        expect(result.success).toBe(false);
      });
    });
  });

  // ============================================
  // T052 - Tool Events Tests
  // ============================================

  describe("tool events", () => {
    describe("toolStart", () => {
      it("should have correct event name", () => {
        expect(toolStart.name).toBe("tool:start");
      });

      it("should validate correct payload", () => {
        const payload = {
          callId: "call_123",
          name: "read_file",
          input: { path: "/test.txt" },
        };
        const result = toolStart.schema.safeParse(payload);
        expect(result.success).toBe(true);
      });

      it("should accept unknown input types", () => {
        const payloads = [
          { callId: "1", name: "tool", input: null },
          { callId: "2", name: "tool", input: [1, 2, 3] },
          { callId: "3", name: "tool", input: "string" },
          { callId: "4", name: "tool", input: { nested: { deep: true } } },
        ];

        for (const payload of payloads) {
          const result = toolStart.schema.safeParse(payload);
          expect(result.success).toBe(true);
        }
      });

      it("should reject missing required fields", () => {
        const invalid = [
          { name: "tool", input: {} }, // missing callId
          { callId: "1", input: {} }, // missing name
          { callId: "1", name: "tool" }, // missing input is actually OK since it's unknown
        ];

        expect(toolStart.schema.safeParse(invalid[0]).success).toBe(false);
        expect(toolStart.schema.safeParse(invalid[1]).success).toBe(false);
      });
    });

    describe("toolStateChange", () => {
      it("should have correct event name", () => {
        expect(toolStateChange.name).toBe("tool:stateChange");
      });

      it("should validate all tool states", () => {
        const states = [
          { status: "pending" as const },
          { status: "running" as const, startedAt: Date.now() },
          { status: "completed" as const, completedAt: Date.now() },
          { status: "error" as const, error: "Failed", failedAt: Date.now() },
        ];

        for (const state of states) {
          const payload = { callId: "call_123", state };
          const result = toolStateChange.schema.safeParse(payload);
          expect(result.success).toBe(true);
        }
      });

      it("should reject invalid tool state", () => {
        const payload = {
          callId: "call_123",
          state: { status: "invalid" },
        };
        const result = toolStateChange.schema.safeParse(payload);
        expect(result.success).toBe(false);
      });
    });

    describe("toolEnd", () => {
      it("should have correct event name", () => {
        expect(toolEnd.name).toBe("tool:end");
      });

      it("should validate correct payload", () => {
        const payload = {
          callId: "call_123",
          result: { content: "File contents" },
          durationMs: 150,
        };
        const result = toolEnd.schema.safeParse(payload);
        expect(result.success).toBe(true);
      });

      it("should reject non-numeric duration", () => {
        const payload = {
          callId: "call_123",
          result: null,
          durationMs: "150",
        };
        const result = toolEnd.schema.safeParse(payload);
        expect(result.success).toBe(false);
      });
    });
  });

  // ============================================
  // T053 - Stream Events Tests
  // ============================================

  describe("stream events", () => {
    describe("streamToken", () => {
      it("should have correct event name", () => {
        expect(streamToken.name).toBe("stream:token");
      });

      it("should validate correct payload", () => {
        const payload = {
          messageId: "msg_123",
          token: "Hello",
        };
        const result = streamToken.schema.safeParse(payload);
        expect(result.success).toBe(true);
      });

      it("should accept empty token", () => {
        const payload = {
          messageId: "msg_123",
          token: "",
        };
        const result = streamToken.schema.safeParse(payload);
        expect(result.success).toBe(true);
      });

      it("should reject non-string token", () => {
        const payload = {
          messageId: "msg_123",
          token: 123,
        };
        const result = streamToken.schema.safeParse(payload);
        expect(result.success).toBe(false);
      });
    });

    describe("streamEnd", () => {
      it("should have correct event name", () => {
        expect(streamEnd.name).toBe("stream:end");
      });

      it("should validate all end reasons", () => {
        const reasons = ["complete", "cancelled", "error"] as const;

        for (const reason of reasons) {
          const payload = { messageId: "msg_123", reason };
          const result = streamEnd.schema.safeParse(payload);
          expect(result.success).toBe(true);
        }
      });

      it("should reject invalid reason", () => {
        const payload = {
          messageId: "msg_123",
          reason: "timeout",
        };
        const result = streamEnd.schema.safeParse(payload);
        expect(result.success).toBe(false);
      });
    });
  });

  // ============================================
  // T054 - Session and Error Events Tests
  // ============================================

  describe("session events", () => {
    describe("sessionStart", () => {
      it("should have correct event name", () => {
        expect(sessionStart.name).toBe("session:start");
      });

      it("should validate correct payload", () => {
        const payload = {
          sessionId: "session_123",
          startedAt: new Date().toISOString(),
        };
        const result = sessionStart.schema.safeParse(payload);
        expect(result.success).toBe(true);
      });

      it("should reject missing sessionId", () => {
        const payload = {
          startedAt: new Date().toISOString(),
        };
        const result = sessionStart.schema.safeParse(payload);
        expect(result.success).toBe(false);
      });
    });

    describe("sessionEnd", () => {
      it("should have correct event name", () => {
        expect(sessionEnd.name).toBe("session:end");
      });

      it("should validate all end reasons", () => {
        const reasons = ["complete", "cancelled", "error"] as const;

        for (const reason of reasons) {
          const payload = {
            sessionId: "session_123",
            endedAt: new Date().toISOString(),
            reason,
          };
          const result = sessionEnd.schema.safeParse(payload);
          expect(result.success).toBe(true);
        }
      });

      it("should reject invalid reason", () => {
        const payload = {
          sessionId: "session_123",
          endedAt: new Date().toISOString(),
          reason: "timeout",
        };
        const result = sessionEnd.schema.safeParse(payload);
        expect(result.success).toBe(false);
      });
    });
  });

  describe("error event", () => {
    it("should have correct event name", () => {
      expect(errorEvent.name).toBe("error");
    });

    it("should validate payload with Error instance", () => {
      const payload = {
        error: new Error("Something went wrong"),
        context: { operation: "file_read", path: "/test.txt" },
      };
      const result = errorEvent.schema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it("should validate payload without context", () => {
      const payload = {
        error: new Error("Something went wrong"),
      };
      const result = errorEvent.schema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it("should reject non-Error error field", () => {
      const payload = {
        error: "This is a string, not an Error",
      };
      const result = errorEvent.schema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("should reject plain object as error", () => {
      const payload = {
        error: { message: "Fake error" },
      };
      const result = errorEvent.schema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  // ============================================
  // EventPayload Type Helper Tests
  // ============================================

  describe("EventPayload type helper", () => {
    it("should correctly type message payloads", () => {
      // Type-level test - if this compiles, the types work
      const payload: EventPayload<"messageCreated"> = {
        message: {
          id: "msg_123",
          role: "user",
          content: [{ type: "text", content: "Hello" }],
          createdAt: new Date().toISOString(),
        },
      };
      expect(payload.message.id).toBe("msg_123");
    });

    it("should correctly type tool payloads", () => {
      const payload: EventPayload<"toolStart"> = {
        callId: "call_123",
        name: "read_file",
        input: { path: "/test.txt" },
      };
      expect(payload.callId).toBe("call_123");
    });

    it("should correctly type stream payloads", () => {
      const payload: EventPayload<"streamEnd"> = {
        messageId: "msg_123",
        reason: "complete",
      };
      expect(payload.reason).toBe("complete");
    });
  });

  // ============================================
  // Events Object Completeness Tests
  // ============================================

  describe("Events object completeness", () => {
    it("should contain all expected events", () => {
      const expectedEvents = [
        "messageCreated",
        "messageUpdated",
        "toolStart",
        "toolStateChange",
        "toolEnd",
        "streamToken",
        "streamEnd",
        "sessionStart",
        "sessionEnd",
        "error",
        // T034 - Credential events
        "credentialResolved",
        "credentialStored",
        "credentialRotated",
        "credentialNotFound",
        // T029 - Agent loop events
        "agentStateChange",
        "agentText",
        "agentThinking",
        "agentToolStart",
        "agentToolEnd",
        "agentTerminated",
        "agentShutdownComplete",
        // T010 - Git snapshot events
        "gitSnapshotCreated",
        "gitSnapshotRestored",
        "gitSnapshotReverted",
        // T038 - Circuit breaker events
        "circuitOpen",
        "circuitClose",
        "circuitHalfOpen",
      ];

      for (const eventName of expectedEvents) {
        expect(Events).toHaveProperty(eventName);
      }
    });

    it("should have exactly 27 events", () => {
      expect(Object.keys(Events)).toHaveLength(27);
    });
  });
});
