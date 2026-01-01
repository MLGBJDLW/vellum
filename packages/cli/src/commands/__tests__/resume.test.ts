/**
 * Resume Command Tests
 *
 * Tests for the session resume command including:
 * - Resume by full ID
 * - Resume by short ID
 * - Resume most recent (--last flag)
 * - Session not found handling
 * - No sessions available
 *
 * @module cli/commands/__tests__/resume
 */

import type { Session, SessionListService, SessionMetadata, StorageManager } from "@vellum/core";
import { describe, expect, it, vi } from "vitest";
import {
  createResumeCommand,
  findSessionById,
  formatSessionChoice,
  getMostRecentSession,
  groupSessionsByDirectory,
  type SessionLookupOptions,
  SHORT_ID_LENGTH,
} from "../session/resume.js";
import type { CommandContext, CommandError, CommandPending, ParsedArgs } from "../types.js";

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Create mock session metadata for testing.
 */
function createMockMetadata(overrides: Partial<SessionMetadata> = {}): SessionMetadata {
  const now = new Date();
  return {
    id: `test-${crypto.randomUUID()}`,
    title: "Test Session",
    createdAt: now,
    updatedAt: now,
    lastActive: now,
    status: "active",
    mode: "chat",
    tags: [],
    workingDirectory: "/test/path",
    tokenCount: 100,
    messageCount: 5,
    summary: "Test session summary",
    ...overrides,
  };
}

/**
 * Create a mock session for testing.
 */
function createMockSession(metadata: SessionMetadata): Session {
  return {
    metadata,
    messages: [],
    config: {},
  } as unknown as Session;
}

/**
 * Create a mock storage manager for testing.
 */
function createMockStorage(sessions: SessionMetadata[]): StorageManager {
  const index = new Map<string, SessionMetadata>();
  for (const session of sessions) {
    index.set(session.id, session);
  }

  return {
    getIndex: vi.fn().mockResolvedValue(new Map(index)),
    load: vi.fn().mockImplementation(async (id: string) => {
      const metadata = index.get(id);
      if (!metadata) {
        throw new Error(`Session not found: ${id}`);
      }
      return createMockSession(metadata);
    }),
  } as unknown as StorageManager;
}

/**
 * Create a mock list service for testing.
 */
function createMockListService(sessions: SessionMetadata[]): SessionListService {
  return {
    getRecentSessions: vi
      .fn()
      .mockResolvedValue(
        [...sessions].sort((a, b) => b.lastActive.getTime() - a.lastActive.getTime())
      ),
  } as unknown as SessionListService;
}

/**
 * Create a mock CommandContext for testing.
 */
function createMockContext(overrides: Partial<ParsedArgs> = {}): CommandContext {
  return {
    session: {
      id: "test-session",
      provider: "anthropic",
      cwd: "/test",
    },
    credentials: {
      resolve: vi.fn(),
      store: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(),
    } as unknown as CommandContext["credentials"],
    toolRegistry: {
      get: vi.fn(),
      list: vi.fn(),
    } as unknown as CommandContext["toolRegistry"],
    parsedArgs: {
      command: overrides.command ?? "resume",
      positional: overrides.positional ?? [],
      named: overrides.named ?? {},
      raw: overrides.raw ?? "/resume",
    },
    emit: vi.fn(),
  };
}

// =============================================================================
// findSessionById Tests
// =============================================================================

