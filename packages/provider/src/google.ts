import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";
import type { Provider } from "./types.js";

export class GoogleProvider implements Provider {
  name = "google" as const;
  private client = createGoogleGenerativeAI();

  createModel(modelId: string): LanguageModel {
    return this.client(modelId);
  }

  listModels(): string[] {
    return ["gemini-2.0-flash-exp", "gemini-1.5-pro", "gemini-1.5-flash"];
  }

  getDefaultModel(): string {
    return "gemini-2.0-flash-exp";
  }
}
