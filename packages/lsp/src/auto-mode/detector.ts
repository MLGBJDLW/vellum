import { constants, type Stats } from "node:fs";
import { access, readdir, stat } from "node:fs/promises";
import { extname, join, relative } from "node:path";

import type { LspServerConfig } from "../config.js";
import type { DetectedLanguage } from "./types.js";

/**
 * Default patterns to ignore during workspace scanning
 */
const DEFAULT_IGNORE_PATTERNS = [
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".nuxt",
  ".output",
  "coverage",
  "__pycache__",
  ".venv",
  "venv",
  ".env",
  "target", // Rust/Java
  "vendor", // Go/PHP
  ".cache",
  ".turbo",
];

/**
 * Options for the LanguageDetector
 */
export interface DetectorOptions {
  /** Root directory of the workspace to scan */
  workspaceRoot: string;
  /** Map of server ID to server configuration */
  serverConfigs: Map<string, LspServerConfig>;
  /** Maximum number of files to scan (default: 1000) */
  maxFilesToScan?: number;
  /** Directory patterns to ignore (default: node_modules, .git, etc.) */
  ignorePatterns?: string[];
  /** Check if a server binary is installed (optional hook) */
  isServerInstalled?: (serverId: string) => Promise<boolean>;
  /** Check if a server is currently running (optional hook) */
  isServerRunning?: (serverId: string) => boolean;
}

/**
 * Internal structure to track file counts per extension
 */
interface ExtensionCount {
  extension: string;
  count: number;
  files: string[];
}

/**
 * Mapping from extension to language info
 */
interface ExtensionMapping {
  languageId: string;
  serverId: string;
}

/**
 * LanguageDetector - Scans workspace to detect programming languages
 *
 * Efficiently scans the workspace directory to identify which languages
 * are present, then maps them to appropriate LSP servers.
 */
export class LanguageDetector {
  private readonly workspaceRoot: string;
  private readonly serverConfigs: Map<string, LspServerConfig>;
  private readonly maxFilesToScan: number;
  private readonly ignorePatterns: Set<string>;
  private readonly extensionToServer: Map<string, ExtensionMapping>;
  private readonly isServerInstalledFn?: (serverId: string) => Promise<boolean>;
  private readonly isServerRunningFn?: (serverId: string) => boolean;

  // Track running servers (can be overridden via options)
  private readonly runningServers = new Set<string>();

  constructor(options: DetectorOptions) {
    this.workspaceRoot = options.workspaceRoot;
    this.serverConfigs = options.serverConfigs;
    this.maxFilesToScan = options.maxFilesToScan ?? 1000;
    this.ignorePatterns = new Set(options.ignorePatterns ?? DEFAULT_IGNORE_PATTERNS);
    this.isServerInstalledFn = options.isServerInstalled;
    this.isServerRunningFn = options.isServerRunning;

    // Build extension → server mapping from configs
    this.extensionToServer = this.buildExtensionMapping();
  }

  /**
   * Build a mapping from file extensions to server configurations
   */
  private buildExtensionMapping(): Map<string, ExtensionMapping> {
    const mapping = new Map<string, ExtensionMapping>();

    for (const [serverId, config] of this.serverConfigs) {
      if (!config.enabled) continue;

      const languageId = config.languageId ?? serverId;
      const extensions = config.fileExtensions ?? [];

      for (const ext of extensions) {
        // Normalize extension to include leading dot
        const normalizedExt = ext.startsWith(".") ? ext : `.${ext}`;
        // First server to claim an extension wins
        if (!mapping.has(normalizedExt)) {
          mapping.set(normalizedExt, { languageId, serverId });
        }
      }
    }

    return mapping;
  }

