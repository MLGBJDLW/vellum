import {
  AgentLoop,
  BUILTIN_CODING_MODES,
  createAgentFactory,
  getToolEventBus,
  LLM,
  UnifiedToolContainer,
} from "@vellum/core";
import { createId } from "@vellum/shared";
import { getOrCreateOrchestrator } from "../orchestrator-singleton.js";
import { getEffectiveThinkingConfig } from "./think.js";

export interface RunOptions {
  model: string;
  provider: string;
}

export async function handleRun(prompt: string, options: RunOptions): Promise<void> {
  console.log(`Running: "${prompt}" with model ${options.model}`);

  let agentLoop: AgentLoop | undefined;
  let initError: Error | undefined;

  try {
    const { createCredentialManager } = await import("./auth.js");
    const credentialManager = await createCredentialManager();

    const { ProviderRegistry } = await import("@vellum/provider");
    const providerRegistry = new ProviderRegistry({ credentialManager });
    LLM.initialize(providerRegistry);

    const modeConfig = BUILTIN_CODING_MODES["vibe"]; 
    const orchestrator = getOrCreateOrchestrator();

    const factoryResult = await createAgentFactory({
      cwd: process.cwd(),
      projectRoot: process.cwd(),
      role: "coder", 
      mode: "vibe",
    });
    const { promptBuilder, cleanup } = factoryResult;

    const toolEventBus = getToolEventBus();
    const toolContainer = new UnifiedToolContainer({
      cwd: process.cwd(),
      eventBus: toolEventBus,
    });
    toolContainer.registerBuiltins();

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
    });

    const result = await agentLoop.runSingleTurn(prompt);

    // The result will contain the agent's response.
    // We can handle different types of results here.
    console.log("Agent finished a turn.");
    // For now, just log the raw result for debugging.
    // A more sophisticated approach would be to render the output nicely.
    for (const event of result) {
      if (event.type === 'ui' && event.ui.message) {
        console.log(event.ui.message);
      } else if (event.type === 'thought') {
        console.log(`[Thought] ${event.thought}`);
      }
    }
    
    await cleanup();
  } catch (error) {
    initError = error instanceof Error ? error : new Error(String(error));
    console.error("[CLI] Failed to initialize and run agent:", initError.message);
    process.exit(1);
  }

  if (initError) {
    console.error("[CLI] Agent initialization failed.");
    process.exit(1);
  }
}
