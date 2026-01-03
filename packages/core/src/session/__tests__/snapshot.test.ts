/**
 * Snapshot Namespace Tests (T024)
 *
 * Tests for shadow Git repository management.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isOk } from "../../types/result.js";
import { Snapshot, SnapshotError, SnapshotErrorCode } from "../snapshot.js";

// Create mock git instance that will be shared
const mockGitInstance = {
  raw: vi.fn(),
  add: vi.fn(),
  addConfig: vi.fn(),
  commit: vi.fn(),
  status: vi.fn(),
  log: vi.fn(),
  show: vi.fn(),
  env: vi.fn().mockReturnThis(),
};

// Mock simple-git
vi.mock("simple-git", () => ({
  simpleGit: vi.fn(() => mockGitInstance),
  default: vi.fn(() => mockGitInstance),
}));

// Mock fs/promises
vi.mock("node:fs/promises", () => ({
  access: vi.fn(),
  mkdir: vi.fn(),
  default: {
    access: vi.fn(),
    mkdir: vi.fn(),
  },
}));

// Mock safety module
vi.mock("../../git/safety.js", () => ({
  getSanitizedEnv: vi.fn(() => ({})),
  getNoGpgFlags: vi.fn(() => ["-c", "commit.gpgsign=false"]),
}));

describe("Snapshot", () => {
  // Use platform-agnostic paths
  const mockWorkingDir = path.resolve("/test/project");
  const mockShadowPath = path.join(mockWorkingDir, ".vellum", ".git-shadow");

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset mock implementations to defaults
    mockGitInstance.env.mockReturnThis();
    mockGitInstance.raw.mockResolvedValue("");
    mockGitInstance.add.mockResolvedValue(undefined);
    mockGitInstance.addConfig.mockResolvedValue("");
    mockGitInstance.commit.mockResolvedValue({ commit: "abc123" });
    mockGitInstance.status.mockResolvedValue({
      staged: [],
      created: [],
      deleted: [],
      modified: [],
    });
    mockGitInstance.log.mockResolvedValue({
      total: 1,
      latest: { hash: "a".repeat(40) },
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("init", () => {
    it("should initialize shadow repository if not exists", async () => {
      // Mock: shadow repo does not exist
      vi.mocked(fs.access).mockRejectedValue(new Error("ENOENT"));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      const result = await Snapshot.init(mockWorkingDir);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe(mockShadowPath);
      }

      // Should create .vellum directory
      expect(fs.mkdir).toHaveBeenCalledWith(path.join(mockWorkingDir, ".vellum"), {
        recursive: true,
      });

      // Should initialize bare repo
      expect(mockGitInstance.raw).toHaveBeenCalledWith(["init", "--bare", mockShadowPath]);

      // Should configure user
      expect(mockGitInstance.addConfig).toHaveBeenCalledWith(
        "user.email",
        "vellum@local",
        false,
        "local"
      );
      expect(mockGitInstance.addConfig).toHaveBeenCalledWith(
        "user.name",
        "Vellum Snapshot",
        false,
        "local"
      );
    });

    it("should return existing path if already initialized", async () => {
      // Mock: shadow repo exists
      vi.mocked(fs.access).mockResolvedValue(undefined);

      const result = await Snapshot.init(mockWorkingDir);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe(mockShadowPath);
      }

      // Should not try to create anything
      expect(fs.mkdir).not.toHaveBeenCalled();
      expect(mockGitInstance.raw).not.toHaveBeenCalled();
    });

    it("should return error on git init failure", async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error("ENOENT"));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      mockGitInstance.raw.mockRejectedValue(new Error("git init failed"));

      const result = await Snapshot.init(mockWorkingDir);

      expect(isOk(result)).toBe(false);
      if (!isOk(result)) {
        expect(result.error).toBeInstanceOf(SnapshotError);
        expect(result.error.code).toBe(SnapshotErrorCode.OPERATION_FAILED);
      }
    });
  });

  describe("track", () => {
    it("should track specific files and return commit hash", async () => {
      // Mock: shadow repo exists
      vi.mocked(fs.access).mockResolvedValue(undefined);
      mockGitInstance.status.mockResolvedValue({
        staged: ["file1.ts"],
        created: [],
        deleted: [],
        modified: [],
      });

      const result = await Snapshot.track(mockWorkingDir, ["src/file1.ts"]);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toMatch(/^[0-9a-f]{40}$/i);
      }

      expect(mockGitInstance.add).toHaveBeenCalledWith("src/file1.ts");
      expect(mockGitInstance.commit).toHaveBeenCalledWith("snapshot");
    });

    it("should track all files when empty array provided", async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      mockGitInstance.status.mockResolvedValue({
        staged: ["file1.ts"],
        created: [],
        deleted: [],
        modified: [],
      });

      const result = await Snapshot.track(mockWorkingDir, []);

      expect(isOk(result)).toBe(true);
      expect(mockGitInstance.add).toHaveBeenCalledWith(".");
    });

    it("should return error if shadow repo not initialized", async () => {
      // Mock: shadow repo does not exist
      vi.mocked(fs.access).mockRejectedValue(new Error("ENOENT"));

      const result = await Snapshot.track(mockWorkingDir, ["file.ts"]);

      expect(isOk(result)).toBe(false);
      if (!isOk(result)) {
        expect(result.error).toBeInstanceOf(SnapshotError);
        expect(result.error.code).toBe(SnapshotErrorCode.NOT_INITIALIZED);
      }
    });

    it("should return latest hash if no changes to commit", async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      mockGitInstance.status.mockResolvedValue({
        staged: [],
        created: [],
        deleted: [],
        modified: [],
      });

      const existingHash = "b".repeat(40);
      mockGitInstance.log.mockResolvedValue({
        total: 1,
        latest: { hash: existingHash },
      });

      const result = await Snapshot.track(mockWorkingDir, ["file.ts"]);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe(existingHash);
      }

      // Should not commit
      expect(mockGitInstance.commit).not.toHaveBeenCalled();
    });

    it("should create empty commit for repos with no initial commit", async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      mockGitInstance.status.mockResolvedValue({
        staged: [],
        created: [],
        deleted: [],
        modified: [],
      });
      // Empty repo - no commits
      mockGitInstance.log.mockResolvedValue({
        total: 0,
        latest: null,
      });
      // After empty commit
      mockGitInstance.log
        .mockResolvedValueOnce({
          total: 0,
          latest: null,
        })
        .mockResolvedValueOnce({
          total: 1,
          latest: { hash: "c".repeat(40) },
        });

      const result = await Snapshot.track(mockWorkingDir, []);

      expect(isOk(result)).toBe(true);
      expect(mockGitInstance.raw).toHaveBeenCalledWith([
        "commit",
        "--allow-empty",
        "-m",
        "snapshot",
      ]);
    });

    it("should use custom commit message", async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      mockGitInstance.status.mockResolvedValue({
        staged: ["file.ts"],
        created: [],
        deleted: [],
        modified: [],
      });

      await Snapshot.track(mockWorkingDir, ["file.ts"], "custom message");

      expect(mockGitInstance.commit).toHaveBeenCalledWith("custom message");
    });
  });

  describe("getInfo", () => {
    it("should return snapshot info for valid hash", async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);

      const hash = "d".repeat(40);
      const timestamp = "2025-12-30T10:00:00+00:00";
      const message = "test snapshot";
      const files = ["src/index.ts", "src/utils.ts"];

      mockGitInstance.show.mockResolvedValue(`${timestamp}\n${message}\n\n${files.join("\n")}`);

      const result = await Snapshot.getInfo(mockWorkingDir, hash);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.hash).toBe(hash);
        expect(result.value.files).toEqual(files);
        expect(result.value.message).toBe(message);
        expect(result.value.timestamp).toBeInstanceOf(Date);
      }
    });

    it("should return error for invalid hash format", async () => {
      const result = await Snapshot.getInfo(mockWorkingDir, "invalid-hash");

      expect(isOk(result)).toBe(false);
      if (!isOk(result)) {
        expect(result.error).toBeInstanceOf(SnapshotError);
        expect(result.error.code).toBe(SnapshotErrorCode.INVALID_HASH);
      }
    });

    it("should return error if shadow repo not initialized", async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error("ENOENT"));

      const hash = "e".repeat(40);
      const result = await Snapshot.getInfo(mockWorkingDir, hash);

      expect(isOk(result)).toBe(false);
      if (!isOk(result)) {
        expect(result.error.code).toBe(SnapshotErrorCode.NOT_INITIALIZED);
      }
    });

    it("should return error if snapshot not found", async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      mockGitInstance.show.mockRejectedValue(new Error("fatal: bad object"));

      const hash = "f".repeat(40);
      const result = await Snapshot.getInfo(mockWorkingDir, hash);

      expect(isOk(result)).toBe(false);
      if (!isOk(result)) {
        expect(result.error.code).toBe(SnapshotErrorCode.NOT_FOUND);
      }
    });
  });

  describe("isInitialized", () => {
    it("should return true if shadow repo exists", async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);

      const result = await Snapshot.isInitialized(mockWorkingDir);

      expect(result).toBe(true);
    });

    it("should return false if shadow repo does not exist", async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error("ENOENT"));

      const result = await Snapshot.isInitialized(mockWorkingDir);

      expect(result).toBe(false);
    });
  });

  describe("getShadowRepoPath", () => {
    it("should return correct shadow repo path", () => {
      const testDir = path.resolve("/test/project");
      const result = Snapshot.getShadowRepoPath(testDir);
      const expected = path.join(testDir, ".vellum", ".git-shadow");

      expect(result).toBe(expected);
    });

    it("should resolve relative paths", () => {
      const result = Snapshot.getShadowRepoPath("./project");

      expect(result).toContain(".vellum");
      expect(result).toContain(".git-shadow");
    });
  });

  describe("restore", () => {
    it("should restore files from a snapshot", async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);

      const hash = "a".repeat(40);
      const files = ["src/index.ts", "src/utils.ts"];

      // Mock cat-file to verify commit exists
      mockGitInstance.raw.mockImplementation(async (args: string[]) => {
        if (args[0] === "cat-file" && args[1] === "-t") {
          return "commit";
        }
        if (args[0] === "ls-tree") {
          return files.join("\n");
        }
        if (args[0] === "read-tree" || args[0] === "checkout-index") {
          return "";
        }
        return "";
      });

      const result = await Snapshot.restore(mockWorkingDir, hash);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toEqual(files);
      }

      // Verify git commands were called
      expect(mockGitInstance.raw).toHaveBeenCalledWith(["cat-file", "-t", hash]);
      expect(mockGitInstance.raw).toHaveBeenCalledWith(["ls-tree", "-r", "--name-only", hash]);
      expect(mockGitInstance.raw).toHaveBeenCalledWith(["read-tree", hash]);
      expect(mockGitInstance.raw).toHaveBeenCalledWith(["checkout-index", "-f", "-a"]);
    });

    it("should return error for invalid hash format", async () => {
      const result = await Snapshot.restore(mockWorkingDir, "invalid-hash");

      expect(isOk(result)).toBe(false);
      if (!isOk(result)) {
        expect(result.error.code).toBe(SnapshotErrorCode.INVALID_HASH);
      }
    });

    it("should return error if shadow repo not initialized", async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error("ENOENT"));

      const hash = "b".repeat(40);
      const result = await Snapshot.restore(mockWorkingDir, hash);

      expect(isOk(result)).toBe(false);
      if (!isOk(result)) {
        expect(result.error.code).toBe(SnapshotErrorCode.NOT_INITIALIZED);
      }
    });

    it("should return error if snapshot not found", async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);

      const hash = "c".repeat(40);
      mockGitInstance.raw.mockResolvedValue("blob"); // Not a commit

      const result = await Snapshot.restore(mockWorkingDir, hash);

      expect(isOk(result)).toBe(false);
      if (!isOk(result)) {
        expect(result.error.code).toBe(SnapshotErrorCode.NOT_FOUND);
      }
    });

    it("should return empty array for snapshot with no files", async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);

      const hash = "d".repeat(40);
      mockGitInstance.raw.mockImplementation(async (args: string[]) => {
        if (args[0] === "cat-file") return "commit";
        if (args[0] === "ls-tree") return "";
        return "";
      });

      const result = await Snapshot.restore(mockWorkingDir, hash);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toEqual([]);
      }
    });
  });

  describe("diff", () => {
    it("should return diff between current state and snapshot", async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);

      const hash = "a".repeat(40);
      const expectedDiff = "diff --git a/file.ts b/file.ts\n+new line";

      mockGitInstance.raw.mockImplementation(async (args: string[]) => {
        if (args[0] === "cat-file" && args[1] === "-t") {
          return "commit";
        }
        if (args[0] === "diff") {
          return expectedDiff;
        }
        return "";
      });

      const result = await Snapshot.diff(mockWorkingDir, hash);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe(expectedDiff);
      }
    });

    it("should return error for invalid hash format", async () => {
      const result = await Snapshot.diff(mockWorkingDir, "invalid");

      expect(isOk(result)).toBe(false);
      if (!isOk(result)) {
        expect(result.error.code).toBe(SnapshotErrorCode.INVALID_HASH);
      }
    });

    it("should return error if shadow repo not initialized", async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error("ENOENT"));

      const hash = "b".repeat(40);
      const result = await Snapshot.diff(mockWorkingDir, hash);

      expect(isOk(result)).toBe(false);
      if (!isOk(result)) {
        expect(result.error.code).toBe(SnapshotErrorCode.NOT_INITIALIZED);
      }
    });

    it("should return error if snapshot not found", async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);

      const hash = "c".repeat(40);
      mockGitInstance.raw.mockResolvedValue(null);

      const result = await Snapshot.diff(mockWorkingDir, hash);

      expect(isOk(result)).toBe(false);
      if (!isOk(result)) {
        expect(result.error.code).toBe(SnapshotErrorCode.NOT_FOUND);
      }
    });
  });

  describe("getDiffSummary", () => {
    it("should return structured diff result", async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);

      const hash = "a".repeat(40);

      mockGitInstance.raw.mockImplementation(async (args: string[]) => {
        if (args[0] === "cat-file" && args[1] === "-t") {
          return "commit";
        }
        if (args[0] === "diff" && args[1] === "--name-status") {
          return "A\tnew-file.ts\nM\tmodified.ts\nD\tdeleted.ts";
        }
        if (args[0] === "diff" && args[1] === "--no-color") {
          return "unified diff output";
        }
        return "";
      });

      const result = await Snapshot.getDiffSummary(mockWorkingDir, hash);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.added).toEqual(["new-file.ts"]);
        expect(result.value.modified).toEqual(["modified.ts"]);
        expect(result.value.deleted).toEqual(["deleted.ts"]);
        expect(result.value.patch).toBe("unified diff output");
      }
    });

    it("should handle renames as delete + add", async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);

      const hash = "b".repeat(40);

      mockGitInstance.raw.mockImplementation(async (args: string[]) => {
        if (args[0] === "cat-file") return "commit";
        if (args[0] === "diff" && args[1] === "--name-status") {
          return "R100\told-name.ts\tnew-name.ts";
        }
        if (args[0] === "diff" && args[1] === "--no-color") {
          return "";
        }
        return "";
      });

      const result = await Snapshot.getDiffSummary(mockWorkingDir, hash);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.deleted).toContain("old-name.ts");
        expect(result.value.added).toContain("new-name.ts");
      }
    });

    it("should return error for invalid hash", async () => {
      const result = await Snapshot.getDiffSummary(mockWorkingDir, "bad");

      expect(isOk(result)).toBe(false);
      if (!isOk(result)) {
        expect(result.error.code).toBe(SnapshotErrorCode.INVALID_HASH);
      }
    });

    it("should return error if shadow repo not initialized", async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error("ENOENT"));

      const hash = "c".repeat(40);
      const result = await Snapshot.getDiffSummary(mockWorkingDir, hash);

      expect(isOk(result)).toBe(false);
      if (!isOk(result)) {
        expect(result.error.code).toBe(SnapshotErrorCode.NOT_INITIALIZED);
      }
    });
  });

  describe("revert", () => {
    it("should revert specified files from most recent snapshot", async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);

      const hash = "a".repeat(40);
      const filesToRevert = ["src/index.ts"];

      mockGitInstance.log.mockResolvedValue({
        total: 1,
        latest: { hash },
      });

      mockGitInstance.raw.mockImplementation(async (args: string[]) => {
        if (args[0] === "ls-tree") {
          return "src/index.ts\nsrc/other.ts";
        }
        if (args[0] === "checkout") {
          return "";
        }
        return "";
      });

      const result = await Snapshot.revert(mockWorkingDir, filesToRevert);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toEqual(["src/index.ts"]);
      }

      expect(mockGitInstance.raw).toHaveBeenCalledWith(["checkout", hash, "--", "src/index.ts"]);
    });

    it("should return empty array when no files specified", async () => {
      const result = await Snapshot.revert(mockWorkingDir, []);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toEqual([]);
      }
    });

    it("should skip files not in snapshot", async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);

      const hash = "b".repeat(40);

      mockGitInstance.log.mockResolvedValue({
        total: 1,
        latest: { hash },
      });

      mockGitInstance.raw.mockImplementation(async (args: string[]) => {
        if (args[0] === "ls-tree") {
          return "src/index.ts";
        }
        if (args[0] === "checkout") {
          return "";
        }
        return "";
      });

      const result = await Snapshot.revert(mockWorkingDir, ["src/nonexistent.ts"]);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toEqual([]);
      }
    });

    it("should return error if shadow repo not initialized", async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error("ENOENT"));

      const result = await Snapshot.revert(mockWorkingDir, ["file.ts"]);

      expect(isOk(result)).toBe(false);
      if (!isOk(result)) {
        expect(result.error.code).toBe(SnapshotErrorCode.NOT_INITIALIZED);
      }
    });

    it("should return error if no snapshots exist", async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      mockGitInstance.log.mockResolvedValue({
        total: 0,
        latest: null,
      });

      const result = await Snapshot.revert(mockWorkingDir, ["file.ts"]);

      expect(isOk(result)).toBe(false);
      if (!isOk(result)) {
        expect(result.error.code).toBe(SnapshotErrorCode.NOT_FOUND);
      }
    });
  });

  describe("listSnapshots", () => {
    it("should list all snapshots sorted by date", async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);

      const hash1 = "a".repeat(40);
      const hash2 = "b".repeat(40);

      mockGitInstance.raw.mockImplementation(async (args: string[]) => {
        if (args[0] === "log") {
          return `${hash1}|2025-12-30T12:00:00+00:00|first snapshot\n${hash2}|2025-12-30T11:00:00+00:00|second snapshot`;
        }
        if (args[0] === "ls-tree") {
          if (args[args.length - 1] === hash1) {
            return "src/index.ts";
          }
          return "src/other.ts";
        }
        return "";
      });

      const result = await Snapshot.listSnapshots(mockWorkingDir);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toHaveLength(2);
        expect(result.value[0]?.hash).toBe(hash1);
        expect(result.value[0]?.message).toBe("first snapshot");
        expect(result.value[1]?.hash).toBe(hash2);
        expect(result.value[1]?.message).toBe("second snapshot");
      }
    });

    it("should return empty array for empty repo", async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      mockGitInstance.raw.mockResolvedValue("");

      const result = await Snapshot.listSnapshots(mockWorkingDir);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toEqual([]);
      }
    });

    it("should return error if shadow repo not initialized", async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error("ENOENT"));

      const result = await Snapshot.listSnapshots(mockWorkingDir);

      expect(isOk(result)).toBe(false);
      if (!isOk(result)) {
        expect(result.error.code).toBe(SnapshotErrorCode.NOT_INITIALIZED);
      }
    });

    it("should handle messages with pipe characters", async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);

      const hash = "c".repeat(40);

      mockGitInstance.raw.mockImplementation(async (args: string[]) => {
        if (args[0] === "log") {
          return `${hash}|2025-12-30T12:00:00+00:00|message|with|pipes`;
        }
        if (args[0] === "ls-tree") {
          return "file.ts";
        }
        return "";
      });

      const result = await Snapshot.listSnapshots(mockWorkingDir);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value[0]?.message).toBe("message|with|pipes");
      }
    });
  });
});
