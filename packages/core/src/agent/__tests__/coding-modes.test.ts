import { describe, expect, it } from "vitest";
import {
  BUILTIN_CODING_MODES,
  CODING_MODES,
  type CodingMode,
  type CodingModeConfig,
  CodingModeConfigSchema,
  CodingModeSchema,
  codingModeToCore,
  PLAN_MODE,
  SPEC_MODE,
  SPEC_PHASE_CONFIG,
  SPEC_PHASES,
  type SpecPhase,
  SpecPhaseSchema,
  VIBE_MODE,
} from "../coding-modes.js";
import { AgentLevel } from "../level.js";

describe("CodingModeSchema", () => {
  describe("valid modes", () => {
    it("should parse 'vibe' successfully", () => {
      expect(CodingModeSchema.parse("vibe")).toBe("vibe");
    });

    it("should parse 'plan' successfully", () => {
      expect(CodingModeSchema.parse("plan")).toBe("plan");
    });

    it("should parse 'spec' successfully", () => {
      expect(CodingModeSchema.parse("spec")).toBe("spec");
    });
  });

  describe("invalid modes", () => {
    it("should throw for invalid mode 'invalid'", () => {
      expect(() => CodingModeSchema.parse("invalid")).toThrow();
    });

    it("should throw for empty string", () => {
      expect(() => CodingModeSchema.parse("")).toThrow();
    });

    it("should throw for number input", () => {
      expect(() => CodingModeSchema.parse(123)).toThrow();
    });

    it("should throw for null input", () => {
      expect(() => CodingModeSchema.parse(null)).toThrow();
    });

    it("should throw for undefined input", () => {
      expect(() => CodingModeSchema.parse(undefined)).toThrow();
    });
  });

  describe("safeParse", () => {
    it("should return success for valid mode", () => {
      const result = CodingModeSchema.safeParse("vibe");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("vibe");
      }
    });

    it("should return failure for invalid mode", () => {
      const result = CodingModeSchema.safeParse("invalid");
      expect(result.success).toBe(false);
    });
  });
});

describe("CodingMode type", () => {
  it("should accept valid mode assignments", () => {
    const vibe: CodingMode = "vibe";
    const plan: CodingMode = "plan";
    const spec: CodingMode = "spec";

    expect(vibe).toBe("vibe");
    expect(plan).toBe("plan");
    expect(spec).toBe("spec");
  });
});

describe("CODING_MODES constant", () => {
  it("should contain all three modes", () => {
    expect(CODING_MODES).toHaveLength(3);
    expect(CODING_MODES).toContain("vibe");
    expect(CODING_MODES).toContain("plan");
    expect(CODING_MODES).toContain("spec");
  });

  it("should be a readonly array", () => {
    expect(Array.isArray(CODING_MODES)).toBe(true);
  });
});

// ============================================
// T010 & T011: CodingModeConfig & Schema Tests
// ============================================

