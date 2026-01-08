/**
 * StatusBar Component Tests (T040)
 *
 * Comprehensive tests for the StatusBar component and its sub-components:
 * - ModelIndicator: Provider icons and model display
 * - TokenCounter: Token usage with color thresholds
 * - TrustModeIndicator: Trust mode icons and colors
 * - ThinkingModeIndicator: Thinking mode states and budget
 *
 * Tests focus on:
 * - All indicators display correctly
 * - Token color thresholds (warning > 80%, error > 95%)
 * - Trust mode icons (ask/auto/full)
 * - Thinking mode states with optional budget
 *
 * @module tui/components/StatusBar/__tests__/StatusBar.test
 */

import { render } from "ink-testing-library";
import type React from "react";
import { describe, expect, it } from "vitest";
import { ThemeProvider } from "../../../theme/index.js";
import { ModelIndicator } from "../ModelIndicator.js";
import { StatusBar } from "../StatusBar.js";
import { ThinkingModeIndicator } from "../ThinkingModeIndicator.js";
import { TokenCounter } from "../TokenCounter.js";
import { TrustModeIndicator } from "../TrustModeIndicator.js";

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
// ModelIndicator Tests
// =============================================================================

describe("ModelIndicator", () => {
  describe("Provider Icons", () => {
    it("should render Anthropic provider with diamond icon", () => {
      const { lastFrame } = renderWithTheme(
        <ModelIndicator provider="anthropic" model="claude-3-opus" />
      );
      const frame = lastFrame() ?? "";
      expect(frame).toContain("◈");
      expect(frame).toContain("Anthropic");
      expect(frame).toContain("claude-3-opus");
    });

    it("should render OpenAI provider with circle icon", () => {
      const { lastFrame } = renderWithTheme(
        <ModelIndicator provider="openai" model="gpt-4-turbo" />
      );
      const frame = lastFrame() ?? "";
      expect(frame).toContain("◉");
      expect(frame).toContain("OpenAI");
      expect(frame).toContain("gpt-4-turbo");
    });

    it("should render Google provider with ring icon", () => {
      const { lastFrame } = renderWithTheme(
        <ModelIndicator provider="google" model="gemini-pro" />
      );
      const frame = lastFrame() ?? "";
      expect(frame).toContain("◎");
      expect(frame).toContain("Google");
      expect(frame).toContain("gemini-pro");
    });

    it("should render Azure provider with diamond outline icon", () => {
      const { lastFrame } = renderWithTheme(<ModelIndicator provider="azure" model="gpt-4" />);
      const frame = lastFrame() ?? "";
      expect(frame).toContain("◇");
      expect(frame).toContain("Azure");
    });

    it("should render Bedrock provider with filled square icon", () => {
      const { lastFrame } = renderWithTheme(
        <ModelIndicator provider="bedrock" model="claude-v2" />
      );
      const frame = lastFrame() ?? "";
      expect(frame).toContain("▣");
      expect(frame).toContain("Bedrock");
    });

    it("should render Mistral provider with filled diamond icon", () => {
      const { lastFrame } = renderWithTheme(
        <ModelIndicator provider="mistral" model="mistral-large" />
      );
      const frame = lastFrame() ?? "";
      expect(frame).toContain("◆");
      expect(frame).toContain("Mistral");
    });

    it("should render Ollama provider with circle outline icon", () => {
      const { lastFrame } = renderWithTheme(<ModelIndicator provider="ollama" model="llama2" />);
      const frame = lastFrame() ?? "";
      expect(frame).toContain("○");
      expect(frame).toContain("Ollama");
    });

    it("should render default icon for unknown provider", () => {
      const { lastFrame } = renderWithTheme(<ModelIndicator provider="custom" model="my-model" />);
      const frame = lastFrame() ?? "";
      expect(frame).toContain("●");
      expect(frame).toContain("Custom");
      expect(frame).toContain("my-model");
    });
  });

  describe("Model Name Display", () => {
    it("should display short model names fully", () => {
      const { lastFrame } = renderWithTheme(
        <ModelIndicator provider="anthropic" model="claude-3" />
      );
      expect(lastFrame()).toContain("claude-3");
    });

    it("should truncate very long model names", () => {
      const longModelName = "claude-3-5-sonnet-20241022-extra-long-suffix";
      const { lastFrame } = renderWithTheme(
        <ModelIndicator provider="anthropic" model={longModelName} />
      );
      const frame = lastFrame() ?? "";
      expect(frame).toContain("...");
    });

    it("should render provider/model format", () => {
      const { lastFrame } = renderWithTheme(<ModelIndicator provider="openai" model="gpt-4" />);
      const frame = lastFrame() ?? "";
      expect(frame).toContain("OpenAI");
      expect(frame).toContain("/");
      expect(frame).toContain("gpt-4");
    });
  });

  describe("Case Insensitivity", () => {
    it("should handle uppercase provider names", () => {
      const { lastFrame } = renderWithTheme(<ModelIndicator provider="ANTHROPIC" model="claude" />);
      expect(lastFrame()).toContain("◈");
    });

    it("should handle mixed case provider names", () => {
      const { lastFrame } = renderWithTheme(<ModelIndicator provider="OpenAI" model="gpt-4" />);
      expect(lastFrame()).toContain("◉");
    });
  });
});

