/**
 * MiniMax model definitions
 * @module models/providers/minimax
 */

import type { ModelInfo } from "../types.js";

/**
 * MiniMax model catalog
 * Pricing: https://platform.minimaxi.com/document/Price
 * Models: https://platform.minimaxi.com/document/Models
 */
export const MINIMAX_MODELS: ModelInfo[] = [
  // ==========================================================================
  // MiniMax M2 Series
  // ==========================================================================
  {
    id: "MiniMax-M2",
    name: "MiniMax M2",
    provider: "minimax",
    contextWindow: 192_000,
    maxOutputTokens: 16_384,
    supportsTools: true,
    supportsVision: false,
    supportsReasoning: true,
    supportsStreaming: true,
    supportsPromptCache: false,
    inputPrice: 0.3,
    outputPrice: 1.2,
    deprecated: false,
    description: "MiniMax's flagship M2 reasoning model",
  },
  {
    id: "MiniMax-M2.1",
    name: "MiniMax M2.1",
    provider: "minimax",
    contextWindow: 192_000,
    maxOutputTokens: 16_384,
    supportsTools: true,
    supportsVision: false,
    supportsReasoning: true,
    supportsStreaming: true,
    supportsPromptCache: false,
    inputPrice: 0.3,
    outputPrice: 1.2,
    deprecated: false,
    description: "MiniMax's improved M2.1 reasoning model",
  },
  {
    id: "MiniMax-Text-01",
    name: "MiniMax Text 01",
    provider: "minimax",
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
    supportsTools: true,
    supportsVision: false,
    supportsReasoning: false,
    supportsStreaming: true,
    supportsPromptCache: false,
    inputPrice: 0.15,
    outputPrice: 0.6,
    deprecated: false,
    description: "MiniMax's general text model",
  },
];
