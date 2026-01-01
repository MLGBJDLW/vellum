// ============================================
// Context Agents Discovery
// ============================================
// File discovery for AGENTS.md and related agent instruction files.
// Implements REQ-001: Support multiple file patterns with priority ordering.
// Implements REQ-002: Directory tree walking with inheritance support.

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { AgentsFileLocation, AgentsFileType } from "./types.js";

/**
 * File pattern with priority and type information.
 * Used to define the discovery order for agent instruction files.
 */
export interface AgentsFilePattern {
  /** File path pattern relative to project root */
  pattern: string;
  /** Priority for merge ordering (higher = more precedence) */
  priority: number;
  /** Source category for the file location */
  source: "project" | "workspace" | "user" | "global";
  /** File type classification */
  type: AgentsFileType;
}

/**
 * All supported AGENTS.md file patterns with their priorities.
 *
 * Priority ordering (REQ-001):
 * - 100: AGENTS.md (canonical format, highest priority)
 * - 99:  agents.md (lowercase variant)
 * - 98:  .agents.md (hidden variant)
 * - 90:  CLAUDE.md (Anthropic Claude format)
 * - 88:  GEMINI.md (Google Gemini format)
 * - 80:  .cursorrules (Cursor editor format)
 * - 70:  .clinerules (Cline extension format)
 * - 65:  .roorules (Roo extension format)
 * - 63:  .windsurfrules (Windsurf format)
 * - 60:  .github/copilot-instructions.md (GitHub Copilot format)
 *
 * @example
 * ```typescript
 * for (const { pattern, priority } of AGENTS_FILE_PATTERNS) {
 *   const fullPath = path.join(dir, pattern);
 *   if (await fs.exists(fullPath)) {
 *     files.push({ path: fullPath, priority });
 *   }
 * }
 * ```
 */
export const AGENTS_FILE_PATTERNS = [
  { pattern: "AGENTS.md", priority: 100, source: "project", type: "agents" },
  { pattern: "agents.md", priority: 99, source: "project", type: "agents" },
  { pattern: ".agents.md", priority: 98, source: "project", type: "agents" },
  { pattern: "CLAUDE.md", priority: 90, source: "project", type: "claude" },
  { pattern: "GEMINI.md", priority: 88, source: "project", type: "gemini" },
  { pattern: ".cursorrules", priority: 80, source: "project", type: "cursor" },
  { pattern: ".clinerules", priority: 70, source: "project", type: "cline" },
  { pattern: ".roorules", priority: 65, source: "project", type: "roo" },
  { pattern: ".windsurfrules", priority: 63, source: "project", type: "windsurf" },
  { pattern: ".github/copilot-instructions.md", priority: 60, source: "project", type: "copilot" },
] as const satisfies readonly AgentsFilePattern[];

/**
 * Type for the file patterns array.
 */
export type AgentsFilePatternsType = typeof AGENTS_FILE_PATTERNS;

/**
 * Convert a pattern match to an AgentsFileLocation.
 */
export function patternToLocation(
  pattern: AgentsFilePattern,
  resolvedPath: string
): AgentsFileLocation {
  return {
    path: resolvedPath,
    priority: pattern.priority,
    source: pattern.source,
  };
}

/**
 * Get all pattern strings for file matching.
 */
export function getPatternStrings(): string[] {
  return AGENTS_FILE_PATTERNS.map((p) => p.pattern);
}

/**
 * Find the pattern info for a given filename.
 */
export function findPatternByFilename(filename: string): AgentsFilePattern | undefined {
  // Handle both exact match and path ending
  return AGENTS_FILE_PATTERNS.find(
    (p) =>
      p.pattern === filename ||
      filename.endsWith(`/${p.pattern}`) ||
      filename.endsWith(`\\${p.pattern}`)
  );
}

// =============================================================================
// Default Stop Boundaries
// =============================================================================

/**
 * Default file/directory markers that indicate a workspace/project root.
 * Discovery will stop at directories containing any of these.
 */
export const DEFAULT_STOP_BOUNDARIES = [
  ".git",
  "package.json",
  "pnpm-workspace.yaml",
  "Cargo.toml",
  "go.mod",
  "pyproject.toml",
  ".vellum",
] as const;

// =============================================================================
// AgentsFileDiscovery Class
// =============================================================================

/**
 * Options for AgentsFileDiscovery.
 */
export interface AgentsFileDiscoveryOptions {
  /**
   * File/directory names that indicate a project root boundary.
   * Discovery will stop walking up the tree when encountering these.
   * @default DEFAULT_STOP_BOUNDARIES
   */
  stopBoundaries?: string[];
}

