// ============================================
// Skill Parser Tests - T039
// ============================================

import * as fs from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SKILL_MANIFEST_FILENAME, SKILL_SECTION_NAMES, SkillParser } from "../parser.js";
import type { SkillSource } from "../types.js";

// =============================================================================
// Mock fs module
// =============================================================================

vi.mock("node:fs/promises");

// =============================================================================
// Test Fixtures
// =============================================================================

const VALID_SKILL_MD = `---
name: test-skill
description: A test skill for unit testing
triggers:
  - type: keyword
    pattern: test|testing
  - type: file_pattern
    pattern: "**/*.test.ts"
version: 1.0.0
author: Test Author
priority: 75
dependencies:
  - base-skill
tags:
  - testing
  - unit-tests
---

## Rules

- Always write tests first
- Use descriptive test names
- Follow AAA pattern (Arrange, Act, Assert)

## Patterns

\`\`\`typescript
describe("feature", () => {
  it("should do something", () => {
    // Arrange
    const input = "test";
    // Act
    const result = process(input);
    // Assert
    expect(result).toBe("expected");
  });
});
\`\`\`

## Anti-Patterns

- Don't use magic numbers in tests
- Avoid testing implementation details
- Don't share state between tests

## Examples

### Good Example

\`\`\`typescript
it("should return user when found", async () => {
  const user = await findUser(123);
  expect(user.name).toBe("John");
});
\`\`\`

## References

- [Vitest Documentation](https://vitest.dev)
- [Testing Best Practices](https://example.com/testing)
`;

const VALID_SKILL_MD_WITH_ALIASES = `---
name: compat-skill
desc: A skill using alias fields
when:
  - type: always
requires:
  - other-skill
tags: []
---

## Rules

Follow these rules.
`;

const INVALID_FRONTMATTER_MD = `---
name: invalid
# Missing required description/triggers
version: 1.0.0
---

## Rules

Some content here.
`;

const MALFORMED_YAML_MD = `---
name: malformed
description: This has bad YAML
triggers:
  - type: keyword
    pattern: [unclosed bracket
---

## Rules

Content.
`;

const NO_FRONTMATTER_MD = `# Just Markdown

No frontmatter delimiters here.

## Rules

Some rules.
`;

const EMPTY_CONTENT = "";

const PARTIAL_SECTIONS_MD = `---
name: partial-skill
description: Only has some sections
triggers:
  - type: always
---

## Rules

Only rules section exists.
`;

// =============================================================================
// Helper Functions
// =============================================================================

function mockReadFile(content: string) {
  vi.mocked(fs.readFile).mockResolvedValue(content);
}

function mockReadFileError(error: Error) {
  vi.mocked(fs.readFile).mockRejectedValue(error);
}

// =============================================================================
// Tests
// =============================================================================

