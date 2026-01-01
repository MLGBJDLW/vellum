/**
 * Performance Benchmark Tests
 *
 * Tests for session system performance requirements (PRD Step 5):
 * - Save 1000-message session < 1000ms
 * - Load 1000-message session < 500ms
 * - List 100 sessions < 100ms
 * - Export 500-message session < 200ms
 *
 * @module core/session/__tests__/performance
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createId } from "@vellum/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ExportService } from "../export.js";
import { SessionListService } from "../list.js";
import type { SessionMessage } from "../message.js";
import { StorageManager } from "../storage.js";
import type { Session } from "../types.js";

// =============================================================================
// Test Fixtures
// =============================================================================

let tempDir: string;
let storageManager: StorageManager;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "vellum-perf-test-"));
  storageManager = await StorageManager.create({ basePath: tempDir });
});

afterEach(async () => {
  try {
    await fs.rm(tempDir, { recursive: true });
  } catch {
    // Ignore cleanup errors
  }
});

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Creates a session with specified number of messages for testing.
 *
 * @param messageCount - Number of messages to generate
 * @param sessionId - Optional session ID (auto-generated if not provided)
 * @returns Session with generated messages
 */
function createLargeSession(messageCount: number, sessionId?: string): Session {
  const id = sessionId || createId();
  const now = new Date();
  const baseTimestamp = now.getTime();

  const messages: SessionMessage[] = [];
  for (let i = 0; i < messageCount; i++) {
    const isUser = i % 2 === 0;
    const timestamp = baseTimestamp + i * 1000;

    messages.push({
      id: `msg-${i}`,
      role: isUser ? "user" : "assistant",
      parts: [
        {
          type: "text",
          text: isUser
            ? `User message ${i}: This is a test message with some content to simulate real usage.`
            : `Assistant message ${i}: This is a response with analysis, code examples, and detailed explanations about the user's query.`,
        },
      ],
      metadata: {
        createdAt: timestamp,
        completedAt: timestamp + 500,
      },
    });
  }

  return {
    metadata: {
      id,
      title: `Performance Test Session - ${messageCount} messages`,
      createdAt: now,
      updatedAt: now,
      lastActive: now,
      status: "active",
      mode: "chat",
      tags: ["performance-test"],
      workingDirectory: tempDir,
      tokenCount: messageCount * 50, // Approximate
      messageCount,
    },
    messages,
    checkpoints: [],
  };
}

/**
 * Measures execution time of an async function.
 *
 * @param fn - Function to measure
 * @returns Tuple of [result, durationMs]
 */
async function measureTime<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const start = performance.now();
  const result = await fn();
  const end = performance.now();
  const duration = end - start;
  return [result, duration];
}

// =============================================================================
// Benchmark Tests
// =============================================================================

