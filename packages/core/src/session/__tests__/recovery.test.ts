import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RecoveryError,
  RecoveryErrorType,
  type RecoveryLog,
  RecoveryLogSchema,
  RecoveryManager,
} from "../recovery.js";
import type { StorageManager } from "../storage.js";
import { createSession, type Session } from "../types.js";

// =============================================================================
// Test Helpers
// =============================================================================

function createTestSession(overrides: Partial<Session["metadata"]> = {}): Session {
  return createSession({
    title: "Test Session",
    workingDirectory: "/test/dir",
    ...overrides,
  });
}

function createMockStorageManager(existingSessionIds: string[] = []): StorageManager {
  return {
    exists: vi.fn(async (id: string) => existingSessionIds.includes(id)),
    save: vi.fn().mockResolvedValue(undefined),
    load: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(undefined),
    getConfig: vi.fn().mockReturnValue({ basePath: "/mock" }),
    getIndex: vi.fn().mockResolvedValue(new Map()),
  } as unknown as StorageManager;
}

// =============================================================================
// RecoveryManager Tests
// =============================================================================

describe("RecoveryManager", () => {
  let tempDir: string;
  let recovery: RecoveryManager;

  beforeEach(async () => {
    // Create unique temp directory for isolation
    tempDir = path.join(
      os.tmpdir(),
      `vellum-recovery-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    await fs.mkdir(tempDir, { recursive: true });
    recovery = new RecoveryManager(tempDir);
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // ===========================================================================
  // Constructor Tests
  // ===========================================================================

  describe("constructor", () => {
    it("should create RecoveryManager with base path", () => {
      const rm = new RecoveryManager("/some/path");
      expect(rm).toBeInstanceOf(RecoveryManager);
    });
  });

  // ===========================================================================
  // writeRecoveryLog Tests
  // ===========================================================================

  describe("writeRecoveryLog", () => {
    it("should write recovery log for session", async () => {
      const session = createTestSession();

      await recovery.writeRecoveryLog(session);

      const log = await recovery.getRecoveryLog(session.metadata.id);
      expect(log).not.toBeNull();
      expect(log?.sessionId).toBe(session.metadata.id);
      expect(log?.status).toBe("active");
    });

    it("should include message count", async () => {
      const session = createTestSession();
      // Add some mock messages
      (session as { messages: unknown[] }).messages = [
        { id: "msg1" },
        { id: "msg2" },
        { id: "msg3" },
      ];

      await recovery.writeRecoveryLog(session);

      const log = await recovery.getRecoveryLog(session.metadata.id);
      expect(log?.messageCount).toBe(3);
    });

    it("should include last message ID", async () => {
      const session = createTestSession();
      (session as { messages: unknown[] }).messages = [
        { id: "msg1" },
        { id: "msg2" },
        { id: "msg-last" },
      ];

      await recovery.writeRecoveryLog(session);

      const log = await recovery.getRecoveryLog(session.metadata.id);
      expect(log?.lastMessageId).toBe("msg-last");
    });

    it("should create .recovery directory if not exists", async () => {
      const newTempDir = path.join(tempDir, "new-base");
      const rm = new RecoveryManager(newTempDir);
      const session = createTestSession();

      await rm.writeRecoveryLog(session);

      const recoveryDir = path.join(newTempDir, ".recovery");
      const stat = await fs.stat(recoveryDir);
      expect(stat.isDirectory()).toBe(true);
    });

    it("should overwrite existing recovery log", async () => {
      const session = createTestSession();
      (session as { messages: unknown[] }).messages = [{ id: "msg1" }];

      await recovery.writeRecoveryLog(session);

      (session as { messages: unknown[] }).messages = [
        { id: "msg1" },
        { id: "msg2" },
        { id: "msg3" },
      ];

      await recovery.writeRecoveryLog(session);

      const log = await recovery.getRecoveryLog(session.metadata.id);
      expect(log?.messageCount).toBe(3);
    });

    it("should throw RecoveryError on write failure", async () => {
      // Create read-only directory to cause write failure
      const readOnlyDir = path.join(tempDir, "readonly");
      await fs.mkdir(path.join(readOnlyDir, ".recovery"), { recursive: true });

      // Make it read-only on non-Windows systems
      if (process.platform !== "win32") {
        await fs.chmod(path.join(readOnlyDir, ".recovery"), 0o444);
      }

      const rm = new RecoveryManager(readOnlyDir);
      const session = createTestSession();

      if (process.platform !== "win32") {
        await expect(rm.writeRecoveryLog(session)).rejects.toThrow(RecoveryError);
      }

      // Restore permissions for cleanup
      if (process.platform !== "win32") {
        await fs.chmod(path.join(readOnlyDir, ".recovery"), 0o755);
      }
    });
  });

  // ===========================================================================
  // clearRecoveryLog Tests
  // ===========================================================================

  describe("clearRecoveryLog", () => {
    it("should delete recovery log file", async () => {
      const session = createTestSession();
      await recovery.writeRecoveryLog(session);

      await recovery.clearRecoveryLog(session.metadata.id);

      const log = await recovery.getRecoveryLog(session.metadata.id);
      expect(log).toBeNull();
    });

    it("should not throw for non-existent log", async () => {
      await expect(recovery.clearRecoveryLog("non-existent-id")).resolves.not.toThrow();
    });

    it("should throw RecoveryError on other file system errors", async () => {
      // This test is platform-specific and may not work on Windows
      if (process.platform === "win32") {
        return;
      }

      const session = createTestSession();
      await recovery.writeRecoveryLog(session);

      // Make recovery directory read-only to cause delete failure
      const recoveryPath = path.join(tempDir, ".recovery");
      await fs.chmod(recoveryPath, 0o555);

      try {
        await expect(recovery.clearRecoveryLog(session.metadata.id)).rejects.toThrow(RecoveryError);
      } finally {
        // Restore permissions for cleanup
        await fs.chmod(recoveryPath, 0o755);
      }
    });
  });

  // ===========================================================================
  // getRecoveryLog Tests
  // ===========================================================================

  describe("getRecoveryLog", () => {
    it("should return recovery log if exists", async () => {
      const session = createTestSession();
      await recovery.writeRecoveryLog(session);

      const log = await recovery.getRecoveryLog(session.metadata.id);

      expect(log).not.toBeNull();
      expect(log?.sessionId).toBe(session.metadata.id);
    });

    it("should return null for missing log", async () => {
      const log = await recovery.getRecoveryLog("non-existent-id");

      expect(log).toBeNull();
    });

    it("should return null for corrupted JSON", async () => {
      const sessionId = "test-corrupted";
      const recoveryPath = path.join(tempDir, ".recovery");
      await fs.mkdir(recoveryPath, { recursive: true });
      await fs.writeFile(
        path.join(recoveryPath, `${sessionId}.recovery.json`),
        "{ invalid json",
        "utf-8"
      );

      const log = await recovery.getRecoveryLog(sessionId);

      expect(log).toBeNull();
    });

    it("should return null for invalid schema", async () => {
      const sessionId = "test-invalid-schema";
      const recoveryPath = path.join(tempDir, ".recovery");
      await fs.mkdir(recoveryPath, { recursive: true });
      await fs.writeFile(
        path.join(recoveryPath, `${sessionId}.recovery.json`),
        JSON.stringify({ invalidField: "value" }),
        "utf-8"
      );

      const log = await recovery.getRecoveryLog(sessionId);

      expect(log).toBeNull();
    });

    it("should parse valid recovery log correctly", async () => {
      const sessionId = "11111111-1111-1111-1111-111111111111";
      const timestamp = new Date();
      const validLog: RecoveryLog = {
        sessionId,
        timestamp,
        messageCount: 5,
        lastMessageId: "msg-5",
        status: "active",
      };

      const recoveryPath = path.join(tempDir, ".recovery");
      await fs.mkdir(recoveryPath, { recursive: true });
      await fs.writeFile(
        path.join(recoveryPath, `${sessionId}.recovery.json`),
        JSON.stringify(validLog),
        "utf-8"
      );

      const log = await recovery.getRecoveryLog(sessionId);

      expect(log).not.toBeNull();
      expect(log?.sessionId).toBe(sessionId);
      expect(log?.messageCount).toBe(5);
      expect(log?.lastMessageId).toBe("msg-5");
      expect(log?.status).toBe("active");
    });
  });

  // ===========================================================================
  // listRecoveryLogs Tests
  // ===========================================================================

  describe("listRecoveryLogs", () => {
    it("should return empty array when no logs exist", async () => {
      const logs = await recovery.listRecoveryLogs();

      expect(logs).toEqual([]);
    });

    it("should return all valid recovery logs", async () => {
      const session1 = createTestSession({ id: "11111111-1111-1111-1111-111111111111" });
      const session2 = createTestSession({ id: "22222222-2222-2222-2222-222222222222" });
      const session3 = createTestSession({ id: "33333333-3333-3333-3333-333333333333" });

      await recovery.writeRecoveryLog(session1);
      await recovery.writeRecoveryLog(session2);
      await recovery.writeRecoveryLog(session3);

      const logs = await recovery.listRecoveryLogs();

      expect(logs).toHaveLength(3);
      const sessionIds = logs.map((l) => l.sessionId);
      expect(sessionIds).toContain(session1.metadata.id);
      expect(sessionIds).toContain(session2.metadata.id);
      expect(sessionIds).toContain(session3.metadata.id);
    });

    it("should skip corrupted log files", async () => {
      const validSession = createTestSession({ id: "11111111-1111-1111-1111-111111111111" });
      await recovery.writeRecoveryLog(validSession);

      // Write corrupted file
      const recoveryPath = path.join(tempDir, ".recovery");
      await fs.writeFile(
        path.join(recoveryPath, "corrupted.recovery.json"),
        "{ invalid json",
        "utf-8"
      );

      const logs = await recovery.listRecoveryLogs();

      expect(logs).toHaveLength(1);
      expect(logs[0]?.sessionId).toBe(validSession.metadata.id);
    });

    it("should only include files with .recovery.json extension", async () => {
      const session = createTestSession();
      await recovery.writeRecoveryLog(session);

      // Write non-recovery files
      const recoveryPath = path.join(tempDir, ".recovery");
      await fs.writeFile(path.join(recoveryPath, "other.json"), "{}", "utf-8");
      await fs.writeFile(path.join(recoveryPath, "readme.txt"), "test", "utf-8");

      const logs = await recovery.listRecoveryLogs();

      expect(logs).toHaveLength(1);
    });

    it("should return empty array when recovery directory does not exist", async () => {
      const rm = new RecoveryManager(path.join(tempDir, "non-existent"));

      const logs = await rm.listRecoveryLogs();

      expect(logs).toEqual([]);
    });
  });

  // ===========================================================================
  // checkAndRecover Tests
  // ===========================================================================

  describe("checkAndRecover", () => {
    it("should return empty array when no active sessions", async () => {
      const storage = createMockStorageManager();

      const crashed = await recovery.checkAndRecover(storage);

      expect(crashed).toEqual([]);
    });

    it("should identify crashed sessions with active status", async () => {
      const session = createTestSession({ id: "11111111-1111-1111-1111-111111111111" });
      await recovery.writeRecoveryLog(session);

      const storage = createMockStorageManager([session.metadata.id]);

      const crashed = await recovery.checkAndRecover(storage);

      expect(crashed).toHaveLength(1);
      expect(crashed[0]?.sessionId).toBe(session.metadata.id);
      expect(crashed[0]?.sessionExists).toBe(true);
    });

    it("should not include sessions that no longer exist in storage", async () => {
      const session = createTestSession({ id: "11111111-1111-1111-1111-111111111111" });
      await recovery.writeRecoveryLog(session);

      const storage = createMockStorageManager([]); // Session doesn't exist in storage

      const crashed = await recovery.checkAndRecover(storage);

      expect(crashed).toHaveLength(0);
    });

    it("should update recovery log status to crashed", async () => {
      const session = createTestSession({ id: "11111111-1111-1111-1111-111111111111" });
      await recovery.writeRecoveryLog(session);

      const storage = createMockStorageManager([session.metadata.id]);

      await recovery.checkAndRecover(storage);

      const log = await recovery.getRecoveryLog(session.metadata.id);
      expect(log?.status).toBe("crashed");
    });

    it("should sort crashed sessions by timestamp (most recent first)", async () => {
      const session1 = createTestSession({ id: "11111111-1111-1111-1111-111111111111" });
      const session2 = createTestSession({ id: "22222222-2222-2222-2222-222222222222" });

      await recovery.writeRecoveryLog(session1);
      // Small delay to ensure different timestamps
      await new Promise((r) => setTimeout(r, 10));
      await recovery.writeRecoveryLog(session2);

      const storage = createMockStorageManager([session1.metadata.id, session2.metadata.id]);

      const crashed = await recovery.checkAndRecover(storage);

      expect(crashed).toHaveLength(2);
      expect(crashed[0]?.sessionId).toBe(session2.metadata.id); // More recent first
    });

    it("should ignore non-active recovery logs", async () => {
      const sessionId = "11111111-1111-1111-1111-111111111111";
      const recoveryPath = path.join(tempDir, ".recovery");
      await fs.mkdir(recoveryPath, { recursive: true });

      // Write a "recovered" status log
      const log: RecoveryLog = {
        sessionId,
        timestamp: new Date(),
        messageCount: 0,
        status: "recovered",
      };
      await fs.writeFile(
        path.join(recoveryPath, `${sessionId}.recovery.json`),
        JSON.stringify(log),
        "utf-8"
      );

      const storage = createMockStorageManager([sessionId]);

      const crashed = await recovery.checkAndRecover(storage);

      expect(crashed).toHaveLength(0);
    });
  });

  // ===========================================================================
  // startupCheck Tests
  // ===========================================================================

  describe("startupCheck", () => {
    it("should return most recent crashed session", async () => {
      const session1 = createTestSession({ id: "11111111-1111-1111-1111-111111111111" });
      const session2 = createTestSession({ id: "22222222-2222-2222-2222-222222222222" });

      await recovery.writeRecoveryLog(session1);
      await new Promise((r) => setTimeout(r, 10));
      await recovery.writeRecoveryLog(session2);

      const storage = createMockStorageManager([session1.metadata.id, session2.metadata.id]);

      const result = await recovery.startupCheck(storage);

      expect(result.sessionToRecover).not.toBeNull();
      expect(result.sessionToRecover?.sessionId).toBe(session2.metadata.id);
      expect(result.totalCrashed).toBe(2);
    });

    it("should return null sessionToRecover when no crashed sessions", async () => {
      const storage = createMockStorageManager();

      const result = await recovery.startupCheck(storage);

      expect(result.sessionToRecover).toBeNull();
      expect(result.totalCrashed).toBe(0);
    });

    it("should clean up corrupted recovery logs", async () => {
      const recoveryPath = path.join(tempDir, ".recovery");
      await fs.mkdir(recoveryPath, { recursive: true });

      // Write corrupted file
      await fs.writeFile(
        path.join(recoveryPath, "corrupted.recovery.json"),
        "{ invalid json",
        "utf-8"
      );

      const storage = createMockStorageManager();

      const result = await recovery.startupCheck(storage);

      expect(result.corruptedCleaned).toBe(1);

      // Verify file was deleted
      const files = await fs.readdir(recoveryPath);
      expect(files).not.toContain("corrupted.recovery.json");
    });

    it("should clean up invalid schema recovery logs", async () => {
      const recoveryPath = path.join(tempDir, ".recovery");
      await fs.mkdir(recoveryPath, { recursive: true });

      // Write invalid schema file
      await fs.writeFile(
        path.join(recoveryPath, "invalid.recovery.json"),
        JSON.stringify({ wrong: "schema" }),
        "utf-8"
      );

      const storage = createMockStorageManager();

      const result = await recovery.startupCheck(storage);

      expect(result.corruptedCleaned).toBe(1);
    });

    it("should clean up orphaned recovery logs for non-existent sessions", async () => {
      const sessionId = "11111111-1111-1111-1111-111111111111";
      const recoveryPath = path.join(tempDir, ".recovery");
      await fs.mkdir(recoveryPath, { recursive: true });

      // Write recovery log with "recovered" status for non-existent session
      const log: RecoveryLog = {
        sessionId,
        timestamp: new Date(),
        messageCount: 0,
        status: "recovered",
      };
      await fs.writeFile(
        path.join(recoveryPath, `${sessionId}.recovery.json`),
        JSON.stringify(log),
        "utf-8"
      );

      const storage = createMockStorageManager([]); // Session doesn't exist

      await recovery.startupCheck(storage);

      // Verify orphaned log was cleaned up
      const files = await fs.readdir(recoveryPath);
      expect(files).not.toContain(`${sessionId}.recovery.json`);
    });

    it("should not clean up active logs even if session doesn't exist", async () => {
      const session = createTestSession({ id: "11111111-1111-1111-1111-111111111111" });
      await recovery.writeRecoveryLog(session);

      const storage = createMockStorageManager([]); // Session doesn't exist

      await recovery.startupCheck(storage);

      // Active log should be preserved for potential manual recovery
      const log = await recovery.getRecoveryLog(session.metadata.id);
      // The log may still exist but shouldn't be in crashed list
      expect(log).not.toBeNull();
    });
  });

  // ===========================================================================
  // markSessionActive Tests
  // ===========================================================================

  describe("markSessionActive", () => {
    it("should create recovery log with active status", async () => {
      const sessionId = "11111111-1111-1111-1111-111111111111";

      await recovery.markSessionActive(sessionId);

      const log = await recovery.getRecoveryLog(sessionId);
      expect(log?.status).toBe("active");
      expect(log?.messageCount).toBe(0);
    });

    it("should include message count and last message ID", async () => {
      const sessionId = "11111111-1111-1111-1111-111111111111";

      await recovery.markSessionActive(sessionId, 10, "msg-10");

      const log = await recovery.getRecoveryLog(sessionId);
      expect(log?.messageCount).toBe(10);
      expect(log?.lastMessageId).toBe("msg-10");
    });

    it("should create .recovery directory if needed", async () => {
      const newTempDir = path.join(tempDir, "new-dir");
      const rm = new RecoveryManager(newTempDir);

      await rm.markSessionActive("test-id");

      const stat = await fs.stat(path.join(newTempDir, ".recovery"));
      expect(stat.isDirectory()).toBe(true);
    });

    it("should throw RecoveryError on write failure", async () => {
      if (process.platform === "win32") {
        return; // Skip on Windows
      }

      const readOnlyDir = path.join(tempDir, "readonly-mark");
      await fs.mkdir(path.join(readOnlyDir, ".recovery"), { recursive: true });
      await fs.chmod(path.join(readOnlyDir, ".recovery"), 0o444);

      const rm = new RecoveryManager(readOnlyDir);

      try {
        await expect(rm.markSessionActive("test")).rejects.toThrow(RecoveryError);
      } finally {
        await fs.chmod(path.join(readOnlyDir, ".recovery"), 0o755);
      }
    });
  });

  // ===========================================================================
  // markSessionClosed Tests
  // ===========================================================================

  describe("markSessionClosed", () => {
    it("should delete recovery log", async () => {
      const sessionId = "11111111-1111-1111-1111-111111111111";
      await recovery.markSessionActive(sessionId);

      await recovery.markSessionClosed(sessionId);

      const log = await recovery.getRecoveryLog(sessionId);
      expect(log).toBeNull();
    });

    it("should not throw for non-existent session", async () => {
      await expect(recovery.markSessionClosed("non-existent")).resolves.not.toThrow();
    });
  });

  // ===========================================================================
  // updateRecoveryLogStatus Tests
  // ===========================================================================

  describe("updateRecoveryLogStatus", () => {
    it("should update status to recovered", async () => {
      const session = createTestSession({ id: "11111111-1111-1111-1111-111111111111" });
      await recovery.writeRecoveryLog(session);

      await recovery.updateRecoveryLogStatus(session.metadata.id, "recovered");

      const log = await recovery.getRecoveryLog(session.metadata.id);
      expect(log?.status).toBe("recovered");
    });

    it("should update timestamp when changing status", async () => {
      const session = createTestSession({ id: "11111111-1111-1111-1111-111111111111" });
      await recovery.writeRecoveryLog(session);

      const originalLog = await recovery.getRecoveryLog(session.metadata.id);
      const originalTimestamp = originalLog?.timestamp;

      await new Promise((r) => setTimeout(r, 10));
      await recovery.updateRecoveryLogStatus(session.metadata.id, "crashed");

      const updatedLog = await recovery.getRecoveryLog(session.metadata.id);
      expect(updatedLog?.timestamp.getTime()).toBeGreaterThan(originalTimestamp?.getTime());
    });

    it("should throw RecoveryError.notFound for missing log", async () => {
      await expect(recovery.updateRecoveryLogStatus("non-existent", "recovered")).rejects.toThrow(
        RecoveryError
      );

      try {
        await recovery.updateRecoveryLogStatus("non-existent", "recovered");
      } catch (error) {
        expect((error as RecoveryError).type).toBe(RecoveryErrorType.NOT_FOUND);
      }
    });
  });
});

// =============================================================================
// RecoveryError Tests
// =============================================================================

describe("RecoveryError", () => {
  describe("static factories", () => {
    it("should create IO error", () => {
      const cause = new Error("Original");
      const error = RecoveryError.io("IO failed", cause, "/some/path");

      expect(error).toBeInstanceOf(RecoveryError);
      expect(error.type).toBe(RecoveryErrorType.IO);
      expect(error.message).toBe("IO failed");
      expect(error.cause).toBe(cause);
      expect(error.path).toBe("/some/path");
    });

    it("should create parse error", () => {
      const cause = new SyntaxError("Invalid JSON");
      const error = RecoveryError.parse("Parse failed", cause, "session-123");

      expect(error).toBeInstanceOf(RecoveryError);
      expect(error.type).toBe(RecoveryErrorType.PARSE);
      expect(error.sessionId).toBe("session-123");
    });

    it("should create not found error", () => {
      const error = RecoveryError.notFound("session-456");

      expect(error).toBeInstanceOf(RecoveryError);
      expect(error.type).toBe(RecoveryErrorType.NOT_FOUND);
      expect(error.sessionId).toBe("session-456");
      expect(error.message).toContain("session-456");
    });
  });

  describe("properties", () => {
    it("should have correct name", () => {
      const error = new RecoveryError("Test", RecoveryErrorType.IO);

      expect(error.name).toBe("RecoveryError");
    });

    it("should preserve stack trace", () => {
      const error = new RecoveryError("Test", RecoveryErrorType.IO);

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain("RecoveryError");
    });
  });
});

// =============================================================================
// RecoveryLogSchema Tests
// =============================================================================

describe("RecoveryLogSchema", () => {
  it("should validate valid recovery log", () => {
    const log = {
      sessionId: "11111111-1111-1111-1111-111111111111",
      timestamp: new Date().toISOString(),
      messageCount: 5,
      lastMessageId: "msg-5",
      status: "active",
    };

    const result = RecoveryLogSchema.safeParse(log);

    expect(result.success).toBe(true);
  });

  it("should reject invalid sessionId format", () => {
    const log = {
      sessionId: "not-a-uuid",
      timestamp: new Date().toISOString(),
      messageCount: 0,
      status: "active",
    };

    const result = RecoveryLogSchema.safeParse(log);

    expect(result.success).toBe(false);
  });

  it("should reject negative messageCount", () => {
    const log = {
      sessionId: "11111111-1111-1111-1111-111111111111",
      timestamp: new Date().toISOString(),
      messageCount: -1,
      status: "active",
    };

    const result = RecoveryLogSchema.safeParse(log);

    expect(result.success).toBe(false);
  });

  it("should reject invalid status", () => {
    const log = {
      sessionId: "11111111-1111-1111-1111-111111111111",
      timestamp: new Date().toISOString(),
      messageCount: 0,
      status: "invalid",
    };

    const result = RecoveryLogSchema.safeParse(log);

    expect(result.success).toBe(false);
  });

  it("should allow optional lastMessageId", () => {
    const log = {
      sessionId: "11111111-1111-1111-1111-111111111111",
      timestamp: new Date().toISOString(),
      messageCount: 0,
      status: "active",
    };

    const result = RecoveryLogSchema.safeParse(log);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.lastMessageId).toBeUndefined();
    }
  });

  it("should coerce date strings to Date objects", () => {
    const timestamp = "2025-12-30T12:00:00.000Z";
    const log = {
      sessionId: "11111111-1111-1111-1111-111111111111",
      timestamp,
      messageCount: 0,
      status: "active",
    };

    const result = RecoveryLogSchema.safeParse(log);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.timestamp).toBeInstanceOf(Date);
    }
  });
});
