/**
 * End-to-End Integration Tests (T042)
 *
 * Comprehensive integration testing of the session system.
 * Tests all major components working together in realistic workflows.
 *
 * @module core/session/__tests__/integration
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CompactionService } from "../compaction.js";
import { ExportService } from "../export.js";
import { createAssistantMessage, createUserMessage, SessionParts } from "../message.js";
import { PersistenceManager } from "../persistence.js";
import { RecoveryManager } from "../recovery.js";
import { SearchService } from "../search.js";
import { Snapshot } from "../snapshot.js";
import { StorageManager } from "../storage.js";
import { SessionSwitcher } from "../switcher.js";
import { createSession, type Session } from "../types.js";

// =============================================================================
// Test Fixtures
// =============================================================================

let tempDir: string;
let storageManager: StorageManager;
let persistenceManager: PersistenceManager;
let recoveryManager: RecoveryManager;
let sessionSwitcher: SessionSwitcher;
let searchService: SearchService;
let exportService: ExportService;

beforeEach(async () => {
  // Create isolated temp directory for each test
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "vellum-integration-test-"));

  // Initialize all services
  storageManager = await StorageManager.create({ basePath: tempDir });
  persistenceManager = new PersistenceManager(storageManager, {
    autoSaveEnabled: false, // Manual saves for predictable testing
  });
  recoveryManager = new RecoveryManager(tempDir);
  sessionSwitcher = new SessionSwitcher(persistenceManager);
  searchService = new SearchService(storageManager);
  await searchService.initialize();
  exportService = new ExportService();
});

afterEach(async () => {
  // Clean shutdown
  await persistenceManager.closeSession();

  // Clean up temp directory
  try {
    await fs.rm(tempDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
});

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Creates a session with realistic conversation data.
 */
function createRealisticSession(title: string, messageCount = 5): Session {
  const session = createSession({
    title,
    workingDirectory: tempDir,
    tags: ["integration-test"],
  });

  // Add a realistic conversation
  for (let i = 0; i < messageCount; i++) {
    if (i % 2 === 0) {
      // User message
      session.messages.push(
        createUserMessage([SessionParts.text(`User question ${i}: Can you help with task ${i}?`)])
      );
    } else {
      // Assistant message with tool use
      session.messages.push(
        createAssistantMessage(
          [
            SessionParts.text(`Assistant response ${i}: I can help with that.`),
            SessionParts.tool(`tool-${i}`, "read_file", { path: `/test/file${i}.ts` }),
          ],
          { model: "claude-sonnet-4", tokens: { input: 50, output: 100 } }
        )
      );
    }
  }

  // Update metadata
  session.metadata.messageCount = messageCount;
  session.metadata.tokenCount = messageCount * 150;
  session.metadata.summary = `Test session: ${title}`;

  return session;
}

/**
 * Simulates adding messages to a session through persistence manager.
 */
async function addMessagesToSession(messages: number): Promise<void> {
  const session = persistenceManager.currentSession;
  if (!session) throw new Error("No active session");

  for (let i = 0; i < messages; i++) {
    const msg = createUserMessage([SessionParts.text(`Message ${i}`)]);
    await persistenceManager.onMessage(msg);
  }
}

// =============================================================================
// FULL WORKFLOW TEST
// =============================================================================

