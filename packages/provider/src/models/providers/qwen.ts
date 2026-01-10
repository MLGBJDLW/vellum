/**
 * Alibaba Qwen model definitions
 * @module models/providers/qwen
 */

import type { ModelInfo } from "../types.js";

/**
 * Alibaba Qwen model catalog
 * Pricing: https://www.alibabacloud.com/help/en/model-studio/
 * Models: https://www.alibabacloud.com/help/en/model-studio/getting-started/models
 */
export const QWEN_MODELS: ModelInfo[] = [
  // ==========================================================================
  // Qwen Max Series (Premium)
  // ==========================================================================
  {
    id: "qwen-max",
    name: "Qwen Max",
    provider: "qwen",
    contextWindow: 32_000,
    maxOutputTokens: 8_192,
    supportsTools: true,
    supportsVision: false,
    supportsReasoning: false,
    supportsStreaming: true,
    supportsPromptCache: false,
    inputPrice: 2.0,
    outputPrice: 6.0,
    deprecated: false,
    description: "Alibaba's most capable Qwen model",
  },
  // ==========================================================================
  // Qwen Plus Series (Balanced)
  // ==========================================================================
  {
    id: "qwen-plus",
    name: "Qwen Plus",
    provider: "qwen",
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
    supportsTools: true,
    supportsVision: false,
    supportsReasoning: false,
    supportsStreaming: true,
    supportsPromptCache: false,
    inputPrice: 0.4,
    outputPrice: 1.2,
    deprecated: false,
    description: "Alibaba's balanced Qwen Plus model",
  },
  // ==========================================================================
  // Qwen Turbo Series (Fast)
  // ==========================================================================
  {
    id: "qwen-turbo",
    name: "Qwen Turbo",
    provider: "qwen",
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
    supportsTools: true,
    supportsVision: false,
    supportsReasoning: false,
    supportsStreaming: true,
    supportsPromptCache: false,
    inputPrice: 0.05,
    outputPrice: 0.2,
    deprecated: false,
    description: "Alibaba's fast and cost-effective Qwen model",
  },
  // ==========================================================================
  // QwQ (Reasoning Model)
  // ==========================================================================
  {
    id: "qwq-32b",
    name: "QwQ 32B",
    provider: "qwen",
    contextWindow: 32_000,
    maxOutputTokens: 16_384,
    supportsTools: true,
    supportsVision: false,
    supportsReasoning: true,
    supportsStreaming: true,
    supportsPromptCache: false,
    inputPrice: 0.8,
    outputPrice: 2.4,
    deprecated: false,
    description: "Alibaba's reasoning-focused QwQ model",
  },
  // ==========================================================================
  // Qwen3 Coder Series (1M Context)
  // ==========================================================================
  {
    id: "qwen3-coder-plus",
    name: "Qwen3 Coder Plus",
    provider: "qwen",
    contextWindow: 1_000_000,
    maxOutputTokens: 65_536,
    supportsTools: false,
    supportsVision: false,
    supportsReasoning: false,
    supportsStreaming: true,
    supportsPromptCache: false,
    inputPrice: 0.0,
    outputPrice: 0.0,
    deprecated: false,
    description: "Alibaba's free Qwen3 Coder Plus with 1M context",
  },
  {
    id: "qwen3-coder-flash",
    name: "Qwen3 Coder Flash",
    provider: "qwen",
    contextWindow: 1_000_000,
    maxOutputTokens: 65_536,
    supportsTools: false,
    supportsVision: false,
    supportsReasoning: false,
    supportsStreaming: true,
    supportsPromptCache: false,
    inputPrice: 0.0,
    outputPrice: 0.0,
    deprecated: false,
    description: "Alibaba's free fast Qwen3 Coder Flash with 1M context",
  },
];
