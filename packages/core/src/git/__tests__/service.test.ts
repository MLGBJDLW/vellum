/**
 * Unit tests for GitSnapshotService
 *
 * Tests high-level snapshot service operations using mocked GitOperations.
 *
 * @see packages/core/src/git/service.ts
 */

import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { ErrorCode, VellumError } from "../../errors/types.js";
import type { Logger } from "../../logger/logger.js";
import { Err, Ok } from "../../types/result.js";
import type { GitSnapshotLock } from "../lock.js";
import type { DiffNameEntry, GitOperations } from "../operations.js";
import {
  type GitSnapshotCreatedEvent,
  type GitSnapshotEventBus,
  type GitSnapshotRestoredEvent,
  type GitSnapshotRevertedEvent,
  GitSnapshotService,
} from "../service.js";
import type { GitPatch, GitSnapshotConfig } from "../types.js";

// =============================================================================
// Mock Setup
// =============================================================================

/**
 * Creates a mock GitOperations instance.
 */
function createMockOperations(): {
  stageAll: Mock;
  writeTree: Mock;
  readTree: Mock;
  checkoutIndex: Mock;
  diffNames: Mock;
  diffUnified: Mock;
  showFile: Mock;
  checkoutFile: Mock;
  getWorkDir: Mock;
} {
  return {
    stageAll: vi.fn().mockResolvedValue(Ok(undefined)),
    writeTree: vi.fn().mockResolvedValue(Ok("a".repeat(40))),
    readTree: vi.fn().mockResolvedValue(Ok(undefined)),
    checkoutIndex: vi.fn().mockResolvedValue(Ok(undefined)),
    diffNames: vi.fn().mockResolvedValue(Ok([])),
    diffUnified: vi.fn().mockResolvedValue(Ok("")),
    showFile: vi.fn().mockResolvedValue(Ok("file content")),
    checkoutFile: vi.fn().mockResolvedValue(Ok(undefined)),
    getWorkDir: vi.fn().mockReturnValue("/test/repo"),
  };
}

/**
 * Creates a mock GitSnapshotLock instance.
 */
function createMockLock(): {
  acquire: Mock;
  release: Mock;
  isLocked: Mock;
  queueLength: Mock;
  clearQueue: Mock;
} {
  return {
    acquire: vi.fn().mockResolvedValue(Ok(true)),
    release: vi.fn(),
    isLocked: vi.fn().mockReturnValue(false),
    queueLength: vi.fn().mockReturnValue(0),
    clearQueue: vi.fn(),
  };
}

/**
 * Creates a mock event bus.
 */
function createMockEventBus(): {
  emit: Mock;
} {
  return {
    emit: vi.fn(),
  };
}

/**
 * Creates a mock logger.
 */
function createMockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as unknown as Logger;
}

// =============================================================================
// T033: GitSnapshotService Tests
// =============================================================================

