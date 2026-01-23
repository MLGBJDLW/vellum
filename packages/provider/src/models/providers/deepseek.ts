/**
 * DeepSeek model definitions
 * @module models/providers/deepseek
 */

import type { ModelInfo } from "../types.js";

/**
 * DeepSeek model catalog
 * Pricing: https://platform.deepseek.com/api-docs/pricing
 * Models: https://platform.deepseek.com/api-docs/
 */
export const DEEPSEEK_MODELS: ModelInfo[] = [
  // ==========================================================================
  // DeepSeek Chat Models
  // ==========================================================================
  {
    id: "deepseek-chat",
    name: "DeepSeek Chat",
    provider: "deepseek",
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
    supportsTools: true,
    supportsVision: false,
    supportsReasoning: false,
    supportsStreaming: true,
    supportsPromptCache: true,
    inputPrice: 0.28,
    outputPrice: 0.42,
    cacheReadsPrice: 0.028,
    deprecated: false,
    description: "DeepSeek's general-purpose chat model",
  },
  {
    id: "deepseek-chat-v3",
    name: "DeepSeek Chat V3",
    provider: "deepseek",
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
    supportsTools: true,
    supportsVision: false,
    supportsReasoning: false,
    supportsStreaming: true,
    supportsPromptCache: true,
    inputPrice: 0.28,
    outputPrice: 0.42,
    cacheReadsPrice: 0.028,
    deprecated: false,
    description: "DeepSeek's latest V3 chat model with improved performance",
  },
  // ==========================================================================
  // DeepSeek Coder Models
  // ==========================================================================
  {
    id: "deepseek-coder",
    name: "DeepSeek Coder",
    provider: "deepseek",
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
    supportsTools: true,
    supportsVision: false,
    supportsReasoning: false,
    supportsStreaming: true,
    supportsPromptCache: true,
    inputPrice: 0.28,
    outputPrice: 0.42,
    cacheReadsPrice: 0.028,
    deprecated: false,
    description: "DeepSeek's specialized coding model",
  },
  // ==========================================================================
  // DeepSeek Reasoner Models
  // ==========================================================================
  {
    id: "deepseek-reasoner",
    name: "DeepSeek Reasoner",
    provider: "deepseek",
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
    supportsTools: true,
    supportsVision: false,
    supportsReasoning: true,
    supportsStreaming: true,
    supportsPromptCache: true,
    inputPrice: 0.28,
    outputPrice: 0.42,
    cacheReadsPrice: 0.028,
    deprecated: false,
    description: "DeepSeek's reasoning-optimized model (R1)",
  },
  {
    id: "deepseek-r1",
    name: "DeepSeek R1",
    provider: "deepseek",
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
    supportsTools: true,
    supportsVision: false,
    supportsReasoning: true,
    supportsStreaming: true,
    supportsPromptCache: true,
    inputPrice: 0.55,
    outputPrice: 2.19,
    cacheReadsPrice: 0.14,
    deprecated: false,
    description: "DeepSeek R1 - advanced reasoning model with chain-of-thought",
  },
  {
    id: "deepseek-r1-lite",
    name: "DeepSeek R1 Lite",
    provider: "deepseek",
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
    supportsTools: true,
    supportsVision: false,
    supportsReasoning: true,
    supportsStreaming: true,
    supportsPromptCache: true,
    inputPrice: 0.14,
    outputPrice: 0.55,
    cacheReadsPrice: 0.035,
    deprecated: false,
    description: "DeepSeek R1 Lite - lightweight reasoning model",
  },
];
