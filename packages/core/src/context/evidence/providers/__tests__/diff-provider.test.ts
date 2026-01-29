/**
 * DiffProvider Unit Tests
 *
 * Tests for the Git Diff Evidence Provider.
 *
 * @module context/evidence/providers/__tests__/diff-provider.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VellumError } from "../../../../errors/types.js";
import type { GitFileDiff, GitPatch, IGitSnapshotService } from "../../../../git/types.js";
import type { Result } from "../../../../types/result.js";
import type { Signal } from "../../types.js";
import { DiffProvider, type DiffProviderConfig } from "../diff-provider.js";

// =============================================================================
// Mock Helpers
// =============================================================================

/**
 * Creates a mock GitSnapshotService with configurable behavior.
 */
function createMockGitService(overrides: Partial<IGitSnapshotService> = {}): IGitSnapshotService {
  return {
    track: vi.fn().mockResolvedValue({ ok: true, value: "abc123" }),
    patch: vi
      .fn()
      .mockResolvedValue({ ok: true, value: { files: [] } } as Result<GitPatch, VellumError>),
    diff: vi.fn().mockResolvedValue({ ok: true, value: "" }),
    diffFull: vi
      .fn()
      .mockResolvedValue({ ok: true, value: [] } as Result<GitFileDiff[], VellumError>),
    restore: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
    revert: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
    ...overrides,
  };
}

/**
 * Creates a mock GitFileDiff for testing.
 */
function createMockFileDiff(
  path: string,
  options: {
    type?: "added" | "modified" | "deleted" | "renamed";
    beforeContent?: string;
    afterContent?: string;
    oldPath?: string;
    diff?: string;
  } = {}
): GitFileDiff {
  return {
    path,
    type: options.type ?? "modified",
    beforeContent: options.beforeContent,
    afterContent: options.afterContent,
    oldPath: options.oldPath,
    diff: options.diff,
  };
}

/**
 * Creates a mock Signal for testing.
 */
