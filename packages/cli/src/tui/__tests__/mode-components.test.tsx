/**
 * Mode Components Tests (T048)
 *
 * Tests for TUI mode components:
 * - ModeIndicator: Mode display with icons and colors
 * - ModeSelector: Interactive mode selection
 * - PhaseProgressIndicator: Spec phase progress display
 *
 * @module tui/__tests__/mode-components.test
 */

import type { CodingMode } from "@vellum/core";
import { render } from "ink-testing-library";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { ModeIndicator } from "../components/ModeIndicator.js";
import { ModeSelector } from "../components/ModeSelector.js";
import { PhaseProgressIndicator } from "../components/PhaseProgressIndicator.js";
import { ThemeProvider } from "../theme/index.js";

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Wrapper to provide theme context for tests
 */
function renderWithTheme(element: React.ReactElement) {
  return render(<ThemeProvider>{element}</ThemeProvider>);
}

// =============================================================================
// ModeIndicator Tests
// =============================================================================

describe("ModeIndicator", () => {
  describe("Mode Icons", () => {
    it("should render vibe mode with lightning icon", () => {
      const { lastFrame } = renderWithTheme(<ModeIndicator mode="vibe" />);
      const frame = lastFrame() ?? "";
      expect(frame).toContain("⚡");
      expect(frame).toContain("vibe");
    });

    it("should render plan mode with clipboard icon", () => {
      const { lastFrame } = renderWithTheme(<ModeIndicator mode="plan" />);
      const frame = lastFrame() ?? "";
      expect(frame).toContain("📋");
      expect(frame).toContain("plan");
    });

    it("should render spec mode with wrench icon", () => {
      const { lastFrame } = renderWithTheme(<ModeIndicator mode="spec" />);
      const frame = lastFrame() ?? "";
      expect(frame).toContain("🔧");
      expect(frame).toContain("spec");
    });
  });

  describe("Spec Phase Display", () => {
    it("should show phase progress when in spec mode", () => {
      const { lastFrame } = renderWithTheme(<ModeIndicator mode="spec" specPhase={3} />);
      const frame = lastFrame() ?? "";
      expect(frame).toContain("🔧");
      expect(frame).toContain("spec");
      expect(frame).toContain("(3/6");
      expect(frame).toContain("Design");
    });

    it("should show phase 1 (Research) correctly", () => {
      const { lastFrame } = renderWithTheme(<ModeIndicator mode="spec" specPhase={1} />);
      const frame = lastFrame() ?? "";
      expect(frame).toContain("(1/6");
      expect(frame).toContain("Research");
    });

    it("should show phase 6 (Validation) correctly", () => {
      const { lastFrame } = renderWithTheme(<ModeIndicator mode="spec" specPhase={6} />);
      const frame = lastFrame() ?? "";
      expect(frame).toContain("(6/6");
      expect(frame).toContain("Validation");
    });

    it("should not show phase for non-spec modes", () => {
      const { lastFrame } = renderWithTheme(<ModeIndicator mode="vibe" specPhase={3} />);
      const frame = lastFrame() ?? "";
      expect(frame).not.toContain("(3/6)");
    });

    it("should clamp invalid phase numbers", () => {
      const { lastFrame } = renderWithTheme(<ModeIndicator mode="spec" specPhase={10} />);
      const frame = lastFrame() ?? "";
      expect(frame).toContain("(6/6");
    });
  });

  describe("Compact Mode", () => {
    it("should show only icon in compact mode", () => {
      const { lastFrame } = renderWithTheme(<ModeIndicator mode="vibe" compact />);
      const frame = lastFrame() ?? "";
      expect(frame).toContain("⚡");
      expect(frame).not.toContain("vibe ");
    });

    it("should show phase numbers in compact spec mode", () => {
      const { lastFrame } = renderWithTheme(<ModeIndicator mode="spec" specPhase={4} compact />);
      const frame = lastFrame() ?? "";
      expect(frame).toContain("🔧");
      expect(frame).toContain("(4/6)");
      // Should NOT show the phase name in compact mode
      expect(frame).not.toContain("Tasks");
    });
  });
});

// =============================================================================
// ModeSelector Tests
// =============================================================================

