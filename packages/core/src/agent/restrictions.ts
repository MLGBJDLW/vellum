// ============================================
// Agent Restrictions Schemas
// ============================================

import { z } from "zod";

/**
 * Access level for file restrictions.
 *
 * - `read`: Agent can only read the file
 * - `write`: Agent can read and write to the file
 * - `none`: Agent has no access to the file
 */
export const FileAccessSchema = z.enum(["read", "write", "none"]);

/**
 * Type for file access levels.
 */
export type FileAccess = z.infer<typeof FileAccessSchema>;

/**
 * Schema for file access restrictions.
 *
 * Defines which files an agent can access and what operations are allowed.
 *
 * @example
 * ```typescript
 * const restriction: FileRestriction = {
 *   pattern: "src/**\/*.ts",
 *   access: "write",
 * };
 *
 * // Read-only access to config files
 * const configRestriction: FileRestriction = {
 *   pattern: "*.config.js",
 *   access: "read",
 * };
 *
 * // No access to secrets
 * const secretsRestriction: FileRestriction = {
 *   pattern: ".env*",
 *   access: "none",
 * };
 * ```
 */
export const FileRestrictionSchema = z.object({
  /** Glob pattern for matching files (e.g., "src/**\/*.ts", "*.config.js") */
  pattern: z.string(),
  /** Access level for files matching the pattern */
  access: FileAccessSchema,
});

/**
 * Type for file restrictions inferred from the schema.
 */
export type FileRestriction = z.infer<typeof FileRestrictionSchema>;

/**
 * Schema for tool group configuration.
 *
 * Defines which tool groups are enabled for an agent and optionally
 * which specific tools within each group are available.
 *
 * @example
 * ```typescript
 * // Enable all filesystem tools
 * const fsGroup: ToolGroupEntry = {
 *   group: "filesystem",
 *   enabled: true,
 * };
 *
 * // Enable network group but only specific tools
 * const networkGroup: ToolGroupEntry = {
 *   group: "network",
 *   enabled: true,
 *   tools: ["fetch", "request"],
 * };
 *
 * // Disable all shell tools
 * const shellGroup: ToolGroupEntry = {
 *   group: "shell",
 *   enabled: false,
 * };
 * ```
 */
export const ToolGroupEntrySchema = z.object({
  /** Tool group name (e.g., "filesystem", "network", "shell") */
  group: z.string(),
  /** Whether the tool group is enabled */
  enabled: z.boolean(),
  /** Optional list of specific tools to enable/disable within the group */
  tools: z.array(z.string()).optional(),
});

/**
 * Type for tool group entries inferred from the schema.
 */
export type ToolGroupEntry = z.infer<typeof ToolGroupEntrySchema>;
