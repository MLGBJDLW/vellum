import {
  AgentLoop,
  BUILTIN_CODING_MODES,
  createAgentFactory,
  getToolEventBus,
  LLM,
  TerminationReason,
  UnifiedToolContainer,
} from "@vellum/core";
import { createId } from "@vellum/shared";
import { getOrCreateOrchestrator, resetOrchestrator } from "../orchestrator-singleton.js";
import { getEffectiveThinkingConfig } from "./think.js";

export interface RunOptions {
  model: string;
  provider: string;
}

export async function handleRun(prompt: string, options: RunOptions): Promise<void> {
  console.log(`Running: "${prompt}" with model ${options.model}`);

  let agentLoop: AgentLoop | undefined;
  let cleanup: (() => void) | undefined;
  let stopped: string | undefined;

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
    const toolContainer = new UnifiedToolContainer({
      cwd: process.cwd(),
      eventBus: toolEventBus,
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
    cleanup?.();
    agentLoop?.removeAllListeners();
    agentLoop?.cancel("CLI session closed");
    resetOrchestrator();
  }
}
