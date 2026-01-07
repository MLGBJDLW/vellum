// ============================================
// T005: Zod Validation Schemas for MCP Configuration
// ============================================

import { z } from "zod";
import {
  DEFAULT_MCP_TIMEOUT_SECONDS,
  DEFAULT_OAUTH_PORT,
  DEFAULT_SHUTDOWN_TIMEOUT_MS,
  MIN_MCP_TIMEOUT_SECONDS,
} from "./constants.js";

// ============================================
// Common Schemas
// ============================================

/**
 * Schema for auto-approve tool list.
 */
export const AutoApproveSchema = z.array(z.string()).default([]);

/**
 * Schema for environment variables record.
 */
export const EnvRecordSchema = z.record(z.string(), z.string());

/**
 * Schema for HTTP headers record.
 */
export const HeadersRecordSchema = z.record(z.string(), z.string());

/**
 * Base configuration schema shared by all transport types.
 */
export const BaseConfigSchema = z.object({
  autoApprove: AutoApproveSchema.optional(),
  disabled: z.boolean().optional().default(false),
  timeout: z
    .number()
    .int()
    .min(MIN_MCP_TIMEOUT_SECONDS, `Timeout must be at least ${MIN_MCP_TIMEOUT_SECONDS} second`)
    .optional()
    .default(DEFAULT_MCP_TIMEOUT_SECONDS),
});

// ============================================
// Transport-Specific Schemas
// ============================================

/**
 * Schema for stdio transport configuration (local process).
 */
export const StdioConfigSchema = BaseConfigSchema.extend({
  type: z.literal("stdio").optional().default("stdio"),
  command: z.string().min(1, "Command is required"),
  args: z.array(z.string()).optional().default([]),
  cwd: z.string().optional(),
  env: EnvRecordSchema.optional(),
});

/**
 * Schema for SSE transport configuration (deprecated).
 */
export const SSEConfigSchema = BaseConfigSchema.extend({
  type: z.literal("sse"),
  url: z.string().url("URL must be a valid URL"),
  headers: HeadersRecordSchema.optional(),
});

/**
 * Schema for Streamable HTTP transport configuration (preferred for remote).
 */
export const StreamableHttpConfigSchema = BaseConfigSchema.extend({
  type: z.literal("streamableHttp"),
  url: z.string().url("URL must be a valid URL"),
  headers: HeadersRecordSchema.optional(),
});

/**
 * Schema for remote transport configuration (auto-detects protocol).
 */
export const RemoteConfigSchema = BaseConfigSchema.extend({
  type: z.literal("remote"),
  url: z.string().url("URL must be a valid URL"),
  headers: HeadersRecordSchema.optional(),
});

/**
 * Union schema for any valid server configuration.
 */
export const ServerConfigSchema = z
  .discriminatedUnion("type", [
    // Stdio without explicit type
    StdioConfigSchema.extend({ type: z.literal("stdio") }),
    SSEConfigSchema,
    StreamableHttpConfigSchema,
    RemoteConfigSchema,
  ])
  .or(
    // Allow stdio without type field (default)
    z
      .object({
        command: z.string().min(1, "Command is required"),
        args: z.array(z.string()).optional().default([]),
        cwd: z.string().optional(),
        env: EnvRecordSchema.optional(),
        autoApprove: AutoApproveSchema.optional(),
        disabled: z.boolean().optional().default(false),
        timeout: z
          .number()
          .int()
          .min(MIN_MCP_TIMEOUT_SECONDS)
          .optional()
          .default(DEFAULT_MCP_TIMEOUT_SECONDS),
      })
      .transform((val) => ({ ...val, type: "stdio" as const }))
  );

// ============================================
// CLI Configuration Schema
// ============================================

/**
 * Schema for CLI-specific configuration options.
 */
export const CliConfigSchema = z.object({
  oauthCallbackPort: z
    .number()
    .int()
    .min(1024, "Port must be >= 1024")
    .max(65535, "Port must be <= 65535")
    .optional()
    .default(DEFAULT_OAUTH_PORT),
  shutdownTimeoutMs: z.number().int().min(0).optional().default(DEFAULT_SHUTDOWN_TIMEOUT_MS),
  nonInteractive: z.boolean().optional().default(false),
  autoOpenBrowser: z.boolean().optional().default(true),
});

