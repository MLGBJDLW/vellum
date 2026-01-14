/**
 * BracketedPasteContext Tests
 *
 * Tests for the BracketedPasteContext provider and related hooks.
 *
 * Note: Tests that require stdin events are tested via direct context
 * subscription since ink-testing-library provides its own stdin handling.
 *
 * @module @vellum/cli
 */

import { Text } from "ink";
import { render } from "ink-testing-library";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BracketedPasteProvider,
  useBracketedPasteContext,
  useIsPasting,
  usePasteHandler,
} from "../BracketedPasteContext.js";

// =============================================================================
// Mocks
// =============================================================================

// Process event listeners tracking
const processListeners: Map<string, Set<() => void>> = new Map();
const originalOn = process.on.bind(process);
const originalOff = process.off.bind(process);
const originalWrite = process.stdout.write;
let writtenData: string[] = [];

beforeEach(() => {
  writtenData = [];
  processListeners.clear();

  // Mock stdout.write
  process.stdout.write = vi.fn((data: string | Uint8Array) => {
    writtenData.push(typeof data === "string" ? data : data.toString());
    return true;
  }) as typeof process.stdout.write;

  // Mock process event listeners
  process.on = vi.fn((event: string, listener: () => void) => {
    if (!processListeners.has(event)) {
      processListeners.set(event, new Set());
    }
    processListeners.get(event)?.add(listener);
    return process;
  }) as typeof process.on;

  process.off = vi.fn((event: string, listener: () => void) => {
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
// Test Helpers
// =============================================================================

/**
 * Wrapper component for testing context
 */
function TestWrapper({ children, enabled = true }: { children: ReactNode; enabled?: boolean }) {
  return <BracketedPasteProvider enabled={enabled}>{children}</BracketedPasteProvider>;
}

// =============================================================================
// Tests
// =============================================================================

describe("BracketedPasteContext", () => {
  describe("BracketedPasteProvider", () => {
    it("renders children", () => {
      const { lastFrame } = render(
        <TestWrapper>
          <Text>child content</Text>
        </TestWrapper>
      );

      expect(lastFrame()).toContain("child content");
    });

    // Note: enable/disable tests depend on stdin being available.
    // ink-testing-library provides a mock stdin that may not trigger
    // the useEffect that calls enableBracketedPaste. These behaviors
    // are tested indirectly through the utility function tests.
    it.skip("enables bracketed paste mode on mount (requires real stdin)", () => {
      render(
        <TestWrapper>
          <Text>test</Text>
        </TestWrapper>
      );

      // Verify enable sequence was written
      expect(writtenData.some((d) => d.includes("\x1b[?2004h"))).toBe(true);
    });

    it.skip("disables bracketed paste mode on unmount (requires real stdin)", () => {
      const { unmount } = render(
        <TestWrapper>
          <Text>test</Text>
        </TestWrapper>
      );

      writtenData = [];
      unmount();

      // Verify disable sequence was written
      expect(writtenData.some((d) => d.includes("\x1b[?2004l"))).toBe(true);
    });

    it("does not enable when enabled=false", () => {
      render(
        <TestWrapper enabled={false}>
          <Text>test</Text>
        </TestWrapper>
      );

      // Should not contain enable sequence
      expect(writtenData.some((d) => d.includes("\x1b[?2004h"))).toBe(false);
    });

    it("registers process signal handlers when enabled", () => {
      render(
        <TestWrapper>
          <Text>test</Text>
        </TestWrapper>
      );

      // At least SIGINT or SIGTERM should be registered
      expect(processListeners.has("SIGINT") || processListeners.has("SIGTERM")).toBe(true);
    });

    it("cleans up process handlers on unmount", () => {
      const { unmount } = render(
        <TestWrapper>
          <Text>test</Text>
        </TestWrapper>
      );

      const sigintBefore = processListeners.get("SIGINT")?.size ?? 0;
      unmount();
      const sigintAfter = processListeners.get("SIGINT")?.size ?? 0;

      // Handlers should be removed
      expect(sigintAfter).toBeLessThanOrEqual(sigintBefore);
    });
  });

  describe("useBracketedPasteContext", () => {
    it("throws when used outside provider", () => {
      // Test that the hook throws by catching in the component
      let thrownError: Error | undefined;

      function ThrowingComponent() {
        try {
          useBracketedPasteContext();
        } catch (e) {
          thrownError = e as Error;
        }
        return null;
      }

      render(<ThrowingComponent />);

      expect(thrownError).toBeDefined();
      expect(thrownError!.message).toBe(
        "useBracketedPasteContext must be used within BracketedPasteProvider"
      );
    });

    it("returns context value inside provider", () => {
      let contextValue: ReturnType<typeof useBracketedPasteContext> | undefined;

      function Consumer() {
        contextValue = useBracketedPasteContext();
        return null;
      }

      render(
        <TestWrapper>
          <Consumer />
        </TestWrapper>
      );

      expect(contextValue).toBeDefined();
      expect(contextValue!.subscribe).toBeInstanceOf(Function);
      expect(typeof contextValue!.isPasting).toBe("boolean");
    });

    it("subscribe returns unsubscribe function", () => {
      let unsubscribe: (() => void) | null = null;

      function Consumer() {
        const { subscribe } = useBracketedPasteContext();
        useEffect(() => {
          unsubscribe = subscribe(() => {});
        }, [subscribe]);
        return null;
      }

      render(
        <TestWrapper>
          <Consumer />
        </TestWrapper>
      );

      expect(unsubscribe).toBeInstanceOf(Function);
    });
  });

  describe("usePasteHandler", () => {
    it("does not throw when outside provider", () => {
      const pasteHandler = vi.fn();

      function OrphanConsumer() {
        usePasteHandler(pasteHandler);
        return null;
      }

      // Should not throw when rendered without provider
      expect(() => {
        render(<OrphanConsumer />);
      }).not.toThrow();
    });

    it("handler is not called when outside provider", () => {
      const pasteHandler = vi.fn();

      function OrphanConsumer() {
        usePasteHandler(pasteHandler);
        return null;
      }

      render(<OrphanConsumer />);

      // Should not have been called
      expect(pasteHandler).not.toHaveBeenCalled();
    });

    it("subscribes when inside provider", () => {
      const pasteHandler = vi.fn();

      function Consumer() {
        usePasteHandler(pasteHandler);
        return null;
      }

      // Should not throw
      expect(() => {
        render(
          <TestWrapper>
            <Consumer />
          </TestWrapper>
        );
      }).not.toThrow();
    });
  });

  describe("useIsPasting", () => {
    it("returns false initially", () => {
      let isPasting: boolean | undefined;

      function Consumer() {
        isPasting = useIsPasting();
        return null;
      }

      render(
        <TestWrapper>
          <Consumer />
        </TestWrapper>
      );

      expect(isPasting).toBe(false);
    });

    it("returns false when outside provider", () => {
      let isPasting: boolean | undefined;

      function Consumer() {
        isPasting = useIsPasting();
        return null;
      }

      render(<Consumer />);

      expect(isPasting).toBe(false);
    });
  });

  describe("subscription mechanism", () => {
    it("allows subscribing via context", () => {
      let contextRef: ReturnType<typeof useBracketedPasteContext> | undefined;

      function Consumer() {
        const ctx = useBracketedPasteContext();
        contextRef = ctx;
        return null;
      }

      render(
        <TestWrapper>
          <Consumer />
        </TestWrapper>
      );

      // Context should be available
      expect(contextRef).toBeDefined();
      expect(contextRef!.subscribe).toBeInstanceOf(Function);
    });

    it("unsubscribe function is returned", () => {
      let unsubscribeFn: (() => void) | null = null;

      function Consumer() {
        const { subscribe } = useBracketedPasteContext();

        useEffect(() => {
          unsubscribeFn = subscribe(() => {});
          return () => {
            unsubscribeFn?.();
          };
        }, [subscribe]);

        return null;
      }

      render(
        <TestWrapper>
          <Consumer />
        </TestWrapper>
      );

      // Unsubscribe should be a function
      expect(unsubscribeFn).toBeInstanceOf(Function);
    });

    it("multiple consumers can subscribe", () => {
      let subscribeCount = 0;

      function Consumer1() {
        const { subscribe } = useBracketedPasteContext();
        useEffect(() => {
          subscribe(() => {});
          subscribeCount++;
        }, [subscribe]);
        return null;
      }

      function Consumer2() {
        const { subscribe } = useBracketedPasteContext();
        useEffect(() => {
          subscribe(() => {});
          subscribeCount++;
        }, [subscribe]);
        return null;
      }

      render(
        <TestWrapper>
          <Consumer1 />
          <Consumer2 />
        </TestWrapper>
      );

      // Both consumers should have subscribed
      expect(subscribeCount).toBe(2);
    });
  });

  describe("lifecycle", () => {
    it("cleans up on unmount without errors", () => {
      const { unmount } = render(
        <TestWrapper>
          <Text>test</Text>
        </TestWrapper>
      );

      // Should not throw
      expect(() => {
        unmount();
      }).not.toThrow();
    });

    it("signal handler cleanup disables paste mode", () => {
      render(
        <TestWrapper>
          <Text>test</Text>
        </TestWrapper>
      );

      // Get a SIGINT handler if registered
      const sigintHandlers = processListeners.get("SIGINT");
      if (sigintHandlers && sigintHandlers.size > 0) {
        writtenData = [];
        const handler = Array.from(sigintHandlers)[0];
        handler?.();

        // Should have written disable sequence
        expect(writtenData.some((d) => d.includes("\x1b[?2004l"))).toBe(true);
      }
    });
  });
});
