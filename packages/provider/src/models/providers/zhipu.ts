import type { ModelInfo } from "../types.js";

// The hosted BigModel model overview and each model's API page define limits.
// Regional prices use CNY and are left unset in the USD catalog.
function glm(
  id: string,
  contextWindow: number,
  maxOutputTokens: number | undefined,
  capabilities: Partial<ModelInfo> = {}
): ModelInfo {
  return {
    id,
    name: id.toUpperCase(),
    provider: "zhipu",
    contextWindow,
    maxOutputTokens,
    supportsTools: true,
    supportsVision: false,
    supportsReasoning: true,
    supportsStreaming: true,
    supportsPromptCache: true,
    deprecated: false,
    ...capabilities,
  };
}

const alwaysThinking: Partial<ModelInfo> = {
  requiresThinking: true,
  supportsSampling: false,
  reasoningEfforts: ["low", "high", "max"],
  defaultReasoningEffort: "max",
};
const textOnly = { supportsReasoning: false };
const vision = { supportsVision: true };

export const ZHIPU_MODELS: ModelInfo[] = [
  glm("glm-5.3", 1_000_000, 128_000, alwaysThinking),
  glm("glm-5.3-flash", 1_000_000, 128_000, { ...alwaysThinking, ...vision }),
  glm("glm-5.3-flashx", 1_000_000, 128_000, { ...alwaysThinking, ...vision }),
  glm("glm-5.3-flashx-legal", 1_000_000, 128_000, { ...alwaysThinking, ...vision }),
  glm("glm-5.2", 1_000_000, 128_000, {
    reasoningEfforts: ["none", "minimal", "low", "medium", "high", "xhigh", "max"],
    defaultReasoningEffort: "max",
  }),
  glm("glm-5.1", 200_000, 128_000),
  glm("glm-5v-turbo", 200_000, 128_000, vision),
  glm("glm-5-turbo", 200_000, 128_000),
  glm("glm-5", 200_000, 128_000),
  glm("glm-4.7", 200_000, 128_000),
  glm("glm-4.7-flash", 200_000, 128_000),
  glm("glm-4.7-flashx", 200_000, 128_000),
  glm("glm-4.6", 200_000, 128_000),
  glm("glm-4.6v", 131_072, 32_768, vision),
  glm("glm-4.6v-flash", 131_072, 32_768, vision),
  glm("glm-4.6v-flashx", 131_072, 32_768, vision),
  glm("glm-4.5", 131_072, 98_304),
  glm("glm-4.5-air", 131_072, 98_304),
  glm("glm-4.5-airx", 131_072, 98_304),
  glm("glm-4.5-flash", 131_072, 98_304),
  glm("glm-4.5v", 65_536, undefined, { ...vision, supportsTools: false }),
  glm("glm-4.1v-thinking-flashx", 65_536, 16_384, {
    ...vision,
    supportsTools: false,
    supportsPromptCache: false,
  }),
  glm("glm-4.1v-thinking-flash", 65_536, 16_384, {
    ...vision,
    supportsTools: false,
    supportsPromptCache: false,
  }),
  glm("glm-4-long", 1_000_000, 4_096, { ...textOnly, supportsTools: undefined }),
  glm("glm-4-plus", 131_072, 4_096, textOnly),
  glm("glm-4-air-250414", 131_072, 16_384, textOnly),
  glm("glm-4-airx", 8_192, 4_096, { ...textOnly, supportsPromptCache: false }),
  glm("glm-4-flashx-250414", 131_072, 16_384, textOnly),
  glm("glm-4-flash-250414", 131_072, 16_384, { ...textOnly, supportsPromptCache: false }),
];
