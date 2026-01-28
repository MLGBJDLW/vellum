/**
 * @module builtin/__tests__/shell-background.test
 *
 * Tests for background process execution feature.
 */

import { platform } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { executeShell, killProcessTree } from "../utils/shell-helpers.js";

describe("shell-helpers - background process", () => {
  const isWindows = platform() === "win32";
  const pidsToCleanup: number[] = [];

  // Cleanup spawned processes after each test
  afterEach(async () => {
    for (const pid of pidsToCleanup) {
      try {
        await killProcessTree(pid);
      } catch {
        // Process may already be dead
      }
    }
    pidsToCleanup.length = 0;
  });

  it("should return immediately when isBackground=true", async () => {
    // Use a long-running command (10 seconds)
    const command = isWindows ? "Start-Sleep -Seconds 10" : "sleep 10";

    const startTime = Date.now();
    const result = await executeShell(command, {
      isBackground: true,
      timeout: 15000,
    });
    const elapsed = Date.now() - startTime;

    // Should return in < 1 second (not wait for 10s)
    expect(elapsed).toBeLessThan(1000);

    // Track for cleanup
    if (result.pid) {
      pidsToCleanup.push(result.pid);
    }
  });

  it("should return pid and isBackground=true in result", async () => {
    const command = isWindows ? "Start-Sleep -Seconds 5" : "sleep 5";

    const result = await executeShell(command, {
      isBackground: true,
      timeout: 10000,
    });

    // Must have pid
    expect(result.pid).toBeDefined();
    expect(typeof result.pid).toBe("number");
    expect(result.pid).toBeGreaterThan(0);

    // Must have isBackground flag
    expect(result.isBackground).toBe(true);

    // exitCode should be null (not waited)
    expect(result.exitCode).toBe(null);

    // Should not be killed
    expect(result.killed).toBe(false);

    // stdout should contain the PID info
    expect(result.stdout).toContain("Background process started with PID");
    expect(result.stdout).toContain(String(result.pid));

    // Track for cleanup
    if (result.pid) {
      pidsToCleanup.push(result.pid);
    }
  });

  it("should actually spawn a detached background process", async () => {
    // This test verifies that the background process is actually spawned
    // by checking that killing it doesn't throw (process exists)
    const command = isWindows ? "Start-Sleep -Seconds 5" : "sleep 5";

    const result = await executeShell(command, {
      isBackground: true,
      timeout: 10000,
    });

    const pid = result.pid;
    expect(pid).toBeDefined();
    expect(pid).toBeGreaterThan(0);

    // Wait a tiny bit to ensure process has started
    await new Promise((r) => setTimeout(r, 200));

    // The process should be killable (proves it exists)
    // killProcessTree should not throw for an existing process
    // biome-ignore lint/style/noNonNullAssertion: pid is verified above
    await expect(killProcessTree(pid!)).resolves.not.toThrow();

    // No need to add to pidsToCleanup since we just killed it
  });

  it("should not block default behavior (isBackground=false)", async () => {
    // Quick command that finishes fast
    const command = isWindows ? 'Write-Output "done"' : 'echo "done"';

    const result = await executeShell(command, {
      isBackground: false,
      timeout: 10000,
    });

    // Should have waited and captured output
    expect(result.stdout.trim()).toContain("done");

    // Should have exitCode (waited for completion)
    expect(result.exitCode).toBe(0);

    // Should NOT have isBackground flag
    expect(result.isBackground).toBeUndefined();

    // Should NOT have pid (not a background process result)
    expect(result.pid).toBeUndefined();
  });

  it("should use default isBackground=false when not specified", async () => {
    const command = isWindows ? 'Write-Output "default"' : 'echo "default"';

    const result = await executeShell(command, {
      timeout: 10000,
    });

    // Should behave as foreground (waited)
    expect(result.stdout.trim()).toContain("default");
    expect(result.exitCode).toBe(0);
    expect(result.isBackground).toBeUndefined();
  });

  it("should handle rapid successive background spawns", async () => {
    const command = isWindows ? "Start-Sleep -Seconds 3" : "sleep 3";

    const [result1, result2, result3] = await Promise.all([
      executeShell(command, { isBackground: true }),
      executeShell(command, { isBackground: true }),
      executeShell(command, { isBackground: true }),
    ]);

    // All should have unique PIDs
    expect(result1.pid).toBeDefined();
    expect(result2.pid).toBeDefined();
    expect(result3.pid).toBeDefined();
    expect(result1.pid).not.toBe(result2.pid);
    expect(result2.pid).not.toBe(result3.pid);
    expect(result1.pid).not.toBe(result3.pid);

    // All should be background
    expect(result1.isBackground).toBe(true);
    expect(result2.isBackground).toBe(true);
    expect(result3.isBackground).toBe(true);

    // Track for cleanup
    if (result1.pid) pidsToCleanup.push(result1.pid);
    if (result2.pid) pidsToCleanup.push(result2.pid);
    if (result3.pid) pidsToCleanup.push(result3.pid);
  });
});
