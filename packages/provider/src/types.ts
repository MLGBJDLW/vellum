import type { LanguageModel } from "ai";

export type ProviderType = "anthropic" | "openai" | "google";

export interface Provider {
  name: ProviderType;
  createModel(modelId: string): LanguageModel;
  listModels(): string[];
  getDefaultModel(): string;
}
