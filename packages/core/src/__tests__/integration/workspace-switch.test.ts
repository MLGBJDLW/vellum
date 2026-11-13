import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ORCH_MODE } from "../../agent/coding-modes.js";
import { AgentLoop, type AgentLoopConfig } from "../../agent/loop.js";
import { PromptBuilder } from "../../prompts/prompt-builder.js";
import { createUserMessage, LLM } from "../../session/index.js";
import { UnifiedToolContainer } from "../../tool/container.js";

vi.mock("../../session/index.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../session/index.js")>()),
  LLM: { stream: vi.fn(), getRegistry: vi.fn() },
}));

describe("workspace transition through the agent tool loop", () => {
  let root: string;
  let target: string;
  let loop: AgentLoop;
  let prepared: Awaited<ReturnType<NonNullable<AgentLoopConfig["prepareWorkspace"]>>>;
  let prepare: NonNullable<AgentLoopConfig["prepareWorkspace"]>;
  const permission = { checkPermission: vi.fn(async () => "allow" as const) };

  beforeEach(async () => {
    vi.clearAllMocks();
    root = await realpath(await mkdtemp(join(tmpdir(), "vellum-workspace-")));
    target = join(root, "next");
    await mkdir(target);
    const next = new UnifiedToolContainer({ cwd: target, permissionChecker: permission });
    next.registerBuiltins();
    prepared = {
      promptBuilder: new PromptBuilder().withBase("Instructions from next workspace"),
      tools: next.getProviderToolDefinitions(),
      toolExecutor: next.getExecutor(),
      orchestrator: {} as NonNullable<AgentLoopConfig["orchestrator"]>,
      commit: vi.fn(async () => {}),
      dispose: vi.fn(async () => {}),
    };
    prepare = vi.fn(async () => prepared);
  });
  afterEach(async () => {
    loop?.cancel();
    await rm(root, { recursive: true, force: true });
  });

  function createLoop(extra: Partial<AgentLoopConfig> = {}) {
    const current = new UnifiedToolContainer({ cwd: root, permissionChecker: permission });
    current.registerBuiltins();
    loop = new AgentLoop({
      sessionId: "workspace-session",
      cwd: root,
      projectRoot: root,
      mode: ORCH_MODE,
      providerType: "anthropic",
      model: "test-model",
      enableEvidencePack: false,
      tools: current.getProviderToolDefinitions(),
      toolExecutor: current.getExecutor(),
      prepareWorkspace: prepare,
      ...extra,
    });
    return loop;
  }
  function streamSwitch(path = "next", sibling = false, name = "switch_workspace") {
    vi.mocked(LLM.stream)
      .mockImplementationOnce(async function* () {
        yield { type: "toolCall", id: "switch", name, input: { path } };
        if (sibling) yield { type: "toolCall", id: "list", name: "list_dir", input: { path: "." } };
        yield { type: "done", stopReason: "tool_use" };
      })
      .mockImplementation(async function* () {
        yield { type: "text", content: "Done" };
        yield { type: "done", stopReason: "end_turn" };
      });
  }
  async function run() {
    loop.addMessage(createUserMessage([{ type: "text", text: "Switch to next and continue" }]));
    await loop.run();
  }

  it("reloads the next prompt and tool context while preserving conversation and session", async () => {
    createLoop();
    const changed = vi.fn();
    loop.on("workspaceChanged", changed);
    streamSwitch();
    await run();
    expect(prepare).toHaveBeenCalledWith(target);
    expect(prepared.commit).toHaveBeenCalledOnce();
    expect(prepared.dispose).not.toHaveBeenCalled();
    expect(changed).toHaveBeenCalledWith(target);
    expect(loop.getWorkingDirectory()).toBe(target);
    expect(loop.getConfig().projectRoot).toBe(target);
    expect(loop.getRuntimeSessionId()).toBe("workspace-session");
    expect(vi.mocked(LLM.stream).mock.calls[1]?.[0].system).toContain(
      `Working directory: ${target}`
    );
    expect(vi.mocked(LLM.stream).mock.calls[1]?.[0].system).toContain(
      "Instructions from next workspace"
    );
    expect(loop.getMessages()[0]?.role).toBe("user");
    // The next tool must execute through the replacement container, with the new cwd.
    vi.mocked(LLM.stream).mockImplementationOnce(async function* () {
      yield { type: "toolCall", id: "list-next", name: "list_dir", input: { path: "." } };
      yield { type: "done", stopReason: "tool_use" };
    });
    await run();
    expect(permission.checkPermission).toHaveBeenCalledWith(
      "list_dir",
      expect.anything(),
      expect.objectContaining({ workingDir: target, sessionId: "workspace-session" })
    );
  });

  it("keeps the previous workspace if commit fails and disposes prepared resources", async () => {
    createLoop();
    vi.mocked(prepared.commit).mockRejectedValueOnce(new Error("Directory no longer accessible"));
    streamSwitch();
    const changed = vi.fn();
    loop.on("workspaceChanged", changed);
    await run();
    expect(loop.getWorkingDirectory()).toBe(root);
    expect(changed).not.toHaveBeenCalled();
    expect(prepared.dispose).toHaveBeenCalledOnce();
  });

  it.each([
    [false, "switch_workspace"],
    [true, "switch_workspace"],
    [true, "SWITCH_WORKSPACE"],
  ] as const)(
    "rejects mixed tool batches before changing roots (parallel=%s, name=%s)",
    async (parallelToolExecution, name) => {
      createLoop({ parallelToolExecution });
      streamSwitch("next", true, name);
      await run();
      expect(prepare).not.toHaveBeenCalled();
      expect(loop.getWorkingDirectory()).toBe(root);
    }
  );

  it("rejects missing directories without preparing a runtime", async () => {
    createLoop();
    streamSwitch("does-not-exist");
    await run();
    expect(prepare).not.toHaveBeenCalled();
    expect(loop.getWorkingDirectory()).toBe(root);
  });

  it("hides and rejects workspace switching for subagents", async () => {
    createLoop({ agentLevel: 1, parentSessionId: "parent" });
    streamSwitch();
    await run();
    expect(
      vi
        .mocked(LLM.stream)
        .mock.calls[0]?.[0].tools?.some((tool) => tool.name === "switch_workspace")
    ).toBe(false);
    expect(prepare).not.toHaveBeenCalled();
  });

  it("disposes late preparation after tool timeout without switching the workspace", async () => {
    let releasePreparation!: (value: typeof prepared) => void;
    const delayedPreparation = new Promise<typeof prepared>((resolve) => {
      releasePreparation = resolve;
    });
    vi.mocked(prepare).mockReturnValueOnce(delayedPreparation);
    const current = new UnifiedToolContainer({
      cwd: root,
      permissionChecker: permission,
      executorConfig: { defaultTimeout: 50 },
    });
    current.registerBuiltins();
    createLoop({ toolExecutor: current.getExecutor() });
    const changed = vi.fn();
    loop.on("workspaceChanged", changed);
    streamSwitch();

    try {
      // The executor must finish the timed-out turn while preparation is pending.
      await run();
      expect(prepare).toHaveBeenCalledWith(target);
      expect(LLM.stream).toHaveBeenCalledTimes(2);
      expect(loop.getWorkingDirectory()).toBe(root);
      expect(JSON.stringify(loop.getMessages())).toContain("timed out");
    } finally {
      releasePreparation(prepared);
    }

    // A late result owns resources, but can no longer publish a different cwd.
    await vi.waitFor(() => expect(prepared.dispose).toHaveBeenCalledOnce());
    expect(prepared.commit).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
    expect(loop.getWorkingDirectory()).toBe(root);
    expect(loop.getConfig().toolExecutor).toBe(current.getExecutor());
  });
});