describe("GitSnapshotService", () => {
  let mockOperations: ReturnType<typeof createMockOperations>;
  let mockLock: ReturnType<typeof createMockLock>;
  let mockEventBus: ReturnType<typeof createMockEventBus>;
  let mockLogger: Logger;

  const testWorkDir = "/test/repo";

  const defaultConfig: GitSnapshotConfig = {
    enabled: true,
    autoSnapshotIntervalMs: 0,
    maxSnapshots: 100,
    customExclusions: [],
    workDir: testWorkDir,
    includeUntracked: true,
    commitMessagePrefix: "[vellum-snapshot]",
    lockTimeoutMs: 30000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockOperations = createMockOperations();
    mockLock = createMockLock();
    mockEventBus = createMockEventBus();
    mockLogger = createMockLogger();
  });

  // ===========================================================================
  // Constructor Tests
  // ===========================================================================

  describe("constructor", () => {
    it("should create service with valid config", () => {
      const service = new GitSnapshotService(
        defaultConfig,
        mockLogger,
        mockEventBus as unknown as GitSnapshotEventBus,
        mockOperations as unknown as GitOperations,
        mockLock as unknown as GitSnapshotLock
      );

      expect(service).toBeInstanceOf(GitSnapshotService);
      expect(service.isEnabled()).toBe(true);
    });

    it("should work without optional logger and eventBus", () => {
      const service = new GitSnapshotService(
        defaultConfig,
        undefined,
        undefined,
        mockOperations as unknown as GitOperations,
        mockLock as unknown as GitSnapshotLock
      );

      expect(service).toBeInstanceOf(GitSnapshotService);
    });

    it("should throw when enabled but workDir missing", () => {
      const configNoWorkDir: GitSnapshotConfig = {
        ...defaultConfig,
        workDir: undefined,
      };
      mockOperations.getWorkDir.mockReturnValue("");

      expect(
        () =>
          new GitSnapshotService(
            configNoWorkDir,
            mockLogger,
            mockEventBus as unknown as GitSnapshotEventBus,
            mockOperations as unknown as GitOperations,
            mockLock as unknown as GitSnapshotLock
          )
      ).toThrow("workDir is required when snapshots are enabled");
    });

    it("should use operations workDir as fallback", () => {
      const configNoWorkDir: GitSnapshotConfig = {
        ...defaultConfig,
        workDir: undefined,
      };
      mockOperations.getWorkDir.mockReturnValue("/fallback/repo");

      const service = new GitSnapshotService(
        configNoWorkDir,
        mockLogger,
        mockEventBus as unknown as GitSnapshotEventBus,
        mockOperations as unknown as GitOperations,
        mockLock as unknown as GitSnapshotLock
      );

      expect(service.getWorkDir()).toBe("/fallback/repo");
    });
  });

  // ===========================================================================
  // track() Tests
  // ===========================================================================

  describe("track()", () => {
    it("should return hash when enabled", async () => {
      const expectedHash = "b".repeat(40);
      mockOperations.writeTree.mockResolvedValue(Ok(expectedHash));

      const service = new GitSnapshotService(
        defaultConfig,
        mockLogger,
        mockEventBus as unknown as GitSnapshotEventBus,
        mockOperations as unknown as GitOperations,
        mockLock as unknown as GitSnapshotLock
      );

      const result = await service.track();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(expectedHash);
        expect(result.value).toHaveLength(40);
      }
    });

    it("should return undefined when disabled", async () => {
      const disabledConfig: GitSnapshotConfig = {
        ...defaultConfig,
        enabled: false,
      };

      const service = new GitSnapshotService(
        disabledConfig,
        mockLogger,
        mockEventBus as unknown as GitSnapshotEventBus,
        mockOperations as unknown as GitOperations,
        mockLock as unknown as GitSnapshotLock
      );

      const result = await service.track();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeUndefined();
      }
      // Should not call any operations when disabled
      expect(mockLock.acquire).not.toHaveBeenCalled();
      expect(mockOperations.stageAll).not.toHaveBeenCalled();
    });

    it("should acquire and release lock", async () => {
      const service = new GitSnapshotService(
        defaultConfig,
        mockLogger,
        mockEventBus as unknown as GitSnapshotEventBus,
        mockOperations as unknown as GitOperations,
        mockLock as unknown as GitSnapshotLock
      );

      await service.track();

      expect(mockLock.acquire).toHaveBeenCalledOnce();
      expect(mockLock.release).toHaveBeenCalledOnce();
    });

    it("should release lock even on error", async () => {
      mockOperations.stageAll.mockResolvedValue(
        Err(new VellumError("stage failed", ErrorCode.GIT_OPERATION_FAILED))
      );

      const service = new GitSnapshotService(
        defaultConfig,
        mockLogger,
        mockEventBus as unknown as GitSnapshotEventBus,
        mockOperations as unknown as GitOperations,
        mockLock as unknown as GitSnapshotLock
      );

      await service.track();

      expect(mockLock.release).toHaveBeenCalledOnce();
    });

    it("should call stageAll then writeTree", async () => {
      const callOrder: string[] = [];
      mockOperations.stageAll.mockImplementation(async () => {
        callOrder.push("stageAll");
        return Ok(undefined);
      });
      mockOperations.writeTree.mockImplementation(async () => {
        callOrder.push("writeTree");
        return Ok("c".repeat(40));
      });

      const service = new GitSnapshotService(
        defaultConfig,
        mockLogger,
        mockEventBus as unknown as GitSnapshotEventBus,
        mockOperations as unknown as GitOperations,
        mockLock as unknown as GitSnapshotLock
      );

      await service.track();

      expect(callOrder).toEqual(["stageAll", "writeTree"]);
    });

    it("should return Err when lock acquisition fails", async () => {
      mockLock.acquire.mockResolvedValue(
        Err(new VellumError("Lock timeout", ErrorCode.GIT_LOCK_TIMEOUT))
      );

      const service = new GitSnapshotService(
        defaultConfig,
        mockLogger,
        mockEventBus as unknown as GitSnapshotEventBus,
        mockOperations as unknown as GitOperations,
        mockLock as unknown as GitSnapshotLock
      );

      const result = await service.track();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.GIT_LOCK_TIMEOUT);
      }
    });

    it("should return Err when stageAll fails", async () => {
      mockOperations.stageAll.mockResolvedValue(
        Err(new VellumError("stage failed", ErrorCode.GIT_OPERATION_FAILED))
      );

      const service = new GitSnapshotService(
        defaultConfig,
        mockLogger,
        mockEventBus as unknown as GitSnapshotEventBus,
        mockOperations as unknown as GitOperations,
        mockLock as unknown as GitSnapshotLock
      );

      const result = await service.track();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.GIT_OPERATION_FAILED);
      }
    });

    it("should return Err when writeTree fails", async () => {
      mockOperations.writeTree.mockResolvedValue(
        Err(new VellumError("write-tree failed", ErrorCode.GIT_OPERATION_FAILED))
      );

      const service = new GitSnapshotService(
        defaultConfig,
        mockLogger,
        mockEventBus as unknown as GitSnapshotEventBus,
        mockOperations as unknown as GitOperations,
        mockLock as unknown as GitSnapshotLock
      );

      const result = await service.track();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.GIT_OPERATION_FAILED);
      }
    });

    it("should emit gitSnapshotCreated event", async () => {
      const expectedHash = "d".repeat(40);
      mockOperations.writeTree.mockResolvedValue(Ok(expectedHash));

      const service = new GitSnapshotService(
        defaultConfig,
        mockLogger,
        mockEventBus as unknown as GitSnapshotEventBus,
        mockOperations as unknown as GitOperations,
        mockLock as unknown as GitSnapshotLock
      );

      await service.track();

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        "gitSnapshotCreated",
        expect.objectContaining({
          hash: expectedHash,
          workDir: testWorkDir,
          timestamp: expect.any(Number),
        })
      );
    });

    it("should not emit event when disabled", async () => {
      const disabledConfig: GitSnapshotConfig = {
        ...defaultConfig,
        enabled: false,
      };

      const service = new GitSnapshotService(
        disabledConfig,
        mockLogger,
        mockEventBus as unknown as GitSnapshotEventBus,
        mockOperations as unknown as GitOperations,
        mockLock as unknown as GitSnapshotLock
      );

      await service.track();

      expect(mockEventBus.emit).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // patch() Tests
  // ===========================================================================

  describe("patch()", () => {
    it("should return file changes with changeType", async () => {
      const diffEntries: DiffNameEntry[] = [
        { status: "A", path: "src/new.ts" },
        { status: "M", path: "src/modified.ts" },
        { status: "D", path: "src/deleted.ts" },
        { status: "R", path: "src/renamed.ts", oldPath: "src/old.ts" },
      ];
      mockOperations.diffNames.mockResolvedValue(Ok(diffEntries));

      const service = new GitSnapshotService(
        defaultConfig,
        mockLogger,
        mockEventBus as unknown as GitSnapshotEventBus,
        mockOperations as unknown as GitOperations,
        mockLock as unknown as GitSnapshotLock
      );

      const result = await service.patch("e".repeat(40));

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.files).toHaveLength(4);
        expect(result.value.files[0]).toEqual({
          path: "src/new.ts",
          type: "added",
          oldPath: undefined,
        });
        expect(result.value.files[1]).toEqual({
          path: "src/modified.ts",
          type: "modified",
          oldPath: undefined,
        });
        expect(result.value.files[2]).toEqual({
          path: "src/deleted.ts",
          type: "deleted",
          oldPath: undefined,
        });
        expect(result.value.files[3]).toEqual({
          path: "src/renamed.ts",
          type: "renamed",
          oldPath: "src/old.ts",
        });
      }
    });

    it("should map C (copy) status to added", async () => {
      const diffEntries: DiffNameEntry[] = [
        { status: "C", path: "src/copy.ts", oldPath: "src/original.ts" },
      ];
      mockOperations.diffNames.mockResolvedValue(Ok(diffEntries));

      const service = new GitSnapshotService(
        defaultConfig,
        mockLogger,
        mockEventBus as unknown as GitSnapshotEventBus,
        mockOperations as unknown as GitOperations,
        mockLock as unknown as GitSnapshotLock
      );

      const result = await service.patch("f".repeat(40));

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.files[0]?.type).toBe("added");
      }
    });

    it("should map T, U, X, B status to modified", async () => {
      const diffEntries: DiffNameEntry[] = [
        { status: "T", path: "src/type-change.ts" },
        { status: "U", path: "src/unmerged.ts" },
      ];
      mockOperations.diffNames.mockResolvedValue(Ok(diffEntries));

      const service = new GitSnapshotService(
        defaultConfig,
        mockLogger,
        mockEventBus as unknown as GitSnapshotEventBus,
        mockOperations as unknown as GitOperations,
        mockLock as unknown as GitSnapshotLock
      );

      const result = await service.patch("g".repeat(40));

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.files[0]?.type).toBe("modified");
        expect(result.value.files[1]?.type).toBe("modified");
      }
    });

    it("should include commitHash and timestamp", async () => {
      const hash = "h".repeat(40);
      mockOperations.diffNames.mockResolvedValue(Ok([]));

      const service = new GitSnapshotService(
        defaultConfig,
        mockLogger,
        mockEventBus as unknown as GitSnapshotEventBus,
        mockOperations as unknown as GitOperations,
        mockLock as unknown as GitSnapshotLock
      );

      const result = await service.patch(hash);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.commitHash).toBe(hash);
        expect(result.value.timestamp).toBeDefined();
        expect(typeof result.value.timestamp).toBe("number");
      }
    });

    it("should return Err when disabled", async () => {
      const disabledConfig: GitSnapshotConfig = {
        ...defaultConfig,
        enabled: false,
      };

      const service = new GitSnapshotService(
        disabledConfig,
        mockLogger,
        mockEventBus as unknown as GitSnapshotEventBus,
        mockOperations as unknown as GitOperations,
        mockLock as unknown as GitSnapshotLock
      );

      const result = await service.patch("i".repeat(40));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.GIT_SNAPSHOT_DISABLED);
      }
    });

    it("should return Err when diffNames fails", async () => {
      mockOperations.diffNames.mockResolvedValue(
        Err(new VellumError("diff-tree failed", ErrorCode.GIT_OPERATION_FAILED))
      );

      const service = new GitSnapshotService(
        defaultConfig,
        mockLogger,
        mockEventBus as unknown as GitSnapshotEventBus,
        mockOperations as unknown as GitOperations,
        mockLock as unknown as GitSnapshotLock
      );

      const result = await service.patch("j".repeat(40));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.GIT_OPERATION_FAILED);
      }
    });
  });

  // ===========================================================================
  // diff() Tests
  // ===========================================================================

  describe("diff()", () => {
    it("should return unified diff string", async () => {
      const unifiedDiff = `diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,4 @@
 line 1
+new line
 line 2`;
      mockOperations.diffUnified.mockResolvedValue(Ok(unifiedDiff));

      const service = new GitSnapshotService(
        defaultConfig,
        mockLogger,
        mockEventBus as unknown as GitSnapshotEventBus,
        mockOperations as unknown as GitOperations,
        mockLock as unknown as GitSnapshotLock
      );

      const result = await service.diff("k".repeat(40));

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(unifiedDiff);
        expect(result.value).toContain("diff --git");
        expect(result.value).toContain("+new line");
      }
    });

    it("should return empty string for no changes", async () => {
      mockOperations.diffUnified.mockResolvedValue(Ok(""));

      const service = new GitSnapshotService(
        defaultConfig,
        mockLogger,
        mockEventBus as unknown as GitSnapshotEventBus,
        mockOperations as unknown as GitOperations,
        mockLock as unknown as GitSnapshotLock
      );

      const result = await service.diff("l".repeat(40));

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe("");
      }
    });

    it("should return Err when disabled", async () => {
      const disabledConfig: GitSnapshotConfig = {
        ...defaultConfig,
        enabled: false,
      };

      const service = new GitSnapshotService(
        disabledConfig,
        mockLogger,
        mockEventBus as unknown as GitSnapshotEventBus,
        mockOperations as unknown as GitOperations,
        mockLock as unknown as GitSnapshotLock
      );

      const result = await service.diff("m".repeat(40));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.GIT_SNAPSHOT_DISABLED);
      }
    });

    it("should return Err when diffUnified fails", async () => {
      mockOperations.diffUnified.mockResolvedValue(
        Err(new VellumError("diff failed", ErrorCode.GIT_OPERATION_FAILED))
      );

      const service = new GitSnapshotService(
        defaultConfig,
        mockLogger,
        mockEventBus as unknown as GitSnapshotEventBus,
        mockOperations as unknown as GitOperations,
        mockLock as unknown as GitSnapshotLock
      );

      const result = await service.diff("n".repeat(40));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.GIT_OPERATION_FAILED);
      }
    });

    it("should call diffUnified with correct hash", async () => {
      const hash = "o".repeat(40);
      mockOperations.diffUnified.mockResolvedValue(Ok(""));

      const service = new GitSnapshotService(
        defaultConfig,
        mockLogger,
        mockEventBus as unknown as GitSnapshotEventBus,
        mockOperations as unknown as GitOperations,
        mockLock as unknown as GitSnapshotLock
      );

      await service.diff(hash);

      expect(mockOperations.diffUnified).toHaveBeenCalledWith(hash);
    });
  });

  // ===========================================================================
  // restore() Tests
  // ===========================================================================

  describe("restore()", () => {
    it("should call readTree then checkoutIndex", async () => {
      const callOrder: string[] = [];
      mockOperations.readTree.mockImplementation(async () => {
        callOrder.push("readTree");
        return Ok(undefined);
      });
      mockOperations.checkoutIndex.mockImplementation(async () => {
        callOrder.push("checkoutIndex");
        return Ok(undefined);
      });

      const service = new GitSnapshotService(
        defaultConfig,
        mockLogger,
        mockEventBus as unknown as GitSnapshotEventBus,
        mockOperations as unknown as GitOperations,
        mockLock as unknown as GitSnapshotLock
      );

      await service.restore("p".repeat(40));

      expect(callOrder).toEqual(["readTree", "checkoutIndex"]);
    });

    it("should acquire and release lock", async () => {
      const service = new GitSnapshotService(
        defaultConfig,
        mockLogger,
        mockEventBus as unknown as GitSnapshotEventBus,
        mockOperations as unknown as GitOperations,
        mockLock as unknown as GitSnapshotLock
      );

      await service.restore("q".repeat(40));

      expect(mockLock.acquire).toHaveBeenCalledOnce();
      expect(mockLock.release).toHaveBeenCalledOnce();
    });

    it("should release lock even on error", async () => {
      mockOperations.readTree.mockResolvedValue(
        Err(new VellumError("read-tree failed", ErrorCode.GIT_OPERATION_FAILED))
      );

      const service = new GitSnapshotService(
        defaultConfig,
        mockLogger,
        mockEventBus as unknown as GitSnapshotEventBus,
        mockOperations as unknown as GitOperations,
        mockLock as unknown as GitSnapshotLock
      );

      await service.restore("r".repeat(40));

      expect(mockLock.release).toHaveBeenCalledOnce();
    });

    it("should emit gitSnapshotRestored event", async () => {
      const hash = "s".repeat(40);

      const service = new GitSnapshotService(
        defaultConfig,
        mockLogger,
        mockEventBus as unknown as GitSnapshotEventBus,
        mockOperations as unknown as GitOperations,
        mockLock as unknown as GitSnapshotLock
      );

      await service.restore(hash);

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        "gitSnapshotRestored",
        expect.objectContaining({
          hash,
          workDir: testWorkDir,
          timestamp: expect.any(Number),
        })
      );
    });

    it("should return Err when disabled", async () => {
      const disabledConfig: GitSnapshotConfig = {
        ...defaultConfig,
        enabled: false,
      };

      const service = new GitSnapshotService(
        disabledConfig,
        mockLogger,
        mockEventBus as unknown as GitSnapshotEventBus,
        mockOperations as unknown as GitOperations,
        mockLock as unknown as GitSnapshotLock
      );

      const result = await service.restore("t".repeat(40));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.GIT_SNAPSHOT_DISABLED);
      }
    });

    it("should return Err when lock acquisition fails", async () => {
      mockLock.acquire.mockResolvedValue(
        Err(new VellumError("Lock timeout", ErrorCode.GIT_LOCK_TIMEOUT))
      );

      const service = new GitSnapshotService(
        defaultConfig,
        mockLogger,
        mockEventBus as unknown as GitSnapshotEventBus,
        mockOperations as unknown as GitOperations,
        mockLock as unknown as GitSnapshotLock
      );

      const result = await service.restore("u".repeat(40));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.GIT_LOCK_TIMEOUT);
      }
    });

    it("should return Err when readTree fails", async () => {
      mockOperations.readTree.mockResolvedValue(
        Err(new VellumError("read-tree failed", ErrorCode.GIT_OPERATION_FAILED))
      );

      const service = new GitSnapshotService(
        defaultConfig,
        mockLogger,
        mockEventBus as unknown as GitSnapshotEventBus,
        mockOperations as unknown as GitOperations,
        mockLock as unknown as GitSnapshotLock
      );

      const result = await service.restore("v".repeat(40));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.GIT_OPERATION_FAILED);
      }
    });

    it("should return Err when checkoutIndex fails", async () => {
      mockOperations.checkoutIndex.mockResolvedValue(
        Err(new VellumError("checkout failed", ErrorCode.GIT_OPERATION_FAILED))
      );

      const service = new GitSnapshotService(
        defaultConfig,
        mockLogger,
        mockEventBus as unknown as GitSnapshotEventBus,
        mockOperations as unknown as GitOperations,
        mockLock as unknown as GitSnapshotLock
      );

      const result = await service.restore("w".repeat(40));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.GIT_OPERATION_FAILED);
      }
    });
  });

  // ===========================================================================
  // revert() Tests
  // ===========================================================================

  describe("revert()", () => {
    it("should selectively revert files based on type", async () => {
      const hash = "x".repeat(40);
      const patches: GitPatch = {
        files: [
          { path: "src/modified.ts", type: "modified" },
          { path: "src/deleted.ts", type: "deleted" },
        ],
        commitHash: hash,
      };

      const service = new GitSnapshotService(
        defaultConfig,
        mockLogger,
        mockEventBus as unknown as GitSnapshotEventBus,
        mockOperations as unknown as GitOperations,
        mockLock as unknown as GitSnapshotLock
      );

      const result = await service.revert(hash, patches);

      expect(result.ok).toBe(true);
      // Should call checkoutFile for modified and deleted files
      expect(mockOperations.checkoutFile).toHaveBeenCalledWith(hash, "src/modified.ts");
      expect(mockOperations.checkoutFile).toHaveBeenCalledWith(hash, "src/deleted.ts");
    });

    it("should use oldPath for renamed files", async () => {
      const hash = "y".repeat(40);
      const patches: GitPatch = {
        files: [{ path: "src/new-name.ts", type: "renamed", oldPath: "src/old-name.ts" }],
        commitHash: hash,
      };

      const service = new GitSnapshotService(
        defaultConfig,
        mockLogger,
        mockEventBus as unknown as GitSnapshotEventBus,
        mockOperations as unknown as GitOperations,
        mockLock as unknown as GitSnapshotLock
      );

      await service.revert(hash, patches);

      // Should checkout the old path for renamed files
      expect(mockOperations.checkoutFile).toHaveBeenCalledWith(hash, "src/old-name.ts");
    });

    it("should acquire and release lock", async () => {
      const patches: GitPatch = { files: [] };

      const service = new GitSnapshotService(
        defaultConfig,
        mockLogger,
        mockEventBus as unknown as GitSnapshotEventBus,
        mockOperations as unknown as GitOperations,
        mockLock as unknown as GitSnapshotLock
      );

      await service.revert("z".repeat(40), patches);

      expect(mockLock.acquire).toHaveBeenCalledOnce();
      expect(mockLock.release).toHaveBeenCalledOnce();
    });

    it("should emit gitSnapshotReverted event", async () => {
      const hash = "1".repeat(40);
      const patches: GitPatch = {
        files: [{ path: "src/file.ts", type: "modified" }],
        commitHash: hash,
      };

      const service = new GitSnapshotService(
        defaultConfig,
        mockLogger,
        mockEventBus as unknown as GitSnapshotEventBus,
        mockOperations as unknown as GitOperations,
        mockLock as unknown as GitSnapshotLock
      );

      await service.revert(hash, patches);

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        "gitSnapshotReverted",
        expect.objectContaining({
          hash,
          files: expect.arrayContaining(["src/file.ts"]),
          workDir: testWorkDir,
          timestamp: expect.any(Number),
        })
      );
    });

    it("should return Err when disabled", async () => {
      const disabledConfig: GitSnapshotConfig = {
        ...defaultConfig,
        enabled: false,
      };
      const patches: GitPatch = { files: [] };

      const service = new GitSnapshotService(
        disabledConfig,
        mockLogger,
        mockEventBus as unknown as GitSnapshotEventBus,
        mockOperations as unknown as GitOperations,
        mockLock as unknown as GitSnapshotLock
      );

      const result = await service.revert("2".repeat(40), patches);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.GIT_SNAPSHOT_DISABLED);
      }
    });

    it("should return Err when lock acquisition fails", async () => {
      mockLock.acquire.mockResolvedValue(
        Err(new VellumError("Lock timeout", ErrorCode.GIT_LOCK_TIMEOUT))
      );
      const patches: GitPatch = { files: [] };

      const service = new GitSnapshotService(
        defaultConfig,
        mockLogger,
        mockEventBus as unknown as GitSnapshotEventBus,
        mockOperations as unknown as GitOperations,
        mockLock as unknown as GitSnapshotLock
      );

      const result = await service.revert("3".repeat(40), patches);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.GIT_LOCK_TIMEOUT);
      }
    });

    it("should continue reverting even if one file fails", async () => {
      const hash = "4".repeat(40);
      const patches: GitPatch = {
        files: [
          { path: "src/file1.ts", type: "modified" },
          { path: "src/file2.ts", type: "modified" },
        ],
        commitHash: hash,
      };

      // First file fails, second succeeds
      mockOperations.checkoutFile
        .mockResolvedValueOnce(
          Err(new VellumError("checkout failed", ErrorCode.GIT_OPERATION_FAILED))
        )
        .mockResolvedValueOnce(Ok(undefined));

      const service = new GitSnapshotService(
        defaultConfig,
        mockLogger,
        mockEventBus as unknown as GitSnapshotEventBus,
        mockOperations as unknown as GitOperations,
        mockLock as unknown as GitSnapshotLock
      );

      const result = await service.revert(hash, patches);

      // Should still succeed overall
      expect(result.ok).toBe(true);
      // Both files should have been attempted
      expect(mockOperations.checkoutFile).toHaveBeenCalledTimes(2);
    });

    it("should release lock even on error", async () => {
      mockOperations.checkoutFile.mockRejectedValue(new Error("unexpected"));
      const patches: GitPatch = {
        files: [{ path: "src/file.ts", type: "modified" }],
      };

      const service = new GitSnapshotService(
        defaultConfig,
        mockLogger,
        mockEventBus as unknown as GitSnapshotEventBus,
        mockOperations as unknown as GitOperations,
        mockLock as unknown as GitSnapshotLock
      );

      try {
        await service.revert("5".repeat(40), patches);
      } catch {
        // Expected
      }

      expect(mockLock.release).toHaveBeenCalledOnce();
    });
  });

  // ===========================================================================
  // Events Tests
  // ===========================================================================

  describe("events", () => {
    it("should emit gitSnapshotCreated with correct payload", async () => {
      const hash = "6".repeat(40);
      mockOperations.writeTree.mockResolvedValue(Ok(hash));

      const service = new GitSnapshotService(
        defaultConfig,
        mockLogger,
        mockEventBus as unknown as GitSnapshotEventBus,
        mockOperations as unknown as GitOperations,
        mockLock as unknown as GitSnapshotLock
      );

      await service.track();

      const emitCall = mockEventBus.emit.mock.calls[0];
      expect(emitCall?.[0]).toBe("gitSnapshotCreated");
      const payload = emitCall?.[1] as GitSnapshotCreatedEvent;
      expect(payload.hash).toBe(hash);
      expect(payload.workDir).toBe(testWorkDir);
      expect(payload.timestamp).toBeGreaterThan(0);
    });

    it("should emit gitSnapshotRestored with correct payload", async () => {
      const hash = "7".repeat(40);

      const service = new GitSnapshotService(
        defaultConfig,
        mockLogger,
        mockEventBus as unknown as GitSnapshotEventBus,
        mockOperations as unknown as GitOperations,
        mockLock as unknown as GitSnapshotLock
      );

      await service.restore(hash);

      const emitCall = mockEventBus.emit.mock.calls[0];
      expect(emitCall?.[0]).toBe("gitSnapshotRestored");
      const payload = emitCall?.[1] as GitSnapshotRestoredEvent;
      expect(payload.hash).toBe(hash);
      expect(payload.workDir).toBe(testWorkDir);
      expect(payload.timestamp).toBeGreaterThan(0);
    });

    it("should emit gitSnapshotReverted with correct payload", async () => {
      const hash = "8".repeat(40);
      const patches: GitPatch = {
        files: [
          { path: "src/file1.ts", type: "modified" },
          { path: "src/file2.ts", type: "modified" },
        ],
        commitHash: hash,
      };

      const service = new GitSnapshotService(
        defaultConfig,
        mockLogger,
        mockEventBus as unknown as GitSnapshotEventBus,
        mockOperations as unknown as GitOperations,
        mockLock as unknown as GitSnapshotLock
      );

      await service.revert(hash, patches);

      const emitCall = mockEventBus.emit.mock.calls[0];
      expect(emitCall?.[0]).toBe("gitSnapshotReverted");
      const payload = emitCall?.[1] as GitSnapshotRevertedEvent;
      expect(payload.hash).toBe(hash);
      expect(payload.files).toContain("src/file1.ts");
      expect(payload.files).toContain("src/file2.ts");
      expect(payload.workDir).toBe(testWorkDir);
      expect(payload.timestamp).toBeGreaterThan(0);
    });

    it("should work without event bus", async () => {
      const service = new GitSnapshotService(
        defaultConfig,
        mockLogger,
        undefined, // No event bus
        mockOperations as unknown as GitOperations,
        mockLock as unknown as GitSnapshotLock
      );

      // These should all work without throwing
      await service.track();
      await service.restore("9".repeat(40));
      await service.revert("0".repeat(40), { files: [] });

      // No assertions needed - just verifying no errors thrown
    });
  });

  // ===========================================================================
  // Lock Usage Tests
  // ===========================================================================

  describe("lock usage for concurrent operations", () => {
    it("should serialize track operations", async () => {
      const callOrder: string[] = [];

      mockLock.acquire.mockImplementation(async () => {
        callOrder.push("acquire");
        return Ok(true);
      });
      (mockLock.release as Mock).mockImplementation(() => {
        callOrder.push("release");
      });
      mockOperations.stageAll.mockImplementation(async () => {
        callOrder.push("stageAll");
        return Ok(undefined);
      });
      mockOperations.writeTree.mockImplementation(async () => {
        callOrder.push("writeTree");
        return Ok("a".repeat(40));
      });

      const service = new GitSnapshotService(
        defaultConfig,
        mockLogger,
        mockEventBus as unknown as GitSnapshotEventBus,
        mockOperations as unknown as GitOperations,
        mockLock as unknown as GitSnapshotLock
      );

      await service.track();

      expect(callOrder).toEqual(["acquire", "stageAll", "writeTree", "release"]);
    });

    it("should serialize restore operations", async () => {
      const callOrder: string[] = [];

      mockLock.acquire.mockImplementation(async () => {
        callOrder.push("acquire");
        return Ok(true);
      });
      (mockLock.release as Mock).mockImplementation(() => {
        callOrder.push("release");
      });
      mockOperations.readTree.mockImplementation(async () => {
        callOrder.push("readTree");
        return Ok(undefined);
      });
      mockOperations.checkoutIndex.mockImplementation(async () => {
        callOrder.push("checkoutIndex");
        return Ok(undefined);
      });

      const service = new GitSnapshotService(
        defaultConfig,
        mockLogger,
        mockEventBus as unknown as GitSnapshotEventBus,
        mockOperations as unknown as GitOperations,
        mockLock as unknown as GitSnapshotLock
      );

      await service.restore("a".repeat(40));

      expect(callOrder).toEqual(["acquire", "readTree", "checkoutIndex", "release"]);
    });

    it("should serialize revert operations", async () => {
      const callOrder: string[] = [];

      mockLock.acquire.mockImplementation(async () => {
        callOrder.push("acquire");
        return Ok(true);
      });
      (mockLock.release as Mock).mockImplementation(() => {
        callOrder.push("release");
      });
      mockOperations.checkoutFile.mockImplementation(async () => {
        callOrder.push("checkoutFile");
        return Ok(undefined);
      });

      const patches: GitPatch = {
        files: [{ path: "src/file.ts", type: "modified" }],
      };

      const service = new GitSnapshotService(
        defaultConfig,
        mockLogger,
        mockEventBus as unknown as GitSnapshotEventBus,
        mockOperations as unknown as GitOperations,
        mockLock as unknown as GitSnapshotLock
      );

      await service.revert("b".repeat(40), patches);

      expect(callOrder).toEqual(["acquire", "checkoutFile", "release"]);
    });
  });

  // ===========================================================================
  // Utility Method Tests
  // ===========================================================================

  describe("utility methods", () => {
    it("isEnabled() should return config.enabled", () => {
      const enabledService = new GitSnapshotService(
        defaultConfig,
        mockLogger,
        mockEventBus as unknown as GitSnapshotEventBus,
        mockOperations as unknown as GitOperations,
        mockLock as unknown as GitSnapshotLock
      );
      expect(enabledService.isEnabled()).toBe(true);

      const disabledService = new GitSnapshotService(
        { ...defaultConfig, enabled: false },
        mockLogger,
        mockEventBus as unknown as GitSnapshotEventBus,
        mockOperations as unknown as GitOperations,
        mockLock as unknown as GitSnapshotLock
      );
      expect(disabledService.isEnabled()).toBe(false);
    });

    it("getWorkDir() should return workDir", () => {
      const service = new GitSnapshotService(
        defaultConfig,
        mockLogger,
        mockEventBus as unknown as GitSnapshotEventBus,
        mockOperations as unknown as GitOperations,
        mockLock as unknown as GitSnapshotLock
      );

      expect(service.getWorkDir()).toBe(testWorkDir);
    });
  });
});
