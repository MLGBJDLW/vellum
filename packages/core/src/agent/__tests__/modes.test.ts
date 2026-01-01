import { describe, expect, it } from "vitest";
import {
  AGENT_MODES,
  AgentModeSchema,
  canEdit,
  getBashPermission,
  getModeConfig,
  getTemperature,
  MODE_CONFIGS,
  ModeConfigSchema,
  ToolPermissionsSchema,
} from "../modes.js";

describe("AgentModeSchema", () => {
  describe("valid modes", () => {
    it("validates 'plan' mode", () => {
      expect(AgentModeSchema.safeParse("plan").success).toBe(true);
    });

    it("validates 'code' mode", () => {
      expect(AgentModeSchema.safeParse("code").success).toBe(true);
    });

    it("validates 'draft' mode", () => {
      expect(AgentModeSchema.safeParse("draft").success).toBe(true);
    });

    it("validates 'debug' mode", () => {
      expect(AgentModeSchema.safeParse("debug").success).toBe(true);
    });

    it("validates 'ask' mode", () => {
      expect(AgentModeSchema.safeParse("ask").success).toBe(true);
    });
  });

  describe("invalid modes", () => {
    it("rejects unknown mode names", () => {
      expect(AgentModeSchema.safeParse("unknown").success).toBe(false);
      expect(AgentModeSchema.safeParse("execute").success).toBe(false);
      expect(AgentModeSchema.safeParse("review").success).toBe(false);
    });

    it("rejects empty string", () => {
      expect(AgentModeSchema.safeParse("").success).toBe(false);
    });

    it("rejects non-string values", () => {
      expect(AgentModeSchema.safeParse(0).success).toBe(false);
      expect(AgentModeSchema.safeParse(null).success).toBe(false);
      expect(AgentModeSchema.safeParse(undefined).success).toBe(false);
      expect(AgentModeSchema.safeParse({}).success).toBe(false);
    });

    it("is case-sensitive", () => {
      expect(AgentModeSchema.safeParse("PLAN").success).toBe(false);
      expect(AgentModeSchema.safeParse("Code").success).toBe(false);
      expect(AgentModeSchema.safeParse("DEBUG").success).toBe(false);
    });

    it("provides descriptive error messages", () => {
      const result = AgentModeSchema.safeParse("invalid");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.length).toBeGreaterThan(0);
        expect(result.error.issues[0]?.message).toBeDefined();
      }
    });
  });
});

describe("AGENT_MODES", () => {
  it("contains all 5 modes", () => {
    expect(AGENT_MODES).toHaveLength(5);
  });

  it("contains expected modes in order", () => {
    expect(AGENT_MODES).toEqual(["plan", "code", "draft", "debug", "ask"]);
  });

  it("is typed as readonly array", () => {
    // AGENT_MODES uses TypeScript's const assertion for compile-time readonly
    // Verify it's an array (runtime check)
    expect(Array.isArray(AGENT_MODES)).toBe(true);
  });
});

describe("ToolPermissionsSchema", () => {
  describe("valid configurations", () => {
    it("validates minimal config (edit + bash required)", () => {
      const result = ToolPermissionsSchema.safeParse({ edit: true, bash: true });
      expect(result.success).toBe(true);
    });

    it("validates full config with all options", () => {
      const result = ToolPermissionsSchema.safeParse({
        edit: true,
        bash: true,
        web: true,
        mcp: false,
      });
      expect(result.success).toBe(true);
    });

    it("validates bash: false", () => {
      const result = ToolPermissionsSchema.safeParse({ edit: false, bash: false });
      expect(result.success).toBe(true);
    });

    it('validates bash: "readonly"', () => {
      const result = ToolPermissionsSchema.safeParse({ edit: false, bash: "readonly" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.bash).toBe("readonly");
      }
    });
  });

  describe("invalid configurations", () => {
    it("rejects missing edit field", () => {
      const result = ToolPermissionsSchema.safeParse({ bash: true });
      expect(result.success).toBe(false);
    });

    it("rejects missing bash field", () => {
      const result = ToolPermissionsSchema.safeParse({ edit: true });
      expect(result.success).toBe(false);
    });

    it('rejects invalid bash values (only true/false/"readonly" allowed)', () => {
      expect(ToolPermissionsSchema.safeParse({ edit: true, bash: "full" }).success).toBe(false);
      expect(ToolPermissionsSchema.safeParse({ edit: true, bash: "write" }).success).toBe(false);
      expect(ToolPermissionsSchema.safeParse({ edit: true, bash: 1 }).success).toBe(false);
    });

    it("rejects non-boolean edit values", () => {
      expect(ToolPermissionsSchema.safeParse({ edit: "true", bash: true }).success).toBe(false);
      expect(ToolPermissionsSchema.safeParse({ edit: 1, bash: true }).success).toBe(false);
    });
  });
});

