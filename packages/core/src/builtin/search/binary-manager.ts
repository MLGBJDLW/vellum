/**
 * Binary Manager for Ripgrep
 *
 * Manages ripgrep binary detection, caching, and downloading.
 * Provides a unified interface to get a working ripgrep binary.
 *
 * @module builtin/search/binary-manager
 */

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { access, chmod, mkdir, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fetchWithPool } from "@vellum/shared";
import {
  getBinaryCacheDir,
  getCachedBinaryPath,
  getPlatform,
  getRipgrepArchiveDir,
  getRipgrepBinaryName,
  getRipgrepDownloadUrl,
  getRipgrepTarget,
  RIPGREP_VERSION,
} from "./platform.js";
import type { BinaryInfo, BinarySource } from "./types.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Configuration options for BinaryManager.
 */
export interface BinaryManagerOptions {
  /** Ripgrep version to download (default: RIPGREP_VERSION) */
  version?: string;

  /** Disable auto-download (default: false) */
  disableDownload?: boolean;

  /** Download timeout in milliseconds (default: 60000) */
  timeout?: number;
}

/**
 * Result of a binary detection attempt.
 */
interface DetectionResult {
  /** Binary information if found */
  info: BinaryInfo | null;
  /** Error message if detection failed */
  error?: string;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_TIMEOUT = 60_000; // 60 seconds
const VERSION_REGEX = /ripgrep (\d+\.\d+\.\d+)/;

// =============================================================================
// Version Detection
// =============================================================================

/**
 * Run a binary and extract its version.
 *
 * @param binaryPath - Path to the binary
 * @returns Version string or null if extraction failed
 */
async function extractVersion(binaryPath: string): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn(binaryPath, ["--version"], {
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 5000,
      shell: process.platform === "win32",
    });

    let stdout = "";

    child.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.on("error", () => {
      resolve(null);
    });

    child.on("close", (code) => {
      if (code === 0) {
        const match = stdout.match(VERSION_REGEX);
        resolve(match?.[1] ?? null);
      } else {
        resolve(null);
      }
    });
  });
}

// =============================================================================
// System Binary Detection
// =============================================================================

/**
 * Detect ripgrep installed on the system PATH.
 *
 * @returns BinaryInfo if found, null otherwise
 */
export async function detectSystemRipgrep(): Promise<BinaryInfo | null> {
  const { os } = getPlatform();
  const binaryName = os === "windows" ? "rg.exe" : "rg";

  // Try to find ripgrep in PATH by running it directly
  const result = await detectBinaryInPath(binaryName);
  return result.info;
}

/**
 * Detect a binary in the system PATH.
 */
async function detectBinaryInPath(binaryName: string): Promise<DetectionResult> {
  const { os } = getPlatform();

  return new Promise((resolve) => {
    // Use 'where' on Windows, 'which' on Unix
    const findCommand = os === "windows" ? "where" : "which";

    const child = spawn(findCommand, [binaryName], {
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 5000,
      shell: process.platform === "win32",
    });

    let stdout = "";

    child.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.on("error", () => {
      resolve({ info: null, error: `Failed to run ${findCommand}` });
    });

    child.on("close", async (code) => {
      if (code !== 0) {
        resolve({ info: null });
        return;
      }

      // Get the first path from output (handles multiple matches)
      const binaryPath = stdout.trim().split("\n")[0]?.trim();
      if (!binaryPath) {
        resolve({ info: null });
        return;
      }

      // Extract version
      const version = await extractVersion(binaryPath);
      if (!version) {
        resolve({ info: null, error: "Could not extract version" });
        return;
      }

      resolve({
        info: {
          path: binaryPath,
          version,
          source: "system" as BinarySource,
        },
      });
    });
  });
}

// =============================================================================
// Cached Binary Detection
// =============================================================================

/**
 * Detect ripgrep in the Vellum cache directory.
 *
 * @returns BinaryInfo if found and valid, null otherwise
 */