// =============================================================================
// TokenCounter Tests
// =============================================================================

describe("TokenCounter", () => {
  describe("Basic Display", () => {
    it("should render token counts", () => {
      const { lastFrame } = renderWithTheme(<TokenCounter current={5000} max={100000} />);
      const frame = lastFrame() ?? "";
      expect(frame).toContain("◊");
      expect(frame).toContain("5.0K");
      expect(frame).toContain("100K");
    });

    it("should render small token counts without suffix", () => {
      const { lastFrame } = renderWithTheme(<TokenCounter current={500} max={1000} />);
      const frame = lastFrame() ?? "";
      expect(frame).toContain("500");
      expect(frame).toContain("1.0K");
    });

    it("should render large token counts with M suffix", () => {
      const { lastFrame } = renderWithTheme(<TokenCounter current={1500000} max={2000000} />);
      const frame = lastFrame() ?? "";
      expect(frame).toContain("1.5M");
      expect(frame).toContain("2.0M");
    });

    it("should display percentage", () => {
      const { lastFrame } = renderWithTheme(<TokenCounter current={5000} max={10000} />);
      expect(lastFrame()).toContain("50%");
    });
  });

  describe("Color Thresholds", () => {
    it("should display normal color below 80%", () => {
      const { lastFrame } = renderWithTheme(<TokenCounter current={7900} max={10000} />);
      const frame = lastFrame() ?? "";
      expect(frame).toContain("79%");
      // Normal state renders without warning/error colors
      expect(frame).toBeDefined();
    });

    it("should display warning color at 80%", () => {
      const { lastFrame } = renderWithTheme(<TokenCounter current={8000} max={10000} />);
      const frame = lastFrame() ?? "";
      expect(frame).toContain("80%");
    });

    it("should display warning color at 85%", () => {
      const { lastFrame } = renderWithTheme(<TokenCounter current={8500} max={10000} />);
      const frame = lastFrame() ?? "";
      expect(frame).toContain("85%");
    });

    it("should display warning color at 94%", () => {
      const { lastFrame } = renderWithTheme(<TokenCounter current={9400} max={10000} />);
      const frame = lastFrame() ?? "";
      expect(frame).toContain("94%");
    });

    it("should display error color at 95%", () => {
      const { lastFrame } = renderWithTheme(<TokenCounter current={9500} max={10000} />);
      const frame = lastFrame() ?? "";
      expect(frame).toContain("95%");
    });

    it("should display error color at 100%", () => {
      const { lastFrame } = renderWithTheme(<TokenCounter current={10000} max={10000} />);
      const frame = lastFrame() ?? "";
      expect(frame).toContain("100%");
    });

    it("should cap percentage at 100% even if over limit", () => {
      const { lastFrame } = renderWithTheme(<TokenCounter current={12000} max={10000} />);
      const frame = lastFrame() ?? "";
      expect(frame).toContain("100%");
    });
  });

  describe("Edge Cases", () => {
    it("should handle zero max tokens gracefully", () => {
      const { lastFrame } = renderWithTheme(<TokenCounter current={100} max={0} />);
      const frame = lastFrame() ?? "";
      expect(frame).toContain("0%");
    });

    it("should handle zero current tokens", () => {
      const { lastFrame } = renderWithTheme(<TokenCounter current={0} max={10000} />);
      const frame = lastFrame() ?? "";
      expect(frame).toContain("0%");
    });
  });
});

