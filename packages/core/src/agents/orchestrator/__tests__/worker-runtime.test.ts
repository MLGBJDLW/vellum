import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ORCH_MODE } from "../../../agent/coding-modes.js";
import { AgentLoop, type AgentLoopConfig } from "../../../agent/loop.js";
import { createModeRegistry } from "../../../agent/mode-registry.js";
import { delegateAgentTool } from "../../../builtin/delegate-agent.js";
import { CostService } from "../../../cost/service.js";
import { PromptLoader } from "../../../prompts/prompt-loader.js";
import { createUserMessage, LLM, SessionParts } from "../../../session/index.js";
import { UnifiedToolContainer } from "../../../tool/container.js";
import { createTaskPacket } from "../../protocol/task-packet.js";
import { createContextIsolator } from "../../session/context-isolator.js";
import { createPermissionInheritance } from "../../session/permission-inheritance.js";
import { createResourceQuotaManager } from "../../session/resource-quota.js";
import { createSubsessionManager } from "../../session/subsession-manager.js";
import { coderWorker } from "../../workers/builtin/coder.js";
import { createOrchestrator } from "../core.js";

vi.mock("../../../session/index.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../session/index.js")>()),
  LLM: { stream: vi.fn() },
}));

function createRuntime() {
  const tools = new UnifiedToolContainer({ cwd: process.cwd() });
  const readFile = vi.fn(async () => ({ success: true as const, output: "worker read evidence" }));
  tools.registerTool({
    definition: {
      name: "read_file",
      description: "Read file",
      kind: "read",
      parameters: z.object({ path: z.string() }),
    },
    execute: readFile,
  });
  const sessions = createSubsessionManager({
    contextIsolator: createContextIsolator(),
    permissionInheritance: createPermissionInheritance(),
    resourceQuotaManager: createResourceQuotaManager(),
    baseToolRegistry: tools,
  });
  const root = sessions.create({ agentSlug: "orch", level: 0 });
  return {
    tools,
    readFile,
    sessions,
    root,
    orchestrator: createOrchestrator({
      modeRegistry: createModeRegistry(),
      subsessionManager: sessions,
      parentSessionId: root.id,
    }),
  };
}

function finalStream(text: string): ReturnType<typeof LLM.stream> {
  return (async function* () {
    yield { type: "text" as const, content: text };
    yield { type: "done" as const, stopReason: "end_turn" as const };
  })();
}

afterEach(() => vi.resetAllMocks());

