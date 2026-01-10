/**
 * Groq model definitions
 * @module models/providers/groq
 */

import type { ModelInfo } from "../types.js";

/**
 * Groq model catalog
 * Pricing: https://groq.com/pricing/
 * Models: https://console.groq.com/docs/models
 */
export const GROQ_MODELS: ModelInfo[] = [
  // ==========================================================================
  // Llama 3.3 Series
  // ==========================================================================
  {
    id: "llama-3.3-70b-versatile",
    name: "Llama 3.3 70B Versatile",
    provider: "groq",
    contextWindow: 128_000,
    maxOutputTokens: 32_768,
    supportsTools: true,
    supportsVision: false,
    supportsReasoning: false,
    supportsStreaming: true,
    supportsPromptCache: false,
    inputPrice: 0.59,
    outputPrice: 0.79,
    deprecated: false,
    description: "Meta's Llama 3.3 70B on Groq's LPU inference engine",
  },
  // ==========================================================================
  // Llama 3.1 Series
  // ==========================================================================
  {
    id: "llama-3.1-8b-instant",
    name: "Llama 3.1 8B Instant",
    provider: "groq",
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
    supportsTools: true,
    supportsVision: false,
    supportsReasoning: false,
    supportsStreaming: true,
    supportsPromptCache: false,
    inputPrice: 0.05,
    outputPrice: 0.08,
    deprecated: false,
    description: "Fast inference with Llama 3.1 8B",
  },
  // ==========================================================================
  // Mixtral Series
  // ==========================================================================
  {
    id: "mixtral-8x7b-32768",
    name: "Mixtral 8x7B",
    provider: "groq",
    contextWindow: 32_768,
    maxOutputTokens: 8_192,
    supportsTools: true,
    supportsVision: false,
    supportsReasoning: false,
    supportsStreaming: true,
    supportsPromptCache: false,
    inputPrice: 0.24,
    outputPrice: 0.24,
    deprecated: false,
    description: "Mixtral 8x7B MoE model on Groq",
  },
];
