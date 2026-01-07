// ============================================
// Agents Parser Tests
// ============================================
// Unit tests for AGENTS.md parser functionality.
// Covers T022, T023, T024.

import { describe, expect, it } from "vitest";
import {
  AgentsParser,
  findSection,
  getSectionContent,
  type MarkdownSection,
  parseAllowedToolsFromFrontmatter,
  parsePermissions,
  parseSections,
  parseToolEntry,
} from "../parser.js";

// ============================================
// T022: Section Parsing Tests
// ============================================

describe("parseSections", () => {
  it("should parse empty content", () => {
    const result = parseSections("");
    expect(result.sections).toEqual([]);
    expect(result.raw).toBe("");
  });

  it("should parse content without headers", () => {
    const content = "Just some text\nMore text";
    const result = parseSections(content);
    expect(result.sections).toEqual([]);
    expect(result.raw).toBe(content);
  });

  it("should parse a single h1 section", () => {
    const content = "# Instructions\nFollow these rules.";
    const result = parseSections(content);

    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]).toEqual({
      level: 1,
      title: "Instructions",
      content: "Follow these rules.",
      children: [],
    });
  });

  it("should parse multiple h1 sections", () => {
    const content = `# Instructions
Follow these rules.

# Context
Project context here.`;

    const result = parseSections(content);

    expect(result.sections).toHaveLength(2);
    expect(result.sections[0]?.title).toBe("Instructions");
    expect(result.sections[1]?.title).toBe("Context");
  });

  it("should parse nested sections", () => {
    const content = `# Instructions
Main content.

## Sub-section
Sub content here.

### Deep section
Even deeper.`;

    const result = parseSections(content);

    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]?.title).toBe("Instructions");
    expect(result.sections[0]?.children).toHaveLength(1);
    expect(result.sections[0]?.children[0]?.title).toBe("Sub-section");
    expect(result.sections[0]?.children[0]?.children).toHaveLength(1);
    expect(result.sections[0]?.children[0]?.children[0]?.title).toBe("Deep section");
  });

  it("should handle h2 without parent h1", () => {
    const content = `## Standalone Section
Some content.`;

    const result = parseSections(content);

    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]?.level).toBe(2);
    expect(result.sections[0]?.title).toBe("Standalone Section");
  });

  it("should preserve content including blank lines", () => {
    const content = `# Section
Line 1

Line 3`;

    const result = parseSections(content);

    expect(result.sections[0]?.content).toBe("Line 1\n\nLine 3");
  });

  it("should handle all heading levels h1-h6", () => {
    const content = `# H1
## H2
### H3
#### H4
##### H5
###### H6`;

    const result = parseSections(content);

    expect(result.sections).toHaveLength(1);
    const h1 = result.sections[0];
    if (!h1) throw new Error("Test setup error");
    expect(h1.level).toBe(1);
    expect(h1.children[0]?.level).toBe(2);
    expect(h1.children[0]?.children[0]?.level).toBe(3);
  });
});

describe("findSection", () => {
  const sections: MarkdownSection[] = [
    {
      level: 1,
      title: "Instructions",
      content: "Main content",
      children: [
        {
          level: 2,
          title: "Sub-section",
          content: "Sub content",
          children: [],
        },
      ],
    },
    {
      level: 1,
      title: "Allowed Tools",
      content: "- read_file",
      children: [],
    },
  ];

  it("should find top-level section by title", () => {
    const found = findSection(sections, "Instructions");
    expect(found).toBeDefined();
    expect(found?.title).toBe("Instructions");
  });

  it("should find nested section", () => {
    const found = findSection(sections, "Sub-section");
    expect(found).toBeDefined();
    expect(found?.title).toBe("Sub-section");
  });

  it("should be case-insensitive", () => {
    const found = findSection(sections, "INSTRUCTIONS");
    expect(found).toBeDefined();
    expect(found?.title).toBe("Instructions");
  });

  it("should return null for non-existent section", () => {
    const found = findSection(sections, "Non-existent");
    expect(found).toBeNull();
  });
});

describe("getSectionContent", () => {
  it("should return section content", () => {
    const section: MarkdownSection = {
      level: 1,
      title: "Test",
      content: "Main content",
      children: [],
    };

    expect(getSectionContent(section)).toBe("Main content");
  });

  it("should include children content with headers", () => {
    const section: MarkdownSection = {
      level: 1,
      title: "Parent",
      content: "Parent content",
      children: [
        {
          level: 2,
          title: "Child",
          content: "Child content",
          children: [],
        },
      ],
    };

    const result = getSectionContent(section);
    expect(result).toContain("Parent content");
    expect(result).toContain("## Child");
    expect(result).toContain("Child content");
  });
});

