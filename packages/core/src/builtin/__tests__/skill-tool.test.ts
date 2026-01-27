/**
 * Tests for skill tool
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SkillManager } from "../../skill/manager.js";
import type { SkillConfig, SkillLoaded } from "../../skill/types.js";
import type { ToolContext } from "../../types/tool.js";
import {
  getSkillManager,
  setSkillConfig,
  setSkillManager,
  skillParamsSchema,
  skillTool,
} from "../skill-tool.js";

// =============================================================================
// Test Fixtures
// =============================================================================

function createMockContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    workingDir: "/test/workspace",
    sessionId: "test-session",
    messageId: "test-message",
    callId: "test-call",
    abortSignal: new AbortController().signal,
    checkPermission: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function createMockSkillManager(overrides: Partial<SkillManager> = {}): SkillManager {
  return {
    isInitialized: vi.fn().mockReturnValue(true),
    initialize: vi.fn().mockResolvedValue(undefined),
    loadSkill: vi.fn().mockResolvedValue(null),
    getSkills: vi.fn().mockReturnValue([]),
    findSkillByName: vi.fn().mockReturnValue(undefined),
    scanForSkills: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as SkillManager;
}

function createLoadedSkill(overrides: Partial<SkillLoaded> = {}): SkillLoaded {
  return {
    name: "test-skill",
    description: "A test skill",
    source: "workspace",
    loadedAt: new Date(),
    rules: "## Rules\n- Rule 1\n- Rule 2",
    patterns: "## Patterns\n- Pattern 1",
    antiPatterns: "",
    examples: "## Examples\n```ts\nconst x = 1;\n```",
    referencesSection: "",
    raw: "",
    frontmatter: {
      name: "test-skill",
      description: "A test skill",
      triggers: [],
      priority: 50,
      dependencies: [],
      tags: [],
    },
    triggers: [],
    dependencies: [],
    path: "/test/skill",
    priority: 50,
    tags: [],
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe("skillTool", () => {
  beforeEach(() => {
    // Reset shared state between tests
    setSkillManager(null as unknown as SkillManager);
    setSkillConfig(null as unknown as SkillConfig);
    vi.clearAllMocks();
  });

  // ===========================================================================
  // Schema Validation Tests
  // ===========================================================================

  describe("schema validation", () => {
    it("should have correct tool name", () => {
      expect(skillTool.definition.name).toBe("skill");
    });

    it("should have correct kind", () => {
      expect(skillTool.definition.kind).toBe("read");
    });

    it("should have description", () => {
      expect(skillTool.definition.description).toBeTruthy();
    });

    it("should validate name parameter as required", () => {
      const validResult = skillParamsSchema.safeParse({ name: "test-skill" });
      expect(validResult.success).toBe(true);

      const invalidResult = skillParamsSchema.safeParse({});
      expect(invalidResult.success).toBe(false);
    });

    it("should reject empty name", () => {
      const result = skillParamsSchema.safeParse({ name: "" });
      expect(result.success).toBe(false);
    });
  });

  // ===========================================================================
  // Manager Not Set Tests
  // ===========================================================================

  describe("manager not initialized", () => {
    it("should return error when skill manager is not set", async () => {
      const ctx = createMockContext();
      const result = await skillTool.execute({ name: "test-skill" }, ctx);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.success).toBe(false);
        expect(result.output.error).toContain("SkillManager not available");
      }
    });

    it("should set and get skill manager correctly", () => {
      const mockManager = createMockSkillManager();

      expect(getSkillManager()).toBeNull();
      setSkillManager(mockManager);
      expect(getSkillManager()).toBe(mockManager);
    });
  });

  // ===========================================================================
  // Permission Checking Tests
  // ===========================================================================

  describe("permission checking", () => {
    it("should deny access when permission is 'deny'", async () => {
      const mockManager = createMockSkillManager();
      setSkillManager(mockManager);
      setSkillConfig({
        permissions: {
          default: "allow",
          rules: [{ pattern: "dangerous-*", permission: "deny" }],
        },
      });

      const ctx = createMockContext();
      const result = await skillTool.execute({ name: "dangerous-tool" }, ctx);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.success).toBe(false);
        expect(result.output.error).toContain("Permission denied");
        expect(result.output.error).toContain("dangerous-tool");
      }
    });

    it("should ask user when permission is 'ask' and user approves", async () => {
      const mockManager = createMockSkillManager({
        loadSkill: vi.fn().mockResolvedValue(createLoadedSkill()),
      });
      setSkillManager(mockManager);
      setSkillConfig({
        permissions: {
          default: "allow",
          rules: [{ pattern: "internal-*", permission: "ask" }],
        },
      });

      const checkPermission = vi.fn().mockResolvedValue(true);
      const ctx = createMockContext({ checkPermission });
      const result = await skillTool.execute({ name: "internal-tool" }, ctx);

      expect(checkPermission).toHaveBeenCalledWith("load skill: internal-tool");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.success).toBe(true);
      }
    });

    it("should deny when permission is 'ask' and user declines", async () => {
      const mockManager = createMockSkillManager();
      setSkillManager(mockManager);
      setSkillConfig({
        permissions: {
          default: "allow",
          rules: [{ pattern: "internal-*", permission: "ask" }],
        },
      });

      const checkPermission = vi.fn().mockResolvedValue(false);
      const ctx = createMockContext({ checkPermission });
      const result = await skillTool.execute({ name: "internal-tool" }, ctx);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.success).toBe(false);
        expect(result.output.error).toContain("User declined");
      }
    });

    it("should allow when checkPermission is not available (backward compat)", async () => {
      const mockManager = createMockSkillManager({
        loadSkill: vi.fn().mockResolvedValue(createLoadedSkill()),
      });
      setSkillManager(mockManager);
      setSkillConfig({
        permissions: {
          default: "allow",
          rules: [{ pattern: "internal-*", permission: "ask" }],
        },
      });

      const ctx = createMockContext({ checkPermission: undefined });
      const result = await skillTool.execute({ name: "internal-tool" }, ctx);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.success).toBe(true);
      }
    });
  });

  // ===========================================================================
  // Skill Loading Tests
  // ===========================================================================

  describe("skill loading", () => {
    it("should return error when skill is not found", async () => {
      const mockManager = createMockSkillManager({
        loadSkill: vi.fn().mockResolvedValue(null),
      });
      setSkillManager(mockManager);

      const ctx = createMockContext();
      const result = await skillTool.execute({ name: "nonexistent-skill" }, ctx);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.success).toBe(false);
        expect(result.output.error).toContain("Skill not found");
        expect(result.output.error).toContain("nonexistent-skill");
      }
    });

    it("should load skill successfully and return formatted content", async () => {
      const loadedSkill = createLoadedSkill({
        name: "python-testing",
        description: "Python testing best practices",
        rules: "- Use pytest\n- Write unit tests",
        patterns: "- AAA pattern",
        examples: "```py\ndef test_example():\n    pass\n```",
      });

      const mockManager = createMockSkillManager({
        loadSkill: vi.fn().mockResolvedValue(loadedSkill),
      });
      setSkillManager(mockManager);

      const ctx = createMockContext();
      const result = await skillTool.execute({ name: "python-testing" }, ctx);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.success).toBe(true);
        expect(result.output.output).toContain("# Skill: python-testing");
        expect(result.output.output).toContain("**Description:**");
        expect(result.output.output).toContain("## Rules");
        expect(result.output.output).toContain("## Patterns");
        expect(result.output.output).toContain("## Examples");
        expect(result.output.metadata?.skillName).toBe("python-testing");
        expect(result.output.metadata?.tokenEstimate).toBeGreaterThan(0);
      }
    });

    it("should initialize manager if not initialized", async () => {
      const initializeFn = vi.fn().mockResolvedValue(undefined);
      const mockManager = createMockSkillManager({
        isInitialized: vi.fn().mockReturnValue(false),
        initialize: initializeFn,
        loadSkill: vi.fn().mockResolvedValue(createLoadedSkill()),
      });
      setSkillManager(mockManager);

      const ctx = createMockContext();
      await skillTool.execute({ name: "test-skill" }, ctx);

      expect(initializeFn).toHaveBeenCalled();
    });

    it("should handle initialization failure", async () => {
      const mockManager = createMockSkillManager({
        isInitialized: vi.fn().mockReturnValue(false),
        initialize: vi.fn().mockRejectedValue(new Error("Init failed")),
      });
      setSkillManager(mockManager);

      const ctx = createMockContext();
      const result = await skillTool.execute({ name: "test-skill" }, ctx);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.success).toBe(false);
        expect(result.output.error).toContain("Failed to initialize");
        expect(result.output.error).toContain("Init failed");
      }
    });
  });

  // ===========================================================================
  // Abort Signal Tests
  // ===========================================================================

  describe("abort signal handling", () => {
    it("should return error when aborted", async () => {
      const mockManager = createMockSkillManager();
      setSkillManager(mockManager);

      const abortController = new AbortController();
      abortController.abort();

      const ctx = createMockContext({ abortSignal: abortController.signal });
      const result = await skillTool.execute({ name: "test-skill" }, ctx);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("cancelled");
      }
    });
  });

  // ===========================================================================
  // shouldConfirm Tests
  // ===========================================================================

  describe("shouldConfirm", () => {
    it("should return false (read-only tool)", () => {
      const ctx = createMockContext();
      const result = skillTool.shouldConfirm?.({ name: "test" }, ctx);
      expect(result).toBe(false);
    });
  });
});
