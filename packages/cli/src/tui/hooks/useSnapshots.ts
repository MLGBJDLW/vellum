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
  const [stateDir, setStateDir] = useState(resolvedDir);

  // Ref to track if we're mounted
  const mountedRef = useRef(true);
  const activeDirRef = useRef(resolvedDir);
  activeDirRef.current = resolvedDir;
  const refreshRequestRef = useRef(0);
  const isCurrent = useCallback(
    () => mountedRef.current && activeDirRef.current === resolvedDir,
    [resolvedDir]
  );

  /**
   * Initialize the snapshot system.
   */
  const initialize = useCallback(async (): Promise<boolean> => {
    if (!isCurrent()) return false;
    try {
      const result = await Snapshot.init(resolvedDir);
      if (result.ok) {
        if (isCurrent()) {
          setIsInitialized(true);
        }
        return true;
      }
      if (isCurrent()) {
        setError(result.error.message);
      }
      return false;
    } catch (err) {
      if (isCurrent()) {
        setError(err instanceof Error ? err.message : "Failed to initialize snapshots");
      }
      return false;
    }
  }, [resolvedDir, isCurrent]);

  /**
   * Refresh the list of snapshots.
   */
  const refresh = useCallback(async (): Promise<void> => {
    if (!isCurrent()) return;
    const request = ++refreshRequestRef.current;
    const canPublish = () => isCurrent() && request === refreshRequestRef.current;

    setIsLoading(true);
    setError(null);

    try {
      // Check if initialized
      const initialized = await Snapshot.isInitialized(resolvedDir);
      if (!canPublish()) return;
      if (!initialized) {
        if (canPublish()) {
          setSnapshots([]);
          setIsInitialized(false);
          setIsLoading(false);
        }
        return;
      }

      if (canPublish()) {
        setIsInitialized(true);
      }

      // List snapshots
      const result = await Snapshot.listSnapshots(resolvedDir);

      if (!canPublish()) return;

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
      if (canPublish()) {
        setError(err instanceof Error ? err.message : "Failed to load snapshots");
      }
    } finally {
      if (canPublish()) {
        setIsLoading(false);
      }
    }
  }, [resolvedDir, isCurrent]);

  /**
   * Restore files to a specific snapshot.
   */
  const restore = useCallback(
    async (hash: string): Promise<RestoreResult> => {
      if (!isCurrent()) return { success: false, files: [], error: "Workspace changed" };
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
    [resolvedDir, refresh, isCurrent]
  );

  /**
   * Get diff between current state and a snapshot.
   */
  const diff = useCallback(
    async (hash: string): Promise<string> => {
      if (!isCurrent()) return "Workspace changed";
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
    [resolvedDir, isCurrent]
  );

  /**
   * Take a new snapshot.
   */
  const take = useCallback(
    async (message?: string): Promise<string> => {
      if (!isCurrent()) throw new Error("Workspace changed");
      try {
        // Ensure initialized
        const initialized = await Snapshot.isInitialized(resolvedDir);
        if (!isCurrent()) throw new Error("Workspace changed");
        if (!initialized) {
          const initResult = await Snapshot.init(resolvedDir);
          if (!initResult.ok) {
            throw new SnapshotError(initResult.error.message, SnapshotErrorCode.OPERATION_FAILED);
          }
          if (isCurrent()) {
            setIsInitialized(true);
          }
        }

        // Track all files
        if (!isCurrent()) throw new Error("Workspace changed");
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
    [resolvedDir, refresh, isCurrent]
  );

  // Initial load
  useEffect(() => {
    mountedRef.current = true;
    setStateDir(resolvedDir);
    setSnapshots([]);
    setIsInitialized(false);
    setError(null);
    void refresh();

    return () => {
      mountedRef.current = false;
      refreshRequestRef.current += 1;
    };
  }, [refresh, resolvedDir]);

  return {
    snapshots: stateDir === resolvedDir ? snapshots : [],
    isLoading: stateDir === resolvedDir ? isLoading : true,
    error: stateDir === resolvedDir ? error : null,
    isInitialized: stateDir === resolvedDir && isInitialized,
    refresh,
    restore,
    diff,
    take,
    initialize,
  };
}
