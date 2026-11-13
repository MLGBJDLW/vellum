import { join } from "node:path";
import {
  createAgentFactory,
  createSubsessionManager,
  type UnifiedToolContainer,
} from "@vellum/core";
import { LspHub } from "@vellum/lsp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getWorkspaceLspHub } from "../lsp-runtime.js";
import { getOrchestrator } from "../orchestrator-singleton.js";
import { disposeLsp, getLspManager } from "../tui/lsp-integration.js";
import { WorkspaceRuntime } from "../workspace-runtime.js";

vi.mock("@vellum/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@vellum/core")>();
  return {
    ...actual,
    createAgentFactory: vi.fn(async ({ role }: { role?: string }) => ({
      promptBuilder: {},
      cleanup: vi.fn(),
      effectiveRole: role ?? "orchestrator",
    })),
    createSubsessionManager: vi.fn(actual.createSubsessionManager),
  };
});

const firstRoot = join(process.cwd(), "workspace-a");
const nextRoot = join(process.cwd(), "workspace-b");
let runtime: WorkspaceRuntime;
const mode = vi.fn(() => "orch");
const role = vi.fn<() => string | undefined>(() => undefined);

beforeEach(() => {
  vi.clearAllMocks();
  mode.mockReturnValue("orch");
  role.mockReturnValue(undefined);
  vi.spyOn(process, "chdir").mockImplementation(() => {});
  vi.spyOn(LspHub.prototype, "initialize").mockResolvedValue();
  vi.spyOn(LspHub.prototype, "dispose").mockResolvedValue();
  runtime = new WorkspaceRuntime({ getMode: mode, getRole: role });
});

afterEach(async () => {
  await runtime.dispose();
  await disposeLsp();
  vi.restoreAllMocks();
});

describe("CLI workspace services", () => {
  it("prepares without publishing and commits the same live tool container for parent and children", async () => {
    const lspPanel = getLspManager();
    const refreshPanel = vi.fn();
    lspPanel.onStateChanged(refreshPanel);
    const first = await runtime.prepare(firstRoot);
    expect(process.chdir).not.toHaveBeenCalled();
    expect(getOrchestrator()).toBeNull();
    expect(getWorkspaceLspHub()).toBeNull();
    await first.commit();
    const oldHub = getWorkspaceLspHub();
    expect(lspPanel.getHub()).toBe(oldHub);
    expect(lspPanel.getState()).toMatchObject({ initialized: true, toolsRegistered: true });
    const oldShutdown = vi.spyOn(first.orchestrator, "shutdown");

    mode.mockReturnValue("plan");
    role.mockReturnValue("qa");
    const next = await runtime.prepare(nextRoot);
    expect(createAgentFactory).toHaveBeenLastCalledWith({
      cwd: nextRoot,
      projectRoot: nextRoot,
      mode: "plan",
      role: "qa",
    });
    expect(getOrchestrator()).toBe(first.orchestrator);
    expect(getWorkspaceLspHub()).toBe(oldHub);
    expect(oldShutdown).not.toHaveBeenCalled();

    const childRegistry = vi.mocked(createSubsessionManager).mock.lastCall?.[0]
      ?.baseToolRegistry as UnifiedToolContainer;
    expect(childRegistry.getCwd()).toBe(nextRoot);
    expect(childRegistry.getExecutor()).toBe(next.toolExecutor);
    expect(next.tools.some((tool) => tool.name === "lsp_diagnostics")).toBe(true);
    await next.commit();
    expect(process.chdir).toHaveBeenLastCalledWith(nextRoot);
    expect(getOrchestrator()).toBe(next.orchestrator);
    expect(getWorkspaceLspHub()).not.toBe(oldHub);
    expect(lspPanel.getHub()).toBe(getWorkspaceLspHub());
    expect(refreshPanel).toHaveBeenCalledTimes(2);
    expect(oldShutdown).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(oldHub?.dispose).toHaveBeenCalledOnce());
  });

  it("keeps the current project live when preparing its replacement fails", async () => {
    const first = await runtime.prepare(firstRoot);
    await first.commit();
    const oldHub = getWorkspaceLspHub();
    const oldShutdown = vi.spyOn(first.orchestrator, "shutdown");
    vi.mocked(LspHub.prototype.initialize).mockRejectedValueOnce(new Error("invalid LSP config"));
    await expect(runtime.prepare(nextRoot)).rejects.toThrow("invalid LSP config");
    expect(getOrchestrator()).toBe(first.orchestrator);
    expect(getWorkspaceLspHub()).toBe(oldHub);
    expect(oldShutdown).not.toHaveBeenCalled();
    expect(process.chdir).toHaveBeenCalledExactlyOnceWith(firstRoot);
    const failedFactory = await vi.mocked(createAgentFactory).mock.results[1]?.value;
    expect(failedFactory.cleanup).toHaveBeenCalledOnce();
  });

  it("preserves the old runtime when the target disappears before commit", async () => {
    const first = await runtime.prepare(firstRoot);
    await first.commit();
    const oldHub = getWorkspaceLspHub();
    const next = await runtime.prepare(nextRoot);
    const oldShutdown = vi.spyOn(first.orchestrator, "shutdown");
    const nextShutdown = vi.spyOn(next.orchestrator, "shutdown");
    vi.mocked(process.chdir).mockImplementationOnce(() => {
      throw new Error("Directory no longer exists");
    });
    await expect(next.commit()).rejects.toThrow("Directory no longer exists");
    await next.dispose();
    expect(getOrchestrator()).toBe(first.orchestrator);
    expect(getWorkspaceLspHub()).toBe(oldHub);
    expect(oldShutdown).not.toHaveBeenCalled();
    expect(nextShutdown).toHaveBeenCalledOnce();
  });

  it("does not report a committed switch as failed when an old watcher cannot close", async () => {
    const first = await runtime.prepare(firstRoot);
    await first.commit();
    const factory = await vi.mocked(createAgentFactory).mock.results[0]?.value;
    vi.mocked(factory.cleanup).mockImplementationOnce(() => {
      throw new Error("watcher cleanup failed");
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const next = await runtime.prepare(nextRoot);
    await expect(next.commit()).resolves.toBeUndefined();
    expect(getOrchestrator()).toBe(next.orchestrator);
    await vi.waitFor(() =>
      expect(log).toHaveBeenCalledWith("[Vellum] Workspace cleanup failed:", expect.any(Error))
    );
  });

  it("publishes the replacement immediately and drains slow old services at shutdown", async () => {
    const first = await runtime.prepare(firstRoot);
    await first.commit();
    let finish!: () => void;
    vi.spyOn(first.orchestrator, "shutdown").mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    const next = await runtime.prepare(nextRoot);
    await next.commit();
    expect(getOrchestrator()).toBe(next.orchestrator);
    let disposed = false;
    const shutdown = runtime.dispose().then(() => {
      disposed = true;
    });
    try {
      await Promise.resolve();
      expect(disposed).toBe(false);
    } finally {
      finish();
      await shutdown;
    }
  });
});
