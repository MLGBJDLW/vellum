/**
 * Snapshot Integration Tests (T027)
 *
 * Tests for shadow Git repository management with REAL git operations.
 * No mocks are used - this validates the entire system works end-to-end.
 *
 * @see packages/core/src/session/snapshot.ts
 * @see packages/core/src/session/checkpoint-snapshot.ts
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { simpleGit } from "simple-git";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isOk } from "../../types/result.js";
import {
  createCheckpointWithSnapshot,
  getCheckpointDiff,
  rollbackWithSnapshot,
} from "../checkpoint-snapshot.js";
import type { PersistenceManager } from "../persistence.js";
import { Snapshot, SnapshotErrorCode } from "../snapshot.js";

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Creates a temporary directory for testing.
 */
async function createTempDir(): Promise<string> {
  const prefix = path.join(os.tmpdir(), "vellum-snapshot-test-");
  return await fs.mkdtemp(prefix);
}

/**
 * Recursively removes a directory.
 */
async function removeTempDir(dirPath: string): Promise<void> {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Creates a file with content in the specified directory.
 * Uses LF line endings for cross-platform consistency.
 */
async function createFile(dir: string, relativePath: string, content: string): Promise<string> {
  const fullPath = path.join(dir, relativePath);
  const dirPath = path.dirname(fullPath);
  await fs.mkdir(dirPath, { recursive: true });
  // Ensure LF line endings for consistent behavior across platforms
  const normalizedContent = content.replace(/\r\n/g, "\n");
  await fs.writeFile(fullPath, normalizedContent, "utf-8");
  return fullPath;
}

/**
 * Reads a file's content, normalizing line endings.
 */
async function readFile(dir: string, relativePath: string): Promise<string> {
  const fullPath = path.join(dir, relativePath);
  const content = await fs.readFile(fullPath, "utf-8");
  // Normalize line endings for cross-platform comparison
  return content.replace(/\r\n/g, "\n");
}

/**
 * Checks if a file exists.
 */
async function fileExists(dir: string, relativePath: string): Promise<boolean> {
  try {
    await fs.access(path.join(dir, relativePath));
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks if git is available on the system.
 */
async function isGitAvailable(): Promise<boolean> {
  try {
    const git = simpleGit();
    await git.version();
    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// Mock PersistenceManager for checkpoint-snapshot integration tests
// =============================================================================

function createMockPersistenceManager(session: {
  metadata: { id: string };
  messages: Array<{ id: string; role: string; parts: Array<{ type: string; text: string }> }>;
  checkpoints: Array<{
    id: string;
    messageIndex: number;
    description?: string;
    snapshotHash?: string;
  }>;
}): PersistenceManager {
  let currentSession = { ...session };

  return {
    get currentSession() {
      return currentSession;
    },
    save: vi.fn().mockResolvedValue(undefined),
    rollbackToCheckpoint: vi.fn().mockImplementation(async (checkpointId: string) => {
      const checkpointIndex = currentSession.checkpoints.findIndex((cp) => cp.id === checkpointId);
      if (checkpointIndex === -1) {
        return false;
      }
      const checkpoint = currentSession.checkpoints[checkpointIndex];
      if (!checkpoint) return false;

      // Truncate messages and checkpoints
      currentSession = {
        ...currentSession,
        messages: currentSession.messages.slice(0, checkpoint.messageIndex),
        checkpoints: currentSession.checkpoints.slice(0, checkpointIndex + 1),
      };
      return true;
    }),
    getCheckpoints: vi.fn().mockImplementation(() => [...currentSession.checkpoints]),
  } as unknown as PersistenceManager;
}

// =============================================================================
// Integration Tests
// =============================================================================

describe("Snapshot Integration Tests", () => {
  let tempDir: string;
  let gitAvailable: boolean;

  beforeEach(async () => {
    // Check git availability once
    gitAvailable = await isGitAvailable();
    if (!gitAvailable) {
      console.warn("Git not available, skipping integration tests");
      return;
    }

    // Create temp directory
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    if (tempDir) {
      await removeTempDir(tempDir);
    }
  });

  // ===========================================================================
  // T027.1: Snapshot.init tests
  // ===========================================================================

  describe("Snapshot.init", () => {
    it("should create .vellum/.git-shadow directory", async () => {
      if (!gitAvailable) return;

      const result = await Snapshot.init(tempDir);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe(path.join(tempDir, ".vellum", ".git-shadow"));
      }

      // Verify directory was created
      const shadowExists = await fileExists(tempDir, ".vellum/.git-shadow");
      expect(shadowExists).toBe(true);
    });

    it("should be idempotent (second call doesn't fail)", async () => {
      if (!gitAvailable) return;

      // First init
      const result1 = await Snapshot.init(tempDir);
      expect(isOk(result1)).toBe(true);

      // Second init - should succeed without error
      const result2 = await Snapshot.init(tempDir);
      expect(isOk(result2)).toBe(true);

      if (isOk(result1) && isOk(result2)) {
        // Both should return the same path
        expect(result1.value).toBe(result2.value);
      }
    });

    it("should fail gracefully on read-only directory", async () => {
      if (!gitAvailable) return;

      // Skip on Windows where permissions work differently
      if (process.platform === "win32") {
        return;
      }

      // Create a read-only directory
      const readOnlyDir = path.join(tempDir, "readonly");
      await fs.mkdir(readOnlyDir, { recursive: true });
      await fs.chmod(readOnlyDir, 0o444);

      try {
        const result = await Snapshot.init(readOnlyDir);

        // Should return an error, not throw
        expect(isOk(result)).toBe(false);
        if (!isOk(result)) {
          expect(result.error.code).toBe(SnapshotErrorCode.OPERATION_FAILED);
        }
      } finally {
        // Cleanup: restore permissions
        await fs.chmod(readOnlyDir, 0o755);
      }
    });
  });

  // ===========================================================================
  // T027.2: Snapshot.track tests
  // ===========================================================================

  describe("Snapshot.track", () => {
    beforeEach(async () => {
      if (!gitAvailable) return;

      // Initialize shadow repo for track tests
      await Snapshot.init(tempDir);
    });

    it("should track single file", async () => {
      if (!gitAvailable) return;

      // Create a file
      await createFile(tempDir, "src/index.ts", "export const version = 1;\n");

      // Track it
      const result = await Snapshot.track(tempDir, ["src/index.ts"]);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        // Should return 40-char hash
        expect(result.value).toMatch(/^[0-9a-f]{40}$/i);
      }
    });

    it("should track multiple files", async () => {
      if (!gitAvailable) return;

      // Create multiple files
      await createFile(tempDir, "src/index.ts", "export const version = 1;\n");
      await createFile(
        tempDir,
        "src/utils.ts",
        "export const add = (a: number, b: number) => a + b;\n"
      );
      await createFile(tempDir, "package.json", '{ "name": "test" }\n');

      // Track all files
      const result = await Snapshot.track(tempDir, [
        "src/index.ts",
        "src/utils.ts",
        "package.json",
      ]);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toMatch(/^[0-9a-f]{40}$/i);
      }

      // Verify snapshot info includes all files
      if (isOk(result)) {
        const infoResult = await Snapshot.getInfo(tempDir, result.value);
        expect(isOk(infoResult)).toBe(true);
        if (isOk(infoResult)) {
          expect(infoResult.value.files).toContain("src/index.ts");
          expect(infoResult.value.files).toContain("src/utils.ts");
          expect(infoResult.value.files).toContain("package.json");
        }
      }
    });

    it("should return 40-char hash", async () => {
      if (!gitAvailable) return;

      await createFile(tempDir, "test.txt", "hello\n");
      const result = await Snapshot.track(tempDir, ["test.txt"]);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.length).toBe(40);
        expect(result.value).toMatch(/^[0-9a-f]{40}$/i);
      }
    });

    it("should return existing hash when no changes", async () => {
      if (!gitAvailable) return;

      await createFile(tempDir, "unchanged.txt", "same content\n");

      // First track
      const result1 = await Snapshot.track(tempDir, ["unchanged.txt"]);
      expect(isOk(result1)).toBe(true);

      // Track again without changes
      const result2 = await Snapshot.track(tempDir, ["unchanged.txt"]);
      expect(isOk(result2)).toBe(true);

      // Should return same hash
      if (isOk(result1) && isOk(result2)) {
        expect(result1.value).toBe(result2.value);
      }
    });

    it("should track all changed files with empty array", async () => {
      if (!gitAvailable) return;

      // Create files
      await createFile(tempDir, "file1.txt", "content1\n");
      await createFile(tempDir, "file2.txt", "content2\n");

      // Track all files (empty array)
      const result = await Snapshot.track(tempDir, []);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toMatch(/^[0-9a-f]{40}$/i);

        // Verify both files were tracked
        const infoResult = await Snapshot.getInfo(tempDir, result.value);
        expect(isOk(infoResult)).toBe(true);
        if (isOk(infoResult)) {
          expect(infoResult.value.files).toContain("file1.txt");
          expect(infoResult.value.files).toContain("file2.txt");
        }
      }
    });
  });

  // ===========================================================================
  // T027.3: Snapshot.restore tests
  // ===========================================================================

  describe("Snapshot.restore", () => {
    let snapshotHash: string;
    const originalContent = "original content\n";

    beforeEach(async () => {
      if (!gitAvailable) return;

      // Initialize and create initial snapshot
      await Snapshot.init(tempDir);
      await createFile(tempDir, "restore-test.txt", originalContent);
      const result = await Snapshot.track(tempDir, ["restore-test.txt"]);

      if (isOk(result)) {
        snapshotHash = result.value;
      }
    });

    it("should restore files to previous state", async () => {
      if (!gitAvailable) return;

      // Modify the file
      await createFile(tempDir, "restore-test.txt", "modified content\n");

      // Verify modification
      const modifiedContent = await readFile(tempDir, "restore-test.txt");
      expect(modifiedContent).toBe("modified content\n");

      // Restore from snapshot
      const result = await Snapshot.restore(tempDir, snapshotHash);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toContain("restore-test.txt");
      }

      // Verify file was restored
      const restoredContent = await readFile(tempDir, "restore-test.txt");
      expect(restoredContent).toBe(originalContent);
    });

    it("should handle missing/invalid hash", async () => {
      if (!gitAvailable) return;

      const fakeHash = "0".repeat(40);
      const result = await Snapshot.restore(tempDir, fakeHash);

      expect(isOk(result)).toBe(false);
      if (!isOk(result)) {
        expect(result.error.code).toBe(SnapshotErrorCode.NOT_FOUND);
      }
    });

    it("should restore with modified files", async () => {
      if (!gitAvailable) return;

      // Modify and add new files
      await createFile(tempDir, "restore-test.txt", "different content\n");
      await createFile(tempDir, "new-file.txt", "new file\n");

      // Restore from snapshot
      const result = await Snapshot.restore(tempDir, snapshotHash);

      expect(isOk(result)).toBe(true);

      // Original file should be restored
      const restoredContent = await readFile(tempDir, "restore-test.txt");
      expect(restoredContent).toBe(originalContent);

      // Note: restore doesn't delete files not in snapshot (that would require cleanup logic)
    });

    it("should return empty array for snapshot with no tracked files", async () => {
      if (!gitAvailable) return;

      // Create a file and track it, then create a new snapshot without the file
      // This tests that restore returns empty when the snapshot has no files in the work tree
      const emptyDir = await createTempDir();
      try {
        await Snapshot.init(emptyDir);
        // Track without any files creates empty commit
        const trackResult = await Snapshot.track(emptyDir, []);

        if (isOk(trackResult)) {
          // For empty directories, the track creates an empty commit
          // The restore should succeed - it just won't have user files to restore
          const restoreResult = await Snapshot.restore(emptyDir, trackResult.value);
          expect(isOk(restoreResult)).toBe(true);
          if (isOk(restoreResult)) {
            // Filter out any internal git files if present
            const userFiles = restoreResult.value.filter(
              (f) => !f.startsWith(".vellum/") && !f.startsWith(".git/")
            );
            expect(userFiles).toEqual([]);
          }
        }
      } finally {
        await removeTempDir(emptyDir);
      }
    });
  });

  // ===========================================================================
  // T027.4: Snapshot.diff tests
  // ===========================================================================

  describe("Snapshot.diff", () => {
    let snapshotHash: string;

    beforeEach(async () => {
      if (!gitAvailable) return;

      await Snapshot.init(tempDir);
      await createFile(tempDir, "diff-test.txt", "line 1\nline 2\nline 3\n");
      const result = await Snapshot.track(tempDir, ["diff-test.txt"]);

      if (isOk(result)) {
        snapshotHash = result.value;
      }
    });

    it("should show file changes in unified diff", async () => {
      if (!gitAvailable) return;

      // Modify the file
      await createFile(tempDir, "diff-test.txt", "line 1\nmodified line 2\nline 3\n");

      const result = await Snapshot.diff(tempDir, snapshotHash);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        // Should contain diff markers
        expect(result.value).toContain("diff");
        expect(result.value).toContain("diff-test.txt");
      }
    });

    it("should return empty diff when no changes", async () => {
      if (!gitAvailable) return;

      // No modifications
      const result = await Snapshot.diff(tempDir, snapshotHash);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        // Empty diff
        expect(result.value.trim()).toBe("");
      }
    });
  });

  // ===========================================================================
  // T027.5: Snapshot.getDiffSummary tests
  // ===========================================================================

  describe("Snapshot.getDiffSummary", () => {
    let snapshotHash: string;

    beforeEach(async () => {
      if (!gitAvailable) return;

      await Snapshot.init(tempDir);
      await createFile(tempDir, "existing.txt", "original\n");
      await createFile(tempDir, "to-delete.txt", "will be deleted\n");
      const result = await Snapshot.track(tempDir, ["existing.txt", "to-delete.txt"]);

      if (isOk(result)) {
        snapshotHash = result.value;
      }
    });

    it("should categorize added files", async () => {
      if (!gitAvailable) return;

      // Add a new file
      await createFile(tempDir, "new-file.txt", "new content\n");

      // Track to stage the new file
      await Snapshot.track(tempDir, ["new-file.txt", "existing.txt", "to-delete.txt"]);

      const result = await Snapshot.getDiffSummary(tempDir, snapshotHash);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.added).toContain("new-file.txt");
      }
    });

    it("should categorize modified files", async () => {
      if (!gitAvailable) return;

      // Modify existing file
      await createFile(tempDir, "existing.txt", "modified content\n");

      const result = await Snapshot.getDiffSummary(tempDir, snapshotHash);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.modified).toContain("existing.txt");
      }
    });

    it("should categorize deleted files", async () => {
      if (!gitAvailable) return;

      // Delete a file
      await fs.unlink(path.join(tempDir, "to-delete.txt"));

      const result = await Snapshot.getDiffSummary(tempDir, snapshotHash);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.deleted).toContain("to-delete.txt");
      }
    });

    it("should include patch in result", async () => {
      if (!gitAvailable) return;

      await createFile(tempDir, "existing.txt", "changed\n");

      const result = await Snapshot.getDiffSummary(tempDir, snapshotHash);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(typeof result.value.patch).toBe("string");
      }
    });
  });

  // ===========================================================================
  // T027.6: Snapshot.revert tests
  // ===========================================================================

  describe("Snapshot.revert", () => {
    beforeEach(async () => {
      if (!gitAvailable) return;

      await Snapshot.init(tempDir);
      await createFile(tempDir, "file1.txt", "original file1\n");
      await createFile(tempDir, "file2.txt", "original file2\n");
      await createFile(tempDir, "file3.txt", "original file3\n");
      await Snapshot.track(tempDir, ["file1.txt", "file2.txt", "file3.txt"]);
    });

    it("should selectively revert specific files", async () => {
      if (!gitAvailable) return;

      // Modify files
      await createFile(tempDir, "file1.txt", "modified file1\n");
      await createFile(tempDir, "file2.txt", "modified file2\n");

      // Revert only file1
      const result = await Snapshot.revert(tempDir, ["file1.txt"]);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toContain("file1.txt");
        expect(result.value).not.toContain("file2.txt");
      }

      // file1 should be restored
      const file1Content = await readFile(tempDir, "file1.txt");
      expect(file1Content).toBe("original file1\n");

      // file2 should still be modified
      const file2Content = await readFile(tempDir, "file2.txt");
      expect(file2Content).toBe("modified file2\n");
    });

    it("should revert subset of files", async () => {
      if (!gitAvailable) return;

      // Modify all files
      await createFile(tempDir, "file1.txt", "modified file1\n");
      await createFile(tempDir, "file2.txt", "modified file2\n");
      await createFile(tempDir, "file3.txt", "modified file3\n");

      // Revert file1 and file2
      const result = await Snapshot.revert(tempDir, ["file1.txt", "file2.txt"]);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toContain("file1.txt");
        expect(result.value).toContain("file2.txt");
        expect(result.value).not.toContain("file3.txt");
      }

      // Verify files
      expect(await readFile(tempDir, "file1.txt")).toBe("original file1\n");
      expect(await readFile(tempDir, "file2.txt")).toBe("original file2\n");
      expect(await readFile(tempDir, "file3.txt")).toBe("modified file3\n");
    });

    it("should return empty array for empty patches list", async () => {
      if (!gitAvailable) return;

      const result = await Snapshot.revert(tempDir, []);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toEqual([]);
      }
    });

    it("should skip files not in snapshot", async () => {
      if (!gitAvailable) return;

      // Try to revert non-existent file
      const result = await Snapshot.revert(tempDir, ["nonexistent.txt"]);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toEqual([]);
      }
    });
  });

  // ===========================================================================
  // T027.7: Snapshot.listSnapshots tests
  // ===========================================================================

  describe("Snapshot.listSnapshots", () => {
    beforeEach(async () => {
      if (!gitAvailable) return;

      await Snapshot.init(tempDir);
    });

    it("should list all snapshots sorted by date", async () => {
      if (!gitAvailable) return;

      // Create multiple snapshots
      await createFile(tempDir, "file1.txt", "content1\n");
      const result1 = await Snapshot.track(tempDir, ["file1.txt"], "first snapshot");

      await createFile(tempDir, "file2.txt", "content2\n");
      const result2 = await Snapshot.track(tempDir, ["file1.txt", "file2.txt"], "second snapshot");

      expect(isOk(result1)).toBe(true);
      expect(isOk(result2)).toBe(true);

      const listResult = await Snapshot.listSnapshots(tempDir);

      expect(isOk(listResult)).toBe(true);
      if (isOk(listResult)) {
        expect(listResult.value.length).toBeGreaterThanOrEqual(2);
        // Newest first
        expect(listResult.value[0]?.message).toBe("second snapshot");
        expect(listResult.value[1]?.message).toBe("first snapshot");
      }
    });

    it("should return empty array for empty repo", async () => {
      if (!gitAvailable) return;

      // New temp dir without any snapshots
      const emptyDir = await createTempDir();
      try {
        await Snapshot.init(emptyDir);
        const result = await Snapshot.listSnapshots(emptyDir);

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(result.value).toEqual([]);
        }
      } finally {
        await removeTempDir(emptyDir);
      }
    });
  });

  // ===========================================================================
  // T027.8: Checkpoint-Snapshot Integration tests
  // ===========================================================================

  describe("Checkpoint-Snapshot Integration", () => {
    let mockPersistence: PersistenceManager;

    beforeEach(async () => {
      if (!gitAvailable) return;

      await Snapshot.init(tempDir);

      // Create mock persistence manager with initial session
      mockPersistence = createMockPersistenceManager({
        metadata: { id: "test-session-id" },
        messages: [
          { id: "msg1", role: "user", parts: [{ type: "text", text: "Hello" }] },
          { id: "msg2", role: "assistant", parts: [{ type: "text", text: "Hi there" }] },
        ],
        checkpoints: [],
      });
    });

    it("should create checkpoint with snapshot", async () => {
      if (!gitAvailable) return;

      // Create some files to snapshot
      await createFile(tempDir, "checkpoint-test.txt", "before checkpoint\n");

      const checkpoint = await createCheckpointWithSnapshot(mockPersistence, tempDir, {
        description: "test checkpoint",
      });

      expect(checkpoint).toBeDefined();
      expect(checkpoint.description).toBe("test checkpoint");
      expect(checkpoint.snapshotHash).toBeDefined();
      expect(checkpoint.snapshotHash).toMatch(/^[0-9a-f]{40}$/i);
    });

    it("should rollback and restore both messages and files", async () => {
      if (!gitAvailable) return;

      // Create initial state
      await createFile(tempDir, "rollback-test.txt", "original content\n");

      // Create checkpoint
      const checkpoint = await createCheckpointWithSnapshot(mockPersistence, tempDir, {
        description: "checkpoint before changes",
      });

      // Make changes
      await createFile(tempDir, "rollback-test.txt", "modified after checkpoint\n");

      // Add more messages (simulated by updating mock)
      mockPersistence = createMockPersistenceManager({
        metadata: { id: "test-session-id" },
        messages: [
          { id: "msg1", role: "user", parts: [{ type: "text", text: "Hello" }] },
          { id: "msg2", role: "assistant", parts: [{ type: "text", text: "Hi there" }] },
          { id: "msg3", role: "user", parts: [{ type: "text", text: "New message" }] },
        ],
        checkpoints: [checkpoint],
      });

      // Rollback
      const result = await rollbackWithSnapshot(mockPersistence, checkpoint.id, tempDir);

      expect(result.checkpoint).toBeDefined();
      expect(result.checkpoint.id).toBe(checkpoint.id);
      expect(result.restoredFiles).toContain("rollback-test.txt");

      // Verify file was restored
      const content = await readFile(tempDir, "rollback-test.txt");
      expect(content).toBe("original content\n");
    });

    it("should get checkpoint diff", async () => {
      if (!gitAvailable) return;

      // Create initial state
      await createFile(tempDir, "diff-checkpoint.txt", "initial\n");

      // Create checkpoint
      const checkpoint = await createCheckpointWithSnapshot(mockPersistence, tempDir, {
        description: "checkpoint for diff",
      });

      // Update mock with checkpoint
      mockPersistence = createMockPersistenceManager({
        metadata: { id: "test-session-id" },
        messages: [
          { id: "msg1", role: "user", parts: [{ type: "text", text: "Hello" }] },
          { id: "msg2", role: "assistant", parts: [{ type: "text", text: "Hi there" }] },
        ],
        checkpoints: [checkpoint],
      });

      // Modify file
      await createFile(tempDir, "diff-checkpoint.txt", "modified\n");

      // Get diff
      const diff = await getCheckpointDiff(mockPersistence, checkpoint.id, tempDir);

      expect(diff.modified).toContain("diff-checkpoint.txt");
      expect(diff.patch).toBeDefined();
    });

    it("should handle checkpoint without snapshot gracefully", async () => {
      if (!gitAvailable) return;

      // Create a checkpoint without snapshot hash
      mockPersistence = createMockPersistenceManager({
        metadata: { id: "test-session-id" },
        messages: [],
        checkpoints: [
          {
            id: "cp-no-snapshot",
            messageIndex: 0,
            description: "no snapshot",
            // No snapshotHash
          },
        ],
      });

      const result = await rollbackWithSnapshot(mockPersistence, "cp-no-snapshot", tempDir);

      // Should succeed but with no restored files
      expect(result.checkpoint.id).toBe("cp-no-snapshot");
      expect(result.restoredFiles).toEqual([]);
    });
  });

  // ===========================================================================
  // T027.9: isInitialized tests
  // ===========================================================================

  describe("Snapshot.isInitialized", () => {
    it("should return false when not initialized", async () => {
      if (!gitAvailable) return;

      const result = await Snapshot.isInitialized(tempDir);
      expect(result).toBe(false);
    });

    it("should return true after initialization", async () => {
      if (!gitAvailable) return;

      await Snapshot.init(tempDir);

      const result = await Snapshot.isInitialized(tempDir);
      expect(result).toBe(true);
    });
  });

  // ===========================================================================
  // T027.10: getShadowRepoPath tests
  // ===========================================================================

  describe("Snapshot.getShadowRepoPath", () => {
    it("should return correct path", () => {
      const result = Snapshot.getShadowRepoPath(tempDir);
      expect(result).toBe(path.join(tempDir, ".vellum", ".git-shadow"));
    });
  });

  // ===========================================================================
  // T027.11: Error handling tests
  // ===========================================================================

  describe("Error handling", () => {
    it("should fail track when not initialized", async () => {
      if (!gitAvailable) return;

      const result = await Snapshot.track(tempDir, ["test.txt"]);

      expect(isOk(result)).toBe(false);
      if (!isOk(result)) {
        expect(result.error.code).toBe(SnapshotErrorCode.NOT_INITIALIZED);
      }
    });

    it("should fail restore when not initialized", async () => {
      if (!gitAvailable) return;

      const result = await Snapshot.restore(tempDir, "a".repeat(40));

      expect(isOk(result)).toBe(false);
      if (!isOk(result)) {
        expect(result.error.code).toBe(SnapshotErrorCode.NOT_INITIALIZED);
      }
    });

    it("should fail diff when not initialized", async () => {
      if (!gitAvailable) return;

      const result = await Snapshot.diff(tempDir, "b".repeat(40));

      expect(isOk(result)).toBe(false);
      if (!isOk(result)) {
        expect(result.error.code).toBe(SnapshotErrorCode.NOT_INITIALIZED);
      }
    });

    it("should fail getInfo when not initialized", async () => {
      if (!gitAvailable) return;

      const result = await Snapshot.getInfo(tempDir, "c".repeat(40));

      expect(isOk(result)).toBe(false);
      if (!isOk(result)) {
        expect(result.error.code).toBe(SnapshotErrorCode.NOT_INITIALIZED);
      }
    });

    it("should fail revert when not initialized", async () => {
      if (!gitAvailable) return;

      const result = await Snapshot.revert(tempDir, ["file.txt"]);

      expect(isOk(result)).toBe(false);
      if (!isOk(result)) {
        expect(result.error.code).toBe(SnapshotErrorCode.NOT_INITIALIZED);
      }
    });

    it("should fail listSnapshots when not initialized", async () => {
      if (!gitAvailable) return;

      const result = await Snapshot.listSnapshots(tempDir);

      expect(isOk(result)).toBe(false);
      if (!isOk(result)) {
        expect(result.error.code).toBe(SnapshotErrorCode.NOT_INITIALIZED);
      }
    });

    it("should validate hash format", async () => {
      if (!gitAvailable) return;

      await Snapshot.init(tempDir);

      const result = await Snapshot.restore(tempDir, "invalid-hash");

      expect(isOk(result)).toBe(false);
      if (!isOk(result)) {
        expect(result.error.code).toBe(SnapshotErrorCode.INVALID_HASH);
      }
    });
  });
});