function createMockSignal(
  type: Signal["type"],
  value: string,
  options: Partial<Signal> = {}
): Signal {
  return {
    type,
    value,
    source: options.source ?? "user_message",
    confidence: options.confidence ?? 1.0,
    metadata: options.metadata,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe("DiffProvider", () => {
  let mockGitService: IGitSnapshotService;
  let provider: DiffProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGitService = createMockGitService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("should create provider with required config", () => {
      const config: DiffProviderConfig = {
        gitService: mockGitService,
      };
      provider = new DiffProvider(config);

      expect(provider.type).toBe("diff");
      expect(provider.name).toBe("Git Diff");
      expect(provider.baseWeight).toBe(100);
    });

    it("should apply snapshot hash from config", () => {
      const config: DiffProviderConfig = {
        gitService: mockGitService,
        snapshotHash: "abc123def456",
      };
      provider = new DiffProvider(config);

      // Provider should use the snapshot hash (tested via isAvailable)
      expect(provider).toBeDefined();
    });
  });

  describe("setSnapshotHash", () => {
    it("should update the snapshot hash", async () => {
      provider = new DiffProvider({ gitService: mockGitService });

      // Initially no snapshot hash, should not be available
      expect(await provider.isAvailable()).toBe(false);

      // Set snapshot hash
      provider.setSnapshotHash("new-hash-123");

      // Now should be available (mock returns ok)
      expect(await provider.isAvailable()).toBe(true);
    });
  });

  describe("isAvailable", () => {
    it("should return false when git service is not set", async () => {
      provider = new DiffProvider({ gitService: mockGitService });
      // No snapshot hash set

      const result = await provider.isAvailable();

      expect(result).toBe(false);
    });

    it("should return false when snapshot hash is not set", async () => {
      provider = new DiffProvider({ gitService: mockGitService });

      const result = await provider.isAvailable();

      expect(result).toBe(false);
      expect(mockGitService.patch).not.toHaveBeenCalled();
    });

    it("should return true when git service is available", async () => {
      provider = new DiffProvider({
        gitService: mockGitService,
        snapshotHash: "valid-hash",
      });

      const result = await provider.isAvailable();

      expect(result).toBe(true);
      expect(mockGitService.patch).toHaveBeenCalledWith("valid-hash");
    });

    it("should return false when patch operation fails", async () => {
      mockGitService = createMockGitService({
        patch: vi.fn().mockResolvedValue({
          ok: false,
          error: { code: "GIT_ERROR", message: "Failed to get patch" },
        }),
      });
      provider = new DiffProvider({
        gitService: mockGitService,
        snapshotHash: "invalid-hash",
      });

      const result = await provider.isAvailable();

      expect(result).toBe(false);
    });

    it("should return false when patch operation throws", async () => {
      mockGitService = createMockGitService({
        patch: vi.fn().mockRejectedValue(new Error("Git error")),
      });
      provider = new DiffProvider({
        gitService: mockGitService,
        snapshotHash: "error-hash",
      });

      const result = await provider.isAvailable();

      expect(result).toBe(false);
    });
  });

  describe("query", () => {
    beforeEach(() => {
      mockGitService = createMockGitService();
      provider = new DiffProvider({
        gitService: mockGitService,
        snapshotHash: "test-hash",
      });
    });

    it("should return empty array when no diffs", async () => {
      mockGitService.diffFull = vi.fn().mockResolvedValue({
        ok: true,
        value: [],
      });

      const signals: Signal[] = [createMockSignal("path", "src/index.ts")];
      const result = await provider.query(signals);

      expect(result).toEqual([]);
    });

    it("should return empty array when no snapshot hash", async () => {
      provider = new DiffProvider({ gitService: mockGitService });

      const signals: Signal[] = [createMockSignal("path", "src/index.ts")];
      const result = await provider.query(signals);

      expect(result).toEqual([]);
      expect(mockGitService.diffFull).not.toHaveBeenCalled();
    });

    it("should return empty array when diffFull fails", async () => {
      mockGitService.diffFull = vi.fn().mockResolvedValue({
        ok: false,
        error: { code: "GIT_ERROR", message: "Failed" },
      });

      const signals: Signal[] = [createMockSignal("path", "src/index.ts")];
      const result = await provider.query(signals);

      expect(result).toEqual([]);
    });

    it("should match path signals to diff files", async () => {
      const fileDiffs: GitFileDiff[] = [
        createMockFileDiff("src/index.ts", {
          type: "modified",
          afterContent: "export const foo = 1;",
        }),
        createMockFileDiff("src/other.ts", {
          type: "added",
          afterContent: "export const bar = 2;",
        }),
      ];
      mockGitService.diffFull = vi.fn().mockResolvedValue({
        ok: true,
        value: fileDiffs,
      });

      const signals: Signal[] = [createMockSignal("path", "index.ts")];
      const result = await provider.query(signals);

      // Should only include the file matching the path signal
      expect(result.length).toBe(1);
      expect(result[0]?.path).toBe("src/index.ts");
      expect(result[0]?.provider).toBe("diff");
    });

    it("should match symbol signals in diff content", async () => {
      const fileDiffs: GitFileDiff[] = [
        createMockFileDiff("src/utils.ts", {
          type: "modified",
          afterContent: "export function calculateTotal(items) { return items.length; }",
        }),
        createMockFileDiff("src/other.ts", {
          type: "modified",
          afterContent: "export const unrelated = true;",
        }),
      ];
      mockGitService.diffFull = vi.fn().mockResolvedValue({
        ok: true,
        value: fileDiffs,
      });

      const signals: Signal[] = [createMockSignal("symbol", "calculateTotal")];
      const result = await provider.query(signals);

      // Should include file with matching symbol
      expect(result.length).toBe(1);
      expect(result[0]?.path).toBe("src/utils.ts");
      expect(result[0]?.matchedSignals).toContainEqual(
        expect.objectContaining({ type: "symbol", value: "calculateTotal" })
      );
    });

    it("should match error tokens in diff content", async () => {
      const fileDiffs: GitFileDiff[] = [
        createMockFileDiff("src/api.ts", {
          type: "modified",
          afterContent: "throw new Error('connection timeout');",
        }),
      ];
      mockGitService.diffFull = vi.fn().mockResolvedValue({
        ok: true,
        value: fileDiffs,
      });

      const signals: Signal[] = [createMockSignal("error_token", "timeout")];
      const result = await provider.query(signals);

      expect(result.length).toBe(1);
      expect(result[0]?.path).toBe("src/api.ts");
    });

    it("should respect maxResults option", async () => {
      const fileDiffs: GitFileDiff[] = Array.from({ length: 10 }, (_, i) =>
        createMockFileDiff(`src/file${i}.ts`, {
          type: "modified",
          afterContent: `export const foo${i} = ${i};`,
        })
      );
      mockGitService.diffFull = vi.fn().mockResolvedValue({
        ok: true,
        value: fileDiffs,
      });

      const signals: Signal[] = []; // No signals = include all diffs
      const result = await provider.query(signals, { maxResults: 3 });

      expect(result.length).toBe(3);
    });

    it("should respect include patterns", async () => {
      const fileDiffs: GitFileDiff[] = [
        createMockFileDiff("src/component.tsx", { afterContent: "code" }),
        createMockFileDiff("src/utils.ts", { afterContent: "code" }),
        createMockFileDiff("test/component.test.ts", { afterContent: "code" }),
      ];
      mockGitService.diffFull = vi.fn().mockResolvedValue({
        ok: true,
        value: fileDiffs,
      });

      const result = await provider.query([], {
        includePatterns: ["*.tsx"],
      });

      expect(result.length).toBe(1);
      expect(result[0]?.path).toBe("src/component.tsx");
    });

    it("should respect exclude patterns", async () => {
      const fileDiffs: GitFileDiff[] = [
        createMockFileDiff("src/index.ts", { afterContent: "code" }),
        createMockFileDiff("test/index.test.ts", { afterContent: "code" }),
      ];
      mockGitService.diffFull = vi.fn().mockResolvedValue({
        ok: true,
        value: fileDiffs,
      });

      const result = await provider.query([], {
        excludePatterns: ["test/**"],
      });

      expect(result.length).toBe(1);
      expect(result[0]?.path).toBe("src/index.ts");
    });

    it("should handle renamed files with oldPath", async () => {
      const fileDiffs: GitFileDiff[] = [
        createMockFileDiff("src/newName.ts", {
          type: "renamed",
          oldPath: "src/oldName.ts",
          afterContent: "renamed file content",
        }),
      ];
      mockGitService.diffFull = vi.fn().mockResolvedValue({
        ok: true,
        value: fileDiffs,
      });

      // Search for the old path name
      const signals: Signal[] = [createMockSignal("path", "oldName.ts")];
      const result = await provider.query(signals);

      // Should match via oldPath
      expect(result.length).toBe(1);
      expect(result[0]?.path).toBe("src/newName.ts");
    });

    it("should create evidence with correct metadata", async () => {
      const fileDiffs: GitFileDiff[] = [
        createMockFileDiff("src/index.ts", {
          type: "modified",
          afterContent: "export const value = 42;",
        }),
      ];
      mockGitService.diffFull = vi.fn().mockResolvedValue({
        ok: true,
        value: fileDiffs,
      });

      const result = await provider.query([]);

      expect(result.length).toBe(1);
      const evidence = result[0];
      expect(evidence?.id).toBeDefined();
      expect(evidence?.provider).toBe("diff");
      expect(evidence?.baseScore).toBe(100);
      expect(evidence?.content).toContain("export const value = 42;");
      expect(evidence?.metadata?.changeType).toBe("modified");
    });

    it("should apply token budget", async () => {
      const longContent = "x".repeat(1000);
      const fileDiffs: GitFileDiff[] = Array.from({ length: 5 }, (_, i) =>
        createMockFileDiff(`src/file${i}.ts`, {
          type: "modified",
          afterContent: longContent,
        })
      );
      mockGitService.diffFull = vi.fn().mockResolvedValue({
        ok: true,
        value: fileDiffs,
      });

      // Set a small token budget
      const result = await provider.query([], { maxTokens: 100 });

      // Should limit results based on token budget
      expect(result.length).toBeLessThan(5);
    });
  });
});