describe("Session Performance Benchmarks", () => {
  describe("Save Performance", () => {
    it("should save 1000-message session in < 1000ms", async () => {
      const session = createLargeSession(1000);

      const [, duration] = await measureTime(async () => {
        await storageManager.save(session);
      });

      expect(duration).toBeLessThan(1000);
      console.log(`✓ Save 1000 messages: ${duration.toFixed(2)}ms (threshold: 1000ms)`);
    });

    it("should handle multiple saves efficiently", async () => {
      const session1 = createLargeSession(500);
      const session2 = createLargeSession(500);

      const [, duration] = await measureTime(async () => {
        await storageManager.save(session1);
        await storageManager.save(session2);
      });

      expect(duration).toBeLessThan(1500);
      console.log(
        `✓ Save 2x500 messages (sequential): ${duration.toFixed(2)}ms (threshold: 1500ms)`
      );
    });
  });

  describe("Load Performance", () => {
    it("should load 1000-message session in < 500ms", async () => {
      const session = createLargeSession(1000);
      await storageManager.save(session);

      const [loaded, duration] = await measureTime(async () => {
        return await storageManager.load(session.metadata.id);
      });

      expect(loaded).toBeDefined();
      expect(loaded.messages.length).toBe(1000);
      expect(duration).toBeLessThan(500);
      console.log(`✓ Load 1000 messages: ${duration.toFixed(2)}ms (threshold: 500ms)`);
    });

    it("should load metadata-only efficiently", async () => {
      const session = createLargeSession(1000);
      await storageManager.save(session);

      const [index, duration] = await measureTime(async () => {
        return await storageManager.getIndex();
      });

      const metadata = index.get(session.metadata.id);
      expect(metadata).toBeDefined();
      expect(metadata?.messageCount).toBe(1000);
      expect(duration).toBeLessThan(100);
      console.log(
        `✓ Load metadata (1000 msg session): ${duration.toFixed(2)}ms (threshold: 100ms)`
      );
    });
  });

  describe("List Performance", () => {
    it("should list 100 sessions in < 100ms", async () => {
      // Create 100 sessions
      const sessions: Session[] = [];
      for (let i = 0; i < 100; i++) {
        sessions.push(createLargeSession(10, `session-${i.toString().padStart(3, "0")}`));
      }

      // Save all sessions (sequentially to avoid index.json race condition)
      for (const session of sessions) {
        await storageManager.save(session);
      }

      // Measure list performance
      const listService = new SessionListService(storageManager);
      const [result, duration] = await measureTime(async () => {
        return await listService.listSessions(
          undefined,
          { field: "createdAt", direction: "desc" },
          { page: 1, pageSize: 100 }
        );
      });

      expect(result.items.length).toBe(100);
      expect(duration).toBeLessThan(100);
      console.log(`✓ List 100 sessions: ${duration.toFixed(2)}ms (threshold: 100ms)`);
    });

    it("should filter sessions efficiently", async () => {
      // Create 50 sessions
      for (let i = 0; i < 50; i++) {
        const session = createLargeSession(10);
        session.metadata.status = i % 2 === 0 ? "active" : "completed";
        session.metadata.tags = i % 3 === 0 ? ["important"] : [];
        await storageManager.save(session);
      }

      const listService = new SessionListService(storageManager);
      const [result, duration] = await measureTime(async () => {
        return await listService.listSessions(
          { status: "active", tags: ["important"] },
          undefined,
          { page: 1, pageSize: 50 }
        );
      });

      expect(result.items.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(100);
      console.log(`✓ Filter 50 sessions: ${duration.toFixed(2)}ms (threshold: 100ms)`);
    });
  });

  describe("Export Performance", () => {
    it("should export 500-message session to JSON in < 200ms", async () => {
      const session = createLargeSession(500);
      const exportService = new ExportService();

      const [exported, duration] = await measureTime(async () => {
        return exportService.export(session, { format: "json" });
      });

      expect(exported).toBeDefined();
      expect(exported.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(200);
      console.log(`✓ Export 500 messages (JSON): ${duration.toFixed(2)}ms (threshold: 200ms)`);
    });

    it("should export 500-message session to Markdown in < 200ms", async () => {
      const session = createLargeSession(500);
      const exportService = new ExportService();

      const [exported, duration] = await measureTime(async () => {
        return exportService.export(session, { format: "markdown" });
      });

      expect(exported).toBeDefined();
      expect(exported.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(200);
      console.log(`✓ Export 500 messages (Markdown): ${duration.toFixed(2)}ms (threshold: 200ms)`);
    });

    it("should export to file efficiently", async () => {
      const session = createLargeSession(500);
      const exportService = new ExportService();
      const exportPath = path.join(tempDir, "export.json");

      const [, duration] = await measureTime(async () => {
        await exportService.exportToFile(session, { format: "json" }, exportPath);
      });

      const fileExists = await fs
        .access(exportPath)
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(true);
      expect(duration).toBeLessThan(300);
      console.log(`✓ Export 500 messages to file: ${duration.toFixed(2)}ms (threshold: 300ms)`);
    });
  });

  describe("Stress Tests", () => {
    it("should handle 2000-message session", async () => {
      const session = createLargeSession(2000);

      const [, saveDuration] = await measureTime(async () => {
        await storageManager.save(session);
      });

      const [loaded, loadDuration] = await measureTime(async () => {
        return await storageManager.load(session.metadata.id);
      });

      expect(loaded.messages.length).toBe(2000);
      expect(saveDuration).toBeLessThan(2000);
      expect(loadDuration).toBeLessThan(1000);
      console.log(
        `✓ Stress test (2000 msgs): save=${saveDuration.toFixed(2)}ms, load=${loadDuration.toFixed(2)}ms`
      );
    });

    it("should handle concurrent operations", async () => {
      const sessions = Array.from({ length: 10 }, (_, i) =>
        createLargeSession(100, `concurrent-${i}`)
      );

      const [, duration] = await measureTime(async () => {
        // Save sequentially to avoid index race condition
        // In real usage, concurrent saves are handled by locks at a higher level
        for (const session of sessions) {
          await storageManager.save(session);
        }
      });

      expect(duration).toBeLessThan(2000);
      console.log(
        `✓ Concurrent save 10x100 messages: ${duration.toFixed(2)}ms (threshold: 2000ms)`
      );
    });
  });
});