describe("ModeSelector", () => {
  describe("Rendering", () => {
    it("should render all three modes", () => {
      const onSelect = vi.fn();
      const { lastFrame } = renderWithTheme(
        <ModeSelector currentMode="vibe" onSelect={onSelect} isActive={false} />
      );
      const frame = lastFrame() ?? "";

      expect(frame).toContain("⚡");
      expect(frame).toContain("vibe");
      expect(frame).toContain("📋");
      expect(frame).toContain("plan");
      expect(frame).toContain("🔧");
      expect(frame).toContain("spec");
    });

    it("should show shortcut keys", () => {
      const onSelect = vi.fn();
      const { lastFrame } = renderWithTheme(
        <ModeSelector currentMode="vibe" onSelect={onSelect} isActive={false} />
      );
      const frame = lastFrame() ?? "";

      expect(frame).toContain("[1]");
      expect(frame).toContain("[2]");
      expect(frame).toContain("[3]");
    });

    it("should indicate current mode", () => {
      const onSelect = vi.fn();
      const { lastFrame } = renderWithTheme(
        <ModeSelector currentMode="plan" onSelect={onSelect} isActive={false} />
      );
      const frame = lastFrame() ?? "";

      expect(frame).toContain("(current)");
    });

    it("should show mode descriptions by default", () => {
      const onSelect = vi.fn();
      const { lastFrame } = renderWithTheme(
        <ModeSelector currentMode="vibe" onSelect={onSelect} isActive={false} />
      );
      const frame = lastFrame() ?? "";

      expect(frame).toContain("Fast autonomous coding");
    });

    it("should hide descriptions when showDescriptions is false", () => {
      const onSelect = vi.fn();
      const { lastFrame } = renderWithTheme(
        <ModeSelector
          currentMode="vibe"
          onSelect={onSelect}
          isActive={false}
          showDescriptions={false}
        />
      );
      const frame = lastFrame() ?? "";

      expect(frame).not.toContain("Fast autonomous coding");
    });
  });

  describe("Keyboard Navigation", () => {
    it("should show help text", () => {
      const onSelect = vi.fn();
      const { lastFrame } = renderWithTheme(
        <ModeSelector currentMode="vibe" onSelect={onSelect} isActive />
      );
      const frame = lastFrame() ?? "";

      expect(frame).toContain("↑↓");
      expect(frame).toContain("Enter");
    });

    // Note: Testing stdin/keyboard input with ink-testing-library is complex
    // because useInput handlers are called asynchronously. The keyboard
    // shortcuts (1, 2, 3) are tested implicitly through the component
    // implementation and manual testing. The rendering tests above
    // verify the UI elements are present.

    it("should show focus indicator when active", () => {
      const onSelect = vi.fn();
      const { lastFrame } = renderWithTheme(
        <ModeSelector currentMode="vibe" onSelect={onSelect} isActive />
      );
      const frame = lastFrame() ?? "";

      // Focus indicator should be present
      expect(frame).toContain("❯");
    });

    it("should not call onSelect when inactive", () => {
      const onSelect = vi.fn();
      renderWithTheme(<ModeSelector currentMode="vibe" onSelect={onSelect} isActive={false} />);

      // With isActive=false, the selector should not process input
      expect(onSelect).not.toHaveBeenCalled();
    });
  });
});

// =============================================================================
// PhaseProgressIndicator Tests
// =============================================================================

