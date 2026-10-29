/**
 * Baichuan model definitions
 * @module models/providers/baichuan
 */

import type { ModelInfo } from "../types.js";

/**
 * Baichuan model catalog
 * Legacy IDs retained for existing deployments. The public portal requires business
 * access and does not establish current prices; confirm limits in the account console.
 * Models: https://platform.baichuan-ai.com/docs-v2/api
 */
export const BAICHUAN_MODELS: ModelInfo[] = [
  {
    id: "Baichuan4",
    name: "Baichuan 4",
    provider: "baichuan",
    contextWindow: 32_000,
    maxOutputTokens: 4_096,
    supportsTools: true,
    supportsVision: false,
    supportsReasoning: true,
    supportsStreaming: true,
    supportsPromptCache: false,
    deprecated: false,
    description: "Legacy Baichuan 4; confirm current access and limits in the provider console.",
  },
  {
    id: "Baichuan3-Turbo",
    name: "Baichuan 3 Turbo",
    provider: "baichuan",
    contextWindow: 32_000,
    maxOutputTokens: 4_096,
    supportsTools: true,
    supportsVision: false,
    supportsReasoning: false,
    supportsStreaming: true,
    supportsPromptCache: false,
    deprecated: false,
    description: "Fast, efficient Baichuan 3 model",
  },
  {
    id: "Baichuan3-Turbo-128k",
    name: "Baichuan 3 Turbo 128K",
    provider: "baichuan",
    contextWindow: 128_000,
    maxOutputTokens: 4_096,
    supportsTools: true,
    supportsVision: false,
    supportsReasoning: false,
    supportsStreaming: true,
    supportsPromptCache: false,
    deprecated: false,
    description: "Extended-context Baichuan 3 Turbo",
  },
  {
    id: "Baichuan2-Turbo",
    name: "Baichuan 2 Turbo",
    provider: "baichuan",
    contextWindow: 32_000,
    maxOutputTokens: 4_096,
    supportsTools: true,
    supportsVision: false,
    supportsReasoning: false,
    supportsStreaming: true,
    supportsPromptCache: false,
    deprecated: false,
    description: "Previous generation turbo model",
  },
  {
    id: "Baichuan2-Turbo-192k",
    name: "Baichuan 2 Turbo 192K",
    provider: "baichuan",
    contextWindow: 192_000,
    maxOutputTokens: 4_096,
    supportsTools: true,
    supportsVision: false,
    supportsReasoning: false,
    supportsStreaming: true,
    supportsPromptCache: false,
    deprecated: false,
    description: "Extended-context Baichuan 2 Turbo",
  },
];
