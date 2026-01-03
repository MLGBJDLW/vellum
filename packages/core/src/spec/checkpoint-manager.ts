// ============================================
// Spec Workflow Checkpoint Manager
// ============================================

/**
 * Checkpoint persistence for spec workflow state.
 *
 * Manages saving, loading, and pruning of workflow checkpoints
 * to enable resume and recovery functionality.
 *
 * @module @vellum/core/spec/checkpoint-manager
 */

import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createId } from "@vellum/shared";
import { z } from "zod";
import { type SpecPhase, type SpecWorkflowState, SpecWorkflowStateSchema } from "./types.js";

// =============================================================================
// Constants
// =============================================================================

/**
 * Directory name for checkpoint storage within the spec directory.
 */
export const CHECKPOINT_DIR = ".checkpoints";

/**
 * Default number of checkpoints to keep when pruning.
 */
export const DEFAULT_KEEP_COUNT = 5;

// =============================================================================
// Checkpoint Types and Schemas
// =============================================================================

/**
 * Reason for creating a checkpoint.
 *
 * - `phase_complete`: Automatic checkpoint after phase completion
 * - `user_pause`: User-initiated pause
 * - `error_recovery`: Checkpoint before error handling
 * - `handoff`: Checkpoint for agent handoff
 */
export const CheckpointReasonSchema = z.enum([
  "phase_complete",
  "user_pause",
  "error_recovery",
  "handoff",
]);

export type CheckpointReason = z.infer<typeof CheckpointReasonSchema>;

/**
 * A workflow checkpoint containing the full state.
 */