describe("Orchestrator worker runtime", () => {
  it("allows a built-in worker to complete useful work beyond its former implicit turn limit", async () => {
    const { sessions, root } = createRuntime();
    const worker = sessions.create({ agentSlug: "coder", level: 2, parentId: root.id });
    let requests = 0;
    vi.mocked(LLM.stream).mockImplementation(() => {
      requests += 1;
      if (requests > 26) return finalStream("Reviewed all 26 files.");
      return (async function* () {
        yield {
          type: "toolCall" as const,
          id: `read-${requests}`,
          name: "read_file",
          input: { path: `file-${requests}.ts` },
        };
        yield { type: "done" as const, stopReason: "tool_use" as const };
      })();
    });

    const result = await coderWorker.execute({
      subsession: worker,
      taskPacket: createTaskPacket(
        "Review 26 source files",
        { kind: "builtin", slug: "coder" },
        "orch"
      ),
    });

    expect(requests).toBe(27);
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ output: "Reviewed all 26 files.", iterations: 27 });
  });

  it("keeps an explicit task deadline when a built-in worker has no implicit timeout", async () => {
    const { sessions, root } = createRuntime();
    const worker = sessions.create({ agentSlug: "coder", level: 2, parentId: root.id });
    vi.mocked(LLM.stream).mockImplementation(({ abortSignal }) =>
      (async function* () {
        yield { type: "text" as const, content: "Partial evidence" };
        await new Promise<void>((resolve) => {
          if (abortSignal?.aborted) resolve();
          else abortSignal?.addEventListener("abort", () => resolve(), { once: true });
        });
        throw new Error("Stream cancelled at explicit task deadline");
      })()
    );
    const result = await coderWorker.execute({
      subsession: worker,
      taskPacket: createTaskPacket("Inspect source", { kind: "builtin", slug: "coder" }, "orch", {
        constraints: { timeout: 1_000 },
      }),
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(vi.mocked(LLM.stream).mock.calls[0]?.[0].abortSignal?.aborted).toBe(true);
  });

  it("executes a real worker from an empty legacy mode registry and returns its evidence", async () => {
    const { orchestrator, sessions } = createRuntime();
    vi.mocked(LLM.stream).mockReturnValue(finalStream("source-backed research result"));
    const result = await orchestrator.executeTask("Research the document", 2, {
      targetAgent: "researcher",
      providerType: "openai",
      model: "selected-model",
      cwd: process.cwd(),
    });
    expect(result.overallStatus).toBe("success");
    expect(result.results[0]?.data).toMatchObject({
      output: "source-backed research result",
      iterations: 1,
    });
    expect(LLM.stream).toHaveBeenCalledWith(
      expect.objectContaining({ providerType: "openai", model: "selected-model" })
    );
    expect(orchestrator.getActiveSubagents()).toEqual([]);
    expect(sessions.getActiveCount()).toBe(1);
  });

  it("applies the parent's permission checker to actual worker tools", async () => {
    const { orchestrator, readFile } = createRuntime();
    vi.mocked(LLM.stream)
      .mockReturnValueOnce(
        (async function* () {
          yield {
            type: "toolCall" as const,
            id: "read",
            name: "read_file",
            input: { path: "/private" },
          };
          yield { type: "done" as const, stopReason: "tool_use" as const };
        })()
      )
      .mockReturnValueOnce(finalStream("Cannot access that file."));
    const permission = vi.fn().mockResolvedValue("deny");
    await orchestrator.executeTask("Inspect file", 2, {
      targetAgent: "researcher",
      permissionChecker: { checkPermission: permission },
    });
    expect(permission).toHaveBeenCalled();
    expect(readFile).not.toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(LLM.stream).mock.calls[1]?.[0].messages)).toContain(
      "Permission denied"
    );
  });

  it("keeps concurrent delegation results isolated", async () => {
    const { orchestrator } = createRuntime();
    vi.mocked(LLM.stream).mockImplementation(({ messages }) =>
      finalStream(JSON.stringify(messages))
    );
    const [first, second] = await Promise.all([
      orchestrator.executeTask("Inspect Alpha", 2, { targetAgent: "researcher" }),
      orchestrator.executeTask("Inspect Beta", 2, { targetAgent: "researcher" }),
    ]);
    expect(first.totalTasks).toBe(1);
    expect(second.totalTasks).toBe(1);
    expect(JSON.stringify(first.results[0]?.data)).toContain("Alpha");
    expect(JSON.stringify(first.results[0]?.data)).not.toContain("Beta");
    expect(JSON.stringify(second.results[0]?.data)).toContain("Beta");
  });

  it("propagates parent cancellation to the worker stream and reports failure", async () => {
    const { orchestrator } = createRuntime();
    const parent = new AbortController();
    let signal: AbortSignal | undefined;
    vi.mocked(LLM.stream).mockImplementation((options) => {
      signal = options.abortSignal;
      return (async function* () {
        yield { type: "text" as const, content: "Partial evidence" };
        parent.abort();
        yield { type: "done" as const, stopReason: "end_turn" as const };
      })();
    });
    const result = await orchestrator.executeTask("Inspect", 2, {
      targetAgent: "researcher",
      signal: parent.signal,
    });
    expect(signal?.aborted).toBe(true);
    expect(result.overallStatus).toBe("failure");
    expect(result.results[0]?.data).toMatchObject({ output: "Partial evidence" });
    expect(orchestrator.getActiveSubagents()).toEqual([]);
  });

  it("does not start model or tool work when cancelled during prompt loading", async () => {
    const { orchestrator, readFile, sessions } = createRuntime();
    const parent = new AbortController();
    let finishPromptLoad: (() => void) | undefined;
    const promptLoad = vi.spyOn(PromptLoader.prototype, "load").mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          finishPromptLoad = () => reject(new Error("Use the fallback prompt"));
        })
    );
    vi.mocked(LLM.stream)
      .mockReturnValueOnce(
        (async function* () {
          yield {
            type: "toolCall" as const,
            id: "read",
            name: "read_file",
            input: { path: "/one" },
          };
          yield { type: "done" as const, stopReason: "tool_use" as const };
        })()
      )
      .mockReturnValueOnce(finalStream("Ran after cancellation"));

    try {
      const pending = orchestrator.executeTask("Inspect", 2, {
        targetAgent: "researcher",
        signal: parent.signal,
      });
      await vi.waitFor(() => expect(finishPromptLoad).toBeDefined());
      parent.abort();
      finishPromptLoad?.();
      const result = await pending;

      expect(result.overallStatus).toBe("failure");
      expect(LLM.stream).not.toHaveBeenCalled();
      expect(readFile).not.toHaveBeenCalled();
      expect(orchestrator.getActiveSubagents()).toEqual([]);
      expect(sessions.getActiveCount()).toBe(1);
    } finally {
      promptLoad.mockRestore();
    }
  });

  it("returns an explicit incomplete result at a configured worker budget", async () => {
    const { orchestrator } = createRuntime();
    vi.mocked(LLM.stream).mockReturnValue(
      (async function* () {
        yield { type: "toolCall" as const, id: "read", name: "read_file", input: { path: "/one" } };
        yield { type: "done" as const, stopReason: "tool_use" as const };
      })()
    );
    const result = await orchestrator.executeTask("Inspect file", 2, {
      targetAgent: "researcher",
      maxIterations: 1,
    });
    expect(result.overallStatus).toBe("failure");
    expect(result.results[0]?.error?.message).toContain("max_steps");
  });
});

