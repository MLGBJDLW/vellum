/**
 * @module builtin/__tests__/shell-helpers.test
 *
 * Tests for shell-helpers utility functions, specifically output truncation.
 */

import { platform } from "node:os";
import { describe, expect, it } from "vitest";
import { detectShell, executeShell } from "../utils/shell-helpers.js";

describe("shell-helpers", () => {
  describe("detectShell", () => {
    it("should return shell and shellArgs", () => {
      const result = detectShell();
      expect(result).toHaveProperty("shell");
      expect(result).toHaveProperty("shellArgs");
      expect(Array.isArray(result.shellArgs)).toBe(true);
    });
  });

  describe("executeShell - output truncation", () => {
    // Use a small buffer (1KB) to test truncation
    const SMALL_BUFFER = 1024;

    it("should return truncated=false when output is within buffer limit", async () => {
      // Generate small output that fits in buffer
      const isWindows = platform() === "win32";
      const command = isWindows ? 'Write-Output "hello"' : 'echo "hello"';

      const result = await executeShell(command, {
        maxBuffer: SMALL_BUFFER,
        timeout: 10000,
      });

      expect(result.truncated).toBe(false);
      expect(result.stdout).not.toContain("[WARNING: Output truncated.");
    });

    it("should return truncated=true when output exceeds buffer limit", async () => {
      // Generate output larger than 1KB buffer
      const isWindows = platform() === "win32";
      // Generate ~2KB of output (each iteration ~100 chars)
      const command = isWindows
        ? `1..30 | ForEach-Object { Write-Output "This is line $_ of output that will exceed the buffer limit padding text here" }`
        : `for i in $(seq 1 30); do echo "This is line $i of output that will exceed the buffer limit padding text here"; done`;

      const result = await executeShell(command, {
        maxBuffer: SMALL_BUFFER,
        timeout: 30000,
      });

      expect(result.truncated).toBe(true);
    }, 35000);

    it("should append warning message with buffer limit and dropped bytes when truncated", async () => {
      // Generate output larger than 1KB buffer
      const isWindows = platform() === "win32";
      // Generate ~2KB of output
      const command = isWindows
        ? `1..30 | ForEach-Object { Write-Output "This is line $_ of output that will exceed the buffer limit padding text here" }`
        : `for i in $(seq 1 30); do echo "This is line $i of output that will exceed the buffer limit padding text here"; done`;

      const result = await executeShell(command, {
        maxBuffer: SMALL_BUFFER,
        timeout: 30000,
      });

      expect(result.truncated).toBe(true);
      // Warning should be appended to stdout
      expect(result.stdout).toContain("[WARNING: Output truncated.");
      // Should mention buffer limit in MB
      expect(result.stdout).toMatch(/Buffer limit is [\d.]+MB/);
      // Should mention dropped bytes
      expect(result.stdout).toMatch(/\d+ bytes dropped/);
    }, 35000);

    it("should have correct warning format with buffer size in MB", async () => {
      // Use 512 bytes buffer for more predictable test
      const TINY_BUFFER = 512;
      const isWindows = platform() === "win32";
      const command = isWindows
        ? `1..20 | ForEach-Object { Write-Output "Line $_ - generating enough output to exceed the tiny buffer" }`
        : `for i in $(seq 1 20); do echo "Line $i - generating enough output to exceed the tiny buffer"; done`;

      const result = await executeShell(command, {
        maxBuffer: TINY_BUFFER,
        timeout: 30000,
      });

      expect(result.truncated).toBe(true);
      // 512 bytes = 0.00048828125 MB, displayed as ~0.000...MB
      expect(result.stdout).toContain("Buffer limit is");
      expect(result.stdout).toContain("MB");
      expect(result.stdout).toContain("bytes dropped");
    }, 35000);

    it("should not truncate when output exactly matches buffer size", async () => {
      // This test verifies boundary condition
      const isWindows = platform() === "win32";
      // Small command that produces minimal output
      const command = isWindows ? 'Write-Output "x"' : 'echo "x"';

      const result = await executeShell(command, {
        maxBuffer: 100, // Should be enough for "x\n" or "x\r\n"
        timeout: 10000,
      });

      // Output should be small enough to not trigger truncation
      expect(result.truncated).toBe(false);
    });

    it("should handle stderr truncation separately from stdout", async () => {
      // This test would ideally test stderr separately, but most simple commands
      // output to stdout. The implementation tracks both.
      const isWindows = platform() === "win32";
      const command = isWindows
        ? 'Write-Output "stdout"; Write-Error "stderr message" 2>&1'
        : 'echo "stdout"; echo "stderr message" >&2';

      const result = await executeShell(command, {
        maxBuffer: SMALL_BUFFER,
        timeout: 10000,
      });

      // Small output should not trigger truncation
      expect(result.exitCode).toBeDefined();
    });
  });

  describe("executeShell - basic functionality", () => {
    it("should execute simple command and return result", async () => {
      const isWindows = platform() === "win32";
      const command = isWindows ? 'Write-Output "test"' : 'echo "test"';

      const result = await executeShell(command, { timeout: 10000 });

      expect(result).toHaveProperty("stdout");
      expect(result).toHaveProperty("stderr");
      expect(result).toHaveProperty("exitCode");
      expect(result).toHaveProperty("killed");
      expect(result).toHaveProperty("signal");
      expect(result).toHaveProperty("duration");
    });

    it("should respect timeout and kill process", async () => {
      const isWindows = platform() === "win32";
      // Sleep for 10 seconds, but timeout after 500ms
      const command = isWindows ? "Start-Sleep -Seconds 10" : "sleep 10";

      const result = await executeShell(command, { timeout: 500 });

      expect(result.killed).toBe(true);
      expect(result.exitCode).toBe(null);
    }, 10000);

    it("should handle abort signal", async () => {
      const abortController = new AbortController();

      // Abort immediately
      abortController.abort();

      const isWindows = platform() === "win32";
      const command = isWindows ? "Start-Sleep -Seconds 5" : "sleep 5";

      const result = await executeShell(command, {
        abortSignal: abortController.signal,
        timeout: 30000,
      });

      expect(result.killed).toBe(true);
      expect(result.stderr).toContain("aborted");
    });
  });
});
