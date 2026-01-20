/**
 * Trust Manager for Path Security (T060)
 *
 * Manages trusted paths for cross-package file access in monorepos.
 * Stores trust decisions in ~/.vellum/trusted.json
 *
 * @module config/trust-manager
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// =============================================================================
// Types
// =============================================================================

/**
 * Trust decision scope
 */
export type TrustScope = "session" | "always";

/**
 * Detection reason for why trust prompt is shown
 */
export type TrustReason = "monorepo" | "new_project" | "parent_request";

/**
 * Information about a trust prompt
 */
export interface TrustPromptInfo {
  /** Detected root path that needs trust */
  rootPath: string;
  /** Current working directory */
  currentPath: string;
  /** Why the prompt is being shown */
  reason: TrustReason;
  /** Monorepo detection details */
  monorepoInfo?: {
    type: "npm" | "pnpm" | "yarn" | "turbo" | "lerna";
    workspaces: string[];
  };
}

/**
 * Stored trust decision
 */
export interface TrustDecision {
  trusted: boolean;
  when: string;
  reason: TrustReason;
  scope?: TrustScope;
}

/**
 * Persistent storage format
 */
export interface TrustStorage {
  trustedPaths: string[];
  decisions: Record<string, TrustDecision>;
}

// =============================================================================
// Constants
// =============================================================================

/** Paths that should never be trusted (security blocklist) */
const BLOCKED_PATHS: string[] = [
  // Unix root and system directories
  "/",
  "/usr",
  "/etc",
  "/var",
  "/bin",
  "/sbin",
  "/opt",
  "/lib",
  "/lib64",
  "/home",
  "/root",
  "/tmp",
  "/boot",
  "/dev",
  "/proc",
  "/sys",
  // macOS system directories
  "/System",
  "/Library",
  "/Applications",
  "/Users",
  // Windows root drives (normalized)
  "C:\\",
  "D:\\",
  "E:\\",
  "F:\\",
  // Windows system directories
  "C:\\Windows",
  "C:\\Program Files",
  "C:\\Program Files (x86)",
  "C:\\ProgramData",
  "C:\\Users",
];

/** Monorepo indicator files */
const MONOREPO_INDICATORS = {
  npm: ["package.json"],
  pnpm: ["pnpm-workspace.yaml", "pnpm-lock.yaml"],
  yarn: ["yarn.lock", ".yarnrc.yml"],
  turbo: ["turbo.json"],
  lerna: ["lerna.json"],
} as const;

// =============================================================================
// Storage Helpers
// =============================================================================

/**
 * Get Vellum config directory (~/.vellum)
 */
function getVellumDir(): string {
  return path.join(os.homedir(), ".vellum");
}

/**
 * Get trust storage file path
 */
function getTrustStoragePath(): string {
  return path.join(getVellumDir(), "trusted.json");
}

/**
 * Load trust storage from disk
 */
function loadTrustStorage(): TrustStorage {
  const storagePath = getTrustStoragePath();

  try {
    if (fs.existsSync(storagePath)) {
      const content = fs.readFileSync(storagePath, "utf-8");
      const parsed = JSON.parse(content) as unknown;

      // Validate structure
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "trustedPaths" in parsed &&
        Array.isArray((parsed as TrustStorage).trustedPaths)
      ) {
        return parsed as TrustStorage;
      }
    }
  } catch {
    // Ignore parse errors, return default
  }

  return {
    trustedPaths: [],
    decisions: {},
  };
}

/**
 * Save trust storage to disk
 */
function saveTrustStorage(storage: TrustStorage): void {
  const storagePath = getTrustStoragePath();
  const vellumDir = getVellumDir();

  // Ensure directory exists
  if (!fs.existsSync(vellumDir)) {
    fs.mkdirSync(vellumDir, { recursive: true });
  }

  fs.writeFileSync(storagePath, JSON.stringify(storage, null, 2), "utf-8");
}

// =============================================================================
// Path Utilities
// =============================================================================

/**
 * Normalize a path for consistent comparison
 */