/**
 * File discovery for AGENTS.md and related agent instruction files.
 *
 * Implements:
 * - REQ-001: Support multiple file patterns with priority ordering
 * - REQ-002: Directory tree walking with inheritance support
 *
 * @example
 * ```typescript
 * const discovery = new AgentsFileDiscovery();
 *
 * // Find all agent files in a single directory
 * const files = await discovery.discoverInDirectory('/project/src');
 *
 * // Find all agent files from child to root (for inheritance merging)
 * const inherited = await discovery.discoverWithInheritance('/project/src/module');
 * ```
 */
export class AgentsFileDiscovery {
  private readonly stopBoundaries: string[];

  constructor(options: AgentsFileDiscoveryOptions = {}) {
    this.stopBoundaries = options.stopBoundaries ?? [...DEFAULT_STOP_BOUNDARIES];
  }

  /**
   * Discover all AGENTS.md files in a single directory.
   *
   * Checks for each pattern in AGENTS_FILE_PATTERNS and returns
   * only files that exist, sorted by priority (highest first).
   *
   * @param dirPath - Absolute path to the directory to scan
   * @returns Array of AgentsFileLocation sorted by priority (highest first)
   *
   * @example
   * ```typescript
   * const files = await discovery.discoverInDirectory('/project');
   * // Returns: [
   * //   { path: '/project/AGENTS.md', priority: 100, source: 'project' },
   * //   { path: '/project/.cursorrules', priority: 80, source: 'project' }
   * // ]
   * ```
   */
  async discoverInDirectory(dirPath: string): Promise<AgentsFileLocation[]> {
    const results: AgentsFileLocation[] = [];

    // Check if directory exists
    try {
      const stat = await fs.stat(dirPath);
      if (!stat.isDirectory()) {
        return [];
      }
    } catch {
      // Directory doesn't exist, return empty array
      return [];
    }

    // Check each pattern
    for (const pattern of AGENTS_FILE_PATTERNS) {
      const fullPath = path.join(dirPath, pattern.pattern);

      try {
        await fs.access(fullPath);
        results.push(patternToLocation(pattern, fullPath));
      } catch {
        // File doesn't exist, skip
      }
    }

    // Sort by priority (highest first)
    return results.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Discover AGENTS.md files walking from child directory to root.
   *
   * Walks up the directory tree from startPath, collecting all
   * agent files found. Stops at filesystem root or when a stop
   * boundary is encountered (e.g., .git, package.json).
   *
   * Returns files in inheritance order: root directories first,
   * child directories last. This ordering is correct for merging
   * where child configs override parent configs.
   *
   * @param startPath - Absolute path to start walking from
   * @returns Array of AgentsFileLocation in inheritance order (root first, child last)
   *
   * @example
   * ```typescript
   * // Directory structure:
   * // /project/AGENTS.md
   * // /project/package.json (boundary)
   * // /project/src/module/AGENTS.md
   *
   * const files = await discovery.discoverWithInheritance('/project/src/module');
   * // Returns: [
   * //   { path: '/project/AGENTS.md', ... },         // root (discovered first in walk, but placed first for merge)
   * //   { path: '/project/src/module/AGENTS.md', ... } // child (most specific, highest precedence in merge)
   * // ]
   * ```
   */
  async discoverWithInheritance(startPath: string): Promise<AgentsFileLocation[]> {
    const allFiles: AgentsFileLocation[] = [];
    let currentDir = path.resolve(startPath);

    // Track visited directories to prevent infinite loops
    const visited = new Set<string>();

    while (true) {
      // Normalize path for comparison
      const normalizedDir = path.normalize(currentDir);

      // Prevent infinite loops
      if (visited.has(normalizedDir)) {
        break;
      }
      visited.add(normalizedDir);

      // Discover files in current directory
      const files = await this.discoverInDirectory(currentDir);
      allFiles.push(...files);

      // Check if this is a boundary (stop walking)
      if (await this.isBoundary(currentDir)) {
        break;
      }

      // Move to parent directory
      const parentDir = path.dirname(currentDir);

      // Check if we've reached filesystem root
      if (parentDir === currentDir) {
        break;
      }

      currentDir = parentDir;
    }

    // Reverse to get inheritance order (root first, child last)
    // This is because we walked from child to root, so we need to flip
    return allFiles.reverse();
  }

  /**
   * Check if a directory is a stop boundary.
   *
   * A directory is a boundary if it contains any of the stop boundary
   * markers (e.g., .git, package.json).
   *
   * @param dirPath - Directory path to check
   * @returns True if this directory is a boundary
   */
  private async isBoundary(dirPath: string): Promise<boolean> {
    for (const boundary of this.stopBoundaries) {
      const boundaryPath = path.join(dirPath, boundary);
      try {
        await fs.access(boundaryPath);
        return true;
      } catch {
        // Boundary marker doesn't exist, continue checking
      }
    }
    return false;
  }
}
