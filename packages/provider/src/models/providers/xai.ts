/**
 * xai text/tool model catalog, audited 2026-10-29.
 * Sources, exclusions and endpoint constraints: docs/research/provider-model-audit.md.
 * Account/region availability still requires provider discovery; missing prices are unknown.
 */
import type { ModelInfo } from "../types.js";

export const XAI_MODELS: ModelInfo[] = [
  {
    id: "grok-4.7",
    name: "Grok 4.7",
    provider: "xai",
    contextWindow: 500000,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: true,
    supportsStreaming: true,
    supportsPromptCache: true,
    deprecated: false,
    inputPrice: 2,
    outputPrice: 6,
    reasoningEfforts: ["low", "medium", "high", "xhigh"],
    defaultReasoningEffort: "high",
    api: "responses",
  },
  {
    id: "grok-4.6",
    name: "Grok 4.6",
    provider: "xai",
    contextWindow: 500000,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: true,
    supportsStreaming: true,
    supportsPromptCache: true,
    deprecated: false,
    inputPrice: 2,
    outputPrice: 6,
    reasoningEfforts: ["low", "medium", "high", "xhigh"],
    defaultReasoningEffort: "high",
    api: "responses",
  },
];
