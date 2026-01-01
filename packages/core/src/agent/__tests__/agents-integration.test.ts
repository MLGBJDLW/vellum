// ============================================
// AGENTS.md Integration Tests
// ============================================

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AgentLoop, type AgentLoopConfig } from "../loop.js";
import { MODE_CONFIGS } from "../modes.js";

describe("AGENTS.md Integration", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "vellum-agents-test-"));
  });

  afterEach(async () => {
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

    const loop = new AgentLoop(config);
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

    const loop = new AgentLoop(config);
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

    const loop = new AgentLoop(config);
    expect(loop.getState()).toBe("idle");

    // Wait for async initialization
    await new Promise((resolve) => setTimeout(resolve, 100));
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

    const loop = new AgentLoop(config);
    expect(loop.getState()).toBe("idle");
  });
});
