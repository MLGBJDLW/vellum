import { z } from "zod";

import {
  CredentialMetadataSchema,
  CredentialSourceSchema,
  CredentialTypeSchema,
} from "../credentials/types.js";

// ============================================
// Credential Configuration Schemas (T014)
// ============================================

/**
 * Base credential config with common fields
 */
const BaseCredentialConfigSchema = z.object({
  /** Source where credential is stored */
  source: CredentialSourceSchema.optional(),
  /** Additional metadata */
  metadata: CredentialMetadataSchema.optional(),
});

/**
 * API Key credential configuration
 */
export const ApiKeyCredentialSchema = BaseCredentialConfigSchema.extend({
  type: z.literal("api_key"),
  /** API key value or environment variable name */
  value: z.string().optional(),
  /** Environment variable name to read API key from */
  envVar: z.string().optional(),
});

/**
 * OAuth Token credential configuration
 */
export const OAuthTokenCredentialSchema = BaseCredentialConfigSchema.extend({
  type: z.literal("oauth_token"),
  /** Access token value */
  accessToken: z.string().optional(),
  /** Refresh token for token renewal */
  refreshToken: z.string().optional(),
  /** Token endpoint URL for refresh */
  tokenEndpoint: z.string().optional(),
  /** Client ID for OAuth flow */
  clientId: z.string().optional(),
  /** Client secret for OAuth flow */
  clientSecret: z.string().optional(),
});

/**
 * Bearer Token credential configuration
 */
export const BearerTokenCredentialSchema = BaseCredentialConfigSchema.extend({
  type: z.literal("bearer_token"),
  /** Bearer token value */
  token: z.string().optional(),
  /** Environment variable name to read token from */
  envVar: z.string().optional(),
});

/**
 * Service Account credential configuration (GCP/Azure)
 */
export const ServiceAccountCredentialSchema = BaseCredentialConfigSchema.extend({
  type: z.literal("service_account"),
  /** Path to service account JSON file */
  keyFile: z.string().optional(),
  /** Inline JSON credentials */
  credentials: z.record(z.string(), z.unknown()).optional(),
  /** Project ID for GCP */
  projectId: z.string().optional(),
});

/**
 * Certificate credential configuration
 */
export const CertificateCredentialSchema = BaseCredentialConfigSchema.extend({
  type: z.literal("certificate"),
  /** Path to certificate file */
  certFile: z.string().optional(),
  /** Path to private key file */
  keyFile: z.string().optional(),
  /** Certificate passphrase */
  passphrase: z.string().optional(),
});

/**
 * T014 - Discriminated union of all credential types for config
 *
 * Uses 'type' field as discriminator to determine credential schema.
 * Supports: api_key, oauth_token, bearer_token, service_account, certificate
 */
export const ConfigCredentialSchema = z.discriminatedUnion("type", [
  ApiKeyCredentialSchema,
  OAuthTokenCredentialSchema,
  BearerTokenCredentialSchema,
  ServiceAccountCredentialSchema,
  CertificateCredentialSchema,
]);

export type ConfigCredential = z.infer<typeof ConfigCredentialSchema>;
export type ApiKeyCredential = z.infer<typeof ApiKeyCredentialSchema>;
export type OAuthTokenCredential = z.infer<typeof OAuthTokenCredentialSchema>;
export type BearerTokenCredential = z.infer<typeof BearerTokenCredentialSchema>;
export type ServiceAccountCredential = z.infer<typeof ServiceAccountCredentialSchema>;
export type CertificateCredential = z.infer<typeof CertificateCredentialSchema>;

// Re-export credential types from credentials module
export { CredentialTypeSchema, CredentialSourceSchema, CredentialMetadataSchema };
export type {
  CredentialMetadata,
  CredentialSource,
  CredentialType,
} from "../credentials/types.js";

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
  // Chinese providers
  "deepseek",
  "qwen",
  "moonshot",
]);

export type ProviderName = z.infer<typeof ProviderNameSchema>;

/**
 * T029 - LLM provider configuration schema
 */
