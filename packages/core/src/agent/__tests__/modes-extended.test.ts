import { describe, expect, it } from "vitest";
import { AgentLevel } from "../level.js";
import {
  DEFAULT_MAX_CONCURRENT_SUBAGENTS,
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

describe("ExtendedModeConfigSchema", () => {
  it("validates orchestrator config with spawn permissions", () => {
    const config = {
      name: "code",
      description: "Main orchestrator",
      tools: { edit: true, bash: true },
      prompt: "You are an orchestrator...",
      level: AgentLevel.orchestrator,
      canSpawnAgents: ["spec-worker", "impl-worker"],
    };

    const result = ExtendedModeConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.level).toBe(AgentLevel.orchestrator);
      expect(result.data.canSpawnAgents).toEqual(["spec-worker", "impl-worker"]);
    }
  });

  it("validates worker config with restrictions", () => {
    const config = {
      name: "code",
      description: "Implementation worker",
      tools: { edit: true, bash: false },
      prompt: "You are a worker...",
      level: AgentLevel.worker,
      parentMode: "orchestrator",
      fileRestrictions: [{ pattern: "src/**", access: "write" }],
      toolGroups: [{ group: "filesystem", enabled: true }],
    };

    const result = ExtendedModeConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.level).toBe(AgentLevel.worker);
      expect(result.data.parentMode).toBe("orchestrator");
      expect(result.data.fileRestrictions).toHaveLength(1);
      expect(result.data.toolGroups).toHaveLength(1);
    }
  });

  it("applies default maxConcurrentSubagents", () => {
    const config = {
      name: "code",
      description: "Orchestrator",
      tools: { edit: true, bash: true },
      prompt: "Orchestrate...",
      level: AgentLevel.orchestrator,
    };

    const result = ExtendedModeConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.maxConcurrentSubagents).toBe(DEFAULT_MAX_CONCURRENT_SUBAGENTS);
    }
  });

  it("allows custom maxConcurrentSubagents", () => {
    const config = {
      name: "code",
      description: "Orchestrator",
      tools: { edit: true, bash: true },
      prompt: "Orchestrate...",
      level: AgentLevel.orchestrator,
      maxConcurrentSubagents: 5,
    };

    const result = ExtendedModeConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.maxConcurrentSubagents).toBe(5);
    }
  });

  it("is backward compatible with base ModeConfig fields", () => {
    const config = {
      name: "plan",
      description: "Planning mode",
      tools: { edit: false, bash: "readonly" as const },
      prompt: "Plan carefully...",
      level: AgentLevel.workflow,
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

  it("rejects invalid level values", () => {
    const config = {
      name: "code",
      description: "Invalid",
      tools: { edit: true, bash: true },
      prompt: "...",
      level: 99, // Invalid level
    };

    const result = ExtendedModeConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("rejects invalid file access values", () => {
    const config = {
      name: "code",
      description: "Invalid",
      tools: { edit: true, bash: true },
      prompt: "...",
      level: AgentLevel.worker,
      fileRestrictions: [{ pattern: "src/**", access: "invalid" }],
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
      level: AgentLevel.orchestrator,
      canSpawnAgents: ["worker-1"],
      fileRestrictions: [{ pattern: "**/*", access: "write" }],
      toolGroups: [{ group: "filesystem", enabled: true, tools: ["read"] }],
      parentMode: "parent",
      maxConcurrentSubagents: 3,
    };

    // If this compiles, type inference is working
    expect(config.level).toBe(AgentLevel.orchestrator);
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
    expect(extended.level).toBe(AgentLevel.worker);
    expect(extended.canSpawnAgents).toEqual([]);
    expect(extended.fileRestrictions).toEqual([]);
    expect(extended.toolGroups).toEqual([]);
    expect(extended.parentMode).toBeUndefined();
    expect(extended.maxConcurrentSubagents).toBe(DEFAULT_MAX_CONCURRENT_SUBAGENTS);
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

      // All should have worker level by default (most restrictive)
      expect(extended.level).toBe(AgentLevel.worker);
      // All should have empty spawn list (cannot spawn)
      expect(extended.canSpawnAgents).toEqual([]);
      // All should validate against schema
      expect(ExtendedModeConfigSchema.safeParse(extended).success).toBe(true);
    }
  });
});