// ============================================
// T023: Permission Parsing Tests
// ============================================

describe("parseToolEntry", () => {
  it("should parse simple tool name", () => {
    const result = parseToolEntry("read_file");
    expect(result).toEqual({
      pattern: "read_file",
      negated: false,
    });
  });

  it("should parse negated tool", () => {
    const result = parseToolEntry("!edit_file");
    expect(result).toEqual({
      pattern: "edit_file",
      negated: true,
    });
  });

  it("should parse group reference", () => {
    const result = parseToolEntry("@readonly");
    expect(result).toEqual({
      pattern: "@readonly",
      negated: false,
    });
  });

  it("should parse negated group", () => {
    const result = parseToolEntry("!@edit");
    expect(result).toEqual({
      pattern: "@edit",
      negated: true,
    });
  });

  it("should parse tool with single arg", () => {
    const result = parseToolEntry("bash(--safe)");
    expect(result).toEqual({
      pattern: "bash",
      negated: false,
      args: ["--safe"],
    });
  });

  it("should parse tool with multiple args", () => {
    const result = parseToolEntry("bash(--safe, --no-sudo)");
    expect(result).toEqual({
      pattern: "bash",
      negated: false,
      args: ["--safe", "--no-sudo"],
    });
  });

  it("should parse glob pattern", () => {
    const result = parseToolEntry("*_file");
    expect(result).toEqual({
      pattern: "*_file",
      negated: false,
    });
  });

  it("should parse complex glob pattern", () => {
    const result = parseToolEntry("read_*");
    expect(result).toEqual({
      pattern: "read_*",
      negated: false,
    });
  });

  it("should return null for invalid entry", () => {
    const result = parseToolEntry("invalid entry with spaces");
    expect(result).toBeNull();
  });

  it("should handle question mark glob", () => {
    const result = parseToolEntry("read_fil?");
    expect(result).toEqual({
      pattern: "read_fil?",
      negated: false,
    });
  });
});

describe("parsePermissions", () => {
  it("should parse list items", () => {
    const section = `- read_file
- !edit_file
- @readonly`;

    const result = parsePermissions(section);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ pattern: "read_file", negated: false });
    expect(result[1]).toEqual({ pattern: "edit_file", negated: true });
    expect(result[2]).toEqual({ pattern: "@readonly", negated: false });
  });

  it("should handle asterisk bullets", () => {
    const section = `* read_file
* write_file`;

    const result = parsePermissions(section);

    expect(result).toHaveLength(2);
    expect(result[0]?.pattern).toBe("read_file");
    expect(result[1]?.pattern).toBe("write_file");
  });

  it("should ignore non-list content", () => {
    const section = `Some text
- valid_tool
More text
- another_tool`;

    const result = parsePermissions(section);

    expect(result).toHaveLength(2);
  });

  it("should skip invalid entries", () => {
    const section = `- valid_tool
- invalid entry with spaces
- another_valid`;

    const result = parsePermissions(section);

    expect(result).toHaveLength(2);
  });

  it("should handle indented list items", () => {
    const section = `  - read_file
    - write_file`;

    const result = parsePermissions(section);

    expect(result).toHaveLength(2);
  });
});

describe("parseAllowedToolsFromFrontmatter", () => {
  it("should return empty array for undefined", () => {
    const result = parseAllowedToolsFromFrontmatter(undefined);
    expect(result).toEqual([]);
  });

  it("should return empty array for empty array", () => {
    const result = parseAllowedToolsFromFrontmatter([]);
    expect(result).toEqual([]);
  });

  it("should parse array of tool strings", () => {
    const result = parseAllowedToolsFromFrontmatter([
      "read_file",
      "!edit_file",
      "@readonly",
      "bash(--safe)",
    ]);

    expect(result).toHaveLength(4);
    expect(result[0]).toEqual({ pattern: "read_file", negated: false });
    expect(result[1]).toEqual({ pattern: "edit_file", negated: true });
    expect(result[2]).toEqual({ pattern: "@readonly", negated: false });
    expect(result[3]).toEqual({ pattern: "bash", negated: false, args: ["--safe"] });
  });

  it("should trim whitespace from entries", () => {
    const result = parseAllowedToolsFromFrontmatter(["  read_file  ", " write_file"]);

    expect(result).toHaveLength(2);
    expect(result[0]?.pattern).toBe("read_file");
    expect(result[1]?.pattern).toBe("write_file");
  });
});

