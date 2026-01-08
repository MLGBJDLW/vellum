/**
 * Auto Update Module (Phase 39)
 *
 * Provides automatic update checking and updating functionality
 * for the Vellum CLI.
 *
 * @module core/update
 */

// Types
export type {
  NpmPackageMetadata,
  NpmVersionMetadata,
  SemVer,
  UpdateChannel,
  UpdateConfig,
  UpdateInfo,
  UpdateResult,
  VersionCheckCache,
  VersionCheckResult,
} from "./types.js";

export {
  DEFAULT_UPDATE_CONFIG,
  SemVerSchema,
  UPDATE_CHANNELS,
  UpdateChannelSchema,
  UpdateConfigSchema,
  UpdateInfoSchema,
  UpdateResultSchema,
  VersionCheckCacheSchema,
  VersionCheckResultSchema,
} from "./types.js";
// Updater
export type { PackageManager, UpdateOptions } from "./updater.js";
export { detectPackageManager, performUpdate, Updater } from "./updater.js";
// Version Checker
export {
  checkForUpdates,
  compareSemVer,
  isNewerVersion,
  isPrerelease,
  parseSemVer,
  VersionChecker,
} from "./version-checker.js";
