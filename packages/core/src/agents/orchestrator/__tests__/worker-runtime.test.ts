import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createModeRegistry } from "../../../agent/mode-registry.js";
import { PromptLoader } from "../../../prompts/prompt-loader.js";
import { LLM } from "../../../session/index.js";
import { UnifiedToolContainer } from "../../../tool/container.js";
import { createContextIsolator } from "../../session/context-isolator.js";
import { createPermissionInheritance } from "../../session/permission-inheritance.js";
import { createResourceQuotaManager } from "../../session/resource-quota.js";
import { createSubsessionManager } from "../../session/subsession-manager.js";
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
    readFile,
    sessions,
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