describe("Full Workflow Integration", () => {
  it("should complete full session lifecycle with crash recovery", async () => {
    // =========================================================================
    // Step 1: Create new session
    // =========================================================================
    const session = await sessionSwitcher.createNewSession({
      title: "Integration Test Session",
      workingDirectory: tempDir,
      tags: ["test", "integration"],
    });

    expect(session).toBeDefined();
    expect(session.metadata.id).toBeDefined();
    expect(session.metadata.title).toBe("Integration Test Session");
    expect(persistenceManager.currentSession?.metadata.id).toBe(session.metadata.id);

    // =========================================================================
    // Step 2: Add messages
    // =========================================================================
    const userMsg1 = createUserMessage([SessionParts.text("Hello, can you help me?")]);
    const assistantMsg1 = createAssistantMessage([
      SessionParts.text("Of course! What do you need help with?"),
    ]);
    const userMsg2 = createUserMessage([SessionParts.text("I need to implement a feature.")]);

    await persistenceManager.onMessage(userMsg1);
    await persistenceManager.onMessage(assistantMsg1);
    await persistenceManager.onMessage(userMsg2);

    expect(persistenceManager.currentSession?.messages.length).toBe(3);

    // Save the session
    await persistenceManager.save();

    // Verify session was persisted
    const loaded1 = await storageManager.load(session.metadata.id);
    expect(loaded1).not.toBeNull();
    expect(loaded1?.messages.length).toBe(3);

    // =========================================================================
    // Step 3: Create checkpoint
    // =========================================================================
    const checkpointId = await persistenceManager.createCheckpointAt(
      "Checkpoint before implementing new feature"
    );

    expect(checkpointId).toBeDefined();
    expect(persistenceManager.currentSession?.checkpoints.length).toBe(1);

    // Save after checkpoint
    await persistenceManager.save();

    // =========================================================================
    // Step 4: Simulate crash (don't save new messages)
    // =========================================================================
    // Add more messages WITHOUT saving
    const crashMsg1 = createUserMessage([SessionParts.text("This won't be saved")]);
    const crashMsg2 = createAssistantMessage([SessionParts.text("This is lost on crash")]);

    persistenceManager.currentSession?.messages.push(crashMsg1, crashMsg2);
    expect(persistenceManager.currentSession?.messages.length).toBe(5);

    // Write recovery log (simulates active session)
    // biome-ignore lint/style/noNonNullAssertion: currentSession verified non-null above
    await recoveryManager.writeRecoveryLog(persistenceManager.currentSession!);

    // Simulate crash by closing without save
    await persistenceManager.closeSession();
    expect(persistenceManager.currentSession).toBeNull();

    // =========================================================================
    // Step 5: Recover from crash
    // =========================================================================
    // Check for crashed sessions
    const crashedSessions = await recoveryManager.checkAndRecover(storageManager);
    expect(crashedSessions.length).toBe(1);
    expect(crashedSessions[0]?.sessionId).toBe(session.metadata.id);

    // Recover the session
    const recovered = await storageManager.load(session.metadata.id);
    expect(recovered).toBeDefined();
    expect(recovered?.messages.length).toBe(3); // Only saved messages, not crash messages

    // =========================================================================
    // Step 6: Resume session
    // =========================================================================
    await persistenceManager.loadSession(session.metadata.id);
    expect(persistenceManager.currentSession).not.toBeNull();
    expect(persistenceManager.currentSession?.messages.length).toBe(3);
    expect(persistenceManager.currentSession?.checkpoints.length).toBe(1);

    // Continue working on the session
    const resumeMsg = createUserMessage([SessionParts.text("Continuing after recovery")]);
    await persistenceManager.onMessage(resumeMsg);
    await persistenceManager.save();

    expect(persistenceManager.currentSession?.messages.length).toBe(4);

    // =========================================================================
    // Step 7: Export to all formats
    // =========================================================================
    // biome-ignore lint/style/noNonNullAssertion: currentSession verified non-null above
    const sessionToExport = persistenceManager.currentSession!;

    // Export to Markdown
    const markdown = exportService.export(sessionToExport, { format: "markdown" });
    expect(markdown).toContain("# Integration Test Session");
    expect(markdown).toContain("Hello, can you help me?");
    expect(markdown).toContain("Continuing after recovery");

    // Export to JSON
    const json = exportService.export(sessionToExport, { format: "json" });
    expect(json).toContain(session.metadata.id);
    expect(json).toContain("Integration Test Session");

    // Export to HTML
    const html = exportService.export(sessionToExport, { format: "html" });
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Integration Test Session");

    // Export to text
    const text = exportService.export(sessionToExport, { format: "text" });
    expect(text).toContain("Integration Test Session");

    // =========================================================================
    // Step 8: Verify data integrity
    // =========================================================================
    // Reload from disk and verify all data is intact
    await persistenceManager.closeSession();
    const finalLoaded = await storageManager.load(session.metadata.id);

    expect(finalLoaded).not.toBeNull();
    expect(finalLoaded?.metadata.id).toBe(session.metadata.id);
    expect(finalLoaded?.metadata.title).toBe("Integration Test Session");
    expect(finalLoaded?.metadata.tags).toEqual(["test", "integration"]);
    expect(finalLoaded?.messages.length).toBe(4);
    expect(finalLoaded?.checkpoints.length).toBe(1);

    // Verify message content
    if (finalLoaded && finalLoaded.messages.length >= 4) {
      const msg0Part = finalLoaded.messages[0]?.parts[0];
      const msg3Part = finalLoaded.messages[3]?.parts[0];
      if (msg0Part && msg3Part) {
        expect(msg0Part).toMatchObject({
          type: "text",
          text: "Hello, can you help me?",
        });
        expect(msg3Part).toMatchObject({
          type: "text",
          text: "Continuing after recovery",
        });
      }
    }
  });
});

