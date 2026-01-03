import { z } from "zod";

/**
 * Plugin capabilities that can be granted to trusted plugins.
 * Each capability represents a specific permission or feature access.
 */
export const PluginCapabilitySchema = z.enum([
  /** Can run hook scripts (lifecycle events) */
  "execute-hooks",
  /** Can spawn sub-agents for delegation */
  "spawn-subagent",
  /** Can read/write to the file system */
  "access-filesystem",
  /** Can make outbound network requests */
  "network-access",
  /** Can run MCP (Model Context Protocol) servers */
  "mcp-servers",
]);

/**
 * Available plugin capabilities.
 */
export type PluginCapability = z.infer<typeof PluginCapabilitySchema>;

/**
 * All available plugin capabilities as a constant array.
 */
export const PLUGIN_CAPABILITIES = PluginCapabilitySchema.options;

/**
 * Trust levels for plugins.
 * - 'full': Plugin has all requested capabilities
 * - 'limited': Plugin has a subset of capabilities
 * - 'none': Plugin is not trusted (no capabilities)
 */
export const TrustLevelSchema = z.enum(["full", "limited", "none"]);

/**
 * Trust level for a plugin.
 */
export type TrustLevel = z.infer<typeof TrustLevelSchema>;

/**
 * Schema for ISO 8601 date strings.
 */
export const IsoDateStringSchema = z.string().datetime({ offset: true });

/**
 * Schema for SHA-256 content hash (64 hex characters).
 */
export const ContentHashSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, "Must be a valid SHA-256 hash (64 hex characters)");

/**
 * Represents a trusted plugin with its capabilities and verification info.
 */
export const TrustedPluginSchema = z.object({
  /** Unique plugin identifier/name */
  pluginName: z.string().min(1),
  /** Semantic version of the trusted plugin */
  version: z.string().min(1),
  /** ISO 8601 timestamp when trust was established */
  trustedAt: IsoDateStringSchema,
  /** List of capabilities granted to this plugin */
  capabilities: z.array(PluginCapabilitySchema),
  /** SHA-256 hash of plugin content for integrity verification */
  contentHash: ContentHashSchema,
  /** Level of trust granted to the plugin */
  trustLevel: TrustLevelSchema,
});

/**
 * A trusted plugin entry with verification and capability information.
 */
export type TrustedPlugin = z.infer<typeof TrustedPluginSchema>;

/**
 * Schema for the trust store - maps plugin names to their trust entries.
 */
export const TrustStoreSchema = z.record(z.string(), TrustedPluginSchema);

/**
 * Trust store mapping plugin names to their trust configuration.
 */
export type TrustStore = z.infer<typeof TrustStoreSchema>;
