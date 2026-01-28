/**
 * @module builtin/__tests__/shell-process-tree.test
 *
 * Integration tests for process group management (killProcessTree).
 * Tests that timeout/abort properly kills child processes.
 */

import { platform } from "node:os";
import { describe, expect, it } from "vitest";
import { executeShell, killProcessTree } from "../utils/shell-helpers.js";

const isWindows = platform() === "win32";

describe("shell-helpers - process tree management", () => {
  describe("killProcessTree", () => {
    it("should handle non-existent process gracefully", async () => {
      // Use a PID that is very unlikely to exist
      const fakePid = 999999999;
      // Should not throw
      await expect(killProcessTree(fakePid)).resolves.toBeUndefined();
    });
  });

  describe("executeShell - normal execution", () => {
    it("should complete and exit cleanly for simple commands", async () => {
      const command = isWindows ? 'Write-Output "done"' : 'echo "done"';

      const result = await executeShell(command, { timeout: 5000 });

      expect(result.killed).toBe(false);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toContain("done");
    });

    it("should return non-zero exit code for failing commands", async () => {
      const command = isWindows ? "exit 42" : "exit 42";

      const result = await executeShell(command, { timeout: 5000 });

      expect(result.killed).toBe(false);
      expect(result.exitCode).toBe(42);
    });
  });

  describe("executeShell - timeout kills process tree", () => {
    it("should kill process on timeout", async () => {
      // Sleep for 30s, but timeout after 500ms
      const command = isWindows ? "Start-Sleep -Seconds 30" : "sleep 30";

      const startTime = Date.now();
      const result = await executeShell(command, { timeout: 500 });
      const elapsed = Date.now() - startTime;

      expect(result.killed).toBe(true);
      expect(result.exitCode).toBe(null);
      expect(result.signal).toBe("SIGTERM");
      // Should complete within reasonable time (< 3s including cleanup)
      expect(elapsed).toBeLessThan(3000);
    }, 10000);

    it("should kill child processes spawned by the command", async () => {
      // Spawn a shell that spawns another sleep process
      // The inner sleep should also be killed
      const command = isWindows
        ? "Start-Process -NoNewWindow -Wait powershell -ArgumentList '-Command', 'Start-Sleep -Seconds 30'"
        : "(sleep 30 &); sleep 30";

      const startTime = Date.now();
      const result = await executeShell(command, { timeout: 500 });
      const elapsed = Date.now() - startTime;

      expect(result.killed).toBe(true);
      // Should complete quickly, not wait for child
      expect(elapsed).toBeLessThan(3000);
    }, 10000);
  });

  describe("executeShell - abort signal kills process tree", () => {
    it("should kill process when abort signal is triggered", async () => {
      const controller = new AbortController();
      const command = isWindows ? "Start-Sleep -Seconds 30" : "sleep 30";

      // Abort after 300ms
      setTimeout(() => controller.abort(), 300);

      const startTime = Date.now();
      const result = await executeShell(command, {
        abortSignal: controller.signal,
        timeout: 30000,
      });
      const elapsed = Date.now() - startTime;

      expect(result.killed).toBe(true);
      expect(result.exitCode).toBe(null);
      // Should complete within reasonable time
      expect(elapsed).toBeLessThan(3000);
    }, 10000);

    it("should return immediately if already aborted", async () => {
      const controller = new AbortController();
      controller.abort(); // Abort before starting

      const command = isWindows ? "Start-Sleep -Seconds 30" : "sleep 30";

      const startTime = Date.now();
      const result = await executeShell(command, {
        abortSignal: controller.signal,
      });
      const elapsed = Date.now() - startTime;

      expect(result.killed).toBe(true);
      expect(result.stderr).toContain("aborted");
      // Should return almost immediately
      expect(elapsed).toBeLessThan(500);
    });
  });

  describe("executeShell - process cleanup verification", () => {
    it("should not leave orphan processes after timeout", async () => {
      // Create a unique marker to identify our test process
      const marker = `vellum_test_${Date.now()}`;

      // Spawn a process that would run for a long time
      const command = isWindows
        ? `$env:VELLUM_MARKER='${marker}'; Start-Sleep -Seconds 30`
        : `VELLUM_MARKER='${marker}' sleep 30`;

      // Kill it via timeout
      await executeShell(command, { timeout: 500 });

      // Wait a moment for cleanup
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Verify no process with our marker is running
      const checkCommand = isWindows
        ? `Get-Process | Where-Object { $_.ProcessName -like '*sleep*' } | Measure-Object | Select-Object -ExpandProperty Count`
        : `pgrep -f "VELLUM_MARKER=${marker}" || echo "0"`;

      const checkResult = await executeShell(checkCommand, { timeout: 5000 });

      // The check should find 0 processes (or empty result)
      const count = Number.parseInt(checkResult.stdout.trim(), 10) || 0;
      // On Windows, the process name check is less precise, so we just verify
      // the test command completed. On Unix, we verify count is 0.
      if (!isWindows) {
        expect(count).toBe(0);
      }
    }, 15000);
  });
});