describe("ModeConfigSchema", () => {
  const validBaseConfig = {
    name: "code",
    description: "Code mode",
    tools: { edit: true, bash: true },
    prompt: "You are a coder...",
  };

  describe("required fields", () => {
    it("requires name", () => {
      const { name: _, ...withoutName } = validBaseConfig;
      expect(ModeConfigSchema.safeParse(withoutName).success).toBe(false);
    });

    it("requires description", () => {
      const { description: _, ...withoutDesc } = validBaseConfig;
      expect(ModeConfigSchema.safeParse(withoutDesc).success).toBe(false);
    });

    it("requires tools", () => {
      const { tools: _, ...withoutTools } = validBaseConfig;
      expect(ModeConfigSchema.safeParse(withoutTools).success).toBe(false);
    });

    it("requires prompt", () => {
      const { prompt: _, ...withoutPrompt } = validBaseConfig;
      expect(ModeConfigSchema.safeParse(withoutPrompt).success).toBe(false);
    });
  });

  describe("optional fields", () => {
    it("accepts temperature between 0 and 1", () => {
      expect(ModeConfigSchema.safeParse({ ...validBaseConfig, temperature: 0 }).success).toBe(true);
      expect(ModeConfigSchema.safeParse({ ...validBaseConfig, temperature: 0.5 }).success).toBe(
        true
      );
      expect(ModeConfigSchema.safeParse({ ...validBaseConfig, temperature: 1 }).success).toBe(true);
    });

    it("rejects temperature outside 0-1 range", () => {
      expect(ModeConfigSchema.safeParse({ ...validBaseConfig, temperature: -0.1 }).success).toBe(
        false
      );
      expect(ModeConfigSchema.safeParse({ ...validBaseConfig, temperature: 1.1 }).success).toBe(
        false
      );
      expect(ModeConfigSchema.safeParse({ ...validBaseConfig, temperature: 2 }).success).toBe(
        false
      );
    });

    it("accepts positive maxTokens", () => {
      expect(ModeConfigSchema.safeParse({ ...validBaseConfig, maxTokens: 1 }).success).toBe(true);
      expect(ModeConfigSchema.safeParse({ ...validBaseConfig, maxTokens: 4096 }).success).toBe(
        true
      );
    });

    it("rejects non-positive maxTokens", () => {
      expect(ModeConfigSchema.safeParse({ ...validBaseConfig, maxTokens: 0 }).success).toBe(false);
      expect(ModeConfigSchema.safeParse({ ...validBaseConfig, maxTokens: -1 }).success).toBe(false);
    });

    it("accepts extendedThinking boolean", () => {
      expect(
        ModeConfigSchema.safeParse({ ...validBaseConfig, extendedThinking: true }).success
      ).toBe(true);
      expect(
        ModeConfigSchema.safeParse({ ...validBaseConfig, extendedThinking: false }).success
      ).toBe(true);
    });
  });
});

