/**
 * @deprecated This file is deprecated. Use types from @vellum/core instead.
 *
 * For AgentConfig related to orchestration hierarchy:
 *   import { AgentConfig, AgentConfigSchema } from "@vellum/core";
 *
 * For LLM provider configuration:
 *   import { LLMProviderSchema, ConfigCredentialSchema } from "@vellum/core";
 *
 * This file will be removed in a future version once all consumers migrate.
 * Currently used by: packages/core/src/types.ts (legacy backward compatibility)
 */

import type { Message } from "./message.js";

/**
 * @deprecated Use LLMProviderSchema from @vellum/core for provider configuration.
 * This interface represents legacy LLM configuration properties.
 */
export interface AgentConfig {
  model: string;
  provider: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

/**
 * @deprecated Use agent state events from @vellum/core's EventBus instead.
 * Subscribe to Events.agentStateChange for state transitions.
 */
export interface AgentState {
  messages: Message[];
  isRunning: boolean;
  currentTool?: string;
  tokenUsage: {
    input: number;
    output: number;
  };
}
