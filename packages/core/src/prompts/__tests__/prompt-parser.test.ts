// ============================================
// PromptParser Unit Tests
// ============================================

/**
 * Unit tests for the PromptParser class.
 *
 * Tests cover:
 * - YAML frontmatter parsing
 * - Variable interpolation for all builtin variables
 * - Error handling for invalid YAML
 * - Edge cases and fallback behavior
 *
 * @module @vellum/core/prompts/__tests__/prompt-parser
 * @see T011
 */

import { beforeEach, describe, expect, it } from "vitest";
import { PromptError } from "../errors.js";
import { PromptParser } from "../prompt-parser.js";
import type { PromptLocation, PromptVariables } from "../types.js";

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Creates a mock PromptLocation for testing.
 */
function createMockLocation(overrides: Partial<PromptLocation> = {}): PromptLocation {
  return {
    source: "project",
    path: "/test/prompts/roles/test-prompt.md",
    priority: 1,
    ...overrides,
  };
}

/**
 * Creates a complete set of PromptVariables for testing.
 */
function createMockVariables(overrides: Partial<PromptVariables> = {}): PromptVariables {
  return {
    os: "darwin",
    shell: "zsh",
    cwd: "/home/user/project",
    date: "2026-01-10",
    mode: "vibe",
    provider: "anthropic",
    model: "claude-opus-4",
    ...overrides,
  };
}

// =============================================================================
// Valid YAML Frontmatter Tests
// =============================================================================