// =============================================================================
// SEARCH WORKFLOW TEST
// =============================================================================

describe("Full Search Workflow", () => {
  it("should search across multiple sessions with filters", async () => {
    // Create multiple sessions with different content
    const session1 = createRealisticSession("Python Development", 6);
    session1.metadata.tags = ["python", "backend"];
    session1.metadata.summary = "Discussion about Python async programming";
    if (session1.messages[0]?.parts[0]) {
      session1.messages[0].parts[0] = SessionParts.text("How do I use async/await in Python?");
    }

    const session2 = createRealisticSession("TypeScript Refactoring", 4);
    session2.metadata.tags = ["typescript", "refactoring"];
    session2.metadata.summary = "Refactoring TypeScript code for better type safety";
    if (session2.messages[0]?.parts[0]) {
      session2.messages[0].parts[0] = SessionParts.text("Help me refactor this TypeScript code");
    }

    const session3 = createRealisticSession("Database Optimization", 5);
    session3.metadata.tags = ["database", "performance"];
    session3.metadata.summary = "Optimizing SQL queries for better performance";
    if (session3.messages[0]?.parts[0]) {
      session3.messages[0].parts[0] = SessionParts.text("My SQL queries are slow");
    }

    // Save all sessions
    await storageManager.save(session1);
    await storageManager.save(session2);
    await storageManager.save(session3);

    // Index sessions for search
    await searchService.indexSession(session1);
    await searchService.indexSession(session2);
    await searchService.indexSession(session3);

    // Search by keyword in content
    const pythonResults = searchService.search("Python", {
      fields: ["content"],
    });
    expect(pythonResults.length).toBeGreaterThanOrEqual(1);
    expect(pythonResults.some((r) => r.sessionId === session1.metadata.id)).toBe(true);

    // Search by title
    const titleResults = searchService.search("TypeScript", {
      fields: ["title"],
    });
    expect(titleResults.length).toBeGreaterThanOrEqual(1);
    expect(titleResults.some((r) => r.sessionId === session2.metadata.id)).toBe(true);

    // Search with tag filter
    const tagResults = searchService.search("database");
    expect(tagResults.length).toBeGreaterThanOrEqual(1);
    expect(tagResults.some((r) => r.sessionId === session3.metadata.id)).toBe(true);

    // Search for all sessions by searching for common term
    // All realistic sessions have "User question" text
    const allResults = searchService.search("question", {
      fields: ["content"],
    });
    expect(allResults.length).toBeGreaterThanOrEqual(3); // All sessions created in this test

    // Combined search: keyword in specific fields
    const combinedResults = searchService.search("refactor", {
      fields: ["content", "summary"],
    });
    expect(combinedResults.length).toBeGreaterThanOrEqual(1);
    expect(combinedResults.some((r) => r.sessionId === session2.metadata.id)).toBe(true);
  });
});

