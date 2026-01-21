// ============================================
// AGENTS.md Scanner
// ============================================

/**
 * Scans a project directory tree for AGENTS.md files.
 *
 * Implements directory-tree scanning to discover all AGENTS.md files
 * and build a hierarchical scope structure.
 *
 * @module @vellum/core/agent/agents-md/scanner
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { AgentsMdFile, AgentsMdTree, AgentsMdTreeNode, MergeMarker } from "./types.js";
import { MERGE_MARKER_PATTERNS } from "./types.js";

// =============================================================================
// Constants
// =============================================================================

/** Default file patterns to scan for */
export const DEFAULT_PATTERNS = ["AGENTS.md", "agents.md", ".agents.md"] as const;

/** Default directories to exclude from scanning */
export const DEFAULT_EXCLUDE_DIRS = [
  "node_modules",
  ".git",
  ".hg",
  ".svn",
  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  ".vscode",
  ".idea",
  "__pycache__",
  ".pytest_cache",
  "venv",
  ".venv",
  "target",
  "coverage",
] as const;

/** Default maximum scan depth */
export const DEFAULT_MAX_DEPTH = 10;

// =============================================================================
// Merge Marker Detection
// =============================================================================

/**
 * Detects the merge marker in file content.
 *
 * @param content - File content to check
 * @returns Detected marker and cleaned content
 */
export function detectMergeMarker(content: string): {
  marker: MergeMarker;
  instructions: string;
} {
  // Check for REPLACE first (takes precedence)
  if (MERGE_MARKER_PATTERNS.REPLACE.test(content)) {
    return {
      marker: "REPLACE",
      instructions: content.replace(MERGE_MARKER_PATTERNS.REPLACE, "").trim(),
    };
  }

  // Check for PREPEND
  if (MERGE_MARKER_PATTERNS.PREPEND.test(content)) {
    return {
      marker: "PREPEND",
      instructions: content.replace(MERGE_MARKER_PATTERNS.PREPEND, "").trim(),
    };
  }

  // Check for APPEND (explicit)
  if (MERGE_MARKER_PATTERNS.APPEND.test(content)) {
    return {
      marker: "APPEND",
      instructions: content.replace(MERGE_MARKER_PATTERNS.APPEND, "").trim(),
    };
  }

  // Default to APPEND
  return {
    marker: "APPEND",
    instructions: content.trim(),
  };
}

// =============================================================================
// Scanner Options
// =============================================================================

/**
 * Options for the scanner.
 */
export interface ScannerOptions {
  /** File patterns to scan for */
  patterns: readonly string[];
  /** Directories to exclude */
  excludeDirs: readonly string[];
  /** Maximum scan depth */
  maxDepth: number;
}

// =============================================================================
// Scanner Class
// =============================================================================

/**
 * Scans a project for AGENTS.md files.
 */
export class AgentsMdScanner {
  private readonly projectRoot: string;
  private readonly options: ScannerOptions;

  constructor(projectRoot: string, options?: Partial<ScannerOptions>) {
    this.projectRoot = path.resolve(projectRoot);
    this.options = {
      patterns: options?.patterns ?? DEFAULT_PATTERNS,
      excludeDirs: options?.excludeDirs ?? DEFAULT_EXCLUDE_DIRS,
      maxDepth: options?.maxDepth ?? DEFAULT_MAX_DEPTH,
    };
  }

  /**
   * Scan the project for AGENTS.md files.
   *
   * @returns Array of discovered files sorted by priority (root first)
   */
  async scan(): Promise<AgentsMdFile[]> {
    const files: AgentsMdFile[] = [];
    await this.scanDirectory(this.projectRoot, 0, files);

    // Sort by priority (lower depth = lower priority = earlier in array)
    files.sort((a, b) => a.priority - b.priority);

    return files;
  }

  /**
   * Build a hierarchy tree from discovered files.
   *
   * @param files - Discovered AGENTS.md files
   * @returns Hierarchy tree
   */
  buildTree(files: AgentsMdFile[]): AgentsMdTree {
    // Create root node
    const root: AgentsMdTreeNode = {
      path: this.projectRoot,
      file: files.find((f) => f.scope === this.projectRoot) ?? null,
      children: [],
      depth: 0,
    };

    // Build tree from files
    const nodeMap = new Map<string, AgentsMdTreeNode>();
    nodeMap.set(this.projectRoot, root);

    // Sort files by depth to process parents before children
    const sortedFiles = [...files].sort((a, b) => a.priority - b.priority);

    for (const file of sortedFiles) {
      if (file.scope === this.projectRoot) continue;

      // Find or create parent node
      const parentPath = path.dirname(file.scope);
      let parent = nodeMap.get(parentPath);

      if (!parent) {
        // Create intermediate nodes if needed
        parent = this.findOrCreateParent(parentPath, nodeMap, root);
      }

      // Create node for this file
      const node: AgentsMdTreeNode = {
        path: file.scope,
        file,
        children: [],
        depth: file.priority,
      };

      parent.children.push(node);
      nodeMap.set(file.scope, node);
    }

    return {
      root,
      files,
      projectRoot: this.projectRoot,
    };
  }

  /**
   * Find or create a parent node in the tree.
   */
  private findOrCreateParent(
    dirPath: string,
    nodeMap: Map<string, AgentsMdTreeNode>,
    root: AgentsMdTreeNode
  ): AgentsMdTreeNode {
    // Check if already exists
    const existing = nodeMap.get(dirPath);
    if (existing) return existing;

    // Calculate depth
    const relativePath = path.relative(this.projectRoot, dirPath);
    const depth = relativePath ? relativePath.split(path.sep).length : 0;

    // Find actual parent
    const parentPath = path.dirname(dirPath);
    let parent: AgentsMdTreeNode;

    if (parentPath === this.projectRoot || parentPath === dirPath) {
      parent = root;
    } else {
      parent = this.findOrCreateParent(parentPath, nodeMap, root);
    }

    // Create intermediate node (no file)
    const node: AgentsMdTreeNode = {
      path: dirPath,
      file: null,
      children: [],
      depth,
    };

    parent.children.push(node);
    nodeMap.set(dirPath, node);

    return node;
  }

  /**
   * Recursively scan a directory for AGENTS.md files.
   */
  private async scanDirectory(
    dirPath: string,
    depth: number,
    files: AgentsMdFile[]
  ): Promise<void> {
    // Check depth limit
    if (depth > this.options.maxDepth) {
      return;
    }

    // Check for AGENTS.md in this directory
    for (const pattern of this.options.patterns) {
      const filePath = path.join(dirPath, pattern);
      const file = await this.tryReadFile(filePath, depth);
      if (file) {
        files.push(file);
        break; // Only use first match per directory
      }
    }

    // Scan subdirectories
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        // Skip excluded directories
        if (this.options.excludeDirs.includes(entry.name)) continue;

        const subdir = path.join(dirPath, entry.name);
        await this.scanDirectory(subdir, depth + 1, files);
      }
    } catch {
      // Directory read error, skip
    }
  }

  /**
   * Try to read an AGENTS.md file.
   */
  private async tryReadFile(filePath: string, depth: number): Promise<AgentsMdFile | null> {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const { marker, instructions } = detectMergeMarker(content);

      return {
        path: filePath,
        scope: path.dirname(filePath),
        content,
        priority: depth,
        mergeMarker: marker,
        instructions,
      };
    } catch {
      return null;
    }
  }
}
