import { describe, expect, it } from "vitest";
import { AgentLevel } from "../../../agent/level.js";
import {
  AgentCircularInheritanceError,
  AgentNotFoundError,
  AgentParseError,
  AgentValidationError,
  fromZodError,
  isAgentCircularInheritanceError,
  isAgentError,
  isAgentNotFoundError,
  isAgentParseError,
  isAgentValidationError,
} from "../errors.js";
import {
  AgentCoordinationSchema,
  AgentHooksSchema,
  AgentRestrictionsSchema,
  AgentSettingsSchema,
  CustomAgentDefinitionSchema,
  isValidSlug,
  MAX_DESCRIPTION_LENGTH,
  MAX_NAME_LENGTH,
  MAX_SLUG_LENGTH,
  SLUG_PATTERN,
  TriggerPatternSchema,
  validateAgentDefinition,
  WhenToUseSchema,
} from "../schema.js";

// ============================================
// CustomAgentDefinitionSchema Tests (T008)
// ============================================

describe("CustomAgentDefinitionSchema", () => {
  describe("valid agent definitions", () => {
    it("validates minimal agent definition", () => {
      const definition = {
        slug: "test-agent",
        name: "Test Agent",
      };

      const result = CustomAgentDefinitionSchema.safeParse(definition);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.slug).toBe("test-agent");
        expect(result.data.name).toBe("Test Agent");
      }
    });

    it("validates complete agent definition", () => {
      const definition = {
        slug: "full-agent",
        name: "Full Agent",
        extends: "base-agent",
        mode: "code",
        icon: "🔧",
        color: "#3b82f6",
        hidden: false,
        model: "claude-3-5-sonnet",
        systemPrompt: "You are a helpful assistant",
        description: "A fully configured agent",
        level: AgentLevel.worker,
        toolGroups: [
          { group: "filesystem", enabled: true },
          { group: "shell", enabled: false },
        ],
        restrictions: {
          fileRestrictions: [{ pattern: "src/**", access: "write" }],
          maxTokens: 4096,
          timeout: 300000,
        },
        settings: {
          temperature: 0.7,
          extendedThinking: true,
          streamOutput: true,
          autoConfirm: false,
        },
        whenToUse: {
          description: "Use for coding tasks",
          triggers: [
            { type: "file", pattern: "**/*.ts" },
            { type: "keyword", pattern: "implement|code" },
          ],
          priority: 10,
        },
        hooks: {
          onStart: "echo 'Starting'",
          onComplete: "npm run format",
        },
        coordination: {
          canSpawnAgents: ["helper-agent"],
          parentMode: "orchestrator",
          maxConcurrentSubagents: 5,
        },
        version: "1.0.0",
        author: "team",
        tags: ["coding", "typescript"],
        docs: "https://docs.example.com/agents/full",
      };

      const result = CustomAgentDefinitionSchema.safeParse(definition);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.slug).toBe("full-agent");
        expect(result.data.level).toBe(AgentLevel.worker);
        expect(result.data.toolGroups).toHaveLength(2);
        expect(result.data.restrictions?.maxTokens).toBe(4096);
        expect(result.data.settings?.temperature).toBe(0.7);
        expect(result.data.whenToUse?.triggers).toHaveLength(2);
      }
    });

    it("validates agent with ExtendedModeConfig fields", () => {
      const definition = {
        slug: "mode-agent",
        name: "Mode Agent",
        tools: {
          edit: true,
          bash: "readonly" as const,
          web: true,
          mcp: false,
        },
        prompt: "System prompt for mode",
        temperature: 0.5,
        maxTokens: 2048,
        extendedThinking: true,
        canSpawnAgents: ["worker-1", "worker-2"],
        fileRestrictions: [{ pattern: "**/*.md", access: "read" }],
        parentMode: "parent-agent",
        maxConcurrentSubagents: 2,
      };

      const result = CustomAgentDefinitionSchema.safeParse(definition);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tools?.bash).toBe("readonly");
        expect(result.data.canSpawnAgents).toHaveLength(2);
      }
    });
  });

  describe("invalid definitions (missing fields)", () => {
    it("rejects empty object", () => {
      const result = CustomAgentDefinitionSchema.safeParse({});
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes("slug"))).toBe(true);
        expect(result.error.issues.some((i) => i.path.includes("name"))).toBe(true);
      }
    });

    it("rejects missing slug", () => {
      const result = CustomAgentDefinitionSchema.safeParse({ name: "Test" });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes("slug"))).toBe(true);
      }
    });

    it("rejects missing name", () => {
      const result = CustomAgentDefinitionSchema.safeParse({ slug: "test" });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes("name"))).toBe(true);
      }
    });
  });

  describe("invalid definitions (wrong types)", () => {
    it("rejects non-string slug", () => {
      const result = CustomAgentDefinitionSchema.safeParse({
        slug: 123,
        name: "Test",
      });
      expect(result.success).toBe(false);
    });

    it("rejects non-string name", () => {
      const result = CustomAgentDefinitionSchema.safeParse({
        slug: "test",
        name: { value: "Test" },
      });
      expect(result.success).toBe(false);
    });

    it("rejects non-boolean hidden", () => {
      const result = CustomAgentDefinitionSchema.safeParse({
        slug: "test",
        name: "Test",
        hidden: "true",
      });
      expect(result.success).toBe(false);
    });

    it("rejects non-array tags", () => {
      const result = CustomAgentDefinitionSchema.safeParse({
        slug: "test",
        name: "Test",
        tags: "tag1,tag2",
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid level", () => {
      const result = CustomAgentDefinitionSchema.safeParse({
        slug: "test",
        name: "Test",
        level: 99,
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid temperature", () => {
      const result = CustomAgentDefinitionSchema.safeParse({
        slug: "test",
        name: "Test",
        settings: { temperature: 1.5 },
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid docs URL", () => {
      const result = CustomAgentDefinitionSchema.safeParse({
        slug: "test",
        name: "Test",
        docs: "not-a-url",
      });
      expect(result.success).toBe(false);
    });
  });
});

// ============================================
// Slug Validation Tests
// ============================================

describe("Slug validation", () => {
  describe("valid slugs", () => {
    const validSlugs = [
      "a",
      "ab",
      "abc",
      "test",
      "test-agent",
      "my-cool-agent",
      "agent123",
      "123agent",
      "test-agent-v2",
      "a-b-c",
      "a1b2c3",
    ];

    it.each(validSlugs)('accepts valid slug: "%s"', (slug) => {
      expect(SLUG_PATTERN.test(slug)).toBe(true);
      expect(isValidSlug(slug)).toBe(true);

      const result = CustomAgentDefinitionSchema.safeParse({
        slug,
        name: "Test",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("invalid slugs", () => {
    const invalidSlugs = [
      { slug: "", reason: "empty string" },
      { slug: "-test", reason: "starts with hyphen" },
      { slug: "test-", reason: "ends with hyphen" },
      { slug: "-", reason: "only hyphen" },
      { slug: "--", reason: "double hyphen only" },
      { slug: "Test", reason: "uppercase" },
      { slug: "TEST", reason: "all uppercase" },
      { slug: "test_agent", reason: "underscore" },
      { slug: "test.agent", reason: "dot" },
      { slug: "test agent", reason: "space" },
      { slug: "test@agent", reason: "special character" },
      { slug: "测试", reason: "non-ASCII" },
    ];

    it.each(invalidSlugs)('rejects invalid slug: "$slug" ($reason)', ({ slug }) => {
      expect(SLUG_PATTERN.test(slug)).toBe(false);
      expect(isValidSlug(slug)).toBe(false);

      const result = CustomAgentDefinitionSchema.safeParse({
        slug,
        name: "Test",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("slug length constraints", () => {
    it("accepts slug at max length", () => {
      const slug = "a".repeat(MAX_SLUG_LENGTH);
      expect(isValidSlug(slug)).toBe(true);
    });

    it("rejects slug over max length", () => {
      const slug = "a".repeat(MAX_SLUG_LENGTH + 1);
      expect(isValidSlug(slug)).toBe(false);

      const result = CustomAgentDefinitionSchema.safeParse({
        slug,
        name: "Test",
      });
      expect(result.success).toBe(false);
    });
  });
});

// ============================================
// Field Constraints Tests
// ============================================

describe("Field constraints", () => {
  describe("name constraints", () => {
    it("accepts name at max length", () => {
      const name = "A".repeat(MAX_NAME_LENGTH);
      const result = CustomAgentDefinitionSchema.safeParse({
        slug: "test",
        name,
      });
      expect(result.success).toBe(true);
    });

    it("rejects name over max length", () => {
      const name = "A".repeat(MAX_NAME_LENGTH + 1);
      const result = CustomAgentDefinitionSchema.safeParse({
        slug: "test",
        name,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain(`${MAX_NAME_LENGTH}`);
      }
    });

    it("rejects empty name", () => {
      const result = CustomAgentDefinitionSchema.safeParse({
        slug: "test",
        name: "",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("description constraints", () => {
    it("accepts description at max length", () => {
      const description = "A".repeat(MAX_DESCRIPTION_LENGTH);
      const result = CustomAgentDefinitionSchema.safeParse({
        slug: "test",
        name: "Test",
        description,
      });
      expect(result.success).toBe(true);
    });

    it("rejects description over max length", () => {
      const description = "A".repeat(MAX_DESCRIPTION_LENGTH + 1);
      const result = CustomAgentDefinitionSchema.safeParse({
        slug: "test",
        name: "Test",
        description,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain(`${MAX_DESCRIPTION_LENGTH}`);
      }
    });
  });

  describe("temperature constraints", () => {
    it("accepts temperature 0", () => {
      const result = CustomAgentDefinitionSchema.safeParse({
        slug: "test",
        name: "Test",
        settings: { temperature: 0 },
      });
      expect(result.success).toBe(true);
    });

    it("accepts temperature 1", () => {
      const result = CustomAgentDefinitionSchema.safeParse({
        slug: "test",
        name: "Test",
        settings: { temperature: 1 },
      });
      expect(result.success).toBe(true);
    });

    it("accepts temperature 0.5", () => {
      const result = CustomAgentDefinitionSchema.safeParse({
        slug: "test",
        name: "Test",
        settings: { temperature: 0.5 },
      });
      expect(result.success).toBe(true);
    });

    it("rejects negative temperature", () => {
      const result = CustomAgentDefinitionSchema.safeParse({
        slug: "test",
        name: "Test",
        settings: { temperature: -0.1 },
      });
      expect(result.success).toBe(false);
    });

    it("rejects temperature above 1", () => {
      const result = CustomAgentDefinitionSchema.safeParse({
        slug: "test",
        name: "Test",
        settings: { temperature: 1.1 },
      });
      expect(result.success).toBe(false);
    });
  });
});

// ============================================
// Supporting Schema Tests
// ============================================

describe("TriggerPatternSchema", () => {
  it("validates file trigger", () => {
    const result = TriggerPatternSchema.safeParse({
      type: "file",
      pattern: "**/*.ts",
    });
    expect(result.success).toBe(true);
  });

  it("validates keyword trigger", () => {
    const result = TriggerPatternSchema.safeParse({
      type: "keyword",
      pattern: "test|spec",
    });
    expect(result.success).toBe(true);
  });

  it("validates regex trigger", () => {
    const result = TriggerPatternSchema.safeParse({
      type: "regex",
      pattern: "^fix:",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid trigger type", () => {
    const result = TriggerPatternSchema.safeParse({
      type: "invalid",
      pattern: "test",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty pattern", () => {
    const result = TriggerPatternSchema.safeParse({
      type: "file",
      pattern: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("WhenToUseSchema", () => {
  it("validates minimal whenToUse", () => {
    const result = WhenToUseSchema.safeParse({
      description: "Use for testing",
    });
    expect(result.success).toBe(true);
  });

  it("validates complete whenToUse", () => {
    const result = WhenToUseSchema.safeParse({
      description: "Use for testing",
      triggers: [{ type: "file", pattern: "**/*.test.ts" }],
      priority: 10,
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty description", () => {
    const result = WhenToUseSchema.safeParse({
      description: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("AgentRestrictionsSchema", () => {
  it("validates empty restrictions", () => {
    const result = AgentRestrictionsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("validates complete restrictions", () => {
    const result = AgentRestrictionsSchema.safeParse({
      fileRestrictions: [
        { pattern: "src/**", access: "write" },
        { pattern: "*.config.*", access: "read" },
      ],
      toolGroups: [{ group: "filesystem", enabled: true }],
      maxTokens: 4096,
      timeout: 60000,
    });
    expect(result.success).toBe(true);
  });

  it("rejects negative maxTokens", () => {
    const result = AgentRestrictionsSchema.safeParse({
      maxTokens: -100,
    });
    expect(result.success).toBe(false);
  });
});

describe("AgentHooksSchema", () => {
  it("validates empty hooks", () => {
    const result = AgentHooksSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("validates all hooks", () => {
    const result = AgentHooksSchema.safeParse({
      onStart: "echo start",
      onComplete: "echo done",
      onError: "echo error",
      beforeTool: "echo before",
      afterTool: "echo after",
    });
    expect(result.success).toBe(true);
  });
});

describe("AgentCoordinationSchema", () => {
  it("validates empty coordination", () => {
    const result = AgentCoordinationSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.maxConcurrentSubagents).toBe(3); // default
    }
  });

  it("validates complete coordination", () => {
    const result = AgentCoordinationSchema.safeParse({
      canSpawnAgents: ["agent-1", "agent-2"],
      parentMode: "orchestrator",
      maxConcurrentSubagents: 5,
    });
    expect(result.success).toBe(true);
  });
});

describe("AgentSettingsSchema", () => {
  it("validates empty settings", () => {
    const result = AgentSettingsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("validates complete settings", () => {
    const result = AgentSettingsSchema.safeParse({
      temperature: 0.7,
      extendedThinking: true,
      streamOutput: true,
      autoConfirm: false,
    });
    expect(result.success).toBe(true);
  });
});

// ============================================
// Helper Function Tests
// ============================================

describe("validateAgentDefinition", () => {
  it("returns success for valid definition", () => {
    const result = validateAgentDefinition({
      slug: "test",
      name: "Test",
    });
    expect(result.success).toBe(true);
  });

  it("returns error for invalid definition", () => {
    const result = validateAgentDefinition({
      slug: "",
      name: "",
    });
    expect(result.success).toBe(false);
  });
});

// ============================================
// Error Classes Tests
// ============================================

describe("AgentValidationError", () => {
  it("creates error with validation issues", () => {
    const issues = [
      { path: ["slug"], message: "Invalid slug" },
      { path: ["name"], message: "Name required" },
    ];
    const error = new AgentValidationError("Validation failed", issues);

    expect(error.name).toBe("AgentValidationError");
    expect(error.message).toBe("Validation failed");
    expect(error.validationErrors).toHaveLength(2);
    expect(error.validationErrors[0]?.message).toBe("Invalid slug");
  });

  it("formats errors correctly", () => {
    const issues = [
      { path: ["slug"], message: "Invalid slug" },
      { path: ["settings", "temperature"], message: "Must be 0-1" },
    ];
    const error = new AgentValidationError("Validation failed", issues);

    const formatted = error.getFormattedErrors();
    expect(formatted).toContain("slug: Invalid slug");
    expect(formatted).toContain("settings.temperature: Must be 0-1");
  });

  it("includes agent slug in context", () => {
    const error = new AgentValidationError("Validation failed", [{ path: [], message: "Error" }], {
      agentSlug: "test-agent",
    });

    expect(error.agentSlug).toBe("test-agent");
  });
});

describe("AgentNotFoundError", () => {
  it("creates error with agent slug", () => {
    const error = new AgentNotFoundError("unknown-agent");

    expect(error.name).toBe("AgentNotFoundError");
    expect(error.message).toBe('Agent not found: "unknown-agent"');
    expect(error.agentSlug).toBe("unknown-agent");
  });
});

describe("AgentCircularInheritanceError", () => {
  it("creates error with inheritance chain", () => {
    const chain = ["agent-a", "agent-b", "agent-c", "agent-a"];
    const error = new AgentCircularInheritanceError(chain);

    expect(error.name).toBe("AgentCircularInheritanceError");
    expect(error.message).toContain("agent-a → agent-b → agent-c → agent-a");
    expect(error.inheritanceChain).toEqual(chain);
    expect(error.agentSlug).toBe("agent-a");
  });
});

describe("AgentParseError", () => {
  it("creates error with basic message", () => {
    const error = new AgentParseError("Failed to parse YAML");

    expect(error.name).toBe("AgentParseError");
    expect(error.message).toBe("Failed to parse YAML");
  });

  it("creates error with location info", () => {
    const error = new AgentParseError("Unexpected token", {
      filePath: "agents/test.md",
      lineNumber: 10,
      column: 5,
    });

    expect(error.filePath).toBe("agents/test.md");
    expect(error.lineNumber).toBe(10);
    expect(error.column).toBe(5);

    const formatted = error.getFormattedError();
    expect(formatted).toContain("at line 10:5");
    expect(formatted).toContain("in agents/test.md");
  });
});

describe("fromZodError", () => {
  it("converts Zod error to AgentValidationError", () => {
    const result = CustomAgentDefinitionSchema.safeParse({
      slug: "",
      name: "",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const error = fromZodError(result.error, "test-agent");

      expect(error).toBeInstanceOf(AgentValidationError);
      expect(error.agentSlug).toBe("test-agent");
      expect(error.validationErrors.length).toBeGreaterThan(0);
    }
  });
});

describe("Type guards", () => {
  it("isAgentError identifies AgentError", () => {
    const error = new AgentValidationError("Test", []);
    expect(isAgentError(error)).toBe(true);
    expect(isAgentError(new Error())).toBe(false);
  });

  it("isAgentValidationError identifies AgentValidationError", () => {
    const error = new AgentValidationError("Test", []);
    expect(isAgentValidationError(error)).toBe(true);
    expect(isAgentValidationError(new AgentNotFoundError("x"))).toBe(false);
  });

  it("isAgentNotFoundError identifies AgentNotFoundError", () => {
    const error = new AgentNotFoundError("test");
    expect(isAgentNotFoundError(error)).toBe(true);
    expect(isAgentNotFoundError(new AgentParseError("x"))).toBe(false);
  });

  it("isAgentCircularInheritanceError identifies AgentCircularInheritanceError", () => {
    const error = new AgentCircularInheritanceError(["a", "b", "a"]);
    expect(isAgentCircularInheritanceError(error)).toBe(true);
    expect(isAgentCircularInheritanceError(new AgentNotFoundError("x"))).toBe(false);
  });

  it("isAgentParseError identifies AgentParseError", () => {
    const error = new AgentParseError("test");
    expect(isAgentParseError(error)).toBe(true);
    expect(isAgentParseError(new AgentValidationError("x", []))).toBe(false);
  });
});
