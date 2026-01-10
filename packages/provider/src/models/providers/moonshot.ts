/**
 * Moonshot (Kimi) model definitions
 * @module models/providers/moonshot
 */

import type { ModelInfo } from "../types.js";

/**
 * Moonshot (Kimi K2) model catalog
 * Pricing: https://platform.moonshot.cn/docs/pricing
 * Models: https://platform.moonshot.cn/docs/intro
 */
export const MOONSHOT_MODELS: ModelInfo[] = [
  // ===========================================================================
  // moonshot-v1 Series (Legacy IDs used by tests)
  // ===========================================================================
  {
    id: "moonshot-v1-8k",
    name: "Moonshot V1 8K",
    provider: "moonshot",
    contextWindow: 8_000,
    maxOutputTokens: 4_096,
    supportsTools: true,
    supportsVision: false,
    supportsReasoning: false,
    supportsStreaming: true,
    supportsPromptCache: false,
    inputPrice: 0.012,
    outputPrice: 0.012,
    deprecated: false,
    description: "Moonshot V1 8K context",
  },
  {
    id: "moonshot-v1-32k",
    name: "Moonshot V1 32K",
    provider: "moonshot",
    contextWindow: 32_000,
    maxOutputTokens: 4_096,
    supportsTools: true,
    supportsVision: false,
    supportsReasoning: false,
    supportsStreaming: true,
    supportsPromptCache: false,
    inputPrice: 0.024,
    outputPrice: 0.024,
    deprecated: false,
    description: "Moonshot V1 32K context",
  },
  {
    id: "moonshot-v1-128k",
    name: "Moonshot V1 128K",
    provider: "moonshot",
    contextWindow: 128_000,
    maxOutputTokens: 4_096,
    supportsTools: true,
    supportsVision: false,
    supportsReasoning: false,
    supportsStreaming: true,
    supportsPromptCache: false,
    inputPrice: 0.06,
    outputPrice: 0.06,
    deprecated: false,
    description: "Moonshot V1 128K context",
  },
  // ==========================================================================
  // Kimi K2 Series
  // ==========================================================================
  {
    id: "kimi-k2-thinking",
    name: "Kimi K2 Thinking",
    provider: "moonshot",
    contextWindow: 262_144,
    maxOutputTokens: 16_000,
    supportsTools: true,
    supportsVision: false,
    supportsReasoning: true,
    supportsStreaming: true,
    supportsPromptCache: false,
    inputPrice: 0.6,
    outputPrice: 2.5,
    deprecated: false,
    description: "Moonshot's Kimi K2 reasoning model",
  },
  {
    id: "kimi-k2-0905-preview",
    name: "Kimi K2 Preview",
    provider: "moonshot",
    contextWindow: 262_144,
    maxOutputTokens: 16_384,
    supportsTools: true,
    supportsVision: false,
    supportsReasoning: false,
    supportsStreaming: true,
    supportsPromptCache: false,
    inputPrice: 0.6,
    outputPrice: 2.5,
    deprecated: false,
    description: "Moonshot's Kimi K2 preview model",
  },
  {
    id: "kimi-k2-turbo-preview",
    name: "Kimi K2 Turbo",
    provider: "moonshot",
    contextWindow: 262_144,
    maxOutputTokens: 32_000,
    supportsTools: true,
    supportsVision: false,
    supportsReasoning: false,
    supportsStreaming: true,
    supportsPromptCache: false,
    inputPrice: 2.4,
    outputPrice: 10.0,
    deprecated: false,
    description: "Moonshot's high-performance Kimi K2 Turbo model",
  },
];