describe("PromptParser", () => {
  let parser: PromptParser;

  beforeEach(() => {
    parser = new PromptParser();
  });

  describe("parse() - Valid YAML Frontmatter", () => {
    it("parses valid YAML frontmatter with required fields", () => {
      const content = `---
id: coder-role
name: Coder
category: role
---
You are a helpful coder.`;

      const location = createMockLocation();
      const result = parser.parse(content, location);

      expect(result.id).toBe("coder-role");
      expect(result.name).toBe("Coder");
      expect(result.category).toBe("role");
      expect(result.content).toBe("You are a helpful coder.");
      expect(result.location).toBe(location);
    });

    it("parses frontmatter with all optional fields", () => {
      const content = `---
id: advanced-prompt
name: Advanced Prompt
category: worker
version: 1.2.0
description: A comprehensive prompt
priority: 2
tags:
  - coding
  - typescript
---
This is the body content.`;

      const location = createMockLocation();
      const result = parser.parse(content, location);

      expect(result.id).toBe("advanced-prompt");
      expect(result.name).toBe("Advanced Prompt");
      expect(result.category).toBe("worker");
      expect(result.version).toBe("1.2.0");
      expect(result.frontmatter.description).toBe("A comprehensive prompt");
      expect(result.frontmatter.tags).toEqual(["coding", "typescript"]);
    });

    it("extracts body content after frontmatter delimiter", () => {
      const content = `---
id: test
name: Test
category: role
---

# Header

Body with **markdown**.

- List item 1
- List item 2`;

      const result = parser.parse(content, createMockLocation());

      expect(result.content).toContain("# Header");
      expect(result.content).toContain("Body with **markdown**.");
      expect(result.content).toContain("- List item 1");
    });
  });

  // ===========================================================================
  // Missing/Invalid Frontmatter Tests
  // ===========================================================================

  describe("parse() - Missing Frontmatter", () => {
    it("handles content without frontmatter", () => {
      const content = "Just plain content without frontmatter.";
      const location = createMockLocation({ path: "/prompts/roles/plain.md" });

      const result = parser.parse(content, location);

      // Should return a minimal prompt with content
      expect(result.content).toBe("Just plain content without frontmatter.");
      expect(result.id).toBe("plain"); // Extracted from path
      expect(result.frontmatter).toEqual({});
    });

    it("infers ID from filename when missing in frontmatter", () => {
      const content = `---
name: Test
category: role
---
Content here.`;

      const location = createMockLocation({ path: "/prompts/roles/my-custom-prompt.md" });
      const result = parser.parse(content, location);

      expect(result.id).toBe("my-custom-prompt");
    });

    it("infers category from path when missing in frontmatter", () => {
      const content = `---
id: test
name: Test
---
Content here.`;

      const location = createMockLocation({ path: "/prompts/workers/my-worker.md" });
      const result = parser.parse(content, location);

      expect(result.category).toBe("worker");
    });
  });

  describe("parseRaw() - Invalid YAML", () => {
    it("returns null for invalid YAML when throwOnError is false", () => {
      const parser = new PromptParser({ throwOnError: false });
      const content = `---
id: test
name: [unclosed bracket
---
Content`;

      const result = parser.parseRaw(content);

      // Parser returns null for invalid YAML when throwOnError is false
      expect(result).toBeNull();
    });

    it("throws PROMPT_YAML_ERROR for invalid YAML when throwOnError is true", () => {
      const parser = new PromptParser({ throwOnError: true });
      const content = `---
id: test
  invalid: [unclosed bracket
  broken yaml
---
Content`;

      expect(() => parser.parseRaw(content)).toThrow(PromptError);
    });
  });

  // ===========================================================================
  // Variable Interpolation Tests
  // ===========================================================================

  describe("interpolate() - Builtin Variables", () => {
    it("interpolates {{os}} variable", () => {
      const content = "Running on {{os}} platform.";
      const variables = createMockVariables({ os: "win32" });

      const result = parser.interpolate(content, variables);

      expect(result).toBe("Running on win32 platform.");
    });

    it("interpolates {{shell}} variable", () => {
      const content = "Using {{shell}} as the shell.";
      const variables = createMockVariables({ shell: "powershell" });

      const result = parser.interpolate(content, variables);

      expect(result).toBe("Using powershell as the shell.");
    });

    it("interpolates {{cwd}} variable", () => {
      const content = "Current directory: {{cwd}}";
      const variables = createMockVariables({ cwd: "/home/user/project" });

      const result = parser.interpolate(content, variables);

      expect(result).toBe("Current directory: /home/user/project");
    });

    it("interpolates {{date}} variable", () => {
      const content = "Today is {{date}}.";
      const variables = createMockVariables({ date: "2026-01-10" });

      const result = parser.interpolate(content, variables);

      expect(result).toBe("Today is 2026-01-10.");
    });

    it("interpolates {{mode}} variable", () => {
      const content = "Operating in {{mode}} mode.";
      const variables = createMockVariables({ mode: "plan" });

      const result = parser.interpolate(content, variables);

      expect(result).toBe("Operating in plan mode.");
    });

    it("interpolates {{provider}} variable", () => {
      const content = "Using {{provider}} as LLM provider.";
      const variables = createMockVariables({ provider: "openai" });

      const result = parser.interpolate(content, variables);

      expect(result).toBe("Using openai as LLM provider.");
    });

    it("interpolates {{model}} variable", () => {
      const content = "Model: {{model}}";
      const variables = createMockVariables({ model: "gpt-4o" });

      const result = parser.interpolate(content, variables);

      expect(result).toBe("Model: gpt-4o");
    });
  });

  describe("interpolate() - Multiple Variables", () => {
    it("interpolates multiple variables in one content", () => {
      const content =
        "Running {{mode}} mode on {{os}} with {{shell}}, using {{provider}}/{{model}}.";
      const variables = createMockVariables({
        mode: "vibe",
        os: "darwin",
        shell: "zsh",
        provider: "anthropic",
        model: "claude-opus-4",
      });

      const result = parser.interpolate(content, variables);

      expect(result).toBe("Running vibe mode on darwin with zsh, using anthropic/claude-opus-4.");
    });

    it("interpolates same variable appearing multiple times", () => {
      const content = "{{os}} is great. I love {{os}}. {{os}} forever.";
      const variables = createMockVariables({ os: "linux" });

      const result = parser.interpolate(content, variables);

      expect(result).toBe("linux is great. I love linux. linux forever.");
    });

    it("interpolates all seven builtin variables together", () => {
      const content = `
OS: {{os}}
Shell: {{shell}}
CWD: {{cwd}}
Date: {{date}}
Mode: {{mode}}
Provider: {{provider}}
Model: {{model}}`;

      const variables = createMockVariables();
      const result = parser.interpolate(content, variables);

      expect(result).toContain("OS: darwin");
      expect(result).toContain("Shell: zsh");
      expect(result).toContain("CWD: /home/user/project");
      expect(result).toContain("Date: 2026-01-10");
      expect(result).toContain("Mode: vibe");
      expect(result).toContain("Provider: anthropic");
      expect(result).toContain("Model: claude-opus-4");
    });
  });

  describe("interpolate() - Unknown Variables", () => {
    it("leaves unknown variables as-is", () => {
      const content = "Known: {{os}}, Unknown: {{unknown_var}}";
      const variables = createMockVariables({ os: "darwin" });

      const result = parser.interpolate(content, variables);

      expect(result).toBe("Known: darwin, Unknown: {{unknown_var}}");
    });

    it("handles content with only unknown variables", () => {
      const content = "{{foo}} and {{bar}} and {{baz}}";
      const variables = createMockVariables();

      const result = parser.interpolate(content, variables);

      expect(result).toBe("{{foo}} and {{bar}} and {{baz}}");
    });

    it("handles variable names with different casing", () => {
      const content = "{{OS}} {{Shell}} {{CWD}}";
      const variables = createMockVariables({ os: "darwin", shell: "bash", cwd: "/home" });

      const result = parser.interpolate(content, variables);

      // Built-in variables should be case-insensitive
      expect(result).toBe("darwin bash /home");
    });
  });

  // ===========================================================================
  // Custom Variables Tests
  // ===========================================================================

  describe("interpolate() - Custom Variables", () => {
    it("interpolates custom variables", () => {
      const content = "Project: {{project_name}}";
      const variables: PromptVariables = {
        ...createMockVariables(),
        project_name: "vellum",
      };

      const result = parser.interpolate(content, variables);

      expect(result).toBe("Project: vellum");
    });

    it("custom variables work alongside builtin variables", () => {
      const content = "{{custom}} on {{os}}";
      const variables: PromptVariables = {
        ...createMockVariables({ os: "linux" }),
        custom: "MyApp",
      };

      const result = parser.interpolate(content, variables);

      expect(result).toBe("MyApp on linux");
    });
  });

  // ===========================================================================
  // createDefaultVariables Tests
  // ===========================================================================

  describe("createDefaultVariables()", () => {
    it("returns complete PromptVariables object with defaults", () => {
      const vars = parser.createDefaultVariables();

      expect(vars).toHaveProperty("os");
      expect(vars).toHaveProperty("shell");
      expect(vars).toHaveProperty("cwd");
      expect(vars).toHaveProperty("date");
      expect(vars).toHaveProperty("mode");
      expect(vars).toHaveProperty("provider");
      expect(vars).toHaveProperty("model");
    });

    it("allows overriding specific values", () => {
      const vars = parser.createDefaultVariables({
        mode: "spec",
        provider: "openai",
        model: "gpt-4-turbo",
      });

      expect(vars.mode).toBe("spec");
      expect(vars.provider).toBe("openai");
      expect(vars.model).toBe("gpt-4-turbo");
    });

    it("date is in ISO format (YYYY-MM-DD)", () => {
      const vars = parser.createDefaultVariables();

      expect(vars.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  // ===========================================================================
  // validate() Tests
  // ===========================================================================

  describe("validate()", () => {
    it("returns valid: true for valid content", () => {
      const content = `---
id: test
name: Test
category: role
---
Body content.`;

      const result = parser.validate(content);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("returns valid: true for content without frontmatter", () => {
      const content = "Just plain content.";

      const result = parser.validate(content);

      expect(result.valid).toBe(true);
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe("Edge Cases", () => {
    it("handles empty content", () => {
      const location = createMockLocation({ path: "/prompts/roles/empty.md" });
      const result = parser.parse("", location);

      expect(result.id).toBe("empty");
      expect(result.content).toBe("");
    });

    it("handles content with only frontmatter", () => {
      const content = `---
id: only-frontmatter
name: Only Frontmatter
category: role
---`;

      const result = parser.parse(content, createMockLocation());

      expect(result.id).toBe("only-frontmatter");
      expect(result.content).toBe("");
    });

    it("handles frontmatter with special characters", () => {
      const content = `---
id: special-chars
name: "Special: Characters & 'Quotes'"
category: role
---
Content with "quotes" and 'apostrophes'.`;

      const result = parser.parse(content, createMockLocation());

      expect(result.name).toBe("Special: Characters & 'Quotes'");
    });

    it("handles multiline body content", () => {
      const content = `---
id: multiline
name: Multiline
category: role
---
Line 1

Line 2

Line 3`;

      const result = parser.parse(content, createMockLocation());

      expect(result.content).toContain("Line 1");
      expect(result.content).toContain("Line 2");
      expect(result.content).toContain("Line 3");
    });

    it("handles variables in different positions", () => {
      const content = "{{os}}: start, middle {{shell}} middle, end: {{cwd}}";
      const variables = createMockVariables({
        os: "A",
        shell: "B",
        cwd: "C",
      });

      const result = parser.interpolate(content, variables);

      expect(result).toBe("A: start, middle B middle, end: C");
    });
  });

  // ===========================================================================
  // Path Inference Tests
  // ===========================================================================

  describe("Category Inference from Path", () => {
    it("infers role category from /roles/ path", () => {
      const content = `---
id: test
name: Test
---
Content`;

      const result = parser.parse(content, createMockLocation({ path: "/prompts/roles/test.md" }));

      expect(result.category).toBe("role");
    });

    it("infers worker category from /workers/ path", () => {
      const content = `---
id: test
name: Test
---
Content`;

      const result = parser.parse(
        content,
        createMockLocation({ path: "/prompts/workers/test.md" })
      );

      expect(result.category).toBe("worker");
    });

    it("infers spec category from /spec/ path", () => {
      const content = `---
id: test
name: Test
---
Content`;

      const result = parser.parse(content, createMockLocation({ path: "/prompts/spec/test.md" }));

      expect(result.category).toBe("spec");
    });

    it("infers provider category from /providers/ path", () => {
      const content = `---
id: test
name: Test
---
Content`;

      const result = parser.parse(
        content,
        createMockLocation({ path: "/prompts/providers/test.md" })
      );

      expect(result.category).toBe("provider");
    });

    it("defaults to custom category for unknown paths", () => {
      const content = `---
id: test
name: Test
---
Content`;

      const result = parser.parse(content, createMockLocation({ path: "/unknown/path/test.md" }));

      expect(result.category).toBe("custom");
    });
  });
});
