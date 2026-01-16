/**
 * Platform Detection Utilities for Search Module
 *
 * Cross-platform utilities for detecting OS, architecture,
 * and deriving paths for binary caching.
 *
 * @module builtin/search/platform
 */

import { arch, homedir, platform } from "node:os";
import * as path from "node:path";

// =============================================================================
// Types
// =============================================================================

/**
 * Supported operating systems.
 */
export type OperatingSystem = "windows" | "darwin" | "linux";

/**
 * Supported CPU architectures.
 */
export type Architecture = "x64" | "arm64";

/**
 * Platform information.
 */
export interface PlatformInfo {
  /** Operating system */
  os: OperatingSystem;
  /** CPU architecture */
  arch: Architecture;
}

/**
 * Ripgrep release artifact target mapping.
 */
export interface RipgrepTarget {
  /** Target triple for GitHub release */
  triple: string;
  /** Archive extension */
  extension: "tar.gz" | "zip";
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Application name for cache directory.
 */
const APP_NAME = "vellum";

/**
 * Default ripgrep version to download.
 */
export const RIPGREP_VERSION = "14.1.1";

/**
 * Map of platform-arch combinations to ripgrep release targets.
 * These match the artifact names in BurntSushi/ripgrep releases.
 */
const RIPGREP_TARGETS: Record<string, RipgrepTarget> = {
  "darwin-arm64": { triple: "aarch64-apple-darwin", extension: "tar.gz" },
  "darwin-x64": { triple: "x86_64-apple-darwin", extension: "tar.gz" },
  "linux-arm64": { triple: "aarch64-unknown-linux-gnu", extension: "tar.gz" },
  "linux-x64": { triple: "x86_64-unknown-linux-musl", extension: "tar.gz" },
  "windows-x64": { triple: "x86_64-pc-windows-msvc", extension: "zip" },
  "windows-arm64": { triple: "aarch64-pc-windows-msvc", extension: "zip" },
};

// =============================================================================
// Platform Detection
// =============================================================================

/**
 * Detect the current platform (OS and architecture).
 *
 * @returns Platform information
 * @throws Error if platform is unsupported
 */
export function getPlatform(): PlatformInfo {
  const os = normalizeOS(platform());
  const cpuArch = normalizeArch(arch());

  return { os, arch: cpuArch };
}

/**
 * Normalize Node.js platform string to our OperatingSystem type.
 */
function normalizeOS(nodePlatform: string): OperatingSystem {
  switch (nodePlatform) {
    case "win32":
      return "windows";
    case "darwin":
      return "darwin";
    case "linux":
      return "linux";
    default:
      throw new Error(`Unsupported operating system: ${nodePlatform}`);
  }
}

/**
 * Normalize Node.js arch string to our Architecture type.
 */
function normalizeArch(nodeArch: string): Architecture {
  switch (nodeArch) {
    case "x64":
    case "x86_64":
      return "x64";
    case "arm64":
    case "aarch64":
      return "arm64";
    default:
      throw new Error(`Unsupported architecture: ${nodeArch}`);
  }
}

// =============================================================================
// Binary Names
// =============================================================================

/**
 * Get the ripgrep binary name for the current platform.
 *
 * @returns Binary name (e.g., 'rg' or 'rg.exe')
 */
export function getRipgrepBinaryName(): string {
  const { os } = getPlatform();
  return os === "windows" ? "rg.exe" : "rg";
}

/**
 * Get the ripgrep release target for the current platform.
 *
 * @returns Target configuration for downloading
 * @throws Error if platform combination is unsupported
 */
export function getRipgrepTarget(): RipgrepTarget {
  const { os, arch: cpuArch } = getPlatform();
  const key = `${os}-${cpuArch}`;
  const target = RIPGREP_TARGETS[key];

  if (!target) {
    throw new Error(`Unsupported platform: ${os}-${cpuArch}`);
  }

  return target;
}

// =============================================================================
// Cache Directory
// =============================================================================

/**
 * Get the cache directory for Vellum.
 *
 * Follows platform conventions:
 * - Windows: %LOCALAPPDATA%\vellum\cache
 * - macOS/Linux: ~/.cache/vellum
 *
 * @returns Absolute path to cache directory
 */
export function getCacheDir(): string {
  const { os } = getPlatform();

  if (os === "windows") {
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData) {
      return path.join(localAppData, APP_NAME, "cache");
    }
    // Fallback for Windows if LOCALAPPDATA is not set
    return path.join(homedir(), "AppData", "Local", APP_NAME, "cache");
  }

  // macOS and Linux follow XDG convention
  const xdgCache = process.env.XDG_CACHE_HOME;
  if (xdgCache) {
    return path.join(xdgCache, APP_NAME);
  }

  return path.join(homedir(), ".cache", APP_NAME);
}

/**
 * Get the binary cache directory for Vellum.
 *
 * @returns Absolute path to binary cache directory
 */
export function getBinaryCacheDir(): string {
  return path.join(getCacheDir(), "bin");
}

/**
 * Get the full path to the cached ripgrep binary.
 *
 * @returns Absolute path to ripgrep binary in cache
 */
export function getCachedBinaryPath(): string {
  return path.join(getBinaryCacheDir(), getRipgrepBinaryName());
}

// =============================================================================
// Download URLs
// =============================================================================

/**
 * Get the GitHub release download URL for ripgrep.
 *
 * @param version - Ripgrep version (default: RIPGREP_VERSION)
 * @returns Download URL for the current platform
 */
export function getRipgrepDownloadUrl(version: string = RIPGREP_VERSION): string {
  const target = getRipgrepTarget();
  const filename = `ripgrep-${version}-${target.triple}.${target.extension}`;
  return `https://github.com/BurntSushi/ripgrep/releases/download/${version}/${filename}`;
}

/**
 * Get the expected archive filename for ripgrep.
 *
 * @param version - Ripgrep version (default: RIPGREP_VERSION)
 * @returns Archive filename
 */
export function getRipgrepArchiveFilename(version: string = RIPGREP_VERSION): string {
  const target = getRipgrepTarget();
  return `ripgrep-${version}-${target.triple}.${target.extension}`;
}

/**
 * Get the directory name inside the ripgrep archive.
 * The archive contains a directory named 'ripgrep-{version}-{target}'.
 *
 * @param version - Ripgrep version (default: RIPGREP_VERSION)
 * @returns Directory name inside archive
 */
export function getRipgrepArchiveDir(version: string = RIPGREP_VERSION): string {
  const target = getRipgrepTarget();
  return `ripgrep-${version}-${target.triple}`;
}
