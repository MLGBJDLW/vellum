/**
 * File Change Statistics Hook
 *
 * Aggregates diff metadata from tool executions to provide
 * cumulative statistics about file changes in the current session.
 *
 * @module tui/hooks/useFileChangeStats
 */

import { useMemo } from "react";
import { useTools } from "../context/ToolsContext.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Diff metadata from tool results (matches @vellum/core DiffMetadata)
 */
interface DiffMetadata {
  /** Unified diff string */
  diff: string;
  /** Number of lines added */
  additions: number;
  /** Number of lines deleted */
  deletions: number;
}

/**
 * Aggregated file change statistics
 */
export interface FileChangeStats {
  /** Total number of lines added across all files */
  readonly additions: number;
  /** Total number of lines deleted across all files */
  readonly deletions: number;
  /** Number of unique files modified */
  readonly filesModified: number;
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Type guard for DiffMetadata
 */
function isDiffMetadata(value: unknown): value is DiffMetadata {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.additions === "number" &&
    typeof obj.deletions === "number" &&
    typeof obj.diff === "string"
  );
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Aggregates file change statistics from completed tool executions.
 *
 * Extracts `diffMeta` from tool results and accumulates additions/deletions.
 * Also tracks unique file paths modified.
 *
 * @example
 * ```tsx
 * const { additions, deletions, filesModified } = useFileChangeStats();
 * // additions: 42, deletions: 15, filesModified: 3
 * ```
 */
export function useFileChangeStats(): FileChangeStats {
  const { executions } = useTools();

  return useMemo(() => {
    let additions = 0;
    let deletions = 0;
    const paths = new Set<string>();

    for (const exec of executions) {
      // Only count completed executions
      if (exec.status !== "complete") continue;

      // Tool results may have diffMeta
      const result = exec.result as Record<string, unknown> | undefined;
      if (!result) continue;

      // Extract diff metadata if present
      const diffMeta = result.diffMeta;
      if (isDiffMetadata(diffMeta)) {
        additions += diffMeta.additions;
        deletions += diffMeta.deletions;
      }

      // Track unique file paths
      const path = result.path;
      if (typeof path === "string" && path.length > 0) {
        paths.add(path);
      }
    }

    return {
      additions,
      deletions,
      filesModified: paths.size,
    };
  }, [executions]);
}
