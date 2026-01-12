import { describe, expect, it } from "vitest";
import {
  type ExtendedModeConfig,
  ExtendedModeConfigSchema,
  type ModeConfig,
  ModeConfigSchema,
  toExtendedMode,
} from "../modes.js";

describe("ModeConfigSchema", () => {
  it("validates base mode config", () => {
    const config = {
      name: "code",
      description: "Code mode",
      tools: { edit: true, bash: true },
      prompt: "You are a coder...",
    };

    const result = ModeConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("validates mode config with all optional fields", () => {
    const config = {
      name: "plan",
      description: "Planning mode",
      tools: { edit: false, bash: "readonly", web: true, mcp: true },
      prompt: "Plan carefully...",
      temperature: 0.3,
      maxTokens: 4096,
      extendedThinking: true,
    };

    const result = ModeConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });
});

/**
 * ExtendedModeConfig tests.
 *
 * Note: Agent hierarchy fields (level, canSpawnAgents, fileRestrictions,
 * maxConcurrentSubagents) are now in AgentConfig, not ExtendedModeConfig.
 * ExtendedModeConfig only adds toolGroups and parentMode to ModeConfig.
 */
describe("ExtendedModeConfigSchema", () => {
  it("validates basic extended mode config", () => {
    const config = {
      name: "code",
      description: "Main mode",
      tools: { edit: true, bash: true },
      prompt: "You are an assistant...",
    };

    const result = ExtendedModeConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("validates extended mode config with toolGroups", () => {
    const config = {
      name: "code",
      description: "Implementation mode",
      tools: { edit: true, bash: false },
      prompt: "You are a worker...",
      toolGroups: [{ group: "filesystem", enabled: true }],
    };

    const result = ExtendedModeConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.toolGroups).toHaveLength(1);
    }
  });

  it("validates extended mode config with parentMode", () => {
    const config = {
      name: "code",
      description: "Child mode",
      tools: { edit: true, bash: true },
      prompt: "Orchestrate...",
      parentMode: "base-mode",
    };

    const result = ExtendedModeConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.parentMode).toBe("base-mode");
    }
  });

  it("is backward compatible with base ModeConfig fields", () => {
    const config = {
      name: "plan",
      description: "Planning mode",
      tools: { edit: false, bash: "readonly" as const },
      prompt: "Plan carefully...",
      temperature: 0.3,
      maxTokens: 4096,
      extendedThinking: true,
    };

    const result = ExtendedModeConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.temperature).toBe(0.3);
      expect(result.data.maxTokens).toBe(4096);
      expect(result.data.extendedThinking).toBe(true);
    }
  });

  it("rejects invalid tool group", () => {
    const config = {
      name: "code",
      description: "Invalid",
      tools: { edit: true, bash: true },
      prompt: "...",
      toolGroups: [{ group: "filesystem" }], // Missing 'enabled' field
    };

    const result = ExtendedModeConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("type inference works correctly", () => {
    // This test verifies TypeScript type inference at compile time
    const config: ExtendedModeConfig = {
      name: "code",
      description: "Type test",
      tools: { edit: true, bash: true },
      prompt: "...",
      toolGroups: [{ group: "filesystem", enabled: true, tools: ["read"] }],
      parentMode: "parent",
    };

    // If this compiles, type inference is working
    expect(config.parentMode).toBe("parent");
    expect(config.toolGroups).toHaveLength(1);
  });
});

describe("toExtendedMode", () => {
  it("converts base ModeConfig to ExtendedModeConfig with defaults", () => {
    const baseConfig: ModeConfig = {
      name: "code",
      description: "Code mode",
      tools: { edit: true, bash: true },
      prompt: "You are a coder...",
    };

    const extended = toExtendedMode(baseConfig);

    // Verify defaults are applied
    expect(extended.toolGroups).toEqual([]);
    expect(extended.parentMode).toBeUndefined();
  });

  it("preserves all original ModeConfig fields", () => {
    const baseConfig: ModeConfig = {
      name: "plan",
      description: "Planning mode",
      tools: { edit: false, bash: "readonly", web: true, mcp: true },
      prompt: "Plan carefully...",
      temperature: 0.3,
      maxTokens: 4096,
      extendedThinking: true,
    };

    const extended = toExtendedMode(baseConfig);

    // Verify original fields are preserved
    expect(extended.name).toBe("plan");
    expect(extended.description).toBe("Planning mode");
    expect(extended.tools).toEqual({ edit: false, bash: "readonly", web: true, mcp: true });
    expect(extended.prompt).toBe("Plan carefully...");
    expect(extended.temperature).toBe(0.3);
    expect(extended.maxTokens).toBe(4096);
    expect(extended.extendedThinking).toBe(true);
  });

  it("returns valid ExtendedModeConfig that passes schema validation", () => {
    const baseConfig: ModeConfig = {
      name: "debug",
      description: "Debug mode",
      tools: { edit: true, bash: true },
      prompt: "Debug issues...",
    };

    const extended = toExtendedMode(baseConfig);
    const result = ExtendedModeConfigSchema.safeParse(extended);

    expect(result.success).toBe(true);
  });

  it("converts all Phase 06 modes correctly", () => {
    const modes: ModeConfig[] = [
      {
        name: "plan",
        description: "Plan",
        tools: { edit: false, bash: "readonly" },
        prompt: "...",
      },
      { name: "code", description: "Code", tools: { edit: true, bash: true }, prompt: "..." },
      { name: "draft", description: "Draft", tools: { edit: true, bash: true }, prompt: "..." },
      { name: "debug", description: "Debug", tools: { edit: true, bash: true }, prompt: "..." },
      { name: "ask", description: "Ask", tools: { edit: false, bash: false }, prompt: "..." },
    ];

    for (const mode of modes) {
      const extended = toExtendedMode(mode);

      // All should have empty toolGroups by default
      expect(extended.toolGroups).toEqual([]);
      // All should validate against schema
      expect(ExtendedModeConfigSchema.safeParse(extended).success).toBe(true);
    }
  });
});
