/**
 * Model metadata types and Zod schemas
 * @module models/types
 */

import { z } from "zod";
import type { ProviderType } from "../types.js";

// =============================================================================
// Zod Schemas
// =============================================================================

/**
 * Reasoning effort levels supported by models
 */
export const reasoningEffortSchema = z.enum(["none", "minimal", "low", "medium", "high", "xhigh"]);

export type ReasoningEffort = z.infer<typeof reasoningEffortSchema>;

/**
 * Service tier options for API pricing
 */
export const serviceTierSchema = z.enum(["default", "flex", "priority"]);

export type ServiceTier = z.infer<typeof serviceTierSchema>;

/**
 * Pricing tier for extended context or priority access
 */
export const pricingTierSchema = z.object({
  /** Service tier name */
  name: z.string().optional(),
  /** Context window size for this tier */
  contextWindow: z.number(),
  /** Input price per million tokens for this tier */
  inputPrice: z.number(),
  /** Output price per million tokens for this tier */
  outputPrice: z.number(),
  /** Cache reads price per million tokens for this tier */
  cacheReadsPrice: z.number().optional(),
  /** Cache writes price per million tokens for this tier */
  cacheWritesPrice: z.number().optional(),
});

export type PricingTier = z.infer<typeof pricingTierSchema>;

/**
 * Canonical ModelInfo schema
 * Defines all metadata for a model including capabilities and pricing
 */
export const modelInfoSchema = z.object({
  /** Unique model identifier (e.g., "claude-sonnet-4-5") */
  id: z.string(),
  /** Human-readable model name */
  name: z.string(),
  /** Provider that offers this model */
  provider: z.custom<ProviderType>(),
  /** Maximum context window in tokens */
  contextWindow: z.number().int().positive(),
  /** Maximum output tokens the model can generate */
  maxOutputTokens: z.number().int().positive(),
  /** Whether the model supports function/tool calling */
  supportsTools: z.boolean().default(true),
  /** Whether the model can process images */
  supportsVision: z.boolean().default(false),
  /** Whether the model supports reasoning/thinking mode */
  supportsReasoning: z.boolean().default(false),
  /** Whether the model supports streaming responses */
  supportsStreaming: z.boolean().default(true),
  /** Whether the model supports prompt caching */
  supportsPromptCache: z.boolean().default(false),
  /** Price per million input tokens (USD) */
  inputPrice: z.number().nonnegative(),
  /** Price per million output tokens (USD) */
  outputPrice: z.number().nonnegative(),
  /** Price per million cache write tokens (USD) */
  cacheWritesPrice: z.number().nonnegative().optional(),
  /** Price per million cache read tokens (USD) */
  cacheReadsPrice: z.number().nonnegative().optional(),
  /** Optional pricing tiers for extended context */
  tiers: z.array(pricingTierSchema).optional(),
  /** Supported reasoning effort levels */
  reasoningEfforts: z.array(reasoningEffortSchema).optional(),
  /** Default reasoning effort level */
  defaultReasoningEffort: reasoningEffortSchema.optional(),
  /** Model description */
  description: z.string().optional(),
  /** Whether this model is deprecated */
  deprecated: z.boolean().default(false),
  /** Alias model IDs that map to this model */
  aliases: z.array(z.string()).optional(),
});

export type ModelInfo = z.infer<typeof modelInfoSchema>;

/**
 * Partial model definition for provider-specific definitions
 * Used when defining models in provider files where id and provider are inferred
 */
export const partialModelInfoSchema = modelInfoSchema.partial({
  id: true,
  provider: true,
});

export type PartialModelInfo = z.infer<typeof partialModelInfoSchema>;

// =============================================================================
// Helper Types
// =============================================================================

/**
 * Model definition map type for provider files
 */
export type ModelDefinitions<T extends string = string> = Record<
  T,
  Omit<ModelInfo, "id" | "provider">
>;

/**
 * Provider model catalog type
 */
export interface ProviderCatalog {
  provider: ProviderType;
  defaultModelId: string;
  models: ModelInfo[];
}

/**
 * Model lookup key options
 */
export interface ModelLookupOptions {
  /** Include deprecated models in search */
  includeDeprecated?: boolean;
  /** Search aliases as well as primary IDs */
  searchAliases?: boolean;
}

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * Validate a model info object
 */
export function validateModelInfo(model: unknown): ModelInfo {
  return modelInfoSchema.parse(model);
}

/**
 * Safely validate a model info object
 */
export function safeValidateModelInfo(
  model: unknown
): { success: true; data: ModelInfo } | { success: false; error: z.ZodError } {
  const result = modelInfoSchema.safeParse(model);
  return result;
}