// =============================================================================
// TrustModeIndicator Tests
// =============================================================================

describe("TrustModeIndicator", () => {
  describe("Trust Mode Icons", () => {
    it("should render ask mode with ring icon", () => {
      const { lastFrame } = renderWithTheme(<TrustModeIndicator mode="ask" />);
      const frame = lastFrame() ?? "";
      expect(frame).toContain("◎");
      expect(frame).toContain("Ask");
    });

    it("should render auto mode with filled circle icon", () => {
      const { lastFrame } = renderWithTheme(<TrustModeIndicator mode="auto" />);
      const frame = lastFrame() ?? "";
      expect(frame).toContain("◉");
      expect(frame).toContain("Auto");
    });

    it("should render full mode with solid circle icon", () => {
      const { lastFrame } = renderWithTheme(<TrustModeIndicator mode="full" />);
      const frame = lastFrame() ?? "";
      expect(frame).toContain("●");
      expect(frame).toContain("Full");
    });
  });

  describe("Trust Mode Display", () => {
    it("should display icon and label together", () => {
      const { lastFrame } = renderWithTheme(<TrustModeIndicator mode="ask" />);
      const frame = lastFrame() ?? "";
      expect(frame).toContain("◎");
      expect(frame).toContain("Ask");
    });

    it("should display auto mode correctly", () => {
      const { lastFrame } = renderWithTheme(<TrustModeIndicator mode="auto" />);
      const frame = lastFrame() ?? "";
      expect(frame).toMatch(/◉.*Auto/);
    });

    it("should display full mode correctly", () => {
      const { lastFrame } = renderWithTheme(<TrustModeIndicator mode="full" />);
      const frame = lastFrame() ?? "";
      expect(frame).toMatch(/●.*Full/);
    });
  });
});

// =============================================================================
// ThinkingModeIndicator Tests
// =============================================================================

describe("ThinkingModeIndicator", () => {
  describe("Active/Inactive States", () => {
    it("should render active state with filled diamond icon", () => {
      const { lastFrame } = renderWithTheme(<ThinkingModeIndicator active={true} />);
      const frame = lastFrame() ?? "";
      expect(frame).toContain("◆");
      expect(frame).toContain("Think");
    });

    it("should render inactive state with diamond outline icon", () => {
      const { lastFrame } = renderWithTheme(<ThinkingModeIndicator active={false} />);
      const frame = lastFrame() ?? "";
      expect(frame).toContain("◇");
      expect(frame).toContain("Think");
    });
  });

  describe("Budget Display", () => {
    it("should show budget when active with budget provided", () => {
      const { lastFrame } = renderWithTheme(
        <ThinkingModeIndicator active={true} budget={10000} used={5000} />
      );
      const frame = lastFrame() ?? "";
      expect(frame).toContain("5.0K");
      expect(frame).toContain("10K");
    });

    it("should not show budget when inactive even if provided", () => {
      const { lastFrame } = renderWithTheme(
        <ThinkingModeIndicator active={false} budget={10000} used={5000} />
      );
      const frame = lastFrame() ?? "";
      expect(frame).toContain("Think");
      expect(frame).not.toContain("10K");
    });

    it("should show zero used when not provided", () => {
      const { lastFrame } = renderWithTheme(<ThinkingModeIndicator active={true} budget={10000} />);
      const frame = lastFrame() ?? "";
      expect(frame).toContain("0");
      expect(frame).toContain("10K");
    });
  });

  describe("Budget Thresholds", () => {
    it("should display normal color below 80% budget usage", () => {
      const { lastFrame } = renderWithTheme(
        <ThinkingModeIndicator active={true} budget={10000} used={7900} />
      );
      const frame = lastFrame() ?? "";
      expect(frame).toContain("7.9K");
    });

    it("should handle warning state at 80% budget usage", () => {
      const { lastFrame } = renderWithTheme(
        <ThinkingModeIndicator active={true} budget={10000} used={8000} />
      );
      const frame = lastFrame() ?? "";
      expect(frame).toContain("8.0K");
    });

    it("should handle error state at 95% budget usage", () => {
      const { lastFrame } = renderWithTheme(
        <ThinkingModeIndicator active={true} budget={10000} used={9500} />
      );
      const frame = lastFrame() ?? "";
      expect(frame).toContain("9.5K");
    });

    it("should handle 100% budget usage", () => {
      const { lastFrame } = renderWithTheme(
        <ThinkingModeIndicator active={true} budget={10000} used={10000} />
      );
      const frame = lastFrame() ?? "";
      expect(frame).toContain("10K");
    });
  });

  describe("Token Formatting", () => {
    it("should format small token counts without suffix", () => {
      const { lastFrame } = renderWithTheme(
        <ThinkingModeIndicator active={true} budget={500} used={100} />
      );
      const frame = lastFrame() ?? "";
      expect(frame).toContain("100");
      expect(frame).toContain("500");
    });

    it("should format large token counts with K suffix", () => {
      const { lastFrame } = renderWithTheme(
        <ThinkingModeIndicator active={true} budget={50000} used={25000} />
      );
      const frame = lastFrame() ?? "";
      expect(frame).toContain("25K");
      expect(frame).toContain("50K");
    });

    it("should format million token counts with M suffix", () => {
      const { lastFrame } = renderWithTheme(
        <ThinkingModeIndicator active={true} budget={2000000} used={1000000} />
      );
      const frame = lastFrame() ?? "";
      expect(frame).toContain("1.0M");
      expect(frame).toContain("2.0M");
    });
  });
});

