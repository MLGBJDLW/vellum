import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";
import type { Provider } from "./types.js";

export class AnthropicProvider implements Provider {
  name = "anthropic" as const;
  private client = createAnthropic();

  createModel(modelId: string): LanguageModel {
    return this.client(modelId);
  }

  listModels(): string[] {
    return [
      "claude-sonnet-4-20250514",
      "claude-3-5-sonnet-20241022",
      "claude-3-5-haiku-20241022",
      "claude-3-opus-20240229",
    ];
  }

  getDefaultModel(): string {
    return "claude-sonnet-4-20250514";
  }
}