export async function detectCachedRipgrep(): Promise<BinaryInfo | null> {
  const cachedPath = getCachedBinaryPath();

  // Check if file exists
  try {
    await access(cachedPath);
  } catch {
    return null;
  }

  // Verify it's executable and get version
  const version = await extractVersion(cachedPath);
  if (!version) {
    return null;
  }

  return {
    path: cachedPath,
    version,
    source: "cached" as BinarySource,
  };
}

// =============================================================================
// Download
// =============================================================================

/**
 * Download ripgrep from GitHub releases.
 *
 * @param options - Download options
 * @returns BinaryInfo for the downloaded binary
 * @throws Error if download or extraction fails
 */
export async function downloadRipgrep(options: BinaryManagerOptions = {}): Promise<BinaryInfo> {
  const version = options.version ?? RIPGREP_VERSION;
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const url = getRipgrepDownloadUrl(version);
  const target = getRipgrepTarget();
  const { os } = getPlatform();

  // Create temp directory for download
  const tempDir = path.join(tmpdir(), `vellum-rg-${randomUUID()}`);
  await mkdir(tempDir, { recursive: true });

  try {
    // Download archive
    const archivePath = path.join(tempDir, `ripgrep.${target.extension}`);

    await downloadFile(url, archivePath, timeout);

    // Extract binary
    const binaryPath = await extractBinary(archivePath, tempDir, target.extension, version);

    // Create cache directory
    const cacheDir = getBinaryCacheDir();
    await mkdir(cacheDir, { recursive: true });

    // Move binary to cache
    const finalPath = getCachedBinaryPath();
    await rename(binaryPath, finalPath);

    // Make executable on Unix
    if (os !== "windows") {
      await chmod(finalPath, 0o755);
    }

    // Verify and get version
    const extractedVersion = await extractVersion(finalPath);
    if (!extractedVersion) {
      throw new Error("Downloaded binary failed version check");
    }

    return {
      path: finalPath,
      version: extractedVersion,
      source: "downloaded" as BinarySource,
    };
  } finally {
    // Cleanup temp directory
    await rm(tempDir, { recursive: true, force: true }).catch(() => {
      // Ignore cleanup errors
    });
  }
}

/**
 * Download a file from a URL.
 */
async function downloadFile(url: string, destPath: string, timeout: number): Promise<void> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetchWithPool(url, { signal: controller.signal });

    if (!response.ok) {
      throw new Error(`Download failed: ${response.status} ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error("No response body");
    }

    // Convert web ReadableStream to Node.js Readable
    const nodeStream = Readable.fromWeb(response.body as import("stream/web").ReadableStream);
    const fileStream = createWriteStream(destPath);

    await pipeline(nodeStream, fileStream);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Extract the ripgrep binary from an archive.
 */
async function extractBinary(
  archivePath: string,
  tempDir: string,
  extension: "tar.gz" | "zip",
  version: string
): Promise<string> {
  const { os } = getPlatform();
  const binaryName = getRipgrepBinaryName();
  const archiveDir = getRipgrepArchiveDir(version);

  if (extension === "tar.gz") {
    // Extract tar.gz using system tar command
    await extractTarGz(archivePath, tempDir);

    return path.join(tempDir, archiveDir, binaryName);
  } else {
    // Extract zip - use system unzip on Unix, PowerShell on Windows
    if (os === "windows") {
      await extractZipWindows(archivePath, tempDir);
    } else {
      await extractZipUnix(archivePath, tempDir);
    }

    return path.join(tempDir, archiveDir, binaryName);
  }
}

/**
 * Extract a tar.gz archive using system tar command.
 */
async function extractTarGz(archivePath: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("tar", ["-xzf", archivePath, "-C", destDir], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stderr = "";
    child.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Tar extraction failed: ${stderr}`));
      }
    });
  });
}

/**
 * Extract a zip file on Windows using PowerShell.
 */
async function extractZipWindows(archivePath: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `Expand-Archive -Path "${archivePath}" -DestinationPath "${destDir}" -Force`,
      ],
      { stdio: ["pipe", "pipe", "pipe"] }
    );

    let stderr = "";
    child.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Zip extraction failed: ${stderr}`));
      }
    });
  });
}

/**
 * Extract a zip file on Unix using the unzip command.
 */
async function extractZipUnix(archivePath: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("unzip", ["-o", archivePath, "-d", destDir], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stderr = "";
    child.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Zip extraction failed: ${stderr}`));
      }
    });
  });
}

