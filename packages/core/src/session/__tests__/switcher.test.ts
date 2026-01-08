import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { PersistenceManager } from "../persistence.js";
import type { StorageManager } from "../storage.js";
import { SessionSwitcher } from "../switcher.js";
import { createSession, type Session } from "../types.js";

// =============================================================================
// Mock StorageManager
// =============================================================================

function createMockStorageManager(): {
  mock: StorageManager;
  save: Mock;
  load: Mock;
  exists: Mock;
} {
  const save = vi.fn().mockResolvedValue(undefined);
  const load = vi.fn();
  const exists = vi.fn().mockResolvedValue(true);

  const mock = {
    save,
    load,
    exists,
    getConfig: vi.fn().mockReturnValue({ basePath: "/mock/path" }),
    getIndex: vi.fn().mockResolvedValue(new Map()),
    delete: vi.fn().mockResolvedValue(undefined),
  } as unknown as StorageManager;

  return { mock, save, load, exists };
}

// =============================================================================
// Test Session Factory
// =============================================================================

function createTestSession(overrides: Partial<Session["metadata"]> = {}): Session {
  return createSession({
    title: overrides.title ?? "Test Session",
    mode: overrides.mode ?? "chat",
    workingDirectory: overrides.workingDirectory ?? "/test/path",
    ...overrides,
  });
}

// =============================================================================
// SessionSwitcher Tests
// =============================================================================

