// ============================================
// Role Prompts Unit Tests
// ============================================

/**
 * Unit tests for the agent role prompt system.
 *
 * Tests cover:
 * - BASE_PROMPT: Safety guardrails and content stability
 * - loadRolePrompt(): Correct prompt loading for each role
 * - Individual role prompts: Required keywords and content
 * - Safety verification: Content integrity checks
 *
 * @module @vellum/core/prompts/__tests__/roles
 */

import { describe, expect, it } from "vitest";
import {
  ANALYST_PROMPT,
  ARCHITECT_PROMPT,
  BASE_PROMPT,
  CODER_PROMPT,
  loadRolePrompt,
  ORCHESTRATOR_PROMPT,
  QA_PROMPT,
  WRITER_PROMPT,
} from "../roles/index.js";

// =============================================================================
// BASE_PROMPT Tests
// =============================================================================

describe("BASE_PROMPT", () => {
  describe("content stability", () => {
    it("matches snapshot", () => {
      expect(BASE_PROMPT).toMatchSnapshot();
    });
  });

  describe("safety guardrails", () => {
    it("contains safety guardrails section", () => {
      expect(BASE_PROMPT).toContain("Safety Guardrails");
    });

    it("contains ABSOLUTE RULES marker", () => {
      expect(BASE_PROMPT).toContain("ABSOLUTE RULES");
    });

    it("includes no unconfirmed destruction rule", () => {
      expect(BASE_PROMPT).toContain("No Unconfirmed Destruction");
    });

    it("includes no secret exposure rule", () => {
      expect(BASE_PROMPT).toContain("No Secret Exposure");
    });

    it("includes no workspace escape rule", () => {
      expect(BASE_PROMPT).toContain("No Workspace Escape");
    });

    it("includes no blind execution rule", () => {
      expect(BASE_PROMPT).toContain("No Blind Execution");
    });

    it("includes no permission bypass rule", () => {
      expect(BASE_PROMPT).toContain("No Permission Bypass");
    });
  });

  describe("core sections", () => {
    it("contains core identity section", () => {
      expect(BASE_PROMPT).toContain("Core Identity");
    });

    it("contains tool guidelines section", () => {
      expect(BASE_PROMPT).toContain("Tool Guidelines");
    });

    it("contains response format section", () => {
      expect(BASE_PROMPT).toContain("Response Format");
    });

    it("contains error handling section", () => {
      expect(BASE_PROMPT).toContain("Error Handling");
    });
  });
});

// =============================================================================
// loadRolePrompt Tests
// =============================================================================

describe("loadRolePrompt", () => {
  describe("valid roles", () => {
    it("returns correct prompt for orchestrator role", () => {
      const result = loadRolePrompt("orchestrator");
      expect(result).toBe(ORCHESTRATOR_PROMPT);
    });

    it("returns correct prompt for coder role", () => {
      const result = loadRolePrompt("coder");
      expect(result).toBe(CODER_PROMPT);
    });

    it("returns correct prompt for qa role", () => {
      const result = loadRolePrompt("qa");
      expect(result).toBe(QA_PROMPT);
    });

    it("returns correct prompt for writer role", () => {
      const result = loadRolePrompt("writer");
      expect(result).toBe(WRITER_PROMPT);
    });

    it("returns correct prompt for analyst role", () => {
      const result = loadRolePrompt("analyst");
      expect(result).toBe(ANALYST_PROMPT);
    });

    it("returns correct prompt for architect role", () => {
      const result = loadRolePrompt("architect");
      expect(result).toBe(ARCHITECT_PROMPT);
    });
  });

  describe("invalid roles", () => {
    it("returns empty string for invalid role", () => {
      // @ts-expect-error - Testing invalid input
      const result = loadRolePrompt("invalid");
      expect(result).toBe("");
    });

    it("returns empty string for undefined role", () => {
      // @ts-expect-error - Testing invalid input
      const result = loadRolePrompt(undefined);
      expect(result).toBe("");
    });

    it("returns empty string for empty string role", () => {
      // @ts-expect-error - Testing invalid input
      const result = loadRolePrompt("");
      expect(result).toBe("");
    });
  });
});

// =============================================================================
// Individual Role Prompt Tests
// =============================================================================

describe("ORCHESTRATOR_PROMPT", () => {
  it("matches snapshot", () => {
    expect(ORCHESTRATOR_PROMPT).toMatchSnapshot();
  });

  it("contains Level 0 designation", () => {
    expect(ORCHESTRATOR_PROMPT).toContain("Level 0");
  });

  it("contains delegation keywords", () => {
    expect(ORCHESTRATOR_PROMPT).toMatch(/delegat(e|ion)/i);
  });

  it("contains task routing references", () => {
    expect(ORCHESTRATOR_PROMPT).toContain("Task Routing");
  });

  it("references subagents", () => {
    expect(ORCHESTRATOR_PROMPT).toMatch(/subagent|agent/i);
  });
});

describe("CODER_PROMPT", () => {
  it("matches snapshot", () => {
    expect(CODER_PROMPT).toMatchSnapshot();
  });

  it("contains Level 2 designation", () => {
    expect(CODER_PROMPT).toContain("Level 2");
  });

  it("contains code quality keywords", () => {
    expect(CODER_PROMPT).toMatch(/quality|standard/i);
  });

  it("contains implementation references", () => {
    expect(CODER_PROMPT).toMatch(/implement/i);
  });

  it("contains testing expectations", () => {
    expect(CODER_PROMPT).toContain("Testing Expectations");
  });

  it("contains file editing rules", () => {
    expect(CODER_PROMPT).toContain("File Editing Rules");
  });
});

