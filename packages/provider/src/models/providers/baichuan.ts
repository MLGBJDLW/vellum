/**
 * Baichuan model definitions
 * @module models/providers/baichuan
 */

import type { ModelInfo } from "../types.js";

/**
 * Baichuan model catalog
 * Pricing: https://platform.baichuan-ai.com/docs/pricing
 * Models: https://platform.baichuan-ai.com/docs/models
 */
export const BAICHUAN_MODELS: ModelInfo[] = [
  {
    id: "Baichuan4",
    name: "Baichuan 4",
    provider: "baichuan",
    contextWindow: 32_000,
    maxOutputTokens: 4_096,
    supportsTools: true,
    supportsVision: false,
    supportsReasoning: true,
    supportsStreaming: true,
    supportsPromptCache: false,
    inputPrice: 0.1,
    outputPrice: 0.1,
    deprecated: false,
    description: "Baichuan's latest model",
  },
  {
    id: "Baichuan3-Turbo",
    name: "Baichuan 3 Turbo",
    provider: "baichuan",
    contextWindow: 32_000,
    maxOutputTokens: 4_096,
    supportsTools: true,
    supportsVision: false,
    supportsReasoning: false,
    supportsStreaming: true,
    supportsPromptCache: false,
    inputPrice: 0.012,
    outputPrice: 0.012,
    deprecated: false,
    description: "Fast, efficient Baichuan 3 model",
  },
  {
    id: "Baichuan3-Turbo-128k",
    name: "Baichuan 3 Turbo 128K",
    provider: "baichuan",
    contextWindow: 128_000,
    maxOutputTokens: 4_096,
    supportsTools: true,
    supportsVision: false,
    supportsReasoning: false,
    supportsStreaming: true,
    supportsPromptCache: false,
    inputPrice: 0.024,
    outputPrice: 0.024,
    deprecated: false,
    description: "Extended-context Baichuan 3 Turbo",
  },
  {
    id: "Baichuan2-Turbo",
    name: "Baichuan 2 Turbo",
    provider: "baichuan",
    contextWindow: 32_000,
    maxOutputTokens: 4_096,
    supportsTools: true,
    supportsVision: false,
    supportsReasoning: false,
    supportsStreaming: true,
    supportsPromptCache: false,
    inputPrice: 0.008,
    outputPrice: 0.008,
    deprecated: false,
    description: "Previous generation turbo model",
  },
  {
    id: "Baichuan2-Turbo-192k",
    name: "Baichuan 2 Turbo 192K",
    provider: "baichuan",
    contextWindow: 192_000,
    maxOutputTokens: 4_096,
    supportsTools: true,
    supportsVision: false,
    supportsReasoning: false,
    supportsStreaming: true,
    supportsPromptCache: false,
    inputPrice: 0.016,
    outputPrice: 0.016,
    deprecated: false,
    description: "Extended-context Baichuan 2 Turbo",
  },
];