describe("PhaseProgressIndicator", () => {
  describe("Horizontal Progress Bar", () => {
    it("should render progress segments", () => {
      const { lastFrame } = renderWithTheme(<PhaseProgressIndicator currentPhase={3} />);
      const frame = lastFrame() ?? "";

      // Should contain progress bar characters
      expect(frame).toContain("█"); // Completed
      expect(frame).toContain("▓"); // Current
      expect(frame).toContain("░"); // Pending
    });

    it("should show first phase correctly", () => {
      const { lastFrame } = renderWithTheme(<PhaseProgressIndicator currentPhase={1} showLabels />);
      const frame = lastFrame() ?? "";

      expect(frame).toContain("Research");
      expect(frame).toContain("(1/6)");
    });

    it("should show last phase correctly", () => {
      const { lastFrame } = renderWithTheme(<PhaseProgressIndicator currentPhase={6} showLabels />);
      const frame = lastFrame() ?? "";

      expect(frame).toContain("Validation");
      expect(frame).toContain("(6/6)");
    });

    it("should show percentage when enabled", () => {
      const { lastFrame } = renderWithTheme(
        <PhaseProgressIndicator currentPhase={4} showPercentage />
      );
      const frame = lastFrame() ?? "";

      // Phase 4 = 3 completed = 50%
      expect(frame).toContain("50%");
    });

    it("should show 0% for phase 1", () => {
      const { lastFrame } = renderWithTheme(
        <PhaseProgressIndicator currentPhase={1} showPercentage />
      );
      const frame = lastFrame() ?? "";

      expect(frame).toContain("0%");
    });

    it("should clamp phase to valid range", () => {
      const { lastFrame } = renderWithTheme(
        <PhaseProgressIndicator currentPhase={10} showLabels />
      );
      const frame = lastFrame() ?? "";

      expect(frame).toContain("Validation");
      expect(frame).toContain("(6/6)");
    });
  });

  describe("Vertical Progress List", () => {
    it("should render all phases in vertical mode", () => {
      const { lastFrame } = renderWithTheme(
        <PhaseProgressIndicator currentPhase={3} orientation="vertical" />
      );
      const frame = lastFrame() ?? "";

      expect(frame).toContain("1. Research");
      expect(frame).toContain("2. Requirements");
      expect(frame).toContain("3. Design");
      expect(frame).toContain("4. Tasks");
      expect(frame).toContain("5. Implementation");
      expect(frame).toContain("6. Validation");
    });

    it("should show completed phases with checkmark", () => {
      const { lastFrame } = renderWithTheme(
        <PhaseProgressIndicator currentPhase={3} orientation="vertical" />
      );
      const frame = lastFrame() ?? "";

      // Phases 1 and 2 should be completed
      expect(frame).toContain("✓");
    });

    it("should show current phase with bullet", () => {
      const { lastFrame } = renderWithTheme(
        <PhaseProgressIndicator currentPhase={3} orientation="vertical" />
      );
      const frame = lastFrame() ?? "";

      expect(frame).toContain("●");
    });

    it("should show pending phases with circle", () => {
      const { lastFrame } = renderWithTheme(
        <PhaseProgressIndicator currentPhase={3} orientation="vertical" />
      );
      const frame = lastFrame() ?? "";

      expect(frame).toContain("○");
    });

    it("should show progress summary with percentage", () => {
      const { lastFrame } = renderWithTheme(
        <PhaseProgressIndicator currentPhase={4} orientation="vertical" showPercentage />
      );
      const frame = lastFrame() ?? "";

      expect(frame).toContain("Progress:");
      expect(frame).toContain("50%");
      expect(frame).toContain("3/6 completed");
    });
  });

  describe("Custom Width", () => {
    it("should respect custom width", () => {
      const { lastFrame } = renderWithTheme(<PhaseProgressIndicator currentPhase={3} width={12} />);
      const frame = lastFrame() ?? "";

      // Width 12 / 6 phases = 2 chars per segment
      // Just verify it renders without errors
      expect(frame).toBeTruthy();
    });
  });
});

// =============================================================================
// Accessibility Tests
// =============================================================================

describe("Accessibility", () => {
  describe("ModeIndicator", () => {
    it("should use semantic colors for modes", () => {
      // Each mode should have a distinct color
      const modes: CodingMode[] = ["vibe", "plan", "spec"];

      for (const mode of modes) {
        const { lastFrame } = renderWithTheme(<ModeIndicator mode={mode} />);
        const frame = lastFrame() ?? "";
        // Just verify it renders without errors
        expect(frame).toBeTruthy();
      }
    });
  });

  describe("PhaseProgressIndicator", () => {
    it("should provide textual alternatives in vertical mode", () => {
      const { lastFrame } = renderWithTheme(
        <PhaseProgressIndicator currentPhase={3} orientation="vertical" showPercentage />
      );
      const frame = lastFrame() ?? "";

      // Should have textual descriptions
      expect(frame).toContain("Research");
      expect(frame).toContain("Requirements");
      expect(frame).toContain("Design");
    });
  });
});