export const CheckpointSchema = z.object({
  /** Unique checkpoint identifier */
  id: z.string(),
  /** The workflow state at this checkpoint */
  workflowState: SpecWorkflowStateSchema,
  /** Why this checkpoint was created */
  reason: CheckpointReasonSchema,
  /** When this checkpoint was created */
  createdAt: z.coerce.date(),
  /** Additional metadata */
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type Checkpoint = z.infer<typeof CheckpointSchema>;

// =============================================================================
// Checkpoint Manager Class
// =============================================================================

/**
 * Manages checkpoint persistence for spec workflows.
 *
 * Provides save, load, list, and prune operations for
 * workflow state checkpoints.
 *
 * @example
 * ```typescript
 * const manager = new CheckpointManager("/path/to/spec");
 *
 * // Save a checkpoint
 * const checkpoint = await manager.save(state, "phase_complete");
 *
 * // Load latest checkpoint
 * const latest = await manager.loadLatest();
 *
 * // Resume from a specific phase
 * const phaseCheckpoint = await manager.loadFromPhase("design");
 * ```
 */
export class CheckpointManager {
  private readonly checkpointPath: string;

  /**
   * Creates a new CheckpointManager instance.
   *
   * @param specDir - The spec directory path
   */
  constructor(specDir: string) {
    this.checkpointPath = join(specDir, CHECKPOINT_DIR);
  }

  /**
   * Saves a checkpoint of the current workflow state.
   *
   * Creates a new checkpoint file with timestamp-based naming.
   *
   * @param state - The workflow state to checkpoint
   * @param reason - Why this checkpoint is being created
   * @param metadata - Optional additional metadata
   * @returns The created checkpoint
   */
  async save(
    state: SpecWorkflowState,
    reason: CheckpointReason,
    metadata?: Record<string, unknown>
  ): Promise<Checkpoint> {
    await this.ensureCheckpointDir();

    const now = new Date();
    const checkpoint: Checkpoint = {
      id: createId(),
      workflowState: state,
      reason,
      createdAt: now,
      metadata,
    };

    const filename = this.buildFilename(state.currentPhase, now);
    const filepath = join(this.checkpointPath, filename);

    await writeFile(filepath, JSON.stringify(checkpoint, null, 2), "utf-8");

    return checkpoint;
  }

  /**
   * Loads the most recent checkpoint.
   *
   * @returns The latest checkpoint, or null if none exist
   */
  async loadLatest(): Promise<Checkpoint | null> {
    const checkpoints = await this.list();
    if (checkpoints.length === 0) {
      return null;
    }

    // Sort by createdAt descending
    checkpoints.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return checkpoints[0] ?? null;
  }

  /**
   * Loads the most recent checkpoint for a specific phase.
   *
   * @param phase - The phase to find a checkpoint for
   * @returns The checkpoint for that phase, or null if none exist
   */
  async loadFromPhase(phase: SpecPhase): Promise<Checkpoint | null> {
    const checkpoints = await this.list();

    // Filter to checkpoints for this phase
    const phaseCheckpoints = checkpoints.filter((cp) => cp.workflowState.currentPhase === phase);

    if (phaseCheckpoints.length === 0) {
      return null;
    }

    // Sort by createdAt descending
    phaseCheckpoints.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return phaseCheckpoints[0] ?? null;
  }

  /**
   * Lists all available checkpoints.
   *
   * @returns Array of all checkpoints, unsorted
   */
  async list(): Promise<Checkpoint[]> {
    try {
      const files = await readdir(this.checkpointPath);
      const checkpointFiles = files.filter(
        (f) => f.startsWith("checkpoint-") && f.endsWith(".json")
      );

      const checkpoints: Checkpoint[] = [];

      for (const file of checkpointFiles) {
        try {
          const filepath = join(this.checkpointPath, file);
          const content = await readFile(filepath, "utf-8");
          const data = JSON.parse(content);
          const checkpoint = CheckpointSchema.parse(data);
          checkpoints.push(checkpoint);
        } catch {}
      }

      return checkpoints;
    } catch (error) {
      // Directory doesn't exist or other read error
      if (this.isNodeError(error) && error.code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  /**
   * Prunes old checkpoints, keeping only the most recent ones.
   *
   * @param keepCount - Number of checkpoints to keep (default: 5)
   * @returns Number of checkpoints deleted
   */
  async prune(keepCount: number = DEFAULT_KEEP_COUNT): Promise<number> {
    const checkpoints = await this.list();

    if (checkpoints.length <= keepCount) {
      return 0;
    }

    // Sort by createdAt descending (newest first)
    checkpoints.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // Get checkpoints to delete (all after keepCount)
    const toDelete = checkpoints.slice(keepCount);
    let deletedCount = 0;

    for (const checkpoint of toDelete) {
      try {
        const filename = await this.findCheckpointFile(checkpoint.id);
        if (filename) {
          await rm(join(this.checkpointPath, filename));
          deletedCount++;
        }
      } catch {}
    }

    return deletedCount;
  }

  /**
   * Deletes a specific checkpoint by ID.
   *
   * @param checkpointId - The checkpoint ID to delete
   * @returns `true` if deleted, `false` if not found
   */
  async delete(checkpointId: string): Promise<boolean> {
    const filename = await this.findCheckpointFile(checkpointId);
    if (!filename) {
      return false;
    }

    await rm(join(this.checkpointPath, filename));
    return true;
  }

  /**
   * Ensures the checkpoint directory exists.
   */
  private async ensureCheckpointDir(): Promise<void> {
    await mkdir(this.checkpointPath, { recursive: true });
  }

  /**
   * Builds a checkpoint filename.
   *
   * @param phase - The current phase
   * @param timestamp - The checkpoint timestamp
   * @returns Formatted filename
   */
  private buildFilename(phase: SpecPhase, timestamp: Date): string {
    const ts = timestamp.toISOString().replace(/[:.]/g, "-");
    return `checkpoint-${phase}-${ts}.json`;
  }

  /**
   * Finds the filename for a checkpoint by ID.
   *
   * @param checkpointId - The checkpoint ID to find
   * @returns The filename, or null if not found
   */
  private async findCheckpointFile(checkpointId: string): Promise<string | null> {
    try {
      const files = await readdir(this.checkpointPath);

      for (const file of files) {
        if (!file.startsWith("checkpoint-") || !file.endsWith(".json")) {
          continue;
        }

        try {
          const filepath = join(this.checkpointPath, file);
          const content = await readFile(filepath, "utf-8");
          const data = JSON.parse(content);
          if (data.id === checkpointId) {
            return file;
          }
        } catch {}
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Type guard for Node.js errors with code property.
   */
  private isNodeError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && "code" in error;
  }
}
