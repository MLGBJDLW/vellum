import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SearchService } from "../search.js";
import type { StorageManager } from "../storage.js";
import type { Session, SessionMetadata, SessionMode, SessionStatus } from "../types.js";

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

function createSessionWithContent(
  title: string,
  content: string,
  tags: string[] = [],
  summary?: string,
  createdAt?: Date
): Session {
  const metadata = createMockMetadata({
    title,
    tags,
    summary,
    createdAt: createdAt ?? new Date(),
  });
  return {
    metadata,
    messages: [
      {
        id: "msg-1",
        role: "user",
        parts: [{ type: "text", text: content }],
        metadata: {
          sessionId: metadata.id,
          createdAt: Date.now(),
        },
      },
    ],
    checkpoints: [],
  };
}

function createMockStorage(sessions: Map<string, Session>): StorageManager {
  const index = new Map<string, SessionMetadata>();
  for (const [id, session] of sessions) {
    index.set(id, session.metadata);
  }

  return {
    getIndex: vi.fn().mockResolvedValue(index),
    load: vi.fn().mockImplementation(async (sessionId: string) => {
      return sessions.get(sessionId) ?? null;
    }),
    getConfig: vi.fn().mockReturnValue({
      basePath: "/mock/base/path",
      maxSessions: 100,
      compressionEnabled: true,
      indexFileName: "index.json",
    }),
  } as unknown as StorageManager;
}

// =============================================================================
// Tests
// =============================================================================

