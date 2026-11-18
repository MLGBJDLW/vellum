import type { ModelInfo } from "../types.js";

// The vendor publishes these two routed endpoints in the models and billing table.
// Prices are quoted in CNY and are not USD catalog prices.
export const YI_MODELS: ModelInfo[] = [
  {
    id: "yi-lightning",
    name: "Yi Lightning",
    provider: "yi",
    contextWindow: 16_000,
    supportsTools: true,
    supportsVision: false,
    supportsReasoning: false,
    supportsStreaming: true,
    supportsPromptCache: false,
    deprecated: false,
  },
  {
    id: "yi-vision-v2",
    name: "Yi Vision V2",
    provider: "yi",
    contextWindow: 16_000,
    supportsVision: true,
    supportsReasoning: false,
    supportsStreaming: true,
    supportsPromptCache: false,
    deprecated: false,
  },
];
