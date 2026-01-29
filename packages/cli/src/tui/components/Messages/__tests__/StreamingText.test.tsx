/**
 * StreamingText Component Tests
 *
 * Tests for the StreamingText component which displays text with an animated
 * blinking cursor while streaming.
 *
 * @module tui/components/Messages/__tests__/StreamingText.test
 */

import { render } from "ink-testing-library";
import { act, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnimationProvider } from "../../../context/AnimationContext.js";
import { StreamingText } from "../StreamingText.js";

// =============================================================================
// Test Setup
// =============================================================================

let previousDisableAnimation: string | undefined;

beforeEach(() => {
  previousDisableAnimation = process.env.VELLUM_TEST_DISABLE_ANIMATION;
  process.env.VELLUM_TEST_DISABLE_ANIMATION = "0";
  vi.useFakeTimers();
});

afterEach(() => {
  if (previousDisableAnimation === undefined) {
    delete process.env.VELLUM_TEST_DISABLE_ANIMATION;
  } else {
    process.env.VELLUM_TEST_DISABLE_ANIMATION = previousDisableAnimation;
  }
  vi.useRealTimers();
});

// =============================================================================
// Tests
// =============================================================================

describe("StreamingText", () => {
  async function renderStreamingText(ui: ReactElement): Promise<ReturnType<typeof render>> {
    let result: ReturnType<typeof render> | undefined;
    await act(async () => {
      result = render(ui);
    });
    if (!result) {
      throw new Error("Render failed");
    }
    return result;
  }

  describe("rendering", () => {
    it("renders text content", async () => {
      const { lastFrame } = await renderStreamingText(
        <StreamingText content="Hello world" isStreaming={false} />
      );

      expect(lastFrame()).toContain("Hello world");
    });

    it("renders empty content", async () => {
      const { lastFrame } = await renderStreamingText(
        <StreamingText content="" isStreaming={false} />
      );

      // Should render without cursor when not streaming
      expect(lastFrame()).toBe("");
    });
  });

  describe("cursor behavior", () => {
    it("shows cursor when streaming", async () => {
      // Disable typewriter effect for immediate content display test
      const { lastFrame } = await renderStreamingText(
        <StreamingText content="Typing..." isStreaming={true} typewriterEffect={false} />
      );

      expect(lastFrame()).toContain("Typing...");
      expect(lastFrame()).toContain("▊"); // Default cursor
    });

    it("hides cursor when not streaming", async () => {
      const { lastFrame } = await renderStreamingText(
        <StreamingText content="Complete" isStreaming={false} />
      );

      expect(lastFrame()).toContain("Complete");
      expect(lastFrame()).not.toContain("▊");
    });

    it("uses custom cursor character", async () => {
      // Disable typewriter effect for immediate content display test
      const { lastFrame } = await renderStreamingText(
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
      const { lastFrame } = await renderStreamingText(
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

    it("does not blink cursor when cursorBlink is false", async () => {
      const { lastFrame } = await renderStreamingText(
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
    it("calls onComplete when streaming changes from true to false", async () => {
      const onComplete = vi.fn();

      const { rerender } = await renderStreamingText(
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

    it("does not call onComplete when initially not streaming", async () => {
      const onComplete = vi.fn();

      await renderStreamingText(
        <StreamingText content="Not streaming" isStreaming={false} onComplete={onComplete} />
      );

      // Should not be called on initial render when not streaming
      expect(onComplete).not.toHaveBeenCalled();
    });

    it("does not call onComplete when streaming remains true", async () => {
      const onComplete = vi.fn();

      const { rerender } = await renderStreamingText(
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

    it("works without onComplete callback", async () => {
      const { rerender } = await renderStreamingText(
        <StreamingText content="Streaming..." isStreaming={true} />
      );

      // Should not throw when onComplete is undefined
      expect(() => {
        act(() => {
          rerender(<StreamingText content="Done!" isStreaming={false} />);
        });
      }).not.toThrow();
    });
  });

  describe("animation cleanup", () => {
    it("cleans up animation interval on unmount", async () => {
      const clearIntervalSpy = vi.spyOn(global, "clearInterval");

      const { unmount } = await renderStreamingText(
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
