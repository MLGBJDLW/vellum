/**
 * useModeController Hook Tests (T010)
 *
 * Tests the core mode selection logic extracted from the hook.
 *
 * @module tui/hooks/__tests__/useModeController.test
 */

import { describe, expect, it } from "vitest";
import type {
  ModeControllerConfig,
  ModeControllerState,
  ModeReason,
  RenderMode,
} from "../useModeController.js";

/** Default message count threshold for virtualized mode */
const DEFAULT_MESSAGE_COUNT_THRESHOLD = 50;

// Extract pure logic from the hook for testing (mirrors hook internals)
// Note: This does NOT test hysteresis (stateful) behavior - that requires React hook testing
function computeModeState(
  availableHeight: number,
  totalContentHeight: number,
  config: ModeControllerConfig = {},
  messageCount = 0,
  wasVirtualizedByCount = false
): ModeControllerState {
  const staticMultiplier = config.staticMultiplier ?? 1.2;
  const virtualMultiplier = config.virtualMultiplier ?? 5.0;
  const minWindowSize = config.minWindowSize ?? 10;
  const maxWindowSizeRatio = config.maxWindowSizeRatio ?? 0.8;
  const forceMode = config.forceMode;
  const messageCountThreshold = config.messageCountThreshold ?? DEFAULT_MESSAGE_COUNT_THRESHOLD;
  const messageCountHysteresis = config.messageCountHysteresis ?? 10;

  const staticThreshold = Math.max(1, availableHeight * staticMultiplier);
  const virtualThreshold = Math.max(1, availableHeight * virtualMultiplier);
  const windowSize = Math.max(minWindowSize, Math.floor(availableHeight * maxWindowSizeRatio));
  const isAutoMode = !forceMode;

  if (forceMode) {
    return {
      mode: forceMode,
      windowSize,
      modeReason: "forced",
      staticThreshold,
      virtualThreshold,
      isAutoMode,
      messageCountThreshold,
      virtualizedByMessageCount: false,
    };
  }

  // Check message count threshold with hysteresis simulation
  let virtualizedByMessageCount = false;
  const exitThreshold = messageCountThreshold - messageCountHysteresis;

  if (wasVirtualizedByCount) {
    virtualizedByMessageCount = messageCount >= exitThreshold;
  } else {
    virtualizedByMessageCount = messageCount >= messageCountThreshold;
  }

  let mode: RenderMode;
  let modeReason: ModeReason;

  if (virtualizedByMessageCount) {
    mode = "virtualized";
    modeReason = "content-very-large";
  } else if (totalContentHeight <= staticThreshold) {
    mode = "static";
    modeReason = "content-fits";
  } else if (totalContentHeight <= virtualThreshold) {
    mode = "windowed";
    modeReason = "content-exceeds-viewport";
  } else {
    mode = "virtualized";
    modeReason = "content-very-large";
  }

  return {
    mode,
    windowSize,
    modeReason,
    staticThreshold,
    virtualThreshold,
    isAutoMode,
    messageCountThreshold,
    virtualizedByMessageCount,
  };
}

describe("useModeController (core logic)", () => {
  describe("default mode selection", () => {
    it("selects static for small content", () => {
      const result = computeModeState(20, 10);
      expect(result.mode).toBe("static");
      expect(result.modeReason).toBe("content-fits");
    });

    it("selects windowed for medium content", () => {
      const result = computeModeState(20, 50);
      expect(result.mode).toBe("windowed");
      expect(result.modeReason).toBe("content-exceeds-viewport");
    });

    it("selects virtualized for large content", () => {
      const result = computeModeState(20, 200);
      expect(result.mode).toBe("virtualized");
      expect(result.modeReason).toBe("content-very-large");
    });
  });

  describe("threshold calculations", () => {
    it("computes staticThreshold = availableHeight * 1.2", () => {
      const result = computeModeState(100, 50);
      expect(result.staticThreshold).toBe(120);
    });

    it("computes virtualThreshold = availableHeight * 5.0", () => {
      const result = computeModeState(100, 50);
      expect(result.virtualThreshold).toBe(500);
    });
  });

  describe("forceMode override", () => {
    it("forces windowed mode when configured", () => {
      const result = computeModeState(20, 10, { forceMode: "windowed" });
      expect(result.mode).toBe("windowed");
      expect(result.modeReason).toBe("forced");
      expect(result.isAutoMode).toBe(false);
    });

    it("returns isAutoMode true when not forced", () => {
      const result = computeModeState(20, 10);
      expect(result.isAutoMode).toBe(true);
    });
  });

  describe("message count thresholds", () => {
    it("triggers virtualized mode when message count exceeds threshold", () => {
      // Small content but many messages
      const result = computeModeState(20, 10, {}, 60);
      expect(result.mode).toBe("virtualized");
      expect(result.virtualizedByMessageCount).toBe(true);
    });

    it("stays in static mode when message count below threshold", () => {
      const result = computeModeState(20, 10, {}, 30);
      expect(result.mode).toBe("static");
      expect(result.virtualizedByMessageCount).toBe(false);
    });

    it("respects hysteresis when exiting virtualized mode", () => {
      // With default threshold=50 and hysteresis=10, exit at 40
      // Was virtualized by count, now at 45 messages -> should stay virtualized
      const result = computeModeState(20, 10, {}, 45, true);
      expect(result.mode).toBe("virtualized");
      expect(result.virtualizedByMessageCount).toBe(true);

      // Drop below exit threshold (40) -> should exit virtualized
      const result2 = computeModeState(20, 10, {}, 35, true);
      expect(result2.virtualizedByMessageCount).toBe(false);
    });

    it("allows custom message count threshold", () => {
      // With threshold=100, 60 messages should NOT trigger virtualized
      const result = computeModeState(20, 10, { messageCountThreshold: 100 }, 60);
      expect(result.mode).toBe("static");
      expect(result.virtualizedByMessageCount).toBe(false);
    });
  });

  describe("config overrides", () => {
    it("applies minWindowSize", () => {
      const result = computeModeState(10, 50, { minWindowSize: 15 });
      expect(result.windowSize).toBe(15);
    });

    it("applies maxWindowSizeRatio", () => {
      const result = computeModeState(100, 50, { maxWindowSizeRatio: 0.5 });
      expect(result.windowSize).toBe(50);
    });

    it("applies custom staticMultiplier and virtualMultiplier", () => {
      const result = computeModeState(100, 50, { staticMultiplier: 2.0, virtualMultiplier: 10.0 });
      expect(result.staticThreshold).toBe(200);
      expect(result.virtualThreshold).toBe(1000);
    });
  });

  describe("modeReason content", () => {
    it("includes reason for static mode", () => {
      const result = computeModeState(20, 10);
      expect(result.modeReason).toBe("content-fits");
    });

    it("includes reason for virtualized mode", () => {
      const result = computeModeState(20, 200);
      expect(result.modeReason).toBe("content-very-large");
    });
  });
});
