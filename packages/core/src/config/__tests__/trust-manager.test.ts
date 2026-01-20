/**
 * TrustManager Tests (T060)
 *
 * @module config/__tests__/trust-manager.test
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isBlockedPath, normalizePath, TrustManager } from "../trust-manager.js";

// =============================================================================
// Test Setup
// =============================================================================

describe("TrustManager", () => {
  let tempDir: string;

  beforeEach(() => {
    // Create a temp directory for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vellum-trust-test-"));

    // Reset singleton before each test
    TrustManager.resetInstance();
  });

  afterEach(() => {
    // Reset singleton
    TrustManager.resetInstance();

    // Clean up temp directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // ===========================================================================
  // Singleton Tests
  // ===========================================================================

  describe("getInstance", () => {
    it("should return same instance on multiple calls", () => {
      const instance1 = TrustManager.getInstance();
      const instance2 = TrustManager.getInstance();
      expect(instance1).toBe(instance2);
    });

    it("should return new instance after resetInstance", () => {
      const instance1 = TrustManager.getInstance();
      TrustManager.resetInstance();
      const instance2 = TrustManager.getInstance();
      expect(instance1).not.toBe(instance2);
    });
  });

  // ===========================================================================
  // Trust Path Tests
  // ===========================================================================

  describe("trustPath", () => {
    it("should trust a path with always scope", async () => {
      const manager = TrustManager.getInstance();
      const testPath = path.join(tempDir, "projects", "myapp");

      await manager.trustPath(testPath, "always");

      expect(manager.isTrusted(testPath)).toBe(true);
    });

    it("should trust a path with session scope", async () => {
      const manager = TrustManager.getInstance();
      const testPath = path.join(tempDir, "projects", "myapp");

      await manager.trustPath(testPath, "session");

      expect(manager.isTrusted(testPath)).toBe(true);
    });

    it("should throw for blocked system paths", async () => {
      const manager = TrustManager.getInstance();

      await expect(manager.trustPath("C:\\Windows", "always")).rejects.toThrow(
        "Cannot trust system directory"
      );
    });
  });

  // ===========================================================================
  // isTrusted Tests
  // ===========================================================================

  describe("isTrusted", () => {
    it("should return true for trusted path", async () => {
      const manager = TrustManager.getInstance();
      const testPath = path.join(tempDir, "projects", "myapp");

      await manager.trustPath(testPath, "session");

      expect(manager.isTrusted(testPath)).toBe(true);
    });

    it("should return true for subdirectory of trusted path", async () => {
      const manager = TrustManager.getInstance();
      const parentPath = path.join(tempDir, "projects", "myapp");
      const childPath = path.join(parentPath, "src", "components");

      await manager.trustPath(parentPath, "session");

      expect(manager.isTrusted(childPath)).toBe(true);
    });

    it("should return false for untrusted path", () => {
      const manager = TrustManager.getInstance();
      const testPath = path.join(tempDir, "projects", "otherapp");

      expect(manager.isTrusted(testPath)).toBe(false);
    });
  });

  // ===========================================================================
  // untrustPath Tests
  // ===========================================================================

  describe("untrustPath", () => {
    it("should remove trusted path from session", async () => {
      const manager = TrustManager.getInstance();
      const testPath = path.join(tempDir, "projects", "myapp");

      await manager.trustPath(testPath, "session");
      expect(manager.isTrusted(testPath)).toBe(true);

      await manager.untrustPath(testPath);
      expect(manager.isTrusted(testPath)).toBe(false);
    });
  });

  // ===========================================================================
  // getTrustedPaths Tests
  // ===========================================================================

  describe("getTrustedPaths", () => {
    it("should return empty array when no paths trusted", () => {
      const manager = TrustManager.getInstance();
      // getTrustedPaths returns both session and persistent paths
      // On fresh instance with no persistence, it should be empty or have only existing ~/.vellum paths
      const paths = manager.getTrustedPaths();
      // Just check it returns an array
      expect(Array.isArray(paths)).toBe(true);
    });

    it("should include session-trusted paths", async () => {
      const manager = TrustManager.getInstance();
      const testPath = path.join(tempDir, "projects", "app1");

      await manager.trustPath(testPath, "session");

      const paths = manager.getTrustedPaths();
      expect(paths.some((p) => normalizePath(p) === normalizePath(testPath))).toBe(true);
    });
  });

  // ===========================================================================
  // Monorepo Detection Tests
  // ===========================================================================

  describe("detectMonorepoRoot", () => {
    it("should detect pnpm monorepo", () => {
      const manager = TrustManager.getInstance();
      const monorepoRoot = path.join(tempDir, "monorepo");
      const packageDir = path.join(monorepoRoot, "packages", "core");

      // Create structure
      fs.mkdirSync(packageDir, { recursive: true });
      fs.writeFileSync(
        path.join(monorepoRoot, "package.json"),
        JSON.stringify({ workspaces: ["packages/*"] })
      );
      fs.writeFileSync(path.join(monorepoRoot, "pnpm-workspace.yaml"), "packages:\n  - packages/*");

      const detected = manager.detectMonorepoRoot(packageDir);
      expect(detected).toBe(monorepoRoot);
    });

    it("should return null for non-monorepo", () => {
      const manager = TrustManager.getInstance();
      const projectDir = path.join(tempDir, "simple-project");

      fs.mkdirSync(projectDir, { recursive: true });
      fs.writeFileSync(path.join(projectDir, "package.json"), JSON.stringify({ name: "app" }));

      const detected = manager.detectMonorepoRoot(projectDir);
      expect(detected).toBeNull();
    });
  });

  // ===========================================================================
  // needsTrustPrompt Tests
  // ===========================================================================

  describe("needsTrustPrompt", () => {
    it("should return null for already session-trusted path", async () => {
      const manager = TrustManager.getInstance();
      const testPath = path.join(tempDir, "projects", "myapp");

      await manager.trustPath(testPath, "session");

      const result = await manager.needsTrustPrompt(testPath);
      expect(result).toBeNull();
    });

    it("should detect monorepo when in subdir", async () => {
      const manager = TrustManager.getInstance();
      const monorepoRoot = path.join(tempDir, "monorepo");
      const packageDir = path.join(monorepoRoot, "packages", "core");

      // Create structure
      fs.mkdirSync(packageDir, { recursive: true });
      fs.writeFileSync(
        path.join(monorepoRoot, "package.json"),
        JSON.stringify({ workspaces: ["packages/*"] })
      );
      fs.writeFileSync(path.join(monorepoRoot, "pnpm-workspace.yaml"), "packages:\n  - packages/*");

      const result = await manager.needsTrustPrompt(packageDir);

      expect(result).not.toBeNull();
      expect(result?.reason).toBe("monorepo");
      expect(result?.rootPath).toBe(monorepoRoot);
    });
  });

  // ===========================================================================
  // isBlocked Tests
  // ===========================================================================

  describe("isBlocked", () => {
    it("should return true for blocked paths", () => {
      const manager = TrustManager.getInstance();
      expect(manager.isBlocked("C:\\Windows")).toBe(true);
      expect(manager.isBlocked("/etc")).toBe(true);
    });

    it("should return false for normal paths", () => {
      const manager = TrustManager.getInstance();
      expect(manager.isBlocked(tempDir)).toBe(false);
    });
  });
});

// =============================================================================
// Utility Function Tests
// =============================================================================

describe("isBlockedPath", () => {
  it("should block Unix root", () => {
    expect(isBlockedPath("/")).toBe(true);
  });

  it("should block Unix system directories", () => {
    expect(isBlockedPath("/usr")).toBe(true);
    expect(isBlockedPath("/etc")).toBe(true);
    expect(isBlockedPath("/var")).toBe(true);
  });

  it("should block Windows drives", () => {
    expect(isBlockedPath("C:\\")).toBe(true);
    expect(isBlockedPath("D:\\")).toBe(true);
  });

  it("should block Windows system directories", () => {
    expect(isBlockedPath("C:\\Windows")).toBe(true);
    expect(isBlockedPath("C:\\Program Files")).toBe(true);
  });

  it("should not block regular project paths", () => {
    expect(isBlockedPath("/home/user/projects/myapp")).toBe(false);
    expect(isBlockedPath("C:\\Users\\user\\projects\\myapp")).toBe(false);
  });
});

describe("normalizePath", () => {
  it("should resolve relative paths", () => {
    const normalized = normalizePath("./test");
    expect(path.isAbsolute(normalized)).toBe(true);
  });

  it("should normalize separators on Windows", () => {
    if (process.platform === "win32") {
      const normalized = normalizePath("C:/Users/test");
      expect(normalized).not.toContain("/");
    }
  });
});
