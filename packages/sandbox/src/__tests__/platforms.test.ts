/**
 * Platform detection tests
 *
 * Tests for platform-specific sandbox backend detection.
 */

import { describe, expect, it } from "vitest";
import { darwinSandboxReason, supportsDarwinSandbox } from "../platforms/darwin.js";
import { detectPlatformBackend } from "../platforms/index.js";
import { linuxSandboxReason, supportsLinuxSandbox } from "../platforms/linux.js";
import { supportsWindowsSandbox, windowsSandboxReason } from "../platforms/windows.js";

describe("detectPlatformBackend", () => {
  it("returns a valid backend type", () => {
    const backend = detectPlatformBackend();

    expect(["subprocess", "platform", "container"]).toContain(backend);
  });

  it("returns subprocess when platform sandbox is not supported", () => {
    // All platform stubs return false currently
    const backend = detectPlatformBackend();

    expect(backend).toBe("subprocess");
  });
});

describe("darwin sandbox", () => {
  it("supportsDarwinSandbox returns false (stub)", () => {
    expect(supportsDarwinSandbox()).toBe(false);
  });

  it("darwinSandboxReason returns explanation", () => {
    const reason = darwinSandboxReason();

    expect(reason).toBe("macOS sandbox backend not configured");
  });
});

describe("linux sandbox", () => {
  it("supportsLinuxSandbox returns false (stub)", () => {
    expect(supportsLinuxSandbox()).toBe(false);
  });

  it("linuxSandboxReason returns explanation", () => {
    const reason = linuxSandboxReason();

    expect(reason).toBe("Linux sandbox backend not configured");
  });
});

describe("windows sandbox", () => {
  it("supportsWindowsSandbox returns false (stub)", () => {
    expect(supportsWindowsSandbox()).toBe(false);
  });

  it("windowsSandboxReason returns explanation", () => {
    const reason = windowsSandboxReason();

    expect(reason).toBe("Windows sandbox backend not configured");
  });
});
