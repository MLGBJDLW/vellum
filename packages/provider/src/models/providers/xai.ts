/**
 * xAI (Grok) model definitions
 * @module models/providers/xai
 */

import type { ModelInfo } from "../types.js";

/**
 * xAI Grok model catalog
 * Pricing: https://x.ai/api
 * Models: https://docs.x.ai/docs/models
 */
export const XAI_MODELS: ModelInfo[] = [
  // ==========================================================================
  // Grok 3 Series (Latest)
  // ==========================================================================
  {
    id: "grok-3",
    name: "Grok 3",
    provider: "xai",
    contextWindow: 131_072,
    maxOutputTokens: 16_384,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: true,
    supportsStreaming: true,
    supportsPromptCache: false,
    inputPrice: 3.0,
    outputPrice: 15.0,
    deprecated: false,
    description: "xAI's flagship Grok 3 model",
  },
  {
    id: "grok-3-mini",
    name: "Grok 3 Mini",
    provider: "xai",
    contextWindow: 131_072,
    maxOutputTokens: 16_384,
    supportsTools: true,
    supportsVision: false,
    supportsReasoning: true,
    supportsStreaming: true,
    supportsPromptCache: false,
    inputPrice: 0.3,
    outputPrice: 0.5,
    reasoningEfforts: ["low", "high"],
    defaultReasoningEffort: "low",
    deprecated: false,
    description: "xAI's efficient Grok 3 Mini model with thinking",
  },
  // ==========================================================================
  // Grok 2 Series
  // ==========================================================================
  {
    id: "grok-2",
    name: "Grok 2",
    provider: "xai",
    contextWindow: 131_072,
    maxOutputTokens: 8_192,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: false,
    supportsStreaming: true,
    supportsPromptCache: false,
    inputPrice: 2.0,
    outputPrice: 10.0,
    deprecated: false,
    description: "xAI's Grok 2 model",
  },
];