describe("SkillParser", () => {
  let parser: SkillParser;
  const testPath = "/test/skills/test-skill/SKILL.md";
  const testSource: SkillSource = "workspace";

  beforeEach(() => {
    parser = new SkillParser();
    vi.clearAllMocks();
  });

  // ===========================================================================
  // Constants Tests
  // ===========================================================================

  describe("constants", () => {
    it("should export standard section names", () => {
      expect(SKILL_SECTION_NAMES).toContain("Rules");
      expect(SKILL_SECTION_NAMES).toContain("Patterns");
      expect(SKILL_SECTION_NAMES).toContain("Anti-Patterns");
      expect(SKILL_SECTION_NAMES).toContain("Examples");
      expect(SKILL_SECTION_NAMES).toContain("References");
    });

    it("should export manifest filename", () => {
      expect(SKILL_MANIFEST_FILENAME).toBe("SKILL.md");
    });
  });

  // ===========================================================================
  // parseMetadata (L1) Tests
  // ===========================================================================

  describe("parseMetadata", () => {
    it("should parse valid SKILL.md metadata", async () => {
      mockReadFile(VALID_SKILL_MD);

      const result = await parser.parseMetadata(testPath, testSource);

      expect(result).not.toBeNull();
      expect(result?.name).toBe("test-skill");
      expect(result?.description).toBe("A test skill for unit testing");
      expect(result?.triggers).toHaveLength(2);
      expect(result?.triggers[0]).toEqual({ type: "keyword", pattern: "test|testing" });
      expect(result?.triggers[1]).toEqual({ type: "file_pattern", pattern: "**/*.test.ts" });
      expect(result?.version).toBe("1.0.0");
      expect(result?.priority).toBe(75);
      expect(result?.dependencies).toEqual(["base-skill"]);
      expect(result?.tags).toEqual(["testing", "unit-tests"]);
      expect(result?.source).toBe("workspace");
      expect(result?.path).toBe("/test/skills/test-skill");
    });

    it("should parse skill with alias fields (desc, when, requires)", async () => {
      mockReadFile(VALID_SKILL_MD_WITH_ALIASES);

      const result = await parser.parseMetadata(testPath, testSource);

      expect(result).not.toBeNull();
      expect(result?.name).toBe("compat-skill");
      expect(result?.description).toBe("A skill using alias fields");
      expect(result?.triggers).toHaveLength(1);
      expect(result?.triggers[0]).toEqual({ type: "always" });
      expect(result?.dependencies).toEqual(["other-skill"]);
    });

    it("should throw for invalid frontmatter (missing required fields)", async () => {
      mockReadFile(INVALID_FRONTMATTER_MD);

      // The zod transform throws when required fields are missing after alias resolution
      await expect(parser.parseMetadata(testPath, testSource)).rejects.toThrow();
    });

    it("should return null for malformed YAML", async () => {
      mockReadFile(MALFORMED_YAML_MD);

      const result = await parser.parseMetadata(testPath, testSource);

      expect(result).toBeNull();
    });

    it("should return null for content without frontmatter", async () => {
      mockReadFile(NO_FRONTMATTER_MD);

      const result = await parser.parseMetadata(testPath, testSource);

      expect(result).toBeNull();
    });

    it("should return null for empty content", async () => {
      mockReadFile(EMPTY_CONTENT);

      const result = await parser.parseMetadata(testPath, testSource);

      expect(result).toBeNull();
    });

    it("should throw VellumError on file read failure", async () => {
      mockReadFileError(new Error("File not found"));

      await expect(parser.parseMetadata(testPath, testSource)).rejects.toThrow(
        "Failed to read skill file"
      );
    });

    it("should use default priority when not specified", async () => {
      mockReadFile(VALID_SKILL_MD_WITH_ALIASES);

      const result = await parser.parseMetadata(testPath, testSource);

      expect(result?.priority).toBe(50); // default value
    });

    it("should handle different source types", async () => {
      mockReadFile(VALID_SKILL_MD);

      const sources: SkillSource[] = ["workspace", "user", "global", "builtin"];

      for (const source of sources) {
        const result = await parser.parseMetadata(testPath, source);
        expect(result?.source).toBe(source);
      }
    });
  });

  // ===========================================================================
  // parseMetadataFromContent Tests
  // ===========================================================================

  describe("parseMetadataFromContent", () => {
    it("should parse metadata from content string", () => {
      const result = parser.parseMetadataFromContent(VALID_SKILL_MD, testPath, testSource);

      expect(result).not.toBeNull();
      expect(result?.name).toBe("test-skill");
      expect(result?.description).toBe("A test skill for unit testing");
    });

    it("should throw for invalid content (missing required fields)", () => {
      // The zod transform throws when required fields are missing after alias resolution
      expect(() =>
        parser.parseMetadataFromContent(INVALID_FRONTMATTER_MD, testPath, testSource)
      ).toThrow();
    });
  });

  // ===========================================================================
  // parseFull (L2) Tests
  // ===========================================================================

  describe("parseFull", () => {
    it("should parse full SKILL.md with all sections", async () => {
      mockReadFile(VALID_SKILL_MD);

      const result = await parser.parseFull(testPath, testSource);

      expect(result).not.toBeNull();

      // Metadata
      expect(result?.name).toBe("test-skill");
      expect(result?.description).toBe("A test skill for unit testing");

      // Sections - note: content is under each section header directly
      // Nested sections (like ### Good Example under ## Examples) are in children
      expect(result?.rules).toContain("Always write tests first");
      expect(result?.patterns).toContain('describe("feature"');
      expect(result?.antiPatterns).toContain("Don't use magic numbers");
      // Examples section has a nested child (### Good Example), so direct content may be empty
      // The section map should still have the section entry
      expect(result?.referencesSection).toContain("Vitest Documentation");

      // Frontmatter
      expect(result?.frontmatter).toBeDefined();
      expect(result?.frontmatter.name).toBe("test-skill");

      // Raw content
      expect(result?.raw).toBe(VALID_SKILL_MD);

      // Timestamp
      expect(result?.loadedAt).toBeInstanceOf(Date);
    });

    it("should handle partial sections (missing some)", async () => {
      mockReadFile(PARTIAL_SECTIONS_MD);

      const result = await parser.parseFull(testPath, testSource);

      expect(result).not.toBeNull();
      expect(result?.rules).toContain("Only rules section exists");
      expect(result?.patterns).toBe("");
      expect(result?.antiPatterns).toBe("");
      expect(result?.examples).toBe("");
      expect(result?.referencesSection).toBe("");
    });

    it("should throw for invalid frontmatter (missing required fields)", async () => {
      mockReadFile(INVALID_FRONTMATTER_MD);

      // The zod transform throws when required fields are missing after alias resolution
      await expect(parser.parseFull(testPath, testSource)).rejects.toThrow();
    });

    it("should throw VellumError on file read failure", async () => {
      mockReadFileError(new Error("Permission denied"));

      await expect(parser.parseFull(testPath, testSource)).rejects.toThrow(
        "Failed to read skill file"
      );
    });
  });

  // ===========================================================================
  // parseFullFromContent Tests
  // ===========================================================================

  describe("parseFullFromContent", () => {
    it("should parse full content from string", () => {
      const result = parser.parseFullFromContent(VALID_SKILL_MD, testPath, testSource);

      expect(result).not.toBeNull();
      expect(result?.name).toBe("test-skill");
      expect(result?.rules).toContain("Always write tests first");
    });

    it("should throw for invalid content (missing required fields)", () => {
      // The zod transform throws when required fields are missing after alias resolution
      expect(() =>
        parser.parseFullFromContent(INVALID_FRONTMATTER_MD, testPath, testSource)
      ).toThrow();
    });
  });

  // ===========================================================================
  // parseWithDiagnostics Tests
  // ===========================================================================

  describe("parseWithDiagnostics", () => {
    it("should return detailed result for valid skill", async () => {
      mockReadFile(VALID_SKILL_MD);

      const result = await parser.parseWithDiagnostics(testPath, testSource);

      expect(result.scan).not.toBeNull();
      expect(result.loaded).not.toBeNull();
      expect(result.errors).toHaveLength(0);
      expect(result.scan?.name).toBe("test-skill");
    });

    it("should throw for invalid frontmatter (missing required fields after transform)", async () => {
      mockReadFile(INVALID_FRONTMATTER_MD);

      // The zod transform throws when required fields are missing after alias resolution
      // This exception propagates through parseWithDiagnostics
      await expect(parser.parseWithDiagnostics(testPath, testSource)).rejects.toThrow();
    });

    it("should return errors for file read failure", async () => {
      mockReadFileError(new Error("File not found"));

      const result = await parser.parseWithDiagnostics(testPath, testSource);

      expect(result.scan).toBeNull();
      expect(result.loaded).toBeNull();
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should include warnings for missing standard sections", async () => {
      mockReadFile(PARTIAL_SECTIONS_MD);

      const result = await parser.parseWithDiagnostics(testPath, testSource);

      expect(result.scan).not.toBeNull();
      expect(result.loaded).not.toBeNull();
      // Should warn about missing sections
      const missingSections = result.warnings.filter((w) => w.includes("Missing section"));
      expect(missingSections.length).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // validate Tests
  // ===========================================================================

  describe("validate", () => {
    it("should return true for valid skill", async () => {
      mockReadFile(VALID_SKILL_MD);

      const result = await parser.validate(testPath);

      expect(result).toBe(true);
    });

    it("should return false for invalid frontmatter", async () => {
      mockReadFile(INVALID_FRONTMATTER_MD);

      const result = await parser.validate(testPath);

      expect(result).toBe(false);
    });

    it("should return false for file read error", async () => {
      mockReadFileError(new Error("File not found"));

      const result = await parser.validate(testPath);

      expect(result).toBe(false);
    });
  });

  // ===========================================================================
  // findSection Tests
  // ===========================================================================

  describe("findSection", () => {
    it("should find section by name (case-insensitive)", () => {
      const sections = [
        { title: "Rules", content: "Rule content", level: 2, children: [] },
        { title: "Examples", content: "Example content", level: 2, children: [] },
      ];

      expect(parser.findSection(sections, "Rules")).toBe("Rule content");
      expect(parser.findSection(sections, "rules")).toBe("Rule content");
      expect(parser.findSection(sections, "RULES")).toBe("Rule content");
    });

    it("should return null for non-existent section", () => {
      const sections = [{ title: "Rules", content: "Rule content", level: 2, children: [] }];

      expect(parser.findSection(sections, "Patterns")).toBeNull();
    });

    it("should handle empty sections array", () => {
      expect(parser.findSection([], "Rules")).toBeNull();
    });
  });
});
