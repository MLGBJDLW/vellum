/**
 * Version Checker (Phase 39)
 *
 * Checks for available updates by querying the NPM registry.
 * Implements caching to avoid excessive network requests.
 *
 * @module core/update/version-checker
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fetchWithPool } from "@vellum/shared";

import type {
  NpmPackageMetadata,
  SemVer,
  UpdateConfig,
  UpdateInfo,
  VersionCheckCache,
  VersionCheckResult,
} from "./types.js";
import { DEFAULT_UPDATE_CONFIG, VersionCheckCacheSchema } from "./types.js";

// =============================================================================
// Semver Utilities
// =============================================================================

/**
 * Parse a version string into SemVer components
 */
export function parseSemVer(version: string): SemVer | null {
  // Match: major.minor.patch[-prerelease]
  const match = version.match(/^v?(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/);
  if (!match || !match[1] || !match[2] || !match[3]) {
    return null;
  }

  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4],
  };
}

/**
 * Compare two semantic versions
 * @returns negative if a < b, positive if a > b, 0 if equal
 */
export function compareSemVer(a: SemVer, b: SemVer): number {
  // Compare major
  if (a.major !== b.major) {
    return a.major - b.major;
  }

  // Compare minor
  if (a.minor !== b.minor) {
    return a.minor - b.minor;
  }

  // Compare patch
  if (a.patch !== b.patch) {
    return a.patch - b.patch;
  }

  // Compare prerelease
  // No prerelease > prerelease (1.0.0 > 1.0.0-beta)
  if (!a.prerelease && b.prerelease) {
    return 1;
  }
  if (a.prerelease && !b.prerelease) {
    return -1;
  }
  if (a.prerelease && b.prerelease) {
    return a.prerelease.localeCompare(b.prerelease);
  }

  return 0;
}

/**
 * Check if version string is a prerelease
 */
export function isPrerelease(version: string): boolean {
  const parsed = parseSemVer(version);
  return parsed?.prerelease !== undefined;
}

/**
 * Compare two version strings
 * @returns true if newVersion > currentVersion
 */
export function isNewerVersion(currentVersion: string, newVersion: string): boolean {
  const current = parseSemVer(currentVersion);
  const latest = parseSemVer(newVersion);

  if (!current || !latest) {
    return false;
  }

  return compareSemVer(latest, current) > 0;
}

// =============================================================================
// Version Checker Class
// =============================================================================

/**
 * Version checker for detecting available updates
 */
export class VersionChecker {
  private readonly config: UpdateConfig;
  private readonly cacheDir: string;

  /**
   * Create a new version checker
   *
   * @param config - Update configuration
   * @param cacheDir - Directory for storing cache files
   */
  constructor(config: Partial<UpdateConfig> = {}, cacheDir?: string) {
    this.config = { ...DEFAULT_UPDATE_CONFIG, ...config };
    this.cacheDir = cacheDir ?? join(process.env.HOME ?? process.cwd(), ".vellum", "cache");
  }

  /**
   * Get the cache file path
   */
  private get cacheFilePath(): string {
    return join(this.cacheDir, "version-check.json");
  }

  /**
   * Read cached version check result
   */
  private async readCache(): Promise<VersionCheckCache | null> {
    try {
      const data = await readFile(this.cacheFilePath, "utf-8");
      const parsed = JSON.parse(data);
      const result = VersionCheckCacheSchema.safeParse(parsed);

      if (!result.success) {
        return null;
      }

      // Check if cache has expired
      if (Date.now() > result.data.expiresAt) {
        return null;
      }

      return result.data;
    } catch {
      return null;
    }
  }

  /**
   * Write version check result to cache
   */
  private async writeCache(updateInfo: UpdateInfo): Promise<void> {
    try {
      const cache: VersionCheckCache = {
        updateInfo,
        cachedAt: Date.now(),
        expiresAt: Date.now() + this.config.cacheDurationMs,
      };

      await mkdir(dirname(this.cacheFilePath), { recursive: true });
      await writeFile(this.cacheFilePath, JSON.stringify(cache, null, 2));
    } catch {
      // Ignore cache write errors
    }
  }