// ============================================
// T024: AgentsParser Integration Tests
// ============================================

describe("AgentsParser", () => {
  describe("parseSync", () => {
    it("should parse content with frontmatter and sections", () => {
      const parser = new AgentsParser({ resolveImports: false });

      const content = `---
version: "1.0.0"
name: "Test Config"
allowed-tools:
  - "@readonly"
  - "!Bash"
---

# Instructions

Follow the coding guidelines.

## Sub-section

More details here.

# Allowed Tools

- read_file
- write_file
`;

      const result = parser.parseSync(content, "/test/AGENTS.md");

      expect(result.frontmatter).toBeDefined();
      expect(result.frontmatter?.version).toBe("1.0.0");
      expect(result.frontmatter?.name).toBe("Test Config");
      expect(result.instructions).toContain("Follow the coding guidelines");
      expect(result.sections).toHaveLength(2);
      expect(result.allowedTools).toHaveLength(4); // 2 from frontmatter + 2 from section
      expect(result.filePath).toBe("/test/AGENTS.md");
      expect(result.errors).toHaveLength(0);
    });

    it("should handle missing frontmatter gracefully", () => {
      const parser = new AgentsParser({ resolveImports: false });

      const content = `# Instructions

Just plain markdown.`;

      const result = parser.parseSync(content, "/test/AGENTS.md");

      expect(result.frontmatter).toBeNull();
      expect(result.instructions).toContain("Just plain markdown");
      expect(result.warnings).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it("should handle malformed frontmatter", () => {
      const parser = new AgentsParser({ resolveImports: false });

      const content = `---
invalid: [unclosed
---

# Instructions

Content here.`;

      const result = parser.parseSync(content, "/test/AGENTS.md");

      expect(result.frontmatter).toBeNull();
      expect(result.warnings.length).toBeGreaterThan(0);
      // Should still parse body content
      expect(result.sections.length).toBeGreaterThanOrEqual(0);
    });

    it("should extract instructions from body when no section exists", () => {
      const parser = new AgentsParser({ resolveImports: false });

      const content = `---
version: "1.0.0"
---

Just some text without section headers.
More text here.`;

      const result = parser.parseSync(content, "/test/AGENTS.md");

      expect(result.instructions).toContain("Just some text");
    });

    it("should combine tools from frontmatter and section", () => {
      const parser = new AgentsParser({ resolveImports: false });

      const content = `---
allowed-tools:
  - tool1
---

# Allowed Tools

- tool2
- tool3`;

      const result = parser.parseSync(content, "/test/AGENTS.md");

      expect(result.allowedTools).toHaveLength(3);
      expect(result.allowedTools.map((t) => t.pattern)).toEqual(["tool1", "tool2", "tool3"]);
    });
  });

  describe("parseContent (async)", () => {
    it("should parse content asynchronously", async () => {
      const parser = new AgentsParser({ resolveImports: false });

      const content = `---
version: "1.0.0"
---

# Instructions

Test content.`;

      const result = await parser.parseContent(content, "/test/AGENTS.md", "/test");

      expect(result.frontmatter).toBeDefined();
      expect(result.frontmatter?.version).toBe("1.0.0");
      expect(result.instructions).toContain("Test content");
    });
  });

  describe("parse (file-based)", () => {
    it("should handle file read errors", async () => {
      const parser = new AgentsParser({ resolveImports: false });

      const mockFs = {
        readFile: async () => {
          throw new Error("File not found");
        },
      };

      const result = await parser.parse("/non-existent/AGENTS.md", mockFs);

      expect(result.frontmatter).toBeNull();
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.message).toContain("File not found");
    });

    it("should use provided file system", async () => {
      const parser = new AgentsParser({ resolveImports: false });

      const mockContent = `---
version: "2.0.0"
---

# Test

Mock content.`;

      const mockFs = {
        readFile: async (_path: string, _encoding: BufferEncoding) => mockContent,
      };

      const result = await parser.parse("/mock/AGENTS.md", mockFs);

      expect(result.frontmatter?.version).toBe("2.0.0");
      expect(result.instructions).toContain("Mock content");
    });
  });
});
