// packages/cli/src/tui/utils/terminal-scroll.test.ts

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createScrollNormalizer,
  createScrollNormalizerWithReset,
  createSensitiveScrollNormalizer,
  detectTerminal,
  getScrollConfig,
  getScrollSensitivity,
  TERMINAL_SCROLL_CONFIGS,
} from "./terminal-scroll.js";

describe("terminal-scroll", () => {
  // Save original environment variables
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear related environment variables
    delete process.env.TERM_PROGRAM;
    delete process.env.TERMINAL_EMULATOR;
    delete process.env.WT_SESSION;
    delete process.env.VSCODE_INJECTION;
    delete process.env.VELLUM_SCROLL_SENSITIVITY;
  });

  afterEach(() => {
    // Restore environment variables
    process.env = { ...originalEnv };
  });

  describe("detectTerminal", () => {
    it("should detect VS Code terminal via VSCODE_INJECTION", () => {
      process.env.VSCODE_INJECTION = "1";
      expect(detectTerminal()).toBe("vscode");
    });

    it("should detect VS Code terminal via TERM_PROGRAM", () => {
      process.env.TERM_PROGRAM = "vscode";
      expect(detectTerminal()).toBe("vscode");
    });

    it("should detect Windows Terminal via WT_SESSION", () => {
      process.env.WT_SESSION = "{guid}";
      expect(detectTerminal()).toBe("wt");
    });

    it("should detect iTerm2 via TERM_PROGRAM", () => {
      process.env.TERM_PROGRAM = "iTerm.app";
      expect(detectTerminal()).toBe("iterm2");
    });

    it("should detect Alacritty via TERM_PROGRAM", () => {
      process.env.TERM_PROGRAM = "Alacritty";
      expect(detectTerminal()).toBe("alacritty");
    });

    it("should detect Alacritty via TERMINAL_EMULATOR", () => {
      process.env.TERMINAL_EMULATOR = "alacritty";
      expect(detectTerminal()).toBe("alacritty");
    });

    it("should detect Hyper terminal", () => {
      process.env.TERM_PROGRAM = "Hyper";
      expect(detectTerminal()).toBe("hyper");
    });

    it("should detect Apple Terminal", () => {
      process.env.TERM_PROGRAM = "Apple_Terminal";
      expect(detectTerminal()).toBe("apple_terminal");
    });

    it("should return default for unknown terminal", () => {
      process.env.TERM_PROGRAM = "unknown-terminal";
      expect(detectTerminal()).toBe("default");
    });

    it("should return default when no env vars set", () => {
      expect(detectTerminal()).toBe("default");
    });

    it("should prioritize VS Code over other detections", () => {
      process.env.VSCODE_INJECTION = "1";
      process.env.TERM_PROGRAM = "iTerm.app";
      expect(detectTerminal()).toBe("vscode");
    });

    it("should prioritize VS Code over Windows Terminal", () => {
      process.env.VSCODE_INJECTION = "1";
      process.env.WT_SESSION = "{guid}";
      expect(detectTerminal()).toBe("vscode");
    });

    it("should prioritize Windows Terminal over iTerm2", () => {
      process.env.WT_SESSION = "{guid}";
      process.env.TERM_PROGRAM = "iTerm.app";
      expect(detectTerminal()).toBe("wt");
    });
  });

  describe("getScrollConfig", () => {
    it("should return VS Code config with 9 eventsPerTick", () => {
      process.env.VSCODE_INJECTION = "1";
      const config = getScrollConfig();
      expect(config.eventsPerTick).toBe(9);
      expect(config.linesPerEvent).toBe(1);
      expect(config.name).toBe("VS Code");
    });

    it("should return Windows Terminal config", () => {
      process.env.WT_SESSION = "{guid}";
      const config = getScrollConfig();
      expect(config.eventsPerTick).toBe(3);
      expect(config.name).toBe("Windows Terminal");
    });

    it("should return iTerm2 config", () => {
      process.env.TERM_PROGRAM = "iTerm.app";
      const config = getScrollConfig();
      expect(config.eventsPerTick).toBe(3);
      expect(config.name).toBe("iTerm2");
    });

    it("should return default config with 3 eventsPerTick", () => {
      const config = getScrollConfig();
      expect(config.eventsPerTick).toBe(3);
      expect(config.linesPerEvent).toBe(1);
      expect(config.name).toBe("Unknown");
    });
  });

  describe("createScrollNormalizer", () => {
    it("should normalize scroll events (VS Code: 9 events -> 1 line)", () => {
      const normalize = createScrollNormalizer(9, 1);

      // 9 events should produce 1 line
      let totalLines = 0;
      for (let i = 0; i < 9; i++) {
        totalLines += normalize(1);
      }
      expect(totalLines).toBe(1);
    });

    it("should normalize scroll events (default: 3 events -> 1 line)", () => {
      const normalize = createScrollNormalizer(3, 1);

      // 3 events should produce 1 line
      let totalLines = 0;
      for (let i = 0; i < 3; i++) {
        totalLines += normalize(1);
      }
      expect(totalLines).toBe(1);
    });

    it("should handle negative deltas (scroll up)", () => {
      const normalize = createScrollNormalizer(3, 1);

      let totalLines = 0;
      for (let i = 0; i < 3; i++) {
        totalLines += normalize(-1);
      }
      expect(totalLines).toBe(-1);
    });

    it("should accumulate small deltas without losing precision", () => {
      const normalize = createScrollNormalizer(9, 1);

      // First 8 events should return 0
      for (let i = 0; i < 8; i++) {
        expect(normalize(1)).toBe(0);
      }
      // 9th event should return 1
      expect(normalize(1)).toBe(1);
    });

    it("should handle large deltas", () => {
      const normalize = createScrollNormalizer(3, 1);

      // Single event with delta of 9 should produce 3 lines
      expect(normalize(9)).toBe(3);
    });

    it("should handle mixed direction scrolling", () => {
      const normalize = createScrollNormalizer(3, 1);

      // 2 down, then 2 up should cancel out
      normalize(1);
      normalize(1);
      normalize(-1);
      normalize(-1);

      // Need 3 events to produce a line
      expect(normalize(1)).toBe(0);
      expect(normalize(1)).toBe(0);
      expect(normalize(1)).toBe(1);
    });

    it("should preserve fractional accumulator", () => {
      const normalize = createScrollNormalizer(9, 1);

      // 18 events should produce exactly 2 lines
      let totalLines = 0;
      for (let i = 0; i < 18; i++) {
        totalLines += normalize(1);
      }
      expect(totalLines).toBe(2);
    });

    it("should handle linesPerEvent multiplier", () => {
      const normalize = createScrollNormalizer(3, 2);

      // 3 events should produce 2 lines
      let totalLines = 0;
      for (let i = 0; i < 3; i++) {
        totalLines += normalize(1);
      }
      expect(totalLines).toBe(2);
    });

    it("should return 0 for insufficient delta", () => {
      const normalize = createScrollNormalizer(9, 1);

      expect(normalize(1)).toBe(0);
      expect(normalize(2)).toBe(0);
      expect(normalize(3)).toBe(0);
    });
  });

  describe("createScrollNormalizerWithReset", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should reset accumulator after timeout", () => {
      const { normalize } = createScrollNormalizerWithReset(9, 1, 100);

      // Accumulate 5 events (not enough for 1 line)
      for (let i = 0; i < 5; i++) {
        normalize(1);
      }

      // Fast-forward past reset timeout
      vi.advanceTimersByTime(150);

      // New events should start from 0
      // 9 new events should produce 1 line (not more)
      let totalLines = 0;
      for (let i = 0; i < 9; i++) {
        totalLines += normalize(1);
      }
      expect(totalLines).toBe(1);
    });

    it("should cancel pending reset when new event arrives", () => {
      const { normalize } = createScrollNormalizerWithReset(9, 1, 100);

      // First event
      normalize(1);

      // Wait 50ms (less than reset timeout)
      vi.advanceTimersByTime(50);

      // Another event should cancel pending reset
      normalize(1);

      // Wait another 50ms (total 100ms since last event)
      vi.advanceTimersByTime(50);

      // Accumulator should still have 2 events worth
      // Need 7 more to complete a line
      let lines = 0;
      for (let i = 0; i < 7; i++) {
        lines += normalize(1);
      }
      expect(lines).toBe(1);
    });

    it("should allow manual reset", () => {
      const { normalize, reset } = createScrollNormalizerWithReset(9, 1, 100);

      // Accumulate 5 events
      for (let i = 0; i < 5; i++) {
        normalize(1);
      }

      // Manual reset
      reset();

      // New events should start from 0
      let totalLines = 0;
      for (let i = 0; i < 9; i++) {
        totalLines += normalize(1);
      }
      expect(totalLines).toBe(1);
    });

    it("should clear pending timer on manual reset", () => {
      const { normalize, reset } = createScrollNormalizerWithReset(9, 1, 100);

      // Start scrolling
      normalize(1);

      // Reset immediately
      reset();

      // Advance time - no error should occur
      vi.advanceTimersByTime(150);

      // Should work normally after reset
      let totalLines = 0;
      for (let i = 0; i < 9; i++) {
        totalLines += normalize(1);
      }
      expect(totalLines).toBe(1);
    });

    it("should handle negative deltas with reset", () => {
      const { normalize } = createScrollNormalizerWithReset(3, 1, 100);

      // Scroll up
      let totalLines = 0;
      for (let i = 0; i < 3; i++) {
        totalLines += normalize(-1);
      }
      expect(totalLines).toBe(-1);

      // Wait for reset
      vi.advanceTimersByTime(150);

      // Scroll down
      totalLines = 0;
      for (let i = 0; i < 3; i++) {
        totalLines += normalize(1);
      }
      expect(totalLines).toBe(1);
    });

    it("should use default timeout of 100ms", () => {
      const { normalize } = createScrollNormalizerWithReset(9, 1);

      // Accumulate 5 events
      for (let i = 0; i < 5; i++) {
        normalize(1);
      }

      // 90ms - should not reset yet
      vi.advanceTimersByTime(90);

      // Add 4 more events (total 9 without reset)
      let lines = 0;
      for (let i = 0; i < 4; i++) {
        lines += normalize(1);
      }
      expect(lines).toBe(1); // Should have accumulated from before

      // Wait for reset
      vi.advanceTimersByTime(150);

      // 9 new events should produce exactly 1 line
      lines = 0;
      for (let i = 0; i < 9; i++) {
        lines += normalize(1);
      }
      expect(lines).toBe(1);
    });
  });

  describe("getScrollSensitivity", () => {
    it("should return 1.0 by default", () => {
      expect(getScrollSensitivity()).toBe(1.0);
    });

    it("should read from environment variable", () => {
      process.env.VELLUM_SCROLL_SENSITIVITY = "0.5";
      expect(getScrollSensitivity()).toBe(0.5);
    });

    it("should read higher sensitivity from environment variable", () => {
      process.env.VELLUM_SCROLL_SENSITIVITY = "2.0";
      expect(getScrollSensitivity()).toBe(2.0);
    });

    it("should clamp to minimum 0.1", () => {
      process.env.VELLUM_SCROLL_SENSITIVITY = "0.05";
      expect(getScrollSensitivity()).toBe(0.1);
    });

    it("should clamp to maximum 10.0", () => {
      process.env.VELLUM_SCROLL_SENSITIVITY = "15.0";
      expect(getScrollSensitivity()).toBe(10.0);
    });

    it("should handle invalid values", () => {
      process.env.VELLUM_SCROLL_SENSITIVITY = "not-a-number";
      expect(getScrollSensitivity()).toBe(1.0);
    });

    it("should handle empty string", () => {
      process.env.VELLUM_SCROLL_SENSITIVITY = "";
      expect(getScrollSensitivity()).toBe(1.0);
    });

    it("should handle negative values", () => {
      process.env.VELLUM_SCROLL_SENSITIVITY = "-1.0";
      expect(getScrollSensitivity()).toBe(0.1);
    });

    it("should handle zero", () => {
      process.env.VELLUM_SCROLL_SENSITIVITY = "0";
      expect(getScrollSensitivity()).toBe(0.1);
    });
  });

  describe("createSensitiveScrollNormalizer", () => {
    it("should apply sensitivity multiplier from env", () => {
      process.env.VELLUM_SCROLL_SENSITIVITY = "2.0";

      const { normalize } = createSensitiveScrollNormalizer(3, 1);

      // With sensitivity 2.0, 3 events should produce 2 lines
      let totalLines = 0;
      for (let i = 0; i < 3; i++) {
        totalLines += normalize(1);
      }
      expect(totalLines).toBe(2);
    });

    it("should handle sensitivity less than 1", () => {
      process.env.VELLUM_SCROLL_SENSITIVITY = "0.5";

      const { normalize } = createSensitiveScrollNormalizer(3, 1);

      // With sensitivity 0.5, 6 events should produce 1 line
      let totalLines = 0;
      for (let i = 0; i < 6; i++) {
        totalLines += normalize(1);
      }
      expect(totalLines).toBe(1);
    });

    it("should use default sensitivity of 1.0", () => {
      const { normalize } = createSensitiveScrollNormalizer(3, 1);

      // Default sensitivity 1.0, 3 events should produce 1 line
      let totalLines = 0;
      for (let i = 0; i < 3; i++) {
        totalLines += normalize(1);
      }
      expect(totalLines).toBe(1);
    });

    it("should support reset functionality", () => {
      vi.useFakeTimers();

      const { normalize, reset } = createSensitiveScrollNormalizer(9, 1);

      // Accumulate 5 events
      for (let i = 0; i < 5; i++) {
        normalize(1);
      }

      // Reset
      reset();

      // Should start fresh
      let totalLines = 0;
      for (let i = 0; i < 9; i++) {
        totalLines += normalize(1);
      }
      expect(totalLines).toBe(1);

      vi.useRealTimers();
    });

    it("should support custom reset timeout", () => {
      vi.useFakeTimers();
      process.env.VELLUM_SCROLL_SENSITIVITY = "1.0";

      const { normalize } = createSensitiveScrollNormalizer(9, 1, 50);

      // Accumulate 5 events
      for (let i = 0; i < 5; i++) {
        normalize(1);
      }

      // Wait 60ms (past custom timeout of 50ms)
      vi.advanceTimersByTime(60);

      // Should have reset - 9 new events produce 1 line
      let totalLines = 0;
      for (let i = 0; i < 9; i++) {
        totalLines += normalize(1);
      }
      expect(totalLines).toBe(1);

      vi.useRealTimers();
    });
  });

  describe("TERMINAL_SCROLL_CONFIGS", () => {
    it("should have VS Code config", () => {
      expect(TERMINAL_SCROLL_CONFIGS.vscode).toBeDefined();
      expect(TERMINAL_SCROLL_CONFIGS.vscode?.eventsPerTick).toBe(9);
      expect(TERMINAL_SCROLL_CONFIGS.vscode?.linesPerEvent).toBe(1);
      expect(TERMINAL_SCROLL_CONFIGS.vscode?.name).toBe("VS Code");
    });

    it("should have default config", () => {
      expect(TERMINAL_SCROLL_CONFIGS.default).toBeDefined();
      expect(TERMINAL_SCROLL_CONFIGS.default?.eventsPerTick).toBe(3);
      expect(TERMINAL_SCROLL_CONFIGS.default?.linesPerEvent).toBe(1);
    });

    it("should have Windows Terminal config", () => {
      expect(TERMINAL_SCROLL_CONFIGS.wt).toBeDefined();
      expect(TERMINAL_SCROLL_CONFIGS.wt?.eventsPerTick).toBe(3);
      expect(TERMINAL_SCROLL_CONFIGS.wt?.name).toBe("Windows Terminal");
    });

    it("should have iTerm2 config", () => {
      expect(TERMINAL_SCROLL_CONFIGS.iterm2).toBeDefined();
      expect(TERMINAL_SCROLL_CONFIGS.iterm2?.eventsPerTick).toBe(3);
      expect(TERMINAL_SCROLL_CONFIGS.iterm2?.name).toBe("iTerm2");
    });

    it("should have Alacritty config", () => {
      expect(TERMINAL_SCROLL_CONFIGS.alacritty).toBeDefined();
      expect(TERMINAL_SCROLL_CONFIGS.alacritty?.eventsPerTick).toBe(3);
      expect(TERMINAL_SCROLL_CONFIGS.alacritty?.name).toBe("Alacritty");
    });

    it("should have Apple Terminal config", () => {
      expect(TERMINAL_SCROLL_CONFIGS.apple_terminal).toBeDefined();
      expect(TERMINAL_SCROLL_CONFIGS.apple_terminal?.eventsPerTick).toBe(3);
      expect(TERMINAL_SCROLL_CONFIGS.apple_terminal?.name).toBe("Apple Terminal");
    });

    it("should have Hyper config", () => {
      expect(TERMINAL_SCROLL_CONFIGS.hyper).toBeDefined();
      expect(TERMINAL_SCROLL_CONFIGS.hyper?.eventsPerTick).toBe(3);
      expect(TERMINAL_SCROLL_CONFIGS.hyper?.name).toBe("Hyper");
    });

    it("should have consistent linesPerEvent across all configs", () => {
      for (const [_key, config] of Object.entries(TERMINAL_SCROLL_CONFIGS)) {
        expect(config.linesPerEvent).toBe(1);
      }
    });
  });
});
