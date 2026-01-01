import { describe, expect, it } from "vitest";
import { createUserMessage } from "../message.js";
import {
  addCheckpoint,
  addMessage,
  type CreateSessionOptions,
  createCheckpoint,
  createSession,
  SessionCheckpointSchema,
  type SessionMetadata,
  SessionMetadataSchema,
  type SessionMode,
  SessionModeSchema,
  SessionSchema,
  type SessionStatus,
  SessionStatusSchema,
  updateSessionMetadata,
} from "../types.js";

describe("Session Types", () => {
  // ==========================================================================
  // SessionStatus Schema Tests
  // ==========================================================================
  describe("SessionStatusSchema", () => {
    it("should accept valid status values", () => {
      expect(SessionStatusSchema.parse("active")).toBe("active");
      expect(SessionStatusSchema.parse("paused")).toBe("paused");
      expect(SessionStatusSchema.parse("completed")).toBe("completed");
      expect(SessionStatusSchema.parse("archived")).toBe("archived");
    });

    it("should reject invalid status values", () => {
      expect(() => SessionStatusSchema.parse("invalid")).toThrow();
      expect(() => SessionStatusSchema.parse("")).toThrow();
      expect(() => SessionStatusSchema.parse(123)).toThrow();
    });
  });

  // ==========================================================================
  // SessionMode Schema Tests
  // ==========================================================================
  describe("SessionModeSchema", () => {
    it("should accept valid mode values", () => {
      expect(SessionModeSchema.parse("chat")).toBe("chat");
      expect(SessionModeSchema.parse("code")).toBe("code");
      expect(SessionModeSchema.parse("plan")).toBe("plan");
      expect(SessionModeSchema.parse("debug")).toBe("debug");
      expect(SessionModeSchema.parse("draft")).toBe("draft");
    });

    it("should reject invalid mode values", () => {
      expect(() => SessionModeSchema.parse("invalid")).toThrow();
      expect(() => SessionModeSchema.parse("review")).toThrow();
    });
  });

  // ==========================================================================
  // SessionMetadata Schema Tests
  // ==========================================================================
  describe("SessionMetadataSchema", () => {
    const validMetadata = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      title: "Test Session",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastActive: new Date(),
      status: "active" as SessionStatus,
      mode: "chat" as SessionMode,
      tags: ["test", "example"],
      workingDirectory: "/home/user/project",
      tokenCount: 1000,
      messageCount: 5,
    };

    it("should parse valid metadata", () => {
      const result = SessionMetadataSchema.parse(validMetadata);
      expect(result.id).toBe(validMetadata.id);
      expect(result.title).toBe(validMetadata.title);
      expect(result.status).toBe("active");
      expect(result.mode).toBe("chat");
      expect(result.tags).toEqual(["test", "example"]);
    });

    it("should accept optional summary field", () => {
      const withSummary = { ...validMetadata, summary: "This is a test session" };
      const result = SessionMetadataSchema.parse(withSummary);
      expect(result.summary).toBe("This is a test session");
    });

    it("should coerce string dates to Date objects", () => {
      const withStringDates = {
        ...validMetadata,
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-02T00:00:00Z",
        lastActive: "2025-01-03T00:00:00Z",
      };
      const result = SessionMetadataSchema.parse(withStringDates);
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
      expect(result.lastActive).toBeInstanceOf(Date);
    });

    it("should reject invalid UUID", () => {
      const invalidUUID = { ...validMetadata, id: "not-a-uuid" };
      expect(() => SessionMetadataSchema.parse(invalidUUID)).toThrow();
    });

    it("should reject negative token count", () => {
      const negative = { ...validMetadata, tokenCount: -1 };
      expect(() => SessionMetadataSchema.parse(negative)).toThrow();
    });

    it("should reject negative message count", () => {
      const negative = { ...validMetadata, messageCount: -1 };
      expect(() => SessionMetadataSchema.parse(negative)).toThrow();
    });
  });

  // ==========================================================================
  // SessionCheckpoint Schema Tests
  // ==========================================================================
  describe("SessionCheckpointSchema", () => {
    const validCheckpoint = {
      id: "checkpoint-1",
      sessionId: "550e8400-e29b-41d4-a716-446655440000",
      messageIndex: 5,
      createdAt: new Date(),
    };

    it("should parse valid checkpoint", () => {
      const result = SessionCheckpointSchema.parse(validCheckpoint);
      expect(result.id).toBe("checkpoint-1");
      expect(result.sessionId).toBe("550e8400-e29b-41d4-a716-446655440000");
      expect(result.messageIndex).toBe(5);
    });

    it("should accept optional snapshotHash", () => {
      const withHash = { ...validCheckpoint, snapshotHash: "abc123def456" };
      const result = SessionCheckpointSchema.parse(withHash);
      expect(result.snapshotHash).toBe("abc123def456");
    });

    it("should accept optional description", () => {
      const withDesc = { ...validCheckpoint, description: "Before refactoring" };
      const result = SessionCheckpointSchema.parse(withDesc);
      expect(result.description).toBe("Before refactoring");
    });

    it("should reject negative messageIndex", () => {
      const negative = { ...validCheckpoint, messageIndex: -1 };
      expect(() => SessionCheckpointSchema.parse(negative)).toThrow();
    });

    it("should reject invalid sessionId UUID", () => {
      const invalidUUID = { ...validCheckpoint, sessionId: "not-a-uuid" };
      expect(() => SessionCheckpointSchema.parse(invalidUUID)).toThrow();
    });
  });

  // ==========================================================================
  // Session Schema Tests
  // ==========================================================================
  describe("SessionSchema", () => {
    it("should parse valid session", () => {
      const session = createSession({ title: "Test" });
      const result = SessionSchema.parse(session);
      expect(result.metadata.title).toBe("Test");
      expect(result.messages).toEqual([]);
      expect(result.checkpoints).toEqual([]);
    });
  });

  // ==========================================================================
  // createSession Factory Tests
  // ==========================================================================
  describe("createSession", () => {
    it("should create session with defaults", () => {
      const session = createSession();
      expect(session.metadata.title).toBe("New Session");
      expect(session.metadata.status).toBe("active");
      expect(session.metadata.mode).toBe("chat");
      expect(session.metadata.tags).toEqual([]);
      expect(session.metadata.tokenCount).toBe(0);
      expect(session.metadata.messageCount).toBe(0);
      expect(session.messages).toEqual([]);
      expect(session.checkpoints).toEqual([]);
    });

    it("should create session with custom options", () => {
      const options: CreateSessionOptions = {
        title: "Code Review Session",
        mode: "code",
        workingDirectory: "/projects/myapp",
        tags: ["review", "typescript"],
      };
      const session = createSession(options);
      expect(session.metadata.title).toBe("Code Review Session");
      expect(session.metadata.mode).toBe("code");
      expect(session.metadata.workingDirectory).toBe("/projects/myapp");
      expect(session.metadata.tags).toEqual(["review", "typescript"]);
    });

    it("should generate unique IDs", () => {
      const session1 = createSession();
      const session2 = createSession();
      expect(session1.metadata.id).not.toBe(session2.metadata.id);
    });

    it("should accept custom session ID", () => {
      const customId = "550e8400-e29b-41d4-a716-446655440000";
      const session = createSession({ id: customId });
      expect(session.metadata.id).toBe(customId);
    });

    it("should set timestamps to current time", () => {
      const before = new Date();
      const session = createSession();
      const after = new Date();

      expect(session.metadata.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(session.metadata.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
      expect(session.metadata.updatedAt.getTime()).toBe(session.metadata.createdAt.getTime());
      expect(session.metadata.lastActive.getTime()).toBe(session.metadata.createdAt.getTime());
    });

    it("should include initial messages and update count", () => {
      const messages = [createUserMessage([{ type: "text", text: "Hello" }])];
      const session = createSession({ messages });
      expect(session.messages).toHaveLength(1);
      expect(session.metadata.messageCount).toBe(1);
    });
  });

  // ==========================================================================
  // createCheckpoint Factory Tests
  // ==========================================================================
  describe("createCheckpoint", () => {
    it("should create checkpoint with session reference", () => {
      const session = createSession();
      const checkpoint = createCheckpoint(session);
      expect(checkpoint.sessionId).toBe(session.metadata.id);
      expect(checkpoint.messageIndex).toBe(0);
    });

    it("should capture current message index", () => {
      const session = createSession({
        messages: [
          createUserMessage([{ type: "text", text: "msg1" }]),
          createUserMessage([{ type: "text", text: "msg2" }]),
        ],
      });
      const checkpoint = createCheckpoint(session);
      expect(checkpoint.messageIndex).toBe(2);
    });

    it("should accept optional description", () => {
      const session = createSession();
      const checkpoint = createCheckpoint(session, {
        description: "Before major refactor",
      });
      expect(checkpoint.description).toBe("Before major refactor");
    });

    it("should accept optional snapshotHash", () => {
      const session = createSession();
      const checkpoint = createCheckpoint(session, {
        snapshotHash: "git-snapshot-abc123",
      });
      expect(checkpoint.snapshotHash).toBe("git-snapshot-abc123");
    });

    it("should generate unique checkpoint IDs", () => {
      const session = createSession();
      const cp1 = createCheckpoint(session);
      const cp2 = createCheckpoint(session);
      expect(cp1.id).not.toBe(cp2.id);
    });

    it("should set createdAt to current time", () => {
      const before = new Date();
      const session = createSession();
      const checkpoint = createCheckpoint(session);
      const after = new Date();

      expect(checkpoint.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(checkpoint.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  // ==========================================================================
  // addCheckpoint Helper Tests
  // ==========================================================================
  describe("addCheckpoint", () => {
    it("should add checkpoint immutably", () => {
      const session = createSession();
      const checkpoint = createCheckpoint(session);
      const updated = addCheckpoint(session, checkpoint);

      expect(session.checkpoints).toHaveLength(0);
      expect(updated.checkpoints).toHaveLength(1);
      expect(updated.checkpoints[0]).toBe(checkpoint);
    });

    it("should update updatedAt timestamp", () => {
      const session = createSession();
      const checkpoint = createCheckpoint(session);

      // Wait briefly to ensure timestamps differ
      const updated = addCheckpoint(session, checkpoint);

      expect(updated.metadata.updatedAt.getTime()).toBeGreaterThanOrEqual(
        session.metadata.updatedAt.getTime()
      );
    });
  });

  // ==========================================================================
  // updateSessionMetadata Helper Tests
  // ==========================================================================
  describe("updateSessionMetadata", () => {
    it("should update metadata immutably", () => {
      const session = createSession({ title: "Original" });
      const updated = updateSessionMetadata(session, { title: "Updated" });

      expect(session.metadata.title).toBe("Original");
      expect(updated.metadata.title).toBe("Updated");
    });

    it("should preserve other metadata fields", () => {
      const session = createSession({
        title: "Test",
        mode: "code",
        tags: ["tag1"],
      });
      const updated = updateSessionMetadata(session, { status: "paused" });

      expect(updated.metadata.title).toBe("Test");
      expect(updated.metadata.mode).toBe("code");
      expect(updated.metadata.tags).toEqual(["tag1"]);
      expect(updated.metadata.status).toBe("paused");
    });

    it("should update updatedAt timestamp", () => {
      const session = createSession();
      const updated = updateSessionMetadata(session, { title: "New Title" });

      expect(updated.metadata.updatedAt.getTime()).toBeGreaterThanOrEqual(
        session.metadata.updatedAt.getTime()
      );
    });

    it("should not allow updating id or createdAt", () => {
      const session = createSession();
      // TypeScript should prevent this, but we verify runtime behavior
      const updates: Partial<Omit<SessionMetadata, "id" | "createdAt">> = {
        title: "New",
      };
      const updated = updateSessionMetadata(session, updates);
      expect(updated.metadata.id).toBe(session.metadata.id);
      expect(updated.metadata.createdAt).toBe(session.metadata.createdAt);
    });
  });

  // ==========================================================================
  // addMessage Helper Tests
  // ==========================================================================
  describe("addMessage", () => {
    it("should add message immutably", () => {
      const session = createSession();
      const message = createUserMessage([{ type: "text", text: "Hello" }]);
      const updated = addMessage(session, message);

      expect(session.messages).toHaveLength(0);
      expect(updated.messages).toHaveLength(1);
      expect(updated.messages[0]).toBe(message);
    });

    it("should update messageCount", () => {
      const session = createSession();
      const updated = addMessage(session, createUserMessage([{ type: "text", text: "Hello" }]));

      expect(session.metadata.messageCount).toBe(0);
      expect(updated.metadata.messageCount).toBe(1);
    });

    it("should update lastActive timestamp", () => {
      const session = createSession();
      const updated = addMessage(session, createUserMessage([{ type: "text", text: "Hello" }]));

      expect(updated.metadata.lastActive.getTime()).toBeGreaterThanOrEqual(
        session.metadata.lastActive.getTime()
      );
    });

    it("should accumulate token counts from messages", () => {
      const session = createSession();
      const message = createUserMessage([{ type: "text", text: "Hello" }]);
      message.metadata.tokens = { input: 100, output: 50 };

      const updated = addMessage(session, message);
      expect(updated.metadata.tokenCount).toBe(150);
    });
  });
});
