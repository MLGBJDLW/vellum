/**
 * Unit tests for Agent Parser
 *
 * Tests for T020 - Agent parsing functionality
 *
 * @module plugin/agents/__tests__/parser.test
 */

import { describe, expect, it } from "vitest";

import {
  extractFirstParagraph,
  extractNameFromPath,
  type ParsedAgent,
  parseAgent,
} from "../parser.js";

// =============================================================================
// extractNameFromPath Tests
// =============================================================================

describe("extractNameFromPath", () => {
  it("should extract name from simple filename", () => {
    expect(extractNameFromPath("code-reviewer.md")).toBe("code-reviewer");
  });

  it("should extract name from path with directories", () => {
    expect(extractNameFromPath("/plugins/core/agents/helper.md")).toBe("helper");
  });

  it("should handle case-insensitive .MD extension", () => {
    expect(extractNameFromPath("Assistant.MD")).toBe("Assistant");
  });

  it("should preserve hyphens in filename", () => {
    expect(extractNameFromPath("code-quality-checker.md")).toBe("code-quality-checker");
  });

  it("should preserve underscores in filename", () => {
    expect(extractNameFromPath("test_helper.md")).toBe("test_helper");
  });

  it("should handle Windows-style paths", () => {
    expect(extractNameFromPath("C:\\plugins\\agents\\reviewer.md")).toBe("reviewer");
  });

  it("should handle filename with multiple dots", () => {
    expect(extractNameFromPath("my.agent.name.md")).toBe("my.agent.name");
  });
});

// =============================================================================
// extractFirstParagraph Tests
// =============================================================================

describe("extractFirstParagraph", () => {
  it("should extract simple first paragraph", () => {
    const content = "This is the first paragraph.\n\nThis is the second.";
    expect(extractFirstParagraph(content)).toBe("This is the first paragraph.");
  });

  it("should skip leading heading", () => {
    const content = "# Agent Title\n\nThis is the description.";
    expect(extractFirstParagraph(content)).toBe("This is the description.");
  });

  it("should skip multiple headings", () => {
    const content = "# Title\n## Subtitle\n\nFirst paragraph here.";
    expect(extractFirstParagraph(content)).toBe("First paragraph here.");
  });

  it("should handle multi-line paragraph", () => {
    const content = "First line of paragraph.\nSecond line of paragraph.";
    expect(extractFirstParagraph(content)).toBe(
      "First line of paragraph. Second line of paragraph."
    );
  });

  it("should stop at empty line", () => {
    const content = "First paragraph.\n\nSecond paragraph.";
    expect(extractFirstParagraph(content)).toBe("First paragraph.");
  });

  it("should skip horizontal rules (dashes)", () => {
    const content = "---\n\nFirst paragraph after rule.";
    expect(extractFirstParagraph(content)).toBe("First paragraph after rule.");
  });

  it("should skip horizontal rules (asterisks)", () => {
    const content = "***\n\nFirst paragraph after asterisks.";
    expect(extractFirstParagraph(content)).toBe("First paragraph after asterisks.");
  });

  it("should skip horizontal rules (underscores)", () => {
    const content = "___\n\nFirst paragraph after underscores.";
    expect(extractFirstParagraph(content)).toBe("First paragraph after underscores.");
  });

  it("should return empty string for empty content", () => {
    expect(extractFirstParagraph("")).toBe("");
  });

  it("should return empty string for only headings", () => {
    expect(extractFirstParagraph("# Title\n## Subtitle")).toBe("");
  });

  it("should return empty string for only whitespace", () => {
    expect(extractFirstParagraph("   \n\n   \n")).toBe("");
  });

  it("should handle content with only horizontal rules", () => {
    expect(extractFirstParagraph("---\n***\n___")).toBe("");
  });

  it("should stop at heading after paragraph", () => {
    const content = "First paragraph.\n# Heading\nMore content.";
    expect(extractFirstParagraph(content)).toBe("First paragraph.");
  });

  it("should stop at horizontal rule after paragraph", () => {
    const content = "First paragraph.\n---\nMore content.";
    expect(extractFirstParagraph(content)).toBe("First paragraph.");
  });
});

// =============================================================================
// parseAgent Tests - Frontmatter Extraction
// =============================================================================