export const LLMProviderSchema = z.object({
  provider: ProviderNameSchema,
  model: z.string(),
  /** @deprecated Use credential field instead */
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  maxTokens: z.number().optional().default(4096),
  temperature: z.number().min(0).max(2).optional().default(0.7),
  timeout: z.number().optional().default(60000),
  /**
   * T014 - Credential configuration for this provider
   *
   * Preferred over apiKey for more flexible credential management.
   * Supports multiple credential types: api_key, oauth_token, bearer_token,
   * service_account, certificate.
   */
  credential: ConfigCredentialSchema.optional(),
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
// Timeout Configuration Schema
// ============================================

/**
 * Timeout configuration schema for various operations.
 * All values are in milliseconds.
 */
export const TimeoutsConfigSchema = z.object({
  /** Default timeout for most tools */
  toolDefault: z.number().optional(),
  /** Shell/bash command execution */
  shell: z.number().optional(),
  /** Bash tool execution */
  bashExecution: z.number().optional(),
  /** Web fetch operations */
  webFetch: z.number().optional(),
  /** Web search operations */
  webSearch: z.number().optional(),
  /** MCP server operations */
  mcpDefault: z.number().optional(),
  /** MCP server shutdown */
  mcpShutdown: z.number().optional(),
  /** Agent delegation */
  delegation: z.number().optional(),
  /** LLM stream timeout */
  llmStream: z.number().optional(),
  /** Git local operations */
  gitLocal: z.number().optional(),
  /** Git network operations */
  gitNetwork: z.number().optional(),
  /** Permission ask dialog */
  permissionAsk: z.number().optional(),
  /** Spec validation */
  specValidation: z.number().optional(),
  /** OAuth flow */
  oauth: z.number().optional(),
  /** Hook execution */
  hookDefault: z.number().optional(),
  /** Hook maximum */
  hookMax: z.number().optional(),
  /** Hook minimum */
  hookMin: z.number().optional(),
  /** MCP retry base delay */
  mcpRetryBaseDelay: z.number().optional(),
  /** Quota retry delay */
  quotaRetryDelay: z.number().optional(),
});

export type TimeoutsConfig = z.infer<typeof TimeoutsConfigSchema>;

// ============================================
// Limits Configuration Schema
// ============================================

/**
 * Numeric limits and thresholds configuration schema.
 */
export const LimitsConfigSchema = z.object({
  /** Maximum retry attempts */
  maxRetries: z.number().optional(),
  /** Maximum concurrent agents */
  maxConcurrentAgents: z.number().optional(),
  /** Maximum agent iteration steps */
  agentMaxSteps: z.number().optional(),
  /** Maximum tokens per agent session */
  agentMaxTokens: z.number().optional(),
  /** Maximum agent execution time (ms) */
  agentMaxTimeMs: z.number().optional(),
  /** Session token quota */
  sessionMaxTokens: z.number().optional(),
  /** Session duration quota (ms) */
  sessionMaxDurationMs: z.number().optional(),
  /** Orchestrator task timeout (ms) */
  orchestratorTaskTimeout: z.number().optional(),
});

export type LimitsConfig = z.infer<typeof LimitsConfigSchema>;

// ============================================
// Circuit Breaker Configuration Schema
// ============================================

/**
 * Circuit breaker configuration schema.
 */
export const CircuitBreakerConfigSchema = z.object({
  /** Failures before opening circuit */
  failureThreshold: z.number().optional(),
  /** Time before attempting reset (ms) */
  resetTimeout: z.number().optional(),
  /** Window for counting failures (ms) */
  windowSize: z.number().optional(),
});

export type CircuitBreakerConfig = z.infer<typeof CircuitBreakerConfigSchema>;

// ============================================
// Thinking Configuration Schema
// ============================================

/**
 * Extended thinking/reasoning configuration schema.
 * Controls extended thinking mode for supported models (e.g., Gemini 2.5+).
 */
export const ThinkingConfigSchema = z.object({
  /** Enable extended thinking mode */
  enabled: z.boolean().default(false),
  /** Token budget for thinking process (1000-128000) */
  budgetTokens: z.number().min(1000).max(128000).default(10000),
  /** Priority for merging thinking config: global, mode, or merge */
  priority: z.enum(["global", "mode", "merge"]).default("merge"),
});

export type ThinkingConfig = z.infer<typeof ThinkingConfigSchema>;

// ============================================
// Complete Configuration Schema
// ============================================

/**
 * T032 - Complete configuration schema combining all sub-schemas
 *
 * Note: For Zod v4 compatibility, we don't use .default({}) on nested schemas
 * because that would bypass the inner defaults. Instead, we use .transform()
 * to apply defaults after parsing, ensuring inner schema defaults are applied.
 */
export const ConfigSchema = z
  .object({
    llm: LLMProviderSchema,
    agent: AgentConfigSchema.optional(),
    permissions: PermissionSchema.optional(),
    timeouts: TimeoutsConfigSchema.optional(),
    limits: LimitsConfigSchema.optional(),
    circuitBreaker: CircuitBreakerConfigSchema.optional(),
    workingDir: z.string().optional(),
    debug: z.boolean().optional().default(false),
    logLevel: LogLevelSchema.optional().default("info"),
    /** UI theme name (dark, parchment, dracula, etc.) */
    theme: z.string().optional(),
    /** Extended thinking configuration */
    thinking: ThinkingConfigSchema.optional(),
  })
  .transform((data) => ({
    ...data,
    // Apply inner schema defaults when agent/permissions are omitted
    agent: data.agent ?? AgentConfigSchema.parse({}),
    permissions: data.permissions ?? PermissionSchema.parse({}),
    timeouts: data.timeouts ?? {},
    limits: data.limits ?? {},
    circuitBreaker: data.circuitBreaker ?? {},
  }));

export type Config = z.infer<typeof ConfigSchema>;

/**
 * Partial config type for user input (before defaults are applied)
 */
export type PartialConfig = z.input<typeof ConfigSchema>;