// =============================================================================
// FORK AND MERGE WORKFLOW TEST
// =============================================================================

describe("Fork and Merge Workflow", () => {
  it("should fork session and merge multiple sessions", async () => {
    // =========================================================================
    // Create original session
    // =========================================================================
    const original = await sessionSwitcher.createNewSession({
      title: "Original Session",
      workingDirectory: tempDir,
      tags: ["original"],
    });

    await addMessagesToSession(3);
    await persistenceManager.save();

    const originalId = original.metadata.id;

    // Reload original to get updated message count
    const reloadedOriginal = await storageManager.load(originalId);
    if (!reloadedOriginal) throw new Error("Failed to reload original session");

    // =========================================================================
    // Fork the session
    // =========================================================================
    const forked = await sessionSwitcher.forkSession(originalId, {
      newTitle: "Forked Experiment",
      includeTags: true,
    });

    expect(forked).toBeDefined();
    expect(forked.metadata.id).not.toBe(originalId);
    expect(forked.metadata.title).toBe("Forked Experiment");
    expect(forked.metadata.tags).toContain("original");
    expect(forked.messages.length).toBe(reloadedOriginal.messages.length);

    // Verify fork is independent
    await sessionSwitcher.switchTo(forked.metadata.id);
    await addMessagesToSession(2);
    await persistenceManager.save();

    const forkedAfterEdit = await storageManager.load(forked.metadata.id);
    const originalAfterFork = await storageManager.load(originalId);

    expect(forkedAfterEdit?.messages.length).toBe(5);
    expect(originalAfterFork?.messages.length).toBe(3);

    // =========================================================================
    // Create another session for merge
    // =========================================================================
    const second = await sessionSwitcher.createNewSession({
      title: "Second Session",
      workingDirectory: tempDir,
      tags: ["second"],
    });

    await addMessagesToSession(2);
    await persistenceManager.save();

    // =========================================================================
    // Merge sessions
    // =========================================================================
    const merged = await sessionSwitcher.mergeSessions([originalId, second.metadata.id], {
      newTitle: "Merged Sessions",
      deduplicateMessages: false,
    });

    expect(merged).toBeDefined();
    expect(merged.metadata.title).toBe("Merged Sessions");
    expect(merged.messages.length).toBe(5); // 3 from original + 2 from second
    expect(merged.metadata.tags).toContain("original");
    expect(merged.metadata.tags).toContain("second");

    // Verify merged session is saved
    const mergedLoaded = await storageManager.load(merged.metadata.id);
    expect(mergedLoaded).not.toBeNull();
    expect(mergedLoaded?.messages.length).toBe(5);
  });
});

// =============================================================================
// AUTO-COMPACTION TRIGGER TEST
// =============================================================================

describe("Auto-Compaction Trigger", () => {
  it("should trigger compaction when thresholds are exceeded", async () => {
    // Create compaction service with lower thresholds for testing
    const compactionService = new CompactionService({
      tokenThreshold: 4000,
      warningThreshold: 3000,
    });

    // Create session with many messages
    const session = createSession({
      title: "Large Session",
      workingDirectory: tempDir,
    });

    // Add 100 messages to exceed compaction threshold
    for (let i = 0; i < 100; i++) {
      const msg = createUserMessage([SessionParts.text(`Message ${i}`)]);
      session.messages.push(msg);
    }

    session.metadata.messageCount = 100;
    session.metadata.tokenCount = 100 * 50; // 5000 tokens

    await storageManager.save(session);

    // Check if compaction should trigger
    const shouldCompact = compactionService.shouldCompact(session);
    expect(shouldCompact).toBe(true);

    // Create session with large tool outputs
    const toolSession = createSession({
      title: "Tool Output Session",
      workingDirectory: tempDir,
    });

    // Add messages with large tool results
    for (let i = 0; i < 5; i++) {
      toolSession.messages.push(
        createAssistantMessage([
          SessionParts.text("Running tool"),
          SessionParts.tool(`tool-${i}`, "read_file", { path: "/file.ts" }),
        ])
      );

      toolSession.messages.push({
        id: `result-${i}`,
        role: "tool_result",
        parts: [
          SessionParts.toolResult(
            `tool-${i}`,
            "x".repeat(50000), // 50KB of output
            false
          ),
        ],
        metadata: { createdAt: Date.now() },
      });
    }

    toolSession.metadata.messageCount = 10;
    toolSession.metadata.tokenCount = 50000;

    // Check compaction for tool outputs
    const toolCompact = compactionService.shouldCompact(toolSession);
    expect(toolCompact).toBe(true);
  });
});