// ============================================
// Enterprise Configuration Schema
// ============================================

/**
 * Schema for enterprise policy configuration.
 */
export const EnterpriseConfigSchema = z.object({
  blockPersonalRemoteMCPServers: z.boolean().optional().default(false),
  allowedMCPServers: z.array(z.string()).optional().default([]),
  mcpMarketplaceEnabled: z.boolean().optional().default(true),
});

// ============================================
// Complete Settings Schema
// ============================================

/**
 * Schema for the complete MCP settings file (~/.vellum/mcp.json).
 */
export const McpSettingsSchema = z.object({
  mcpServers: z.record(z.string(), ServerConfigSchema).default({}),
  cli: CliConfigSchema.optional(),
  enterprise: EnterpriseConfigSchema.optional(),
});

// ============================================
// Type Exports (inferred from schemas)
// ============================================

export type StdioConfig = z.infer<typeof StdioConfigSchema>;
export type SSEConfig = z.infer<typeof SSEConfigSchema>;
export type StreamableHttpConfig = z.infer<typeof StreamableHttpConfigSchema>;
export type RemoteConfig = z.infer<typeof RemoteConfigSchema>;
export type ServerConfig = z.infer<typeof ServerConfigSchema>;
export type CliConfig = z.infer<typeof CliConfigSchema>;
export type EnterpriseConfig = z.infer<typeof EnterpriseConfigSchema>;
export type McpSettingsConfig = z.infer<typeof McpSettingsSchema>;

// ============================================
// Validation Helpers
// ============================================

/**
 * Result of validating MCP settings.
 */
export interface McpSettingsValidationResult {
  success: boolean;
  data?: McpSettingsConfig;
  errors?: string[];
}

/**
 * Validate MCP settings and return a structured result.
 *
 * @param config - Raw configuration object to validate
 * @returns Validation result with data or error messages
 */
export function validateMcpSettings(config: unknown): McpSettingsValidationResult {
  const result = McpSettingsSchema.safeParse(config);

  if (result.success) {
    return {
      success: true,
      data: result.data,
    };
  }

  // Format Zod errors into readable messages
  const errors = result.error.issues.map((err: z.ZodIssue) => {
    const path = err.path.join(".");
    return path ? `${path}: ${err.message}` : err.message;
  });

  return {
    success: false,
    errors,
  };
}

/**
 * Validate a single server configuration.
 *
 * @param config - Server configuration to validate
 * @param serverName - Name of the server (for error messages)
 * @returns Validation result
 */
export function validateServerConfig(
  config: unknown,
  serverName: string
): McpSettingsValidationResult {
  const result = ServerConfigSchema.safeParse(config);

  if (result.success) {
    return {
      success: true,
      data: { mcpServers: { [serverName]: result.data } },
    };
  }

  const errors = result.error.issues.map((err: z.ZodIssue) => {
    const path = err.path.join(".");
    return path ? `${serverName}.${path}: ${err.message}` : `${serverName}: ${err.message}`;
  });

  return {
    success: false,
    errors,
  };
}

/**
 * Check if a configuration is for stdio transport.
 */
export function isStdioConfigSchema(config: ServerConfig): config is StdioConfig {
  return config.type === "stdio";
}

/**
 * Check if a configuration is for SSE transport.
 */
export function isSSEConfigSchema(config: ServerConfig): config is SSEConfig {
  return config.type === "sse";
}

/**
 * Check if a configuration is for Streamable HTTP transport.
 */
export function isStreamableHttpConfigSchema(config: ServerConfig): config is StreamableHttpConfig {
  return config.type === "streamableHttp";
}

/**
 * Check if a configuration is for remote transport.
 */
export function isRemoteConfigSchema(config: ServerConfig): config is RemoteConfig {
  return config.type === "remote";
}

/**
 * Check if a configuration requires a URL (remote transports).
 */
export function requiresUrl(config: ServerConfig): boolean {
  return config.type === "sse" || config.type === "streamableHttp" || config.type === "remote";
}
