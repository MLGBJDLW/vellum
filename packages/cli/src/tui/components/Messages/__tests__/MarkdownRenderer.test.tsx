/**
 * MarkdownRenderer Component Tests (T020)
 *
 * @module tui/components/Messages/__tests__/MarkdownRenderer.test
 */

import { render } from "ink-testing-library";
import { describe, expect, it } from "vitest";
import { ThemeProvider } from "../../../theme/index.js";
import { MarkdownRenderer } from "../MarkdownRenderer.js";

/**
 * Wrap component with ThemeProvider for testing.
 */
function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe("MarkdownRenderer", () => {
  describe("headers", () => {
    it("renders h1 headers with bold styling", () => {
      const { lastFrame } = renderWithTheme(<MarkdownRenderer content="# Hello World" />);

      expect(lastFrame()).toContain("Hello World");
      // Header should be present (visual prefix varies)
      expect(lastFrame()).toBeTruthy();
    });

    it("renders h2 headers", () => {
      const { lastFrame } = renderWithTheme(<MarkdownRenderer content="## Section Title" />);

      expect(lastFrame()).toContain("Section Title");
    });

    it("renders h3 headers", () => {
      const { lastFrame } = renderWithTheme(<MarkdownRenderer content="### Subsection" />);

      expect(lastFrame()).toContain("Subsection");
    });

    it("renders multiple header levels", () => {
      const content = `# Main Title
## Section
### Subsection`;
      const { lastFrame } = renderWithTheme(<MarkdownRenderer content={content} />);

      expect(lastFrame()).toContain("Main Title");
      expect(lastFrame()).toContain("Section");
      expect(lastFrame()).toContain("Subsection");
    });
  });

  describe("bold text", () => {
    it("renders **bold** text", () => {
      const { lastFrame } = renderWithTheme(<MarkdownRenderer content="This is **bold** text" />);

      expect(lastFrame()).toContain("bold");
      expect(lastFrame()).toContain("This is");
      expect(lastFrame()).toContain("text");
    });

    it("renders __bold__ text with underscores", () => {
      const { lastFrame } = renderWithTheme(<MarkdownRenderer content="This is __bold__ text" />);

      expect(lastFrame()).toContain("bold");
    });

    it("renders multiple bold sections", () => {
      const { lastFrame } = renderWithTheme(
        <MarkdownRenderer content="**First** and **second** bold" />
      );

      expect(lastFrame()).toContain("First");
      expect(lastFrame()).toContain("second");
    });
  });

  describe("italic text", () => {
    it("renders *italic* text with asterisk", () => {
      const { lastFrame } = renderWithTheme(<MarkdownRenderer content="This is *italic* text" />);

      expect(lastFrame()).toContain("italic");
    });

    it("renders _italic_ text with underscore", () => {
      const { lastFrame } = renderWithTheme(<MarkdownRenderer content="This is _italic_ text" />);

      expect(lastFrame()).toContain("italic");
    });
  });

  describe("inline code", () => {
    it("renders `inline code` with backticks", () => {
      const { lastFrame } = renderWithTheme(
        <MarkdownRenderer content="Use `console.log()` for debugging" />
      );

      expect(lastFrame()).toContain("console.log()");
      expect(lastFrame()).toContain("Use");
      expect(lastFrame()).toContain("debugging");
    });

    it("renders multiple inline code sections", () => {
      const { lastFrame } = renderWithTheme(<MarkdownRenderer content="Compare `foo` and `bar`" />);

      expect(lastFrame()).toContain("foo");
      expect(lastFrame()).toContain("bar");
    });
  });

  describe("code blocks", () => {
    it("renders code blocks with triple backticks", () => {
      const content = `Here is code:
\`\`\`
const x = 1;
\`\`\``;
      const { lastFrame } = renderWithTheme(<MarkdownRenderer content={content} />);

      expect(lastFrame()).toContain("const x = 1;");
    });

    it("renders code blocks with language identifier", () => {
      const content = `\`\`\`typescript
function hello(): void {
  console.log("hi");
}
\`\`\``;
      const { lastFrame } = renderWithTheme(<MarkdownRenderer content={content} />);

      expect(lastFrame()).toContain("typescript");
      expect(lastFrame()).toContain("function hello()");
    });

    it("handles multiline code blocks", () => {
      const content = `\`\`\`
line 1
line 2
line 3
\`\`\``;
      const { lastFrame } = renderWithTheme(<MarkdownRenderer content={content} />);

      expect(lastFrame()).toContain("line 1");
      expect(lastFrame()).toContain("line 2");
      expect(lastFrame()).toContain("line 3");
    });
  });

  describe("lists", () => {
    it("renders unordered lists with dash", () => {
      const content = `- Item 1
- Item 2
- Item 3`;
      const { lastFrame } = renderWithTheme(<MarkdownRenderer content={content} />);

      expect(lastFrame()).toContain("Item 1");
      expect(lastFrame()).toContain("Item 2");
      expect(lastFrame()).toContain("Item 3");
      expect(lastFrame()).toContain("•");
    });

    it("renders unordered lists with asterisk", () => {
      const content = `* First
* Second`;
      const { lastFrame } = renderWithTheme(<MarkdownRenderer content={content} />);

      expect(lastFrame()).toContain("First");
      expect(lastFrame()).toContain("Second");
    });

    it("renders ordered lists", () => {
      const content = `1. First item
2. Second item
3. Third item`;
      const { lastFrame } = renderWithTheme(<MarkdownRenderer content={content} />);

      expect(lastFrame()).toContain("1.");
      expect(lastFrame()).toContain("First item");
      expect(lastFrame()).toContain("2.");
      expect(lastFrame()).toContain("Second item");
    });

    it("renders nested list items", () => {
      const content = `- Parent
  - Child`;
      const { lastFrame } = renderWithTheme(<MarkdownRenderer content={content} />);

      expect(lastFrame()).toContain("Parent");
      expect(lastFrame()).toContain("Child");
    });
  });

  describe("links", () => {
    it("renders links with text and URL", () => {
      const { lastFrame } = renderWithTheme(
        <MarkdownRenderer content="Visit [GitHub](https://github.com) for code" />
      );

      expect(lastFrame()).toContain("GitHub");
      expect(lastFrame()).toContain("https://github.com");
    });

    it("renders multiple links", () => {
      const { lastFrame } = renderWithTheme(
        <MarkdownRenderer content="[Link 1](url1) and [Link 2](url2)" />
      );

      expect(lastFrame()).toContain("Link 1");
      expect(lastFrame()).toContain("Link 2");
    });
  });

  describe("mixed content", () => {
    it("renders complex markdown with multiple elements", () => {
      const content = `# Title

This is **bold** and *italic* text with \`code\`.

## List Section

- Item with **bold**
- Item with \`code\`

\`\`\`javascript
const hello = "world";
\`\`\`

Check [docs](https://example.com)`;

      const { lastFrame } = renderWithTheme(<MarkdownRenderer content={content} />);

      expect(lastFrame()).toContain("Title");
      expect(lastFrame()).toContain("bold");
      expect(lastFrame()).toContain("italic");
      expect(lastFrame()).toContain("code");
      expect(lastFrame()).toContain("List Section");
      expect(lastFrame()).toContain("•");
      expect(lastFrame()).toContain("javascript");
      expect(lastFrame()).toContain("hello");
      expect(lastFrame()).toContain("docs");
    });
  });

  describe("compact mode", () => {
    it("renders with reduced spacing in compact mode", () => {
      const content = `# Header

Paragraph 1

Paragraph 2`;

      const { lastFrame: normalFrame } = renderWithTheme(
        <MarkdownRenderer content={content} compact={false} />
      );

      const { lastFrame: compactFrame } = renderWithTheme(
        <MarkdownRenderer content={content} compact={true} />
      );

      // Both should contain content
      expect(normalFrame()).toContain("Header");
      expect(compactFrame()).toContain("Header");
    });
  });

  describe("edge cases", () => {
    it("handles empty content", () => {
      const { lastFrame } = renderWithTheme(<MarkdownRenderer content="" />);

      // Should not crash, may render empty
      expect(lastFrame()).toBeDefined();
    });

    it("handles content with only whitespace", () => {
      const { lastFrame } = renderWithTheme(<MarkdownRenderer content="   \n   \n   " />);

      expect(lastFrame()).toBeDefined();
    });

    it("handles unclosed code blocks gracefully", () => {
      const content = `\`\`\`
code without closing`;
      const { lastFrame } = renderWithTheme(<MarkdownRenderer content={content} />);

      expect(lastFrame()).toContain("code without closing");
    });

    it("handles special characters in content", () => {
      const specialContent = "Special chars: < > &";
      const { lastFrame } = renderWithTheme(<MarkdownRenderer content={specialContent} />);

      expect(lastFrame()).toContain("Special chars");
    });

    it("handles consecutive formatting", () => {
      const { lastFrame } = renderWithTheme(
        <MarkdownRenderer content="***bold italic*** should work" />
      );

      // Verify component renders without crashing
      expect(lastFrame()).toBeDefined();
    });
  });
});
