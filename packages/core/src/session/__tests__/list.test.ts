import { describe, expect, it, vi } from "vitest";
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE, DEFAULT_SORT, SessionListService } from "../list.js";
import type { StorageManager } from "../storage.js";
import type { SessionMetadata, SessionMode, SessionStatus } from "../types.js";

// =============================================================================
// Test Fixtures
// =============================================================================

function createMockMetadata(overrides: Partial<SessionMetadata> = {}): SessionMetadata {
  const now = new Date();
  return {
    id: crypto.randomUUID(),
    title: "Test Session",
    createdAt: now,
    updatedAt: now,
    lastActive: now,
    status: "active" as SessionStatus,
    mode: "chat" as SessionMode,
    tags: [],
    workingDirectory: "/test/path",
    tokenCount: 0,
    messageCount: 0,
    summary: undefined,
    ...overrides,
  };
}

function createMockStorage(sessions: SessionMetadata[]): StorageManager {
  const index = new Map<string, SessionMetadata>();
  for (const session of sessions) {
    index.set(session.id, session);
  }

  return {
    getIndex: vi.fn().mockResolvedValue(new Map(index)),
  } as unknown as StorageManager;
}

// =============================================================================
// Tests
// =============================================================================

describe("SessionListService", () => {
  describe("constructor", () => {
    it("creates service with storage manager", () => {
      const storage = createMockStorage([]);
      const service = new SessionListService(storage);
      expect(service).toBeInstanceOf(SessionListService);
    });
  });

  describe("listSessions", () => {
    it("returns all sessions when no filter is provided", async () => {
      const sessions = [createMockMetadata(), createMockMetadata(), createMockMetadata()];
      const storage = createMockStorage(sessions);
      const service = new SessionListService(storage);

      const result = await service.listSessions();

      expect(result.items).toHaveLength(3);
      expect(result.total).toBe(3);
      expect(result.page).toBe(DEFAULT_PAGE);
      expect(result.pageSize).toBe(DEFAULT_PAGE_SIZE);
      expect(result.hasMore).toBe(false);
    });

    it("returns empty result when no sessions exist", async () => {
      const storage = createMockStorage([]);
      const service = new SessionListService(storage);

      const result = await service.listSessions();

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.hasMore).toBe(false);
    });

    describe("filtering", () => {
      it("filters by single status", async () => {
        const sessions = [
          createMockMetadata({ status: "active" }),
          createMockMetadata({ status: "paused" }),
          createMockMetadata({ status: "completed" }),
        ];
        const storage = createMockStorage(sessions);
        const service = new SessionListService(storage);

        const result = await service.listSessions({ status: "active" });

        expect(result.items).toHaveLength(1);
        expect(result.items[0]?.status).toBe("active");
      });

      it("filters by multiple statuses", async () => {
        const sessions = [
          createMockMetadata({ status: "active" }),
          createMockMetadata({ status: "paused" }),
          createMockMetadata({ status: "completed" }),
          createMockMetadata({ status: "archived" }),
        ];
        const storage = createMockStorage(sessions);
        const service = new SessionListService(storage);

        const result = await service.listSessions({ status: ["active", "paused"] });

        expect(result.items).toHaveLength(2);
        expect(result.items.every((s) => s.status === "active" || s.status === "paused")).toBe(
          true
        );
      });

      it("filters by single mode", async () => {
        const sessions = [
          createMockMetadata({ mode: "chat" }),
          createMockMetadata({ mode: "code" }),
          createMockMetadata({ mode: "plan" }),
        ];
        const storage = createMockStorage(sessions);
        const service = new SessionListService(storage);

        const result = await service.listSessions({ mode: "code" });

        expect(result.items).toHaveLength(1);
        expect(result.items[0]?.mode).toBe("code");
      });

      it("filters by multiple modes", async () => {
        const sessions = [
          createMockMetadata({ mode: "chat" }),
          createMockMetadata({ mode: "code" }),
          createMockMetadata({ mode: "plan" }),
          createMockMetadata({ mode: "debug" }),
        ];
        const storage = createMockStorage(sessions);
        const service = new SessionListService(storage);

        const result = await service.listSessions({ mode: ["code", "debug"] });

        expect(result.items).toHaveLength(2);
        expect(result.items.every((s) => s.mode === "code" || s.mode === "debug")).toBe(true);
      });

      it("filters by tags (match any)", async () => {
        const sessions = [
          createMockMetadata({ tags: ["work", "important"] }),
          createMockMetadata({ tags: ["personal"] }),
          createMockMetadata({ tags: ["work"] }),
          createMockMetadata({ tags: [] }),
        ];
        const storage = createMockStorage(sessions);
        const service = new SessionListService(storage);

        const result = await service.listSessions({ tags: ["important", "personal"] });

        expect(result.items).toHaveLength(2);
        expect(
          result.items.every((s) => s.tags.includes("important") || s.tags.includes("personal"))
        ).toBe(true);
      });

      it("filters by working directory", async () => {
        const sessions = [
          createMockMetadata({ workingDirectory: "/project/a" }),
          createMockMetadata({ workingDirectory: "/project/b" }),
          createMockMetadata({ workingDirectory: "/project/a" }),
        ];
        const storage = createMockStorage(sessions);
        const service = new SessionListService(storage);

        const result = await service.listSessions({ workingDirectory: "/project/a" });

        expect(result.items).toHaveLength(2);
        expect(result.items.every((s) => s.workingDirectory === "/project/a")).toBe(true);
      });

      it("filters by createdAfter", async () => {
        const oldDate = new Date("2025-01-01");
        const newDate = new Date("2025-06-01");
        const sessions = [
          createMockMetadata({ createdAt: oldDate }),
          createMockMetadata({ createdAt: newDate }),
        ];
        const storage = createMockStorage(sessions);
        const service = new SessionListService(storage);

        const result = await service.listSessions({
          createdAfter: new Date("2025-03-01"),
        });

        expect(result.items).toHaveLength(1);
        expect(result.items[0]?.createdAt).toEqual(newDate);
      });

      it("filters by createdBefore", async () => {
        const oldDate = new Date("2025-01-01");
        const newDate = new Date("2025-06-01");
        const sessions = [
          createMockMetadata({ createdAt: oldDate }),
          createMockMetadata({ createdAt: newDate }),
        ];
        const storage = createMockStorage(sessions);
        const service = new SessionListService(storage);

        const result = await service.listSessions({
          createdBefore: new Date("2025-03-01"),
        });

        expect(result.items).toHaveLength(1);
        expect(result.items[0]?.createdAt).toEqual(oldDate);
      });

      it("filters by searchQuery on title", async () => {
        const sessions = [
          createMockMetadata({ title: "Code Review Session" }),
          createMockMetadata({ title: "Planning Meeting" }),
          createMockMetadata({ title: "Debug Issue #123" }),
        ];
        const storage = createMockStorage(sessions);
        const service = new SessionListService(storage);

        const result = await service.listSessions({ searchQuery: "review" });

        expect(result.items).toHaveLength(1);
        expect(result.items[0]?.title).toBe("Code Review Session");
      });

      it("filters by searchQuery on summary", async () => {
        const sessions = [
          createMockMetadata({ title: "Session A", summary: "Discussed API design" }),
          createMockMetadata({ title: "Session B", summary: "Fixed memory leak" }),
          createMockMetadata({ title: "Session C", summary: undefined }),
        ];
        const storage = createMockStorage(sessions);
        const service = new SessionListService(storage);

        const result = await service.listSessions({ searchQuery: "api" });

        expect(result.items).toHaveLength(1);
        expect(result.items[0]?.title).toBe("Session A");
      });

      it("searchQuery is case-insensitive", async () => {
        const sessions = [
          createMockMetadata({ title: "CODE REVIEW" }),
          createMockMetadata({ title: "code review" }),
          createMockMetadata({ title: "Code Review" }),
        ];
        const storage = createMockStorage(sessions);
        const service = new SessionListService(storage);

        const result = await service.listSessions({ searchQuery: "CODE" });

        expect(result.items).toHaveLength(3);
      });

      it("combines multiple filters", async () => {
        const sessions = [
          createMockMetadata({
            status: "active",
            mode: "code",
            tags: ["work"],
            title: "Active Code Work",
          }),
          createMockMetadata({
            status: "active",
            mode: "chat",
            tags: ["work"],
            title: "Active Chat Work",
          }),
          createMockMetadata({
            status: "paused",
            mode: "code",
            tags: ["work"],
            title: "Paused Code Work",
          }),
          createMockMetadata({
            status: "active",
            mode: "code",
            tags: ["personal"],
            title: "Active Code Personal",
          }),
        ];
        const storage = createMockStorage(sessions);
        const service = new SessionListService(storage);

        const result = await service.listSessions({
          status: "active",
          mode: "code",
          tags: ["work"],
        });

        expect(result.items).toHaveLength(1);
        expect(result.items[0]?.title).toBe("Active Code Work");
      });
    });

    describe("sorting", () => {
      it("sorts by createdAt ascending", async () => {
        const sessions = [
          createMockMetadata({ title: "C", createdAt: new Date("2025-03-01") }),
          createMockMetadata({ title: "A", createdAt: new Date("2025-01-01") }),
          createMockMetadata({ title: "B", createdAt: new Date("2025-02-01") }),
        ];
        const storage = createMockStorage(sessions);
        const service = new SessionListService(storage);

        const result = await service.listSessions(undefined, {
          field: "createdAt",
          direction: "asc",
        });

        expect(result.items.map((s) => s.title)).toEqual(["A", "B", "C"]);
      });

      it("sorts by createdAt descending", async () => {
        const sessions = [
          createMockMetadata({ title: "C", createdAt: new Date("2025-03-01") }),
          createMockMetadata({ title: "A", createdAt: new Date("2025-01-01") }),
          createMockMetadata({ title: "B", createdAt: new Date("2025-02-01") }),
        ];
        const storage = createMockStorage(sessions);
        const service = new SessionListService(storage);

        const result = await service.listSessions(undefined, {
          field: "createdAt",
          direction: "desc",
        });

        expect(result.items.map((s) => s.title)).toEqual(["C", "B", "A"]);
      });

      it("sorts by updatedAt", async () => {
        const sessions = [
          createMockMetadata({ title: "B", updatedAt: new Date("2025-02-01") }),
          createMockMetadata({ title: "C", updatedAt: new Date("2025-03-01") }),
          createMockMetadata({ title: "A", updatedAt: new Date("2025-01-01") }),
        ];
        const storage = createMockStorage(sessions);
        const service = new SessionListService(storage);

        const result = await service.listSessions(undefined, {
          field: "updatedAt",
          direction: "asc",
        });

        expect(result.items.map((s) => s.title)).toEqual(["A", "B", "C"]);
      });

      it("sorts by lastActive", async () => {
        const sessions = [
          createMockMetadata({ title: "A", lastActive: new Date("2025-01-01") }),
          createMockMetadata({ title: "C", lastActive: new Date("2025-03-01") }),
          createMockMetadata({ title: "B", lastActive: new Date("2025-02-01") }),
        ];
        const storage = createMockStorage(sessions);
        const service = new SessionListService(storage);

        const result = await service.listSessions(undefined, {
          field: "lastActive",
          direction: "desc",
        });

        expect(result.items.map((s) => s.title)).toEqual(["C", "B", "A"]);
      });

      it("sorts by title", async () => {
        const sessions = [
          createMockMetadata({ title: "Zebra Session" }),
          createMockMetadata({ title: "Alpha Session" }),
          createMockMetadata({ title: "Beta Session" }),
        ];
        const storage = createMockStorage(sessions);
        const service = new SessionListService(storage);

        const result = await service.listSessions(undefined, {
          field: "title",
          direction: "asc",
        });

        expect(result.items.map((s) => s.title)).toEqual([
          "Alpha Session",
          "Beta Session",
          "Zebra Session",
        ]);
      });

      it("sorts by messageCount", async () => {
        const sessions = [
          createMockMetadata({ title: "A", messageCount: 10 }),
          createMockMetadata({ title: "B", messageCount: 5 }),
          createMockMetadata({ title: "C", messageCount: 20 }),
        ];
        const storage = createMockStorage(sessions);
        const service = new SessionListService(storage);

        const result = await service.listSessions(undefined, {
          field: "messageCount",
          direction: "desc",
        });

        expect(result.items.map((s) => s.title)).toEqual(["C", "A", "B"]);
      });

      it("supports multi-field sorting", async () => {
        const sessions = [
          createMockMetadata({ title: "A2", status: "active", createdAt: new Date("2025-02-01") }),
          createMockMetadata({ title: "B1", status: "paused", createdAt: new Date("2025-01-01") }),
          createMockMetadata({ title: "A1", status: "active", createdAt: new Date("2025-01-01") }),
          createMockMetadata({ title: "B2", status: "paused", createdAt: new Date("2025-02-01") }),
        ];
        const storage = createMockStorage(sessions);
        const service = new SessionListService(storage);

        // Sort by title asc, then by createdAt desc
        const result = await service.listSessions(undefined, [
          { field: "title", direction: "asc" },
          { field: "createdAt", direction: "desc" },
        ]);

        expect(result.items.map((s) => s.title)).toEqual(["A1", "A2", "B1", "B2"]);
      });

      it("uses default sort when no sort is provided", async () => {
        const sessions = [
          createMockMetadata({ title: "Old", lastActive: new Date("2025-01-01") }),
          createMockMetadata({ title: "New", lastActive: new Date("2025-12-01") }),
          createMockMetadata({ title: "Mid", lastActive: new Date("2025-06-01") }),
        ];
        const storage = createMockStorage(sessions);
        const service = new SessionListService(storage);

        const result = await service.listSessions();

        // Default sort is lastActive desc
        expect(result.items.map((s) => s.title)).toEqual(["New", "Mid", "Old"]);
      });
    });

    describe("pagination", () => {
      it("paginates results correctly", async () => {
        const sessions = Array.from({ length: 25 }, (_, i) =>
          createMockMetadata({ title: `Session ${i + 1}` })
        );
        const storage = createMockStorage(sessions);
        const service = new SessionListService(storage);

        const page1 = await service.listSessions(undefined, undefined, {
          page: 1,
          pageSize: 10,
        });
        const page2 = await service.listSessions(undefined, undefined, {
          page: 2,
          pageSize: 10,
        });
        const page3 = await service.listSessions(undefined, undefined, {
          page: 3,
          pageSize: 10,
        });

        expect(page1.items).toHaveLength(10);
        expect(page1.total).toBe(25);
        expect(page1.page).toBe(1);
        expect(page1.hasMore).toBe(true);

        expect(page2.items).toHaveLength(10);
        expect(page2.page).toBe(2);
        expect(page2.hasMore).toBe(true);

        expect(page3.items).toHaveLength(5);
        expect(page3.page).toBe(3);
        expect(page3.hasMore).toBe(false);
      });

      it("handles page beyond total items", async () => {
        const sessions = [createMockMetadata(), createMockMetadata()];
        const storage = createMockStorage(sessions);
        const service = new SessionListService(storage);

        const result = await service.listSessions(undefined, undefined, {
          page: 10,
          pageSize: 20,
        });

        expect(result.items).toHaveLength(0);
        expect(result.total).toBe(2);
        expect(result.hasMore).toBe(false);
      });

      it("uses default pagination values", async () => {
        const sessions = Array.from({ length: 30 }, () => createMockMetadata());
        const storage = createMockStorage(sessions);
        const service = new SessionListService(storage);

        const result = await service.listSessions();

        expect(result.page).toBe(DEFAULT_PAGE);
        expect(result.pageSize).toBe(DEFAULT_PAGE_SIZE);
        expect(result.items).toHaveLength(DEFAULT_PAGE_SIZE);
      });
    });
  });

  describe("getRecentSessions", () => {
    it("returns sessions sorted by lastActive descending", async () => {
      const sessions = [
        createMockMetadata({ title: "Old", lastActive: new Date("2025-01-01") }),
        createMockMetadata({ title: "New", lastActive: new Date("2025-12-01") }),
        createMockMetadata({ title: "Mid", lastActive: new Date("2025-06-01") }),
      ];
      const storage = createMockStorage(sessions);
      const service = new SessionListService(storage);

      const result = await service.getRecentSessions();

      expect(result.map((s) => s.title)).toEqual(["New", "Mid", "Old"]);
    });

    it("respects the limit parameter", async () => {
      const sessions = Array.from({ length: 20 }, (_, i) =>
        createMockMetadata({
          title: `Session ${i}`,
          lastActive: new Date(2025, 0, i + 1),
        })
      );
      const storage = createMockStorage(sessions);
      const service = new SessionListService(storage);

      const result = await service.getRecentSessions(5);

      expect(result).toHaveLength(5);
    });

    it("uses default limit of 10", async () => {
      const sessions = Array.from({ length: 20 }, () => createMockMetadata());
      const storage = createMockStorage(sessions);
      const service = new SessionListService(storage);

      const result = await service.getRecentSessions();

      expect(result).toHaveLength(10);
    });

    it("returns all if fewer than limit exist", async () => {
      const sessions = [createMockMetadata(), createMockMetadata()];
      const storage = createMockStorage(sessions);
      const service = new SessionListService(storage);

      const result = await service.getRecentSessions(10);

      expect(result).toHaveLength(2);
    });
  });

  describe("countSessions", () => {
    it("returns total count when no filter is provided", async () => {
      const sessions = [createMockMetadata(), createMockMetadata(), createMockMetadata()];
      const storage = createMockStorage(sessions);
      const service = new SessionListService(storage);

      const count = await service.countSessions();

      expect(count).toBe(3);
    });

    it("returns count matching filter", async () => {
      const sessions = [
        createMockMetadata({ status: "active" }),
        createMockMetadata({ status: "active" }),
        createMockMetadata({ status: "paused" }),
        createMockMetadata({ status: "completed" }),
      ];
      const storage = createMockStorage(sessions);
      const service = new SessionListService(storage);

      const count = await service.countSessions({ status: "active" });

      expect(count).toBe(2);
    });

    it("returns 0 when no sessions match filter", async () => {
      const sessions = [
        createMockMetadata({ status: "active" }),
        createMockMetadata({ status: "paused" }),
      ];
      const storage = createMockStorage(sessions);
      const service = new SessionListService(storage);

      const count = await service.countSessions({ status: "archived" });

      expect(count).toBe(0);
    });
  });

  describe("getSessionsByTag", () => {
    it("returns all sessions with the specified tag", async () => {
      const sessions = [
        createMockMetadata({ title: "Work 1", tags: ["work", "important"] }),
        createMockMetadata({ title: "Personal", tags: ["personal"] }),
        createMockMetadata({ title: "Work 2", tags: ["work"] }),
        createMockMetadata({ title: "Empty", tags: [] }),
      ];
      const storage = createMockStorage(sessions);
      const service = new SessionListService(storage);

      const result = await service.getSessionsByTag("work");

      expect(result).toHaveLength(2);
      expect(result.every((s) => s.tags.includes("work"))).toBe(true);
    });

    it("returns empty array when no sessions have the tag", async () => {
      const sessions = [
        createMockMetadata({ tags: ["work"] }),
        createMockMetadata({ tags: ["personal"] }),
      ];
      const storage = createMockStorage(sessions);
      const service = new SessionListService(storage);

      const result = await service.getSessionsByTag("important");

      expect(result).toHaveLength(0);
    });

    it("returns sessions sorted by lastActive descending", async () => {
      const sessions = [
        createMockMetadata({
          title: "Old",
          tags: ["work"],
          lastActive: new Date("2025-01-01"),
        }),
        createMockMetadata({
          title: "New",
          tags: ["work"],
          lastActive: new Date("2025-12-01"),
        }),
        createMockMetadata({
          title: "Mid",
          tags: ["work"],
          lastActive: new Date("2025-06-01"),
        }),
      ];
      const storage = createMockStorage(sessions);
      const service = new SessionListService(storage);

      const result = await service.getSessionsByTag("work");

      expect(result.map((s) => s.title)).toEqual(["New", "Mid", "Old"]);
    });
  });

  describe("DEFAULT_SORT constant", () => {
    it("has correct default values", () => {
      expect(DEFAULT_SORT.field).toBe("lastActive");
      expect(DEFAULT_SORT.direction).toBe("desc");
    });
  });

  describe("edge cases", () => {
    it("handles sessions with string dates (from JSON)", async () => {
      const metadata = createMockMetadata();
      // Simulate JSON parsing where dates become strings
      const sessionWithStringDates = {
        ...metadata,
        createdAt: "2025-06-15T10:00:00.000Z" as unknown as Date,
        updatedAt: "2025-06-15T10:00:00.000Z" as unknown as Date,
        lastActive: "2025-06-15T10:00:00.000Z" as unknown as Date,
      };
      const storage = createMockStorage([sessionWithStringDates]);
      const service = new SessionListService(storage);

      const result = await service.listSessions(
        { createdAfter: new Date("2025-01-01") },
        { field: "lastActive", direction: "desc" }
      );

      expect(result.items).toHaveLength(1);
    });

    it("handles empty search query", async () => {
      const sessions = [createMockMetadata(), createMockMetadata()];
      const storage = createMockStorage(sessions);
      const service = new SessionListService(storage);

      const result = await service.listSessions({ searchQuery: "   " });

      expect(result.items).toHaveLength(2); // Should return all, empty query is ignored
    });

    it("handles empty tags array in filter", async () => {
      const sessions = [createMockMetadata({ tags: ["work"] }), createMockMetadata({ tags: [] })];
      const storage = createMockStorage(sessions);
      const service = new SessionListService(storage);

      const result = await service.listSessions({ tags: [] });

      expect(result.items).toHaveLength(2); // Empty tags filter should return all
    });
  });
});
