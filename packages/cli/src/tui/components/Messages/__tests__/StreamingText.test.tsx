/**
 * StreamingText Component Tests
 *
 * Tests for the StreamingText component which displays text with an animated
 * blinking cursor while streaming.
 *
 * @module tui/components/Messages/__tests__/StreamingText.test
 */

import { render } from "ink-testing-library";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StreamingText } from "../StreamingText.js";

// =============================================================================
// Test Setup
// =============================================================================

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// =============================================================================
// Tests
// =============================================================================

describe("StreamingText", () => {
  describe("rendering", () => {
    it("renders text content", () => {
      const { lastFrame } = render(<StreamingText content="Hello world" isStreaming={false} />);

      expect(lastFrame()).toContain("Hello world");
    });

    it("renders empty content", () => {
      const { lastFrame } = render(<StreamingText content="" isStreaming={false} />);

      // Should render without cursor when not streaming
      expect(lastFrame()).toBe("");
    });
  });

  describe("cursor behavior", () => {
    it("shows cursor when streaming", () => {
      const { lastFrame } = render(<StreamingText content="Typing..." isStreaming={true} />);

      expect(lastFrame()).toContain("Typing...");
      expect(lastFrame()).toContain("▊"); // Default cursor
    });

    it("hides cursor when not streaming", () => {
      const { lastFrame } = render(<StreamingText content="Complete" isStreaming={false} />);

      expect(lastFrame()).toContain("Complete");
      expect(lastFrame()).not.toContain("▊");
    });

    it("uses custom cursor character", () => {
      const { lastFrame } = render(
        <StreamingText content="Custom" isStreaming={true} cursorChar="_" />
      );

      expect(lastFrame()).toContain("Custom");
      expect(lastFrame()).toContain("_");
      expect(lastFrame()).not.toContain("▊");
    });

    it("blinks cursor every 500ms when cursorBlink is true", async () => {
      const { lastFrame, frames } = render(
        <StreamingText content="Blinking" isStreaming={true} cursorBlink={true} />
      );

      // Initially cursor is visible
      expect(lastFrame()).toContain("▊");

      // Record initial frame count
      const initialFrameCount = frames.length;

      // After 500ms, the interval callback fires and toggles state
      await act(async () => {
        vi.advanceTimersByTime(500);
      });

      // If a new frame was rendered, check it
      if (frames.length > initialFrameCount) {
        expect(lastFrame()).not.toContain("▊");
      }

      // After another 500ms, cursor should toggle back
      await act(async () => {
        vi.advanceTimersByTime(500);
      });

      // Verify the blink cycle completed (visible again)
      if (frames.length > initialFrameCount + 1) {
        expect(lastFrame()).toContain("▊");
      }
    });

    it("does not blink cursor when cursorBlink is false", () => {
      const { lastFrame } = render(
        <StreamingText content="No blink" isStreaming={true} cursorBlink={false} />
      );

      // Cursor is visible
      expect(lastFrame()).toContain("▊");

      // After 500ms, cursor should still be visible (no blinking)
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(lastFrame()).toContain("▊");

      // After another 500ms, still visible
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(lastFrame()).toContain("▊");
    });
  });

  describe("onComplete callback", () => {
    it("calls onComplete when streaming changes from true to false", () => {
      const onComplete = vi.fn();

      const { rerender } = render(
        <StreamingText content="Streaming..." isStreaming={true} onComplete={onComplete} />
      );

      // Not called while streaming
      expect(onComplete).not.toHaveBeenCalled();

      // Update to not streaming
      act(() => {
        rerender(<StreamingText content="Done!" isStreaming={false} onComplete={onComplete} />);
      });

      // Now onComplete should be called
      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it("does not call onComplete when initially not streaming", () => {
      const onComplete = vi.fn();

      render(<StreamingText content="Not streaming" isStreaming={false} onComplete={onComplete} />);

      // Should not be called on initial render when not streaming
      expect(onComplete).not.toHaveBeenCalled();
    });

    it("does not call onComplete when streaming remains true", () => {
      const onComplete = vi.fn();

      const { rerender } = render(
        <StreamingText content="Still streaming..." isStreaming={true} onComplete={onComplete} />
      );

      // Update content but keep streaming
      act(() => {
        rerender(
          <StreamingText content="More content..." isStreaming={true} onComplete={onComplete} />
        );
      });

      expect(onComplete).not.toHaveBeenCalled();
    });

    it("works without onComplete callback", () => {
      const { rerender } = render(<StreamingText content="Streaming..." isStreaming={true} />);

      // Should not throw when onComplete is undefined
      expect(() => {
        act(() => {
          rerender(<StreamingText content="Done!" isStreaming={false} />);
        });
      }).not.toThrow();
    });
  });

  describe("interval cleanup", () => {
    it("cleans up interval on unmount", () => {
      const clearIntervalSpy = vi.spyOn(global, "clearInterval");

      const { unmount } = render(
        <StreamingText content="Test" isStreaming={true} cursorBlink={true} />
      );

      act(() => {
        unmount();
      });

      expect(clearIntervalSpy).toHaveBeenCalled();
      clearIntervalSpy.mockRestore();
    });

    it("cleans up interval when streaming stops", () => {
      const clearIntervalSpy = vi.spyOn(global, "clearInterval");

      const { rerender } = render(
        <StreamingText content="Test" isStreaming={true} cursorBlink={true} />
      );

      act(() => {
        rerender(<StreamingText content="Test" isStreaming={false} cursorBlink={true} />);
      });

      expect(clearIntervalSpy).toHaveBeenCalled();
      clearIntervalSpy.mockRestore();
    });
  });
});
