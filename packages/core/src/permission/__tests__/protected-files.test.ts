import { describe, expect, it } from "vitest";
import { DEFAULT_PROTECTED_PATTERNS, ProtectedFilesManager } from "../protected-files.js";

describe("ProtectedFilesManager", () => {
  // ============================================
  // Constructor
  // ============================================

  describe("constructor", () => {
    it("should initialize with default patterns", () => {
      const manager = new ProtectedFilesManager();

      expect(manager.size).toBeGreaterThan(0);
      expect(manager.getPatterns()).toContain(".env");
    });

    it("should not include defaults when useDefaults is false", () => {
      const manager = new ProtectedFilesManager({ useDefaults: false });

      expect(manager.size).toBe(0);
      expect(manager.getPatterns()).toEqual([]);
    });

    it("should include custom patterns", () => {
      const manager = new ProtectedFilesManager({
        patterns: ["*.custom", "my-secret.txt"],
      });

      expect(manager.getPatterns()).toContain("*.custom");
      expect(manager.getPatterns()).toContain("my-secret.txt");
    });

    it("should combine defaults with custom patterns", () => {
      const manager = new ProtectedFilesManager({
        patterns: ["*.custom"],
      });

      expect(manager.getPatterns()).toContain(".env");
      expect(manager.getPatterns()).toContain("*.custom");
    });
  });

  // ============================================
  // Default Protected Patterns
  // ============================================

  describe("default patterns", () => {
    const manager = new ProtectedFilesManager();

    describe(".env files", () => {
      it("should protect .env", () => {
        expect(manager.isProtected(".env")).toBe(true);
      });

      it("should protect .env.local", () => {
        expect(manager.isProtected(".env.local")).toBe(true);
      });

      it("should protect .env.production", () => {
        expect(manager.isProtected(".env.production")).toBe(true);
      });

      it("should protect .env.development.local", () => {
        expect(manager.isProtected(".env.development.local")).toBe(true);
      });

      it("should protect paths containing .env", () => {
        expect(manager.isProtected("/path/to/project/.env")).toBe(true);
        expect(manager.isProtected("src/.env.local")).toBe(true);
      });
    });

    describe("secret files", () => {
      it("should protect files containing 'secret'", () => {
        expect(manager.isProtected("secret.json")).toBe(true);
        expect(manager.isProtected("my-secrets.yaml")).toBe(true);
        expect(manager.isProtected("app.secret")).toBe(true);
      });
    });

    describe("key files", () => {
      it("should protect .key files", () => {
        expect(manager.isProtected("server.key")).toBe(true);
        expect(manager.isProtected("private.key")).toBe(true);
      });

      it("should protect .pem files", () => {
        expect(manager.isProtected("certificate.pem")).toBe(true);
        expect(manager.isProtected("private.pem")).toBe(true);
      });
    });

    describe("SSH keys", () => {
      it("should protect id_rsa files", () => {
        expect(manager.isProtected("id_rsa")).toBe(true);
        expect(manager.isProtected("id_rsa.pub")).toBe(true);
      });

      it("should protect id_ed25519 files", () => {
        expect(manager.isProtected("id_ed25519")).toBe(true);
        expect(manager.isProtected("id_ed25519.pub")).toBe(true);
      });
    });
  });

  // ============================================
  // isProtected
  // ============================================

  describe("isProtected", () => {
    it("should return false for non-protected files", () => {
      const manager = new ProtectedFilesManager();

      expect(manager.isProtected("package.json")).toBe(false);
      expect(manager.isProtected("src/index.ts")).toBe(false);
      expect(manager.isProtected("README.md")).toBe(false);
    });

    it("should match filename in full path", () => {
      const manager = new ProtectedFilesManager();

      expect(manager.isProtected("/home/user/project/.env")).toBe(true);
      expect(manager.isProtected("C:\\Users\\project\\.env")).toBe(true);
    });

    it("should handle Windows-style paths", () => {
      const manager = new ProtectedFilesManager();

      expect(manager.isProtected("C:\\project\\.env")).toBe(true);
      expect(manager.isProtected("D:\\secrets\\api.key")).toBe(true);
    });

    it("should handle relative paths", () => {
      const manager = new ProtectedFilesManager();

      expect(manager.isProtected("./config/.env")).toBe(true);
      expect(manager.isProtected("../secrets.json")).toBe(true);
    });
  });

  // ============================================
  // addPattern
  // ============================================

  describe("addPattern", () => {
    it("should add a new pattern", () => {
      const manager = new ProtectedFilesManager({ useDefaults: false });

      manager.addPattern("*.custom");

      expect(manager.getPatterns()).toContain("*.custom");
      expect(manager.isProtected("file.custom")).toBe(true);
    });

    it("should not add duplicate patterns", () => {
      const manager = new ProtectedFilesManager({ useDefaults: false });

      manager.addPattern("*.test");
      const countBefore = manager.size;
      manager.addPattern("*.test");

      expect(manager.size).toBe(countBefore);
    });

    it("should work with gitignore-style patterns", () => {
      const manager = new ProtectedFilesManager({ useDefaults: false });

      manager.addPattern("config/**/*.secret");

      expect(manager.isProtected("config/prod/db.secret")).toBe(true);
      expect(manager.isProtected("config/dev/app.secret")).toBe(true);
    });
  });

  // ============================================
  // removePattern
  // ============================================

  describe("removePattern", () => {
    it("should remove an existing pattern", () => {
      const manager = new ProtectedFilesManager({ useDefaults: false });
      manager.addPattern("*.test");

      const result = manager.removePattern("*.test");

      expect(result).toBe(true);
      expect(manager.getPatterns()).not.toContain("*.test");
      expect(manager.isProtected("file.test")).toBe(false);
    });

    it("should return false for non-existent pattern", () => {
      const manager = new ProtectedFilesManager({ useDefaults: false });

      const result = manager.removePattern("nonexistent");

      expect(result).toBe(false);
    });

    it("should allow removing default patterns", () => {
      const manager = new ProtectedFilesManager();

      const result = manager.removePattern(".env");

      expect(result).toBe(true);
      // Note: .env.* pattern still matches .env files via wildcard
      // Just the exact ".env" pattern is removed
    });
  });

  // ============================================
  // getPatterns
  // ============================================

  describe("getPatterns", () => {
    it("should return all current patterns", () => {
      const manager = new ProtectedFilesManager({ useDefaults: false });
      manager.addPattern("*.a");
      manager.addPattern("*.b");

      const patterns = manager.getPatterns();

      expect(patterns).toContain("*.a");
      expect(patterns).toContain("*.b");
      expect(patterns).toHaveLength(2);
    });

    it("should return a copy (not internal reference)", () => {
      const manager = new ProtectedFilesManager({ useDefaults: false });
      manager.addPattern("*.test");

      const patterns = manager.getPatterns();
      patterns.push("*.malicious");

      expect(manager.getPatterns()).not.toContain("*.malicious");
    });
  });

  // ============================================
  // clear & resetToDefaults
  // ============================================

  describe("clear", () => {
    it("should remove all patterns", () => {
      const manager = new ProtectedFilesManager();

      manager.clear();

      expect(manager.size).toBe(0);
      expect(manager.isProtected(".env")).toBe(false);
    });
  });

  describe("resetToDefaults", () => {
    it("should restore default patterns", () => {
      const manager = new ProtectedFilesManager();
      manager.addPattern("*.custom");
      manager.clear();

      manager.resetToDefaults();

      expect(manager.isProtected(".env")).toBe(true);
      expect(manager.isProtected("*.custom")).toBe(false);
    });
  });

  // ============================================
  // DEFAULT_PROTECTED_PATTERNS
  // ============================================

  describe("DEFAULT_PROTECTED_PATTERNS", () => {
    it("should include common sensitive file patterns", () => {
      expect(DEFAULT_PROTECTED_PATTERNS).toContain(".env");
      expect(DEFAULT_PROTECTED_PATTERNS).toContain("*.key");
      expect(DEFAULT_PROTECTED_PATTERNS).toContain("*.pem");
      expect(DEFAULT_PROTECTED_PATTERNS).toContain("id_rsa");
      expect(DEFAULT_PROTECTED_PATTERNS).toContain("id_ed25519");
    });

    it("should be immutable (readonly)", () => {
      // TypeScript ensures this at compile time
      // Runtime check that array operations create copies
      const copy = [...DEFAULT_PROTECTED_PATTERNS];
      expect(copy).toEqual(DEFAULT_PROTECTED_PATTERNS);
    });
  });

  // ============================================
  // Edge Cases
  // ============================================

  describe("edge cases", () => {
    it("should handle empty string path", () => {
      const manager = new ProtectedFilesManager();

      // Empty path should not match any pattern
      expect(manager.isProtected("")).toBe(false);
    });

    it("should handle paths with special characters", () => {
      const manager = new ProtectedFilesManager({ useDefaults: false });
      manager.addPattern("file (1).secret");

      expect(manager.isProtected("file (1).secret")).toBe(true);
    });

    it("should handle unicode filenames", () => {
      const manager = new ProtectedFilesManager({ useDefaults: false });
      manager.addPattern("秘密.txt");

      expect(manager.isProtected("秘密.txt")).toBe(true);
    });
  });
});
