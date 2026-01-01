import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import type { SessionMessage } from "../message.js";
import {
  DEFAULT_PERSISTENCE_CONFIG,
  type PersistenceConfig,
  PersistenceManager,
} from "../persistence.js";
import type { StorageManager } from "../storage.js";
import { createSession } from "../types.js";

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
// Test Message Factory
// =============================================================================

function createTestMessage(overrides: Partial<SessionMessage> = {}): SessionMessage {
  return {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role: "user",
    parts: [{ type: "text", text: "Test message" }],
    metadata: {
      createdAt: Date.now(),
      tokens: { input: 10, output: 0 },
    },
    ...overrides,
  };
}

// =============================================================================
// PersistenceManager Tests
// =============================================================================

describe("PersistenceManager", () => {
  let storage: ReturnType<typeof createMockStorageManager>;

  beforeEach(() => {
    vi.useFakeTimers();
    storage = createMockStorageManager();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // ===========================================================================
  // Constructor Tests
  // ===========================================================================

  describe("constructor", () => {
    it("should create PersistenceManager with default config", () => {
      const persistence = new PersistenceManager(storage.mock);

      const config = persistence.getConfig();
      expect(config).toEqual(DEFAULT_PERSISTENCE_CONFIG);
    });

    it("should create PersistenceManager with custom config", () => {
      const customConfig: Partial<PersistenceConfig> = {
        autoSaveEnabled: false,
        autoSaveIntervalSecs: 60,
        maxUnsavedMessages: 10,
      };

      const persistence = new PersistenceManager(storage.mock, customConfig);

      const config = persistence.getConfig();
      expect(config.autoSaveEnabled).toBe(false);
      expect(config.autoSaveIntervalSecs).toBe(60);
      expect(config.maxUnsavedMessages).toBe(10);
    });

    it("should merge partial config with defaults", () => {
      const persistence = new PersistenceManager(storage.mock, {
        maxUnsavedMessages: 20,
      });

      const config = persistence.getConfig();
      expect(config.autoSaveEnabled).toBe(true); // default
      expect(config.autoSaveIntervalSecs).toBe(30); // default
      expect(config.maxUnsavedMessages).toBe(20); // overridden
    });

    it("should have no current session initially", () => {
      const persistence = new PersistenceManager(storage.mock);

      expect(persistence.currentSession).toBeNull();
    });

    it("should have zero unsaved count initially", () => {
      const persistence = new PersistenceManager(storage.mock);

      expect(persistence.getUnsavedCount()).toBe(0);
    });

    it("should not be running auto-save initially", () => {
      const persistence = new PersistenceManager(storage.mock);

      expect(persistence.isAutoSaveRunning()).toBe(false);
    });
  });

  // ===========================================================================
  // Auto-Save Timer Tests
  // ===========================================================================

  describe("auto-save timer", () => {
    describe("startAutoSave", () => {
      it("should start auto-save timer when enabled", async () => {
        const persistence = new PersistenceManager(storage.mock);
        await persistence.newSession({ title: "Test" });

        expect(persistence.isAutoSaveRunning()).toBe(true);
      });

      it("should not start timer if autoSaveEnabled is false", async () => {
        const persistence = new PersistenceManager(storage.mock, {
          autoSaveEnabled: false,
        });
        await persistence.newSession({ title: "Test" });

        expect(persistence.isAutoSaveRunning()).toBe(false);
      });

      it("should not start duplicate timers", async () => {
        const persistence = new PersistenceManager(storage.mock);
        await persistence.newSession({ title: "Test" });

        persistence.startAutoSave(); // Call again
        persistence.startAutoSave(); // And again

        expect(persistence.isAutoSaveRunning()).toBe(true);
        // If we had multiple timers, stopping once wouldn't stop all
        persistence.stopAutoSave();
        expect(persistence.isAutoSaveRunning()).toBe(false);
      });

      it("should trigger save after interval when there are unsaved changes", async () => {
        const persistence = new PersistenceManager(storage.mock, {
          autoSaveIntervalSecs: 5,
          maxUnsavedMessages: 100, // High threshold to prevent threshold-based save
        });

        await persistence.newSession({ title: "Test" });
        storage.save.mockClear(); // Clear the initial save

        // Add a message but don't reach threshold
        await persistence.onMessage(createTestMessage());
        expect(storage.save).not.toHaveBeenCalled();

        // Fast forward past the auto-save interval
        await vi.advanceTimersByTimeAsync(5000);

        expect(storage.save).toHaveBeenCalled();
      });

      it("should not trigger save if no unsaved changes", async () => {
        const persistence = new PersistenceManager(storage.mock, {
          autoSaveIntervalSecs: 5,
        });

        await persistence.newSession({ title: "Test" });
        storage.save.mockClear();

        // Fast forward without adding messages
        await vi.advanceTimersByTimeAsync(5000);

        expect(storage.save).not.toHaveBeenCalled();
      });
    });

    describe("stopAutoSave", () => {
      it("should stop the auto-save timer", async () => {
        const persistence = new PersistenceManager(storage.mock);
        await persistence.newSession({ title: "Test" });

        expect(persistence.isAutoSaveRunning()).toBe(true);

        persistence.stopAutoSave();

        expect(persistence.isAutoSaveRunning()).toBe(false);
      });

      it("should be safe to call when timer is not running", () => {
        const persistence = new PersistenceManager(storage.mock, {
          autoSaveEnabled: false,
        });

        expect(() => persistence.stopAutoSave()).not.toThrow();
        expect(persistence.isAutoSaveRunning()).toBe(false);
      });

      it("should prevent further auto-saves", async () => {
        const persistence = new PersistenceManager(storage.mock, {
          autoSaveIntervalSecs: 5,
          maxUnsavedMessages: 100,
        });

        await persistence.newSession({ title: "Test" });
        storage.save.mockClear();

        await persistence.onMessage(createTestMessage());
        persistence.stopAutoSave();

        // Fast forward past multiple intervals
        await vi.advanceTimersByTimeAsync(15000);

        expect(storage.save).not.toHaveBeenCalled();
      });
    });
  });

  // ===========================================================================
  // Message Threshold Tests
  // ===========================================================================

  describe("message threshold", () => {
    it("should trigger save when maxUnsavedMessages threshold is reached", async () => {
      const persistence = new PersistenceManager(storage.mock, {
        maxUnsavedMessages: 3,
        autoSaveEnabled: false,
      });

      await persistence.newSession({ title: "Test" });
      storage.save.mockClear();

      // Add messages up to threshold
      await persistence.onMessage(createTestMessage());
      await persistence.onMessage(createTestMessage());
      expect(storage.save).not.toHaveBeenCalled();

      // Third message triggers save
      await persistence.onMessage(createTestMessage());
      expect(storage.save).toHaveBeenCalledTimes(1);
    });

    it("should reset unsaved count after save", async () => {
      const persistence = new PersistenceManager(storage.mock, {
        maxUnsavedMessages: 2,
        autoSaveEnabled: false,
      });

      await persistence.newSession({ title: "Test" });

      await persistence.onMessage(createTestMessage());
      expect(persistence.getUnsavedCount()).toBe(1);

      await persistence.onMessage(createTestMessage());
      expect(persistence.getUnsavedCount()).toBe(0); // Reset after save
    });

    it("should throw error when adding message without active session", async () => {
      const persistence = new PersistenceManager(storage.mock);

      await expect(persistence.onMessage(createTestMessage())).rejects.toThrow("No active session");
    });

    it("should update session with message when onMessage is called", async () => {
      const persistence = new PersistenceManager(storage.mock, {
        autoSaveEnabled: false,
        maxUnsavedMessages: 100,
      });

      await persistence.newSession({ title: "Test" });
      const message = createTestMessage();

      await persistence.onMessage(message);

      expect(persistence.currentSession?.messages).toHaveLength(1);
      expect(persistence.currentSession?.messages[0]).toEqual(message);
    });
  });

  // ===========================================================================
  // Session Lifecycle Tests
  // ===========================================================================

  describe("newSession", () => {
    it("should create a new session", async () => {
      const persistence = new PersistenceManager(storage.mock);

      const session = await persistence.newSession({ title: "New Test Session" });

      expect(session.metadata.title).toBe("New Test Session");
      expect(session.metadata.status).toBe("active");
      expect(persistence.currentSession).toEqual(session);
    });

    it("should save session immediately after creation", async () => {
      const persistence = new PersistenceManager(storage.mock);

      await persistence.newSession({ title: "Test" });

      expect(storage.save).toHaveBeenCalledTimes(1);
    });

    it("should emit save event on successful creation", async () => {
      const persistence = new PersistenceManager(storage.mock);
      const saveHandler = vi.fn();
      persistence.on("save", saveHandler);

      await persistence.newSession({ title: "Test" });

      expect(saveHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ title: "Test" }),
        })
      );
    });

    it("should emit error event when save fails", async () => {
      storage.save.mockRejectedValueOnce(new Error("Save failed"));
      const persistence = new PersistenceManager(storage.mock);
      const errorHandler = vi.fn();
      persistence.on("error", errorHandler);

      await expect(persistence.newSession({ title: "Test" })).rejects.toThrow("Save failed");

      expect(errorHandler).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          metadata: expect.objectContaining({ title: "Test" }),
        })
      );
    });

    it("should stop existing auto-save before creating new session", async () => {
      const persistence = new PersistenceManager(storage.mock);

      await persistence.newSession({ title: "First" });
      expect(persistence.isAutoSaveRunning()).toBe(true);

      await persistence.newSession({ title: "Second" });
      expect(persistence.isAutoSaveRunning()).toBe(true);
      expect(persistence.currentSession?.metadata.title).toBe("Second");
    });

    it("should reset unsaved count", async () => {
      const persistence = new PersistenceManager(storage.mock, {
        autoSaveEnabled: false,
        maxUnsavedMessages: 100,
      });

      await persistence.newSession({ title: "First" });
      await persistence.onMessage(createTestMessage());
      expect(persistence.getUnsavedCount()).toBe(1);

      await persistence.newSession({ title: "Second" });
      expect(persistence.getUnsavedCount()).toBe(0);
    });
  });

  describe("loadSession", () => {
    it("should load session from storage", async () => {
      const existingSession = createSession({ title: "Existing" });
      storage.load.mockResolvedValue(existingSession);

      const persistence = new PersistenceManager(storage.mock);

      const session = await persistence.loadSession(existingSession.metadata.id);

      expect(session).toEqual(existingSession);
      expect(persistence.currentSession).toEqual(existingSession);
    });

    it("should start auto-save after loading", async () => {
      const existingSession = createSession({ title: "Existing" });
      storage.load.mockResolvedValue(existingSession);

      const persistence = new PersistenceManager(storage.mock);

      await persistence.loadSession(existingSession.metadata.id);

      expect(persistence.isAutoSaveRunning()).toBe(true);
    });

    it("should not start auto-save if disabled", async () => {
      const existingSession = createSession({ title: "Existing" });
      storage.load.mockResolvedValue(existingSession);

      const persistence = new PersistenceManager(storage.mock, {
        autoSaveEnabled: false,
      });

      await persistence.loadSession(existingSession.metadata.id);

      expect(persistence.isAutoSaveRunning()).toBe(false);
    });

    it("should stop existing auto-save before loading", async () => {
      const existingSession = createSession({ title: "Existing" });
      storage.load.mockResolvedValue(existingSession);

      const persistence = new PersistenceManager(storage.mock);
      await persistence.newSession({ title: "Current" });

      await persistence.loadSession(existingSession.metadata.id);

      expect(persistence.currentSession?.metadata.title).toBe("Existing");
    });

    it("should reset unsaved count", async () => {
      const existingSession = createSession({ title: "Existing" });
      storage.load.mockResolvedValue(existingSession);

      const persistence = new PersistenceManager(storage.mock, {
        autoSaveEnabled: false,
        maxUnsavedMessages: 100,
      });
      await persistence.newSession({ title: "Current" });
      await persistence.onMessage(createTestMessage());

      await persistence.loadSession(existingSession.metadata.id);

      expect(persistence.getUnsavedCount()).toBe(0);
    });

    it("should propagate storage errors", async () => {
      storage.load.mockRejectedValue(new Error("Session not found"));

      const persistence = new PersistenceManager(storage.mock);

      await expect(persistence.loadSession("non-existent-id")).rejects.toThrow("Session not found");
    });
  });

  describe("closeSession", () => {
    it("should save session if there are unsaved changes", async () => {
      const persistence = new PersistenceManager(storage.mock, {
        autoSaveEnabled: false,
        maxUnsavedMessages: 100,
      });
      await persistence.newSession({ title: "Test" });
      storage.save.mockClear();
      await persistence.onMessage(createTestMessage());

      await persistence.closeSession();

      expect(storage.save).toHaveBeenCalled();
    });

    it("should not save if no unsaved changes", async () => {
      const persistence = new PersistenceManager(storage.mock, {
        autoSaveEnabled: false,
      });
      await persistence.newSession({ title: "Test" });
      storage.save.mockClear();

      await persistence.closeSession();

      expect(storage.save).not.toHaveBeenCalled();
    });

    it("should stop auto-save timer", async () => {
      const persistence = new PersistenceManager(storage.mock);
      await persistence.newSession({ title: "Test" });

      await persistence.closeSession();

      expect(persistence.isAutoSaveRunning()).toBe(false);
    });

    it("should clear current session", async () => {
      const persistence = new PersistenceManager(storage.mock);
      await persistence.newSession({ title: "Test" });

      await persistence.closeSession();

      expect(persistence.currentSession).toBeNull();
    });

    it("should reset unsaved count", async () => {
      const persistence = new PersistenceManager(storage.mock, {
        autoSaveEnabled: false,
        maxUnsavedMessages: 100,
      });
      await persistence.newSession({ title: "Test" });
      await persistence.onMessage(createTestMessage());

      await persistence.closeSession();

      expect(persistence.getUnsavedCount()).toBe(0);
    });

    it("should handle save errors gracefully", async () => {
      const persistence = new PersistenceManager(storage.mock, {
        autoSaveEnabled: false,
        maxUnsavedMessages: 100,
      });
      await persistence.newSession({ title: "Test" });
      storage.save.mockClear();
      await persistence.onMessage(createTestMessage());
      storage.save.mockRejectedValueOnce(new Error("Save failed"));

      // Should not throw
      await persistence.closeSession();

      expect(persistence.currentSession).toBeNull();
    });
  });

  // ===========================================================================
  // Checkpoint Tests
  // ===========================================================================

  describe("createCheckpointAt", () => {
    it("should create checkpoint at current message index", async () => {
      const persistence = new PersistenceManager(storage.mock, {
        autoSaveEnabled: false,
        maxUnsavedMessages: 100,
      });
      await persistence.newSession({ title: "Test" });
      await persistence.onMessage(createTestMessage());
      await persistence.onMessage(createTestMessage());
      storage.save.mockClear();

      const checkpointId = await persistence.createCheckpointAt("Test checkpoint");

      expect(checkpointId).toBeDefined();
      const checkpoints = persistence.getCheckpoints();
      expect(checkpoints).toHaveLength(1);
      expect(checkpoints[0]?.messageIndex).toBe(2);
      expect(checkpoints[0]?.description).toBe("Test checkpoint");
    });

    it("should auto-save after creating checkpoint", async () => {
      const persistence = new PersistenceManager(storage.mock, {
        autoSaveEnabled: false,
      });
      await persistence.newSession({ title: "Test" });
      storage.save.mockClear();

      await persistence.createCheckpointAt();

      expect(storage.save).toHaveBeenCalled();
    });

    it("should throw error without active session", async () => {
      const persistence = new PersistenceManager(storage.mock);

      await expect(persistence.createCheckpointAt()).rejects.toThrow("No active session");
    });
  });

  describe("rollbackToCheckpoint", () => {
    it("should truncate messages to checkpoint index", async () => {
      const persistence = new PersistenceManager(storage.mock, {
        autoSaveEnabled: false,
        maxUnsavedMessages: 100,
      });
      await persistence.newSession({ title: "Test" });

      await persistence.onMessage(createTestMessage());
      await persistence.onMessage(createTestMessage());
      const checkpointId = await persistence.createCheckpointAt();
      await persistence.onMessage(createTestMessage());
      await persistence.onMessage(createTestMessage());

      expect(persistence.currentSession?.messages).toHaveLength(4);

      const result = await persistence.rollbackToCheckpoint(checkpointId);

      expect(result).toBe(true);
      expect(persistence.currentSession?.messages).toHaveLength(2);
    });

    it("should remove checkpoints after rollback point", async () => {
      const persistence = new PersistenceManager(storage.mock, {
        autoSaveEnabled: false,
        maxUnsavedMessages: 100,
      });
      await persistence.newSession({ title: "Test" });

      await persistence.onMessage(createTestMessage());
      const checkpoint1 = await persistence.createCheckpointAt("First");
      await persistence.onMessage(createTestMessage());
      await persistence.createCheckpointAt("Second");
      await persistence.onMessage(createTestMessage());
      await persistence.createCheckpointAt("Third");

      expect(persistence.getCheckpoints()).toHaveLength(3);

      await persistence.rollbackToCheckpoint(checkpoint1);

      const checkpoints = persistence.getCheckpoints();
      expect(checkpoints).toHaveLength(1);
      expect(checkpoints[0]?.description).toBe("First");
    });

    it("should return false for non-existent checkpoint", async () => {
      const persistence = new PersistenceManager(storage.mock, {
        autoSaveEnabled: false,
      });
      await persistence.newSession({ title: "Test" });

      const result = await persistence.rollbackToCheckpoint("non-existent");

      expect(result).toBe(false);
    });

    it("should throw error without active session", async () => {
      const persistence = new PersistenceManager(storage.mock);

      await expect(persistence.rollbackToCheckpoint("some-id")).rejects.toThrow(
        "No active session"
      );
    });

    it("should auto-save after rollback", async () => {
      const persistence = new PersistenceManager(storage.mock, {
        autoSaveEnabled: false,
        maxUnsavedMessages: 100,
      });
      await persistence.newSession({ title: "Test" });
      await persistence.onMessage(createTestMessage());
      const checkpointId = await persistence.createCheckpointAt();
      await persistence.onMessage(createTestMessage());
      storage.save.mockClear();

      await persistence.rollbackToCheckpoint(checkpointId);

      expect(storage.save).toHaveBeenCalled();
    });

    it("should recalculate token count after rollback", async () => {
      const persistence = new PersistenceManager(storage.mock, {
        autoSaveEnabled: false,
        maxUnsavedMessages: 100,
      });
      await persistence.newSession({ title: "Test" });

      await persistence.onMessage(
        createTestMessage({
          metadata: { createdAt: Date.now(), tokens: { input: 100, output: 50 } },
        })
      );
      const checkpointId = await persistence.createCheckpointAt();
      await persistence.onMessage(
        createTestMessage({
          metadata: { createdAt: Date.now(), tokens: { input: 200, output: 100 } },
        })
      );

      await persistence.rollbackToCheckpoint(checkpointId);

      expect(persistence.currentSession?.metadata.tokenCount).toBe(150); // 100 + 50
    });
  });

  describe("deleteCheckpoint", () => {
    it("should delete checkpoint by ID", async () => {
      const persistence = new PersistenceManager(storage.mock, {
        autoSaveEnabled: false,
      });
      await persistence.newSession({ title: "Test" });
      const checkpointId = await persistence.createCheckpointAt();

      const result = await persistence.deleteCheckpoint(checkpointId);

      expect(result).toBe(true);
      expect(persistence.getCheckpoints()).toHaveLength(0);
    });

    it("should return false for non-existent checkpoint", async () => {
      const persistence = new PersistenceManager(storage.mock, {
        autoSaveEnabled: false,
      });
      await persistence.newSession({ title: "Test" });

      const result = await persistence.deleteCheckpoint("non-existent");

      expect(result).toBe(false);
    });

    it("should throw error without active session", async () => {
      const persistence = new PersistenceManager(storage.mock);

      await expect(persistence.deleteCheckpoint("some-id")).rejects.toThrow("No active session");
    });
  });

  describe("getCheckpoints", () => {
    it("should return empty array when no session active", () => {
      const persistence = new PersistenceManager(storage.mock);

      expect(persistence.getCheckpoints()).toEqual([]);
    });

    it("should return copy of checkpoints array", async () => {
      const persistence = new PersistenceManager(storage.mock, {
        autoSaveEnabled: false,
      });
      await persistence.newSession({ title: "Test" });
      await persistence.createCheckpointAt();

      const checkpoints1 = persistence.getCheckpoints();
      const checkpoints2 = persistence.getCheckpoints();

      expect(checkpoints1).not.toBe(checkpoints2);
      expect(checkpoints1).toEqual(checkpoints2);
    });
  });

  // ===========================================================================
  // Event Emission Tests
  // ===========================================================================

  describe("events", () => {
    describe("save event", () => {
      it("should emit save event after successful save", async () => {
        const persistence = new PersistenceManager(storage.mock, {
          autoSaveEnabled: false,
        });
        const saveHandler = vi.fn();
        persistence.on("save", saveHandler);

        await persistence.newSession({ title: "Test" });

        expect(saveHandler).toHaveBeenCalledTimes(1);
        expect(saveHandler).toHaveBeenCalledWith(
          expect.objectContaining({
            metadata: expect.objectContaining({ title: "Test" }),
          })
        );
      });

      it("should emit save event on manual save", async () => {
        const persistence = new PersistenceManager(storage.mock, {
          autoSaveEnabled: false,
        });
        await persistence.newSession({ title: "Test" });
        const saveHandler = vi.fn();
        persistence.on("save", saveHandler);
        storage.save.mockClear();

        await persistence.save();

        expect(saveHandler).toHaveBeenCalled();
      });
    });

    describe("error event", () => {
      it("should emit error event when save fails", async () => {
        const persistence = new PersistenceManager(storage.mock, {
          autoSaveEnabled: false,
        });
        await persistence.newSession({ title: "Test" });
        storage.save.mockRejectedValueOnce(new Error("Disk full"));
        const errorHandler = vi.fn();
        persistence.on("error", errorHandler);

        await expect(persistence.save()).rejects.toThrow("Disk full");

        expect(errorHandler).toHaveBeenCalledWith(
          expect.any(Error),
          expect.objectContaining({
            metadata: expect.objectContaining({ title: "Test" }),
          })
        );
      });

      it("should convert non-Error objects to Error", async () => {
        const persistence = new PersistenceManager(storage.mock, {
          autoSaveEnabled: false,
        });
        await persistence.newSession({ title: "Test" });
        storage.save.mockRejectedValueOnce("String error");
        const errorHandler = vi.fn();
        persistence.on("error", errorHandler);

        await expect(persistence.save()).rejects.toThrow();

        expect(errorHandler).toHaveBeenCalledWith(expect.any(Error), expect.anything());
      });
    });
  });

  // ===========================================================================
  // Disposal Tests
  // ===========================================================================

  describe("dispose", () => {
    it("should stop auto-save timer", async () => {
      const persistence = new PersistenceManager(storage.mock);
      await persistence.newSession({ title: "Test" });

      persistence.dispose();

      expect(persistence.isAutoSaveRunning()).toBe(false);
    });

    it("should clear current session", async () => {
      const persistence = new PersistenceManager(storage.mock);
      await persistence.newSession({ title: "Test" });

      persistence.dispose();

      expect(persistence.currentSession).toBeNull();
    });

    it("should reset unsaved count", async () => {
      const persistence = new PersistenceManager(storage.mock, {
        autoSaveEnabled: false,
        maxUnsavedMessages: 100,
      });
      await persistence.newSession({ title: "Test" });
      await persistence.onMessage(createTestMessage());

      persistence.dispose();

      expect(persistence.getUnsavedCount()).toBe(0);
    });

    it("should remove all event listeners", async () => {
      const persistence = new PersistenceManager(storage.mock);
      const saveHandler = vi.fn();
      persistence.on("save", saveHandler);

      persistence.dispose();

      // Verify no listeners remain
      expect(persistence.listenerCount("save")).toBe(0);
      expect(persistence.listenerCount("error")).toBe(0);
    });
  });

  // ===========================================================================
  // Save Operation Tests
  // ===========================================================================

  describe("save", () => {
    it("should throw error without active session", async () => {
      const persistence = new PersistenceManager(storage.mock);

      await expect(persistence.save()).rejects.toThrow("No active session");
    });

    it("should update updatedAt timestamp", async () => {
      const persistence = new PersistenceManager(storage.mock, {
        autoSaveEnabled: false,
      });
      await persistence.newSession({ title: "Test" });
      const originalUpdatedAt = persistence.currentSession?.metadata.updatedAt;

      // Advance time
      vi.advanceTimersByTime(1000);

      await persistence.save();

      expect(persistence.currentSession?.metadata.updatedAt).not.toEqual(originalUpdatedAt);
    });

    it("should update lastActive timestamp", async () => {
      const persistence = new PersistenceManager(storage.mock, {
        autoSaveEnabled: false,
      });
      await persistence.newSession({ title: "Test" });
      const originalLastActive = persistence.currentSession?.metadata.lastActive;

      vi.advanceTimersByTime(1000);

      await persistence.save();

      expect(persistence.currentSession?.metadata.lastActive).not.toEqual(originalLastActive);
    });
  });
});
