// ============================================
// Checkpoint-Snapshot Integration (T026)
// ============================================

/**
 * Integration between session checkpoints and file snapshots.
 *
 * Provides atomic checkpoint creation with file state tracking,
 * rollback with file restoration, and diff capabilities.
 *
 * @module @vellum/core/session/checkpoint-snapshot
 */

import type { PersistenceManager } from "./persistence.js";
import { type DiffResult, Snapshot, SnapshotError, SnapshotErrorCode } from "./snapshot.js";
import {
  addCheckpoint,
  type CreateCheckpointOptions,
  createCheckpoint,
  type Session,
  type SessionCheckpoint,
} from "./types.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Checkpoint with a guaranteed snapshot hash.
 * Extends SessionCheckpoint but makes snapshotHash required.
 */
export interface CheckpointWithSnapshot extends Omit<SessionCheckpoint, "snapshotHash"> {
  /** Git snapshot hash for workspace state (required) */
  snapshotHash: string;
}

/**
 * Result of a rollback operation with snapshot restoration.
 */
export interface RollbackWithSnapshotResult {
  /** The checkpoint that was rolled back to */
  checkpoint: SessionCheckpoint;
  /** List of files that were restored (empty if no snapshot) */
  restoredFiles: string[];
}

/**
 * Options for creating a checkpoint with snapshot.
 */
export interface CreateCheckpointWithSnapshotOptions {
  /** Optional checkpoint ID (auto-generated if not provided) */
  id?: string;
  /** Checkpoint description */
  description?: string;
  /** Specific files to track (empty = all changed files) */
  files?: string[];
  /** Custom commit message for the snapshot */
  snapshotMessage?: string;
}

// =============================================================================
// Functions
// =============================================================================

/**
 * Creates a checkpoint with an associated file snapshot.
 *
 * This function atomically:
 * 1. Tracks current file state with Snapshot.track()
 * 2. Creates a checkpoint in the session
 * 3. Stores the snapshot hash in the checkpoint
 *
 * If snapshot tracking fails (e.g., Git not available), the checkpoint
 * is still created but without a snapshot hash.
 *
 * @param persistence - The PersistenceManager instance
 * @param workingDir - The working directory to snapshot
 * @param options - Optional configuration
 * @returns The created checkpoint with snapshot hash (if successful)
 *
 * @example
 * ```typescript
 * const checkpoint = await createCheckpointWithSnapshot(
 *   persistence,
 *   "/path/to/project",
 *   { description: "Before refactoring" }
 * );
 * if (checkpoint.snapshotHash) {
 *   console.log("Files tracked at:", checkpoint.snapshotHash);
 * }
 * ```
 */
export async function createCheckpointWithSnapshot(
  persistence: PersistenceManager,
  workingDir: string,
  options: CreateCheckpointWithSnapshotOptions = {}
): Promise<SessionCheckpoint> {
  const session = persistence.currentSession;
  if (!session) {
    throw new Error("No active session. Call newSession() or loadSession() first.");
  }

  // Try to create snapshot first
  let snapshotHash: string | undefined;

  // Check if shadow repo is initialized
  const isInitialized = await Snapshot.isInitialized(workingDir);

  if (isInitialized) {
    // Track files to create snapshot
    const trackResult = await Snapshot.track(
      workingDir,
      options.files ?? [],
      options.snapshotMessage ?? options.description
    );

    if (trackResult.ok) {
      snapshotHash = trackResult.value;
    }
    // If tracking fails, we continue without snapshot (graceful degradation)
  }

  // Create checkpoint options
  const checkpointOptions: CreateCheckpointOptions = {
    id: options.id,
    description: options.description,
    snapshotHash,
  };

  // Create and add checkpoint to session
  const checkpoint = createCheckpoint(session, checkpointOptions);
  const updatedSession = addCheckpoint(session, checkpoint);

  // Update persistence with new session state
  // We need to update the internal session and save
  await updateSessionAndSave(persistence, updatedSession);

  return checkpoint;
}

/**
 * Rolls back the session to a checkpoint and optionally restores files.
 *
 * This function:
 * 1. Rolls back the session to the specified checkpoint
 * 2. If the checkpoint has a snapshotHash, restores files using Snapshot.restore()
 * 3. Returns the checkpoint and list of restored files
 *
 * If the checkpoint has no snapshot hash or file restoration fails,
 * the session rollback still succeeds.
 *
 * @param persistence - The PersistenceManager instance
 * @param checkpointId - The ID of the checkpoint to rollback to
 * @param workingDir - The working directory for file restoration
 * @returns The checkpoint and list of restored files
 * @throws Error if checkpoint not found or no active session
 *
 * @example
 * ```typescript
 * const result = await rollbackWithSnapshot(persistence, checkpointId, "/path/to/project");
 * console.log("Rolled back to:", result.checkpoint.description);
 * console.log("Restored files:", result.restoredFiles);
 * ```
 */
