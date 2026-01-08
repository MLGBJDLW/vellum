/**
 * Auto Update Types (Phase 39)
 *
 * Type definitions for the auto-update system including version checking,
 * update information, and channel configuration.
 *
 * @module core/update/types
 */

import { z } from "zod";

// =============================================================================
// Update Channels
// =============================================================================

/**
 * Update channel types
 * - stable: Production releases only
 * - beta: Pre-release versions included
 */
export const UpdateChannelSchema = z.enum(["stable", "beta"]);
export type UpdateChannel = z.infer<typeof UpdateChannelSchema>;

/**
 * Available update channels
 */
export const UPDATE_CHANNELS = ["stable", "beta"] as const;

// =============================================================================
// Version Information
// =============================================================================

/**
 * Parsed semantic version
 */
export interface SemVer {
  /** Major version number */
  readonly major: number;
  /** Minor version number */
  readonly minor: number;
  /** Patch version number */
  readonly patch: number;
  /** Pre-release identifier (e.g., "beta.1") */
  readonly prerelease?: string;
}

/**
 * Schema for semantic version
 */
export const SemVerSchema = z.object({
  major: z.number().int().nonnegative(),
  minor: z.number().int().nonnegative(),
  patch: z.number().int().nonnegative(),
  prerelease: z.string().optional(),
});

// =============================================================================
// Update Information
// =============================================================================

/**
 * Information about an available update
 */
export interface UpdateInfo {
  /** Current installed version */
  readonly currentVersion: string;
  /** Latest available version */
  readonly latestVersion: string;
  /** Whether an update is available */
  readonly hasUpdate: boolean;
  /** Update channel */
  readonly channel: UpdateChannel;
  /** Release date of latest version */
  readonly releaseDate?: string;
  /** Release notes/changelog URL */
  readonly releaseNotesUrl?: string;
  /** Package download URL */
  readonly tarballUrl?: string;
}

/**
 * Schema for update info
 */
export const UpdateInfoSchema = z.object({
  currentVersion: z.string(),
  latestVersion: z.string(),
  hasUpdate: z.boolean(),
  channel: UpdateChannelSchema,
  releaseDate: z.string().optional(),
  releaseNotesUrl: z.string().url().optional(),
  tarballUrl: z.string().url().optional(),
});

// =============================================================================
// Version Check Results
// =============================================================================

/**
 * Result of a version check operation
 */
export interface VersionCheckResult {
  /** Whether the check succeeded */
  readonly success: boolean;
  /** Update information if check succeeded */
  readonly updateInfo?: UpdateInfo;
  /** Error message if check failed */
  readonly error?: string;
  /** Timestamp of the check */
  readonly checkedAt: Date;
  /** Whether result was from cache */
  readonly fromCache: boolean;
}

/**
 * Schema for version check result
 */
export const VersionCheckResultSchema = z.object({
  success: z.boolean(),
  updateInfo: UpdateInfoSchema.optional(),
  error: z.string().optional(),
  checkedAt: z.coerce.date(),
  fromCache: z.boolean(),
});

// =============================================================================
// Update Result
// =============================================================================

/**
 * Result of an update operation
 */
export interface UpdateResult {
  /** Whether the update succeeded */
  readonly success: boolean;
  /** Previous version before update */
  readonly previousVersion: string;
  /** New version after update */
  readonly newVersion?: string;
  /** Error message if update failed */
  readonly error?: string;
  /** Whether a restart is required */
  readonly requiresRestart: boolean;
}

/**
 * Schema for update result
 */
export const UpdateResultSchema = z.object({
  success: z.boolean(),
  previousVersion: z.string(),
  newVersion: z.string().optional(),
  error: z.string().optional(),
  requiresRestart: z.boolean(),
});

// =============================================================================
// Cache Configuration
// =============================================================================

/**
 * Cache entry for version checks
 */
export interface VersionCheckCache {
  /** Cached update info */
  readonly updateInfo: UpdateInfo;
  /** When the cache was created */
  readonly cachedAt: number;
  /** Cache expiry time in milliseconds */
  readonly expiresAt: number;
}

/**
 * Schema for version check cache
 */
export const VersionCheckCacheSchema = z.object({
  updateInfo: UpdateInfoSchema,
  cachedAt: z.number(),
  expiresAt: z.number(),
});

// =============================================================================
// Configuration
// =============================================================================

/**
 * Update checker configuration
 */
export interface UpdateConfig {
  /** Update channel to use */
  readonly channel: UpdateChannel;
  /** Cache duration in milliseconds (default: 24 hours) */
  readonly cacheDurationMs: number;
  /** Whether to check for updates automatically */
  readonly autoCheck: boolean;
  /** NPM registry URL */
  readonly registryUrl: string;
  /** Package name to check */
  readonly packageName: string;
  /** Request timeout in milliseconds */
  readonly timeoutMs: number;
}

/**
 * Schema for update config
 */
export const UpdateConfigSchema = z.object({
  channel: UpdateChannelSchema.default("stable"),
  cacheDurationMs: z.number().default(24 * 60 * 60 * 1000), // 24 hours
  autoCheck: z.boolean().default(true),
  registryUrl: z.string().url().default("https://registry.npmjs.org"),
  packageName: z.string().default("@vellum/cli"),
  timeoutMs: z.number().default(10000), // 10 seconds
});

/**
 * Default update configuration
 */
export const DEFAULT_UPDATE_CONFIG: UpdateConfig = {
  channel: "stable",
  cacheDurationMs: 24 * 60 * 60 * 1000, // 24 hours
  autoCheck: true,
  registryUrl: "https://registry.npmjs.org",
  packageName: "@vellum/cli",
  timeoutMs: 10000,
};

// =============================================================================
// NPM Registry Response Types
// =============================================================================

/**
 * NPM registry package metadata response
 */
export interface NpmPackageMetadata {
  /** Package name */
  readonly name: string;
  /** All versions */
  readonly versions: Record<string, NpmVersionMetadata>;
  /** Dist tags (latest, next, etc.) */
  readonly "dist-tags": Record<string, string>;
  /** Last modified time */
  readonly time?: Record<string, string>;
}

/**
 * NPM version metadata
 */
export interface NpmVersionMetadata {
  /** Version string */
  readonly version: string;
  /** Distribution info */
  readonly dist: {
    readonly tarball: string;
    readonly shasum: string;
  };
}