describe("Delegated session budgets", () => {
  function createParent(overrides: Partial<AgentLoopConfig> = {}) {
    const runtime = createRuntime();
    runtime.tools.registerTool(delegateAgentTool);
    const costService = new CostService({ sessionId: "shared-budget" });
    const loop = new AgentLoop({
      sessionId: "shared-budget",
      mode: ORCH_MODE,
      agentLevel: 0,
      providerType: "anthropic",
      model: "claude-sonnet-4-6",
      cwd: process.cwd(),
      tools: runtime.tools.getProviderToolDefinitions(),
      toolExecutor: runtime.tools.getExecutor(),
      orchestrator: runtime.orchestrator,
      costService,
      costLimits: { maxRequestsPerSession: 2, pauseOnLimitReached: true, warningThreshold: 0.8 },
      enableEvidencePack: false,
      ...overrides,
    });
    const terminated = vi.fn();
    loop.on("terminated", terminated);
    loop.on("cost:awaitingApproval", () => loop.denyCostApproval());
    return { ...runtime, loop, costService, terminated };
  }

  function parentStream(count = 1, childModel = "claude-opus-4-6"): ReturnType<typeof LLM.stream> {
    return (async function* () {
      for (let i = 0; i < count; i++) {
        yield {
          type: "toolCall" as const,
          id: `delegate-${i}`,
          name: "delegate_agent",
          input: {
            task: `Inspect evidence ${i}`,
            targetAgent: "researcher",
            model: childModel,
          },
        };
      }
      yield { type: "usage" as const, inputTokens: 10, outputTokens: 10 };
      yield { type: "done" as const, stopReason: "tool_use" as const };
    })();
  }

  function childStream(): ReturnType<typeof LLM.stream> {
    return (async function* () {
      yield {
        type: "toolCall" as const,
        id: "read-evidence",
        name: "read_file",
        input: { path: "note.txt" },
      };
      yield { type: "usage" as const, inputTokens: 30, outputTokens: 40 };
      yield { type: "done" as const, stopReason: "tool_use" as const };
    })();
  }

  it("blocks delegation before its first request when the parent exhausted the session budget", async () => {
    const { loop, terminated, readFile } = createParent({
      costLimits: { maxRequestsPerSession: 1, pauseOnLimitReached: true, warningThreshold: 0.8 },
    });
    vi.mocked(LLM.stream).mockReturnValueOnce(parentStream());
    await loop.run();
    expect(LLM.stream).toHaveBeenCalledTimes(1);
    expect(readFile).not.toHaveBeenCalled();
    expect(terminated).toHaveBeenCalledWith("cost_limit", expect.anything());
    expect(JSON.stringify(loop.getMessages())).toContain(
      "Worker stopped before completion: cost_limit"
    );
  });

  it("charges child usage once with its model and stops both child and parent continuation", async () => {
    const { loop, costService, terminated, readFile } = createParent();
    const usage = vi.fn();
    loop.on("usage", usage);
    vi.mocked(LLM.stream).mockReturnValueOnce(parentStream()).mockReturnValueOnce(childStream());
    await loop.run();
    expect(LLM.stream).toHaveBeenCalledTimes(2);
    expect(readFile).toHaveBeenCalledTimes(1);
    expect(loop.getCostLimitIntegration()?.getRequestCount()).toBe(2);
    expect(
      costService.getRecords().map(({ provider, model, inputTokens, outputTokens }) => ({
        provider,
        model,
        inputTokens,
        outputTokens,
      }))
    ).toEqual([
      { provider: "anthropic", model: "claude-sonnet-4-6", inputTokens: 10, outputTokens: 10 },
      { provider: "anthropic", model: "claude-opus-4-6", inputTokens: 30, outputTokens: 40 },
    ]);
    expect(loop.getTerminationContext().tokenUsage.totalTokens).toBe(90);
    expect(usage).toHaveBeenCalledTimes(2);
    expect(usage).toHaveBeenLastCalledWith(
      { inputTokens: 30, outputTokens: 40 },
      { providerType: "anthropic", model: "claude-opus-4-6" }
    );
    expect(
      loop.getMessages().find((message) => message.role === "assistant")?.metadata.tokens
    ).toEqual({ input: 10, output: 10 });
    expect(terminated).toHaveBeenCalledWith("cost_limit", expect.anything());
  });

  it("reserves the remaining request atomically across concurrent workers before usage arrives", async () => {
    const { loop, readFile, terminated } = createParent({ parallelToolExecution: true });
    let releaseChild: (() => void) | undefined;
    const holdChild = new Promise<void>((resolve) => {
      releaseChild = resolve;
    });
    vi.mocked(LLM.stream)
      .mockReturnValueOnce(parentStream(2))
      .mockImplementation(() =>
        (async function* () {
          await holdChild;
          yield* childStream();
        })()
      );
    const running = loop.run();
    try {
      await vi.waitFor(() => expect(loop.getCostLimitIntegration()?.getRequestCount()).toBe(2));
      await vi.waitFor(() =>
        expect(terminated).toHaveBeenCalledWith("cost_limit", expect.anything())
      );
    } finally {
      releaseChild?.();
    }
    await running;
    expect(LLM.stream).toHaveBeenCalledTimes(2);
    expect(readFile).toHaveBeenCalledTimes(1);
  });

  it("releases a child waiting on the shared budget when the parent is cancelled", async () => {
    const { loop, orchestrator, terminated } = createParent();
    loop.removeAllListeners("cost:awaitingApproval");
    const awaitingApproval = vi.fn();
    loop.on("cost:awaitingApproval", awaitingApproval);
    vi.mocked(LLM.stream).mockReturnValueOnce(parentStream()).mockReturnValueOnce(childStream());
    const running = loop.run();
    await vi.waitFor(() => expect(awaitingApproval).toHaveBeenCalled());
    loop.cancel("Stop while the worker awaits budget approval");
    await running;
    expect(LLM.stream).toHaveBeenCalledTimes(2);
    expect(loop.getState()).toBe("terminated");
    expect(orchestrator.getActiveSubagents()).toEqual([]);
    expect(terminated).toHaveBeenCalledWith("cancelled", expect.anything());

    vi.mocked(LLM.stream).mockReturnValueOnce(finalStream("Continued after explicit approval"));
    loop.addMessage(createUserMessage([SessionParts.text("Continue")]));
    const resumed = loop.run();
    await vi.waitFor(() => expect(awaitingApproval).toHaveBeenCalledTimes(2));
    expect(LLM.stream).toHaveBeenCalledTimes(2);
    loop.grantCostApproval({ requests: 3 });
    await resumed;
    expect(LLM.stream).toHaveBeenCalledTimes(3);
  });

  it("pauses an explicit dollar budget when a child model's cost is unknown", async () => {
    const { loop, costService, terminated } = createParent({
      costLimits: { maxCostPerSession: 1, pauseOnLimitReached: true, warningThreshold: 0.8 },
    });
    vi.mocked(LLM.stream)
      .mockReturnValueOnce(parentStream(1, "unpriced-custom-model"))
      .mockReturnValueOnce(childStream());
    await loop.run();
    expect(LLM.stream).toHaveBeenCalledTimes(2);
    expect(Number.isNaN(costService.getSessionCost().total)).toBe(true);
    expect(terminated).toHaveBeenCalledWith("cost_limit", expect.anything());
  });

  it("rechecks the independent deadline after a shared budget approval", async () => {
    const { loop, terminated } = createParent({
      costLimits: { maxRequestsPerSession: 1, pauseOnLimitReached: true, warningThreshold: 0.8 },
      terminationLimits: { maxTimeMs: 10_000 },
    });
    loop.removeAllListeners("cost:awaitingApproval");
    loop.on("cost:awaitingApproval", () => undefined);
    const integration = loop.getCostLimitIntegration();
    if (!integration) throw new Error("The fixture must have a session budget");
    const waitForApproval = vi.spyOn(integration, "waitForApproval");
    vi.mocked(LLM.stream)
      .mockReturnValueOnce(parentStream())
      .mockImplementation(() => finalStream("Unexpected request"));
    const running = loop.run();
    await vi.waitFor(() => expect(waitForApproval).toHaveBeenCalled());
    const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 20_000);
    try {
      loop.grantCostApproval({ requests: 3 });
      await running;
      expect(LLM.stream).toHaveBeenCalledTimes(1);
      expect(terminated).toHaveBeenCalledWith("max_time", expect.anything());
    } finally {
      clock.mockRestore();
      waitForApproval.mockRestore();
    }
  });

  it.each(["tokens", "cost"] as const)(
    "applies the parent's explicit %s budget to child continuation",
    async (budget) => {
      const { loop, terminated } = createParent({
        costLimits: {
          ...(budget === "cost" ? { maxCostPerSession: 0.001 } : {}),
          pauseOnLimitReached: true,
          warningThreshold: 0.8,
        },
        terminationLimits: budget === "tokens" ? { maxTokens: 50 } : undefined,
      });
      vi.mocked(LLM.stream).mockReturnValueOnce(parentStream()).mockReturnValueOnce(childStream());
      await loop.run();
      expect(LLM.stream).toHaveBeenCalledTimes(2);
      expect(terminated).toHaveBeenCalledWith(
        budget === "tokens" ? "max_tokens" : "cost_limit",
        expect.anything()
      );
      expect(JSON.stringify(loop.getMessages())).toContain("Worker stopped before completion");
    }
  );
});