describe("MODE_CONFIGS", () => {
  it("has configuration for all modes", () => {
    for (const mode of AGENT_MODES) {
      expect(MODE_CONFIGS[mode]).toBeDefined();
      expect(MODE_CONFIGS[mode].name).toBe(mode);
    }
  });

  it("all configurations pass schema validation", () => {
    for (const mode of AGENT_MODES) {
      const result = ModeConfigSchema.safeParse(MODE_CONFIGS[mode]);
      expect(result.success).toBe(true);
    }
  });

  it("is typed as const (readonly at compile-time)", () => {
    // MODE_CONFIGS uses TypeScript's const assertion
    // Verify it's an object with expected shape (runtime check)
    expect(typeof MODE_CONFIGS).toBe("object");
    expect(Object.keys(MODE_CONFIGS)).toHaveLength(5);
  });

  describe("plan mode", () => {
    it("has read-only permissions (edit: false, bash: readonly)", () => {
      expect(MODE_CONFIGS.plan.tools.edit).toBe(false);
      expect(MODE_CONFIGS.plan.tools.bash).toBe("readonly");
    });

    it("has extended thinking enabled", () => {
      expect(MODE_CONFIGS.plan.extendedThinking).toBe(true);
    });
  });

  describe("code mode", () => {
    it("has full permissions (edit: true, bash: true)", () => {
      expect(MODE_CONFIGS.code.tools.edit).toBe(true);
      expect(MODE_CONFIGS.code.tools.bash).toBe(true);
    });
  });

  describe("ask mode", () => {
    it("has no edit or bash permissions", () => {
      expect(MODE_CONFIGS.ask.tools.edit).toBe(false);
      expect(MODE_CONFIGS.ask.tools.bash).toBe(false);
    });
  });
});

describe("getModeConfig", () => {
  it("returns correct config for each mode", () => {
    expect(getModeConfig("plan")).toBe(MODE_CONFIGS.plan);
    expect(getModeConfig("code")).toBe(MODE_CONFIGS.code);
    expect(getModeConfig("draft")).toBe(MODE_CONFIGS.draft);
    expect(getModeConfig("debug")).toBe(MODE_CONFIGS.debug);
    expect(getModeConfig("ask")).toBe(MODE_CONFIGS.ask);
  });

  it("returns the same reference as MODE_CONFIGS", () => {
    for (const mode of AGENT_MODES) {
      expect(getModeConfig(mode)).toBe(MODE_CONFIGS[mode]);
    }
  });
});

describe("canEdit", () => {
  it("returns false for plan mode", () => {
    expect(canEdit("plan")).toBe(false);
  });

  it("returns true for code mode", () => {
    expect(canEdit("code")).toBe(true);
  });

  it("returns true for draft mode", () => {
    expect(canEdit("draft")).toBe(true);
  });

  it("returns true for debug mode", () => {
    expect(canEdit("debug")).toBe(true);
  });

  it("returns false for ask mode", () => {
    expect(canEdit("ask")).toBe(false);
  });
});

describe("getBashPermission", () => {
  it('returns "readonly" for plan mode', () => {
    expect(getBashPermission("plan")).toBe("readonly");
  });

  it("returns true for code mode", () => {
    expect(getBashPermission("code")).toBe(true);
  });

  it("returns true for draft mode", () => {
    expect(getBashPermission("draft")).toBe(true);
  });

  it("returns true for debug mode", () => {
    expect(getBashPermission("debug")).toBe(true);
  });

  it("returns false for ask mode", () => {
    expect(getBashPermission("ask")).toBe(false);
  });
});

describe("getTemperature", () => {
  it("returns configured temperature for plan mode", () => {
    expect(getTemperature("plan")).toBe(0.3);
  });

  it("returns configured temperature for code mode", () => {
    expect(getTemperature("code")).toBe(0.2);
  });

  it("returns configured temperature for draft mode", () => {
    expect(getTemperature("draft")).toBe(0.8);
  });

  it("returns configured temperature for debug mode", () => {
    expect(getTemperature("debug")).toBe(0.1);
  });

  it("returns configured temperature for ask mode", () => {
    expect(getTemperature("ask")).toBe(0.5);
  });

  it("all temperatures are within valid range [0, 1]", () => {
    for (const mode of AGENT_MODES) {
      const temp = getTemperature(mode);
      expect(temp).toBeGreaterThanOrEqual(0);
      expect(temp).toBeLessThanOrEqual(1);
    }
  });
});
