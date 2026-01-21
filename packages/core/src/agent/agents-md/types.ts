// ============================================
// AGENTS.md Scoping Types
// ============================================

/**
 * Types for AGENTS.md directory scoping.
 *
 * Implements the Codex pattern where AGENTS.md files provide
 * directory-scoped instructions with hierarchical inheritance.
 *
 * @module @vellum/core/agent/agents-md/types
 */

// =============================================================================
// Merge Markers
// =============================================================================

/**
 * Content-level merge markers for AGENTS.md files.
 *
 * These markers control how a file's content merges with parent instructions:
 * - PREPEND: Add content before parent instructions
 * - APPEND: Add content after parent instructions (default)
 * - REPLACE: Completely replace parent instructions
 */
export type MergeMarker = "PREPEND" | "APPEND" | "REPLACE";

/**
 * Regex patterns for detecting merge markers in content.
 */
export const MERGE_MARKER_PATTERNS = {
  /** # PREPEND - Add before parent */
  PREPEND: /^#\s*PREPEND\s*$/m,
  /** # APPEND - Add after parent */
  APPEND: /^#\s*APPEND\s*$/m,
  /** # REPLACE - Replace parent entirely */
  REPLACE: /^#\s*REPLACE\s*$/m,
} as const;

// =============================================================================
// File & Scope Types
// =============================================================================

/**
 * Represents a discovered AGENTS.md file with metadata.
 */
export interface AgentsMdFile {
  /** Absolute path to the AGENTS.md file */
  path: string;

  /** Directory this file applies to (parent directory of the file) */
  scope: string;

  /** Raw file content */
  content: string;

  /** Depth-based priority (deeper = higher priority) */
  priority: number;

  /** Detected merge marker (defaults to APPEND) */
  mergeMarker: MergeMarker;

  /** Content with merge marker removed */
  instructions: string;
}

/**
 * Resolved scope containing merged instructions for a target file.
 */
export interface AgentsMdScope {
  /** Final merged instructions text */
  instructions: string;

  /** Files that contributed to this scope (ordered by priority, root first) */
  sources: AgentsMdFile[];

  /** Target file path this scope was resolved for */
  targetPath: string;
}

// =============================================================================
// Tree Types
// =============================================================================

/**
 * Node in the AGENTS.md hierarchy tree.
 */
export interface AgentsMdTreeNode {
  /** Directory path this node represents */
  path: string;

  /** AGENTS.md file at this level (if any) */
  file: AgentsMdFile | null;

  /** Child nodes (subdirectories with AGENTS.md files) */
  children: AgentsMdTreeNode[];

  /** Depth from project root (0 = root) */
  depth: number;
}

/**
 * Complete hierarchy tree of AGENTS.md files.
 */
export interface AgentsMdTree {
  /** Root node of the tree */
  root: AgentsMdTreeNode;

  /** All discovered files in the tree */
  files: AgentsMdFile[];

  /** Project root directory */
  projectRoot: string;
}

// =============================================================================
// Loader Interface
// =============================================================================

/**
 * Options for AgentsMdLoader.
 */
export interface AgentsMdLoaderOptions {
  /** Project root directory (required) */
  projectRoot: string;

  /** File patterns to scan for (default: ["AGENTS.md", "agents.md"]) */
  patterns?: string[];

  /** Directories to exclude from scanning (default: ["node_modules", ".git"]) */
  excludeDirs?: string[];

  /** Maximum directory depth to scan (default: 10) */
  maxDepth?: number;

  /** Cache TTL in milliseconds (default: 5000) */
  cacheTtlMs?: number;

  /** Enable caching (default: true) */
  enableCache?: boolean;
}

/**
 * Result from a scan operation.
 */
export interface ScanResult {
  /** All discovered AGENTS.md files */
  files: AgentsMdFile[];

  /** Hierarchy tree */
  tree: AgentsMdTree;

  /** Scan errors (non-fatal) */
  errors: Error[];

  /** Time taken to scan in milliseconds */
  scanTimeMs: number;
}

/**
 * Interface for the AGENTS.md loader.
 */
export interface IAgentsMdLoader {
  /**
   * Scan project for AGENTS.md files.
   * @returns Scan result with files and tree
   */
  scan(): Promise<ScanResult>;

  /**
   * Resolve applicable instructions for a target file.
   * @param filePath - Absolute path to the target file
   * @returns Resolved scope with merged instructions
   */
  resolve(filePath: string): Promise<AgentsMdScope>;

  /**
   * Get the hierarchy tree.
   * @returns The current hierarchy tree (may trigger scan if not cached)
   */
  getHierarchy(): Promise<AgentsMdTree>;

  /**
   * Get instructions formatted for a target file.
   * @param filePath - Absolute path to the target file
   * @returns Formatted instructions string
   */
  getInstructionsFor(filePath: string): Promise<string>;

  /**
   * Invalidate the cache and rescan.
   */
  invalidate(): void;
}