describe("parseAgent - frontmatter extraction", () => {
  it("should parse full frontmatter with all fields", () => {
    const content = `---
name: code-reviewer
description: Reviews code for quality issues
model: claude-3-opus
toolGroups:
  - read
  - edit
---
You are a code reviewer. Analyze code and suggest improvements.
`;

    const agent = parseAgent("/agents/reviewer.md", content);

    expect(agent.name).toBe("code-reviewer");
    expect(agent.description).toBe("Reviews code for quality issues");
    expect(agent.model).toBe("claude-3-opus");
    expect(agent.toolGroups).toEqual(["read", "edit"]);
    expect(agent.filePath).toBe("/agents/reviewer.md");
  });

  it("should parse name from frontmatter", () => {
    const content = `---
name: custom-agent
---
Body content here.
`;

    const agent = parseAgent("/agents/different.md", content);
    expect(agent.name).toBe("custom-agent");
  });

  it("should parse description from frontmatter", () => {
    const content = `---
description: A helpful assistant for coding tasks
---
System prompt content.
`;

    const agent = parseAgent("/agents/helper.md", content);
    expect(agent.description).toBe("A helpful assistant for coding tasks");
  });

  it("should parse model from frontmatter", () => {
    const content = `---
model: gpt-4-turbo
---
You are an AI assistant.
`;

    const agent = parseAgent("/agents/gpt-agent.md", content);
    expect(agent.model).toBe("gpt-4-turbo");
  });

  it("should parse toolGroups array from frontmatter", () => {
    const content = `---
toolGroups:
  - read
  - browser
  - execute
---
Agent with multiple tool groups.
`;

    const agent = parseAgent("/agents/multi-tool.md", content);
    expect(agent.toolGroups).toEqual(["read", "browser", "execute"]);
  });

  it("should parse legacy tools array from frontmatter", () => {
    const content = `---
tools:
  - read_file
  - write_file
  - grep_search
---
Agent with legacy tools.
`;

    const agent = parseAgent("/agents/legacy.md", content);
    expect(agent.tools).toEqual(["read_file", "write_file", "grep_search"]);
  });

  it("should parse both toolGroups and tools when present", () => {
    const content = `---
toolGroups:
  - read
tools:
  - custom_tool
---
Agent with both formats.
`;

    const agent = parseAgent("/agents/both.md", content);
    expect(agent.toolGroups).toEqual(["read"]);
    expect(agent.tools).toEqual(["custom_tool"]);
  });
});

// =============================================================================
// parseAgent Tests - SystemPrompt from Body
// =============================================================================

describe("parseAgent - systemPrompt from body", () => {
  it("should extract body as systemPrompt", () => {
    const content = `---
name: test-agent
---
You are a helpful assistant.
Focus on code quality.
`;

    const agent = parseAgent("/agents/test.md", content);
    expect(agent.systemPrompt).toBe("You are a helpful assistant.\nFocus on code quality.\n");
  });

  it("should preserve markdown formatting in systemPrompt", () => {
    const content = `---
name: formatted
---
# Main Instructions

- Point one
- Point two

## Sub-section

More details here.
`;

    const agent = parseAgent("/agents/formatted.md", content);
    expect(agent.systemPrompt).toContain("# Main Instructions");
    expect(agent.systemPrompt).toContain("- Point one");
    expect(agent.systemPrompt).toContain("## Sub-section");
  });

  it("should handle empty body", () => {
    const content = `---
name: empty-body
description: Agent with no system prompt
---
`;

    const agent = parseAgent("/agents/empty.md", content);
    // Empty body after frontmatter results in empty string
    expect(agent.systemPrompt).toBe("");
  });

  it("should use entire content as body when no frontmatter", () => {
    const content = "You are a helpful assistant without frontmatter.";

    const agent = parseAgent("/agents/no-fm.md", content);
    expect(agent.systemPrompt).toBe(content);
  });

  it("should handle content with code blocks", () => {
    const content = `---
name: code-helper
---
Here is an example:

\`\`\`typescript
const x = 1;
\`\`\`
`;

    const agent = parseAgent("/agents/code.md", content);
    expect(agent.systemPrompt).toContain("```typescript");
    expect(agent.systemPrompt).toContain("const x = 1;");
  });
});

// =============================================================================
// parseAgent Tests - Filename Fallback for Name
// =============================================================================

describe("parseAgent - filename fallback for name", () => {
  it("should use filename as name when not in frontmatter", () => {
    const content = `---
description: A helper agent
---
System prompt here.
`;

    const agent = parseAgent("/plugins/my-plugin/agents/code-helper.md", content);
    expect(agent.name).toBe("code-helper");
  });

  it("should use filename when frontmatter is empty", () => {
    const content = `---
---
Just a body.
`;

    const agent = parseAgent("/agents/my-agent.md", content);
    expect(agent.name).toBe("my-agent");
  });

  it("should use filename when no frontmatter at all", () => {
    const content = "Just plain markdown content without any frontmatter.";

    const agent = parseAgent("/agents/plain-agent.md", content);
    expect(agent.name).toBe("plain-agent");
  });

  it("should prefer frontmatter name over filename", () => {
    const content = `---
name: preferred-name
---
Body content.
`;

    const agent = parseAgent("/agents/different-filename.md", content);
    expect(agent.name).toBe("preferred-name");
  });

  it("should handle Windows-style paths for filename fallback", () => {
    const content = "No frontmatter content.";

    const agent = parseAgent("C:\\plugins\\test\\agents\\windows-agent.md", content);
    expect(agent.name).toBe("windows-agent");
  });
});

// =============================================================================
// parseAgent Tests - Description Fallback
// =============================================================================

