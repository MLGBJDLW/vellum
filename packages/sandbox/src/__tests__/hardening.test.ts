/**
 * Hardening utilities tests
 *
 * Tests for process hardening and environment sanitization.
 */

import { existsSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import {
  createTempDir,
  dropPrivileges,
  sanitizeEnvironment,
  setResourceLimits,
} from "../hardening.js";

describe("createTempDir", () => {
  const cleanupFns: Array<() => Promise<void>> = [];

  afterEach(async () => {
    for (const cleanup of cleanupFns) {
      try {
        await cleanup();
      } catch {
        // Ignore cleanup errors
      }
    }
    cleanupFns.length = 0;
  });

  it("creates a temporary directory", async () => {
    const { path, cleanup } = await createTempDir();
    cleanupFns.push(cleanup);

    expect(path).toBeDefined();
    expect(existsSync(path)).toBe(true);
  });

  it("uses default prefix", async () => {
    const { path, cleanup } = await createTempDir();
    cleanupFns.push(cleanup);

    expect(path).toContain("vellum-sandbox-");
  });

  it("uses custom prefix", async () => {
    const { path, cleanup } = await createTempDir("custom-prefix-");
    cleanupFns.push(cleanup);

    expect(path).toContain("custom-prefix-");
  });

  it("cleanup removes the directory", async () => {
    const { path, cleanup } = await createTempDir();

    expect(existsSync(path)).toBe(true);

    await cleanup();

    expect(existsSync(path)).toBe(false);
  });

  it("creates unique directories", async () => {
    const temp1 = await createTempDir();
    const temp2 = await createTempDir();
    cleanupFns.push(temp1.cleanup, temp2.cleanup);

    expect(temp1.path).not.toBe(temp2.path);
  });
});

describe("sanitizeEnvironment", () => {
  it("removes LD_PRELOAD", () => {
    const env = {
      PATH: "/usr/bin",
      LD_PRELOAD: "/evil/lib.so",
      HOME: "/home/user",
    };

    const sanitized = sanitizeEnvironment(env);

    expect(sanitized).not.toHaveProperty("LD_PRELOAD");
    expect(sanitized.PATH).toBe("/usr/bin");
    expect(sanitized.HOME).toBe("/home/user");
  });

  it("removes DYLD_INSERT_LIBRARIES", () => {
    const env = {
      PATH: "/usr/bin",
      DYLD_INSERT_LIBRARIES: "/evil/lib.dylib",
    };

    const sanitized = sanitizeEnvironment(env);

    expect(sanitized).not.toHaveProperty("DYLD_INSERT_LIBRARIES");
    expect(sanitized.PATH).toBe("/usr/bin");
  });

  it("removes NODE_OPTIONS", () => {
    const env = {
      PATH: "/usr/bin",
      NODE_OPTIONS: "--inspect",
      NODE_ENV: "production",
    };

    const sanitized = sanitizeEnvironment(env);

    expect(sanitized).not.toHaveProperty("NODE_OPTIONS");
    expect(sanitized.NODE_ENV).toBe("production");
  });

  it("preserves safe environment variables", () => {
    const env = {
      PATH: "/usr/bin:/usr/local/bin",
      HOME: "/home/user",
      USER: "testuser",
      SHELL: "/bin/bash",
      TERM: "xterm-256color",
      LANG: "en_US.UTF-8",
      NODE_ENV: "development",
    };

    const sanitized = sanitizeEnvironment(env);

    expect(sanitized).toEqual(env);
  });

  it("handles empty environment", () => {
    const sanitized = sanitizeEnvironment({});

    expect(sanitized).toEqual({});
  });

  it("removes multiple blocked variables at once", () => {
    const env = {
      PATH: "/usr/bin",
      LD_PRELOAD: "/lib1.so",
      DYLD_INSERT_LIBRARIES: "/lib2.dylib",
      NODE_OPTIONS: "--require evil.js",
    };

    const sanitized = sanitizeEnvironment(env);

    expect(Object.keys(sanitized)).toEqual(["PATH"]);
    expect(sanitized.PATH).toBe("/usr/bin");
  });

  it("does not modify the original environment object", () => {
    const env = {
      PATH: "/usr/bin",
      LD_PRELOAD: "/evil.so",
    };
    const originalEnv = { ...env };

    sanitizeEnvironment(env);

    expect(env).toEqual(originalEnv);
  });
});

describe("dropPrivileges", () => {
  it("is a no-op function", () => {
    // This function is intentionally a no-op for portability
    expect(() => dropPrivileges()).not.toThrow();
  });
});

describe("setResourceLimits", () => {
  it("is a no-op function", () => {
    // This function is intentionally a no-op for portability
    expect(() => setResourceLimits()).not.toThrow();
  });
});
