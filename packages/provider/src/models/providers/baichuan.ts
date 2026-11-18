import type { ModelInfo } from "../types.js";

// Limits and IDs are specific to the hosted Chat Completions endpoint.
const generalModels = [
  "Baichuan4-Turbo",
  "Baichuan4-Air",
  "Baichuan4",
  "Baichuan3-Turbo",
  "Baichuan3-Turbo-128k",
  "Baichuan2-Turbo",
];

export const BAICHUAN_MODELS: ModelInfo[] = [
  ...generalModels.map(
    (id): ModelInfo => ({
      id,
      name: id,
      provider: "baichuan",
      contextWindow: id === "Baichuan3-Turbo-128k" ? 128_000 : 32_000,
      maxOutputTokens: 2048,
      supportsTools: id !== "Baichuan3-Turbo-128k",
      supportsVision: false,
      supportsReasoning: false,
      supportsStreaming: true,
      supportsPromptCache: false,
      deprecated: false,
    })
  ),
  ...["Baichuan-M3", "Baichuan-M3-Plus", "Baichuan-M2", "Baichuan-M2-Plus"].map(
    (id): ModelInfo => ({
      id,
      name: id,
      provider: "baichuan",
      contextWindow: 32_000,
      maxOutputTokens: 32_000,
      supportsTools: false,
      supportsVision: false,
      supportsReasoning: !id.endsWith("-Plus"),
      supportsStreaming: true,
      supportsPromptCache: false,
      deprecated: false,
      description: id.endsWith("-Plus")
        ? "Medical chat. The provider can automatically invoke and bill for medical search."
        : "Medical chat with an optional thinking budget.",
    })
  ),
];
