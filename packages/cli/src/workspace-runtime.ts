import { homedir } from "node:os";
import { join } from "node:path";
import {
  type AgentFactoryResult,
  type AgentLoopConfig,
  createAgentFactory,
  getToolEventBus,
  UnifiedToolContainer,
} from "@vellum/core";
import { createLspTools, LspHub } from "@vellum/lsp";
import {
  getWorkspaceLspHub,
  notifyWorkspaceLspChanged,
  setWorkspaceLspHub,
} from "./lsp-runtime.js";
import {
  activateOrchestratorRuntime,
  createOrchestratorRuntime,
  getOrchestrator,
  type OrchestratorRuntime,
} from "./orchestrator-singleton.js";

type PreparedWorkspace = Awaited<ReturnType<NonNullable<AgentLoopConfig["prepareWorkspace"]>>>;

interface WorkspaceResources {
  factory: AgentFactoryResult;
  orchestration: OrchestratorRuntime;
  hub: LspHub | null;
  dispose: () => Promise<void>;
}

/** Owns the CLI services whose configuration and caches belong to one project. */
export class WorkspaceRuntime {
  private current: WorkspaceResources | null = null;
  private disposed = false;
  private readonly retiring = new Set<Promise<void>>();

  constructor(
    private readonly options: {
      getMode: () => string;
      getRole: () => string | undefined;
      getPermissionChecker?: () => AgentLoopConfig["permissionChecker"];
    }
  ) {}

  async prepare(
    cwd: string,
    { allowLspFailure = false } = {}
  ): Promise<PreparedWorkspace & { effectiveRole: string }> {
    if (this.disposed) throw new Error("Workspace runtime has been disposed");
    const previous = this.current;
    const factory = await createAgentFactory({
      cwd,
      projectRoot: cwd,
      mode: this.options.getMode(),
      role: this.options.getRole(),
    });
    let hub: LspHub | null = null;
    let orchestration: OrchestratorRuntime | undefined;
    let released = false;
    const disposeResources = async () => {
      if (released) return;
      released = true;
      // Every resource is attempted even if another service fails to shut down.
      for (const cleanup of [
        () => orchestration?.orchestrator.shutdown(),
        () => factory.cleanup(),
        () => hub?.dispose(),
      ]) {
        try {
          await cleanup();
        } catch (error) {
          console.error("[Vellum] Workspace cleanup failed:", error);
        }
      }
    };
    try {
      const container = new UnifiedToolContainer({
        cwd,
        eventBus: getToolEventBus(),
        permissionChecker: this.options.getPermissionChecker?.(),
      });
      container.registerBuiltins();
      hub = new LspHub({
        getGlobalConfigPath: async () => join(homedir(), ".vellum", "lsp.json"),
        getProjectConfigPath: async () => join(cwd, ".vellum", "lsp.json"),
        autoInstall: "never",
        idleTimeoutMs: 300000,
        maxRestartAttempts: 3,
        onEvent: () => {
          if (getWorkspaceLspHub() === hub) notifyWorkspaceLspChanged();
        },
      });
      try {
        await hub.initialize();
        for (const tool of createLspTools(hub)) {
          container.registerTool(tool as Parameters<typeof container.registerTool>[0]);
        }
      } catch (error) {
        if (!allowLspFailure) throw error;
        await hub.dispose();
        hub = null;
      }
      orchestration = createOrchestratorRuntime({ toolContainer: container });
      if (this.disposed) throw new Error("Workspace runtime has been disposed");
      const resources: WorkspaceResources = {
        factory,
        orchestration,
        hub,
        dispose: disposeResources,
      };
      let committed = false;
      return {
        effectiveRole: factory.effectiveRole,
        promptBuilder: factory.promptBuilder,
        tools: container.getProviderToolDefinitions(),
        toolExecutor: container.getExecutor(),
        orchestrator: orchestration.orchestrator,
        commit: async () => {
          if (committed) return;
          if (released || this.disposed || this.current !== previous) {
            throw new Error("Prepared workspace is no longer current");
          }
          // This is the only fallible operation before publication. If the path
          // disappeared during preparation, the previous services remain live.
          process.chdir(cwd);
          this.current = resources;
          activateOrchestratorRuntime(resources.orchestration);
          setWorkspaceLspHub(resources.hub);
          committed = true;
          // Let AgentLoop publish its matching config immediately; a slow old
          // language server must not leave process.cwd ahead of the live loop.
          if (previous) {
            const cleanup = previous.dispose();
            this.retiring.add(cleanup);
            void cleanup.then(() => this.retiring.delete(cleanup));
          }
        },
        dispose: async () => {
          if (!committed) await disposeResources();
        },
      };
    } catch (error) {
      await disposeResources();
      throw error;
    }
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    const current = this.current;
    this.current = null;
    if (current && getOrchestrator() === current.orchestration.orchestrator) {
      activateOrchestratorRuntime(null);
    }
    if (current && getWorkspaceLspHub() === current.hub) setWorkspaceLspHub(null);
    await current?.dispose();
    await Promise.all(this.retiring);
  }
}
