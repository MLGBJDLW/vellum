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
import { AnimationProvider } from "../../../context/AnimationContext.js";
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
      // Disable typewriter effect for immediate content display test
      const { lastFrame } = render(
        <StreamingText content="Typing..." isStreaming={true} typewriterEffect={false} />
      );

      expect(lastFrame()).toContain("Typing...");
      expect(lastFrame()).toContain("▊"); // Default cursor
    });

    it("hides cursor when not streaming", () => {
      const { lastFrame } = render(<StreamingText content="Complete" isStreaming={false} />);

      expect(lastFrame()).toContain("Complete");
      expect(lastFrame()).not.toContain("▊");
    });

    it("uses custom cursor character", () => {
      // Disable typewriter effect for immediate content display test
      const { lastFrame } = render(
        <StreamingText
          content="Custom"
          isStreaming={true}
          cursorChar="_"
          typewriterEffect={false}
        />
      );

      expect(lastFrame()).toContain("Custom");
      expect(lastFrame()).toContain("_");
      expect(lastFrame()).not.toContain("▊");
    });

    it("blinks cursor when animation frames advance", async () => {
      const { lastFrame } = render(
        <AnimationProvider tickInterval={100}>
          <StreamingText
            content="Blinking"
            isStreaming={true}
            cursorBlink={true}
            typewriterEffect={false}
          />
        </AnimationProvider>
      );

      // Initially cursor is visible
      expect(lastFrame()).toContain("▊");

      // After 4 ticks (frame=4), cursor should be hidden
      await act(async () => {
        vi.advanceTimersByTime(400);
      });
      expect(lastFrame()).not.toContain("▊");

      // After 4 more ticks (frame=8), cursor should be visible again
      await act(async () => {
        vi.advanceTimersByTime(400);
      });
      expect(lastFrame()).toContain("▊");
    });

    it("does not blink cursor when cursorBlink is false", () => {
      const { lastFrame } = render(
        <AnimationProvider tickInterval={100}>
          <StreamingText
            content="No blink"
            isStreaming={true}
            cursorBlink={false}
            typewriterEffect={false}
          />
        </AnimationProvider>
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

  describe("animation cleanup", () => {
    it("cleans up animation interval on unmount", () => {
      const clearIntervalSpy = vi.spyOn(global, "clearInterval");

      const { unmount } = render(
        <AnimationProvider tickInterval={100}>
          <StreamingText content="Test" isStreaming={true} cursorBlink={true} />
        </AnimationProvider>
      );

      act(() => {
        unmount();
      });

      expect(clearIntervalSpy).toHaveBeenCalled();
      clearIntervalSpy.mockRestore();
    });
  });
});
