/**
 * doubao text/tool model catalog, audited 2026-10-29.
 * Sources, exclusions and endpoint constraints: docs/research/provider-model-audit.md.
 * Account/region availability still requires provider discovery; missing prices are unknown.
 */
import type { ModelInfo } from "../types.js";

export const DOUBAO_MODELS: ModelInfo[] = [
  {
    id: "doubao-seed-evolving",
    name: "doubao-seed-evolving",
    provider: "doubao",
    contextWindow: 1048576,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: true,
    supportsStreaming: true,
    supportsPromptCache: true,
    deprecated: false,
    maxOutputTokens: 262144,
    reasoningEfforts: ["minimal", "low", "medium", "high"],
    defaultReasoningEffort: "high",
  },
  {
    id: "doubao-seed-2-1-pro-260915",
    name: "doubao-seed-2-1-pro-260915",
    provider: "doubao",
    contextWindow: 1048576,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: true,
    supportsStreaming: true,
    supportsPromptCache: true,
    deprecated: false,
    maxOutputTokens: 262144,
    reasoningEfforts: ["minimal", "low", "medium", "high"],
    defaultReasoningEffort: "high",
  },
  {
    id: "doubao-seed-2-1-lite-260915",
    name: "doubao-seed-2-1-lite-260915",
    provider: "doubao",
    contextWindow: 1048576,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: true,
    supportsStreaming: true,
    supportsPromptCache: true,
    deprecated: false,
    maxOutputTokens: 262144,
    reasoningEfforts: ["minimal", "low", "medium", "high"],
    defaultReasoningEffort: "high",
  },
  {
    id: "doubao-seed-2-1-turbo-260628",
    name: "doubao-seed-2-1-turbo-260628",
    provider: "doubao",
    contextWindow: 262144,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: true,
    supportsStreaming: true,
    supportsPromptCache: true,
    deprecated: false,
    maxOutputTokens: 262144,
    reasoningEfforts: ["minimal", "low", "medium", "high"],
    defaultReasoningEffort: "high",
  },
];
