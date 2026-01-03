import * as fs from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AgentLoader,
  createAgentLoader,
  getSlugFromFilePath,
  isSupportedAgentFile,
} from "../loader.js";

// ============================================
// AgentLoader Tests (T012)
// ============================================

// Mock fs module
vi.mock("node:fs/promises");

describe("AgentLoader", () => {
  let loader: AgentLoader;

  beforeEach(() => {
    loader = new AgentLoader();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================
  // YAML Parsing Tests
  // ============================================

  describe("YAML file parsing", () => {
    it("parses valid YAML agent definition", async () => {
      const yamlContent = `
slug: test-agent
name: Test Agent
mode: code
description: A test agent
settings:
  temperature: 0.7
`;
      vi.mocked(fs.access).mockResolvedValueOnce(undefined);
      vi.mocked(fs.readFile).mockResolvedValueOnce(yamlContent);

      const result = await loader.loadFile("/path/to/agent.yaml");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.slug).toBe("test-agent");
        expect(result.value.name).toBe("Test Agent");
        expect(result.value.mode).toBe("code");
        expect(result.value.settings?.temperature).toBe(0.7);
      }
    });

    it("parses .yml extension", async () => {
      const yamlContent = `
slug: yml-agent
name: YML Agent
`;
      vi.mocked(fs.access).mockResolvedValueOnce(undefined);
      vi.mocked(fs.readFile).mockResolvedValueOnce(yamlContent);

      const result = await loader.loadFile("/path/to/agent.yml");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.slug).toBe("yml-agent");
      }
    });

    it("parses complete agent definition with all fields", async () => {
      const yamlContent = `
slug: full-agent
name: Full Agent
extends: base-agent
mode: code
icon: "🔧"
color: "#3b82f6"
hidden: false
model: claude-3-5-sonnet
systemPrompt: You are helpful
description: Full description
level: 2
toolGroups:
  - group: filesystem
    enabled: true
restrictions:
  maxTokens: 4096
  timeout: 300000
settings:
  temperature: 0.5
  extendedThinking: true
whenToUse:
  description: For coding
  triggers:
    - type: file
      pattern: "*.ts"
hooks:
  onStart: echo start
coordination:
  canSpawnAgents:
    - helper
version: "1.0.0"
author: team
tags:
  - coding
  - typescript
docs: https://docs.example.com
`;
      vi.mocked(fs.access).mockResolvedValueOnce(undefined);
      vi.mocked(fs.readFile).mockResolvedValueOnce(yamlContent);

      const result = await loader.loadFile("/path/to/full.yaml");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.slug).toBe("full-agent");
        expect(result.value.extends).toBe("base-agent");
        expect(result.value.toolGroups).toHaveLength(1);
        expect(result.value.restrictions?.maxTokens).toBe(4096);
        expect(result.value.whenToUse?.triggers).toHaveLength(1);
      }
    });
  });

  // ============================================
  // Markdown Frontmatter Tests
  // ============================================

  describe("Markdown frontmatter extraction", () => {
    it("parses Markdown with YAML frontmatter", async () => {
      const mdContent = `---
slug: md-agent
name: Markdown Agent
mode: code
---

# Agent Instructions

You are a helpful coding assistant.

## Guidelines

- Write clean code
- Add comments
`;
      vi.mocked(fs.access).mockResolvedValueOnce(undefined);
      vi.mocked(fs.readFile).mockResolvedValueOnce(mdContent);

      const result = await loader.loadFile("/path/to/agent.md");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.slug).toBe("md-agent");
        expect(result.value.name).toBe("Markdown Agent");
        expect(result.value.systemPrompt).toContain("Agent Instructions");
        expect(result.value.systemPrompt).toContain("Write clean code");
      }
    });

    it("uses body as systemPrompt if not defined in frontmatter", async () => {
      const mdContent = `---
slug: prompt-agent
name: Prompt Agent
---

This is the system prompt content.
It spans multiple lines.
`;
      vi.mocked(fs.access).mockResolvedValueOnce(undefined);
      vi.mocked(fs.readFile).mockResolvedValueOnce(mdContent);

      const result = await loader.loadFile("/path/to/agent.md");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.systemPrompt).toContain("This is the system prompt content");
      }
    });

    it("preserves systemPrompt from frontmatter over body", async () => {
      const mdContent = `---
slug: override-agent
name: Override Agent
systemPrompt: Frontmatter prompt
---

Body content that should be ignored.
`;
      vi.mocked(fs.access).mockResolvedValueOnce(undefined);
      vi.mocked(fs.readFile).mockResolvedValueOnce(mdContent);

      const result = await loader.loadFile("/path/to/agent.md");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.systemPrompt).toBe("Frontmatter prompt");
      }
    });

    it("handles Markdown with empty body", async () => {
      const mdContent = `---
slug: empty-body
name: Empty Body Agent
systemPrompt: Defined in frontmatter
---
`;
      vi.mocked(fs.access).mockResolvedValueOnce(undefined);
      vi.mocked(fs.readFile).mockResolvedValueOnce(mdContent);

      const result = await loader.loadFile("/path/to/agent.md");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.slug).toBe("empty-body");
        expect(result.value.systemPrompt).toBe("Defined in frontmatter");
      }
    });
  });

  // ============================================
  // Validation Error Tests
  // ============================================

  describe("validation errors", () => {
    it("rejects missing required slug field", async () => {
      const yamlContent = `
name: No Slug Agent
`;
      vi.mocked(fs.access).mockResolvedValueOnce(undefined);
      vi.mocked(fs.readFile).mockResolvedValueOnce(yamlContent);

      const result = await loader.loadFile("/path/to/agent.yaml");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("VALIDATION_ERROR");
        expect(result.error.message).toContain("slug");
        expect(result.error.validationIssues).toBeDefined();
      }
    });

    it("rejects missing required name field", async () => {
      const yamlContent = `
slug: no-name-agent
`;
      vi.mocked(fs.access).mockResolvedValueOnce(undefined);
      vi.mocked(fs.readFile).mockResolvedValueOnce(yamlContent);

      const result = await loader.loadFile("/path/to/agent.yaml");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("VALIDATION_ERROR");
        expect(result.error.message).toContain("name");
      }
    });

    it("rejects invalid slug format", async () => {
      const yamlContent = `
slug: Invalid_Slug
name: Invalid Agent
`;
      vi.mocked(fs.access).mockResolvedValueOnce(undefined);
      vi.mocked(fs.readFile).mockResolvedValueOnce(yamlContent);

      const result = await loader.loadFile("/path/to/agent.yaml");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("VALIDATION_ERROR");
        expect(result.error.message).toContain("slug");
      }
    });

    it("rejects invalid temperature value", async () => {
      const yamlContent = `
slug: temp-agent
name: Temperature Agent
settings:
  temperature: 2.0
`;
      vi.mocked(fs.access).mockResolvedValueOnce(undefined);
      vi.mocked(fs.readFile).mockResolvedValueOnce(yamlContent);

      const result = await loader.loadFile("/path/to/agent.yaml");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("VALIDATION_ERROR");
      }
    });

    it("rejects invalid docs URL", async () => {
      const yamlContent = `
slug: docs-agent
name: Docs Agent
docs: not-a-url
`;
      vi.mocked(fs.access).mockResolvedValueOnce(undefined);
      vi.mocked(fs.readFile).mockResolvedValueOnce(yamlContent);

      const result = await loader.loadFile("/path/to/agent.yaml");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("VALIDATION_ERROR");
        expect(result.error.message).toContain("docs");
      }
    });
  });

  // ============================================
  // Malformed File Tests
  // ============================================

  describe("malformed files", () => {
    it("handles malformed YAML syntax", async () => {
      const malformedYaml = `
slug: bad-agent
name: Bad Agent
  invalid indentation
    broken: yaml
`;
      vi.mocked(fs.access).mockResolvedValueOnce(undefined);
      vi.mocked(fs.readFile).mockResolvedValueOnce(malformedYaml);

      const result = await loader.loadFile("/path/to/bad.yaml");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("PARSE_ERROR");
        expect(result.error.message).toContain("YAML parse error");
      }
    });

    it("handles malformed Markdown frontmatter", async () => {
      const malformedMd = `---
slug: broken
name: Broken
  bad: indentation
---
Body
`;
      vi.mocked(fs.access).mockResolvedValueOnce(undefined);
      vi.mocked(fs.readFile).mockResolvedValueOnce(malformedMd);

      const result = await loader.loadFile("/path/to/broken.md");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("PARSE_ERROR");
      }
    });

    it("handles empty file", async () => {
      vi.mocked(fs.access).mockResolvedValueOnce(undefined);
      vi.mocked(fs.readFile).mockResolvedValueOnce("");

      const result = await loader.loadFile("/path/to/empty.yaml");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("PARSE_ERROR");
        expect(result.error.message).toContain("empty");
      }
    });

    it("handles whitespace-only file", async () => {
      vi.mocked(fs.access).mockResolvedValueOnce(undefined);
      vi.mocked(fs.readFile).mockResolvedValueOnce("   \n\n   ");

      const result = await loader.loadFile("/path/to/whitespace.yaml");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("PARSE_ERROR");
      }
    });

    it("handles YAML that parses to non-object", async () => {
      const scalarYaml = `just a string`;
      vi.mocked(fs.access).mockResolvedValueOnce(undefined);
      vi.mocked(fs.readFile).mockResolvedValueOnce(scalarYaml);

      const result = await loader.loadFile("/path/to/scalar.yaml");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("PARSE_ERROR");
        expect(result.error.message).toContain("must be an object");
      }
    });

    it("handles Markdown without frontmatter", async () => {
      const noFrontmatter = `# Just Markdown

No frontmatter here.
`;
      vi.mocked(fs.access).mockResolvedValueOnce(undefined);
      vi.mocked(fs.readFile).mockResolvedValueOnce(noFrontmatter);

      const result = await loader.loadFile("/path/to/no-frontmatter.md");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("PARSE_ERROR");
        expect(result.error.message).toContain("frontmatter");
      }
    });

    it("handles Markdown with empty frontmatter", async () => {
      const emptyFrontmatter = `---
---

Body only
`;
      vi.mocked(fs.access).mockResolvedValueOnce(undefined);
      vi.mocked(fs.readFile).mockResolvedValueOnce(emptyFrontmatter);

      const result = await loader.loadFile("/path/to/empty-front.md");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("PARSE_ERROR");
        expect(result.error.message).toContain("empty");
      }
    });
  });

  // ============================================
  // File Not Found Tests
  // ============================================

  describe("file not found", () => {
    it("returns error for non-existent file", async () => {
      vi.mocked(fs.access).mockRejectedValueOnce(new Error("ENOENT"));

      const result = await loader.loadFile("/path/to/missing.yaml");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("FILE_NOT_FOUND");
        expect(result.error.message).toContain("not found");
      }
    });

    it("returns error for unsupported extension", async () => {
      const result = await loader.loadFile("/path/to/agent.json");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("PARSE_ERROR");
        expect(result.error.message).toContain("Unsupported file extension");
      }
    });

    it("handles read permission errors", async () => {
      vi.mocked(fs.access).mockResolvedValueOnce(undefined);
      vi.mocked(fs.readFile).mockRejectedValueOnce(new Error("EACCES: permission denied"));

      const result = await loader.loadFile("/path/to/protected.yaml");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("IO_ERROR");
        expect(result.error.cause).toBeDefined();
      }
    });
  });

  // ============================================
  // loadFromString Tests
  // ============================================

  describe("loadFromString", () => {
    it("loads YAML from string", () => {
      const yaml = `
slug: string-agent
name: String Agent
`;
      const result = loader.loadFromString(yaml, "yaml");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.slug).toBe("string-agent");
      }
    });

    it("loads Markdown from string", () => {
      const md = `---
slug: md-string
name: MD String Agent
---

System prompt
`;
      const result = loader.loadFromString(md, "markdown");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.slug).toBe("md-string");
        expect(result.value.systemPrompt).toContain("System prompt");
      }
    });

    it("includes custom file path in errors", () => {
      const result = loader.loadFromString("invalid", "yaml", "custom/path.yaml");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.filePath).toBe("custom/path.yaml");
      }
    });
  });

  // ============================================
  // Utility Function Tests
  // ============================================

  describe("utility functions", () => {
    describe("isSupportedAgentFile", () => {
      it("returns true for .yaml files", () => {
        expect(isSupportedAgentFile("agent.yaml")).toBe(true);
      });

      it("returns true for .yml files", () => {
        expect(isSupportedAgentFile("agent.yml")).toBe(true);
      });

      it("returns true for .md files", () => {
        expect(isSupportedAgentFile("agent.md")).toBe(true);
      });

      it("returns false for unsupported extensions", () => {
        expect(isSupportedAgentFile("agent.json")).toBe(false);
        expect(isSupportedAgentFile("agent.txt")).toBe(false);
        expect(isSupportedAgentFile("agent.ts")).toBe(false);
      });

      it("handles uppercase extensions", () => {
        // Implementation is case-insensitive for cross-platform compatibility
        expect(isSupportedAgentFile("agent.YAML")).toBe(true);
        expect(isSupportedAgentFile("agent.MD")).toBe(true);
      });
    });

    describe("getSlugFromFilePath", () => {
      it("extracts slug from filename", () => {
        expect(getSlugFromFilePath("/path/to/test-agent.yaml")).toBe("test-agent");
        expect(getSlugFromFilePath("/path/to/my-agent.md")).toBe("my-agent");
      });

      it("handles Windows paths", () => {
        expect(getSlugFromFilePath("C:\\Users\\agent.yml")).toBe("agent");
      });
    });

    describe("createAgentLoader", () => {
      it("creates a new AgentLoader instance", () => {
        const newLoader = createAgentLoader();
        expect(newLoader).toBeInstanceOf(AgentLoader);
      });
    });
  });

  // ============================================
  // Edge Cases
  // ============================================

  describe("edge cases", () => {
    it("handles unicode in agent name", async () => {
      const yaml = `
slug: unicode-agent
name: エージェント 🤖
description: Agent with unicode
`;
      vi.mocked(fs.access).mockResolvedValueOnce(undefined);
      vi.mocked(fs.readFile).mockResolvedValueOnce(yaml);

      const result = await loader.loadFile("/path/to/unicode.yaml");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.name).toBe("エージェント 🤖");
      }
    });

    it("handles very long description", async () => {
      const longDesc = "A".repeat(501);
      const yaml = `
slug: long-desc
name: Long Description
description: ${longDesc}
`;
      vi.mocked(fs.access).mockResolvedValueOnce(undefined);
      vi.mocked(fs.readFile).mockResolvedValueOnce(yaml);

      const result = await loader.loadFile("/path/to/long.yaml");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("VALIDATION_ERROR");
        expect(result.error.message).toContain("description");
      }
    });

    it("normalizes Windows paths", async () => {
      const yaml = `
slug: win-agent
name: Windows Agent
`;
      vi.mocked(fs.access).mockResolvedValueOnce(undefined);
      vi.mocked(fs.readFile).mockResolvedValueOnce(yaml);

      const result = await loader.loadFile("C:\\Users\\test\\agent.yaml");

      expect(result.ok).toBe(true);
    });
  });
});
