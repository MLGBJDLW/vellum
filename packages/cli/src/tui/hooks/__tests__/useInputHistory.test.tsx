/**
 * useInputHistory Hook Tests (T016)
 *
 * Tests for the useInputHistory hook which manages input history with navigation.
 *
 * Coverage:
 * - Navigation (up returns older, down returns newer)
 * - Persistence (if persistKey provided)
 * - maxItems respects limit
 * - Edge cases (empty history, consecutive duplicates, boundaries)
 */

import { render } from "ink-testing-library";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type UseInputHistoryOptions,
  type UseInputHistoryReturn,
  useInputHistory,
} from "../useInputHistory.js";

// =============================================================================
// Mock localStorage
// =============================================================================

const createLocalStorageMock = () => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] || null),
    _getStore: () => store,
    _setStore: (newStore: Record<string, string>) => {
      store = newStore;
    },
  };
};

let localStorageMock = createLocalStorageMock();

// =============================================================================
// Test Helper Component
// =============================================================================

/**
 * Helper component that exposes hook state and methods for testing.
 * We use a ref callback pattern to capture the hook return value.
 */
interface TestHarnessProps {
  options?: UseInputHistoryOptions;
  onHookReturn: (hookReturn: UseInputHistoryReturn) => void;
}

function TestHarness({ options, onHookReturn }: TestHarnessProps): React.ReactElement {
  const hookReturn = useInputHistory(options);
  // Call the callback to expose hook return to tests
  onHookReturn(hookReturn);
  return null as unknown as React.ReactElement;
}

/**
 * Simple wrapper to render and capture hook state.
 */
function renderHook(options?: UseInputHistoryOptions) {
  let hookReturn: UseInputHistoryReturn | null = null;

  const { rerender, unmount } = render(
    <TestHarness options={options} onHookReturn={(r) => (hookReturn = r)} />
  );

  return {
    get current() {
      return hookReturn!;
    },
    rerender: (newOptions?: UseInputHistoryOptions) => {
      rerender(<TestHarness options={newOptions} onHookReturn={(r) => (hookReturn = r)} />);
    },
    unmount,
  };
}

// =============================================================================
// Test Setup
// =============================================================================