  /**
   * Scan the workspace and detect all present languages
   */
  async detect(): Promise<DetectedLanguage[]> {
    const extensionCounts = new Map<string, ExtensionCount>();
    let filesScanned = 0;

    // Recursive scan with depth-first traversal
    const scanDir = async (dirPath: string): Promise<void> => {
      if (filesScanned >= this.maxFilesToScan) return;

      let entries: string[];
      try {
        entries = await readdir(dirPath);
      } catch {
        // Permission denied or directory doesn't exist
        return;
      }

      for (const entry of entries) {
        if (filesScanned >= this.maxFilesToScan) break;

        // Skip ignored directories
        if (this.ignorePatterns.has(entry)) continue;

        const fullPath = join(dirPath, entry);
        let stats: Stats;
        try {
          stats = await stat(fullPath);
        } catch {
          // Skip files we can't stat
          continue;
        }

        if (stats.isDirectory()) {
          await scanDir(fullPath);
        } else if (stats.isFile()) {
          filesScanned++;
          const ext = extname(entry).toLowerCase();

          if (ext && this.extensionToServer.has(ext)) {
            const existing = extensionCounts.get(ext);
            const relativePath = relative(this.workspaceRoot, fullPath);

            if (existing) {
              existing.count++;
              // Keep only first few files as samples
              if (existing.files.length < 5) {
                existing.files.push(relativePath);
              }
            } else {
              extensionCounts.set(ext, {
                extension: ext,
                count: 1,
                files: [relativePath],
              });
            }
          }
        }
      }
    };

    await scanDir(this.workspaceRoot);

    // Group by server ID and aggregate
    const serverAggregates = new Map<
      string,
      {
        languageId: string;
        serverId: string;
        fileCount: number;
        files: string[];
      }
    >();

    for (const [ext, countData] of extensionCounts) {
      const mapping = this.extensionToServer.get(ext);
      if (!mapping) continue;

      const existing = serverAggregates.get(mapping.serverId);
      if (existing) {
        existing.fileCount += countData.count;
        // Append sample files, limit total
        for (const f of countData.files) {
          if (existing.files.length < 10) {
            existing.files.push(f);
          }
        }
      } else {
        serverAggregates.set(mapping.serverId, {
          languageId: mapping.languageId,
          serverId: mapping.serverId,
          fileCount: countData.count,
          files: [...countData.files],
        });
      }
    }

    // Convert to DetectedLanguage[] with confidence and action
    const results: DetectedLanguage[] = [];

    for (const agg of serverAggregates.values()) {
      const confidence = this.calculateConfidence(agg.fileCount, filesScanned);
      const suggestedAction = await this.determineSuggestedAction(agg.serverId);

      results.push({
        languageId: agg.languageId,
        serverId: agg.serverId,
        confidence,
        matchedFiles: agg.files,
        suggestedAction,
      });
    }

    // Sort by confidence descending
    results.sort((a, b) => b.confidence - a.confidence);

    return results;
  }

  /**
   * Detect language for a single file
   */
  detectFile(filePath: string): DetectedLanguage | null {
    const ext = extname(filePath).toLowerCase();
    const mapping = this.extensionToServer.get(ext);

    if (!mapping) return null;

    const relativePath = relative(this.workspaceRoot, filePath);

    return {
      languageId: mapping.languageId,
      serverId: mapping.serverId,
      confidence: 1.0, // Single file detection is deterministic
      matchedFiles: [relativePath],
      suggestedAction: "none", // Will be determined async if needed
    };
  }

  /**
   * Detect language for a single file with async action determination
   */
  async detectFileAsync(filePath: string): Promise<DetectedLanguage | null> {
    const result = this.detectFile(filePath);
    if (!result) return null;

    // Determine suggested action asynchronously
    result.suggestedAction = await this.determineSuggestedAction(result.serverId);
    return result;
  }

