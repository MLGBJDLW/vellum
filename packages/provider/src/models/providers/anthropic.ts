/**
 * Anthropic (Claude) model definitions
 * @module models/providers/anthropic
 */

import type { ModelInfo } from "../types.js";

/**
 * Anthropic Claude model catalog
 * Pricing: https://www.anthropic.com/pricing
 * Models: https://docs.anthropic.com/en/docs/about-claude/models
 */
export const ANTHROPIC_MODELS: ModelInfo[] = [
  // ==========================================================================
  // Claude 4.5 Series (Latest)
  // ==========================================================================
  {
    id: "claude-sonnet-4-5",
    name: "Claude Sonnet 4.5",
    provider: "anthropic",
    contextWindow: 200_000,
    maxOutputTokens: 64_000,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: true,
    supportsStreaming: true,
    supportsPromptCache: true,
    inputPrice: 3.0,
    outputPrice: 15.0,
    cacheWritesPrice: 3.75,
    cacheReadsPrice: 0.3,
    reasoningEfforts: ["low", "medium", "high"],
    defaultReasoningEffort: "medium",
    tiers: [
      {
        name: "up to 200K",
        contextWindow: 200_000,
        inputPrice: 3.0,
        outputPrice: 15.0,
        cacheWritesPrice: 3.75,
        cacheReadsPrice: 0.3,
      },
      {
        name: "above 200K (beta)",
        contextWindow: 1_000_000,
        inputPrice: 6.0,
        outputPrice: 22.5,
        cacheWritesPrice: 7.5,
        cacheReadsPrice: 0.6,
      },
    ],
    deprecated: false,
    description: "Most capable Claude model with extended thinking and strong reasoning",
  },
  {
    id: "claude-opus-4-5-20251101",
    name: "Claude Opus 4.5",
    provider: "anthropic",
    contextWindow: 200_000,
    maxOutputTokens: 32_000,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: true,
    supportsStreaming: true,
    supportsPromptCache: true,
    inputPrice: 5.0,
    outputPrice: 25.0,
    cacheWritesPrice: 6.25,
    cacheReadsPrice: 0.5,
    reasoningEfforts: ["low", "medium", "high"],
    defaultReasoningEffort: "medium",
    deprecated: false,
    description: "High-capability Claude model optimized for complex reasoning tasks",
  },

  // ==========================================================================
  // Claude 4.1 Series
  // ==========================================================================
  {
    id: "claude-opus-4-1-20250805",
    name: "Claude Opus 4.1",
    provider: "anthropic",
    contextWindow: 200_000,
    maxOutputTokens: 32_000,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: true,
    supportsStreaming: true,
    supportsPromptCache: true,
    inputPrice: 15.0,
    outputPrice: 75.0,
    cacheWritesPrice: 18.75,
    cacheReadsPrice: 1.5,
    reasoningEfforts: ["low", "medium", "high"],
    defaultReasoningEffort: "medium",
    deprecated: false,
    description: "Previous generation Opus model with strong reasoning",
  },

  // ==========================================================================
  // Claude 4.0 Series
  // ==========================================================================
  {
    id: "claude-sonnet-4-20250514",
    name: "Claude Sonnet 4",
    provider: "anthropic",
    contextWindow: 200_000,
    maxOutputTokens: 64_000,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: true,
    supportsStreaming: true,
    supportsPromptCache: true,
    inputPrice: 3.0,
    outputPrice: 15.0,
    cacheWritesPrice: 3.75,
    cacheReadsPrice: 0.3,
    reasoningEfforts: ["low", "medium", "high"],
    defaultReasoningEffort: "medium",
    tiers: [
      {
        name: "up to 200K",
        contextWindow: 200_000,
        inputPrice: 3.0,
        outputPrice: 15.0,
        cacheWritesPrice: 3.75,
        cacheReadsPrice: 0.3,
      },
      {
        name: "above 200K (beta)",
        contextWindow: 1_000_000,
        inputPrice: 6.0,
        outputPrice: 22.5,
        cacheWritesPrice: 7.5,
        cacheReadsPrice: 0.6,
      },
    ],
    deprecated: false,
    description: "Claude Sonnet 4 with extended thinking capabilities",
  },

  // ==========================================================================
  // Claude 3.5 Series
  // ==========================================================================
  {
    id: "claude-3-5-sonnet-20241022",
    name: "Claude 3.5 Sonnet",
    provider: "anthropic",
    contextWindow: 200_000,
    maxOutputTokens: 8_192,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: false,
    supportsStreaming: true,
    supportsPromptCache: true,
    inputPrice: 3.0,
    outputPrice: 15.0,
    cacheWritesPrice: 3.75,
    cacheReadsPrice: 0.3,
    deprecated: false,
    description: "Balanced model for general-purpose tasks with vision support",
  },
  {
    id: "claude-3-5-haiku-20241022",
    name: "Claude 3.5 Haiku",
    provider: "anthropic",
    contextWindow: 200_000,
    maxOutputTokens: 8_192,
    supportsTools: true,
    supportsVision: false,
    supportsReasoning: false,
    supportsStreaming: true,
    supportsPromptCache: true,
    inputPrice: 0.8,
    outputPrice: 4.0,
    cacheWritesPrice: 1.0,
    cacheReadsPrice: 0.08,
    deprecated: false,
    description: "Fast and cost-effective model for simple tasks",
  },
  {
    id: "claude-3-opus-20240229",
    name: "Claude 3 Opus",
    provider: "anthropic",
    contextWindow: 200_000,
    maxOutputTokens: 4_096,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: false,
    supportsStreaming: true,
    supportsPromptCache: true,
    inputPrice: 15.0,
    outputPrice: 75.0,
    cacheWritesPrice: 18.75,
    cacheReadsPrice: 1.5,
    deprecated: false,
    description: "Claude 3 Opus model (legacy but still supported in tests)",
  },
];