describe("useInputHistory", () => {
  beforeEach(() => {
    // Create fresh mock for each test
    localStorageMock = createLocalStorageMock();
    // Setup localStorage mock
    Object.defineProperty(globalThis, "localStorage", {
      value: localStorageMock,
      writable: true,
      configurable: true,
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // Basic Functionality
  // ===========================================================================

  describe("Basic functionality", () => {
    it("should initialize with empty history", () => {
      const result = renderHook();

      expect(result.current.history).toEqual([]);
      expect(result.current.currentIndex).toBe(-1);
    });

    it("should add entry to history", () => {
      const result = renderHook();

      result.current.addToHistory("command1");
      result.rerender();

      expect(result.current.history).toEqual(["command1"]);
    });

    it("should add multiple entries to history", () => {
      const result = renderHook();

      result.current.addToHistory("command1");
      result.rerender();
      result.current.addToHistory("command2");
      result.rerender();
      result.current.addToHistory("command3");
      result.rerender();

      expect(result.current.history).toEqual(["command1", "command2", "command3"]);
    });

    it("should trim whitespace from entries", () => {
      const result = renderHook();

      result.current.addToHistory("  command with spaces  ");
      result.rerender();

      expect(result.current.history).toEqual(["command with spaces"]);
    });

    it("should skip empty entries", () => {
      const result = renderHook();

      result.current.addToHistory("");
      result.rerender();
      result.current.addToHistory("   ");
      result.rerender();
      result.current.addToHistory("valid");
      result.rerender();

      expect(result.current.history).toEqual(["valid"]);
    });

    it("should skip consecutive duplicate entries", () => {
      const result = renderHook();

      result.current.addToHistory("command1");
      result.rerender();
      result.current.addToHistory("command1");
      result.rerender();
      result.current.addToHistory("command2");
      result.rerender();
      result.current.addToHistory("command2");
      result.rerender();
      result.current.addToHistory("command1");
      result.rerender();

      expect(result.current.history).toEqual(["command1", "command2", "command1"]);
    });

    it("should clear history", () => {
      const result = renderHook();

      result.current.addToHistory("command1");
      result.rerender();
      result.current.addToHistory("command2");
      result.rerender();
      result.current.clearHistory();
      result.rerender();

      expect(result.current.history).toEqual([]);
      expect(result.current.currentIndex).toBe(-1);
    });
  });

  // ===========================================================================
  // Navigation (Up/Down)
  // ===========================================================================

  describe("Navigation", () => {
    it("should return null when navigating empty history", () => {
      const result = renderHook();

      const upResult = result.current.navigateHistory("up");
      expect(upResult).toBeNull();

      const downResult = result.current.navigateHistory("down");
      expect(downResult).toBeNull();
    });

    it("should navigate up to most recent entry first", () => {
      const result = renderHook();

      result.current.addToHistory("command1");
      result.rerender();
      result.current.addToHistory("command2");
      result.rerender();
      result.current.addToHistory("command3");
      result.rerender();

      const entry = result.current.navigateHistory("up");
      result.rerender();

      expect(entry).toBe("command3");
      expect(result.current.currentIndex).toBe(2);
    });

    it("should navigate up through older entries", () => {
      const result = renderHook();

      result.current.addToHistory("command1");
      result.rerender();
      result.current.addToHistory("command2");
      result.rerender();
      result.current.addToHistory("command3");
      result.rerender();

      const entry1 = result.current.navigateHistory("up"); // command3
      result.rerender();
      const entry2 = result.current.navigateHistory("up"); // command2
      result.rerender();
      const entry3 = result.current.navigateHistory("up"); // command1
      result.rerender();

      expect(entry1).toBe("command3");
      expect(entry2).toBe("command2");
      expect(entry3).toBe("command1");
      expect(result.current.currentIndex).toBe(0);
    });

    it("should return null when at oldest entry and navigating up", () => {
      const result = renderHook();

      result.current.addToHistory("command1");
      result.rerender();
      result.current.addToHistory("command2");
      result.rerender();

      // Navigate to oldest
      result.current.navigateHistory("up"); // command2
      result.rerender();
      result.current.navigateHistory("up"); // command1
      result.rerender();

      const entry = result.current.navigateHistory("up"); // should return null
      result.rerender();

      expect(entry).toBeNull();
      expect(result.current.currentIndex).toBe(0); // Still at oldest
    });

    it("should navigate down to newer entries", () => {
      const result = renderHook();

      result.current.addToHistory("command1");
      result.rerender();
      result.current.addToHistory("command2");
      result.rerender();
      result.current.addToHistory("command3");
      result.rerender();

      // Navigate up to oldest
      result.current.navigateHistory("up"); // command3
      result.rerender();
      result.current.navigateHistory("up"); // command2
      result.rerender();
      result.current.navigateHistory("up"); // command1
      result.rerender();

      const entry1 = result.current.navigateHistory("down"); // command2
      result.rerender();
      const entry2 = result.current.navigateHistory("down"); // command3
      result.rerender();

      expect(entry1).toBe("command2");
      expect(entry2).toBe("command3");
    });

    it("should reset index when at newest and navigating down past history", () => {
      const result = renderHook();

      result.current.addToHistory("command1");
      result.rerender();

      // Navigate up then down past the end
      result.current.navigateHistory("up"); // command1
      result.rerender();

      result.current.navigateHistory("down"); // Returns temp entry or null
      result.rerender();

      // Index resets to -1
      expect(result.current.currentIndex).toBe(-1);
    });

    it("should return null when navigating down while not navigating", () => {
      const result = renderHook();

      result.current.addToHistory("command1");
      result.rerender();

      const entry = result.current.navigateHistory("down");
      result.rerender();

      expect(entry).toBeNull();
    });

    it("should reset navigation index when adding new entry", () => {
      const result = renderHook();

      result.current.addToHistory("command1");
      result.rerender();
      result.current.addToHistory("command2");
      result.rerender();

      result.current.navigateHistory("up");
      result.rerender();
      expect(result.current.currentIndex).toBe(1);

      result.current.addToHistory("command3");
      result.rerender();
      expect(result.current.currentIndex).toBe(-1);
    });
  });

  // ===========================================================================
  // getCurrentEntry
  // ===========================================================================

  describe("getCurrentEntry", () => {
    it("should return null when not navigating", () => {
      const result = renderHook();

      result.current.addToHistory("command1");
      result.rerender();

      expect(result.current.getCurrentEntry()).toBeNull();
    });

    it("should return null for empty history", () => {
      const result = renderHook();

      expect(result.current.getCurrentEntry()).toBeNull();
    });

    it("should return current entry when navigating", () => {
      const result = renderHook();

      result.current.addToHistory("command1");
      result.rerender();
      result.current.addToHistory("command2");
      result.rerender();

      result.current.navigateHistory("up");
      result.rerender();

      expect(result.current.getCurrentEntry()).toBe("command2");

      result.current.navigateHistory("up");
      result.rerender();

      expect(result.current.getCurrentEntry()).toBe("command1");
    });
  });

  // ===========================================================================
  // maxItems Limit
  // ===========================================================================

  describe("maxItems limit", () => {
    it("should use default maxItems of 100", () => {
      const result = renderHook();

      // Add 105 entries
      for (let i = 1; i <= 105; i++) {
        result.current.addToHistory(`command${i}`);
        result.rerender();
      }

      expect(result.current.history.length).toBe(100);
      // Should keep the most recent 100 (6-105)
      expect(result.current.history[0]).toBe("command6");
      expect(result.current.history[99]).toBe("command105");
    });

    it("should respect custom maxItems limit", () => {
      const result = renderHook({ maxItems: 5 });

      for (let i = 1; i <= 10; i++) {
        result.current.addToHistory(`command${i}`);
        result.rerender({ maxItems: 5 });
      }

      expect(result.current.history.length).toBe(5);
      // Should keep the most recent 5 (6-10)
      expect(result.current.history).toEqual([
        "command6",
        "command7",
        "command8",
        "command9",
        "command10",
      ]);
    });

    it("should not trim history when under limit", () => {
      const result = renderHook({ maxItems: 10 });

      result.current.addToHistory("command1");
      result.rerender({ maxItems: 10 });
      result.current.addToHistory("command2");
      result.rerender({ maxItems: 10 });
      result.current.addToHistory("command3");
      result.rerender({ maxItems: 10 });

      expect(result.current.history.length).toBe(3);
    });
  });

  // ===========================================================================
  // Persistence
  // ===========================================================================

  describe("Persistence", () => {
    const PERSIST_KEY = "test-history";

    it("should save to localStorage when persistKey provided", () => {
      const result = renderHook({ persistKey: PERSIST_KEY });

      result.current.addToHistory("command1");
      result.rerender({ persistKey: PERSIST_KEY });

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        PERSIST_KEY,
        JSON.stringify(["command1"])
      );
    });

    it("should load from localStorage on init", () => {
      // Pre-populate localStorage
      localStorageMock._setStore({
        [PERSIST_KEY]: JSON.stringify(["saved1", "saved2"]),
      });

      const result = renderHook({ persistKey: PERSIST_KEY });

      expect(result.current.history).toEqual(["saved1", "saved2"]);
    });

    it("should not persist without persistKey", () => {
      const result = renderHook();

      result.current.addToHistory("command1");
      result.rerender();

      // setItem should not have been called for history
      expect(localStorageMock.setItem).not.toHaveBeenCalled();
    });

    it("should clear persisted history when clearHistory called", () => {
      const result = renderHook({ persistKey: PERSIST_KEY });

      result.current.addToHistory("command1");
      result.rerender({ persistKey: PERSIST_KEY });
      result.current.clearHistory();
      result.rerender({ persistKey: PERSIST_KEY });

      expect(localStorageMock.setItem).toHaveBeenLastCalledWith(PERSIST_KEY, JSON.stringify([]));
    });

    it("should handle invalid JSON in localStorage gracefully", () => {
      localStorageMock._setStore({
        [PERSIST_KEY]: "invalid json{",
      });

      const result = renderHook({ persistKey: PERSIST_KEY });

      // Should initialize with empty array on parse error
      expect(result.current.history).toEqual([]);
    });

    it("should filter non-string values from stored history", () => {
      localStorageMock._setStore({
        [PERSIST_KEY]: JSON.stringify(["valid", 123, null, "also-valid"]),
      });

      const result = renderHook({ persistKey: PERSIST_KEY });

      expect(result.current.history).toEqual(["valid", "also-valid"]);
    });

    it("should handle non-array stored value gracefully", () => {
      localStorageMock._setStore({
        [PERSIST_KEY]: JSON.stringify({ not: "array" }),
      });

      const result = renderHook({ persistKey: PERSIST_KEY });

      expect(result.current.history).toEqual([]);
    });

    it("should respect maxItems when adding after loading from storage", () => {
      // Store more items than limit
      const storedItems = Array.from({ length: 10 }, (_, i) => `stored${i + 1}`);
      localStorageMock._setStore({
        [PERSIST_KEY]: JSON.stringify(storedItems),
      });

      const result = renderHook({ persistKey: PERSIST_KEY, maxItems: 5 });

      // Initial load has all items from storage
      result.current.addToHistory("new-command");
      result.rerender({ persistKey: PERSIST_KEY, maxItems: 5 });

      // After adding, should be trimmed to maxItems
      expect(result.current.history.length).toBe(5);
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe("Edge cases", () => {
    it("should handle single entry history navigation", () => {
      const result = renderHook();

      result.current.addToHistory("only-command");
      result.rerender();

      const upEntry = result.current.navigateHistory("up");
      result.rerender();
      expect(upEntry).toBe("only-command");

      // Try to go up again (at oldest)
      const upAgain = result.current.navigateHistory("up");
      result.rerender();
      expect(upAgain).toBeNull();

      // Go down (back to new entry position)
      result.current.navigateHistory("down");
      result.rerender();
      expect(result.current.currentIndex).toBe(-1);
    });

    it("should handle special characters in entries", () => {
      const result = renderHook();

      const specialChars = [
        '/help "quoted arg"',
        "command with\nnewline",
        "unicode: 你好世界",
        "symbols: @#$%^&*()",
      ];

      for (const entry of specialChars) {
        result.current.addToHistory(entry);
        result.rerender();
      }

      expect(result.current.history).toEqual(specialChars);
    });

    it("should handle rapid navigation", () => {
      const result = renderHook();

      for (let i = 1; i <= 10; i++) {
        result.current.addToHistory(`cmd${i}`);
        result.rerender();
      }

      // Rapid up navigation
      for (let i = 0; i < 15; i++) {
        result.current.navigateHistory("up");
        result.rerender();
      }

      // Should be at oldest entry (index 0)
      expect(result.current.currentIndex).toBe(0);
      expect(result.current.getCurrentEntry()).toBe("cmd1");

      // Rapid down navigation
      for (let i = 0; i < 15; i++) {
        result.current.navigateHistory("down");
        result.rerender();
      }

      // Should be at "new entry" position
      expect(result.current.currentIndex).toBe(-1);
    });

    it("should handle localStorage unavailable gracefully", () => {
      // Remove localStorage
      Object.defineProperty(globalThis, "localStorage", {
        value: undefined,
        writable: true,
        configurable: true,
      });

      const result = renderHook({ persistKey: "test-key" });

      // Should not throw
      result.current.addToHistory("command1");
      result.rerender({ persistKey: "test-key" });

      expect(result.current.history).toEqual(["command1"]);
    });

    it("should handle localStorage throwing errors gracefully", () => {
      localStorageMock.getItem.mockImplementation(() => {
        throw new Error("Storage error");
      });

      // Should not throw and fall back to empty history
      const result = renderHook({ persistKey: "test-key" });
      expect(result.current.history).toEqual([]);

      // Reset mock for setItem to also throw
      localStorageMock.setItem.mockImplementation(() => {
        throw new Error("Storage error");
      });

      // Should not throw on add
      result.current.addToHistory("command1");
      result.rerender({ persistKey: "test-key" });

      expect(result.current.history).toEqual(["command1"]);
    });
  });
});
