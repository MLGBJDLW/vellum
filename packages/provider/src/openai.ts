import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import type { Provider } from "./types.js";

export class OpenAIProvider implements Provider {
  name = "openai" as const;
  private client = createOpenAI();

  createModel(modelId: string): LanguageModel {
    return this.client(modelId);
  }

  listModels(): string[] {
    return ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "o1-preview", "o1-mini"];
  }

  getDefaultModel(): string {
    return "gpt-4o";
  }
}
