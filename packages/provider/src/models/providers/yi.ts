/**
 * Yi (01.AI) model definitions
 * @module models/providers/yi
 */

import type { ModelInfo } from "../types.js";

/**
 * Yi (01.AI) model catalog
 * Pricing: https://platform.01.ai/docs/pricing
 * Models: https://platform.01.ai/docs/models
 */
export const YI_MODELS: ModelInfo[] = [
  {
    id: "yi-large",
    name: "Yi Large",
    provider: "yi",
    contextWindow: 32_000,
    maxOutputTokens: 4_096,
    supportsTools: true,
    supportsVision: false,
    supportsReasoning: false,
    supportsStreaming: true,
    supportsPromptCache: false,
    inputPrice: 0.12,
    outputPrice: 0.12,
    deprecated: false,
    description: "01.AI's flagship Yi Large model",
  },
  {
    id: "yi-large-turbo",
    name: "Yi Large Turbo",
    provider: "yi",
    contextWindow: 16_000,
    maxOutputTokens: 4_096,
    supportsTools: true,
    supportsVision: false,
    supportsReasoning: false,
    supportsStreaming: true,
    supportsPromptCache: false,
    inputPrice: 0.012,
    outputPrice: 0.012,
    deprecated: false,
    description: "Faster variant of Yi Large",
  },
  {
    id: "yi-medium",
    name: "Yi Medium",
    provider: "yi",
    contextWindow: 16_000,
    maxOutputTokens: 4_096,
    supportsTools: true,
    supportsVision: false,
    supportsReasoning: false,
    supportsStreaming: true,
    supportsPromptCache: false,
    inputPrice: 0.0025,
    outputPrice: 0.0025,
    deprecated: false,
    description: "Balanced model for cost and performance",
  },
  {
    id: "yi-medium-200k",
    name: "Yi Medium 200K",
    provider: "yi",
    contextWindow: 200_000,
    maxOutputTokens: 4_096,
    supportsTools: true,
    supportsVision: false,
    supportsReasoning: false,
    supportsStreaming: true,
    supportsPromptCache: false,
    inputPrice: 0.012,
    outputPrice: 0.012,
    deprecated: false,
    description: "Extended-context Yi Medium",
  },
  {
    id: "yi-vision",
    name: "Yi Vision",
    provider: "yi",
    contextWindow: 16_000,
    maxOutputTokens: 4_096,
    supportsTools: false,
    supportsVision: true,
    supportsReasoning: false,
    supportsStreaming: true,
    supportsPromptCache: false,
    inputPrice: 0.006,
    outputPrice: 0.006,
    deprecated: false,
    description: "Vision-enabled multimodal Yi model",
  },
];
