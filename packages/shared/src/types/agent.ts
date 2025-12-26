import type { Message } from "./message.js";

export interface AgentConfig {
  model: string;
  provider: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

export interface AgentState {
  messages: Message[];
  isRunning: boolean;
  currentTool?: string;
  tokenUsage: {
    input: number;
    output: number;
  };
}
