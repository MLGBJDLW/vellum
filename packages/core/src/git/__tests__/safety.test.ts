/**
 * Unit tests for Safety module
 *
 * Tests protected path checking, environment sanitization, and GPG flag generation.
 *
 * @see packages/core/src/git/safety.ts
 */

import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ErrorCode } from "../../errors/types.js";
import {
  checkProtectedPath,
  getGitSafetyConfig,
  getNoGpgFlags,
  getSanitizedEnv,
} from "../safety.js";

// =============================================================================
// T031: Safety Module Tests
// =============================================================================

describe("Safety Module", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv };
  });

  // ===========================================================================
  // checkProtectedPath() Tests
  // ===========================================================================

  describe("checkProtectedPath()", () => {
    describe("home directory protection", () => {
      it("should return Err for home directory", () => {
        const homeDir = os.homedir();
        const result = checkProtectedPath(homeDir);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.code).toBe(ErrorCode.GIT_PROTECTED_PATH);
        }
      });

      it("should return Err for Desktop", () => {
        const desktopPath = path.join(os.homedir(), "Desktop");
        const result = checkProtectedPath(desktopPath);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.code).toBe(ErrorCode.GIT_PROTECTED_PATH);
        }
      });

      it("should return Err for Documents", () => {
        const documentsPath = path.join(os.homedir(), "Documents");
        const result = checkProtectedPath(documentsPath);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.code).toBe(ErrorCode.GIT_PROTECTED_PATH);
        }
      });

      it("should return Err for Downloads", () => {
        const downloadsPath = path.join(os.homedir(), "Downloads");
        const result = checkProtectedPath(downloadsPath);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.code).toBe(ErrorCode.GIT_PROTECTED_PATH);
        }
      });

      it("should return Err for Pictures", () => {
        const picturesPath = path.join(os.homedir(), "Pictures");
        const result = checkProtectedPath(picturesPath);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.code).toBe(ErrorCode.GIT_PROTECTED_PATH);
        }
      });

      it("should return Err for Music", () => {
        const musicPath = path.join(os.homedir(), "Music");
        const result = checkProtectedPath(musicPath);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.code).toBe(ErrorCode.GIT_PROTECTED_PATH);
        }
      });

      it("should return Err for Videos", () => {
        const videosPath = path.join(os.homedir(), "Videos");
        const result = checkProtectedPath(videosPath);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.code).toBe(ErrorCode.GIT_PROTECTED_PATH);
        }
      });

      it("should return Err for nested protected path", () => {
        const nestedPath = path.join(os.homedir(), "Desktop", "subfolder", "deep");
        const result = checkProtectedPath(nestedPath);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.code).toBe(ErrorCode.GIT_PROTECTED_PATH);
        }
      });
    });

    describe("valid project paths", () => {
      it("should return Ok for valid project path in home", () => {
        const projectPath = path.join(os.homedir(), "projects", "my-app");
        const result = checkProtectedPath(projectPath);

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value).toBe(true);
        }
      });

      it("should return Ok for valid path outside home", () => {
        const projectPath =
          process.platform === "win32" ? "D:\\Projects\\my-app" : "/opt/projects/my-app";
        const result = checkProtectedPath(projectPath);

        expect(result.ok).toBe(true);
      });

      it("should handle temp directory appropriately per platform", () => {
        const tempPath = path.join(os.tmpdir(), "vellum-test");
        const result = checkProtectedPath(tempPath);

        // On Windows, os.tmpdir() is C:\Users\X\AppData\Local\Temp which is inside AppData (protected)
        // On Unix, it's typically /tmp which is not protected
        if (process.platform === "win32") {
          // Windows temp is in AppData which is protected
          expect(result.ok).toBe(false);
        } else {
          expect(result.ok).toBe(true);
        }
      });
    });

    describe("Windows-specific paths", () => {
      it("should handle Windows path separators", () => {
        if (process.platform === "win32") {
          const homeDir = os.homedir();
          const desktopPath = `${homeDir}\\Desktop`;
          const result = checkProtectedPath(desktopPath);

          expect(result.ok).toBe(false);
        }
      });

      it("should handle case-insensitive paths on Windows", () => {
        if (process.platform === "win32") {
          const homeDir = os.homedir();
          // Test with different cases
          const desktopLower = path.join(homeDir, "desktop");
          const desktopUpper = path.join(homeDir, "DESKTOP");

          const resultLower = checkProtectedPath(desktopLower);
          const resultUpper = checkProtectedPath(desktopUpper);

          expect(resultLower.ok).toBe(false);
          expect(resultUpper.ok).toBe(false);
        }
      });

      it("should protect Windows system directories", () => {
        if (process.platform === "win32") {
          const windowsPath = "C:\\Windows";
          const result = checkProtectedPath(windowsPath);

          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.error.code).toBe(ErrorCode.GIT_PROTECTED_PATH);
          }
        }
      });

      it("should protect Program Files on Windows", () => {
        if (process.platform === "win32") {
          const programFilesPath = "C:\\Program Files";
          const result = checkProtectedPath(programFilesPath);

          expect(result.ok).toBe(false);
        }
      });

      it("should protect AppData on Windows", () => {
        if (process.platform === "win32") {
          const appDataPath = path.join(os.homedir(), "AppData");
          const result = checkProtectedPath(appDataPath);

          expect(result.ok).toBe(false);
        }
      });
    });

    describe("Unix-specific paths", () => {
      it("should protect /etc on Unix", () => {
        if (process.platform !== "win32") {
          const result = checkProtectedPath("/etc");

          expect(result.ok).toBe(false);
        }
      });

      it("should protect /usr on Unix", () => {
        if (process.platform !== "win32") {
          const result = checkProtectedPath("/usr");

          expect(result.ok).toBe(false);
        }
      });

      it("should protect /root on Unix", () => {
        if (process.platform !== "win32") {
          const result = checkProtectedPath("/root");

          expect(result.ok).toBe(false);
        }
      });
    });

    describe("edge cases", () => {
      it("should handle relative paths by resolving them", () => {
        // This depends on current working directory
        const result = checkProtectedPath("./my-project");

        // Should not throw, result depends on cwd
        expect(result).toHaveProperty("ok");
      });

      it("should include path in error context", () => {
        const testPath = path.join(os.homedir(), "Desktop");
        const result = checkProtectedPath(testPath);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.message).toContain(testPath);
        }
      });
    });
  });

  // ===========================================================================
  // getSanitizedEnv() Tests
  // ===========================================================================

  describe("getSanitizedEnv()", () => {
    beforeEach(() => {
      // Set some test environment variables
      process.env.GIT_ASKPASS = "test-askpass";
      process.env.SSH_ASKPASS = "test-ssh-askpass";
      process.env.GPG_AGENT_INFO = "test-gpg-info";
      process.env.GPG_TTY = "/dev/tty";
      process.env.SSH_AUTH_SOCK = "/tmp/ssh-agent.sock";
      process.env.SAFE_VAR = "should-remain";
    });

    it("should remove GIT_ASKPASS", () => {
      const env = getSanitizedEnv();

      expect(env.GIT_ASKPASS).toBeUndefined();
    });

    it("should remove SSH_ASKPASS", () => {
      const env = getSanitizedEnv();

      expect(env.SSH_ASKPASS).toBeUndefined();
    });

    it("should remove GPG_AGENT_INFO", () => {
      const env = getSanitizedEnv();

      expect(env.GPG_AGENT_INFO).toBeUndefined();
    });

    it("should remove GPG_TTY", () => {
      const env = getSanitizedEnv();

      expect(env.GPG_TTY).toBeUndefined();
    });

    it("should remove SSH_AUTH_SOCK", () => {
      const env = getSanitizedEnv();

      expect(env.SSH_AUTH_SOCK).toBeUndefined();
    });

    it("should preserve non-sensitive environment variables", () => {
      const env = getSanitizedEnv();

      expect(env.SAFE_VAR).toBe("should-remain");
    });

    it("should set GIT_TERMINAL_PROMPT to 0", () => {
      const env = getSanitizedEnv();

      expect(env.GIT_TERMINAL_PROMPT).toBe("0");
    });

    it("should return a copy of process.env", () => {
      const env = getSanitizedEnv();

      // Modifying result shouldn't affect process.env
      env.NEW_VAR = "test";
      expect(process.env.NEW_VAR).toBeUndefined();
    });

    it("should handle missing environment variables", () => {
      // Clear all sensitive vars
      delete process.env.GIT_ASKPASS;
      delete process.env.SSH_ASKPASS;
      delete process.env.GPG_AGENT_INFO;

      // Should not throw
      const env = getSanitizedEnv();
      expect(env).toHaveProperty("GIT_TERMINAL_PROMPT", "0");
    });
  });

  // ===========================================================================
  // getNoGpgFlags() Tests
  // ===========================================================================

  describe("getNoGpgFlags()", () => {
    it("should return correct GPG disable flags", () => {
      const flags = getNoGpgFlags();

      expect(flags).toContain("-c");
      expect(flags).toContain("commit.gpgsign=false");
      expect(flags).toContain("tag.gpgsign=false");
    });

    it("should include user name config", () => {
      const flags = getNoGpgFlags();

      expect(flags).toContain("user.name=Vellum Agent");
    });

    it("should include user email config", () => {
      const flags = getNoGpgFlags();

      expect(flags).toContain("user.email=agent@vellum.local");
    });

    it("should return flags in correct format for git -c", () => {
      const flags = getNoGpgFlags();

      // Should be pairs: ["-c", "key=value", "-c", "key=value", ...]
      for (let i = 0; i < flags.length; i += 2) {
        expect(flags[i]).toBe("-c");
        expect(flags[i + 1]).toMatch(/^\w+(\.\w+)?=/);
      }
    });

    it("should return consistent results", () => {
      const flags1 = getNoGpgFlags();
      const flags2 = getNoGpgFlags();

      expect(flags1).toEqual(flags2);
    });
  });

  // ===========================================================================
  // getGitSafetyConfig() Tests
  // ===========================================================================

  describe("getGitSafetyConfig()", () => {
    beforeEach(() => {
      process.env.GIT_ASKPASS = "test";
    });

    it("should return both env and flags", () => {
      const config = getGitSafetyConfig();

      expect(config).toHaveProperty("env");
      expect(config).toHaveProperty("flags");
    });

    it("should return sanitized environment", () => {
      const config = getGitSafetyConfig();

      expect(config.env.GIT_ASKPASS).toBeUndefined();
      expect(config.env.GIT_TERMINAL_PROMPT).toBe("0");
    });

    it("should return no-GPG flags", () => {
      const config = getGitSafetyConfig();

      expect(config.flags).toContain("-c");
      expect(config.flags).toContain("commit.gpgsign=false");
    });
  });
});
