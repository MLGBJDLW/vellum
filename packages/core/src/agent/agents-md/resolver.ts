// ============================================
// AGENTS.md Resolver
// ============================================

/**
 * Resolves applicable AGENTS.md instructions for a target file.
 *
 * Implements hierarchical scope resolution with merge strategies:
 * - PREPEND: Child instructions come before parent
 * - APPEND: Child instructions come after parent (default)
 * - REPLACE: Child instructions completely replace parent
 *
 * @module @vellum/core/agent/agents-md/resolver
 */

import * as path from "node:path";
import type { AgentsMdFile, AgentsMdScope, AgentsMdTree } from "./types.js";

// =============================================================================
// Scope Resolution
// =============================================================================

/**
 * Finds all AGENTS.md files that apply to a target file path.
 *
 * Walks from the project root down to the target file's directory,
 * collecting all applicable AGENTS.md files along the way.
 *
 * @param targetPath - Absolute path to the target file
 * @param tree - The hierarchy tree
 * @returns Array of applicable files, ordered from root to most specific
 */
export function findApplicableFiles(targetPath: string, tree: AgentsMdTree): AgentsMdFile[] {
  const normalizedTarget = path.resolve(targetPath);
  const targetDir = path.dirname(normalizedTarget);

  // Build path from root to target
  const pathSegments = getPathSegments(tree.projectRoot, targetDir);
  const applicable: AgentsMdFile[] = [];

  // Check each segment for applicable AGENTS.md files
  let currentPath = tree.projectRoot;

  // Check root first
  const rootFile = tree.files.find((f) => f.scope === tree.projectRoot);
  if (rootFile) {
    applicable.push(rootFile);
  }

  // Walk down to target
  for (const segment of pathSegments) {
    currentPath = path.join(currentPath, segment);
    const file = tree.files.find((f) => f.scope === currentPath);
    if (file) {
      applicable.push(file);
    }
  }

  return applicable;
}

/**
 * Gets path segments from root to target directory.
 *
 * @param root - Project root path
 * @param target - Target directory path
 * @returns Array of path segments
 */
function getPathSegments(root: string, target: string): string[] {
  const normalizedRoot = path.resolve(root);
  const normalizedTarget = path.resolve(target);

  // Check if target is under root
  if (!normalizedTarget.startsWith(normalizedRoot)) {
    return [];
  }

  const relativePath = path.relative(normalizedRoot, normalizedTarget);
  if (!relativePath) {
    return [];
  }

  return relativePath.split(path.sep).filter(Boolean);
}

// =============================================================================
// Instruction Merging
// =============================================================================

/**
 * Merges instructions from multiple AGENTS.md files.
 *
 * Applies merge markers to combine instructions:
 * - PREPEND: Child comes before accumulated instructions
 * - APPEND: Child comes after accumulated instructions
 * - REPLACE: Child replaces all accumulated instructions
 *
 * @param files - Array of files ordered from root to most specific
 * @returns Merged instructions string
 */
export function mergeInstructions(files: AgentsMdFile[]): string {
  if (files.length === 0) {
    return "";
  }

  let accumulated = "";

  for (const file of files) {
    if (!file.instructions.trim()) {
      continue;
    }

    switch (file.mergeMarker) {
      case "REPLACE":
        // Replace everything with this file's instructions
        accumulated = file.instructions;
        break;

      case "PREPEND":
        // Add this file's instructions before accumulated
        accumulated = accumulated ? `${file.instructions}\n\n${accumulated}` : file.instructions;
        break;
      default:
        // Add this file's instructions after accumulated
        accumulated = accumulated ? `${accumulated}\n\n${file.instructions}` : file.instructions;
        break;
    }
  }

  return accumulated.trim();
}

// =============================================================================
// Resolver Class
// =============================================================================

/**
 * Resolves AGENTS.md scopes for target files.
 */
export class AgentsMdResolver {
  private readonly tree: AgentsMdTree;

  constructor(tree: AgentsMdTree) {
    this.tree = tree;
  }

  /**
   * Resolve the applicable scope for a target file.
   *
   * @param targetPath - Absolute path to the target file
   * @returns Resolved scope with merged instructions
   */
  resolve(targetPath: string): AgentsMdScope {
    const normalizedPath = path.resolve(targetPath);
    const applicableFiles = findApplicableFiles(normalizedPath, this.tree);
    const instructions = mergeInstructions(applicableFiles);

    return {
      instructions,
      sources: applicableFiles,
      targetPath: normalizedPath,
    };
  }

  /**
   * Get formatted instructions for a target file.
   *
   * @param targetPath - Absolute path to the target file
   * @returns Instructions string with source attribution
   */
  getInstructionsFor(targetPath: string): string {
    const scope = this.resolve(targetPath);

    if (!scope.instructions) {
      return "";
    }

    // Add source attribution
    if (scope.sources.length > 0) {
      const sourcesList = scope.sources.map((f) => f.path).join(", ");
      return `<!-- AGENTS.md Sources: ${sourcesList} -->\n\n${scope.instructions}`;
    }

    return scope.instructions;
  }

  /**
   * Check if a target file has any applicable AGENTS.md files.
   *
   * @param targetPath - Path to check
   * @returns True if any AGENTS.md files apply
   */
  hasScope(targetPath: string): boolean {
    const applicableFiles = findApplicableFiles(path.resolve(targetPath), this.tree);
    return applicableFiles.length > 0;
  }

  /**
   * Get all AGENTS.md files that apply to a target.
   *
   * @param targetPath - Path to check
   * @returns Array of applicable files
   */
  getApplicableFiles(targetPath: string): AgentsMdFile[] {
    return findApplicableFiles(path.resolve(targetPath), this.tree);
  }
}
