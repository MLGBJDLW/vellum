// ============================================
// T039: Enterprise Configuration Schema (Full)
// ============================================

import { promises as fs } from "node:fs";
import { platform } from "node:os";
import { join } from "node:path";
import { z } from "zod";

// ============================================
// Configuration Paths
// ============================================

/**
 * Get the enterprise config path based on OS.
 */
export function getEnterpriseConfigPath(): string {
  if (platform() === "win32") {
    return join(process.env.ProgramData ?? "C:\\ProgramData", "vellum", "enterprise.json");
  }
  return "/etc/vellum/enterprise.json";
}

// ============================================
// Schemas
// ============================================

/**
 * Pattern for matching tool names (glob-style).
 * Examples: "dangerous_*", "*_admin", "filesystem:write"
 */
export const ToolPatternSchema = z.string().min(1);

/**
 * Server identifier - can be name or URL pattern.
 */
export const ServerIdentifierSchema = z.string().min(1);

/**
 * Audit log destination configuration.
 */
export const AuditDestinationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("file"),
    path: z.string().min(1),
    maxSizeMB: z.number().positive().default(100),
    maxFiles: z.number().int().positive().default(10),
  }),
  z.object({
    type: z.literal("http"),
    url: z.string().url(),
    headers: z.record(z.string()).optional(),
    batchSize: z.number().int().positive().default(100),
    flushIntervalMs: z.number().int().positive().default(5000),
  }),
]);

/**
 * Full enterprise configuration schema (system-level /etc/vellum/enterprise.json).
 * This extends the basic EnterpriseConfig in schemas.ts with additional enterprise features.
 */
export const FullEnterpriseConfigSchema = z.object({
  /**
   * Schema version for forward compatibility.
   */
  version: z.literal(1).default(1),

  /**
   * Block users from adding personal remote MCP servers.
   * When true, only servers in `allowedMCPServers` can be used.
   */
  blockPersonalRemoteMCPServers: z.boolean().default(false),

  /**
   * Allowlist of MCP server identifiers.
   * Can be exact names or glob patterns.
   * Only checked when `blockPersonalRemoteMCPServers` is true.
   */
  allowedMCPServers: z.array(ServerIdentifierSchema).default([]),

  /**
   * Blocklist of tool name patterns.
   * Tools matching these patterns will be rejected.
   * Supports glob patterns: "dangerous_*", "*_delete", "fs:*"
   */
  blockedToolPatterns: z.array(ToolPatternSchema).default([]),

  /**
   * Audit logging configuration.
   */
  audit: z
    .object({
      enabled: z.boolean().default(false),
      destinations: z.array(AuditDestinationSchema).default([]),
      includeToolArgs: z.boolean().default(false),
      includeToolResults: z.boolean().default(false),
    })
    .optional(),

  /**
   * Custom policy message shown when actions are blocked.
   */
  policyMessage: z.string().optional(),
});

// ============================================
// Types
// ============================================

export type FullEnterpriseConfig = z.infer<typeof FullEnterpriseConfigSchema>;
export type AuditDestination = z.infer<typeof AuditDestinationSchema>;

// ============================================
// Loader
// ============================================

/**
 * Cached enterprise configuration.
 */
let cachedConfig: FullEnterpriseConfig | null = null;

/**
 * Default enterprise configuration (permissive).
 */
export const DEFAULT_FULL_ENTERPRISE_CONFIG: FullEnterpriseConfig = {
  version: 1,
  blockPersonalRemoteMCPServers: false,
  allowedMCPServers: [],
  blockedToolPatterns: [],
};

/**
 * Load enterprise configuration from the standard path.
 * Returns default config if file doesn't exist.
 * Throws if file exists but is invalid.
 */
export async function loadFullEnterpriseConfig(
  options: { forceReload?: boolean; configPath?: string } = {}
): Promise<FullEnterpriseConfig> {
  const { forceReload = false, configPath } = options;

  if (!forceReload && cachedConfig) {
    return cachedConfig;
  }

  const path = configPath ?? getEnterpriseConfigPath();

  try {
    const content = await fs.readFile(path, "utf-8");
    const parsed = JSON.parse(content);
    const validated = FullEnterpriseConfigSchema.parse(parsed);
    cachedConfig = validated;
    return validated;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      // File doesn't exist - use defaults (non-enterprise mode)
      cachedConfig = DEFAULT_FULL_ENTERPRISE_CONFIG;
      return DEFAULT_FULL_ENTERPRISE_CONFIG;
    }

    // File exists but invalid - this is an error
    throw new Error(`Invalid enterprise configuration at ${path}: ${(error as Error).message}`);
  }
}

/**
 * Get cached enterprise config or default.
 * Use this for synchronous access after initial load.
 */
export function getFullEnterpriseConfig(): FullEnterpriseConfig {
  return cachedConfig ?? DEFAULT_FULL_ENTERPRISE_CONFIG;
}

/**
 * Check if enterprise mode is active.
 */
export function isEnterpriseMode(): boolean {
  const config = getFullEnterpriseConfig();
  return (
    config.blockPersonalRemoteMCPServers ||
    config.blockedToolPatterns.length > 0 ||
    config.audit?.enabled === true
  );
}

/**
 * Clear cached configuration (for testing).
 */
export function clearFullEnterpriseConfigCache(): void {
  cachedConfig = null;
}
