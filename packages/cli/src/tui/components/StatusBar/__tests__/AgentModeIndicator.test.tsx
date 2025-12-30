/**
 * AgentModeIndicator Component Tests (T057)
 *
 * Tests for the AgentModeIndicator component:
 * - Agent icons display correctly
 * - Level indicators (L0/L1/L2)
 * - Compact mode
 * - Unknown agent fallback
 *
 * @module tui/components/StatusBar/__tests__/AgentModeIndicator.test
 */

import { render } from "ink-testing-library";
import type React from "react";
import { describe, expect, it } from "vitest";
import { ThemeProvider } from "../../../theme/index.js";
import { AgentModeIndicator } from "../AgentModeIndicator.js";

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
// AgentModeIndicator Tests
// =============================================================================

describe("AgentModeIndicator", () => {
  describe("Agent Icons", () => {
    it("should render orchestrator with theater mask icon", () => {
      const { lastFrame } = renderWithTheme(
        <AgentModeIndicator agentName="orchestrator" level={0} />
      );
      const frame = lastFrame() ?? "";
      expect(frame).toContain("🎭");
      expect(frame).toContain("Orchestrator");
      expect(frame).toContain("[L0]");
    });

    it("should render coder with keyboard icon", () => {
      const { lastFrame } = renderWithTheme(<AgentModeIndicator agentName="coder" level={2} />);
      const frame = lastFrame() ?? "";
      expect(frame).toContain("⌨️");
      expect(frame).toContain("Coder");
      expect(frame).toContain("[L2]");
    });

    it("should render qa with test tube icon", () => {
      const { lastFrame } = renderWithTheme(<AgentModeIndicator agentName="qa" level={2} />);
      const frame = lastFrame() ?? "";
      expect(frame).toContain("🧪");
      expect(frame).toContain("QA");
      expect(frame).toContain("[L2]");
    });

    it("should render writer with writing hand icon", () => {
      const { lastFrame } = renderWithTheme(<AgentModeIndicator agentName="writer" level={2} />);
      const frame = lastFrame() ?? "";
      expect(frame).toContain("✍️");
      expect(frame).toContain("Writer");
    });

    it("should render analyst with magnifying glass icon", () => {
      const { lastFrame } = renderWithTheme(<AgentModeIndicator agentName="analyst" level={2} />);
      const frame = lastFrame() ?? "";
      expect(frame).toContain("🔍");
      expect(frame).toContain("Analyst");
    });

    it("should render unknown agent with robot icon", () => {
      const { lastFrame } = renderWithTheme(
        <AgentModeIndicator agentName="custom-agent" level={2} />
      );
      const frame = lastFrame() ?? "";
      expect(frame).toContain("🤖");
      expect(frame).toContain("Custom-agent");
    });
  });

  describe("Level Indicators", () => {
    it("should display L0 for orchestrator level", () => {
      const { lastFrame } = renderWithTheme(
        <AgentModeIndicator agentName="orchestrator" level={0} />
      );
      const frame = lastFrame() ?? "";
      expect(frame).toContain("[L0]");
    });

    it("should display L1 for sub-orchestrator level", () => {
      const { lastFrame } = renderWithTheme(<AgentModeIndicator agentName="spec" level={1} />);
      const frame = lastFrame() ?? "";
      expect(frame).toContain("[L1]");
      expect(frame).toContain("📖");
      expect(frame).toContain("Spec");
    });

    it("should display L2 for worker level", () => {
      const { lastFrame } = renderWithTheme(<AgentModeIndicator agentName="coder" level={2} />);
      const frame = lastFrame() ?? "";
      expect(frame).toContain("[L2]");
    });

    it("should default to L2 when level not provided", () => {
      const { lastFrame } = renderWithTheme(<AgentModeIndicator agentName="qa" />);
      const frame = lastFrame() ?? "";
      expect(frame).toContain("[L2]");
    });
  });

  describe("Compact Mode", () => {
    it("should show only icon and level in compact mode", () => {
      const { lastFrame } = renderWithTheme(
        <AgentModeIndicator agentName="coder" level={2} compact />
      );
      const frame = lastFrame() ?? "";
      expect(frame).toContain("⌨️");
      expect(frame).toContain("L2");
      expect(frame).not.toContain("Coder");
      expect(frame).not.toContain("[");
    });

    it("should show full info when compact is false", () => {
      const { lastFrame } = renderWithTheme(
        <AgentModeIndicator agentName="orchestrator" level={0} compact={false} />
      );
      const frame = lastFrame() ?? "";
      expect(frame).toContain("🎭");
      expect(frame).toContain("Orchestrator");
      expect(frame).toContain("[L0]");
    });
  });

  describe("All Agent Types", () => {
    const agentTests: Array<{ name: string; icon: string; display: string }> = [
      { name: "orchestrator", icon: "🎭", display: "Orchestrator" },
      { name: "coder", icon: "⌨️", display: "Coder" },
      { name: "qa", icon: "🧪", display: "QA" },
      { name: "writer", icon: "✍️", display: "Writer" },
      { name: "analyst", icon: "🔍", display: "Analyst" },
      { name: "devops", icon: "🔧", display: "DevOps" },
      { name: "security", icon: "🔒", display: "Security" },
      { name: "architect", icon: "📐", display: "Architect" },
      { name: "researcher", icon: "📚", display: "Researcher" },
      { name: "requirements", icon: "📋", display: "Requirements" },
      { name: "tasks", icon: "📝", display: "Tasks" },
      { name: "validator", icon: "✅", display: "Validator" },
      { name: "init", icon: "🚀", display: "Init" },
      { name: "spec", icon: "📖", display: "Spec" },
      { name: "implement", icon: "⚙️", display: "Implement" },
      { name: "archive", icon: "📦", display: "Archive" },
    ];

    for (const { name, icon, display } of agentTests) {
      it(`should render ${name} agent correctly`, () => {
        const { lastFrame } = renderWithTheme(<AgentModeIndicator agentName={name} level={2} />);
        const frame = lastFrame() ?? "";
        expect(frame).toContain(icon);
        expect(frame).toContain(display);
      });
    }
  });

  describe("Case Insensitivity", () => {
    it("should handle uppercase agent names", () => {
      const { lastFrame } = renderWithTheme(<AgentModeIndicator agentName="CODER" level={2} />);
      const frame = lastFrame() ?? "";
      expect(frame).toContain("⌨️");
      expect(frame).toContain("Coder");
    });

    it("should handle mixed case agent names", () => {
      const { lastFrame } = renderWithTheme(
        <AgentModeIndicator agentName="Orchestrator" level={0} />
      );
      const frame = lastFrame() ?? "";
      expect(frame).toContain("🎭");
      expect(frame).toContain("Orchestrator");
    });
  });
});
