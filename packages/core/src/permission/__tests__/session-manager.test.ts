import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionPermissionManager } from "../session-manager.js";

describe("SessionPermissionManager", () => {
  let manager: SessionPermissionManager;

  beforeEach(() => {
    manager = new SessionPermissionManager();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ============================================
  // Constructor
  // ============================================

  describe("constructor", () => {
    it("should initialize with empty permissions", () => {
      const m = new SessionPermissionManager();
      expect(m.size).toBe(0);
    });

    it("should accept default TTL option", () => {
      const m = new SessionPermissionManager({ defaultTtl: 60000 });
      expect(m.size).toBe(0);
    });
  });

  // ============================================
  // grant
  // ============================================

  describe("grant", () => {
    it("should grant a permission by type only", () => {
      manager.grant({ type: "edit" }, "allow");
      expect(manager.size).toBe(1);
    });

    it("should grant a permission with pattern", () => {
      manager.grant({ type: "bash", pattern: "git *" }, "allow");
      expect(manager.size).toBe(1);
    });

    it("should overwrite existing permission", () => {
      manager.grant({ type: "edit" }, "allow");
      manager.grant({ type: "edit" }, "deny");

      const result = manager.has({ type: "edit" });
      expect(result.level).toBe("deny");
      expect(manager.size).toBe(1);
    });

    it("should set expiration when TTL provided", () => {
      const now = Date.now();
      manager.grant({ type: "edit" }, "allow", { ttl: 5000 });

      const result = manager.has({ type: "edit" });
      expect(result.entry?.expiresAt).toBe(now + 5000);
    });

    it("should use default TTL when set", () => {
      const m = new SessionPermissionManager({ defaultTtl: 10000 });
      const now = Date.now();

      m.grant({ type: "edit" }, "allow");

      const result = m.has({ type: "edit" });
      expect(result.entry?.expiresAt).toBe(now + 10000);
    });

    it("should record source and metadata", () => {
      manager.grant({ type: "edit" }, "allow", {
        source: "config",
        metadata: { reason: "test" },
      });

      const result = manager.has({ type: "edit" });
      expect(result.entry?.source).toBe("config");
      expect(result.entry?.metadata).toEqual({ reason: "test" });
    });
  });

  // ============================================
  // has
  // ============================================

  describe("has", () => {
    it("should return true for exact match", () => {
      manager.grant({ type: "edit" }, "allow");

      const result = manager.has({ type: "edit" });
      expect(result.hasPermission).toBe(true);
      expect(result.level).toBe("allow");
    });

    it("should return false for non-existent permission", () => {
      const result = manager.has({ type: "edit" });
      expect(result.hasPermission).toBe(false);
    });

    it("should match type-only permission for pattern request", () => {
      manager.grant({ type: "bash" }, "allow");

      const result = manager.has({ type: "bash", pattern: "git status" });
      expect(result.hasPermission).toBe(true);
    });

    it("should match exact pattern", () => {
      manager.grant({ type: "bash", pattern: "git status" }, "allow");

      const result = manager.has({ type: "bash", pattern: "git status" });
      expect(result.hasPermission).toBe(true);
    });

    it("should match wildcard pattern (suffix)", () => {
      manager.grant({ type: "bash", pattern: "git *" }, "allow");

      const result = manager.has({ type: "bash", pattern: "git status" });
      expect(result.hasPermission).toBe(true);
    });

    it("should match wildcard pattern (prefix)", () => {
      manager.grant({ type: "bash", pattern: "*.txt" }, "allow");

      const result = manager.has({ type: "bash", pattern: "file.txt" });
      expect(result.hasPermission).toBe(true);
    });

    it("should not match different types", () => {
      manager.grant({ type: "edit" }, "allow");

      const result = manager.has({ type: "bash" });
      expect(result.hasPermission).toBe(false);
    });

    it("should not match non-matching patterns", () => {
      manager.grant({ type: "bash", pattern: "git *" }, "allow");

      const result = manager.has({ type: "bash", pattern: "npm install" });
      expect(result.hasPermission).toBe(false);
    });
  });

  // ============================================
  // TTL Expiration
  // ============================================

  describe("TTL expiration", () => {
    it("should expire permission after TTL", () => {
      manager.grant({ type: "edit" }, "allow", { ttl: 5000 });

      // Before expiration
      expect(manager.has({ type: "edit" }).hasPermission).toBe(true);

      // After expiration
      vi.advanceTimersByTime(6000);
      const result = manager.has({ type: "edit" });
      expect(result.hasPermission).toBe(false);
      // Expired flag is only set on exact key match
    });

    it("should not expire permission without TTL", () => {
      manager.grant({ type: "edit" }, "allow");

      vi.advanceTimersByTime(3600000); // 1 hour

      expect(manager.has({ type: "edit" }).hasPermission).toBe(true);
    });

    it("should clean up expired permissions in getAll", () => {
      manager.grant({ type: "edit" }, "allow", { ttl: 5000 });
      manager.grant({ type: "bash" }, "allow", { ttl: 10000 });

      vi.advanceTimersByTime(7000);

      const all = manager.getAll();
      expect(all).toHaveLength(1);
      expect(all[0]?.type).toBe("bash");
    });
  });

  // ============================================
  // revoke
  // ============================================

  describe("revoke", () => {
    it("should revoke an existing permission", () => {
      manager.grant({ type: "edit" }, "allow");
      const result = manager.revoke({ type: "edit" });

      expect(result).toBe(true);
      expect(manager.has({ type: "edit" }).hasPermission).toBe(false);
    });

    it("should return false when revoking non-existent permission", () => {
      const result = manager.revoke({ type: "edit" });
      expect(result).toBe(false);
    });

    it("should revoke pattern permission", () => {
      manager.grant({ type: "bash", pattern: "git *" }, "allow");
      manager.revoke({ type: "bash", pattern: "git *" });

      expect(manager.has({ type: "bash", pattern: "git *" }).hasPermission).toBe(false);
    });
  });

  // ============================================
  // clear
  // ============================================

  describe("clear", () => {
    it("should clear all permissions", () => {
      manager.grant({ type: "edit" }, "allow");
      manager.grant({ type: "bash" }, "allow");
      manager.grant({ type: "webfetch" }, "deny");

      manager.clear();

      expect(manager.size).toBe(0);
    });
  });

  // ============================================
  // getAll
  // ============================================

  describe("getAll", () => {
    it("should return all active permissions", () => {
      manager.grant({ type: "edit" }, "allow");
      manager.grant({ type: "bash", pattern: "git *" }, "allow");

      const all = manager.getAll();
      expect(all).toHaveLength(2);
    });

    it("should filter out expired permissions", () => {
      manager.grant({ type: "edit" }, "allow", { ttl: 1000 });
      manager.grant({ type: "bash" }, "allow");

      vi.advanceTimersByTime(2000);

      const all = manager.getAll();
      expect(all).toHaveLength(1);
      expect(all[0]?.type).toBe("bash");
    });
  });

  // ============================================
  // getByType
  // ============================================

  describe("getByType", () => {
    it("should return permissions filtered by type", () => {
      manager.grant({ type: "bash", pattern: "git *" }, "allow");
      manager.grant({ type: "bash", pattern: "npm *" }, "allow");
      manager.grant({ type: "edit" }, "allow");

      const bashPerms = manager.getByType("bash");
      expect(bashPerms).toHaveLength(2);

      const editPerms = manager.getByType("edit");
      expect(editPerms).toHaveLength(1);
    });
  });

  // ============================================
  // cleanup
  // ============================================

  describe("cleanup", () => {
    it("should remove expired permissions", () => {
      manager.grant({ type: "a" }, "allow", { ttl: 1000 });
      manager.grant({ type: "b" }, "allow", { ttl: 2000 });
      manager.grant({ type: "c" }, "allow");

      vi.advanceTimersByTime(1500);

      const cleaned = manager.cleanup();
      expect(cleaned).toBe(1);
      expect(manager.size).toBe(2);
    });
  });

  // ============================================
  // extendTtl
  // ============================================

  describe("extendTtl", () => {
    it("should extend TTL of existing permission", () => {
      manager.grant({ type: "edit" }, "allow", { ttl: 5000 });

      const result = manager.extendTtl({ type: "edit" }, 5000);
      expect(result).toBe(true);

      // Should not expire at original time
      vi.advanceTimersByTime(7000);
      expect(manager.has({ type: "edit" }).hasPermission).toBe(true);

      // Should expire after extended time
      vi.advanceTimersByTime(5000);
      expect(manager.has({ type: "edit" }).hasPermission).toBe(false);
    });

    it("should return false for non-existent permission", () => {
      const result = manager.extendTtl({ type: "edit" }, 5000);
      expect(result).toBe(false);
    });

    it("should set TTL if permission had none", () => {
      manager.grant({ type: "edit" }, "allow");

      manager.extendTtl({ type: "edit" }, 5000);

      vi.advanceTimersByTime(6000);
      expect(manager.has({ type: "edit" }).hasPermission).toBe(false);
    });
  });

  // ============================================
  // makePermanent
  // ============================================

  describe("makePermanent", () => {
    it("should remove TTL from permission", () => {
      manager.grant({ type: "edit" }, "allow", { ttl: 5000 });

      manager.makePermanent({ type: "edit" });

      vi.advanceTimersByTime(10000);
      expect(manager.has({ type: "edit" }).hasPermission).toBe(true);
    });

    it("should return false for non-existent permission", () => {
      const result = manager.makePermanent({ type: "edit" });
      expect(result).toBe(false);
    });
  });

  // ============================================
  // Concurrent Access (EC-008)
  // ============================================

  describe("concurrent access (EC-008)", () => {
    it("should handle concurrent grants with protection enabled", async () => {
      vi.useRealTimers();
      const m = new SessionPermissionManager({
        enableConcurrencyProtection: true,
      });

      // Simulate concurrent operations
      const operations = [
        m.grantAsync({ type: "a" }, "allow"),
        m.grantAsync({ type: "b" }, "allow"),
        m.grantAsync({ type: "c" }, "allow"),
      ];

      await Promise.all(operations);

      expect(m.size).toBe(3);
    });

    it("should handle concurrent has checks", async () => {
      vi.useRealTimers();
      const m = new SessionPermissionManager({
        enableConcurrencyProtection: true,
      });

      m.grant({ type: "edit" }, "allow");

      const checks = await Promise.all([
        m.hasAsync({ type: "edit" }),
        m.hasAsync({ type: "edit" }),
        m.hasAsync({ type: "edit" }),
      ]);

      expect(checks.every((c) => c.hasPermission)).toBe(true);
    });

    it("should handle concurrent grant and revoke", async () => {
      vi.useRealTimers();
      const m = new SessionPermissionManager({
        enableConcurrencyProtection: true,
      });

      // Grant first
      await m.grantAsync({ type: "edit" }, "allow");

      // Concurrent revoke and grant
      await Promise.all([m.revokeAsync({ type: "edit" }), m.grantAsync({ type: "edit" }, "deny")]);

      // Final state depends on execution order, but should be consistent
      const result = await m.hasAsync({ type: "edit" });
      // Either revoked or has deny - both are valid
      if (result.hasPermission) {
        expect(result.level).toBe("deny");
      }
    });

    it("should work without concurrency protection", () => {
      const m = new SessionPermissionManager({
        enableConcurrencyProtection: false,
      });

      m.grant({ type: "edit" }, "allow");
      const result = m.has({ type: "edit" });
      expect(result.hasPermission).toBe(true);
    });
  });
});
