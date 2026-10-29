import { describe, expect, it } from "vitest";
import { createAgentFactory } from "../agent-factory.js";
import { ORCH_MODE } from "../coding-modes.js";
import { normalizeMode } from "../legacy-modes.js";
import { ModeManager } from "../mode-manager.js";

describe("personal assistant entry", () => {
  it("starts as an orchestrator with useful tools and existing approval boundaries", async () => {
    const manager = new ModeManager();
    expect(manager.getCurrentMode()).toBe("orch");
    expect(manager.getCurrentAgentConfig()).toMatchObject({ level: 0, canSpawnAgents: true });
    const result = await manager
      .getCurrentHandler()
      .processMessage({ content: "Help organize my research notes" });
    expect(result.shouldContinue).toBe(true);
    expect(result.requiresCheckpoint).not.toBe(true);
    expect(ORCH_MODE.tools).toMatchObject({ edit: true, web: true, mcp: true });
    expect(ORCH_MODE.approvalPolicy).toBe("auto-edit");
    expect(ORCH_MODE.sandboxPolicy).toBe("workspace-write");
    expect(ORCH_MODE.toolGroups?.find((group) => group.group === "shell")?.autoApprove).toBe(false);
  });

  it("returns from explicit legacy workflows to the same assistant", async () => {
    const manager = new ModeManager({ initialMode: "plan" });
    expect((await manager.switchMode("orch")).success).toBe(true);
    expect(manager.getCurrentAgentConfig()?.name).toBe("orch-agent");
    expect(normalizeMode("orch").mode).toBe("orch");
    expect(normalizeMode("vibe").mode).toBe("vibe");
  });

  it("loads the personal assistant role through the existing prompt factory", async () => {
    const agent = await createAgentFactory({
      cwd: process.cwd(),
      mode: "orch",
      enableHotReload: false,
    });
    try {
      expect(agent.effectiveRole).toBe("orchestrator");
      agent.promptBuilder.withCustomInstructions("Keep the user's formatting preference.");
      await agent.promptBuilder.replaceExternalWorkflow("coder", "plan");
      await agent.promptBuilder.replaceExternalWorkflow("orchestrator", "orch");
      await agent.promptBuilder.replaceExternalWorkflow("orchestrator", "orch");
      const prompt = agent.promptBuilder.build();
      expect(prompt).toContain("Keep the user's formatting preference.");
      expect(prompt).toContain("# Core Identity");
      expect(prompt.match(/# Orchestrator workflow/g)).toHaveLength(1);
      expect(prompt).not.toContain("# Plan Mode");
      agent.promptBuilder.withSystemPromptOverride("User override");
      await agent.promptBuilder.replaceExternalWorkflow("coder", "vibe");
      expect(agent.promptBuilder.build()).toContain("User override");
    } finally {
      agent.cleanup();
    }
  });
});
