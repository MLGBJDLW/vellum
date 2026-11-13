import {
  AgentLoop,
  BUILTIN_CODING_MODES,
  createAgentFactory,
  createDefaultPermissionChecker,
  getToolEventBus,
  LLM,
  TerminationReason,
  TrustPresetManager,
  UnifiedToolContainer,
} from "@vellum/core";
import { createId } from "@vellum/shared";
import { getOrCreateOrchestrator, resetOrchestrator } from "../orchestrator-singleton.js";
import { getEffectiveThinkingConfig } from "./think.js";

export interface RunOptions {
  model: string;
  provider: string;
  timeout?: number;
  delegation?: { targetAgent?: string; context?: string; resumeId?: string };
}

export async function handleRun(prompt: string, options: RunOptions): Promise<void> {
  console.log(`Running: "${prompt}" with model ${options.model}`);

  let agentLoop: AgentLoop | undefined;
  let cleanup: (() => void) | undefined;
  let stopped: string | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const onInterrupt = () => {
    stopped = "Interrupted; subagent progress is available with vellum resume.";
    agentLoop?.cancel("CLI interrupted");
  };
  process.once("SIGINT", onInterrupt);
  process.once("SIGTERM", onInterrupt);

  try {
    const { createCredentialManager } = await import("./auth.js");
    const credentialManager = await createCredentialManager();

    const { ProviderRegistry } = await import("@vellum/provider");
    const providerRegistry = new ProviderRegistry({ credentialManager });
    LLM.initialize(providerRegistry);

    const modeConfig = BUILTIN_CODING_MODES.orch;

    const factoryResult = await createAgentFactory({
      cwd: process.cwd(),
      projectRoot: process.cwd(),
      role: "orchestrator",
      mode: "orch",
    });
    const { promptBuilder } = factoryResult;
    cleanup = factoryResult.cleanup;

    const toolEventBus = getToolEventBus();
    // Non-interactive commands must not fall back to the executor's allow-all
    // mode. The default checker denies requests that require an absent UI.
    const permissionChecker = createDefaultPermissionChecker({
      trustManager: new TrustPresetManager({ workspacePath: process.cwd() }),
    });
    const toolContainer = new UnifiedToolContainer({
      cwd: process.cwd(),
      eventBus: toolEventBus,
      permissionChecker,
    });
    toolContainer.registerBuiltins();
    const orchestrator = getOrCreateOrchestrator({ toolContainer });

    agentLoop = new AgentLoop({
      sessionId: createId(),
      mode: modeConfig,
      providerType: options.provider,
      model: options.model,
      cwd: process.cwd(),
      projectRoot: process.cwd(),
      interactive: false,
      permissionChecker,
      orchestrator,
      promptBuilder,
      getThinkingConfig: getEffectiveThinkingConfig,
      tools: toolContainer.getProviderToolDefinitions(),
      toolExecutor: toolContainer.getExecutor(),
      enableAgentsIntegration: true,
      enableSkillsIntegration: true,
      contextManagement: { enabled: true },
    });

    // Listen for assistant text output
    agentLoop.on("text", (text: string) => {
      process.stdout.write(text);
    });

    agentLoop.on("terminated", (reason) => {
      if (reason !== TerminationReason.NATURAL_STOP && reason !== TerminationReason.TEXT_ONLY)
        stopped = reason;
    });
    agentLoop.on("permissionDenied", (_id, tool, reason) => {
      stopped = `${tool}: ${reason}`;
    });
    agentLoop.on("error", (error) => {
      stopped = error.message;
    });

    if (options.timeout !== undefined) {
      deadline = setTimeout(onInterrupt, options.timeout);
      deadline.unref();
    }

    if (stopped) {
      agentLoop.cancel("CLI interrupted during initialization");
      throw new Error(stopped);
    }

    if (options.delegation) {
      const delegationId = options.delegation.resumeId ?? `delegate_${createId()}`;
      console.log(`Task ID: ${delegationId}`);
      agentLoop.on("subagentText", (_id, _agent, text) => process.stdout.write(text));
      const receipt = await agentLoop.executeDelegation({
        type: "delegate_agent",
        task: prompt,
        delegationId,
        ...options.delegation,
      });
      if (!receipt) throw new Error("The worker did not return a delegation receipt.");
      console.log(`\n${receipt}`);
      let succeeded = false;
      try {
        succeeded = JSON.parse(receipt).status === "success";
      } catch {
        // Plain-text failures from the parent are never successful executions.
      }
      if (!succeeded || stopped) {
        console.error(`Resume saved work with: vellum resume ${delegationId}`);
        process.exitCode = 1;
      }
      return;
    }

    // Add user message and run
    agentLoop.addMessage({
      id: createId(),
      role: "user",
      parts: [{ type: "text", text: prompt }],
      metadata: { createdAt: Date.now() },
    });

    await agentLoop.run();

    if (stopped) {
      console.error(`\n[Agent stopped: ${stopped}]`);
      process.exitCode = 1;
    } else {
      console.log("\n[Agent completed]");
    }
  } catch (error) {
    console.error(
      "[CLI] Failed to run agent:",
      error instanceof Error ? error.message : String(error)
    );
    process.exitCode = 1;
  } finally {
    if (deadline) clearTimeout(deadline);
    process.removeListener("SIGINT", onInterrupt);
    process.removeListener("SIGTERM", onInterrupt);
    agentLoop?.cancel("CLI session closed");
    await resetOrchestrator();
    agentLoop?.removeAllListeners();
    cleanup?.();
  }
}
