/**
 * DiffView Component Tests (T022)
 *
 * @module tui/components/Messages/__tests__/DiffView.test
 */

import { render } from "ink-testing-library";
import { describe, expect, it } from "vitest";
import { ThemeProvider } from "../../../theme/index.js";
import { DiffView } from "../DiffView.js";

/**
 * Wrap component with ThemeProvider for testing.
 */
function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

// Sample unified diff for testing
const sampleDiff = `--- a/src/index.ts
+++ b/src/index.ts
@@ -1,5 +1,6 @@
 import { foo } from './foo';
+import { bar } from './bar';
 
 function main() {
-  console.log('hello');
+  console.log('hello world');
 }`;

const simpleAddition = `@@ -1,3 +1,4 @@
 line 1
+new line
 line 2
 line 3`;

const simpleDeletion = `@@ -1,4 +1,3 @@
 line 1
-deleted line
 line 2
 line 3`;

describe("DiffView", () => {
  describe("basic rendering", () => {
    it("renders diff content", () => {
      const { lastFrame } = renderWithTheme(<DiffView diff={sampleDiff} />);

      expect(lastFrame()).toContain("foo");
      expect(lastFrame()).toContain("main");
    });

    it("renders empty diff", () => {
      const { lastFrame } = renderWithTheme(<DiffView diff="" />);

      // Should render borders at minimum
      expect(lastFrame()).toBeTruthy();
    });

    it("renders with borders", () => {
      const { lastFrame } = renderWithTheme(<DiffView diff={sampleDiff} />);

      // Check for box-drawing characters (borders)
      expect(lastFrame()).toMatch(/[─│┌┐└┘┬┴├┤┼╭╮╯╰]/);
    });
  });

  describe("file header", () => {
    it("displays custom fileName when provided", () => {
      const { lastFrame } = renderWithTheme(<DiffView diff={sampleDiff} fileName="src/index.ts" />);

      expect(lastFrame()).toContain("src/index.ts");
    });

    it("shows file icon with fileName", () => {
      const { lastFrame } = renderWithTheme(<DiffView diff={sampleDiff} fileName="test.ts" />);

      expect(lastFrame()).toContain("📄");
    });

    it("hides built-in diff headers when fileName provided", () => {
      const { lastFrame } = renderWithTheme(<DiffView diff={sampleDiff} fileName="custom.ts" />);

      // Should not show the original --- and +++ headers
      expect(lastFrame()).not.toContain("---");
      expect(lastFrame()).not.toContain("+++");
    });
  });

  describe("added lines", () => {
    it("displays + prefix for added lines", () => {
      const { lastFrame } = renderWithTheme(<DiffView diff={simpleAddition} />);

      expect(lastFrame()).toContain("+");
      expect(lastFrame()).toContain("new line");
    });

    it("renders added line content correctly", () => {
      const { lastFrame } = renderWithTheme(<DiffView diff={sampleDiff} />);

      expect(lastFrame()).toContain("bar");
      expect(lastFrame()).toContain("hello world");
    });
  });

  describe("removed lines", () => {
    it("displays - prefix for removed lines", () => {
      const { lastFrame } = renderWithTheme(<DiffView diff={simpleDeletion} />);

      expect(lastFrame()).toContain("-");
      expect(lastFrame()).toContain("deleted line");
    });

    it("renders removed line content correctly", () => {
      const { lastFrame } = renderWithTheme(<DiffView diff={sampleDiff} />);

      // The original line before modification
      expect(lastFrame()).toContain("hello");
    });
  });

  describe("context lines", () => {
    it("renders unchanged context lines", () => {
      const { lastFrame } = renderWithTheme(<DiffView diff={sampleDiff} />);

      expect(lastFrame()).toContain("import { foo }");
      expect(lastFrame()).toContain("function main");
    });
  });

  describe("hunk headers", () => {
    it("renders hunk headers", () => {
      const { lastFrame } = renderWithTheme(<DiffView diff={sampleDiff} />);

      expect(lastFrame()).toContain("@@");
    });
  });

  describe("line numbers", () => {
    it("shows line numbers when enabled", () => {
      const { lastFrame } = renderWithTheme(<DiffView diff={simpleAddition} showLineNumbers />);

      // Should show line numbers
      expect(lastFrame()).toContain("1");
      expect(lastFrame()).toContain("2");
    });

    it("hides line numbers when disabled", () => {
      const { lastFrame } = renderWithTheme(
        <DiffView diff={simpleAddition} showLineNumbers={false} />
      );

      // Line numbers separator pattern should not appear in diff content area
      // Context lines should just have the content
      expect(lastFrame()).toContain("line 1");
    });
  });

  describe("compact mode", () => {
    it("renders in compact mode without errors", () => {
      const { lastFrame } = renderWithTheme(<DiffView diff={sampleDiff} compact />);

      expect(lastFrame()).toContain("foo");
    });

    it("reduces padding in compact mode", () => {
      const normalRender = renderWithTheme(<DiffView diff={sampleDiff} />);
      const compactRender = renderWithTheme(<DiffView diff={sampleDiff} compact />);

      // Both should render successfully
      expect(normalRender.lastFrame()).toBeTruthy();
      expect(compactRender.lastFrame()).toBeTruthy();
    });
  });

  describe("unified diff format parsing", () => {
    it("parses file headers correctly", () => {
      const { lastFrame } = renderWithTheme(<DiffView diff={sampleDiff} />);

      // Without fileName prop, should show the original headers
      expect(lastFrame()).toContain("---");
      expect(lastFrame()).toContain("+++");
    });

    it("handles multiple hunks", () => {
      const multiHunkDiff = `@@ -1,3 +1,4 @@
 first
+added first
 second
@@ -10,3 +11,4 @@
 tenth
+added tenth
 eleventh`;

      const { lastFrame } = renderWithTheme(<DiffView diff={multiHunkDiff} />);

      expect(lastFrame()).toContain("first");
      expect(lastFrame()).toContain("tenth");
      expect(lastFrame()).toContain("added first");
      expect(lastFrame()).toContain("added tenth");
    });

    it("handles diff with only additions", () => {
      const additionsOnly = `@@ -0,0 +1,3 @@
+new file
+line 2
+line 3`;

      const { lastFrame } = renderWithTheme(<DiffView diff={additionsOnly} />);

      expect(lastFrame()).toContain("new file");
      expect(lastFrame()).toContain("line 2");
      expect(lastFrame()).toContain("line 3");
    });

    it("handles diff with only deletions", () => {
      const deletionsOnly = `@@ -1,3 +0,0 @@
-deleted 1
-deleted 2
-deleted 3`;

      const { lastFrame } = renderWithTheme(<DiffView diff={deletionsOnly} />);

      expect(lastFrame()).toContain("deleted 1");
      expect(lastFrame()).toContain("deleted 2");
      expect(lastFrame()).toContain("deleted 3");
    });
  });

  describe("combined props", () => {
    it("works with all props enabled", () => {
      const { lastFrame } = renderWithTheme(
        <DiffView diff={sampleDiff} fileName="src/index.ts" showLineNumbers compact />
      );

      expect(lastFrame()).toContain("src/index.ts");
      expect(lastFrame()).toContain("foo");
    });
  });
});
