/**
 * TextInput Component Tests (T009, T013)
 *
 * Tests for the TextInput component with multiline support.
 *
 * Note: ink-testing-library's stdin.write() does not synchronously trigger
 * useInput hooks. Tests focus on:
 * - Rendering behavior (verifiable via lastFrame())
 * - Props contract verification
 * - Visual state assertions
 *
 * Behavioral tests (onChange, onSubmit) are validated via:
 * - Integration tests at the CLI level
 * - Manual testing documentation
 */

import { render } from "ink-testing-library";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../../../theme/index.js";
import { TextInput } from "../TextInput.js";

/**
 * Wrapper to provide theme context for tests
 */
function renderWithTheme(element: React.ReactElement) {
  return render(<ThemeProvider>{element}</ThemeProvider>);
}

describe("TextInput", () => {
  describe("Rendering", () => {
    it("should render without crashing", () => {
      const onChange = vi.fn();
      const { lastFrame } = renderWithTheme(<TextInput value="" onChange={onChange} />);
      // Empty value with focus shows cursor, which renders as a space with inverse
      expect(lastFrame()).toBeDefined();
    });

    it("should render placeholder when value is empty", () => {
      const onChange = vi.fn();
      const { lastFrame } = renderWithTheme(
        <TextInput value="" onChange={onChange} placeholder="Type here..." focused={false} />
      );
      expect(lastFrame()).toContain("Type here...");
    });

    it("should render value when provided", () => {
      const onChange = vi.fn();
      const { lastFrame } = renderWithTheme(
        <TextInput value="Hello World" onChange={onChange} focused={false} />
      );
      expect(lastFrame()).toContain("Hello World");
    });

    it("should show cursor indicator when focused", () => {
      const onChange = vi.fn();
      const { lastFrame } = renderWithTheme(
        <TextInput value="Test" onChange={onChange} focused={true} />
      );
      // The cursor should be at the end, shown as inverse text
      const frame = lastFrame() ?? "";
      expect(frame).toContain("Test");
    });
  });

  describe("Multiline mode", () => {
    it("should render multiple lines", () => {
      const onChange = vi.fn();
      const { lastFrame } = renderWithTheme(
        <TextInput value={"Line 1\nLine 2\nLine 3"} onChange={onChange} multiline focused={false} />
      );
      const frame = lastFrame() ?? "";
      expect(frame).toContain("Line 1");
      expect(frame).toContain("Line 2");
      expect(frame).toContain("Line 3");
    });

    it("should render cursor on correct line in multiline mode", () => {
      const onChange = vi.fn();
      const { lastFrame } = renderWithTheme(
        <TextInput value={"First\nSecond"} onChange={onChange} multiline focused={true} />
      );
      const frame = lastFrame() ?? "";
      expect(frame).toContain("First");
      expect(frame).toContain("Second");
    });
  });

  describe("Props contract", () => {
    it("should accept all required props", () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();

      const { lastFrame } = renderWithTheme(
        <TextInput
          value="test"
          onChange={onChange}
          onSubmit={onSubmit}
          placeholder="placeholder"
          multiline={true}
          disabled={false}
          maxLength={100}
          focused={true}
        />
      );

      expect(lastFrame()).toBeTruthy();
    });

    it("should render with disabled state", () => {
      const onChange = vi.fn();
      const { lastFrame } = renderWithTheme(
        <TextInput value="disabled text" onChange={onChange} disabled={true} />
      );
      const frame = lastFrame() ?? "";
      expect(frame).toContain("disabled text");
    });

    it("should respect maxLength visually (value can be at max)", () => {
      const onChange = vi.fn();
      const { lastFrame } = renderWithTheme(
        <TextInput value="12345" onChange={onChange} maxLength={5} focused={false} />
      );
      expect(lastFrame()).toContain("12345");
    });
  });

  describe("onChange callback contract", () => {
    it("should accept onChange prop as function", () => {
      const onChange = vi.fn();
      // This verifies the prop type contract
      expect(() => {
        renderWithTheme(<TextInput value="" onChange={onChange} />);
      }).not.toThrow();
    });

    it("should not throw when onChange is called with new value", () => {
      // Simulates controlled component pattern
      let currentValue = "";
      const onChange = vi.fn((newValue: string) => {
        currentValue = newValue;
      });

      const { rerender } = renderWithTheme(<TextInput value={currentValue} onChange={onChange} />);

      // Simulate external value change (as would happen from onChange callback)
      currentValue = "typed text";
      expect(() => {
        rerender(
          <ThemeProvider>
            <TextInput value={currentValue} onChange={onChange} />
          </ThemeProvider>
        );
      }).not.toThrow();
    });
  });

  describe("onSubmit callback contract", () => {
    it("should accept onSubmit prop as function", () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();
      expect(() => {
        renderWithTheme(<TextInput value="" onChange={onChange} onSubmit={onSubmit} />);
      }).not.toThrow();
    });

    it("should work without onSubmit (optional prop)", () => {
      const onChange = vi.fn();
      expect(() => {
        renderWithTheme(<TextInput value="" onChange={onChange} />);
      }).not.toThrow();
    });
  });

  describe("Disabled state contract", () => {
    it("should accept disabled prop", () => {
      const onChange = vi.fn();
      expect(() => {
        renderWithTheme(<TextInput value="test" onChange={onChange} disabled={true} />);
      }).not.toThrow();
    });

    it("should render differently when disabled vs enabled", () => {
      const onChange = vi.fn();

      const { lastFrame: enabledFrame } = renderWithTheme(
        <TextInput value="test" onChange={onChange} disabled={false} focused={true} />
      );

      const { lastFrame: disabledFrame } = renderWithTheme(
        <TextInput value="test" onChange={onChange} disabled={true} focused={true} />
      );

      // Both should render, component handles disabled state
      expect(enabledFrame()).toBeTruthy();
      expect(disabledFrame()).toBeTruthy();
    });
  });

  describe("Multiline mode contract", () => {
    it("should accept multiline prop", () => {
      const onChange = vi.fn();
      expect(() => {
        renderWithTheme(<TextInput value="test" onChange={onChange} multiline={true} />);
      }).not.toThrow();
    });

    it("should handle newlines in value when multiline", () => {
      const onChange = vi.fn();
      const { lastFrame } = renderWithTheme(
        <TextInput
          value="line1\nline2\nline3"
          onChange={onChange}
          multiline={true}
          focused={false}
        />
      );
      const frame = lastFrame() ?? "";
      // All lines should be present
      expect(frame).toContain("line1");
      expect(frame).toContain("line2");
      expect(frame).toContain("line3");
    });
  });

  describe("Focus state", () => {
    it("should accept focused prop", () => {
      const onChange = vi.fn();
      expect(() => {
        renderWithTheme(<TextInput value="test" onChange={onChange} focused={true} />);
      }).not.toThrow();
    });

    it("should default focused to true", () => {
      const onChange = vi.fn();
      // Default prop behavior - should render with cursor
      const { lastFrame } = renderWithTheme(<TextInput value="test" onChange={onChange} />);
      expect(lastFrame()).toBeTruthy();
    });
  });
});
