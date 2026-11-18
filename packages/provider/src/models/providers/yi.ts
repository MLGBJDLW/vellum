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

// Saved sessions and private deployments can still select these historical IDs.
// Keep their wire capabilities available without listing them as public routes.
export const YI_MODEL_METADATA: ModelInfo[] = [
  ...YI_MODELS,
  ...(
    [
      ["yi-large", "Yi Large", 32_000],
      ["yi-large-turbo", "Yi Large Turbo", 16_000],
      ["yi-medium", "Yi Medium", 16_000],
      ["yi-medium-200k", "Yi Medium 200K", 200_000],
      ["yi-vision", "Yi Vision", 16_000],
    ] as const
  ).map(
    ([id, name, contextWindow]): ModelInfo => ({
      id,
      name,
      provider: "yi",
      contextWindow,
      maxOutputTokens: 4096,
      supportsTools: id !== "yi-vision",
      supportsVision: id === "yi-vision",
      supportsReasoning: false,
      supportsStreaming: true,
      supportsPromptCache: false,
      deprecated: false,
    })
  ),
];
