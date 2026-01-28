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
  // Groq Compound System (Agentic)
  // ==========================================================================
  {
    id: "groq/compound",
    name: "Groq Compound",
    provider: "groq",
    contextWindow: 131_072,
    maxOutputTokens: 8_192,
    supportsTools: true,
    supportsVision: false,
    supportsReasoning: false,
    supportsStreaming: true,
    supportsPromptCache: false,
    inputPrice: 0,
    outputPrice: 0,
    deprecated: false,
    description: "Groq Compound agentic system with tools",
  },
  {
    id: "groq/compound-mini",
    name: "Groq Compound Mini",
    provider: "groq",
    contextWindow: 131_072,
    maxOutputTokens: 4_096,
    supportsTools: true,
    supportsVision: false,
    supportsReasoning: false,
    supportsStreaming: true,
    supportsPromptCache: false,
    inputPrice: 0,
    outputPrice: 0,
    deprecated: false,
    description: "Groq Compound Mini agentic system",
  },
  // ==========================================================================
  // Kimi on Groq
  // ==========================================================================
  {
    id: "moonshotai/kimi-k2-instruct-0905",
    name: "Kimi K2 (Groq)",
    provider: "groq",
    contextWindow: 262_144,
    maxOutputTokens: 16_384,
    supportsTools: true,
    supportsVision: false,
    supportsReasoning: false,
    supportsStreaming: true,
    supportsPromptCache: false,
    inputPrice: 0,
    outputPrice: 0,
    deprecated: false,
    description: "Moonshot AI Kimi K2 on Groq",
  },
  // ==========================================================================
  // Qwen on Groq
  // ==========================================================================
  {
    id: "qwen/qwen3-32b",
    name: "Qwen3 32B (Groq)",
    provider: "groq",
    contextWindow: 131_072,
    maxOutputTokens: 8_192,
    supportsTools: true,
    supportsVision: false,
    supportsReasoning: false,
    supportsStreaming: true,
    supportsPromptCache: false,
    inputPrice: 0,
    outputPrice: 0,
    deprecated: false,
    description: "Alibaba Qwen3 32B on Groq",
  },
  // ==========================================================================
  // OpenAI Open-Weight Models on Groq
  // ==========================================================================
  {
    id: "openai/gpt-oss-120b",
    name: "GPT-OSS 120B",
    provider: "groq",
    contextWindow: 131_072,
    maxOutputTokens: 8_192,
    supportsTools: true,
    supportsVision: false,
    supportsReasoning: false,
    supportsStreaming: true,
    supportsPromptCache: false,
    inputPrice: 0,
    outputPrice: 0,
    deprecated: false,
    description: "OpenAI GPT-OSS 120B open-weight model on Groq",
  },
  {
    id: "openai/gpt-oss-20b",
    name: "GPT-OSS 20B",
    provider: "groq",
    contextWindow: 131_072,
    maxOutputTokens: 8_192,
    supportsTools: true,
    supportsVision: false,
    supportsReasoning: false,
    supportsStreaming: true,
    supportsPromptCache: false,
    inputPrice: 0,
    outputPrice: 0,
    deprecated: false,
    description: "OpenAI GPT-OSS 20B open-weight model on Groq",
  },
  // ==========================================================================
  // Llama 4 Series
  // ==========================================================================
  {
    id: "meta-llama/llama-4-maverick-17b-128e-instruct",
    name: "Llama 4 Maverick 17B",
    provider: "groq",
    contextWindow: 131_072,
    maxOutputTokens: 16_384,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: false,
    supportsStreaming: true,
    supportsPromptCache: false,
    inputPrice: 0,
    outputPrice: 0,
    deprecated: false,
    description: "Meta Llama 4 Maverick 17B with vision support on Groq",
  },
  {
    id: "meta-llama/llama-4-scout-17b-16e-instruct",
    name: "Llama 4 Scout 17B",
    provider: "groq",
    contextWindow: 131_072,
    maxOutputTokens: 16_384,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: false,
    supportsStreaming: true,
    supportsPromptCache: false,
    inputPrice: 0,
    outputPrice: 0,
    deprecated: false,
    description: "Meta Llama 4 Scout 17B with vision support on Groq",
  },
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
