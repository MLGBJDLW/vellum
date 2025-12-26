import { z } from "zod";

// ============================================
// Provider Configuration Schemas
// ============================================

/**
 * T028 - Provider name enum supporting all major LLM providers
 */
export const ProviderNameSchema = z.enum([
  "anthropic",
  "openai",
  "azure-openai",
  "google",
  "gemini",
  "vertex-ai",
  "cohere",
  "mistral",
  "groq",
  "fireworks",
  "together",
  "perplexity",
  "bedrock",
  "ollama",
  "openrouter",
]);

export type ProviderName = z.infer<typeof ProviderNameSchema>;

/**
 * T029 - LLM provider configuration schema
 */
export const LLMProviderSchema = z.object({
  provider: ProviderNameSchema,
  model: z.string(),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  maxTokens: z.number().optional().default(4096),
  temperature: z.number().min(0).max(2).optional().default(0.7),
  timeout: z.number().optional().default(60000),
});

export type LLMProvider = z.infer<typeof LLMProviderSchema>;

// ============================================
// Permission Schemas
// ============================================

/**
 * T030 - Permission mode enum for access control
 */
export const PermissionModeSchema = z.enum(["ask", "allow", "deny"]);

export type PermissionMode = z.infer<typeof PermissionModeSchema>;

/**
 * T030 - Permission configuration for various operations
 */
export const PermissionSchema = z.object({
  fileRead: PermissionModeSchema.optional().default("ask"),
  fileWrite: PermissionModeSchema.optional().default("ask"),
  shellExecute: PermissionModeSchema.optional().default("ask"),
  networkAccess: PermissionModeSchema.optional().default("ask"),
  mcpConnect: PermissionModeSchema.optional().default("ask"),
});

export type Permission = z.infer<typeof PermissionSchema>;

// ============================================
// Agent Configuration Schema
// ============================================

/**
 * T031 - Agent behavior configuration
 */
export const AgentConfigSchema = z.object({
  name: z.string().optional(),
  systemPrompt: z.string().optional(),
  maxToolCalls: z.number().optional().default(50),
  maxTurns: z.number().optional().default(100),
  maxRetries: z.number().optional().default(3),
  enableReasoning: z.boolean().optional().default(false),
});

export type AgentConfigSettings = z.infer<typeof AgentConfigSchema>;

// ============================================
// Log Level Schema
// ============================================

export const LogLevelSchema = z.enum(["debug", "info", "warn", "error"]);

export type LogLevel = z.infer<typeof LogLevelSchema>;

// ============================================
// Complete Configuration Schema
// ============================================

/**
 * T032 - Complete configuration schema combining all sub-schemas
 */
export const ConfigSchema = z.object({
  llm: LLMProviderSchema,
  agent: AgentConfigSchema.optional().default({}),
  permissions: PermissionSchema.optional().default({}),
  workingDir: z.string().optional(),
  debug: z.boolean().optional().default(false),
  logLevel: LogLevelSchema.optional().default("info"),
});

export type Config = z.infer<typeof ConfigSchema>;

/**
 * Partial config type for user input (before defaults are applied)
 */
export type PartialConfig = z.input<typeof ConfigSchema>;
