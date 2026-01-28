/**
 * Google (Gemini) model definitions
 * @module models/providers/google
 */

import type { ModelInfo } from "../types.js";

/**
 * Google Gemini model catalog
 * Pricing: https://ai.google.dev/pricing
 * Models: https://ai.google.dev/gemini-api/docs/models/gemini
 */
export const GOOGLE_MODELS: ModelInfo[] = [
  // ==========================================================================
  // Gemini 3 Series (Latest - Stable)
  // ==========================================================================
  {
    id: "gemini-3-pro",
    name: "Gemini 3 Pro",
    provider: "google",
    contextWindow: 1_000_000,
    maxOutputTokens: 16_384,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: true,
    supportsStreaming: true,
    supportsPromptCache: true,
    inputPrice: 2.0,
    outputPrice: 12.0,
    cacheReadsPrice: 0.5,
    cacheWritesPrice: 3.0,
    reasoningEfforts: ["low", "high"],
    defaultReasoningEffort: "low",
    tiers: [
      {
        name: "up to 200K",
        contextWindow: 200_000,
        inputPrice: 2.0,
        outputPrice: 12.0,
      },
      {
        name: "above 200K",
        contextWindow: 1_000_000,
        inputPrice: 4.0,
        outputPrice: 18.0,
      },
    ],
    deprecated: false,
    description: "Google's flagship multimodal model with advanced reasoning (stable)",
  },
  {
    id: "gemini-3-flash",
    name: "Gemini 3 Flash",
    provider: "google",
    contextWindow: 1_000_000,
    maxOutputTokens: 8_192,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: true,
    supportsStreaming: true,
    supportsPromptCache: true,
    inputPrice: 0.3,
    outputPrice: 2.5,
    cacheReadsPrice: 0.075,
    cacheWritesPrice: 1.0,
    reasoningEfforts: ["minimal", "low", "medium", "high"],
    defaultReasoningEffort: "medium",
    deprecated: false,
    description: "Balanced speed and intelligence with strong reasoning (stable)",
  },

  // ==========================================================================
  // Gemini 3 Series (Preview)
  // ==========================================================================
  {
    id: "gemini-3-pro-preview",
    name: "Gemini 3 Pro Preview",
    provider: "google",
    contextWindow: 1_048_576,
    maxOutputTokens: 65_536,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: true,
    supportsStreaming: true,
    supportsPromptCache: true,
    inputPrice: 2.0,
    outputPrice: 12.0,
    cacheReadsPrice: 0.5,
    cacheWritesPrice: 3.0,
    reasoningEfforts: ["low", "high"],
    defaultReasoningEffort: "low",
    tiers: [
      {
        name: "up to 200K",
        contextWindow: 200_000,
        inputPrice: 2.0,
        outputPrice: 12.0,
      },
      {
        name: "above 200K",
        contextWindow: 1_048_576,
        inputPrice: 4.0,
        outputPrice: 18.0,
      },
    ],
    deprecated: false,
    description: "Google's most capable multimodal model with advanced reasoning",
  },
  {
    id: "gemini-3-flash-preview",
    name: "Gemini 3 Flash Preview",
    provider: "google",
    contextWindow: 1_048_576,
    maxOutputTokens: 65_536,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: true,
    supportsStreaming: true,
    supportsPromptCache: true,
    inputPrice: 0.3,
    outputPrice: 2.5,
    cacheReadsPrice: 0.075,
    cacheWritesPrice: 1.0,
    reasoningEfforts: ["minimal", "low", "medium", "high"],
    defaultReasoningEffort: "medium",
    deprecated: false,
    description: "Fast and efficient model with strong reasoning capabilities",
  },

  // ==========================================================================
  // Gemini 2.5 Series
  // ==========================================================================
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    provider: "google",
    contextWindow: 1_048_576, // Fixed: was incorrectly 200K in some configs
    maxOutputTokens: 64_000,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: true,
    supportsStreaming: true,
    supportsPromptCache: true,
    inputPrice: 1.25,
    outputPrice: 10.0,
    cacheReadsPrice: 0.31,
    cacheWritesPrice: 4.5,
    tiers: [
      {
        name: "up to 200K",
        contextWindow: 200_000,
        inputPrice: 1.25,
        outputPrice: 10.0,
        cacheReadsPrice: 0.31,
      },
      {
        name: "above 200K",
        contextWindow: 1_048_576,
        inputPrice: 2.5,
        outputPrice: 15.0,
        cacheReadsPrice: 0.625,
      },
    ],
    deprecated: false,
    description: "Advanced multimodal model with extended context and reasoning budget support",
  },
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    provider: "google",
    contextWindow: 1_048_576,
    maxOutputTokens: 64_000,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: true,
    supportsStreaming: true,
    supportsPromptCache: true,
    inputPrice: 0.15,
    outputPrice: 0.6,
    cacheReadsPrice: 0.075,
    cacheWritesPrice: 1.0,
    deprecated: false,
    description: "Fast and cost-effective model with reasoning capabilities",
  },
  {
    id: "gemini-2.5-flash-lite",
    name: "Gemini 2.5 Flash Lite",
    provider: "google",
    contextWindow: 1_048_576,
    maxOutputTokens: 65_536,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: true,
    supportsStreaming: true,
    supportsPromptCache: true,
    inputPrice: 0.1,
    outputPrice: 0.4,
    cacheReadsPrice: 0.025,
    cacheWritesPrice: 1.0,
    deprecated: false,
    description: "Lightweight version of Flash for cost-sensitive applications",
  },

  // ==========================================================================
  // Gemini 2.0 Series
  // ==========================================================================
  {
    id: "gemini-2.0-flash-exp",
    name: "Gemini 2.0 Flash Experimental",
    provider: "google",
    contextWindow: 1_048_576,
    maxOutputTokens: 8_192,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: false,
    supportsStreaming: true,
    supportsPromptCache: false,
    inputPrice: 0,
    outputPrice: 0,
    deprecated: false,
    description: "Experimental model - free during preview period",
  },

  // ==========================================================================
  // Gemini 1.5 Series (Legacy but still supported)
  // ==========================================================================
  {
    id: "gemini-1.5-pro",
    name: "Gemini 1.5 Pro",
    provider: "google",
    contextWindow: 2_097_152, // 2M tokens - largest context window
    maxOutputTokens: 8_192,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: false,
    supportsStreaming: true,
    supportsPromptCache: true,
    inputPrice: 1.25,
    outputPrice: 5.0,
    cacheReadsPrice: 0.31,
    cacheWritesPrice: 4.5,
    tiers: [
      {
        name: "up to 128K",
        contextWindow: 128_000,
        inputPrice: 1.25,
        outputPrice: 5.0,
        cacheReadsPrice: 0.31,
      },
      {
        name: "above 128K",
        contextWindow: 2_097_152,
        inputPrice: 2.5,
        outputPrice: 10.0,
        cacheReadsPrice: 0.625,
      },
    ],
    deprecated: false,
    description: "Legacy model with 2M context window for long document processing",
  },
  {
    id: "gemini-1.5-flash",
    name: "Gemini 1.5 Flash",
    provider: "google",
    contextWindow: 1_048_576,
    maxOutputTokens: 8_192,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: false,
    supportsStreaming: true,
    supportsPromptCache: true,
    inputPrice: 0.075,
    outputPrice: 0.3,
    cacheReadsPrice: 0.01875,
    cacheWritesPrice: 0.075,
    tiers: [
      {
        name: "up to 128K",
        contextWindow: 128_000,
        inputPrice: 0.075,
        outputPrice: 0.3,
        cacheReadsPrice: 0.01875,
      },
      {
        name: "above 128K",
        contextWindow: 1_048_576,
        inputPrice: 0.15,
        outputPrice: 0.6,
        cacheReadsPrice: 0.0375,
      },
    ],
    deprecated: false,
    description: "Fast and affordable model for high-volume tasks",
  },

  // ==========================================================================
  // Aliases (for convenience)
  // ==========================================================================
  {
    id: "gemini-flash-latest",
    name: "Gemini Flash (Latest)",
    provider: "google",
    contextWindow: 1_048_576,
    maxOutputTokens: 65_536,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: true,
    supportsStreaming: true,
    supportsPromptCache: true,
    inputPrice: 0.3,
    outputPrice: 2.5,
    cacheReadsPrice: 0.075,
    cacheWritesPrice: 1.0,
    deprecated: false,
    aliases: ["gemini-2.5-flash"],
    description: "Alias pointing to the latest Flash model",
  },
  {
    id: "gemini-flash-lite-latest",
    name: "Gemini Flash Lite (Latest)",
    provider: "google",
    contextWindow: 1_048_576,
    maxOutputTokens: 65_536,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: true,
    supportsStreaming: true,
    supportsPromptCache: true,
    inputPrice: 0.1,
    outputPrice: 0.4,
    cacheReadsPrice: 0.025,
    cacheWritesPrice: 1.0,
    deprecated: false,
    aliases: ["gemini-2.5-flash-lite"],
    description: "Alias pointing to the latest Flash Lite model",
  },
];

/**
 * Default Google model ID
 */
export const GOOGLE_DEFAULT_MODEL_ID = "gemini-2.5-flash";
