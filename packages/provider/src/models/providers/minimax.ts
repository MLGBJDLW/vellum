/**
 * minimax text/tool model catalog, audited 2026-10-29.
 * Sources, exclusions and endpoint constraints: docs/research/provider-model-audit.md.
 * Account/region availability still requires provider discovery; missing prices are unknown.
 */
import type { ModelInfo } from "../types.js";

export const MINIMAX_MODELS: ModelInfo[] = [
  {
    id: "MiniMax-M3.1-Flash",
    name: "MiniMax M3.1 Flash",
    provider: "minimax",
    contextWindow: 1000000,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: true,
    supportsStreaming: true,
    supportsPromptCache: true,
    deprecated: false,
    inputPrice: 0.15,
    outputPrice: 0.6,
    cacheReadsPrice: 0.015,
    supportsSampling: false,
    requiresThinking: true,
    reasoningEfforts: ["low", "medium", "high", "xhigh", "max"],
    defaultReasoningEffort: "max",
  },
  {
    id: "MiniMax-M3",
    name: "MiniMax M3",
    provider: "minimax",
    contextWindow: 1000000,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: true,
    supportsStreaming: true,
    supportsPromptCache: true,
    deprecated: false,
    inputPrice: 0.3,
    outputPrice: 1.2,
    cacheReadsPrice: 0.06,
    supportsSampling: false,
  },
];