// =============================================================================
// SNAPSHOT INTEGRATION TEST
// =============================================================================

describe("Snapshot Integration", () => {
  it("should integrate snapshots with checkpoints and session lifecycle", async () => {
    // Skip if git is not available
    const gitAvailable = await isGitAvailable();
    if (!gitAvailable) {
      // Skip test when git is not available
      return;
    }

    // Create a working directory for snapshots
    const workDir = path.join(tempDir, "workspace");
    await fs.mkdir(workDir, { recursive: true });

    // Initialize snapshot system
    const snapshotResult = await Snapshot.init(workDir);
    expect(snapshotResult.ok).toBe(true);
    if (!snapshotResult.ok) return;

    // Create initial files
    await fs.writeFile(path.join(workDir, "main.ts"), "console.log('v1');", "utf-8");
    await fs.writeFile(path.join(workDir, "config.json"), '{"version": 1}', "utf-8");

    // Create session with snapshot
    await sessionSwitcher.createNewSession({
      title: "Snapshot Test",
      workingDirectory: workDir,
    });

    await addMessagesToSession(2);
    await persistenceManager.save();

    // Create checkpoint with snapshot
    const snapshot1 = await Snapshot.track(workDir, ["main.ts", "config.json"], "Checkpoint 1");
    expect(snapshot1.ok).toBe(true);

    const checkpoint1Id = await persistenceManager.createCheckpointAt(
      "First checkpoint with snapshot"
    );

    expect(checkpoint1Id).toBeDefined();

    // Modify files
    await fs.writeFile(path.join(workDir, "main.ts"), "console.log('v2');", "utf-8");
    await fs.writeFile(path.join(workDir, "new-file.ts"), "// New file", "utf-8");

    await addMessagesToSession(2);
    await persistenceManager.save();

    // Create second checkpoint with snapshot
    const snapshot2 = await Snapshot.track(
      workDir,
      ["main.ts", "config.json", "new-file.ts"],
      "Checkpoint 2"
    );
    expect(snapshot2.ok).toBe(true);

    await persistenceManager.createCheckpointAt("Second checkpoint with snapshot");

    // Get diff between snapshots
    if (snapshot1.ok && snapshot2.ok) {
      const diffResult = await Snapshot.diff(workDir, snapshot1.value);
      expect(diffResult.ok).toBe(true);
      if (diffResult.ok) {
        expect(diffResult.value).toContain("main.ts");
      }
    }

    // Restore to first checkpoint
    if (snapshot1.ok) {
      const restoreResult = await Snapshot.restore(workDir, snapshot1.value);
      expect(restoreResult.ok).toBe(true);

      // Verify files restored
      const restoredContent = await fs.readFile(path.join(workDir, "main.ts"), "utf-8");
      expect(restoredContent.trim()).toBe("console.log('v1');");

      // Note: Snapshot restore doesn't delete files not in the snapshot
      // It only restores tracked files to their snapshot state
      // new-file.ts will still exist since restore doesn't remove untracked files
    }
  });
});

// =============================================================================
// HISTORY SERVICE INTEGRATION TEST
// SESSION SWITCHER HISTORY TEST
// =============================================================================