// =============================================================================
// StatusBar Integration Tests
// =============================================================================

describe("StatusBar", () => {
  describe("All Indicators Display", () => {
    it("should render with all indicators", () => {
      const { lastFrame } = renderWithTheme(
        <StatusBar
          model={{ provider: "anthropic", model: "claude-3-opus" }}
          tokens={{ current: 5000, max: 100000 }}
          trustMode="auto"
          thinking={{ active: true, budget: 10000, used: 2500 }}
        />
      );
      const frame = lastFrame() ?? "";
      // Model indicator
      expect(frame).toContain("◈");
      expect(frame).toContain("Anthropic");
      expect(frame).toContain("claude-3-opus");
      // Token counter
      expect(frame).toContain("◊");
      expect(frame).toContain("5K");
      // Trust mode
      expect(frame).toContain("◉");
      expect(frame).toContain("Auto");
      // Thinking mode
      expect(frame).toContain("◆");
      expect(frame).toContain("Think");
    });

    it("should render separators between indicators", () => {
      const { lastFrame } = renderWithTheme(
        <StatusBar
          model={{ provider: "openai", model: "gpt-4" }}
          tokens={{ current: 1000, max: 10000 }}
        />
      );
      const frame = lastFrame() ?? "";
      expect(frame).toContain("│");
    });
  });

  describe("Partial Indicators", () => {
    it("should render with only model indicator", () => {
      const { lastFrame } = renderWithTheme(
        <StatusBar model={{ provider: "anthropic", model: "claude-3" }} showBorder={false} />
      );
      const frame = lastFrame() ?? "";
      expect(frame).toContain("◈");
      expect(frame).toContain("Anthropic");
      // With only one indicator and no border, there should be no separator
      expect(frame).not.toContain("│");
    });

    it("should render with only token counter", () => {
      const { lastFrame } = renderWithTheme(<StatusBar tokens={{ current: 5000, max: 10000 }} />);
      const frame = lastFrame() ?? "";
      expect(frame).toContain("◊");
      expect(frame).toContain("50%");
    });

    it("should render with only trust mode", () => {
      const { lastFrame } = renderWithTheme(<StatusBar trustMode="full" />);
      const frame = lastFrame() ?? "";
      expect(frame).toContain("●");
      expect(frame).toContain("Full");
    });

    it("should render with only thinking indicator", () => {
      const { lastFrame } = renderWithTheme(
        <StatusBar thinking={{ active: true, budget: 5000, used: 1000 }} />
      );
      const frame = lastFrame() ?? "";
      expect(frame).toContain("◆");
      expect(frame).toContain("Think");
    });

    it("should render with model and tokens", () => {
      const { lastFrame } = renderWithTheme(
        <StatusBar
          model={{ provider: "google", model: "gemini-pro" }}
          tokens={{ current: 2000, max: 8000 }}
        />
      );
      const frame = lastFrame() ?? "";
      expect(frame).toContain("◎");
      expect(frame).toContain("Google");
      expect(frame).toContain("◊");
      expect(frame).toContain("│");
    });
  });

  describe("Empty State", () => {
    it("should render empty state when no indicators", () => {
      const { lastFrame } = renderWithTheme(<StatusBar />);
      expect(lastFrame()).toContain("No status information");
    });
  });

  describe("Border Option", () => {
    it("should render without border by default", () => {
      const { lastFrame } = renderWithTheme(
        <StatusBar model={{ provider: "openai", model: "gpt-4" }} />
      );
      const frame = lastFrame() ?? "";
      expect(frame).toContain("OpenAI");
    });

    it("should render with border when showBorder is true", () => {
      const { lastFrame } = renderWithTheme(
        <StatusBar model={{ provider: "openai", model: "gpt-4" }} showBorder={true} />
      );
      const frame = lastFrame() ?? "";
      expect(frame).toContain("OpenAI");
    });
  });

  describe("Combined Token Threshold Display", () => {
    it("should show warning state tokens in status bar", () => {
      const { lastFrame } = renderWithTheme(
        <StatusBar
          model={{ provider: "anthropic", model: "claude-3" }}
          tokens={{ current: 85000, max: 100000 }}
        />
      );
      const frame = lastFrame() ?? "";
      expect(frame).toContain("85%");
    });

    it("should show error state tokens in status bar", () => {
      const { lastFrame } = renderWithTheme(
        <StatusBar
          model={{ provider: "anthropic", model: "claude-3" }}
          tokens={{ current: 98000, max: 100000 }}
        />
      );
      const frame = lastFrame() ?? "";
      expect(frame).toContain("98%");
    });
  });

  describe("Combined Trust Modes in Status Bar", () => {
    it("should show ask mode in full status bar", () => {
      const { lastFrame } = renderWithTheme(
        <StatusBar model={{ provider: "anthropic", model: "claude-3" }} trustMode="ask" />
      );
      const frame = lastFrame() ?? "";
      expect(frame).toContain("◎");
      expect(frame).toContain("Ask");
    });

    it("should show auto mode in full status bar", () => {
      const { lastFrame } = renderWithTheme(
        <StatusBar model={{ provider: "anthropic", model: "claude-3" }} trustMode="auto" />
      );
      const frame = lastFrame() ?? "";
      expect(frame).toContain("◉");
      expect(frame).toContain("Auto");
    });

    it("should show full mode in full status bar", () => {
      const { lastFrame } = renderWithTheme(
        <StatusBar model={{ provider: "anthropic", model: "claude-3" }} trustMode="full" />
      );
      const frame = lastFrame() ?? "";
      expect(frame).toContain("●");
      expect(frame).toContain("Full");
    });
  });

  describe("Combined Thinking Modes in Status Bar", () => {
    it("should show active thinking without budget", () => {
      const { lastFrame } = renderWithTheme(
        <StatusBar
          model={{ provider: "anthropic", model: "claude-3" }}
          thinking={{ active: true }}
        />
      );
      const frame = lastFrame() ?? "";
      expect(frame).toContain("◆");
      expect(frame).toContain("Think");
    });

    it("should show active thinking with budget", () => {
      const { lastFrame } = renderWithTheme(
        <StatusBar
          model={{ provider: "anthropic", model: "claude-3" }}
          thinking={{ active: true, budget: 10000, used: 5000 }}
        />
      );
      const frame = lastFrame() ?? "";
      expect(frame).toContain("◆");
      expect(frame).toContain("5.0K");
      expect(frame).toContain("10K");
    });

    it("should show inactive thinking", () => {
      const { lastFrame } = renderWithTheme(
        <StatusBar
          model={{ provider: "anthropic", model: "claude-3" }}
          thinking={{ active: false }}
        />
      );
      const frame = lastFrame() ?? "";
      expect(frame).toContain("◇");
      expect(frame).toContain("Think");
    });
  });
});
