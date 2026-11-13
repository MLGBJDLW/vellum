import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentLoop, LLM, UnifiedToolContainer } from "@vellum/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createTaskPersistence } from "../../agents/task-persistence.js";
import { resetOrchestrator } from "../../orchestrator-singleton.js";
import { handleRun } from "../run.js";

const { factory, cleanup } = vi.hoisted(() => ({ factory: vi.fn(), cleanup: vi.fn() }));
vi.mock("@vellum/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@vellum/core")>()),
  createAgentFactory: factory,
}));
vi.mock("../auth.js", () => ({ createCredentialManager: vi.fn(async () => ({})) }));
vi.mock("../think.js", () => ({ getEffectiveThinkingConfig: () => undefined }));

describe("headless delegated runs", () => {
  let directory: string;
  let previousExitCode: typeof process.exitCode;
  const execute = vi.fn(async () => ({ success: true as const, output: "Executed" }));

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "vellum-headless-"));
    previousExitCode = process.exitCode;
    process.exitCode = undefined;
    vi.stubEnv("VELLUM_TRUST_PRESET", "default");
    vi.spyOn(process, "cwd").mockReturnValue(directory);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    factory.mockResolvedValue({ promptBuilder: undefined, cleanup });
    vi.spyOn(UnifiedToolContainer.prototype, "registerBuiltins").mockImplementation(function (
      this: UnifiedToolContainer
    ) {
      this.registerTool({
        definition: {
          name: "shell",
          description: "Test shell; never executes a real command",
          kind: "write",
          parameters: z.object({ command: z.string() }),
        },
        execute,
      });
      return 1;
    });
  });

  afterEach(async () => {
    await resetOrchestrator();
    process.exitCode = previousExitCode;
    vi.restoreAllMocks();
    vi.resetAllMocks();
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  });

  it.each([false, true])(
    "denies a destructive tool in a direct run (resume=%s)",
    async (resume) => {
      const persistence = createTaskPersistence(join(directory, ".vellum", "tasks"));
      const id = "resume_denied";
      if (resume) {
        await persistence.save({
          version: 1,
          id,
          task: "Remove a protected path",
          level: 2,
          cwd: directory,
          providerType: "anthropic",
          model: "test-model",
          status: "failed",
          tasks: [
            { id: "worker", agent: "coder", task: "Remove a protected path", status: "pending" },
          ],
          groups: [["worker"]],
          updatedAt: Date.now(),
        });
      }
      const stream = vi.spyOn(LLM, "stream");
      stream.mockReturnValueOnce(
        (async function* () {
          yield {
            type: "toolCall" as const,
            id: "denied_call",
            name: "shell",
            input: { command: "rm -rf /" },
          };
          yield { type: "done" as const, stopReason: "tool_use" as const };
        })()
      );
      stream.mockImplementation(() =>
        (async function* () {
          yield { type: "done" as const, stopReason: "end_turn" as const };
        })()
      );

      await handleRun("Remove a protected path", {
        provider: "anthropic",
        model: "test-model",
        delegation: resume ? { resumeId: id } : { targetAgent: "coder" },
      });

      expect(stream).toHaveBeenCalled();
      expect(execute).not.toHaveBeenCalled();
      expect(JSON.stringify(stream.mock.calls)).toContain("Permission denied for tool: shell");
      expect(cleanup).toHaveBeenCalledTimes(1);
    }
  );

  it("does not start a worker after SIGINT while the factory is still initializing", async () => {
    let finishFactory: ((value: { cleanup: typeof cleanup }) => void) | undefined;
    factory.mockReturnValueOnce(
      new Promise<{ cleanup: typeof cleanup }>((resolve) => {
        finishFactory = resolve;
      })
    );
    const stream = vi.spyOn(LLM, "stream");
    const delegate = vi.spyOn(AgentLoop.prototype, "executeDelegation");
    const initialListeners = process.listeners("SIGINT");
    const running = handleRun("Continue the task", {
      provider: "anthropic",
      model: "test-model",
      delegation: { targetAgent: "coder" },
    });
    await vi.waitFor(() => expect(factory).toHaveBeenCalledTimes(1));
    const interrupt = process
      .listeners("SIGINT")
      .find((listener) => !initialListeners.includes(listener));
    expect(interrupt).toBeDefined();
    interrupt?.("SIGINT");
    finishFactory?.({ cleanup });
    await running;

    expect(delegate).not.toHaveBeenCalled();
    expect(stream).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(process.listeners("SIGINT")).toEqual(initialListeners);
  });
});