describe("Session Switcher History", () => {
  it("should track session switch history", async () => {
    // Create multiple sessions
    const session1 = await sessionSwitcher.createNewSession({
      title: "Session 1",
      workingDirectory: tempDir,
    });

    const session2 = await sessionSwitcher.createNewSession({
      title: "Session 2",
      workingDirectory: tempDir,
    });

    const session3 = await sessionSwitcher.createNewSession({
      title: "Session 3",
      workingDirectory: tempDir,
    });

    // Switch between sessions
    await sessionSwitcher.switchTo(session1.metadata.id);
    await sessionSwitcher.switchTo(session2.metadata.id);
    await sessionSwitcher.switchTo(session3.metadata.id);

    // Get session switch history
    const history = sessionSwitcher.getHistory();
    expect(history).toBeDefined();
    expect(history.length).toBeGreaterThan(0);
    expect(history).toContain(session1.metadata.id);
    expect(history).toContain(session2.metadata.id);
    expect(history).toContain(session3.metadata.id);

    // Verify checkpoints are tracked in session
    await sessionSwitcher.switchTo(session1.metadata.id);
    await addMessagesToSession(2);
    await persistenceManager.save();

    await persistenceManager.createCheckpointAt("First Checkpoint");

    await addMessagesToSession(2);
    await persistenceManager.save();

    await persistenceManager.createCheckpointAt("Second Checkpoint");

    // Reload and verify checkpoints persisted
    await persistenceManager.closeSession();
    await persistenceManager.loadSession(session1.metadata.id);

    expect(persistenceManager.currentSession?.checkpoints.length).toBe(2);
  });
});

// =============================================================================
// MULTI-SESSION OPERATIONS TEST
// =============================================================================

describe("Multi-Session Operations", () => {
  it("should handle concurrent session operations", async () => {
    // Create multiple sessions
    const sessions: Session[] = [];
    for (let i = 0; i < 5; i++) {
      const session = await sessionSwitcher.createNewSession({
        title: `Session ${i}`,
        workingDirectory: tempDir,
        tags: [`tag-${i % 2}`], // Alternate tags
      });
      await addMessagesToSession(3);
      await persistenceManager.save();

      // Reload session to get saved state and index it
      const saved = await storageManager.load(session.metadata.id);
      if (saved) {
        await searchService.indexSession(saved);
        sessions.push(saved);
      }
    }

    // Switch between sessions
    for (const session of sessions) {
      await sessionSwitcher.switchTo(session.metadata.id);
      expect(persistenceManager.currentSession?.metadata.id).toBe(session.metadata.id);
    }

    // Search across all sessions
    const searchResults = searchService.search("Message", {
      fields: ["content"],
    });
    expect(searchResults.length).toBeGreaterThanOrEqual(5);

    // Filter by tag
    const tag0Results = searchService.search("tag-0");
    expect(tag0Results.length).toBeGreaterThanOrEqual(1); // Sessions with tag-0

    const tag1Results = searchService.search("tag-1");
    expect(tag1Results.length).toBeGreaterThanOrEqual(1); // Sessions with tag-1

    // Export all sessions
    for (const session of sessions) {
      const loaded = await storageManager.load(session.metadata.id);
      expect(loaded).not.toBeNull();

      if (loaded) {
        const markdown = exportService.export(loaded, { format: "markdown" });
        expect(markdown).toContain(session.metadata.title);

        const json = exportService.export(loaded, { format: "json" });
        expect(json).toContain(session.metadata.id);
      }
    }

    // Delete sessions
    if (sessions[0]) {
      await storageManager.delete(sessions[0].metadata.id);

      // Verify deletion - load should throw error
      let deleted = null;
      try {
        deleted = await storageManager.load(sessions[0].metadata.id);
      } catch {
        // Expected - session not found
      }
      expect(deleted).toBeNull();
    }

    // Verify remaining sessions
    const index = await storageManager.getIndex();
    expect(index.size).toBe(4);
  });
});

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Checks if git is available on the system.
 */
async function isGitAvailable(): Promise<boolean> {
  try {
    const { simpleGit } = await import("simple-git");
    const git = simpleGit();
    await git.version();
    return true;
  } catch {
    return false;
  }
}
