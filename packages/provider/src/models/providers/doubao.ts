/**
 * Doubao (ByteDance) model definitions
 * @module models/providers/doubao
 */

import type { ModelInfo } from "../types.js";

/**
 * Doubao (ByteDance) model catalog
 * Pricing: https://www.volcengine.com/docs/82379/1099320
 * Models: https://www.volcengine.com/docs/82379/1099334
 */
export const DOUBAO_MODELS: ModelInfo[] = [
  // ==========================================================================
  // Doubao Seed Series
  // ==========================================================================
  {
    id: "doubao-seed-code-preview-latest",
    name: "Doubao Seed Code Preview",
    provider: "doubao",
    contextWindow: 256_000,
    maxOutputTokens: 32_768,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: false,
    supportsStreaming: true,
    supportsPromptCache: true,
    inputPrice: 0.17,
    outputPrice: 1.12,
    deprecated: false,
    description: "ByteDance's Doubao Seed coding model",
  },
  {
    id: "doubao-seed-1-6-250615",
    name: "Doubao Seed 1.6",
    provider: "doubao",
    contextWindow: 128_000,
    maxOutputTokens: 32_768,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: false,
    supportsStreaming: true,
    supportsPromptCache: false,
    inputPrice: 0.0001,
    outputPrice: 0.0004,
    deprecated: false,
    description: "ByteDance's Doubao Seed 1.6 model",
  },
  // ==========================================================================
  // Doubao Pro Series
  // ==========================================================================
  {
    id: "doubao-1-5-pro-256k-250115",
    name: "Doubao 1.5 Pro 256K",
    provider: "doubao",
    contextWindow: 256_000,
    maxOutputTokens: 16_384,
    supportsTools: true,
    supportsVision: false,
    supportsReasoning: false,
    supportsStreaming: true,
    supportsPromptCache: false,
    inputPrice: 0.07,
    outputPrice: 0.14,
    deprecated: false,
    description: "ByteDance's Doubao 1.5 Pro 256K model",
  },
  {
    id: "doubao-1-5-vision-pro-256k-250328",
    name: "Doubao 1.5 Vision Pro 256K",
    provider: "doubao",
    contextWindow: 256_000,
    maxOutputTokens: 16_384,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: false,
    supportsStreaming: true,
    supportsPromptCache: false,
    inputPrice: 0.14,
    outputPrice: 0.28,
    deprecated: false,
    description: "ByteDance's Doubao 1.5 Vision Pro model",
  },
];
