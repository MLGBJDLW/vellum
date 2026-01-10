/**
 * Local model definitions (Ollama, LM Studio)
 * @module models/providers/local
 */

import type { ModelInfo } from "../types.js";

/**
 * Ollama local model catalog
 * Note: Ollama models are dynamically discovered, these are common defaults
 * Models: https://ollama.ai/library
 */
export const OLLAMA_MODELS: ModelInfo[] = [
  // Models are typically discovered dynamically from local Ollama instance
  // This serves as a fallback/default list
];

/**
 * LM Studio local model catalog
 * Note: LM Studio models are dynamically discovered
 */
export const LMSTUDIO_MODELS: ModelInfo[] = [
  // Models are typically discovered dynamically from local LM Studio instance
  // This serves as a fallback/default list
];

/**
 * Combined local models (for convenience)
 */
export const LOCAL_MODELS: ModelInfo[] = [...OLLAMA_MODELS, ...LMSTUDIO_MODELS];
