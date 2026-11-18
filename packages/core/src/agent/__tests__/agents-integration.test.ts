// ============================================
// AGENTS.md Integration Tests
// ============================================

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionAgentsIntegration } from "../../context/agents/session-integration.js";
import { createUserMessage, LLM, SessionParts } from "../../session/index.js";
import { AgentLoop, type AgentLoopConfig } from "../loop.js";
import { MODE_CONFIGS } from "../modes.js";

describe("AGENTS.md Integration", () => {
  let tempDir: string;
  let loop: AgentLoop | undefined;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "vellum-agents-test-"));
  });

  afterEach(async () => {
    await loop?.cancel("test cleanup", { closeSession: true });
    loop = undefined;
    vi.restoreAllMocks();
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should initialize without AGENTS.md file (backward compatibility)", async () => {
    const config: AgentLoopConfig = {
      sessionId: "test-session",
      mode: MODE_CONFIGS.code,
      providerType: "anthropic",
      model: "claude-3-5-sonnet-20241022",
      cwd: tempDir,
      enableAgentsIntegration: true,
    };

    loop = new AgentLoop(config);
    expect(loop.getState()).toBe("idle");
  });

  it("should work without enableAgentsIntegration flag", async () => {
    const config: AgentLoopConfig = {
      sessionId: "test-session",
      mode: MODE_CONFIGS.code,
      providerType: "anthropic",
      model: "claude-3-5-sonnet-20241022",
      cwd: tempDir,
    };

    loop = new AgentLoop(config);
    expect(loop.getState()).toBe("idle");
  });

  it("should load AGENTS.md configuration when available", async () => {
    // Create a simple AGENTS.md file
    const agentsContent = `# Agents Configuration

## Allowed Tools
- @readonly
- Bash

## Instructions
Test instruction for agents.
`;

    await writeFile(join(tempDir, "AGENTS.md"), agentsContent, "utf-8");

    const config: AgentLoopConfig = {
      sessionId: "test-session",
      mode: MODE_CONFIGS.code,
      providerType: "anthropic",
      model: "claude-3-5-sonnet-20241022",
      cwd: tempDir,
      enableAgentsIntegration: true,
    };

    const initialize = vi.spyOn(SessionAgentsIntegration.prototype, "initialize");
    loop = new AgentLoop(config);
    expect(loop.getState()).toBe("idle");

    await initialize.mock.results[0]?.value;
    const integration = initialize.mock.contexts[0] as SessionAgentsIntegration | undefined;
    expect(integration?.getConfig()?.instructions).toContain("Test instruction");
    await loop.cancel("user_escape");
    expect(integration?.getState()).toBe("ready");
    expect(integration?.getSystemPromptStrings().join("\n")).toContain("Test instruction");
    expect(integration?.getToolFilter().isAllowed("unlisted_tool")).toBe(false);
    const request = vi
      .spyOn(LLM, "stream")
      .mockImplementationOnce(async function* () {
        yield { type: "toolCall", id: "blocked", name: "unlisted_tool", input: {} };
        yield { type: "done", stopReason: "tool_use" };
      })
      .mockImplementation(async function* () {
        yield { type: "text", content: "Done" };
        yield { type: "done", stopReason: "end_turn" };
      });
    const blocked = vi.fn();
    loop.on("error", blocked);
    loop.addMessage(createUserMessage([SessionParts.text("Continue after Esc")]));
    await loop.run();
    expect(request.mock.calls[0]?.[0].system).toContain("Test instruction");
    expect(blocked).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("not allowed by AGENTS.md"),
      })
    );
  });

  it("should work when cwd is not provided", async () => {
    const config: AgentLoopConfig = {
      sessionId: "test-session",
      mode: MODE_CONFIGS.code,
      providerType: "anthropic",
      model: "claude-3-5-sonnet-20241022",
      cwd: "",
      enableAgentsIntegration: true,
    };

    loop = new AgentLoop(config);
    expect(loop.getState()).toBe("idle");
  });
});