describe("CodingModeConfigSchema", () => {
  describe("valid configurations", () => {
    it("should validate a complete CodingModeConfig object", () => {
      const config = {
        name: "code",
        codingMode: "vibe",
        description: "Test mode",
        tools: { edit: true, bash: true },
        prompt: "Test prompt",
        level: AgentLevel.worker,
        approvalPolicy: "full-auto",
        sandboxPolicy: "workspace-write",
        checkpointsRequired: false,
        checkpointCount: 0,
      };

      const result = CodingModeConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.codingMode).toBe("vibe");
        expect(result.data.approvalPolicy).toBe("full-auto");
      }
    });

    it("should validate VIBE_MODE constant", () => {
      const result = CodingModeConfigSchema.safeParse(VIBE_MODE);
      expect(result.success).toBe(true);
    });

    it("should validate PLAN_MODE constant", () => {
      const result = CodingModeConfigSchema.safeParse(PLAN_MODE);
      expect(result.success).toBe(true);
    });

    it("should validate SPEC_MODE constant", () => {
      const result = CodingModeConfigSchema.safeParse(SPEC_MODE);
      expect(result.success).toBe(true);
    });

    it("should accept optional systemPromptExtension", () => {
      const config = {
        name: "code",
        codingMode: "vibe",
        description: "Test mode",
        tools: { edit: true, bash: true },
        prompt: "Test prompt",
        level: AgentLevel.worker,
        approvalPolicy: "full-auto",
        sandboxPolicy: "workspace-write",
        checkpointsRequired: false,
        checkpointCount: 0,
        systemPromptExtension: "Additional instructions",
      };

      const result = CodingModeConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });
  });

  describe("invalid configurations", () => {
    it("should reject missing codingMode", () => {
      const config = {
        name: "code",
        description: "Test",
        tools: { edit: true, bash: true },
        prompt: "Test",
        level: AgentLevel.worker,
        approvalPolicy: "full-auto",
        sandboxPolicy: "workspace-write",
        checkpointsRequired: false,
        checkpointCount: 0,
      };

      const result = CodingModeConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it("should reject invalid codingMode value", () => {
      const config = {
        name: "code",
        codingMode: "invalid",
        description: "Test",
        tools: { edit: true, bash: true },
        prompt: "Test",
        level: AgentLevel.worker,
        approvalPolicy: "full-auto",
        sandboxPolicy: "workspace-write",
        checkpointsRequired: false,
        checkpointCount: 0,
      };

      const result = CodingModeConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it("should reject checkpointCount greater than 6", () => {
      const config = {
        name: "code",
        codingMode: "spec",
        description: "Test",
        tools: { edit: true, bash: true },
        prompt: "Test",
        level: AgentLevel.orchestrator,
        approvalPolicy: "suggest",
        sandboxPolicy: "workspace-read",
        checkpointsRequired: true,
        checkpointCount: 7,
      };

      const result = CodingModeConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it("should reject negative checkpointCount", () => {
      const config = {
        name: "code",
        codingMode: "vibe",
        description: "Test",
        tools: { edit: true, bash: true },
        prompt: "Test",
        level: AgentLevel.worker,
        approvalPolicy: "full-auto",
        sandboxPolicy: "workspace-write",
        checkpointsRequired: false,
        checkpointCount: -1,
      };

      const result = CodingModeConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it("should reject invalid approvalPolicy", () => {
      const config = {
        name: "code",
        codingMode: "vibe",
        description: "Test",
        tools: { edit: true, bash: true },
        prompt: "Test",
        level: AgentLevel.worker,
        approvalPolicy: "invalid-policy",
        sandboxPolicy: "workspace-write",
        checkpointsRequired: false,
        checkpointCount: 0,
      };

      const result = CodingModeConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it("should reject invalid sandboxPolicy", () => {
      const config = {
        name: "code",
        codingMode: "vibe",
        description: "Test",
        tools: { edit: true, bash: true },
        prompt: "Test",
        level: AgentLevel.worker,
        approvalPolicy: "full-auto",
        sandboxPolicy: "invalid-sandbox",
        checkpointsRequired: false,
        checkpointCount: 0,
      };

      const result = CodingModeConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });
  });
});

// ============================================
// T010b: codingModeToCore Tests
// ============================================

describe("codingModeToCore", () => {
  it("should extract only ModeConfig fields from VIBE_MODE", () => {
    const core = codingModeToCore(VIBE_MODE);

    expect(core.name).toBe(VIBE_MODE.name);
    expect(core.description).toBe(VIBE_MODE.description);
    expect(core.tools).toEqual(VIBE_MODE.tools);
    expect(core.prompt).toBe(VIBE_MODE.prompt);
    expect(core.temperature).toBe(VIBE_MODE.temperature);
    expect(core.maxTokens).toBe(VIBE_MODE.maxTokens);
    expect(core.extendedThinking).toBe(VIBE_MODE.extendedThinking);

    // Should NOT contain CodingModeConfig-specific fields
    expect((core as CodingModeConfig).codingMode).toBeUndefined();
    expect((core as CodingModeConfig).approvalPolicy).toBeUndefined();
    expect((core as CodingModeConfig).sandboxPolicy).toBeUndefined();
    expect((core as CodingModeConfig).checkpointsRequired).toBeUndefined();
    expect((core as CodingModeConfig).checkpointCount).toBeUndefined();
  });

  it("should convert PLAN_MODE correctly", () => {
    const core = codingModeToCore(PLAN_MODE);

    expect(core.name).toBe("plan");
    expect(core.tools).toEqual(PLAN_MODE.tools);
    // CodingModeConfig-specific fields should not exist
    expect((core as CodingModeConfig).codingMode).toBeUndefined();
  });

  it("should convert SPEC_MODE correctly", () => {
    const core = codingModeToCore(SPEC_MODE);

    expect(core.name).toBe("plan");
    // Prompt is now empty - MD files are loaded via createAgentFactory()
    expect(core.prompt).toBe("");
    // CodingModeConfig-specific fields should not exist
    expect((core as CodingModeConfig).codingMode).toBeUndefined();
  });
});

// ============================================
// T012: VIBE_MODE Tests
// ============================================

describe("VIBE_MODE", () => {
  it("should have codingMode set to 'vibe'", () => {
    expect(VIBE_MODE.codingMode).toBe("vibe");
  });

  it("should have agentName referencing the vibe agent", () => {
    expect(VIBE_MODE.agentName).toBe("vibe-agent");
  });

  it("should have approvalPolicy set to 'full-auto'", () => {
    expect(VIBE_MODE.approvalPolicy).toBe("full-auto");
  });

  it("should have sandboxPolicy set to 'full-access'", () => {
    expect(VIBE_MODE.sandboxPolicy).toBe("full-access");
  });

  it("should have checkpointsRequired set to false", () => {
    expect(VIBE_MODE.checkpointsRequired).toBe(false);
  });

  it("should have checkpointCount set to 0", () => {
    expect(VIBE_MODE.checkpointCount).toBe(0);
  });

  it("should have all tools enabled", () => {
    expect(VIBE_MODE.tools.edit).toBe(true);
    expect(VIBE_MODE.tools.bash).toBe(true);
  });
});

// ============================================
// T013: PLAN_MODE Tests
// ============================================

describe("PLAN_MODE", () => {
  it("should have codingMode set to 'plan'", () => {
    expect(PLAN_MODE.codingMode).toBe("plan");
  });

  it("should have agentName referencing the plan agent", () => {
    expect(PLAN_MODE.agentName).toBe("plan-agent");
  });

  it("should have approvalPolicy set to 'auto-edit'", () => {
    expect(PLAN_MODE.approvalPolicy).toBe("auto-edit");
  });

  it("should have sandboxPolicy set to 'workspace-write'", () => {
    expect(PLAN_MODE.sandboxPolicy).toBe("workspace-write");
  });

  it("should have checkpointsRequired set to true", () => {
    expect(PLAN_MODE.checkpointsRequired).toBe(true);
  });

  it("should have checkpointCount set to 1", () => {
    expect(PLAN_MODE.checkpointCount).toBe(1);
  });

  it("should have bash set to readonly initially", () => {
    expect(PLAN_MODE.tools.bash).toBe("readonly");
  });
});

// ============================================
// T014: SPEC_MODE Tests
// ============================================

describe("SPEC_MODE", () => {
  it("should have codingMode set to 'spec'", () => {
    expect(SPEC_MODE.codingMode).toBe("spec");
  });

  it("should have agentName referencing the spec orchestrator", () => {
    expect(SPEC_MODE.agentName).toBe("spec-orchestrator");
  });

  it("should have approvalPolicy set to 'suggest'", () => {
    expect(SPEC_MODE.approvalPolicy).toBe("suggest");
  });

  it("should have sandboxPolicy set to 'workspace-read'", () => {
    expect(SPEC_MODE.sandboxPolicy).toBe("workspace-read");
  });

  it("should have checkpointsRequired set to true", () => {
    expect(SPEC_MODE.checkpointsRequired).toBe(true);
  });

  it("should have checkpointCount set to 6", () => {
    expect(SPEC_MODE.checkpointCount).toBe(6);
  });

  // Note: canSpawnAgents is now in AgentConfig (via spec-orchestrator agent)
  // The mode references the agent via agentName

  it("should have edit disabled initially", () => {
    expect(SPEC_MODE.tools.edit).toBe(false);
  });
});

// ============================================
// T015: BUILTIN_CODING_MODES Tests
// ============================================

describe("BUILTIN_CODING_MODES", () => {
  it("should contain exactly 3 modes", () => {
    expect(Object.keys(BUILTIN_CODING_MODES)).toHaveLength(3);
  });

  it("should have vibe, plan, and spec keys", () => {
    expect(BUILTIN_CODING_MODES.vibe).toBeDefined();
    expect(BUILTIN_CODING_MODES.plan).toBeDefined();
    expect(BUILTIN_CODING_MODES.spec).toBeDefined();
  });

  it("should map vibe to VIBE_MODE", () => {
    expect(BUILTIN_CODING_MODES.vibe).toBe(VIBE_MODE);
  });

  it("should map plan to PLAN_MODE", () => {
    expect(BUILTIN_CODING_MODES.plan).toBe(PLAN_MODE);
  });

  it("should map spec to SPEC_MODE", () => {
    expect(BUILTIN_CODING_MODES.spec).toBe(SPEC_MODE);
  });

  it("should validate all modes against schema", () => {
    for (const [key, config] of Object.entries(BUILTIN_CODING_MODES)) {
      const result = CodingModeConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.codingMode).toBe(key);
      }
    }
  });

  it("should be type-safe as Record<CodingMode, CodingModeConfig>", () => {
    const modes: Record<CodingMode, CodingModeConfig> = BUILTIN_CODING_MODES;
    expect(modes.vibe.codingMode).toBe("vibe");
    expect(modes.plan.codingMode).toBe("plan");
    expect(modes.spec.codingMode).toBe("spec");
  });
});

// ============================================
// T016: SpecPhase Tests
// ============================================

describe("SpecPhaseSchema", () => {
  describe("valid phases", () => {
    it("should parse 'research' successfully", () => {
      expect(SpecPhaseSchema.parse("research")).toBe("research");
    });

    it("should parse 'requirements' successfully", () => {
      expect(SpecPhaseSchema.parse("requirements")).toBe("requirements");
    });

    it("should parse 'design' successfully", () => {
      expect(SpecPhaseSchema.parse("design")).toBe("design");
    });

    it("should parse 'tasks' successfully", () => {
      expect(SpecPhaseSchema.parse("tasks")).toBe("tasks");
    });

    it("should parse 'implementation' successfully", () => {
      expect(SpecPhaseSchema.parse("implementation")).toBe("implementation");
    });

    it("should parse 'validation' successfully", () => {
      expect(SpecPhaseSchema.parse("validation")).toBe("validation");
    });
  });

  describe("invalid phases", () => {
    it("should throw for invalid phase", () => {
      expect(() => SpecPhaseSchema.parse("invalid")).toThrow();
    });

    it("should throw for empty string", () => {
      expect(() => SpecPhaseSchema.parse("")).toThrow();
    });
  });
});

describe("SPEC_PHASES constant", () => {
  it("should contain all 6 phases", () => {
    expect(SPEC_PHASES).toHaveLength(6);
    expect(SPEC_PHASES).toContain("research");
    expect(SPEC_PHASES).toContain("requirements");
    expect(SPEC_PHASES).toContain("design");
    expect(SPEC_PHASES).toContain("tasks");
    expect(SPEC_PHASES).toContain("implementation");
    expect(SPEC_PHASES).toContain("validation");
  });
});

describe("SPEC_PHASE_CONFIG", () => {
  it("should have configs for all 6 phases", () => {
    expect(Object.keys(SPEC_PHASE_CONFIG)).toHaveLength(6);
  });

  describe("research phase", () => {
    it("should be phase number 1", () => {
      expect(SPEC_PHASE_CONFIG.research.phaseNumber).toBe(1);
    });

    it("should have read-only tool access", () => {
      expect(SPEC_PHASE_CONFIG.research.toolAccess).toBe("read-only");
    });

    it("should deliver research.md", () => {
      expect(SPEC_PHASE_CONFIG.research.deliverables).toContain("research.md");
    });
  });

  describe("requirements phase", () => {
    it("should be phase number 2", () => {
      expect(SPEC_PHASE_CONFIG.requirements.phaseNumber).toBe(2);
    });

    it("should have read-only tool access", () => {
      expect(SPEC_PHASE_CONFIG.requirements.toolAccess).toBe("read-only");
    });

    it("should deliver requirements.md", () => {
      expect(SPEC_PHASE_CONFIG.requirements.deliverables).toContain("requirements.md");
    });
  });

  describe("design phase", () => {
    it("should be phase number 3", () => {
      expect(SPEC_PHASE_CONFIG.design.phaseNumber).toBe(3);
    });

    it("should have read-only tool access", () => {
      expect(SPEC_PHASE_CONFIG.design.toolAccess).toBe("read-only");
    });

    it("should deliver design.md", () => {
      expect(SPEC_PHASE_CONFIG.design.deliverables).toContain("design.md");
    });
  });

  describe("tasks phase", () => {
    it("should be phase number 4", () => {
      expect(SPEC_PHASE_CONFIG.tasks.phaseNumber).toBe(4);
    });

    it("should have read-only tool access", () => {
      expect(SPEC_PHASE_CONFIG.tasks.toolAccess).toBe("read-only");
    });

    it("should deliver tasks.md", () => {
      expect(SPEC_PHASE_CONFIG.tasks.deliverables).toContain("tasks.md");
    });
  });

  describe("implementation phase", () => {
    it("should be phase number 5", () => {
      expect(SPEC_PHASE_CONFIG.implementation.phaseNumber).toBe(5);
    });

    it("should have full tool access", () => {
      expect(SPEC_PHASE_CONFIG.implementation.toolAccess).toBe("full");
    });

    it("should have variable deliverables (empty array)", () => {
      expect(SPEC_PHASE_CONFIG.implementation.deliverables).toHaveLength(0);
    });
  });

  describe("validation phase", () => {
    it("should be phase number 6", () => {
      expect(SPEC_PHASE_CONFIG.validation.phaseNumber).toBe(6);
    });

    it("should have read-test tool access", () => {
      expect(SPEC_PHASE_CONFIG.validation.toolAccess).toBe("read-test");
    });

    it("should deliver validation-report.md", () => {
      expect(SPEC_PHASE_CONFIG.validation.deliverables).toContain("validation-report.md");
    });
  });

  describe("phase ordering", () => {
    it("should have sequential phase numbers from 1 to 6", () => {
      const phases: SpecPhase[] = [
        "research",
        "requirements",
        "design",
        "tasks",
        "implementation",
        "validation",
      ];
      phases.forEach((phase, index) => {
        expect(SPEC_PHASE_CONFIG[phase].phaseNumber).toBe(index + 1);
      });
    });

    it("should only allow writes in implementation phase", () => {
      const writePhases = Object.entries(SPEC_PHASE_CONFIG).filter(
        ([, config]) => config.toolAccess === "full"
      );
      expect(writePhases).toHaveLength(1);
      expect(writePhases[0]?.[0]).toBe("implementation");
    });
  });
});