export async function rollbackWithSnapshot(
  persistence: PersistenceManager,
  checkpointId: string,
  workingDir: string
): Promise<RollbackWithSnapshotResult> {
  const session = persistence.currentSession;
  if (!session) {
    throw new Error("No active session. Call newSession() or loadSession() first.");
  }

  // Find checkpoint by ID
  const checkpoint = session.checkpoints.find((cp: SessionCheckpoint) => cp.id === checkpointId);
  if (!checkpoint) {
    throw new Error(`Checkpoint not found: ${checkpointId}`);
  }

  // Perform session rollback
  const rollbackSuccess = await persistence.rollbackToCheckpoint(checkpointId);
  if (!rollbackSuccess) {
    throw new Error(`Failed to rollback to checkpoint: ${checkpointId}`);
  }

  // Track restored files
  let restoredFiles: string[] = [];

  // If checkpoint has snapshot hash, restore files
  if (checkpoint.snapshotHash) {
    const isInitialized = await Snapshot.isInitialized(workingDir);

    if (isInitialized) {
      const restoreResult = await Snapshot.restore(workingDir, checkpoint.snapshotHash);

      if (restoreResult.ok) {
        restoredFiles = restoreResult.value;
      }
      // If restore fails, we continue without file restoration (graceful degradation)
    }
  }

  return {
    checkpoint,
    restoredFiles,
  };
}

/**
 * Gets the diff between current file state and a checkpoint's snapshot.
 *
 * @param persistence - The PersistenceManager instance
 * @param checkpointId - The ID of the checkpoint to diff against
 * @param workingDir - The working directory to compare
 * @returns DiffResult with added, modified, deleted files and patch
 * @throws Error if checkpoint not found, has no snapshot, or diff fails
 *
 * @example
 * ```typescript
 * const diff = await getCheckpointDiff(persistence, checkpointId, "/path/to/project");
 * console.log("Added files:", diff.added);
 * console.log("Modified files:", diff.modified);
 * console.log("Deleted files:", diff.deleted);
 * ```
 */
export async function getCheckpointDiff(
  persistence: PersistenceManager,
  checkpointId: string,
  workingDir: string
): Promise<DiffResult> {
  const session = persistence.currentSession;
  if (!session) {
    throw new Error("No active session. Call newSession() or loadSession() first.");
  }

  // Find checkpoint by ID
  const checkpoint = session.checkpoints.find((cp: SessionCheckpoint) => cp.id === checkpointId);
  if (!checkpoint) {
    throw new Error(`Checkpoint not found: ${checkpointId}`);
  }

  // Check if checkpoint has snapshot hash
  if (!checkpoint.snapshotHash) {
    throw new Error(`Checkpoint ${checkpointId} has no associated snapshot`);
  }

  // Check if shadow repo is initialized
  const isInitialized = await Snapshot.isInitialized(workingDir);
  if (!isInitialized) {
    throw new SnapshotError(
      `Shadow repository not initialized in: ${workingDir}. Call Snapshot.init() first.`,
      SnapshotErrorCode.NOT_INITIALIZED
    );
  }

  // Get diff summary
  const diffResult = await Snapshot.getDiffSummary(workingDir, checkpoint.snapshotHash);

  if (!diffResult.ok) {
    throw diffResult.error;
  }

  return diffResult.value;
}

/**
 * Checks if a checkpoint has an associated snapshot.
 *
 * @param checkpoint - The checkpoint to check
 * @returns True if checkpoint has a snapshot hash
 */
export function hasSnapshot(checkpoint: SessionCheckpoint): checkpoint is CheckpointWithSnapshot {
  return typeof checkpoint.snapshotHash === "string" && checkpoint.snapshotHash.length > 0;
}

/**
 * Gets all checkpoints that have associated snapshots.
 *
 * @param persistence - The PersistenceManager instance
 * @returns Array of checkpoints with snapshot hashes
 */
export function getCheckpointsWithSnapshots(
  persistence: PersistenceManager
): CheckpointWithSnapshot[] {
  const checkpoints = persistence.getCheckpoints();
  return checkpoints.filter(hasSnapshot);
}

// =============================================================================
// Internal Helpers
// =============================================================================

/**
 * Internal interface for accessing PersistenceManager's private session state.
 * Used for atomic checkpoint+snapshot coordination.
 */
interface PersistenceManagerInternal {
  _currentSession: Session | null;
}

/**
 * Updates the persistence manager's internal session and saves.
 * This is a workaround since PersistenceManager doesn't expose direct session update.
 */
async function updateSessionAndSave(
  persistence: PersistenceManager,
  updatedSession: Session
): Promise<void> {
  // Access internal state - this is a bit of a hack but necessary
  // to coordinate checkpoint and snapshot atomically
  const pm = persistence as unknown as PersistenceManagerInternal;

  if (pm._currentSession) {
    pm._currentSession = updatedSession;
    await persistence.save();
  }
}