describe("findSessionById", () => {
  it("should find session by exact full ID", async () => {
    const sessionId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    const metadata = createMockMetadata({ id: sessionId, title: "Full ID Session" });
    const storage = createMockStorage([metadata]);
    const listService = createMockListService([metadata]);

    const options: SessionLookupOptions = { storage, listService };
    const result = await findSessionById(sessionId, options);

    expect(result.ok).toBe(true);
    expect(result.session).toBeDefined();
    expect(result.session?.metadata.title).toBe("Full ID Session");
  });

  it("should find session by short ID (first 8 chars)", async () => {
    const sessionId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    const shortId = sessionId.slice(0, SHORT_ID_LENGTH);
    const metadata = createMockMetadata({ id: sessionId, title: "Short ID Session" });
    const storage = createMockStorage([metadata]);
    const listService = createMockListService([metadata]);

    const options: SessionLookupOptions = { storage, listService };
    const result = await findSessionById(shortId, options);

    expect(result.ok).toBe(true);
    expect(result.session).toBeDefined();
    expect(result.session?.metadata.title).toBe("Short ID Session");
  });

  it("should return error when session not found", async () => {
    const metadata = createMockMetadata({ id: "existing-id-123" });
    const storage = createMockStorage([metadata]);
    const listService = createMockListService([metadata]);

    const options: SessionLookupOptions = { storage, listService };
    const result = await findSessionById("nonexistent", options);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("未找到会话");
  });

  it("should return error when multiple sessions match short ID", async () => {
    const sessions = [
      createMockMetadata({ id: "abc12345-1111-0000-0000-000000000001", title: "Session 1" }),
      createMockMetadata({ id: "abc12345-2222-0000-0000-000000000002", title: "Session 2" }),
    ];
    const storage = createMockStorage(sessions);
    const listService = createMockListService(sessions);

    const options: SessionLookupOptions = { storage, listService };
    const result = await findSessionById("abc12345", options);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("多个会话匹配");
  });

  it("should match short ID case-insensitively", async () => {
    const sessionId = "ABC12345-e5f6-7890-abcd-ef1234567890";
    const metadata = createMockMetadata({ id: sessionId, title: "Case Test" });
    const storage = createMockStorage([metadata]);
    const listService = createMockListService([metadata]);

    const options: SessionLookupOptions = { storage, listService };
    const result = await findSessionById("abc12345", options);

    expect(result.ok).toBe(true);
    expect(result.session?.metadata.title).toBe("Case Test");
  });
});

// =============================================================================
// getMostRecentSession Tests
// =============================================================================

describe("getMostRecentSession", () => {
  it("should return the most recent session", async () => {
    const now = new Date();
    const earlier = new Date(now.getTime() - 3600000);
    const sessions = [
      createMockMetadata({ id: "old-session", lastActive: earlier, title: "Old Session" }),
      createMockMetadata({ id: "new-session", lastActive: now, title: "New Session" }),
    ];
    const storage = createMockStorage(sessions);
    const listService = createMockListService(sessions);

    const options: SessionLookupOptions = { storage, listService };
    const result = await getMostRecentSession(options);

    expect(result.ok).toBe(true);
    expect(result.session?.metadata.title).toBe("New Session");
  });

  it("should return error when no sessions available", async () => {
    const storage = createMockStorage([]);
    const listService = createMockListService([]);

    const options: SessionLookupOptions = { storage, listService };
    const result = await getMostRecentSession(options);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("没有可恢复的会话");
  });
});

// =============================================================================
// createResumeCommand Tests
// =============================================================================

