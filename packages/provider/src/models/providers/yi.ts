/**
 * Yi (01.AI) model definitions
 * @module models/providers/yi
 */

import type { ModelInfo } from "../types.js";

/**
 * Yi (01.AI) model catalog
 * Legacy IDs retained for existing deployments. Current public documentation does
 * not verify a price table; prices stay unknown until account discovery supplies them.
 * Models: https://platform.lingyiwanwu.com/docs
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
    deprecated: false,
    description: "Vision-enabled multimodal Yi model",
  },
];