  /**
   * Calculate confidence score based on file count
   *
   * Uses a logarithmic scale:
   * - 1 file: 0.3
   * - 5 files: 0.5
   * - 20 files: 0.7
   * - 100+ files: 0.9+
   */
  private calculateConfidence(fileCount: number, totalScanned: number): number {
    if (fileCount === 0) return 0;
    if (totalScanned === 0) return 0;

    // Base confidence from file count (logarithmic)
    const baseConfidence = Math.min(0.9, 0.3 + Math.log10(fileCount + 1) * 0.3);

    // Slight boost for proportion of workspace
    const proportionBoost = Math.min(0.1, (fileCount / totalScanned) * 0.5);

    return Math.min(1.0, baseConfidence + proportionBoost);
  }

  /**
   * Determine what action should be suggested for a server
   */
  private async determineSuggestedAction(serverId: string): Promise<"install" | "start" | "none"> {
    // Check if server is running
    if (this.isServerRunning(serverId)) {
      return "none";
    }

    // Check if server is installed
    const installed = await this.isServerInstalled(serverId);
    if (!installed) {
      return "install";
    }

    return "start";
  }

  /**
   * Check if a server is currently running
   */
  private isServerRunning(serverId: string): boolean {
    if (this.isServerRunningFn) {
      return this.isServerRunningFn(serverId);
    }
    return this.runningServers.has(serverId);
  }

  /**
   * Check if a server binary is installed
   */
  private async isServerInstalled(serverId: string): Promise<boolean> {
    if (this.isServerInstalledFn) {
      return this.isServerInstalledFn(serverId);
    }

    const config = this.serverConfigs.get(serverId);
    if (!config) return false;

    // Try to check if the command exists
    return this.commandExists(config.command);
  }

  /**
   * Check if a command exists in PATH
   */
  private async commandExists(command: string): Promise<boolean> {
    // On Windows, try common extensions
    const isWindows = process.platform === "win32";
    const extensions = isWindows ? ["", ".exe", ".cmd", ".bat", ".ps1"] : [""];

    // Check PATH directories
    const pathEnv = process.env.PATH ?? "";
    const pathDirs = pathEnv.split(isWindows ? ";" : ":");

    for (const dir of pathDirs) {
      for (const ext of extensions) {
        const fullPath = join(dir, command + ext);
        try {
          await access(fullPath, constants.X_OK);
          return true;
        } catch {
          // Not found in this directory
        }
      }
    }

    // Also check npm global bin directory
    const npmGlobalDirs = this.getNpmGlobalDirs();
    for (const dir of npmGlobalDirs) {
      for (const ext of extensions) {
        const fullPath = join(dir, command + ext);
        try {
          await access(fullPath, constants.X_OK);
          return true;
        } catch {
          // Not found
        }
      }
    }

    return false;
  }

  /**
   * Get potential npm global bin directories
   */
  private getNpmGlobalDirs(): string[] {
    const dirs: string[] = [];
    const home = process.env.HOME ?? process.env.USERPROFILE ?? "";

    if (process.platform === "win32") {
      // Windows npm global locations
      dirs.push(join(process.env.APPDATA ?? "", "npm"));
      dirs.push(join(home, "AppData", "Roaming", "npm"));
    } else {
      // Unix-like npm global locations
      dirs.push("/usr/local/bin");
      dirs.push(join(home, ".npm-global", "bin"));
      dirs.push(join(home, ".local", "bin"));
    }

    return dirs.filter(Boolean);
  }

  /**
   * Mark a server as running (for tracking without external hook)
   */
  setServerRunning(serverId: string, running: boolean): void {
    if (running) {
      this.runningServers.add(serverId);
    } else {
      this.runningServers.delete(serverId);
    }
  }

  /**
   * Get all supported extensions
   */
  getSupportedExtensions(): string[] {
    return Array.from(this.extensionToServer.keys());
  }

  /**
   * Get server ID for an extension
   */
  getServerForExtension(extension: string): string | null {
    const normalized = extension.startsWith(".") ? extension : `.${extension}`;
    return this.extensionToServer.get(normalized)?.serverId ?? null;
  }
}
