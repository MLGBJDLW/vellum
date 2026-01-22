/**
 * useSnapshots Hook
 *
 * Provides access to the Snapshot system for managing file state checkpoints.
 * Uses the shadow Git repository in .vellum/.git-shadow/ for tracking.
 *
 * @module tui/hooks/useSnapshots
 */

import { Snapshot, SnapshotError, SnapshotErrorCode, type SnapshotInfo } from "@vellum/core";
import { useCallback, useEffect, useRef, useState } from "react";

// =============================================================================
// Types
// =============================================================================

/**
 * Result of a restore operation.
 */
export interface RestoreResult {
  /** Whether the restore succeeded */
  readonly success: boolean;
  /** List of files restored */
  readonly files: readonly string[];
  /** Error message if failed */
  readonly error?: string;
}

/**
 * Return type for the useSnapshots hook.
 */
export interface UseSnapshotsResult {
  /** List of available snapshots (newest first) */
  readonly snapshots: readonly SnapshotInfo[];
  /** Whether snapshots are currently loading */
  readonly isLoading: boolean;
  /** Error message if any operation failed */
  readonly error: string | null;
  /** Whether the snapshot system is initialized */
  readonly isInitialized: boolean;
  /** Refresh the list of snapshots */
  readonly refresh: () => Promise<void>;
  /** Restore files to a specific snapshot */
  readonly restore: (hash: string) => Promise<RestoreResult>;
  /** Get diff between current state and a snapshot */
  readonly diff: (hash: string) => Promise<string>;
  /** Take a new snapshot */
  readonly take: (message?: string) => Promise<string>;
  /** Initialize the snapshot system if needed */
  readonly initialize: () => Promise<boolean>;
}

// =============================================================================
// Constants
// =============================================================================

/** Maximum number of snapshots to show */
const MAX_SNAPSHOTS = 10;

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * Hook for managing file state snapshots.
 *
 * Provides methods to list, create, restore, and diff snapshots.
 * The snapshot system uses a shadow Git repository to track file states
 * independently of the user's main repository.
 *
 * @param workingDir - The working directory path (defaults to cwd)
 * @returns Snapshot management functions and state
 *
 * @example
 * ```tsx
 * function SnapshotPanel() {
 *   const {
 *     snapshots,
 *     isLoading,
 *     error,
 *     refresh,
 *     restore,
 *     take
 *   } = useSnapshots();
 *
 *   if (isLoading) return <Text>Loading...</Text>;
 *
 *   return (
 *     <Box flexDirection="column">
 *       {snapshots.map(s => (
 *         <Text key={s.hash}>{s.hash.slice(0, 7)} - {s.message}</Text>
 *       ))}
 *     </Box>
 *   );
 * }
 * ```
 */
export function useSnapshots(workingDir?: string): UseSnapshotsResult {
  const resolvedDir = workingDir ?? process.cwd();

  // State
  const [snapshots, setSnapshots] = useState<readonly SnapshotInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Ref to track if we're mounted
  const mountedRef = useRef(true);

  /**
   * Initialize the snapshot system.
   */
  const initialize = useCallback(async (): Promise<boolean> => {
    try {
      const result = await Snapshot.init(resolvedDir);
      if (result.ok) {
        if (mountedRef.current) {
          setIsInitialized(true);
        }
        return true;
      }
      if (mountedRef.current) {
        setError(result.error.message);
      }
      return false;
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : "Failed to initialize snapshots");
      }
      return false;
    }
  }, [resolvedDir]);

  /**
   * Refresh the list of snapshots.
   */
  const refresh = useCallback(async (): Promise<void> => {
    if (!mountedRef.current) return;

    setIsLoading(true);
    setError(null);

    try {
      // Check if initialized
      const initialized = await Snapshot.isInitialized(resolvedDir);
      if (!initialized) {
        if (mountedRef.current) {
          setSnapshots([]);
          setIsInitialized(false);
          setIsLoading(false);
        }
        return;
      }

      if (mountedRef.current) {
        setIsInitialized(true);
      }

      // List snapshots
      const result = await Snapshot.listSnapshots(resolvedDir);

      if (!mountedRef.current) return;

      if (result.ok) {
        // Limit to MAX_SNAPSHOTS
        setSnapshots(result.value.slice(0, MAX_SNAPSHOTS));
      } else {
        // Handle not initialized error gracefully
        if (result.error.code === SnapshotErrorCode.NOT_INITIALIZED) {
          setSnapshots([]);
          setIsInitialized(false);
        } else {
          setError(result.error.message);
        }
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : "Failed to load snapshots");
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [resolvedDir]);

  /**
   * Restore files to a specific snapshot.
   */
  const restore = useCallback(
    async (hash: string): Promise<RestoreResult> => {
      try {
        const result = await Snapshot.restore(resolvedDir, hash);

        if (result.ok) {
          // Refresh after successful restore
          void refresh();
          return {
            success: true,
            files: result.value,
          };
        }

        return {
          success: false,
          files: [],
          error: result.error.message,
        };
      } catch (err) {
        return {
          success: false,
          files: [],
          error: err instanceof Error ? err.message : "Failed to restore snapshot",
        };
      }
    },
    [resolvedDir, refresh]
  );

  /**
   * Get diff between current state and a snapshot.
   */
  const diff = useCallback(
    async (hash: string): Promise<string> => {
      try {
        const result = await Snapshot.diff(resolvedDir, hash);

        if (result.ok) {
          return result.value || "(no changes)";
        }

        return `Error: ${result.error.message}`;
      } catch (err) {
        return `Error: ${err instanceof Error ? err.message : "Failed to get diff"}`;
      }
    },
    [resolvedDir]
  );

  /**
   * Take a new snapshot.
   */
  const take = useCallback(
    async (message?: string): Promise<string> => {
      try {
        // Ensure initialized
        const initialized = await Snapshot.isInitialized(resolvedDir);
        if (!initialized) {
          const initResult = await Snapshot.init(resolvedDir);
          if (!initResult.ok) {
            throw new SnapshotError(initResult.error.message, SnapshotErrorCode.OPERATION_FAILED);
          }
          if (mountedRef.current) {
            setIsInitialized(true);
          }
        }

        // Track all files
        const result = await Snapshot.track(resolvedDir, [], message ?? "Manual checkpoint");

        if (result.ok) {
          // Refresh after successful snapshot
          void refresh();
          return result.value;
        }

        throw new SnapshotError(result.error.message, result.error.code);
      } catch (err) {
        if (err instanceof SnapshotError) {
          throw err;
        }
        throw new Error(err instanceof Error ? err.message : "Failed to take snapshot");
      }
    },
    [resolvedDir, refresh]
  );

  // Initial load
  useEffect(() => {
    mountedRef.current = true;
    void refresh();

    return () => {
      mountedRef.current = false;
    };
  }, [refresh]);

  return {
    snapshots,
    isLoading,
    error,
    isInitialized,
    refresh,
    restore,
    diff,
    take,
    initialize,
  };
}
