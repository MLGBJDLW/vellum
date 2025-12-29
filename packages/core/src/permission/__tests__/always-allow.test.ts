import { beforeEach, describe, expect, it } from "vitest";
import { AlwaysAllowManager } from "../always-allow.js";
import { SessionPermissionManager } from "../session-manager.js";
import type { PermissionStorage, StoredPermissionData } from "../storage.js";

// Mock the PermissionStorage
class MockPermissionStorage {
  private data: StoredPermissionData = {
    version: 1,
    trustedFolders: [],
    protectedPatterns: [],
    safeCommandPatterns: [],
    dangerousCommandPatterns: [],
    rememberedPermissions: {},
  };

  async load(): Promise<StoredPermissionData> {
    return { ...this.data };
  }

  async save(data: StoredPermissionData): Promise<void> {
    this.data = { ...data };
  }

  getPath(): string {
    return "/mock/path/permissions.json";
  }

  // Test helper to get current data
  getData(): StoredPermissionData {
    return this.data;
  }

  // Test helper to set data
  setData(data: Partial<StoredPermissionData>): void {
    this.data = { ...this.data, ...data };
  }
}

describe("AlwaysAllowManager", () => {
  let mockStorage: MockPermissionStorage;
  let sessionManager: SessionPermissionManager;
  let alwaysAllow: AlwaysAllowManager;

  beforeEach(() => {
    mockStorage = new MockPermissionStorage();
    sessionManager = new SessionPermissionManager();
    alwaysAllow = new AlwaysAllowManager({
      storage: mockStorage as unknown as PermissionStorage,
      sessionManager,
    });
  });

  // ============================================
  // Constructor
  // ============================================

  describe("constructor", () => {
    it("should initialize with empty entries", () => {
      expect(alwaysAllow.size).toBe(0);
      expect(alwaysAllow.isLoaded).toBe(false);
    });

    it("should use provided storage", () => {
      expect(alwaysAllow.storage).toBe(mockStorage);
    });

    it("should use provided session manager", () => {
      expect(alwaysAllow.sessionManager).toBe(sessionManager);
    });
  });

  // ============================================
  // load
  // ============================================

  describe("load", () => {
    it("should load permissions from storage", async () => {
      mockStorage.setData({
        rememberedPermissions: {
          edit: { level: "allow" },
          "bash:git *": { level: "allow" },
        },
      });

      await alwaysAllow.load();

      expect(alwaysAllow.size).toBe(2);
      expect(alwaysAllow.isLoaded).toBe(true);
    });

    it("should sync loaded permissions to session manager", async () => {
      mockStorage.setData({
        rememberedPermissions: {
          edit: { level: "allow" },
        },
      });

      await alwaysAllow.load();

      const result = sessionManager.has({ type: "edit" });
      expect(result.hasPermission).toBe(true);
      expect(result.entry?.source).toBe("config");
    });

    it("should only load allow-level permissions", async () => {
      mockStorage.setData({
        rememberedPermissions: {
          edit: { level: "allow" },
          bash: { level: "deny" },
        },
      });

      await alwaysAllow.load();

      expect(alwaysAllow.size).toBe(1);
      expect(alwaysAllow.has({ type: "edit" })).toBe(true);
      expect(alwaysAllow.has({ type: "bash" })).toBe(false);
    });

    it("should handle empty storage", async () => {
      await alwaysAllow.load();

      expect(alwaysAllow.size).toBe(0);
      expect(alwaysAllow.isLoaded).toBe(true);
    });
  });

  // ============================================
  // has
  // ============================================

  describe("has", () => {
    beforeEach(async () => {
      await alwaysAllow.add({ type: "edit" });
      await alwaysAllow.add({ type: "bash", pattern: "git *" });
    });

    it("should return true for exact match", () => {
      expect(alwaysAllow.has({ type: "edit" })).toBe(true);
    });

    it("should return true for exact pattern match", () => {
      expect(alwaysAllow.has({ type: "bash", pattern: "git *" })).toBe(true);
    });

    it("should return false for non-existent permission", () => {
      expect(alwaysAllow.has({ type: "webfetch" })).toBe(false);
    });

    it("should match type-only for pattern request", () => {
      expect(alwaysAllow.has({ type: "edit", pattern: "something" })).toBe(true);
    });

    it("should match wildcard suffix pattern", () => {
      expect(alwaysAllow.has({ type: "bash", pattern: "git status" })).toBe(true);
    });

    it("should not match non-matching pattern", () => {
      expect(alwaysAllow.has({ type: "bash", pattern: "npm install" })).toBe(false);
    });

    it("should match wildcard prefix pattern", async () => {
      await alwaysAllow.add({ type: "file", pattern: "*.txt" });
      expect(alwaysAllow.has({ type: "file", pattern: "readme.txt" })).toBe(true);
    });
  });

  // ============================================
  // add
  // ============================================

  describe("add", () => {
    it("should add a new permission", async () => {
      const result = await alwaysAllow.add({ type: "edit" });

      expect(result).toBe(true);
      expect(alwaysAllow.size).toBe(1);
    });

    it("should return false if already exists", async () => {
      await alwaysAllow.add({ type: "edit" });
      const result = await alwaysAllow.add({ type: "edit" });

      expect(result).toBe(false);
      expect(alwaysAllow.size).toBe(1);
    });

    it("should persist to storage", async () => {
      await alwaysAllow.add({ type: "edit" });

      const data = mockStorage.getData();
      expect(data.rememberedPermissions.edit).toEqual({ level: "allow" });
    });

    it("should sync to session manager", async () => {
      await alwaysAllow.add({ type: "edit" });

      const result = sessionManager.has({ type: "edit" });
      expect(result.hasPermission).toBe(true);
    });

    it("should add permission with pattern", async () => {
      await alwaysAllow.add({ type: "bash", pattern: "git *" });

      const data = mockStorage.getData();
      expect(data.rememberedPermissions["bash:git *"]).toEqual({ level: "allow" });
    });

    it("should support optional description", async () => {
      await alwaysAllow.add({ type: "edit" }, { description: "Auto-approved" });

      const all = alwaysAllow.getAll();
      expect(all[0]?.description).toBe("Auto-approved");
    });
  });

  // ============================================
  // remove
  // ============================================

  describe("remove", () => {
    beforeEach(async () => {
      await alwaysAllow.add({ type: "edit" });
      await alwaysAllow.add({ type: "bash", pattern: "git *" });
    });

    it("should remove an existing permission", async () => {
      const result = await alwaysAllow.remove({ type: "edit" });

      expect(result).toBe(true);
      expect(alwaysAllow.size).toBe(1);
    });

    it("should return false for non-existent permission", async () => {
      const result = await alwaysAllow.remove({ type: "webfetch" });
      expect(result).toBe(false);
    });

    it("should remove from storage", async () => {
      await alwaysAllow.remove({ type: "edit" });

      const data = mockStorage.getData();
      expect(data.rememberedPermissions.edit).toBeUndefined();
    });

    it("should revoke from session manager", async () => {
      await alwaysAllow.remove({ type: "edit" });

      const result = sessionManager.has({ type: "edit" });
      expect(result.hasPermission).toBe(false);
    });

    it("should preserve deny entries when saving", async () => {
      mockStorage.setData({
        rememberedPermissions: {
          edit: { level: "allow" },
          dangerous: { level: "deny" },
        },
      });

      await alwaysAllow.load();
      await alwaysAllow.remove({ type: "edit" });

      const data = mockStorage.getData();
      expect(data.rememberedPermissions.dangerous).toEqual({ level: "deny" });
    });
  });

  // ============================================
  // getAll
  // ============================================

  describe("getAll", () => {
    it("should return all entries", async () => {
      await alwaysAllow.add({ type: "edit" });
      await alwaysAllow.add({ type: "bash", pattern: "git *" });

      const all = alwaysAllow.getAll();

      expect(all).toHaveLength(2);
      expect(all.map((e) => e.type)).toContain("edit");
      expect(all.map((e) => e.type)).toContain("bash");
    });

    it("should return empty array when empty", () => {
      const all = alwaysAllow.getAll();
      expect(all).toEqual([]);
    });
  });

  // ============================================
  // getByType
  // ============================================

  describe("getByType", () => {
    it("should filter by type", async () => {
      await alwaysAllow.add({ type: "bash", pattern: "git *" });
      await alwaysAllow.add({ type: "bash", pattern: "npm *" });
      await alwaysAllow.add({ type: "edit" });

      const bashEntries = alwaysAllow.getByType("bash");

      expect(bashEntries).toHaveLength(2);
      expect(bashEntries.every((e) => e.type === "bash")).toBe(true);
    });
  });

  // ============================================
  // clear
  // ============================================

  describe("clear", () => {
    beforeEach(async () => {
      await alwaysAllow.add({ type: "edit" });
      await alwaysAllow.add({ type: "bash", pattern: "git *" });
    });

    it("should clear all entries", async () => {
      await alwaysAllow.clear();

      expect(alwaysAllow.size).toBe(0);
    });

    it("should persist when persist option is true", async () => {
      await alwaysAllow.clear({ persist: true });

      const data = mockStorage.getData();
      expect(Object.keys(data.rememberedPermissions).length).toBe(0);
    });

    it("should not persist when persist option is false", async () => {
      // Add entry
      await alwaysAllow.add({ type: "webfetch" });

      // Clear without persist
      await alwaysAllow.clear({ persist: false });

      // Memory is cleared
      expect(alwaysAllow.size).toBe(0);
    });

    it("should revoke from session manager", async () => {
      await alwaysAllow.clear();

      expect(sessionManager.has({ type: "edit" }).hasPermission).toBe(false);
      expect(sessionManager.has({ type: "bash", pattern: "git *" }).hasPermission).toBe(false);
    });
  });

  // ============================================
  // Integration with SessionPermissionManager
  // ============================================

  describe("integration with SessionPermissionManager", () => {
    it("should work without session manager", async () => {
      const standalone = new AlwaysAllowManager({
        storage: mockStorage as unknown as PermissionStorage,
      });

      await standalone.add({ type: "edit" });
      expect(standalone.has({ type: "edit" })).toBe(true);
    });

    it("should keep session manager in sync on load", async () => {
      mockStorage.setData({
        rememberedPermissions: {
          edit: { level: "allow" },
        },
      });

      await alwaysAllow.load();

      expect(sessionManager.has({ type: "edit" }).hasPermission).toBe(true);
    });

    it("should keep session manager in sync on add/remove", async () => {
      await alwaysAllow.add({ type: "edit" });
      expect(sessionManager.has({ type: "edit" }).hasPermission).toBe(true);

      await alwaysAllow.remove({ type: "edit" });
      expect(sessionManager.has({ type: "edit" }).hasPermission).toBe(false);
    });
  });

  // ============================================
  // Edge Cases
  // ============================================

  describe("edge cases", () => {
    it("should handle patterns with colons", async () => {
      await alwaysAllow.add({ type: "mcp", pattern: "server:tool" });

      expect(alwaysAllow.has({ type: "mcp", pattern: "server:tool" })).toBe(true);
    });

    it("should handle empty pattern", async () => {
      await alwaysAllow.add({ type: "edit", pattern: "" });

      // Empty string pattern treated as no pattern
      const all = alwaysAllow.getAll();
      expect(all.some((e) => e.pattern === "")).toBe(true);
    });

    it("should handle multiple loads", async () => {
      mockStorage.setData({
        rememberedPermissions: {
          edit: { level: "allow" },
        },
      });

      await alwaysAllow.load();
      await alwaysAllow.load();

      expect(alwaysAllow.size).toBe(1);
    });
  });
});