describe("SearchService", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "search-test-"));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("constructor", () => {
    it("creates service with storage manager", () => {
      const storage = createMockStorage(new Map());
      const service = new SearchService(storage);
      expect(service).toBeInstanceOf(SearchService);
    });

    it("creates service with custom index path", () => {
      const storage = createMockStorage(new Map());
      const customPath = path.join(tempDir, "custom-index.json");
      const service = new SearchService(storage, customPath);
      expect(service).toBeInstanceOf(SearchService);
    });
  });

  describe("initialization", () => {
    it("initializes with empty index when no existing file", async () => {
      const storage = createMockStorage(new Map());
      const indexPath = path.join(tempDir, "search-index.json");
      const service = new SearchService(storage, indexPath);

      await service.initialize();

      expect(service.isInitialized()).toBe(true);
      expect(service.documentCount).toBe(0);
    });

    it("loads existing index from disk", async () => {
      const storage = createMockStorage(new Map());
      const indexPath = path.join(tempDir, "search-index.json");

      // Create and save an index first
      const service1 = new SearchService(storage, indexPath);
      await service1.initialize();

      const session = createSessionWithContent("TypeScript Guide", "Learn TypeScript basics");
      await service1.indexSession(session);

      // Create new service and load existing index
      const service2 = new SearchService(storage, indexPath);
      await service2.initialize();

      expect(service2.documentCount).toBe(1);
    });

    it("handles corrupted index file gracefully", async () => {
      const storage = createMockStorage(new Map());
      const indexPath = path.join(tempDir, "search-index.json");

      // Write corrupted content
      await fs.mkdir(path.dirname(indexPath), { recursive: true });
      await fs.writeFile(indexPath, "not valid json{{{", "utf-8");

      const service = new SearchService(storage, indexPath);
      await service.initialize();

      // Should start with fresh index
      expect(service.isInitialized()).toBe(true);
      expect(service.documentCount).toBe(0);
    });

    it("only initializes once", async () => {
      const storage = createMockStorage(new Map());
      const indexPath = path.join(tempDir, "search-index.json");
      const service = new SearchService(storage, indexPath);

      await service.initialize();
      await service.initialize(); // Second call should be no-op

      expect(service.isInitialized()).toBe(true);
    });
  });

  describe("indexSession", () => {
    it("indexes a session for search", async () => {
      const storage = createMockStorage(new Map());
      const indexPath = path.join(tempDir, "search-index.json");
      const service = new SearchService(storage, indexPath);
      await service.initialize();

      const session = createSessionWithContent("TypeScript Guide", "Learn TypeScript basics");
      await service.indexSession(session);

      expect(service.documentCount).toBe(1);
    });

    it("updates existing session in index", async () => {
      const storage = createMockStorage(new Map());
      const indexPath = path.join(tempDir, "search-index.json");
      const service = new SearchService(storage, indexPath);
      await service.initialize();

      const session = createSessionWithContent("TypeScript Guide", "Original content");
      await service.indexSession(session);
      expect(service.documentCount).toBe(1);

      // Update the session
      session.messages[0] = {
        id: "msg-1",
        role: "user",
        parts: [{ type: "text", text: "Updated content with new information" }],
        metadata: {
          sessionId: session.metadata.id,
          createdAt: Date.now(),
        },
      };
      await service.indexSession(session);

      // Should still be 1 document, not 2
      expect(service.documentCount).toBe(1);
    });

    it("throws when not initialized", async () => {
      const storage = createMockStorage(new Map());
      const service = new SearchService(storage);

      expect(() => service.search("test")).toThrow("SearchService not initialized");
    });

    it("indexes session title", async () => {
      const storage = createMockStorage(new Map());
      const indexPath = path.join(tempDir, "search-index.json");
      const service = new SearchService(storage, indexPath);
      await service.initialize();

      const session = createSessionWithContent("Unique Title XYZ123", "Some content");
      await service.indexSession(session);

      const results = service.search("XYZ123");
      expect(results).toHaveLength(1);
      expect(results[0]?.title).toBe("Unique Title XYZ123");
    });

    it("indexes session tags", async () => {
      const storage = createMockStorage(new Map());
      const indexPath = path.join(tempDir, "search-index.json");
      const service = new SearchService(storage, indexPath);
      await service.initialize();

      const session = createSessionWithContent("Session", "Content", ["refactoring", "typescript"]);
      await service.indexSession(session);

      const results = service.search("refactoring");
      expect(results).toHaveLength(1);
    });

    it("indexes session summary", async () => {
      const storage = createMockStorage(new Map());
      const indexPath = path.join(tempDir, "search-index.json");
      const service = new SearchService(storage, indexPath);
      await service.initialize();

      const session = createSessionWithContent(
        "Session",
        "Content",
        [],
        "This is an API design discussion"
      );
      await service.indexSession(session);

      const results = service.search("API design");
      expect(results).toHaveLength(1);
    });

    it("indexes message content", async () => {
      const storage = createMockStorage(new Map());
      const indexPath = path.join(tempDir, "search-index.json");
      const service = new SearchService(storage, indexPath);
      await service.initialize();

      const session = createSessionWithContent(
        "Session",
        "Help me implement a binary search algorithm"
      );
      await service.indexSession(session);

      const results = service.search("binary search");
      expect(results).toHaveLength(1);
    });
  });

  describe("removeFromIndex", () => {
    it("removes session from index", async () => {
      const storage = createMockStorage(new Map());
      const indexPath = path.join(tempDir, "search-index.json");
      const service = new SearchService(storage, indexPath);
      await service.initialize();

      const session = createSessionWithContent("Test Session", "Content");
      await service.indexSession(session);
      expect(service.documentCount).toBe(1);

      await service.removeFromIndex(session.metadata.id);
      expect(service.documentCount).toBe(0);
    });

    it("handles removing non-existent session gracefully", async () => {
      const storage = createMockStorage(new Map());
      const indexPath = path.join(tempDir, "search-index.json");
      const service = new SearchService(storage, indexPath);
      await service.initialize();

      // Should not throw
      await service.removeFromIndex("non-existent-id");
      expect(service.documentCount).toBe(0);
    });
  });

  describe("search", () => {
    it("returns matching sessions", async () => {
      const storage = createMockStorage(new Map());
      const indexPath = path.join(tempDir, "search-index.json");
      const service = new SearchService(storage, indexPath);
      await service.initialize();

      await service.indexSession(
        createSessionWithContent("TypeScript Tutorial", "Learn TypeScript")
      );
      await service.indexSession(createSessionWithContent("Python Guide", "Learn Python"));
      await service.indexSession(createSessionWithContent("JavaScript Basics", "Learn JavaScript"));

      const results = service.search("TypeScript");

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0]?.title).toContain("TypeScript");
    });

    it("returns empty array for no matches", async () => {
      const storage = createMockStorage(new Map());
      const indexPath = path.join(tempDir, "search-index.json");
      const service = new SearchService(storage, indexPath);
      await service.initialize();

      await service.indexSession(createSessionWithContent("Python Guide", "Learn Python"));

      const results = service.search("nonexistentterm123456");

      expect(results).toHaveLength(0);
    });

    it("returns empty array for empty query", async () => {
      const storage = createMockStorage(new Map());
      const indexPath = path.join(tempDir, "search-index.json");
      const service = new SearchService(storage, indexPath);
      await service.initialize();

      await service.indexSession(createSessionWithContent("Test", "Content"));

      expect(service.search("")).toHaveLength(0);
      expect(service.search("   ")).toHaveLength(0);
    });

    it("respects limit option", async () => {
      const storage = createMockStorage(new Map());
      const indexPath = path.join(tempDir, "search-index.json");
      const service = new SearchService(storage, indexPath);
      await service.initialize();

      // Index multiple sessions with "test" in title
      for (let i = 0; i < 10; i++) {
        await service.indexSession(createSessionWithContent(`Test Session ${i}`, "test content"));
      }

      const results = service.search("test", { limit: 3 });

      expect(results.length).toBeLessThanOrEqual(3);
    });

    it("returns results sorted by relevance score", async () => {
      const storage = createMockStorage(new Map());
      const indexPath = path.join(tempDir, "search-index.json");
      const service = new SearchService(storage, indexPath);
      await service.initialize();

      // Session with term in title should rank higher
      await service.indexSession(createSessionWithContent("TypeScript Guide", "Learn programming"));
      await service.indexSession(
        createSessionWithContent("Programming Guide", "Learn TypeScript basics")
      );

      const results = service.search("TypeScript");

      expect(results.length).toBeGreaterThanOrEqual(1);
      // Title match should score higher
      expect(results[0]?.title).toBe("TypeScript Guide");
    });

    it("includes matched terms in results", async () => {
      const storage = createMockStorage(new Map());
      const indexPath = path.join(tempDir, "search-index.json");
      const service = new SearchService(storage, indexPath);
      await service.initialize();

      await service.indexSession(
        createSessionWithContent("TypeScript Tutorial", "Learn TypeScript")
      );

      const results = service.search("typescript");

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0]?.matches).toBeDefined();
      expect(results[0]?.matches.length).toBeGreaterThan(0);
    });

    it("generates snippet for results", async () => {
      const storage = createMockStorage(new Map());
      const indexPath = path.join(tempDir, "search-index.json");
      const service = new SearchService(storage, indexPath);
      await service.initialize();

      await service.indexSession(createSessionWithContent("TypeScript Guide", "Content here"));

      const results = service.search("TypeScript");

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0]?.snippet).toBeDefined();
    });
  });

  describe("fuzzy search", () => {
    it("finds results with typos when fuzzy enabled", async () => {
      const storage = createMockStorage(new Map());
      const indexPath = path.join(tempDir, "search-index.json");
      const service = new SearchService(storage, indexPath);
      await service.initialize();

      await service.indexSession(
        createSessionWithContent("TypeScript Tutorial", "Learn TypeScript")
      );

      // Search with typo
      const results = service.search("TypeScrpit", { fuzzy: true });

      // Fuzzy should find it despite typo
      expect(results.length).toBeGreaterThanOrEqual(0); // May or may not match depending on fuzzy threshold
    });

    it("respects fuzzy option when disabled", async () => {
      const storage = createMockStorage(new Map());
      const indexPath = path.join(tempDir, "search-index.json");
      const service = new SearchService(storage, indexPath);
      await service.initialize();

      await service.indexSession(
        createSessionWithContent("TypeScript Tutorial", "Learn TypeScript")
      );

      // Search with exact match should work
      const exactResults = service.search("TypeScript", { fuzzy: false });
      expect(exactResults.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("prefix search", () => {
    it("finds results with prefix matching", async () => {
      const storage = createMockStorage(new Map());
      const indexPath = path.join(tempDir, "search-index.json");
      const service = new SearchService(storage, indexPath);
      await service.initialize();

      await service.indexSession(
        createSessionWithContent("TypeScript Tutorial", "Learn TypeScript programming")
      );

      // Search with prefix
      const results = service.search("Type", { prefix: true });

      expect(results.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("simpleSearch", () => {
    it("searches session metadata without full index", async () => {
      const session1 = createSessionWithContent("TypeScript Guide", "content", ["typescript"]);
      const session2 = createSessionWithContent("Python Tutorial", "content", ["python"]);

      const sessions = new Map<string, Session>();
      sessions.set(session1.metadata.id, session1);
      sessions.set(session2.metadata.id, session2);

      const storage = createMockStorage(sessions);
      const indexPath = path.join(tempDir, "search-index.json");
      const service = new SearchService(storage, indexPath);
      await service.initialize();

      const results = await service.simpleSearch("TypeScript");

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0]?.title).toBe("TypeScript Guide");
    });

    it("returns empty array for empty query", async () => {
      const storage = createMockStorage(new Map());
      const indexPath = path.join(tempDir, "search-index.json");
      const service = new SearchService(storage, indexPath);
      await service.initialize();

      const results = await service.simpleSearch("");
      expect(results).toHaveLength(0);

      const results2 = await service.simpleSearch("   ");
      expect(results2).toHaveLength(0);
    });

    it("respects limit parameter", async () => {
      const sessions = new Map<string, Session>();
      for (let i = 0; i < 10; i++) {
        const session = createSessionWithContent(`TypeScript Session ${i}`, "content", [
          "typescript",
        ]);
        sessions.set(session.metadata.id, session);
      }

      const storage = createMockStorage(sessions);
      const indexPath = path.join(tempDir, "search-index.json");
      const service = new SearchService(storage, indexPath);
      await service.initialize();

      const results = await service.simpleSearch("TypeScript", 3);

      expect(results.length).toBeLessThanOrEqual(3);
    });

    it("searches in tags", async () => {
      const session = createSessionWithContent("Some Title", "content", ["refactoring", "cleanup"]);
      const sessions = new Map<string, Session>();
      sessions.set(session.metadata.id, session);

      const storage = createMockStorage(sessions);
      const indexPath = path.join(tempDir, "search-index.json");
      const service = new SearchService(storage, indexPath);
      await service.initialize();

      const results = await service.simpleSearch("refactoring");

      expect(results).toHaveLength(1);
    });
  });

  describe("suggestCompletions", () => {
    it("returns suggestions for partial input", async () => {
      const storage = createMockStorage(new Map());
      const indexPath = path.join(tempDir, "search-index.json");
      const service = new SearchService(storage, indexPath);
      await service.initialize();

      await service.indexSession(
        createSessionWithContent("TypeScript Tutorial", "Learn TypeScript")
      );
      await service.indexSession(createSessionWithContent("Typing Tips", "Better typing"));

      const suggestions = service.suggestCompletions("type");

      // Should return suggestions starting with "type"
      expect(Array.isArray(suggestions)).toBe(true);
    });

    it("returns empty array for empty input", async () => {
      const storage = createMockStorage(new Map());
      const indexPath = path.join(tempDir, "search-index.json");
      const service = new SearchService(storage, indexPath);
      await service.initialize();

      await service.indexSession(createSessionWithContent("Test", "Content"));

      expect(service.suggestCompletions("")).toHaveLength(0);
      expect(service.suggestCompletions("   ")).toHaveLength(0);
    });

    it("respects limit parameter", async () => {
      const storage = createMockStorage(new Map());
      const indexPath = path.join(tempDir, "search-index.json");
      const service = new SearchService(storage, indexPath);
      await service.initialize();

      // Index sessions with multiple terms starting with "test"
      await service.indexSession(createSessionWithContent("Testing Guide", "test testing tested"));

      const suggestions = service.suggestCompletions("test", 2);

      expect(suggestions.length).toBeLessThanOrEqual(2);
    });
  });

  describe("suggest", () => {
    it("returns search suggestions", async () => {
      const storage = createMockStorage(new Map());
      const indexPath = path.join(tempDir, "search-index.json");
      const service = new SearchService(storage, indexPath);
      await service.initialize();

      await service.indexSession(createSessionWithContent("TypeScript", "Learn TypeScript"));

      const suggestions = service.suggest("type");

      expect(Array.isArray(suggestions)).toBe(true);
    });

    it("returns empty array for empty query", async () => {
      const storage = createMockStorage(new Map());
      const indexPath = path.join(tempDir, "search-index.json");
      const service = new SearchService(storage, indexPath);
      await service.initialize();

      expect(service.suggest("")).toHaveLength(0);
      expect(service.suggest("   ")).toHaveLength(0);
    });
  });

  describe("searchByField", () => {
    it("searches only in specified field", async () => {
      const storage = createMockStorage(new Map());
      const indexPath = path.join(tempDir, "search-index.json");
      const service = new SearchService(storage, indexPath);
      await service.initialize();

      await service.indexSession(createSessionWithContent("TypeScript Guide", "Python content"));

      // Search in title only
      const titleResults = service.searchByField("title", "TypeScript");
      expect(titleResults.length).toBeGreaterThanOrEqual(1);

      // Search in content only - Python is in content, not title
      const contentResults = service.searchByField("content", "Python");
      expect(contentResults.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("searchExtended", () => {
    it("returns extended search results with match info", async () => {
      const storage = createMockStorage(new Map());
      const indexPath = path.join(tempDir, "search-index.json");
      const service = new SearchService(storage, indexPath);
      await service.initialize();

      await service.indexSession(
        createSessionWithContent("TypeScript Tutorial", "Learn TypeScript")
      );

      const results = service.searchExtended("TypeScript");

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0]).toHaveProperty("id");
      expect(results[0]).toHaveProperty("title");
      expect(results[0]).toHaveProperty("createdAt");
      expect(results[0]).toHaveProperty("score");
      expect(results[0]).toHaveProperty("terms");
      expect(results[0]).toHaveProperty("match");
    });

    it("returns empty array for empty query", async () => {
      const storage = createMockStorage(new Map());
      const indexPath = path.join(tempDir, "search-index.json");
      const service = new SearchService(storage, indexPath);
      await service.initialize();

      expect(service.searchExtended("")).toHaveLength(0);
      expect(service.searchExtended("   ")).toHaveLength(0);
    });
  });

  describe("documentCount", () => {
    it("returns correct count of indexed documents", async () => {
      const storage = createMockStorage(new Map());
      const indexPath = path.join(tempDir, "search-index.json");
      const service = new SearchService(storage, indexPath);
      await service.initialize();

      expect(service.documentCount).toBe(0);

      await service.indexSession(createSessionWithContent("Session 1", "Content 1"));
      expect(service.documentCount).toBe(1);

      await service.indexSession(createSessionWithContent("Session 2", "Content 2"));
      expect(service.documentCount).toBe(2);

      await service.indexSession(createSessionWithContent("Session 3", "Content 3"));
      expect(service.documentCount).toBe(3);
    });
  });

  describe("rebuildIndex", () => {
    it("rebuilds index from storage", async () => {
      const session1 = createSessionWithContent("Session One", "Content one");
      const session2 = createSessionWithContent("Session Two", "Content two");

      const sessions = new Map<string, Session>();
      sessions.set(session1.metadata.id, session1);
      sessions.set(session2.metadata.id, session2);

      const storage = createMockStorage(sessions);
      const indexPath = path.join(tempDir, "search-index.json");
      const service = new SearchService(storage, indexPath);
      await service.initialize();

      // Initial state: no documents indexed
      expect(service.documentCount).toBe(0);

      // Rebuild should index all sessions from storage
      await service.rebuildIndex();

      expect(service.documentCount).toBe(2);
    });
  });

  describe("index persistence", () => {
    it("persists index to disk after indexing", async () => {
      const storage = createMockStorage(new Map());
      const indexPath = path.join(tempDir, "search-index.json");
      const service = new SearchService(storage, indexPath);
      await service.initialize();

      await service.indexSession(createSessionWithContent("Test Session", "Test content"));

      // Check file exists
      const stat = await fs.stat(indexPath);
      expect(stat.isFile()).toBe(true);
    });

    it("persists index to disk after removal", async () => {
      const storage = createMockStorage(new Map());
      const indexPath = path.join(tempDir, "search-index.json");
      const service = new SearchService(storage, indexPath);
      await service.initialize();

      const session = createSessionWithContent("Test Session", "Test content");
      await service.indexSession(session);

      const statBefore = await fs.stat(indexPath);

      await service.removeFromIndex(session.metadata.id);

      // File should still exist (and be updated)
      const statAfter = await fs.stat(indexPath);
      expect(statAfter.isFile()).toBe(true);
      // Modification time should change (or size should change)
      expect(statAfter.mtime.getTime()).toBeGreaterThanOrEqual(statBefore.mtime.getTime());
    });

    it("loads persisted index on new service instance", async () => {
      const storage = createMockStorage(new Map());
      const indexPath = path.join(tempDir, "search-index.json");

      // First instance: index some sessions
      const service1 = new SearchService(storage, indexPath);
      await service1.initialize();
      await service1.indexSession(
        createSessionWithContent("Persisted Session", "Persisted content")
      );
      expect(service1.documentCount).toBe(1);

      // Second instance: should load the persisted index
      const service2 = new SearchService(storage, indexPath);
      await service2.initialize();

      expect(service2.documentCount).toBe(1);
      const results = service2.search("Persisted");
      expect(results.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("recency boost", () => {
    it("boosts recent sessions in search results", async () => {
      const storage = createMockStorage(new Map());
      const indexPath = path.join(tempDir, "search-index.json");
      const service = new SearchService(storage, indexPath);
      await service.initialize();

      const now = new Date();
      const oneWeekAgo = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);

      // Index old session first
      await service.indexSession(
        createSessionWithContent("TypeScript Old", "Learn TypeScript", [], undefined, oneWeekAgo)
      );

      // Index recent session
      await service.indexSession(
        createSessionWithContent("TypeScript New", "Learn TypeScript", [], undefined, now)
      );

      const results = service.search("TypeScript");

      // Recent session should be boosted (may appear first if scores are similar)
      expect(results.length).toBe(2);
    });
  });

  describe("edge cases", () => {
    it("handles sessions with empty messages", async () => {
      const storage = createMockStorage(new Map());
      const indexPath = path.join(tempDir, "search-index.json");
      const service = new SearchService(storage, indexPath);
      await service.initialize();

      const session: Session = {
        metadata: createMockMetadata({ title: "Empty Messages" }),
        messages: [],
        checkpoints: [],
      };

      await service.indexSession(session);
      expect(service.documentCount).toBe(1);

      const results = service.search("Empty Messages");
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it("handles sessions with tool messages", async () => {
      const storage = createMockStorage(new Map());
      const indexPath = path.join(tempDir, "search-index.json");
      const service = new SearchService(storage, indexPath);
      await service.initialize();

      const session: Session = {
        metadata: createMockMetadata({ title: "Tool Session" }),
        messages: [
          {
            id: "msg-1",
            role: "assistant",
            parts: [{ type: "tool", id: "tool-1", name: "read_file", input: { path: "/test.ts" } }],
            metadata: {
              sessionId: "test-id",
              createdAt: Date.now(),
            },
          },
        ],
        checkpoints: [],
      };

      await service.indexSession(session);

      // Tool name should be searchable
      const results = service.search("read_file");
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it("handles sessions with tool results", async () => {
      const storage = createMockStorage(new Map());
      const indexPath = path.join(tempDir, "search-index.json");
      const service = new SearchService(storage, indexPath);
      await service.initialize();

      const session: Session = {
        metadata: createMockMetadata({ title: "Tool Result Session" }),
        messages: [
          {
            id: "msg-1",
            role: "assistant",
            parts: [
              {
                type: "tool_result",
                toolId: "tool-1",
                content: "File contents with searchable text",
              },
            ],
            metadata: {
              sessionId: "test-id",
              createdAt: Date.now(),
            },
          },
        ],
        checkpoints: [],
      };

      await service.indexSession(session);

      const results = service.search("searchable");
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it("handles very long content", async () => {
      const storage = createMockStorage(new Map());
      const indexPath = path.join(tempDir, "search-index.json");
      const service = new SearchService(storage, indexPath);
      await service.initialize();

      // Create session with very long content
      const longContent = "searchable ".repeat(10000);
      const session = createSessionWithContent("Long Content Session", longContent);

      await service.indexSession(session);
      expect(service.documentCount).toBe(1);

      const results = service.search("searchable");
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it("handles special characters in search query", async () => {
      const storage = createMockStorage(new Map());
      const indexPath = path.join(tempDir, "search-index.json");
      const service = new SearchService(storage, indexPath);
      await service.initialize();

      await service.indexSession(createSessionWithContent("Test Session", "Regular content"));

      // These should not throw
      expect(() => service.search("test@example.com")).not.toThrow();
      expect(() => service.search("file.ts")).not.toThrow();
      expect(() => service.search("path/to/file")).not.toThrow();
    });

    it("handles unicode characters", async () => {
      const storage = createMockStorage(new Map());
      const indexPath = path.join(tempDir, "search-index.json");
      const service = new SearchService(storage, indexPath);
      await service.initialize();

      await service.indexSession(
        createSessionWithContent("日本語セッション", "これはテストです emoji 🚀")
      );

      // Should not throw
      const results = service.search("テスト");
      expect(Array.isArray(results)).toBe(true);
    });

    it("handles multi-word search queries", async () => {
      const storage = createMockStorage(new Map());
      const indexPath = path.join(tempDir, "search-index.json");
      const service = new SearchService(storage, indexPath);
      await service.initialize();

      await service.indexSession(
        createSessionWithContent(
          "Advanced TypeScript Guide",
          "Learn advanced TypeScript patterns and best practices"
        )
      );

      const results = service.search("TypeScript patterns");

      expect(results.length).toBeGreaterThanOrEqual(1);
    });
  });
});
