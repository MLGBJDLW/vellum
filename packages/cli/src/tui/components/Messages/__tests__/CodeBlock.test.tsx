/**
 * CodeBlock Component Tests (T021)
 *
 * @module tui/components/Messages/__tests__/CodeBlock.test
 */

import { render } from "ink-testing-library";
import { describe, expect, it } from "vitest";
import { ThemeProvider } from "../../../theme/index.js";
import { CodeBlock } from "../CodeBlock.js";

/**
 * Wrap component with ThemeProvider for testing.
 */
function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe("CodeBlock", () => {
  describe("basic rendering", () => {
    it("renders code content", () => {
      const { lastFrame } = renderWithTheme(<CodeBlock code="const x = 1;" />);

      expect(lastFrame()).toContain("const x = 1;");
    });

    it("renders multi-line code", () => {
      const code = `function hello() {
  return "world";
}`;
      const { lastFrame } = renderWithTheme(<CodeBlock code={code} />);

      expect(lastFrame()).toContain("function hello()");
      expect(lastFrame()).toContain("return");
      expect(lastFrame()).toContain("world");
    });

    it("renders empty code block", () => {
      const { lastFrame } = renderWithTheme(<CodeBlock code="" />);

      // Should render borders at minimum
      expect(lastFrame()).toBeTruthy();
    });

    it("renders with borders", () => {
      const { lastFrame } = renderWithTheme(<CodeBlock code="test" />);

      // Check for box-drawing characters (borders)
      expect(lastFrame()).toMatch(/[─│┌┐└┘┬┴├┤┼╭╮╯╰]/);
    });
  });

  describe("language header", () => {
    it("displays language label when provided", () => {
      const { lastFrame } = renderWithTheme(
        <CodeBlock code="const x = 1;" language="typescript" />
      );

      expect(lastFrame()).toContain("typescript");
    });

    it("does not display language label when not provided", () => {
      const { lastFrame } = renderWithTheme(<CodeBlock code="const x = 1;" />);

      // Should not have a header row for language
      expect(lastFrame()).not.toContain("javascript");
      expect(lastFrame()).not.toContain("typescript");
    });
  });

  describe("line numbers", () => {
    it("shows line numbers when enabled", () => {
      const code = `line 1
line 2
line 3`;
      const { lastFrame } = renderWithTheme(<CodeBlock code={code} showLineNumbers />);

      expect(lastFrame()).toContain("1");
      expect(lastFrame()).toContain("2");
      expect(lastFrame()).toContain("3");
    });

    it("hides line numbers when disabled", () => {
      const { lastFrame } = renderWithTheme(
        <CodeBlock code="single line" showLineNumbers={false} />
      );

      // The line number with separator should not be present
      // (only box border │ should exist, not "1│" line number separator)
      expect(lastFrame()).not.toMatch(/\d│/);
    });

    it("pads line numbers correctly for many lines", () => {
      const lines = Array.from({ length: 15 }, (_, i) => `line ${i + 1}`).join("\n");
      const { lastFrame } = renderWithTheme(<CodeBlock code={lines} showLineNumbers />);

      // Should have proper padding for double-digit line numbers
      expect(lastFrame()).toContain("line 1");
      expect(lastFrame()).toContain("15");
    });
  });

  describe("syntax highlighting", () => {
    it("highlights JavaScript keywords", () => {
      const code = "const value = function() { return true; }";
      const { lastFrame } = renderWithTheme(<CodeBlock code={code} language="javascript" />);

      expect(lastFrame()).toContain("const");
      expect(lastFrame()).toContain("function");
      expect(lastFrame()).toContain("return");
      expect(lastFrame()).toContain("true");
    });

    it("highlights TypeScript keywords", () => {
      const code = "interface User { readonly name: string; }";
      const { lastFrame } = renderWithTheme(<CodeBlock code={code} language="typescript" />);

      expect(lastFrame()).toContain("interface");
      expect(lastFrame()).toContain("readonly");
      expect(lastFrame()).toContain("string");
    });

    it("highlights Python keywords", () => {
      const code = "def hello():\n    return None";
      const { lastFrame } = renderWithTheme(<CodeBlock code={code} language="python" />);

      expect(lastFrame()).toContain("def");
      expect(lastFrame()).toContain("return");
      expect(lastFrame()).toContain("None");
    });

    it("highlights bash keywords", () => {
      const code = "if [ -f file ]; then\n  echo 'found'\nfi";
      const { lastFrame } = renderWithTheme(<CodeBlock code={code} language="bash" />);

      expect(lastFrame()).toContain("if");
      expect(lastFrame()).toContain("then");
      expect(lastFrame()).toContain("fi");
    });

    it("highlights strings in quotes", () => {
      const code = 'const msg = "hello world";';
      const { lastFrame } = renderWithTheme(<CodeBlock code={code} language="javascript" />);

      expect(lastFrame()).toContain("hello world");
    });

    it("highlights comments", () => {
      const code = "// This is a comment\nconst x = 1;";
      const { lastFrame } = renderWithTheme(<CodeBlock code={code} language="javascript" />);

      expect(lastFrame()).toContain("This is a comment");
    });

    it("handles language aliases (js -> javascript)", () => {
      const code = "const x = 1;";
      const { lastFrame } = renderWithTheme(<CodeBlock code={code} language="js" />);

      expect(lastFrame()).toContain("const");
    });

    it("handles language aliases (ts -> typescript)", () => {
      const code = "const x: number = 1;";
      const { lastFrame } = renderWithTheme(<CodeBlock code={code} language="ts" />);

      expect(lastFrame()).toContain("number");
    });

    it("falls back to plain text for unknown languages", () => {
      const code = "some code here";
      const { lastFrame } = renderWithTheme(<CodeBlock code={code} language="unknownlang" />);

      expect(lastFrame()).toContain("some code here");
    });
  });

  describe("line highlighting", () => {
    it("highlights specified lines", () => {
      const code = `line 1
line 2
line 3`;
      const { lastFrame } = renderWithTheme(<CodeBlock code={code} highlight={[2]} />);

      // Should contain highlight indicator
      expect(lastFrame()).toContain("▶");
    });

    it("highlights multiple lines", () => {
      const code = `line 1
line 2
line 3
line 4`;
      const { lastFrame } = renderWithTheme(<CodeBlock code={code} highlight={[1, 3]} />);

      // Multiple lines should be highlighted
      const output = lastFrame() ?? "";
      const arrowCount = (output.match(/▶/g) ?? []).length;
      expect(arrowCount).toBe(2);
    });

    it("ignores invalid line numbers", () => {
      const code = "single line";
      const { lastFrame } = renderWithTheme(<CodeBlock code={code} highlight={[5, 10]} />);

      // Should render without error
      expect(lastFrame()).toContain("single line");
    });
  });

  describe("copy button", () => {
    it("shows copy button when enabled", () => {
      const { lastFrame } = renderWithTheme(<CodeBlock code="test" showCopyButton />);

      expect(lastFrame()).toContain("[Copy]");
    });

    it("hides copy button when disabled", () => {
      const { lastFrame } = renderWithTheme(<CodeBlock code="test" showCopyButton={false} />);

      expect(lastFrame()).not.toContain("[Copy]");
    });
  });

  describe("maxHeight", () => {
    it("truncates code when exceeding maxHeight", () => {
      const code = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join("\n");
      const { lastFrame } = renderWithTheme(<CodeBlock code={code} maxHeight={5} />);

      expect(lastFrame()).toContain("more lines");
    });

    it("shows all lines when within maxHeight", () => {
      const code = `line 1
line 2
line 3`;
      const { lastFrame } = renderWithTheme(<CodeBlock code={code} maxHeight={10} />);

      expect(lastFrame()).not.toContain("more lines");
    });

    it("displays correct count of hidden lines", () => {
      const code = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join("\n");
      const { lastFrame } = renderWithTheme(<CodeBlock code={code} maxHeight={5} />);

      expect(lastFrame()).toContain("15 more lines");
    });
  });

  describe("JSON highlighting", () => {
    it("highlights JSON values", () => {
      const code = '{"name": "test", "count": 42, "active": true}';
      const { lastFrame } = renderWithTheme(<CodeBlock code={code} language="json" />);

      expect(lastFrame()).toContain("name");
      expect(lastFrame()).toContain("test");
      expect(lastFrame()).toContain("42");
      expect(lastFrame()).toContain("true");
    });

    it("highlights null in JSON", () => {
      const code = '{"value": null}';
      const { lastFrame } = renderWithTheme(<CodeBlock code={code} language="json" />);

      expect(lastFrame()).toContain("null");
    });
  });

  describe("combined features", () => {
    it("renders with all features enabled", () => {
      const code = `function example() {
  // A comment
  const message = "hello";
  return message;
}`;
      const { lastFrame } = renderWithTheme(
        <CodeBlock
          code={code}
          language="typescript"
          showLineNumbers
          showCopyButton
          highlight={[3]}
          maxHeight={10}
        />
      );

      expect(lastFrame()).toContain("typescript");
      expect(lastFrame()).toContain("[Copy]");
      expect(lastFrame()).toContain("▶");
      expect(lastFrame()).toContain("1");
      expect(lastFrame()).toContain("function");
    });
  });
});