describe("SessionSwitcher", () => {
  let storage: ReturnType<typeof createMockStorageManager>;
  let persistence: PersistenceManager;
  let switcher: SessionSwitcher;

  beforeEach(() => {
    vi.useFakeTimers();
    storage = createMockStorageManager();
    persistence = new PersistenceManager(storage.mock, { autoSaveEnabled: false });
    switcher = new SessionSwitcher(persistence);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // ===========================================================================
  // Constructor Tests
  // ===========================================================================

  describe("constructor", () => {
    it("should create SessionSwitcher with persistence manager", () => {
      const sw = new SessionSwitcher(persistence);
      expect(sw.currentSessionId).toBeNull();
      expect(sw.currentSession).toBeNull();
    });

    it("should start with empty history", () => {
      const sw = new SessionSwitcher(persistence);
      expect(sw.getHistory()).toEqual([]);
    });
  });

  // ===========================================================================
  // currentSessionId Property Tests
  // ===========================================================================

  describe("currentSessionId", () => {
    it("should return null when no session is active", () => {
      expect(switcher.currentSessionId).toBeNull();
    });

    it("should return session ID when a session is active", async () => {
      const session = await switcher.createNewSession({ title: "Active Session" });
      expect(switcher.currentSessionId).toBe(session.metadata.id);
    });
  });

  // ===========================================================================
  // createNewSession Tests
  // ===========================================================================

  describe("createNewSession", () => {
    it("should create a new session with default options", async () => {
      const session = await switcher.createNewSession();

      expect(session).toBeDefined();
      expect(session.metadata.title).toBe("New Session");
      expect(session.metadata.status).toBe("active");
      expect(switcher.currentSessionId).toBe(session.metadata.id);
    });

    it("should create a new session with custom options", async () => {
      const session = await switcher.createNewSession({
        title: "Custom Session",
        mode: "code",
        tags: ["test", "custom"],
      });

      expect(session.metadata.title).toBe("Custom Session");
      expect(session.metadata.mode).toBe("code");
      expect(session.metadata.tags).toEqual(["test", "custom"]);
    });

    it("should save current session before creating new one", async () => {
      // Create first session
      await switcher.createNewSession({ title: "Session 1" });
      storage.save.mockClear();

      // Create second session - should save first
      await switcher.createNewSession({ title: "Session 2" });

      // First call is to save session1, second is to save session2
      expect(storage.save).toHaveBeenCalled();
    });

    it("should emit newSession event", async () => {
      const newSessionHandler = vi.fn();
      switcher.on("newSession", newSessionHandler);

      const session = await switcher.createNewSession();

      expect(newSessionHandler).toHaveBeenCalledWith(session.metadata.id);
    });

    it("should emit switch event", async () => {
      const switchHandler = vi.fn();
      switcher.on("switch", switchHandler);

      const session = await switcher.createNewSession();

      expect(switchHandler).toHaveBeenCalledWith(null, session.metadata.id);
    });

    it("should emit switch event with previous session ID", async () => {
      const session1 = await switcher.createNewSession({ title: "Session 1" });

      const switchHandler = vi.fn();
      switcher.on("switch", switchHandler);

      const session2 = await switcher.createNewSession({ title: "Session 2" });

      expect(switchHandler).toHaveBeenCalledWith(session1.metadata.id, session2.metadata.id);
    });

    it("should add new session to history", async () => {
      const session = await switcher.createNewSession();

      const history = switcher.getHistory();
      expect(history).toContain(session.metadata.id);
      expect(history[0]).toBe(session.metadata.id);
    });
  });

  // ===========================================================================
  // switchTo Tests
  // ===========================================================================

  describe("switchTo", () => {
    it("should switch to an existing session", async () => {
      const existingSession = createTestSession({ title: "Existing Session" });
      storage.load.mockResolvedValue(existingSession);

      const session = await switcher.switchTo(existingSession.metadata.id);

      expect(session.metadata.id).toBe(existingSession.metadata.id);
      expect(switcher.currentSessionId).toBe(existingSession.metadata.id);
    });

    it("should save current session before switching", async () => {
      // Create initial session
      await switcher.createNewSession({ title: "Initial" });
      storage.save.mockClear();

      // Switch to another session
      const targetSession = createTestSession({ title: "Target" });
      storage.load.mockResolvedValue(targetSession);

      await switcher.switchTo(targetSession.metadata.id);

      // Should have saved the initial session
      expect(storage.save).toHaveBeenCalled();
    });

    it("should update lastActive timestamp on switched session", async () => {
      const targetSession = createTestSession({ title: "Target" });
      const originalLastActive = targetSession.metadata.lastActive;
      storage.load.mockResolvedValue(targetSession);

      // Advance time
      vi.advanceTimersByTime(1000);

      const session = await switcher.switchTo(targetSession.metadata.id);

      // lastActive should be updated (session is mutated by updateSessionMetadata)
      expect(session.metadata.lastActive.getTime()).toBeGreaterThan(originalLastActive.getTime());
    });

    it("should emit switch event", async () => {
      // Create initial session
      const session1 = await switcher.createNewSession({ title: "Session 1" });

      const switchHandler = vi.fn();
      switcher.on("switch", switchHandler);

      // Switch to another session
      const session2 = createTestSession({ title: "Session 2" });
      storage.load.mockResolvedValue(session2);

      await switcher.switchTo(session2.metadata.id);

      expect(switchHandler).toHaveBeenCalledWith(session1.metadata.id, session2.metadata.id);
    });

    it("should add switched session to history", async () => {
      const targetSession = createTestSession({ title: "Target" });
      storage.load.mockResolvedValue(targetSession);

      await switcher.switchTo(targetSession.metadata.id);

      const history = switcher.getHistory();
      expect(history).toContain(targetSession.metadata.id);
      expect(history[0]).toBe(targetSession.metadata.id);
    });

    it("should return current session if already on target session", async () => {
      const session = await switcher.createNewSession({ title: "Current" });
      storage.load.mockClear();

      const result = await switcher.switchTo(session.metadata.id);

      expect(result.metadata.id).toBe(session.metadata.id);
      // Should not have called load since we're already on this session
      expect(storage.load).not.toHaveBeenCalled();
    });

    it("should throw error if session does not exist", async () => {
      storage.load.mockRejectedValue(new Error("Session not found"));

      await expect(switcher.switchTo("non-existent-id")).rejects.toThrow("Session not found");
    });

    it("should not emit switch event if switching to same session", async () => {
      const session = await switcher.createNewSession({ title: "Current" });

      const switchHandler = vi.fn();
      switcher.on("switch", switchHandler);
      switchHandler.mockClear();

      await switcher.switchTo(session.metadata.id);

      expect(switchHandler).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // getHistory Tests
  // ===========================================================================

  describe("getHistory", () => {
    it("should return empty array initially", () => {
      expect(switcher.getHistory()).toEqual([]);
    });

    it("should track session switches in order", async () => {
      const session1 = await switcher.createNewSession({ title: "Session 1" });

      const session2 = createTestSession({ title: "Session 2" });
      storage.load.mockResolvedValue(session2);
      await switcher.switchTo(session2.metadata.id);

      const session3 = createTestSession({ title: "Session 3" });
      storage.load.mockResolvedValue(session3);
      await switcher.switchTo(session3.metadata.id);

      const history = switcher.getHistory();
      expect(history[0]).toBe(session3.metadata.id);
      expect(history[1]).toBe(session2.metadata.id);
      expect(history[2]).toBe(session1.metadata.id);
    });

    it("should limit history to 10 sessions", async () => {
      // Create 12 sessions
      for (let i = 0; i < 12; i++) {
        await switcher.createNewSession({ title: `Session ${i}` });
      }

      const history = switcher.getHistory();
      expect(history.length).toBe(10);
    });

    it("should move session to front when switched to again", async () => {
      const session1 = await switcher.createNewSession({ title: "Session 1" });

      const session2 = createTestSession({ title: "Session 2" });
      storage.load.mockResolvedValue(session2);
      await switcher.switchTo(session2.metadata.id);

      // Switch back to session1
      storage.load.mockResolvedValue(
        createSession({ id: session1.metadata.id, title: "Session 1" })
      );
      await switcher.switchTo(session1.metadata.id);

      const history = switcher.getHistory();
      expect(history[0]).toBe(session1.metadata.id);
      expect(history[1]).toBe(session2.metadata.id);
    });

    it("should return a copy of history array", () => {
      // History should be immutable from outside
      const history1 = switcher.getHistory();
      const history2 = switcher.getHistory();
      expect(history1).not.toBe(history2);
    });
  });

  // ===========================================================================
  // clearHistory Tests
  // ===========================================================================

  describe("clearHistory", () => {
    it("should clear all history", async () => {
      await switcher.createNewSession({ title: "Session 1" });
      await switcher.createNewSession({ title: "Session 2" });

      expect(switcher.getHistory().length).toBe(2);

      switcher.clearHistory();

      expect(switcher.getHistory()).toEqual([]);
    });
  });

  // ===========================================================================
  // Event Tests
  // ===========================================================================

  describe("events", () => {
    it("should emit events in correct order on createNewSession", async () => {
      const events: string[] = [];

      switcher.on("newSession", () => events.push("newSession"));
      switcher.on("switch", () => events.push("switch"));

      await switcher.createNewSession();

      expect(events).toEqual(["newSession", "switch"]);
    });

    it("should support multiple event listeners", async () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      switcher.on("newSession", listener1);
      switcher.on("newSession", listener2);

      await switcher.createNewSession();

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });

    it("should allow removing event listeners", async () => {
      const listener = vi.fn();

      switcher.on("switch", listener);
      switcher.off("switch", listener);

      await switcher.createNewSession();

      expect(listener).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Fork Session Tests
  // ===========================================================================

  describe("forkSession", () => {
    it("should fork the current session with default options", async () => {
      // Create original session
      const original = await switcher.createNewSession({ title: "Original" });

      // Fork it
      const forked = await switcher.forkSession();

      expect(forked.metadata.id).not.toBe(original.metadata.id);
      expect(forked.metadata.title).toBe("Original (Fork)");
      expect(forked.metadata.tags).toContain(`forked-from:${original.metadata.id}`);
    });

    it("should fork a specific session by ID", async () => {
      // Create and mock a specific session
      const targetSession = createTestSession({ title: "Target Session" });
      targetSession.metadata.tags = ["important"];
      targetSession.messages = [];
      storage.load.mockResolvedValue(targetSession);

      // Create current session first
      await switcher.createNewSession({ title: "Current" });

      // Fork the specific session
      const forked = await switcher.forkSession(targetSession.metadata.id);

      expect(forked.metadata.title).toBe("Target Session (Fork)");
      expect(forked.metadata.tags).toContain(`forked-from:${targetSession.metadata.id}`);
      expect(forked.metadata.tags).toContain("important");
    });

    it("should use custom title when provided", async () => {
      await switcher.createNewSession({ title: "Original" });

      const forked = await switcher.forkSession(undefined, {
        newTitle: "My Custom Fork",
      });

      expect(forked.metadata.title).toBe("My Custom Fork");
    });

    it("should exclude original tags when includeTags is false", async () => {
      const original = await switcher.createNewSession({
        title: "Original",
        tags: ["original-tag"],
      });

      const forked = await switcher.forkSession(undefined, {
        includeTags: false,
      });

      expect(forked.metadata.tags).toContain(`forked-from:${original.metadata.id}`);
      expect(forked.metadata.tags).not.toContain("original-tag");
    });

    it("should fork from a specific checkpoint", async () => {
      // Create session with checkpoint
      const targetSession = createTestSession({ title: "Session" });
      targetSession.messages = [
        {
          id: "msg-1",
          role: "user" as const,
          parts: [{ type: "text" as const, text: "First message" }],
          metadata: { createdAt: Date.now() },
        },
        {
          id: "msg-2",
          role: "assistant" as const,
          parts: [{ type: "text" as const, text: "Response" }],
          metadata: { createdAt: Date.now() + 1 },
        },
        {
          id: "msg-3",
          role: "user" as const,
          parts: [{ type: "text" as const, text: "Third message" }],
          metadata: { createdAt: Date.now() + 2 },
        },
      ];
      targetSession.checkpoints = [
        {
          id: "cp-1",
          sessionId: targetSession.metadata.id,
          messageIndex: 2,
          createdAt: new Date(),
        },
      ];
      storage.load.mockResolvedValue(targetSession);

      await switcher.createNewSession({ title: "Current" });

      const forked = await switcher.forkSession(targetSession.metadata.id, {
        fromCheckpoint: "cp-1",
      });

      // Should only include messages up to checkpoint
      expect(forked.messages.length).toBe(2);
      expect(forked.checkpoints.length).toBe(0); // Checkpoints are cleared
    });

    it("should throw error when checkpoint not found", async () => {
      const targetSession = createTestSession({ title: "Session" });
      targetSession.checkpoints = [];
      storage.load.mockResolvedValue(targetSession);

      await switcher.createNewSession({ title: "Current" });

      await expect(
        switcher.forkSession(targetSession.metadata.id, { fromCheckpoint: "non-existent" })
      ).rejects.toThrow("Checkpoint not found: non-existent");
    });

    it("should throw error when no session to fork", async () => {
      // No current session and no ID provided
      await expect(switcher.forkSession()).rejects.toThrow(
        "No session to fork. Provide a session ID or ensure a session is active."
      );
    });

    it("should throw error when specified session not found", async () => {
      storage.load.mockRejectedValue(new Error("Not found"));

      await expect(switcher.forkSession("non-existent-id")).rejects.toThrow(
        "Session not found: non-existent-id"
      );
    });

    it("should emit newSession event when forking", async () => {
      const newSessionHandler = vi.fn();
      switcher.on("newSession", newSessionHandler);

      await switcher.createNewSession({ title: "Original" });
      newSessionHandler.mockClear();

      const forked = await switcher.forkSession();

      expect(newSessionHandler).toHaveBeenCalledWith(forked.metadata.id);
    });

    it("should reset timestamps on forked session", async () => {
      // Create original session
      const original = await switcher.createNewSession({ title: "Original" });
      const originalCreatedAt = original.metadata.createdAt;

      // Advance time significantly
      vi.advanceTimersByTime(60000); // 1 minute

      const forked = await switcher.forkSession();

      // Forked session should have newer timestamps
      expect(forked.metadata.createdAt.getTime()).toBeGreaterThan(originalCreatedAt.getTime());
      expect(forked.metadata.updatedAt.getTime()).toBeGreaterThan(originalCreatedAt.getTime());
    });

    it("should deep clone messages to avoid reference issues", async () => {
      await switcher.createNewSession({ title: "Original" });

      // Access the internal session to add a message
      const originalSession = persistence.currentSession;
      expect(originalSession).toBeDefined();
      if (!originalSession) return;
      originalSession.messages = [
        {
          id: "msg-1",
          role: "user" as const,
          parts: [{ type: "text" as const, text: "Hello" }],
          metadata: { createdAt: Date.now() },
        },
      ];

      const forked = await switcher.forkSession();

      // Modify forked message
      if (forked.messages[0]?.parts[0]) {
        forked.messages[0].parts[0] = { type: "text" as const, text: "Modified" };
      }

      // Original should be unchanged
      expect(originalSession.messages[0]?.parts[0]).toEqual({
        type: "text",
        text: "Hello",
      });
    });

    it("should filter out existing forked-from tags during fork", async () => {
      const targetSession = createTestSession({ title: "Session" });
      targetSession.metadata.tags = ["forked-from:old-id", "keep-me"];
      targetSession.messages = [];
      storage.load.mockResolvedValue(targetSession);

      await switcher.createNewSession({ title: "Current" });

      const forked = await switcher.forkSession(targetSession.metadata.id);

      // Should not have double forked-from tags
      const forkedFromTags = forked.metadata.tags.filter((t) => t.startsWith("forked-from:"));
      expect(forkedFromTags.length).toBe(1);
      expect(forkedFromTags[0]).toBe(`forked-from:${targetSession.metadata.id}`);
      expect(forked.metadata.tags).toContain("keep-me");
    });
  });

  // ===========================================================================
  // Merge Sessions Tests
  // ===========================================================================

  describe("mergeSessions", () => {
    it("should merge two sessions", async () => {
      const session1 = createTestSession({ title: "Session 1" });
      session1.messages = [
        {
          id: "msg-1",
          role: "user" as const,
          parts: [{ type: "text" as const, text: "First" }],
          metadata: { createdAt: 1000 },
        },
      ];
      session1.metadata.tokenCount = 10;

      const session2 = createTestSession({ title: "Session 2" });
      session2.messages = [
        {
          id: "msg-2",
          role: "user" as const,
          parts: [{ type: "text" as const, text: "Second" }],
          metadata: { createdAt: 2000 },
        },
      ];
      session2.metadata.tokenCount = 20;

      storage.load.mockResolvedValueOnce(session1).mockResolvedValueOnce(session2);

      await switcher.createNewSession({ title: "Current" });

      const merged = await switcher.mergeSessions([session1.metadata.id, session2.metadata.id]);

      expect(merged.metadata.title).toBe("Merged: Session 1, Session 2");
      expect(merged.messages.length).toBe(2);
      expect(merged.metadata.tokenCount).toBe(30);
    });

    it("should sort messages chronologically", async () => {
      const session1 = createTestSession({ title: "Session 1" });
      session1.messages = [
        {
          id: "msg-a",
          role: "user" as const,
          parts: [{ type: "text" as const, text: "Third" }],
          metadata: { createdAt: 3000 },
        },
      ];

      const session2 = createTestSession({ title: "Session 2" });
      session2.messages = [
        {
          id: "msg-b",
          role: "user" as const,
          parts: [{ type: "text" as const, text: "First" }],
          metadata: { createdAt: 1000 },
        },
        {
          id: "msg-c",
          role: "user" as const,
          parts: [{ type: "text" as const, text: "Second" }],
          metadata: { createdAt: 2000 },
        },
      ];

      storage.load.mockResolvedValueOnce(session1).mockResolvedValueOnce(session2);

      await switcher.createNewSession({ title: "Current" });

      const merged = await switcher.mergeSessions([session1.metadata.id, session2.metadata.id]);

      expect(merged.messages[0]?.id).toBe("msg-b");
      expect(merged.messages[1]?.id).toBe("msg-c");
      expect(merged.messages[2]?.id).toBe("msg-a");
    });

    it("should use custom title when provided", async () => {
      const session1 = createTestSession({ title: "Session 1" });
      session1.messages = [];
      const session2 = createTestSession({ title: "Session 2" });
      session2.messages = [];

      storage.load.mockResolvedValueOnce(session1).mockResolvedValueOnce(session2);

      await switcher.createNewSession({ title: "Current" });

      const merged = await switcher.mergeSessions([session1.metadata.id, session2.metadata.id], {
        newTitle: "Combined Sessions",
      });

      expect(merged.metadata.title).toBe("Combined Sessions");
    });

    it("should deduplicate tags from all sources", async () => {
      const session1 = createTestSession({ title: "Session 1" });
      session1.metadata.tags = ["common", "unique-1"];
      session1.messages = [];

      const session2 = createTestSession({ title: "Session 2" });
      session2.metadata.tags = ["common", "unique-2"];
      session2.messages = [];

      storage.load.mockResolvedValueOnce(session1).mockResolvedValueOnce(session2);

      await switcher.createNewSession({ title: "Current" });

      const merged = await switcher.mergeSessions([session1.metadata.id, session2.metadata.id]);

      expect(merged.metadata.tags).toContain("common");
      expect(merged.metadata.tags).toContain("unique-1");
      expect(merged.metadata.tags).toContain("unique-2");
      // Common should appear only once
      expect(merged.metadata.tags.filter((t) => t === "common").length).toBe(1);
    });

    it("should deduplicate messages when option is enabled", async () => {
      const session1 = createTestSession({ title: "Session 1" });
      session1.messages = [
        {
          id: "msg-1",
          role: "user" as const,
          parts: [{ type: "text" as const, text: "Duplicate" }],
          metadata: { createdAt: 1000 },
        },
      ];

      const session2 = createTestSession({ title: "Session 2" });
      session2.messages = [
        {
          id: "msg-2",
          role: "user" as const,
          parts: [{ type: "text" as const, text: "Duplicate" }],
          metadata: { createdAt: 2000 },
        },
      ];

      storage.load.mockResolvedValueOnce(session1).mockResolvedValueOnce(session2);

      await switcher.createNewSession({ title: "Current" });

      const merged = await switcher.mergeSessions([session1.metadata.id, session2.metadata.id], {
        deduplicateMessages: true,
      });

      // Only one message should remain
      expect(merged.messages.length).toBe(1);
    });

    it("should keep all messages when deduplication is disabled", async () => {
      const session1 = createTestSession({ title: "Session 1" });
      session1.messages = [
        {
          id: "msg-1",
          role: "user" as const,
          parts: [{ type: "text" as const, text: "Duplicate" }],
          metadata: { createdAt: 1000 },
        },
      ];

      const session2 = createTestSession({ title: "Session 2" });
      session2.messages = [
        {
          id: "msg-2",
          role: "user" as const,
          parts: [{ type: "text" as const, text: "Duplicate" }],
          metadata: { createdAt: 2000 },
        },
      ];

      storage.load.mockResolvedValueOnce(session1).mockResolvedValueOnce(session2);

      await switcher.createNewSession({ title: "Current" });

      const merged = await switcher.mergeSessions([session1.metadata.id, session2.metadata.id], {
        deduplicateMessages: false,
      });

      expect(merged.messages.length).toBe(2);
    });

    it("should throw error when fewer than 2 sessions provided", async () => {
      await expect(switcher.mergeSessions([])).rejects.toThrow(
        "At least 2 sessions are required for merge."
      );

      await expect(switcher.mergeSessions(["only-one"])).rejects.toThrow(
        "At least 2 sessions are required for merge."
      );
    });

    it("should throw error when source session not found", async () => {
      storage.load.mockResolvedValueOnce(null);

      await expect(switcher.mergeSessions(["session-1", "session-2"])).rejects.toThrow(
        "Session not found: session-1"
      );
    });

    it("should merge more than two sessions", async () => {
      const session1 = createTestSession({ title: "S1" });
      session1.messages = [
        {
          id: "m1",
          role: "user" as const,
          parts: [{ type: "text" as const, text: "1" }],
          metadata: { createdAt: 1 },
        },
      ];
      const session2 = createTestSession({ title: "S2" });
      session2.messages = [
        {
          id: "m2",
          role: "user" as const,
          parts: [{ type: "text" as const, text: "2" }],
          metadata: { createdAt: 2 },
        },
      ];
      const session3 = createTestSession({ title: "S3" });
      session3.messages = [
        {
          id: "m3",
          role: "user" as const,
          parts: [{ type: "text" as const, text: "3" }],
          metadata: { createdAt: 3 },
        },
      ];

      storage.load
        .mockResolvedValueOnce(session1)
        .mockResolvedValueOnce(session2)
        .mockResolvedValueOnce(session3);

      await switcher.createNewSession({ title: "Current" });

      const merged = await switcher.mergeSessions([
        session1.metadata.id,
        session2.metadata.id,
        session3.metadata.id,
      ]);

      expect(merged.messages.length).toBe(3);
      expect(merged.metadata.title).toBe("Merged: S1, S2, S3");
    });

    it("should emit newSession event when merging", async () => {
      const newSessionHandler = vi.fn();
      switcher.on("newSession", newSessionHandler);

      const session1 = createTestSession({ title: "S1" });
      session1.messages = [];
      const session2 = createTestSession({ title: "S2" });
      session2.messages = [];

      storage.load.mockResolvedValueOnce(session1).mockResolvedValueOnce(session2);

      await switcher.createNewSession({ title: "Current" });
      newSessionHandler.mockClear();

      const merged = await switcher.mergeSessions([session1.metadata.id, session2.metadata.id]);

      expect(newSessionHandler).toHaveBeenCalledWith(merged.metadata.id);
    });

    it("should create merged session with empty checkpoints", async () => {
      const session1 = createTestSession({ title: "S1" });
      session1.messages = [];
      session1.checkpoints = [
        { id: "cp1", sessionId: session1.metadata.id, messageIndex: 0, createdAt: new Date() },
      ];

      const session2 = createTestSession({ title: "S2" });
      session2.messages = [];
      session2.checkpoints = [
        { id: "cp2", sessionId: session2.metadata.id, messageIndex: 0, createdAt: new Date() },
      ];

      storage.load.mockResolvedValueOnce(session1).mockResolvedValueOnce(session2);

      await switcher.createNewSession({ title: "Current" });

      const merged = await switcher.mergeSessions([session1.metadata.id, session2.metadata.id]);

      expect(merged.checkpoints.length).toBe(0);
    });

    it("should use first session mode and working directory", async () => {
      const session1 = createTestSession({ title: "S1" });
      session1.metadata.mode = "code";
      session1.metadata.workingDirectory = "/path/a";
      session1.messages = [];

      const session2 = createTestSession({ title: "S2" });
      session2.metadata.mode = "chat";
      session2.metadata.workingDirectory = "/path/b";
      session2.messages = [];

      storage.load.mockResolvedValueOnce(session1).mockResolvedValueOnce(session2);

      await switcher.createNewSession({ title: "Current" });

      const merged = await switcher.mergeSessions([session1.metadata.id, session2.metadata.id]);

      expect(merged.metadata.mode).toBe("code");
      expect(merged.metadata.workingDirectory).toBe("/path/a");
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe("edge cases", () => {
    it("should handle rapid session switching", async () => {
      const sessions: Session[] = [];
      for (let i = 0; i < 5; i++) {
        sessions.push(createTestSession({ title: `Session ${i}` }));
      }

      // Create initial session
      await switcher.createNewSession({ title: "Initial" });

      // Rapid switch to multiple sessions
      for (const session of sessions) {
        storage.load.mockResolvedValue(session);
        await switcher.switchTo(session.metadata.id);
      }

      expect(switcher.currentSessionId).toBe(sessions[4]?.metadata.id);
      expect(switcher.getHistory().length).toBe(6); // Initial + 5 switches
    });

    it("should handle save failure gracefully during switch", async () => {
      await switcher.createNewSession({ title: "Session 1" });

      // Make save fail
      storage.save.mockRejectedValueOnce(new Error("Save failed"));

      const targetSession = createTestSession({ title: "Target" });
      storage.load.mockResolvedValue(targetSession);

      // Should still switch even if save fails
      const session = await switcher.switchTo(targetSession.metadata.id);
      expect(session.metadata.id).toBe(targetSession.metadata.id);
    });

    it("should handle concurrent createNewSession calls", async () => {
      const promises = [
        switcher.createNewSession({ title: "Session A" }),
        switcher.createNewSession({ title: "Session B" }),
      ];

      const results = await Promise.all(promises);

      // Both should complete successfully
      expect(results.length).toBe(2);
      expect(results[0]?.metadata.title).toBe("Session A");
      expect(results[1]?.metadata.title).toBe("Session B");
    });
  });
});
