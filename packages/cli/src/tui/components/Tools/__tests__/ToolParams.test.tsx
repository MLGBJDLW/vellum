/**
 * ToolParams Component Tests
 *
 * Tests for the ToolParams component which renders tool parameters
 * as a formatted JSON tree with type-specific styling.
 *
 * @module tui/components/Tools/__tests__/ToolParams.test
 */

import { render } from "ink-testing-library";
import type React from "react";
import { describe, expect, it } from "vitest";
import { ThemeProvider } from "../../../theme/index.js";
import { ToolParams } from "../ToolParams.js";

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Wrap component with ThemeProvider for testing.
 */
function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

// =============================================================================
// Tests
// =============================================================================

describe("ToolParams", () => {
  describe("basic rendering", () => {
    it("renders empty object", () => {
      const { lastFrame } = renderWithTheme(<ToolParams params={{}} />);

      expect(lastFrame()).toContain("{}");
    });

    it("renders simple key-value pair", () => {
      const { lastFrame } = renderWithTheme(<ToolParams params={{ name: "test" }} />);

      expect(lastFrame()).toContain("name");
      expect(lastFrame()).toContain('"test"');
    });

    it("renders multiple key-value pairs", () => {
      const { lastFrame } = renderWithTheme(<ToolParams params={{ name: "test", count: 42 }} />);

      expect(lastFrame()).toContain("name");
      expect(lastFrame()).toContain("count");
      expect(lastFrame()).toContain('"test"');
      expect(lastFrame()).toContain("42");
    });
  });

  describe("type-specific rendering", () => {
    it("renders string values with quotes", () => {
      const { lastFrame } = renderWithTheme(<ToolParams params={{ text: "hello world" }} />);

      expect(lastFrame()).toContain('"hello world"');
    });

    it("renders number values", () => {
      const { lastFrame } = renderWithTheme(<ToolParams params={{ integer: 42, decimal: 3.14 }} />);

      expect(lastFrame()).toContain("42");
      expect(lastFrame()).toContain("3.14");
    });

    it("renders boolean true", () => {
      const { lastFrame } = renderWithTheme(<ToolParams params={{ enabled: true }} />);

      expect(lastFrame()).toContain("true");
    });

    it("renders boolean false", () => {
      const { lastFrame } = renderWithTheme(<ToolParams params={{ enabled: false }} />);

      expect(lastFrame()).toContain("false");
    });

    it("renders null values", () => {
      const { lastFrame } = renderWithTheme(<ToolParams params={{ empty: null }} />);

      expect(lastFrame()).toContain("null");
    });

    it("renders undefined values", () => {
      const { lastFrame } = renderWithTheme(<ToolParams params={{ missing: undefined }} />);

      expect(lastFrame()).toContain("undefined");
    });
  });

  describe("nested structures", () => {
    it("renders nested objects", () => {
      const { lastFrame } = renderWithTheme(
        <ToolParams
          params={{
            config: {
              name: "test",
              value: 123,
            },
          }}
        />
      );

      const frame = lastFrame();
      expect(frame).toContain("config");
      expect(frame).toContain("name");
      expect(frame).toContain('"test"');
      expect(frame).toContain("value");
      expect(frame).toContain("123");
    });

    it("renders arrays", () => {
      const { lastFrame } = renderWithTheme(<ToolParams params={{ items: ["a", "b", "c"] }} />);

      const frame = lastFrame();
      expect(frame).toContain("items");
      expect(frame).toContain("[");
      expect(frame).toContain('"a"');
      expect(frame).toContain('"b"');
      expect(frame).toContain('"c"');
      expect(frame).toContain("]");
    });

    it("renders empty arrays", () => {
      const { lastFrame } = renderWithTheme(<ToolParams params={{ empty: [] }} />);

      expect(lastFrame()).toContain("[]");
    });

    it("renders deeply nested structures", () => {
      const { lastFrame } = renderWithTheme(
        <ToolParams
          params={{
            level1: {
              level2: {
                level3: {
                  value: "deep",
                },
              },
            },
          }}
        />
      );

      const frame = lastFrame();
      expect(frame).toContain("level1");
      expect(frame).toContain("level2");
      expect(frame).toContain("level3");
      expect(frame).toContain('"deep"');
    });

    it("renders arrays of objects", () => {
      const { lastFrame } = renderWithTheme(
        <ToolParams
          params={{
            users: [{ name: "Alice" }, { name: "Bob" }],
          }}
        />
      );

      const frame = lastFrame();
      expect(frame).toContain("users");
      expect(frame).toContain('"Alice"');
      expect(frame).toContain('"Bob"');
    });
  });

  describe("collapsed mode", () => {
    it("shows collapsed view with key preview", () => {
      const { lastFrame } = renderWithTheme(
        <ToolParams params={{ name: "test", count: 42 }} collapsed />
      );

      const frame = lastFrame();
      expect(frame).toContain("{");
      expect(frame).toContain("name");
      expect(frame).toContain("count");
      expect(frame).toContain("}");
      // Should not show full values
      expect(frame).not.toContain('"test"');
    });

    it("shows empty object indicator when collapsed", () => {
      const { lastFrame } = renderWithTheme(<ToolParams params={{}} collapsed />);

      expect(lastFrame()).toContain("{}");
    });

    it("shows more indicator when many keys", () => {
      const { lastFrame } = renderWithTheme(
        <ToolParams params={{ a: 1, b: 2, c: 3, d: 4, e: 5 }} collapsed />
      );

      const frame = lastFrame();
      // Should show first 3 keys and "+2"
      expect(frame).toContain("a");
      expect(frame).toContain("b");
      expect(frame).toContain("c");
      expect(frame).toContain("+2");
    });
  });

  describe("maxDepth", () => {
    it("respects maxDepth for objects", () => {
      const { lastFrame } = renderWithTheme(
        <ToolParams
          params={{
            level1: {
              level2: {
                level3: "deep",
              },
            },
          }}
          maxDepth={2}
        />
      );

      const frame = lastFrame();
      expect(frame).toContain("level1");
      expect(frame).toContain("level2");
      // Level 3 should be collapsed
      expect(frame).toContain("...");
    });

    it("respects maxDepth for arrays", () => {
      const { lastFrame } = renderWithTheme(
        <ToolParams
          params={{
            outer: {
              inner: [1, 2, 3],
            },
          }}
          maxDepth={2}
        />
      );

      const frame = lastFrame();
      expect(frame).toContain("outer");
      expect(frame).toContain("inner");
      // Array should show item count
      expect(frame).toContain("items");
    });
  });

  describe("path highlighting", () => {
    it("highlights Unix-style file paths", () => {
      const { lastFrame } = renderWithTheme(
        <ToolParams params={{ filePath: "/src/index.ts" }} highlightPaths />
      );

      const frame = lastFrame();
      expect(frame).toContain("/src/index.ts");
    });

    it("highlights relative file paths", () => {
      const { lastFrame } = renderWithTheme(
        <ToolParams params={{ path: "./components/Button.tsx" }} highlightPaths />
      );

      const frame = lastFrame();
      expect(frame).toContain("./components/Button.tsx");
    });

    it("highlights paths with common extensions", () => {
      const { lastFrame } = renderWithTheme(
        <ToolParams params={{ file: "config.json" }} highlightPaths />
      );

      expect(lastFrame()).toContain("config.json");
    });

    it("does not highlight paths when highlightPaths is false", () => {
      const { lastFrame } = renderWithTheme(
        <ToolParams params={{ filePath: "/src/index.ts" }} highlightPaths={false} />
      );

      expect(lastFrame()).toContain('"/src/index.ts"');
    });
  });

  describe("command highlighting", () => {
    it("highlights command key values", () => {
      const { lastFrame } = renderWithTheme(
        <ToolParams params={{ command: "npm test" }} highlightCommands />
      );

      const frame = lastFrame();
      expect(frame).toContain("command");
      expect(frame).toContain("npm test");
    });

    it("highlights cmd key values", () => {
      const { lastFrame } = renderWithTheme(
        <ToolParams params={{ cmd: "git status" }} highlightCommands />
      );

      const frame = lastFrame();
      expect(frame).toContain("cmd");
      expect(frame).toContain("git status");
    });

    it("highlights shell key values", () => {
      const { lastFrame } = renderWithTheme(
        <ToolParams params={{ shell: "echo hello" }} highlightCommands />
      );

      const frame = lastFrame();
      expect(frame).toContain("shell");
      expect(frame).toContain("echo hello");
    });

    it("does not highlight non-command keys", () => {
      const { lastFrame } = renderWithTheme(
        <ToolParams params={{ name: "npm test" }} highlightCommands />
      );

      expect(lastFrame()).toContain('"npm test"');
    });

    it("does not highlight commands when highlightCommands is false", () => {
      const { lastFrame } = renderWithTheme(
        <ToolParams params={{ command: "npm test" }} highlightCommands={false} />
      );

      expect(lastFrame()).toContain('"npm test"');
    });
  });

  describe("combined options", () => {
    it("handles both path and command highlighting", () => {
      const { lastFrame } = renderWithTheme(
        <ToolParams
          params={{
            filePath: "/src/index.ts",
            command: "npm test",
          }}
          highlightPaths
          highlightCommands
        />
      );

      const frame = lastFrame();
      expect(frame).toContain("/src/index.ts");
      expect(frame).toContain("npm test");
    });

    it("renders complex real-world params", () => {
      const { lastFrame } = renderWithTheme(
        <ToolParams
          params={{
            tool: "read_file",
            args: {
              filePath: "/src/utils/helpers.ts",
              startLine: 1,
              endLine: 100,
            },
            options: {
              encoding: "utf-8",
              cache: true,
            },
          }}
          highlightPaths
        />
      );

      const frame = lastFrame();
      expect(frame).toContain("tool");
      expect(frame).toContain('"read_file"');
      expect(frame).toContain("filePath");
      expect(frame).toContain("/src/utils/helpers.ts");
      expect(frame).toContain("startLine");
      expect(frame).toContain("1");
      expect(frame).toContain("endLine");
      expect(frame).toContain("100");
      expect(frame).toContain("encoding");
      expect(frame).toContain("cache");
      expect(frame).toContain("true");
    });
  });

  describe("edge cases", () => {
    it("handles mixed types in arrays", () => {
      const { lastFrame } = renderWithTheme(
        <ToolParams
          params={{
            mixed: ["string", 42, true, null],
          }}
        />
      );

      const frame = lastFrame();
      expect(frame).toContain('"string"');
      expect(frame).toContain("42");
      expect(frame).toContain("true");
      expect(frame).toContain("null");
    });

    it("handles special characters in strings", () => {
      const { lastFrame } = renderWithTheme(
        <ToolParams
          params={{
            special: "hello\nworld",
          }}
        />
      );

      expect(lastFrame()).toContain("special");
    });

    it("handles empty strings", () => {
      const { lastFrame } = renderWithTheme(<ToolParams params={{ empty: "" }} />);

      expect(lastFrame()).toContain('""');
    });

    it("handles zero values", () => {
      const { lastFrame } = renderWithTheme(<ToolParams params={{ zero: 0 }} />);

      expect(lastFrame()).toContain("0");
    });

    it("handles negative numbers", () => {
      const { lastFrame } = renderWithTheme(<ToolParams params={{ negative: -42 }} />);

      expect(lastFrame()).toContain("-42");
    });
  });
});