describe("QA_PROMPT", () => {
  it("matches snapshot", () => {
    expect(QA_PROMPT).toMatchSnapshot();
  });

  it("contains Level 2 designation", () => {
    expect(QA_PROMPT).toContain("Level 2");
  });

  it("contains testing keywords", () => {
    expect(QA_PROMPT).toMatch(/test|testing/i);
  });

  it("contains debugging keywords", () => {
    expect(QA_PROMPT).toMatch(/debug|debugging/i);
  });

  it("contains bug hunting references", () => {
    expect(QA_PROMPT).toContain("Bug Hunting");
  });

  it("contains coverage expectations", () => {
    expect(QA_PROMPT).toContain("Coverage Expectations");
  });
});

describe("WRITER_PROMPT", () => {
  it("matches snapshot", () => {
    expect(WRITER_PROMPT).toMatchSnapshot();
  });

  it("contains Level 2 designation", () => {
    expect(WRITER_PROMPT).toContain("Level 2");
  });

  it("contains documentation keywords", () => {
    expect(WRITER_PROMPT).toMatch(/document|documentation/i);
  });

  it("contains writing style references", () => {
    expect(WRITER_PROMPT).toContain("Writing Style");
  });

  it("contains template workflow", () => {
    expect(WRITER_PROMPT).toContain("Template Workflow");
  });

  it("references file permissions", () => {
    expect(WRITER_PROMPT).toContain("File Permissions");
  });
});

describe("ANALYST_PROMPT", () => {
  it("matches snapshot", () => {
    expect(ANALYST_PROMPT).toMatchSnapshot();
  });

  it("contains Level 2 designation", () => {
    expect(ANALYST_PROMPT).toContain("Level 2");
  });

  it("contains read-only keywords", () => {
    expect(ANALYST_PROMPT).toMatch(/read-only|read only/i);
  });

  it("contains allowed operations section", () => {
    expect(ANALYST_PROMPT).toContain("Allowed Operations");
  });

  it("contains forbidden operations section", () => {
    expect(ANALYST_PROMPT).toContain("Forbidden Operations");
  });

  it("contains tracing references", () => {
    expect(ANALYST_PROMPT).toMatch(/trac(e|ing)/i);
  });
});

describe("ARCHITECT_PROMPT", () => {
  it("matches snapshot", () => {
    expect(ARCHITECT_PROMPT).toMatchSnapshot();
  });

  it("contains Level 2 designation", () => {
    expect(ARCHITECT_PROMPT).toContain("Level 2");
  });

  it("contains design keywords", () => {
    expect(ARCHITECT_PROMPT).toMatch(/design/i);
  });

  it("contains ADR references", () => {
    expect(ARCHITECT_PROMPT).toContain("ADR");
  });

  it("contains architecture references", () => {
    expect(ARCHITECT_PROMPT).toMatch(/architect/i);
  });

  it("contains trade-off references", () => {
    expect(ARCHITECT_PROMPT).toMatch(/trade-off|tradeoff/i);
  });
});

// =============================================================================
// Safety Verification Tests
// =============================================================================

describe("Safety Verification", () => {
  describe("prompt content integrity", () => {
    it("BASE_PROMPT starts with valid content (no injection)", () => {
      // Should not start with whitespace-only or suspicious patterns
      expect(BASE_PROMPT.trim()).not.toBe("");
      expect(BASE_PROMPT.trimStart()).toMatch(/^[#\n]/);
    });

    it("BASE_PROMPT safety section is not empty", () => {
      const safetyMatch = BASE_PROMPT.match(/Safety Guardrails[\s\S]*?(?=\n#|$)/);
      expect(safetyMatch).not.toBeNull();
      expect(safetyMatch?.[0].length).toBeGreaterThan(100);
    });

    it("all role prompts start with valid headers", () => {
      const prompts = [
        { name: "ORCHESTRATOR", prompt: ORCHESTRATOR_PROMPT },
        { name: "CODER", prompt: CODER_PROMPT },
        { name: "QA", prompt: QA_PROMPT },
        { name: "WRITER", prompt: WRITER_PROMPT },
        { name: "ANALYST", prompt: ANALYST_PROMPT },
        { name: "ARCHITECT", prompt: ARCHITECT_PROMPT },
      ];

      for (const { name, prompt } of prompts) {
        expect(prompt.trim(), `${name}_PROMPT should not be empty`).not.toBe("");
        expect(prompt.trimStart(), `${name}_PROMPT should start with header`).toMatch(/^#/);
      }
    });

    it("all role prompts contain their role name", () => {
      expect(ORCHESTRATOR_PROMPT.toLowerCase()).toContain("orchestrator");
      expect(CODER_PROMPT.toLowerCase()).toContain("coder");
      expect(QA_PROMPT.toLowerCase()).toContain("qa");
      expect(WRITER_PROMPT.toLowerCase()).toContain("writer");
      expect(ANALYST_PROMPT.toLowerCase()).toContain("analyst");
      expect(ARCHITECT_PROMPT.toLowerCase()).toContain("architect");
    });
  });

  describe("prompt size validation", () => {
    it("BASE_PROMPT is within reasonable size limits", () => {
      // Prompts should be substantial but not excessively large
      expect(BASE_PROMPT.length).toBeGreaterThan(500);
      expect(BASE_PROMPT.length).toBeLessThan(50000);
    });

    it("all role prompts have reasonable sizes", () => {
      const prompts = [
        ORCHESTRATOR_PROMPT,
        CODER_PROMPT,
        QA_PROMPT,
        WRITER_PROMPT,
        ANALYST_PROMPT,
        ARCHITECT_PROMPT,
      ];

      for (const prompt of prompts) {
        expect(prompt.length).toBeGreaterThan(200);
        expect(prompt.length).toBeLessThan(50000);
      }
    });
  });
});
