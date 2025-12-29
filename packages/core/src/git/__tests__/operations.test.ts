/**
 * Unit tests for GitOperations
 *
 * Tests low-level git operations using mocked simple-git.
 *
 * @see packages/core/src/git/operations.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { simpleGit } from "simple-git";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { ErrorCode } from "../../errors/types.js";
import { GitOperations } from "../operations.js";

// =============================================================================
// Mock Setup
// =============================================================================

vi.mock("simple-git", () => {
  const mockGit = {
    add: vi.fn().mockResolvedValue(undefined),
    raw: vi.fn().mockResolvedValue(""),
    diff: vi.fn().mockResolvedValue(""),
    show: vi.fn().mockResolvedValue(""),
    checkout: vi.fn().mockResolvedValue(undefined),
    env: vi.fn().mockReturnThis(),
  };

  return {
    simpleGit: vi.fn().mockReturnValue(mockGit),
  };
});

vi.mock("node:fs", () => ({
  existsSync: vi.fn().mockReturnValue(true),
}));

// =============================================================================
// T032: GitOperations Tests
// =============================================================================

describe("GitOperations", () => {
  let mockGit: {
    add: Mock;
    raw: Mock;
    diff: Mock;
    show: Mock;
    checkout: Mock;
    env: Mock;
  };

  const testWorkDir = "/test/repo";

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset mock implementations
    mockGit = {
      add: vi.fn().mockResolvedValue(undefined),
      raw: vi.fn().mockResolvedValue(""),
      diff: vi.fn().mockResolvedValue(""),
      show: vi.fn().mockResolvedValue(""),
      checkout: vi.fn().mockResolvedValue(undefined),
      env: vi.fn().mockReturnThis(),
    };

    (simpleGit as Mock).mockReturnValue(mockGit);
    (fs.existsSync as Mock).mockReturnValue(true);
  });

  // ===========================================================================
  // Constructor Tests
  // ===========================================================================

  describe("constructor", () => {
    it("should validate .git directory exists", () => {
      (fs.existsSync as Mock).mockReturnValue(false);

      expect(() => new GitOperations(testWorkDir)).toThrow();
    });

    it("should throw gitNotInitializedError when .git missing", () => {
      (fs.existsSync as Mock).mockReturnValue(false);

      try {
        new GitOperations(testWorkDir);
        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as Error).message).toContain("Git repository not initialized");
      }
    });

    it("should create GitOperations when .git exists", () => {
      (fs.existsSync as Mock).mockReturnValue(true);

      const ops = new GitOperations(testWorkDir);

      expect(ops).toBeInstanceOf(GitOperations);
      expect(simpleGit).toHaveBeenCalled();
    });

    it("should configure simple-git with sanitized environment", () => {
      new GitOperations(testWorkDir);

      expect(mockGit.env).toHaveBeenCalled();
    });

    it("should resolve relative paths", () => {
      const ops = new GitOperations(testWorkDir);

      expect(ops.getWorkDir()).toBe(path.resolve(testWorkDir));
    });
  });

  // ===========================================================================
  // stageAll() Tests
  // ===========================================================================

  describe("stageAll()", () => {
    it("should call git add .", async () => {
      const ops = new GitOperations(testWorkDir);

      const result = await ops.stageAll();

      expect(result.ok).toBe(true);
      expect(mockGit.add).toHaveBeenCalledWith(".");
    });

    it("should return Ok on success", async () => {
      const ops = new GitOperations(testWorkDir);

      const result = await ops.stageAll();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeUndefined();
      }
    });

    it("should return Err on failure", async () => {
      mockGit.add.mockRejectedValue(new Error("git add failed"));
      const ops = new GitOperations(testWorkDir);

      const result = await ops.stageAll();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.GIT_OPERATION_FAILED);
        expect(result.error.message).toContain("git add");
      }
    });
  });

  // ===========================================================================
  // writeTree() Tests
  // ===========================================================================

  describe("writeTree()", () => {
    it("should return 40-char SHA on success", async () => {
      const treeSha = "a".repeat(40);
      mockGit.raw.mockResolvedValue(treeSha);
      const ops = new GitOperations(testWorkDir);

      const result = await ops.writeTree();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(treeSha);
        expect(result.value).toHaveLength(40);
      }
    });

    it("should call git write-tree", async () => {
      mockGit.raw.mockResolvedValue("b".repeat(40));
      const ops = new GitOperations(testWorkDir);

      await ops.writeTree();

      expect(mockGit.raw).toHaveBeenCalledWith(["write-tree"]);
    });

    it("should trim whitespace from SHA", async () => {
      const treeSha = "c".repeat(40);
      mockGit.raw.mockResolvedValue(`  ${treeSha}\n`);
      const ops = new GitOperations(testWorkDir);

      const result = await ops.writeTree();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(treeSha);
      }
    });

    it("should return Err for invalid SHA format", async () => {
      mockGit.raw.mockResolvedValue("invalid-sha");
      const ops = new GitOperations(testWorkDir);

      const result = await ops.writeTree();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.GIT_OPERATION_FAILED);
        expect(result.error.message).toContain("Invalid tree SHA");
      }
    });

    it("should return Err on git error", async () => {
      mockGit.raw.mockRejectedValue(new Error("write-tree failed"));
      const ops = new GitOperations(testWorkDir);

      const result = await ops.writeTree();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.GIT_OPERATION_FAILED);
      }
    });
  });

  // ===========================================================================
  // readTree() Tests
  // ===========================================================================

  describe("readTree()", () => {
    it("should call git read-tree with hash", async () => {
      const hash = "d".repeat(40);
      const ops = new GitOperations(testWorkDir);

      await ops.readTree(hash);

      expect(mockGit.raw).toHaveBeenCalledWith(["read-tree", hash]);
    });

    it("should return Ok on success", async () => {
      mockGit.raw.mockResolvedValue("");
      const ops = new GitOperations(testWorkDir);

      const result = await ops.readTree("e".repeat(40));

      expect(result.ok).toBe(true);
    });

    it("should return Err on failure", async () => {
      mockGit.raw.mockRejectedValue(new Error("read-tree failed"));
      const ops = new GitOperations(testWorkDir);

      const result = await ops.readTree("f".repeat(40));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.GIT_OPERATION_FAILED);
      }
    });
  });

  // ===========================================================================
  // checkoutIndex() Tests
  // ===========================================================================

  describe("checkoutIndex()", () => {
    it("should call git checkout-index -a -f", async () => {
      const ops = new GitOperations(testWorkDir);

      await ops.checkoutIndex();

      expect(mockGit.raw).toHaveBeenCalledWith(["checkout-index", "-a", "-f"]);
    });

    it("should return Ok on success", async () => {
      mockGit.raw.mockResolvedValue("");
      const ops = new GitOperations(testWorkDir);

      const result = await ops.checkoutIndex();

      expect(result.ok).toBe(true);
    });

    it("should return Err on failure", async () => {
      mockGit.raw.mockRejectedValue(new Error("checkout-index failed"));
      const ops = new GitOperations(testWorkDir);

      const result = await ops.checkoutIndex();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.GIT_OPERATION_FAILED);
      }
    });
  });

  // ===========================================================================
  // diffNames() Tests
  // ===========================================================================

  describe("diffNames()", () => {
    it("should parse status codes correctly", async () => {
      mockGit.raw.mockResolvedValue("M\tsrc/file.ts\nA\tsrc/new.ts\nD\tsrc/old.ts");
      const ops = new GitOperations(testWorkDir);

      const result = await ops.diffNames("g".repeat(40));

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(3);
        expect(result.value[0]).toEqual({ status: "M", path: "src/file.ts" });
        expect(result.value[1]).toEqual({ status: "A", path: "src/new.ts" });
        expect(result.value[2]).toEqual({ status: "D", path: "src/old.ts" });
      }
    });

    it("should handle renamed files with R status", async () => {
      mockGit.raw.mockResolvedValue("R100\told/path.ts\tnew/path.ts");
      const ops = new GitOperations(testWorkDir);

      const result = await ops.diffNames("h".repeat(40));

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0]).toEqual({
          status: "R",
          path: "new/path.ts",
          oldPath: "old/path.ts",
        });
      }
    });

    it("should handle copied files with C status", async () => {
      mockGit.raw.mockResolvedValue("C100\toriginal.ts\tcopy.ts");
      const ops = new GitOperations(testWorkDir);

      const result = await ops.diffNames("i".repeat(40));

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0]).toEqual({
          status: "C",
          path: "copy.ts",
          oldPath: "original.ts",
        });
      }
    });

    it("should handle empty diff", async () => {
      mockGit.raw.mockResolvedValue("");
      const ops = new GitOperations(testWorkDir);

      const result = await ops.diffNames("j".repeat(40));

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(0);
      }
    });

    it("should return Err on failure", async () => {
      mockGit.raw.mockRejectedValue(new Error("diff-tree failed"));
      const ops = new GitOperations(testWorkDir);

      const result = await ops.diffNames("k".repeat(40));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.GIT_OPERATION_FAILED);
      }
    });

    it("should call correct git command", async () => {
      const hash = "l".repeat(40);
      mockGit.raw.mockResolvedValue("");
      const ops = new GitOperations(testWorkDir);

      await ops.diffNames(hash);

      expect(mockGit.raw).toHaveBeenCalledWith([
        "diff-tree",
        "--no-commit-id",
        "--name-status",
        "-r",
        hash,
      ]);
    });
  });

  // ===========================================================================
  // diffUnified() Tests
  // ===========================================================================

  describe("diffUnified()", () => {
    it("should return unified diff text", async () => {
      const diffOutput = `diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,4 @@
 line 1
+new line
 line 2`;
      mockGit.diff.mockResolvedValue(diffOutput);
      const ops = new GitOperations(testWorkDir);

      const result = await ops.diffUnified("m".repeat(40));

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(diffOutput);
      }
    });

    it("should call git diff with hash", async () => {
      const hash = "n".repeat(40);
      mockGit.diff.mockResolvedValue("");
      const ops = new GitOperations(testWorkDir);

      await ops.diffUnified(hash);

      expect(mockGit.diff).toHaveBeenCalledWith([hash]);
    });

    it("should return Err on failure", async () => {
      mockGit.diff.mockRejectedValue(new Error("diff failed"));
      const ops = new GitOperations(testWorkDir);

      const result = await ops.diffUnified("o".repeat(40));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.GIT_OPERATION_FAILED);
      }
    });
  });

  // ===========================================================================
  // showFile() Tests
  // ===========================================================================

  describe("showFile()", () => {
    it("should return file content", async () => {
      const content = "file content here";
      mockGit.show.mockResolvedValue(content);
      const ops = new GitOperations(testWorkDir);

      const result = await ops.showFile("p".repeat(40), "src/file.ts");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(content);
      }
    });

    it("should call git show with correct format", async () => {
      const hash = "q".repeat(40);
      mockGit.show.mockResolvedValue("");
      const ops = new GitOperations(testWorkDir);

      await ops.showFile(hash, "src/file.ts");

      expect(mockGit.show).toHaveBeenCalledWith([`${hash}:src/file.ts`]);
    });

    it("should normalize path separators", async () => {
      const hash = "r".repeat(40);
      mockGit.show.mockResolvedValue("");
      const ops = new GitOperations(testWorkDir);

      // On Windows, backslashes should be converted to forward slashes
      await ops.showFile(hash, "src/nested/file.ts");

      expect(mockGit.show).toHaveBeenCalledWith([`${hash}:src/nested/file.ts`]);
    });

    it("should return Err on failure", async () => {
      mockGit.show.mockRejectedValue(new Error("show failed"));
      const ops = new GitOperations(testWorkDir);

      const result = await ops.showFile("s".repeat(40), "missing.ts");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.GIT_OPERATION_FAILED);
      }
    });
  });

  // ===========================================================================
  // checkoutFile() Tests
  // ===========================================================================

  describe("checkoutFile()", () => {
    it("should call git checkout with correct args", async () => {
      const hash = "t".repeat(40);
      mockGit.checkout.mockResolvedValue(undefined);
      const ops = new GitOperations(testWorkDir);

      await ops.checkoutFile(hash, "src/file.ts");

      expect(mockGit.checkout).toHaveBeenCalledWith([hash, "--", "src/file.ts"]);
    });

    it("should return Ok on success", async () => {
      mockGit.checkout.mockResolvedValue(undefined);
      const ops = new GitOperations(testWorkDir);

      const result = await ops.checkoutFile("u".repeat(40), "file.ts");

      expect(result.ok).toBe(true);
    });

    it("should return Err on failure", async () => {
      mockGit.checkout.mockRejectedValue(new Error("checkout failed"));
      const ops = new GitOperations(testWorkDir);

      const result = await ops.checkoutFile("v".repeat(40), "file.ts");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.GIT_OPERATION_FAILED);
      }
    });

    it("should normalize path separators", async () => {
      const hash = "w".repeat(40);
      mockGit.checkout.mockResolvedValue(undefined);
      const ops = new GitOperations(testWorkDir);

      await ops.checkoutFile(hash, "src/nested/file.ts");

      expect(mockGit.checkout).toHaveBeenCalledWith([hash, "--", "src/nested/file.ts"]);
    });
  });

  // ===========================================================================
  // getWorkDir() Tests
  // ===========================================================================

  describe("getWorkDir()", () => {
    it("should return the working directory", () => {
      const ops = new GitOperations(testWorkDir);

      expect(ops.getWorkDir()).toBe(path.resolve(testWorkDir));
    });
  });

  // ===========================================================================
  // Error Handling Tests
  // ===========================================================================

  describe("error handling", () => {
    it("should wrap errors in VellumError", async () => {
      mockGit.add.mockRejectedValue(new Error("Original error"));
      const ops = new GitOperations(testWorkDir);

      const result = await ops.stageAll();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toHaveProperty("code");
        expect(result.error).toHaveProperty("message");
      }
    });

    it("should include operation details in error", async () => {
      mockGit.raw.mockRejectedValue(new Error("Test error"));
      const ops = new GitOperations(testWorkDir);

      const result = await ops.writeTree();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain("git write-tree");
      }
    });

    it("should use Result pattern consistently", async () => {
      const ops = new GitOperations(testWorkDir);

      // Success case
      mockGit.add.mockResolvedValue(undefined);
      const successResult = await ops.stageAll();
      expect(successResult).toHaveProperty("ok", true);

      // Failure case
      mockGit.add.mockRejectedValue(new Error("fail"));
      const failResult = await ops.stageAll();
      expect(failResult).toHaveProperty("ok", false);
      expect(failResult).toHaveProperty("error");
    });
  });
});