describe("parseAgent - description fallback", () => {
  it("should use first paragraph as description when not in frontmatter", () => {
    const content = `---
name: test-agent
---
This is the first paragraph that becomes the description.

More content follows.
`;

    const agent = parseAgent("/agents/test.md", content);
    expect(agent.description).toBe("This is the first paragraph that becomes the description.");
  });

  it("should skip headings when extracting description fallback", () => {
    const content = `---
name: with-heading
---
# Agent Title

This paragraph becomes the description.
`;

    const agent = parseAgent("/agents/heading.md", content);
    expect(agent.description).toBe("This paragraph becomes the description.");
  });

  it("should use name as description fallback when no first paragraph", () => {
    const content = `---
name: empty-desc
---
`;

    const agent = parseAgent("/agents/empty.md", content);
    expect(agent.description).toBe("empty-desc");
  });

  it("should prefer frontmatter description over first paragraph", () => {
    const content = `---
name: test
description: Explicit description from frontmatter
---
This first paragraph should be ignored for description.
`;

    const agent = parseAgent("/agents/test.md", content);
    expect(agent.description).toBe("Explicit description from frontmatter");
  });

  it("should use filename as description fallback when no name or paragraph", () => {
    const content = `---
---
# Only Heading

## Another Heading
`;

    const agent = parseAgent("/agents/fallback-test.md", content);
    expect(agent.name).toBe("fallback-test");
    expect(agent.description).toBe("fallback-test");
  });
});

// =============================================================================
// parseAgent Tests - Edge Cases
// =============================================================================

describe("parseAgent - edge cases", () => {
  it("should handle malformed frontmatter gracefully", () => {
    const content = `---
name: [invalid yaml
---
Body content.
`;

    const agent = parseAgent("/agents/malformed.md", content);
    // Should fall back to filename
    expect(agent.name).toBe("malformed");
    expect(agent.systemPrompt).toBeTruthy();
  });

  it("should handle frontmatter without closing delimiter", () => {
    const content = `---
name: unclosed
description: This frontmatter is not closed
Body content that might be parsed incorrectly.
`;

    const agent = parseAgent("/agents/unclosed.md", content);
    // Should handle gracefully
    expect(agent).toBeTruthy();
    expect(agent.filePath).toBe("/agents/unclosed.md");
  });

  it("should preserve filePath in result", () => {
    const content = `---
name: test
---
Body.
`;

    const filePath = "/custom/path/to/agent.md";
    const agent = parseAgent(filePath, content);
    expect(agent.filePath).toBe(filePath);
  });

  it("should handle empty toolGroups array", () => {
    const content = `---
name: no-tools
toolGroups: []
---
No tools agent.
`;

    const agent = parseAgent("/agents/no-tools.md", content);
    // Empty array should not be set
    expect(agent.toolGroups).toBeUndefined();
  });

  it("should handle empty tools array", () => {
    const content = `---
name: no-legacy-tools
tools: []
---
No legacy tools.
`;

    const agent = parseAgent("/agents/no-legacy.md", content);
    // Empty array should not be set
    expect(agent.tools).toBeUndefined();
  });

  it("should not include model when not specified", () => {
    const content = `---
name: no-model
---
Agent without model specification.
`;

    const agent = parseAgent("/agents/no-model.md", content);
    expect(agent.model).toBeUndefined();
  });
});

// =============================================================================
// parseAgent Tests - Full Integration
// =============================================================================

describe("parseAgent - full integration", () => {
  it("should produce complete ParsedAgent shape", () => {
    const content = `---
name: complete-agent
description: A fully configured agent
model: claude-3-5-sonnet
toolGroups:
  - read
  - edit
  - browser
---
# Complete Agent

You are a complete agent with all fields configured.

## Responsibilities

- Review code
- Suggest improvements
- Write documentation
`;

    const agent = parseAgent("/plugins/test/agents/complete-agent.md", content);

    // Verify all fields
    expect(agent).toMatchObject<ParsedAgent>({
      name: "complete-agent",
      description: "A fully configured agent",
      model: "claude-3-5-sonnet",
      toolGroups: ["read", "edit", "browser"],
      systemPrompt: expect.stringContaining("# Complete Agent"),
      filePath: "/plugins/test/agents/complete-agent.md",
    });

    // Verify systemPrompt contains expected content
    expect(agent.systemPrompt).toContain("## Responsibilities");
    expect(agent.systemPrompt).toContain("- Review code");
  });

  it("should handle minimal agent definition", () => {
    const content = "You are a simple agent.";

    const agent = parseAgent("/agents/simple.md", content);

    expect(agent.name).toBe("simple");
    expect(agent.description).toBe("You are a simple agent.");
    expect(agent.systemPrompt).toBe(content);
    expect(agent.filePath).toBe("/agents/simple.md");
    expect(agent.model).toBeUndefined();
    expect(agent.toolGroups).toBeUndefined();
    expect(agent.tools).toBeUndefined();
  });
});
