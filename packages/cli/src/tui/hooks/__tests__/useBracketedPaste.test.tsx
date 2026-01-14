/**
 * useBracketedPaste Hook Tests
 *
 * Tests for the useBracketedPaste hook which manages bracketed paste mode lifecycle.
 *
 * @module @vellum/cli
 */

import { render } from "ink-testing-library";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type UseBracketedPasteOptions, useBracketedPaste } from "../useBracketedPaste.js";

// =============================================================================
// Mocks
// =============================================================================

const originalWrite = process.stdout.write;
let writtenData: string[] = [];

// Track process event listeners
const processListeners: Map<string, Set<(...args: unknown[]) => void>> = new Map();
const originalOn = process.on.bind(process);
const originalOff = process.off.bind(process);

beforeEach(() => {
  writtenData = [];
  processListeners.clear();

  // Mock stdout.write
  process.stdout.write = vi.fn((data: string | Uint8Array) => {
    writtenData.push(typeof data === "string" ? data : data.toString());
    return true;
  }) as typeof process.stdout.write;

  // Mock process event listeners
  process.on = vi.fn((event: string, listener: (...args: unknown[]) => void) => {
    if (!processListeners.has(event)) {
      processListeners.set(event, new Set());
    }
    processListeners.get(event)?.add(listener);
    return process;
  }) as typeof process.on;

  process.off = vi.fn((event: string, listener: (...args: unknown[]) => void) => {
    processListeners.get(event)?.delete(listener);
    return process;
  }) as typeof process.off;
});

afterEach(() => {
  process.stdout.write = originalWrite;
  process.on = originalOn;
  process.off = originalOff;
});

// =============================================================================
// Test Helper Component
// =============================================================================

interface TestHarnessProps {
  options?: UseBracketedPasteOptions;
}

function TestHarness({ options }: TestHarnessProps): React.ReactElement {
  useBracketedPaste(options);
  return null as unknown as React.ReactElement;
}

/**
 * Render the hook and return controls.
 */
function renderHook(options?: UseBracketedPasteOptions) {
  const { rerender, unmount } = render(<TestHarness options={options} />);

  return {
    rerender: (newOptions?: UseBracketedPasteOptions) => {
      rerender(<TestHarness options={newOptions} />);
    },
    unmount,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe("useBracketedPaste", () => {
  describe("enable on mount", () => {
    it("enables bracketed paste mode on mount by default", () => {
      renderHook();

      expect(writtenData).toContain("\x1b[?2004h");
    });

    it("enables bracketed paste mode when enabled=true", () => {
      renderHook({ enabled: true });

      expect(writtenData).toContain("\x1b[?2004h");
    });

    it("does not enable bracketed paste mode when enabled=false", () => {
      renderHook({ enabled: false });

      expect(writtenData).not.toContain("\x1b[?2004h");
    });
  });

  describe("disable on unmount", () => {
    it("disables bracketed paste mode on unmount", () => {
      const { unmount } = renderHook();
      writtenData = []; // Clear mount writes

      unmount();

      expect(writtenData).toContain("\x1b[?2004l");
    });

    it("does not disable if never enabled", () => {
      const { unmount } = renderHook({ enabled: false });
      writtenData = [];

      unmount();

      expect(writtenData).not.toContain("\x1b[?2004l");
    });
  });

  describe("process event handlers", () => {
    it("registers SIGINT handler on mount", () => {
      renderHook();

      expect(processListeners.has("SIGINT")).toBe(true);
      expect(processListeners.get("SIGINT")?.size).toBeGreaterThan(0);
    });

    it("registers SIGTERM handler on mount", () => {
      renderHook();

      expect(processListeners.has("SIGTERM")).toBe(true);
      expect(processListeners.get("SIGTERM")?.size).toBeGreaterThan(0);
    });

    it("registers beforeExit handler on mount", () => {
      renderHook();

      expect(processListeners.has("beforeExit")).toBe(true);
    });

    it("registers exit handler on mount", () => {
      renderHook();

      expect(processListeners.has("exit")).toBe(true);
    });

    it("removes event handlers on unmount", () => {
      const { unmount } = renderHook();

      // Get initial listener counts
      const sigintBefore = processListeners.get("SIGINT")?.size ?? 0;
      const sigtermBefore = processListeners.get("SIGTERM")?.size ?? 0;

      unmount();

      // Listeners should be removed
      const sigintAfter = processListeners.get("SIGINT")?.size ?? 0;
      const sigtermAfter = processListeners.get("SIGTERM")?.size ?? 0;

      expect(sigintAfter).toBeLessThan(sigintBefore);
      expect(sigtermAfter).toBeLessThan(sigtermBefore);
    });

    it("does not register handlers when disabled", () => {
      renderHook({ enabled: false });

      // No handlers should be registered (or fewer than when enabled)
      const sigintCount = processListeners.get("SIGINT")?.size ?? 0;
      expect(sigintCount).toBe(0);
    });
  });

  describe("enabled toggle", () => {
    it("enables bracketed paste when enabled changes from false to true", () => {
      const { rerender } = renderHook({ enabled: false });
      expect(writtenData).not.toContain("\x1b[?2004h");

      writtenData = [];
      rerender({ enabled: true });

      expect(writtenData).toContain("\x1b[?2004h");
    });

    it("disables bracketed paste when enabled changes from true to false", () => {
      const { rerender } = renderHook({ enabled: true });
      expect(writtenData).toContain("\x1b[?2004h");

      writtenData = [];
      rerender({ enabled: false });

      expect(writtenData).toContain("\x1b[?2004l");
    });
  });

  describe("signal handlers cleanup behavior", () => {
    it("signal handler calls disable sequence", () => {
      renderHook();

      // Get the SIGINT handler
      const sigintHandlers = processListeners.get("SIGINT");
      expect(sigintHandlers).toBeDefined();
      expect(sigintHandlers?.size).toBeGreaterThan(0);

      // Simulate SIGINT
      writtenData = [];
      const handler = Array.from(sigintHandlers!)[0];
      handler?.();

      // Should have written disable sequence
      expect(writtenData).toContain("\x1b[?2004l");
    });
  });
});
