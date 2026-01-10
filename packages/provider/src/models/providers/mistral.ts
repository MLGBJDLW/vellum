/**
 * Mistral AI model definitions
 * @module models/providers/mistral
 */

import type { ModelInfo } from "../types.js";

/**
 * Mistral AI model catalog
 * Pricing: https://mistral.ai/technology/#pricing
 * Models: https://docs.mistral.ai/getting-started/models/
 */
export const MISTRAL_MODELS: ModelInfo[] = [
  // ==========================================================================
  // Mistral Large Series (Premium)
  // ==========================================================================
  {
    id: "mistral-large-latest",
    name: "Mistral Large",
    provider: "mistral",
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
    supportsTools: true,
    supportsVision: false,
    supportsReasoning: true,
    supportsStreaming: true,
    supportsPromptCache: false,
    inputPrice: 2.0,
    outputPrice: 6.0,
    deprecated: false,
    description: "Mistral's flagship model for complex tasks",
  },
  // ==========================================================================
  // Codestral (Coding)
  // ==========================================================================
  {
    id: "codestral-latest",
    name: "Codestral",
    provider: "mistral",
    contextWindow: 32_000,
    maxOutputTokens: 8_192,
    supportsTools: true,
    supportsVision: false,
    supportsReasoning: false,
    supportsStreaming: true,
    supportsPromptCache: false,
    inputPrice: 0.3,
    outputPrice: 0.9,
    deprecated: false,
    description: "Mistral's specialized coding model",
  },
  // ==========================================================================
  // Mistral Small Series (Efficient)
  // ==========================================================================
  {
    id: "mistral-small-latest",
    name: "Mistral Small",
    provider: "mistral",
    contextWindow: 32_000,
    maxOutputTokens: 8_192,
    supportsTools: true,
    supportsVision: false,
    supportsReasoning: false,
    supportsStreaming: true,
    supportsPromptCache: false,
    inputPrice: 0.1,
    outputPrice: 0.3,
    deprecated: false,
    description: "Mistral's cost-effective model",
  },
  // ==========================================================================
  // Pixtral (Vision)
  // ==========================================================================
  {
    id: "pixtral-large-latest",
    name: "Pixtral Large",
    provider: "mistral",
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: false,
    supportsStreaming: true,
    supportsPromptCache: false,
    inputPrice: 2.0,
    outputPrice: 6.0,
    deprecated: false,
    description: "Mistral's vision-enabled Pixtral model",
  },
];