// =============================================================================
// BinaryManager Class
// =============================================================================

/**
 * Manager for ripgrep binary lifecycle.
 *
 * Provides a unified interface to detect, cache, and download ripgrep.
 * Uses lazy initialization - no network calls until getBinary() is called.
 */
export class BinaryManager {
  private cachedInfo: BinaryInfo | null = null;
  private detectionPromise: Promise<BinaryInfo | null> | null = null;
  private readonly options: Required<BinaryManagerOptions>;

  constructor(options: BinaryManagerOptions = {}) {
    this.options = {
      version: options.version ?? RIPGREP_VERSION,
      disableDownload: options.disableDownload ?? false,
      timeout: options.timeout ?? DEFAULT_TIMEOUT,
    };
  }

  /**
   * Get a ripgrep binary, trying all sources in order:
   * 1. Cached result from previous call
   * 2. System PATH
   * 3. Vellum cache directory
   *
   * Does NOT download automatically. Use ensureBinary() for that.
   *
   * @returns BinaryInfo if found, null otherwise
   */
  async getBinary(): Promise<BinaryInfo | null> {
    // Return cached result if available
    if (this.cachedInfo) {
      return this.cachedInfo;
    }

    // Prevent concurrent detection
    if (this.detectionPromise) {
      return this.detectionPromise;
    }

    this.detectionPromise = this.detectBinary();
    const result = await this.detectionPromise;
    this.detectionPromise = null;

    if (result) {
      this.cachedInfo = result;
    }

    return result;
  }

  /**
   * Internal detection logic.
   */
  private async detectBinary(): Promise<BinaryInfo | null> {
    // Try system PATH first
    const systemBinary = await detectSystemRipgrep();
    if (systemBinary) {
      return systemBinary;
    }

    // Try cache directory
    const cachedBinary = await detectCachedRipgrep();
    if (cachedBinary) {
      return cachedBinary;
    }

    return null;
  }

  /**
   * Ensure a ripgrep binary is available, downloading if necessary.
   *
   * @returns BinaryInfo for the available binary
   * @throws Error if no binary available and download is disabled or fails
   */
  async ensureBinary(): Promise<BinaryInfo> {
    // Try existing sources first
    const existing = await this.getBinary();
    if (existing) {
      return existing;
    }

    // Check if download is disabled
    if (this.options.disableDownload) {
      throw new Error(
        "Ripgrep not found and auto-download is disabled. " +
          "Install ripgrep manually or enable download."
      );
    }

    // Download and cache
    const downloaded = await downloadRipgrep({
      version: this.options.version,
      timeout: this.options.timeout,
    });

    this.cachedInfo = downloaded;
    return downloaded;
  }

  /**
   * Quick check if a binary is immediately available (cached result only).
   * Does not perform any I/O.
   *
   * @returns true if a binary path is cached
   */
  isAvailable(): boolean {
    return this.cachedInfo !== null;
  }

  /**
   * Clear cached binary information.
   * Next call to getBinary() will re-detect.
   */
  clearCache(): void {
    this.cachedInfo = null;
    this.detectionPromise = null;
  }

  /**
   * Get the currently cached binary info.
   *
   * @returns Cached BinaryInfo or null
   */
  getCachedInfo(): BinaryInfo | null {
    return this.cachedInfo;
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let defaultManager: BinaryManager | null = null;

/**
 * Get the default BinaryManager instance.
 * Creates a singleton on first call.
 *
 * @returns Default BinaryManager instance
 */
export function getDefaultBinaryManager(): BinaryManager {
  if (!defaultManager) {
    defaultManager = new BinaryManager();
  }
  return defaultManager;
}

/**
 * Reset the default BinaryManager instance.
 * Useful for testing.
 */
export function resetDefaultBinaryManager(): void {
  defaultManager = null;
}
