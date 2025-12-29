import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDefaultData,
  PermissionStorage,
  type StoredPermissionData,
  StoredPermissionDataSchema,
} from "../storage.js";

// Mock fs/promises
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

// Mock os
vi.mock("node:os", () => ({
  homedir: vi.fn(() => "/home/testuser"),
}));

import { mkdir, readFile, writeFile } from "node:fs/promises";

const mockReadFile = vi.mocked(readFile);
const mockWriteFile = vi.mocked(writeFile);
const mockMkdir = vi.mocked(mkdir);

describe("PermissionStorage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================
  // Constructor & getPath
  // ============================================

  describe("constructor", () => {
    it("should use default path when no options provided", () => {
      const storage = new PermissionStorage();
      expect(storage.getPath()).toMatch(/\.vellum[/\\]permissions\.json$/);
    });

    it("should use custom path when provided", () => {
      const customPath = "/custom/path/permissions.json";
      const storage = new PermissionStorage({ storagePath: customPath });
      // Path gets normalized (may change separators on Windows)
      expect(storage.getPath()).toMatch(/[/\\]custom[/\\]path[/\\]permissions\.json$/);
    });

    it("should normalize path for cross-platform compatibility", () => {
      const storage = new PermissionStorage({
        storagePath: "/path//to/../to/permissions.json",
      });
      const path = storage.getPath();
      // Path should be normalized (exact result depends on OS)
      expect(path).not.toContain("//");
    });
  });

  describe("getPath", () => {
    it("should return normalized absolute path", () => {
      const storage = new PermissionStorage({
        storagePath: "/test/permissions.json",
      });
      // Path gets normalized (may change separators on Windows)
      expect(storage.getPath()).toMatch(/[/\\]test[/\\]permissions\.json$/);
    });
  });

  // ============================================
  // load()
  // ============================================

  describe("load", () => {
    it("should return default data when file does not exist (ENOENT)", async () => {
      const error = new Error("ENOENT") as NodeJS.ErrnoException;
      error.code = "ENOENT";
      mockReadFile.mockRejectedValue(error);

      const storage = new PermissionStorage();
      const data = await storage.load();

      expect(data.version).toBe(1);
      expect(data.trustedFolders).toEqual([]);
      expect(data.protectedPatterns).toEqual([]);
    });

    it("should parse valid JSON file correctly", async () => {
      const storedData: StoredPermissionData = {
        version: 1,
        trustedFolders: ["/home/user/project"],
        protectedPatterns: ["*.secret"],
        safeCommandPatterns: ["ls *"],
        dangerousCommandPatterns: ["rm -rf *"],
        rememberedPermissions: {},
        lastModified: Date.now(),
      };
      mockReadFile.mockResolvedValue(JSON.stringify(storedData));

      const storage = new PermissionStorage();
      const data = await storage.load();

      expect(data.version).toBe(1);
      expect(data.trustedFolders).toEqual(["/home/user/project"]);
      expect(data.protectedPatterns).toEqual(["*.secret"]);
    });

    it("should handle partial data with defaults (schema validation)", async () => {
      // Only provide version, rest should use defaults
      mockReadFile.mockResolvedValue(JSON.stringify({ version: 1 }));

      const storage = new PermissionStorage();
      const data = await storage.load();

      expect(data.version).toBe(1);
      expect(data.trustedFolders).toEqual([]);
      expect(data.protectedPatterns).toEqual([]);
      expect(data.rememberedPermissions).toEqual({});
    });

    it("should recover from corrupted JSON (EC-007)", async () => {
      // First read returns corrupted JSON
      mockReadFile.mockResolvedValueOnce("{ invalid json }");
      // Backup read succeeds
      mockReadFile.mockResolvedValueOnce("{ invalid json }");

      const storage = new PermissionStorage();
      const data = await storage.load();

      // Should return defaults
      expect(data.version).toBe(1);
      expect(data.trustedFolders).toEqual([]);

      // Should have attempted to create backup
      expect(mockWriteFile).toHaveBeenCalled();
    });

    it("should recover from invalid schema (EC-007)", async () => {
      // Valid JSON but invalid schema
      mockReadFile.mockResolvedValueOnce(
        JSON.stringify({ version: "invalid", unknownField: true })
      );
      mockReadFile.mockResolvedValueOnce(
        JSON.stringify({ version: "invalid", unknownField: true })
      );

      const storage = new PermissionStorage();
      const data = await storage.load();

      // Should return defaults after validation failure
      expect(data.version).toBe(1);
    });

    it("should re-throw unexpected errors", async () => {
      const unexpectedError = new Error("Unexpected error");
      mockReadFile.mockRejectedValue(unexpectedError);

      const storage = new PermissionStorage();
      await expect(storage.load()).rejects.toThrow("Unexpected error");
    });
  });

  // ============================================
  // save()
  // ============================================

  describe("save", () => {
    it("should create directory if it does not exist", async () => {
      mockWriteFile.mockResolvedValue(undefined);
      mockMkdir.mockResolvedValue(undefined);

      const storage = new PermissionStorage({
        storagePath: "/new/dir/permissions.json",
      });
      await storage.save(createDefaultData());

      // Path gets normalized (may change separators on Windows)
      expect(mockMkdir).toHaveBeenCalled();
      const [dirPath, options] = mockMkdir.mock.calls[0] as [string, { recursive: boolean }];
      expect(dirPath).toMatch(/[/\\]new[/\\]dir$/);
      expect(options).toEqual({ recursive: true });
    });

    it("should not create directory when autoCreateDir is false", async () => {
      mockWriteFile.mockResolvedValue(undefined);

      const storage = new PermissionStorage({
        storagePath: "/existing/dir/permissions.json",
        autoCreateDir: false,
      });
      await storage.save(createDefaultData());

      expect(mockMkdir).not.toHaveBeenCalled();
    });

    it("should write JSON with pretty formatting", async () => {
      mockWriteFile.mockResolvedValue(undefined);
      mockMkdir.mockResolvedValue(undefined);

      const storage = new PermissionStorage();
      const data = createDefaultData();
      data.trustedFolders = ["/home/user/project"];

      await storage.save(data);

      expect(mockWriteFile).toHaveBeenCalled();
      const [, content] = mockWriteFile.mock.calls[0] as [string, string, string];
      const parsed = JSON.parse(content);
      expect(parsed.trustedFolders).toEqual(["/home/user/project"]);
      // Pretty printed has newlines
      expect(content).toContain("\n");
    });

    it("should update lastModified timestamp", async () => {
      mockWriteFile.mockResolvedValue(undefined);
      mockMkdir.mockResolvedValue(undefined);

      const storage = new PermissionStorage();
      const data = createDefaultData();
      const originalTimestamp = data.lastModified;

      // Wait a bit to ensure timestamp changes
      await new Promise((resolve) => setTimeout(resolve, 10));

      await storage.save(data);

      const [, content] = mockWriteFile.mock.calls[0] as [string, string, string];
      const parsed = JSON.parse(content);
      expect(parsed.lastModified).toBeGreaterThanOrEqual(originalTimestamp ?? 0);
    });

    it("should validate data before saving", async () => {
      mockWriteFile.mockResolvedValue(undefined);
      mockMkdir.mockResolvedValue(undefined);

      const storage = new PermissionStorage();
      const invalidData = { version: "invalid" } as unknown as StoredPermissionData;

      await expect(storage.save(invalidData)).rejects.toThrow();
    });
  });

  // ============================================
  // Schema Tests
  // ============================================

  describe("StoredPermissionDataSchema", () => {
    it("should validate complete data", () => {
      const data = {
        version: 1,
        trustedFolders: ["/path1", "/path2"],
        protectedPatterns: ["*.secret"],
        safeCommandPatterns: ["ls *"],
        dangerousCommandPatterns: ["rm -rf *"],
        rememberedPermissions: {
          "perm-123": { level: "allow" as const },
        },
        lastModified: Date.now(),
      };

      const result = StoredPermissionDataSchema.parse(data);
      expect(result.version).toBe(1);
      expect(result.trustedFolders).toHaveLength(2);
    });

    it("should provide defaults for missing fields", () => {
      const data = { version: 1 };
      const result = StoredPermissionDataSchema.parse(data);

      expect(result.trustedFolders).toEqual([]);
      expect(result.protectedPatterns).toEqual([]);
      expect(result.rememberedPermissions).toEqual({});
    });

    it("should validate remembered permissions with expiry", () => {
      const data = {
        version: 1,
        trustedFolders: [],
        protectedPatterns: [],
        safeCommandPatterns: [],
        dangerousCommandPatterns: [],
        rememberedPermissions: {
          "perm-1": { level: "allow" as const, expiresAt: Date.now() + 3600000 },
          "perm-2": { level: "deny" as const },
        },
      };

      const result = StoredPermissionDataSchema.parse(data);
      expect(result.rememberedPermissions["perm-1"]?.expiresAt).toBeDefined();
      expect(result.rememberedPermissions["perm-2"]?.expiresAt).toBeUndefined();
    });
  });

  // ============================================
  // createDefaultData
  // ============================================

  describe("createDefaultData", () => {
    it("should create valid default data", () => {
      const data = createDefaultData();

      expect(data.version).toBe(1);
      expect(data.trustedFolders).toEqual([]);
      expect(data.protectedPatterns).toEqual([]);
      expect(data.safeCommandPatterns).toEqual([]);
      expect(data.dangerousCommandPatterns).toEqual([]);
      expect(data.rememberedPermissions).toEqual({});
      expect(data.lastModified).toBeDefined();
    });

    it("should validate against schema", () => {
      const data = createDefaultData();
      expect(() => StoredPermissionDataSchema.parse(data)).not.toThrow();
    });
  });
});