function normalizePath(p: string): string {
  // Resolve to absolute
  const resolved = path.resolve(p);

  // Normalize separators and casing on Windows
  if (process.platform === "win32") {
    return resolved.toLowerCase().replace(/\//g, "\\");
  }

  return resolved;
}

/**
 * Check if a path is in the blocklist
 */
function isBlockedPath(p: string): boolean {
  const normalized = normalizePath(p);

  for (const blocked of BLOCKED_PATHS) {
    const normalizedBlocked = normalizePath(blocked);

    // Exact match
    if (normalized === normalizedBlocked) {
      return true;
    }

    // Check if blocked path is a root drive (e.g., "C:\\")
    if (normalizedBlocked.endsWith("\\") || normalizedBlocked === "/") {
      if (normalized === normalizedBlocked.replace(/\\$/, "")) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if child path is under parent path
 */
function isUnderPath(child: string, parent: string): boolean {
  const normalizedChild = normalizePath(child);
  const normalizedParent = normalizePath(parent);

  // Add separator to avoid partial matches (e.g., /foo matching /foobar)
  const parentWithSep = normalizedParent.endsWith(path.sep)
    ? normalizedParent
    : normalizedParent + path.sep;

  return normalizedChild.startsWith(parentWithSep) || normalizedChild === normalizedParent;
}

// =============================================================================
// Monorepo Detection
// =============================================================================

/**
 * Detect monorepo type from directory
 */
function detectMonorepoType(
  dir: string
): { type: "npm" | "pnpm" | "yarn" | "turbo" | "lerna"; workspaces: string[] } | null {
  // Check for turbo first (most specific)
  if (fs.existsSync(path.join(dir, "turbo.json"))) {
    return { type: "turbo", workspaces: detectWorkspaces(dir) };
  }

  // Check for lerna
  if (fs.existsSync(path.join(dir, "lerna.json"))) {
    return { type: "lerna", workspaces: detectWorkspaces(dir) };
  }

  // Check for pnpm workspace
  if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
    return { type: "pnpm", workspaces: detectWorkspaces(dir) };
  }

  // Check for yarn workspaces
  if (fs.existsSync(path.join(dir, ".yarnrc.yml")) || fs.existsSync(path.join(dir, "yarn.lock"))) {
    const workspaces = detectWorkspaces(dir);
    if (workspaces.length > 0) {
      return { type: "yarn", workspaces };
    }
  }

  // Check for npm workspaces in package.json
  const pkgPath = path.join(dir, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as { workspaces?: string[] };
      if (pkg.workspaces && Array.isArray(pkg.workspaces) && pkg.workspaces.length > 0) {
        return { type: "npm", workspaces: pkg.workspaces };
      }
    } catch {
      // Ignore parse errors
    }
  }

  return null;
}

/**
 * Extract workspace patterns from package.json
 */
function detectWorkspaces(dir: string): string[] {
  const pkgPath = path.join(dir, "package.json");

  if (!fs.existsSync(pkgPath)) {
    return [];
  }

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as {
      workspaces?: string[] | { packages?: string[] };
    };

    if (Array.isArray(pkg.workspaces)) {
      return pkg.workspaces;
    }

    if (
      pkg.workspaces &&
      typeof pkg.workspaces === "object" &&
      Array.isArray(pkg.workspaces.packages)
    ) {
      return pkg.workspaces.packages;
    }
  } catch {
    // Ignore parse errors
  }

  return [];
}

// =============================================================================
// TrustManager Class
// =============================================================================

/**
 * Manages trusted paths for file access security
 *
 * Singleton pattern - use TrustManager.getInstance()
 *
 * @example
 * ```typescript
 * const trustManager = TrustManager.getInstance();
 *
 * // Check if trust prompt needed
 * const promptInfo = await trustManager.needsTrustPrompt(cwd);
 * if (promptInfo) {
 *   // Show trust prompt UI
 *   await trustManager.trustPath(promptInfo.rootPath, 'always');
 * }
 *
 * // Check if path is trusted
 * if (trustManager.isTrusted(somePath)) {
 *   // Allow file access
 * }
 * ```
 */
export class TrustManager {
  private static instance: TrustManager | null = null;

  private storage: TrustStorage;
  private sessionTrustedPaths: Set<string> = new Set();

  private constructor() {
    this.storage = loadTrustStorage();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): TrustManager {
    if (!TrustManager.instance) {
      TrustManager.instance = new TrustManager();
    }
    return TrustManager.instance;
  }

  /**
   * Reset instance (for testing)
   */
  static resetInstance(): void {
    TrustManager.instance = null;
  }

  /**
   * Check if a path needs a trust prompt
   *
   * @param cwd - Current working directory
   * @returns Trust prompt info if prompt needed, null if already trusted
   */
  async needsTrustPrompt(cwd: string): Promise<TrustPromptInfo | null> {
    const normalizedCwd = normalizePath(cwd);

    // Check if cwd itself is already trusted
    if (this.isTrusted(normalizedCwd)) {
      return null;
    }

    // Detect monorepo root
    const monorepoRoot = this.detectMonorepoRoot(cwd);

    if (monorepoRoot) {
      const normalizedRoot = normalizePath(monorepoRoot);

      // Check if monorepo root is already trusted
      if (this.isTrusted(normalizedRoot)) {
        return null;
      }

      // Check if blocked
      if (isBlockedPath(normalizedRoot)) {
        return null; // Don't prompt for blocked paths
      }

      const monorepoInfo = detectMonorepoType(monorepoRoot);

      return {
        rootPath: monorepoRoot,
        currentPath: cwd,
        reason: "monorepo",
        monorepoInfo: monorepoInfo ?? undefined,
      };
    }

    // No monorepo detected, check if this is a new project
    const isNewProject = !this.hasDecision(normalizedCwd);

    if (isNewProject && !isBlockedPath(normalizedCwd)) {
      return {
        rootPath: cwd,
        currentPath: cwd,
        reason: "new_project",
      };
    }

    return null;
  }

  /**
   * Detect monorepo root from current directory
   *
   * Walks up directory tree looking for monorepo indicators
   *
   * @param cwd - Current working directory
   * @returns Monorepo root path or null
   */
  detectMonorepoRoot(cwd: string): string | null {
    let current = path.resolve(cwd);
    const root = path.parse(current).root;

    while (current !== root) {
      // Check for any monorepo indicator
      for (const indicators of Object.values(MONOREPO_INDICATORS)) {
        for (const indicator of indicators) {
          if (fs.existsSync(path.join(current, indicator))) {
            // Found indicator, verify it's actually a monorepo (has workspaces)
            const monorepoType = detectMonorepoType(current);
            if (monorepoType && monorepoType.workspaces.length > 0) {
              return current;
            }
          }
        }
      }

      // Move up
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }

    return null;
  }

  /**
   * Store a trust decision
   *
   * @param targetPath - Path to trust
   * @param scope - 'session' for current session only, 'always' for persistent
   * @param reason - Why the path was trusted
   */
  async trustPath(
    targetPath: string,
    scope: TrustScope,
    reason: TrustReason = "new_project"
  ): Promise<void> {
    const normalized = normalizePath(targetPath);

    // Check blocklist
    if (isBlockedPath(normalized)) {
      throw new Error(`Cannot trust system directory: ${targetPath}`);
    }

    if (scope === "session") {
      this.sessionTrustedPaths.add(normalized);
    } else {
      // Persistent trust
      if (!this.storage.trustedPaths.includes(normalized)) {
        this.storage.trustedPaths.push(normalized);
      }

      const dateStr = new Date().toISOString().split("T")[0] ?? new Date().toISOString();
      this.storage.decisions[normalized] = {
        trusted: true,
        when: dateStr,
        reason,
        scope,
      };

      saveTrustStorage(this.storage);
    }
  }

  /**
   * Remove a path from trusted paths
   *
   * @param targetPath - Path to untrust
   */
  async untrustPath(targetPath: string): Promise<void> {
    const normalized = normalizePath(targetPath);

    // Remove from session
    this.sessionTrustedPaths.delete(normalized);

    // Remove from persistent storage
    this.storage.trustedPaths = this.storage.trustedPaths.filter(
      (p) => normalizePath(p) !== normalized
    );

    if (this.storage.decisions[normalized]) {
      this.storage.decisions[normalized].trusted = false;
    }

    saveTrustStorage(this.storage);
  }

  /**
   * Get all trusted paths
   *
   * @returns Array of trusted path strings
   */
  getTrustedPaths(): string[] {
    const persistent = this.storage.trustedPaths;
    const session = Array.from(this.sessionTrustedPaths);

    // Deduplicate
    const all = new Set([...persistent, ...session]);
    return Array.from(all);
  }

  /**
   * Check if a path is trusted
   *
   * A path is trusted if:
   * 1. It exactly matches a trusted path
   * 2. It is under a trusted parent directory
   *
   * @param targetPath - Path to check
   * @returns true if trusted
   */
  isTrusted(targetPath: string): boolean {
    const normalized = normalizePath(targetPath);

    // Check session trust
    if (this.sessionTrustedPaths.has(normalized)) {
      return true;
    }

    for (const trusted of this.sessionTrustedPaths) {
      if (isUnderPath(normalized, trusted)) {
        return true;
      }
    }

    // Check persistent trust
    if (this.storage.trustedPaths.some((p) => normalizePath(p) === normalized)) {
      return true;
    }

    for (const trusted of this.storage.trustedPaths) {
      if (isUnderPath(normalized, normalizePath(trusted))) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if a path has a stored decision (trusted or not)
   */
  private hasDecision(normalizedPath: string): boolean {
    return normalizedPath in this.storage.decisions;
  }

  /**
   * Check if a path is blocked (system directory)
   *
   * @param targetPath - Path to check
   * @returns true if blocked
   */
  isBlocked(targetPath: string): boolean {
    return isBlockedPath(targetPath);
  }

  /**
   * Get decision info for a path
   *
   * @param targetPath - Path to lookup
   * @returns Decision info or null
   */
  getDecision(targetPath: string): TrustDecision | null {
    const normalized = normalizePath(targetPath);
    return this.storage.decisions[normalized] ?? null;
  }

  /**
   * Reload storage from disk
   */
  reload(): void {
    this.storage = loadTrustStorage();
  }
}

// =============================================================================
// Exports
// =============================================================================

export { isBlockedPath, normalizePath };