describe("createResumeCommand", () => {
  it("should create a valid slash command", () => {
    const storage = createMockStorage([]);
    const listService = createMockListService([]);

    const command = createResumeCommand(storage, listService);

    expect(command.name).toBe("resume");
    expect(command.aliases).toContain("r");
    expect(command.aliases).toContain("restore");
    expect(command.category).toBe("session");
  });

  describe("execute with --last flag", () => {
    it("should resume most recent session when --last flag is set", async () => {
      const metadata = createMockMetadata({ title: "Last Session" });
      const storage = createMockStorage([metadata]);
      const listService = createMockListService([metadata]);
      const command = createResumeCommand(storage, listService);

      const ctx = createMockContext({
        positional: [],
        named: { last: true },
      });

      const result = await command.execute(ctx);

      expect(result.kind).toBe("pending");
      const pendingResult = result as CommandPending;

      // Wait for the async promise to resolve
      const finalResult = await pendingResult.operation.promise;
      expect(finalResult.kind).toBe("success");
    });

    it("should return error when no sessions and --last flag", async () => {
      const storage = createMockStorage([]);
      const listService = createMockListService([]);
      const command = createResumeCommand(storage, listService);

      const ctx = createMockContext({
        positional: [],
        named: { last: true },
      });

      const result = await command.execute(ctx);
      expect(result.kind).toBe("pending");

      const pendingResult = result as CommandPending;
      const finalResult = await pendingResult.operation.promise;

      expect(finalResult.kind).toBe("error");
      const errorResult = finalResult as CommandError;
      expect(errorResult.message).toContain("没有可恢复的会话");
    });
  });

  describe("execute with session ID", () => {
    it("should resume session by full ID", async () => {
      const sessionId = "test-full-id-12345";
      const metadata = createMockMetadata({ id: sessionId, title: "Full ID Test" });
      const storage = createMockStorage([metadata]);
      const listService = createMockListService([metadata]);
      const command = createResumeCommand(storage, listService);

      const ctx = createMockContext({
        positional: [sessionId],
        named: {},
      });

      const result = await command.execute(ctx);
      expect(result.kind).toBe("pending");

      const pendingResult = result as CommandPending;
      const finalResult = await pendingResult.operation.promise;

      expect(finalResult.kind).toBe("success");
    });

    it("should resume session by short ID", async () => {
      const sessionId = "short123-full-uuid-here";
      const metadata = createMockMetadata({ id: sessionId, title: "Short ID Test" });
      const storage = createMockStorage([metadata]);
      const listService = createMockListService([metadata]);
      const command = createResumeCommand(storage, listService);

      const ctx = createMockContext({
        positional: ["short123"],
        named: {},
      });

      const result = await command.execute(ctx);
      expect(result.kind).toBe("pending");

      const pendingResult = result as CommandPending;
      const finalResult = await pendingResult.operation.promise;

      expect(finalResult.kind).toBe("success");
    });

    it("should return error when session not found", async () => {
      const storage = createMockStorage([]);
      const listService = createMockListService([]);
      const command = createResumeCommand(storage, listService);

      const ctx = createMockContext({
        positional: ["nonexistent"],
        named: {},
      });

      const result = await command.execute(ctx);
      expect(result.kind).toBe("pending");

      const pendingResult = result as CommandPending;
      const finalResult = await pendingResult.operation.promise;

      expect(finalResult.kind).toBe("error");
    });
  });

  describe("argument validation", () => {
    it("should return error when both session ID and --last are provided", async () => {
      const storage = createMockStorage([]);
      const listService = createMockListService([]);
      const command = createResumeCommand(storage, listService);

      const ctx = createMockContext({
        positional: ["some-id"],
        named: { last: true },
      });

      const result = await command.execute(ctx);

      expect(result.kind).toBe("error");
      const errorResult = result as CommandError;
      expect(errorResult.message).toContain("不能同时指定");
    });
  });

  describe("event emission", () => {
    it("should emit session:resume event on successful resume", async () => {
      const metadata = createMockMetadata({ title: "Event Test" });
      const storage = createMockStorage([metadata]);
      const listService = createMockListService([metadata]);
      const command = createResumeCommand(storage, listService);

      const ctx = createMockContext({
        positional: [],
        named: { last: true },
      });

      const result = await command.execute(ctx);
      const pendingResult = result as CommandPending;
      await pendingResult.operation.promise;

      expect(ctx.emit).toHaveBeenCalledWith(
        "session:resume",
        expect.objectContaining({
          session: expect.any(Object),
          usedLastFlag: true,
        })
      );
    });
  });
});

// =============================================================================
// Utility Function Tests
// =============================================================================

describe("formatSessionChoice", () => {
  it("should format session choice correctly", () => {
    const date = new Date("2025-12-30T14:30:00");
    const metadata = createMockMetadata({
      title: "Test Session",
      lastActive: date,
      messageCount: 15,
    });

    const formatted = formatSessionChoice(metadata, 1);

    expect(formatted).toContain("1.");
    expect(formatted).toContain("Test Session");
    expect(formatted).toContain("12/30");
    expect(formatted).toContain("14:30");
    expect(formatted).toContain("15条消息");
  });
});

describe("groupSessionsByDirectory", () => {
  it("should group sessions by working directory", () => {
    const sessions = [
      createMockMetadata({ workingDirectory: "/path/a", title: "Session A1" }),
      createMockMetadata({ workingDirectory: "/path/b", title: "Session B1" }),
      createMockMetadata({ workingDirectory: "/path/a", title: "Session A2" }),
    ];

    const grouped = groupSessionsByDirectory(sessions);

    expect(grouped.size).toBe(2);
    expect(grouped.get("/path/a")).toHaveLength(2);
    expect(grouped.get("/path/b")).toHaveLength(1);
  });

  it("should return empty map for empty input", () => {
    const grouped = groupSessionsByDirectory([]);
    expect(grouped.size).toBe(0);
  });
});