  /**
   * Fetch package metadata from NPM registry
   */
  private async fetchPackageMetadata(): Promise<NpmPackageMetadata> {
    const url = `${this.config.registryUrl}/${this.config.packageName}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetchWithPool(url, {
        headers: {
          Accept: "application/json",
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`NPM registry returned ${response.status}: ${response.statusText}`);
      }

      return (await response.json()) as NpmPackageMetadata;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Get the latest version based on channel
   */
  private getLatestVersion(
    metadata: NpmPackageMetadata,
    channel: "stable" | "beta"
  ): { version: string; releaseDate?: string; tarballUrl?: string } | null {
    // For stable, use "latest" dist tag
    // For beta, use "next" dist tag if available, otherwise find latest prerelease
    const distTag = channel === "stable" ? "latest" : "next";
    const latestVersion = metadata["dist-tags"][distTag];

    if (latestVersion && metadata.versions[latestVersion]) {
      const versionMeta = metadata.versions[latestVersion];
      return {
        version: latestVersion,
        releaseDate: metadata.time?.[latestVersion],
        tarballUrl: versionMeta.dist.tarball,
      };
    }

    // Fallback: find the latest version manually
    const versions = Object.keys(metadata.versions);
    if (versions.length === 0) {
      return null;
    }

    // Filter based on channel
    const filteredVersions =
      channel === "stable" ? versions.filter((v) => !isPrerelease(v)) : versions;

    if (filteredVersions.length === 0) {
      return null;
    }

    // Sort and get the latest
    const sorted = filteredVersions.sort((a, b) => {
      const parsedA = parseSemVer(a);
      const parsedB = parseSemVer(b);
      if (!parsedA || !parsedB) return 0;
      return compareSemVer(parsedB, parsedA);
    });

    const latest = sorted[0];
    if (!latest) {
      return null;
    }
    const versionMeta = metadata.versions[latest];

    return {
      version: latest,
      releaseDate: metadata.time?.[latest],
      tarballUrl: versionMeta?.dist.tarball,
    };
  }

  /**
   * Check for available updates
   *
   * @param currentVersion - Current installed version
   * @param skipCache - Whether to skip cache and force a fresh check
   * @returns Version check result
   */
  async check(currentVersion: string, skipCache = false): Promise<VersionCheckResult> {
    const now = new Date();

    // Try to use cached result
    if (!skipCache) {
      const cached = await this.readCache();
      if (cached) {
        // Update hasUpdate based on current version (in case it changed)
        const hasUpdate = isNewerVersion(currentVersion, cached.updateInfo.latestVersion);

        return {
          success: true,
          updateInfo: {
            ...cached.updateInfo,
            currentVersion,
            hasUpdate,
          },
          checkedAt: now,
          fromCache: true,
        };
      }
    }

    // Fetch fresh data from registry
    try {
      const metadata = await this.fetchPackageMetadata();
      const latest = this.getLatestVersion(metadata, this.config.channel);

      if (!latest) {
        return {
          success: false,
          error: "No versions found in registry",
          checkedAt: now,
          fromCache: false,
        };
      }

      const hasUpdate = isNewerVersion(currentVersion, latest.version);

      const updateInfo: UpdateInfo = {
        currentVersion,
        latestVersion: latest.version,
        hasUpdate,
        channel: this.config.channel,
        releaseDate: latest.releaseDate,
        releaseNotesUrl: `https://github.com/vellum-ai/vellum/releases/tag/v${latest.version}`,
        tarballUrl: latest.tarballUrl,
      };

      // Cache the result
      await this.writeCache(updateInfo);

      return {
        success: true,
        updateInfo,
        checkedAt: now,
        fromCache: false,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
        checkedAt: now,
        fromCache: false,
      };
    }
  }

  /**
   * Clear the version check cache
   */
  async clearCache(): Promise<void> {
    try {
      const { unlink } = await import("node:fs/promises");
      await unlink(this.cacheFilePath);
    } catch {
      // Ignore if file doesn't exist
    }
  }
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Quick check for updates using default configuration
 *
 * @param currentVersion - Current installed version
 * @param config - Optional update configuration
 * @returns Version check result
 */
export async function checkForUpdates(
  currentVersion: string,
  config?: Partial<UpdateConfig>
): Promise<VersionCheckResult> {
  const checker = new VersionChecker(config);
  return checker.check(currentVersion);
}
