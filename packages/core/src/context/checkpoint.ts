/**
 * Checkpoint Manager - Point-in-time context snapshots with rollback support
 *
 * Provides checkpoint creation and rollback functionality for context management:
 * - Deep copy messages to preserve state at checkpoint time
 * - LRU eviction when maxCheckpoints limit is reached
 * - Interval-based automatic checkpoint support
 * - Full rollback to any previous checkpoint with cleanup
 *
 * Requirements covered:
 * - REQ-CPT-001: Pre-compression checkpoints with deep copy
 * - REQ-CPT-002: Interval-based automatic checkpoints
 * - REQ-CPT-003: Checkpoint rollback with subsequent cleanup
 *
 * @module @vellum/core/context
 */

import type { ContentBlock, ContextMessage } from "./types.js";

// ============================================================================
// Checkpoint Types
// ============================================================================

/**
 * A checkpoint representing a point-in-time snapshot of messages.
 *
 * Checkpoints are created before destructive operations (compression, truncation)
 * to enable rollback if the operation fails or produces unsatisfactory results.
 *
 * @example
 * ```typescript
 * const checkpoint: Checkpoint = {
 *   id: 'chk_abc123',
 *   messages: [...deepCopiedMessages],
 *   createdAt: Date.now(),
 *   label: 'Pre-compression backup',
 *   tokenCount: 85000,
 *   reason: 'pre-compression',
 * };
 * ```
 */
export interface Checkpoint {
  /** Unique checkpoint identifier */
  readonly id: string;

  /** Deep copy of messages at checkpoint time (no shared references) */
  readonly messages: ContextMessage[];

  /** Unix timestamp when checkpoint was created */
  readonly createdAt: number;

  /** Optional human-readable label for the checkpoint */
  readonly label?: string;

  /** Token count of messages at checkpoint time */
  readonly tokenCount: number;

  /** Reason for checkpoint creation (e.g., 'pre-compression', 'interval', 'user-request') */
  readonly reason?: string;
}

/**
 * Configuration options for the CheckpointManager.
 *
 * @example
 * ```typescript
 * const options: CheckpointManagerOptions = {
 *   maxCheckpoints: 10,
 *   minCheckpointInterval: 60_000, // 1 minute
 *   autoCheckpoint: true,
 * };
 * ```
 */
export interface CheckpointManagerOptions {
  /**
   * Maximum number of checkpoints to retain.
   * When exceeded, oldest checkpoint is evicted (LRU).
   * @default 5
   */
  maxCheckpoints?: number;

  /**
   * Minimum interval between automatic checkpoints in milliseconds.
   * Prevents checkpoint spam during rapid operations.
   * @default 300_000 (5 minutes)
   */
  minCheckpointInterval?: number;

  /**
   * Whether to enable automatic checkpoint creation.
   * When enabled, checkpoints are created based on interval and triggers.
   * @default true
   */
  autoCheckpoint?: boolean;
}

/**
 * Result of a rollback operation.
 *
 * Contains the restored state and metadata about what was affected.
 */
export interface RollbackResult {
  /** Restored messages from the checkpoint (deep copy) */
  readonly messages: ContextMessage[];

  /** The checkpoint that was restored */
  readonly checkpoint: Checkpoint;

  /** Number of checkpoints that were removed (created after target) */
  readonly removedCheckpoints: number;

  /** Number of messages that were discarded from current state */
  readonly discardedMessages: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_MAX_CHECKPOINTS = 5;
const DEFAULT_MIN_CHECKPOINT_INTERVAL = 5 * 60 * 1000; // 5 minutes
const DEFAULT_AUTO_CHECKPOINT = true;

// ============================================================================
// Checkpoint Manager
// ============================================================================

/**
 * Checkpoint manager with LRU eviction and rollback support.
 *
 * Manages point-in-time snapshots of context messages for recovery purposes.
 * Uses deep copying to ensure checkpoint isolation from live message state.
 *
 * Features:
 * - Deep copy messages to preserve state independently
 * - LRU eviction when maxCheckpoints is exceeded
 * - Interval-based automatic checkpoint support
 * - Full rollback with automatic cleanup of later checkpoints
 *
 * @example
 * ```typescript
 * const manager = new CheckpointManager({ maxCheckpoints: 10 });
 *
 * // Create checkpoint before compression
 * const checkpoint = manager.create(messages, {
 *   reason: 'pre-compression',
 *   tokenCount: 85000,
 * });
 *
 * // If compression fails, rollback
 * const result = manager.rollback(checkpoint.id, currentMessages);
 * // result.messages contains the pre-compression state
 * ```
 */
export class CheckpointManager {
  /** Map of checkpoint ID to checkpoint data */
  private readonly checkpoints: Map<string, Checkpoint>;

  /** Ordered list of checkpoint IDs for LRU tracking (oldest first) */
  private checkpointOrder: string[];

  /** Resolved configuration options */
  private readonly options: Required<CheckpointManagerOptions>;

  /** Timestamp of last checkpoint creation */
  private lastCheckpointTime: number;

  /**
   * Create a new CheckpointManager instance.
   *
   * @param options - Configuration options
   */
  constructor(options?: CheckpointManagerOptions) {
    this.checkpoints = new Map();
    this.checkpointOrder = [];
    this.options = {
      maxCheckpoints: options?.maxCheckpoints ?? DEFAULT_MAX_CHECKPOINTS,
      minCheckpointInterval: options?.minCheckpointInterval ?? DEFAULT_MIN_CHECKPOINT_INTERVAL,
      autoCheckpoint: options?.autoCheckpoint ?? DEFAULT_AUTO_CHECKPOINT,
    };
    this.lastCheckpointTime = 0;
  }

  /**
   * Create a checkpoint of the current message state.
   *
   * Messages are deep-copied to ensure the checkpoint is independent
   * of any future modifications to the original messages.
   *
   * If the checkpoint limit is reached, the oldest checkpoint is evicted
   * before creating the new one (LRU policy).
   *
   * @param messages - Current message state to checkpoint
   * @param options - Optional label, reason, and token count
   * @returns The created checkpoint
   *
   * @example
   * ```typescript
   * const checkpoint = manager.create(messages, {
   *   label: 'Before tool pruning',
   *   reason: 'pre-compression',
   *   tokenCount: 85000,
   * });
   * ```
   */
  create(
    messages: ContextMessage[],
    options?: { label?: string; reason?: string; tokenCount?: number }
  ): Checkpoint {
    // Evict oldest if at capacity
    if (this.checkpoints.size >= this.options.maxCheckpoints) {
      this.evictOldest();
    }

    const id = generateCheckpointId();
    const now = Date.now();

    const checkpoint: Checkpoint = {
      id,
      messages: this.deepCloneMessages(messages),
      createdAt: now,
      label: options?.label,
      tokenCount: options?.tokenCount ?? 0,
      reason: options?.reason,
    };

    this.checkpoints.set(id, checkpoint);
    this.checkpointOrder.push(id);
    this.lastCheckpointTime = now;

    return checkpoint;
  }

  /**
   * Rollback to a specific checkpoint.
   *
   * Restores the message state from the target checkpoint and removes
   * all checkpoints that were created after it (since they represent
   * states that no longer exist in the timeline).
   *
   * @param checkpointId - ID of the checkpoint to restore
   * @param currentMessages - Current messages (used to calculate discard count)
   * @returns Rollback result with restored messages, or throws if not found
   * @throws Error if checkpoint ID is not found
   *
   * @example
   * ```typescript
   * try {
   *   const result = manager.rollback('chk_abc123', currentMessages);
   *   console.log(`Restored ${result.messages.length} messages`);
   *   console.log(`Removed ${result.removedCheckpoints} later checkpoints`);
   * } catch (error) {
   *   console.error('Checkpoint not found');
   * }
   * ```
   */
  rollback(checkpointId: string, currentMessages: ContextMessage[]): RollbackResult {
    const checkpoint = this.checkpoints.get(checkpointId);
    if (!checkpoint) {
      throw new Error(`Checkpoint not found: ${checkpointId}`);
    }

    // Find index of target checkpoint in order list
    const targetIndex = this.checkpointOrder.indexOf(checkpointId);

    // Remove all checkpoints created after this one
    const checkpointsToRemove = this.checkpointOrder.slice(targetIndex + 1);
    for (const id of checkpointsToRemove) {
      this.checkpoints.delete(id);
    }

    // Update order list to only include checkpoints up to and including target
    this.checkpointOrder = this.checkpointOrder.slice(0, targetIndex + 1);

    return {
      messages: this.deepCloneMessages(checkpoint.messages),
      checkpoint,
      removedCheckpoints: checkpointsToRemove.length,
      discardedMessages: currentMessages.length - checkpoint.messages.length,
    };
  }

  /**
   * Get a specific checkpoint by ID.
   *
   * @param checkpointId - The checkpoint ID to retrieve
   * @returns The checkpoint if found, undefined otherwise
   */
  get(checkpointId: string): Checkpoint | undefined {
    return this.checkpoints.get(checkpointId);
  }

  /**
   * Get all checkpoints, ordered from newest to oldest.
   *
   * @returns Array of all checkpoints, newest first
   */
  list(): Checkpoint[] {
    // Return in reverse order (newest first)
    return [...this.checkpointOrder]
      .reverse()
      .map((id) => this.checkpoints.get(id)!)
      .filter(Boolean);
  }

  /**
   * Get the most recent checkpoint.
   *
   * @returns The latest checkpoint, or undefined if none exist
   */
  getLatest(): Checkpoint | undefined {
    if (this.checkpointOrder.length === 0) {
      return undefined;
    }
    const latestId = this.checkpointOrder[this.checkpointOrder.length - 1];
    return latestId ? this.checkpoints.get(latestId) : undefined;
  }

  /**
   * Check if an automatic checkpoint should be created based on the interval.
   *
   * Returns true if:
   * 1. Auto-checkpoint is enabled
   * 2. Enough time has passed since the last checkpoint
   *
   * @returns true if an auto-checkpoint should be created
   */
  shouldAutoCheckpoint(): boolean {
    if (!this.options.autoCheckpoint) {
      return false;
    }

    const now = Date.now();
    const elapsed = now - this.lastCheckpointTime;

    return elapsed >= this.options.minCheckpointInterval;
  }

  /**
   * Clear all checkpoints.
   *
   * Removes all stored checkpoints and resets the manager state.
   */
  clear(): void {
    this.checkpoints.clear();
    this.checkpointOrder = [];
    // Don't reset lastCheckpointTime - preserve timing for auto-checkpoint
  }

  /**
   * Get the current number of stored checkpoints.
   */
  get count(): number {
    return this.checkpoints.size;
  }

  /**
   * Deep clone an array of messages.
   *
   * Creates a complete independent copy of all messages and their content blocks,
   * ensuring no shared references between the original and cloned arrays.
   *
   * @param messages - Messages to clone
   * @returns Deep-cloned message array
   */
  private deepCloneMessages(messages: ContextMessage[]): ContextMessage[] {
    return messages.map((msg) => this.deepCloneMessage(msg));
  }

  /**
   * Deep clone a single message.
   *
   * @param message - Message to clone
   * @returns Deep-cloned message
   */
  private deepCloneMessage(message: ContextMessage): ContextMessage {
    return {
      id: message.id,
      role: message.role,
      content: this.deepCloneContent(message.content),
      priority: message.priority,
      tokens: message.tokens,
      isSummary: message.isSummary,
      condenseId: message.condenseId,
      condenseParent: message.condenseParent,
      truncationParent: message.truncationParent,
      createdAt: message.createdAt,
      metadata: message.metadata ? { ...message.metadata } : undefined,
    };
  }

  /**
   * Deep clone message content (string or content blocks).
   *
   * @param content - Content to clone
   * @returns Deep-cloned content
   */
  private deepCloneContent(content: string | ContentBlock[]): string | ContentBlock[] {
    if (typeof content === "string") {
      return content;
    }

    return content.map((block) => this.deepCloneContentBlock(block));
  }

  /**
   * Deep clone a single content block.
   *
   * @param block - Content block to clone
   * @returns Deep-cloned content block
   */
  private deepCloneContentBlock(block: ContentBlock): ContentBlock {
    switch (block.type) {
      case "text":
        return { type: "text", text: block.text };

      case "image":
        return {
          type: "image",
          source: {
            type: block.source.type,
            data: block.source.data,
            ...(block.source.media_type !== undefined && { media_type: block.source.media_type }),
          },
          mediaType: block.mediaType,
          ...(block.width !== undefined && { width: block.width }),
          ...(block.height !== undefined && { height: block.height }),
        };

      case "tool_use":
        return {
          type: "tool_use",
          id: block.id,
          name: block.name,
          // Deep clone input object
          input: JSON.parse(JSON.stringify(block.input)),
        };

      case "tool_result":
        return {
          type: "tool_result",
          tool_use_id: block.tool_use_id,
          content:
            typeof block.content === "string"
              ? block.content
              : block.content.map((c) => this.deepCloneContentBlock(c)),
          ...(block.is_error !== undefined && { is_error: block.is_error }),
          ...(block.compactedAt !== undefined && { compactedAt: block.compactedAt }),
        };

      default: {
        // Type assertion for exhaustiveness check
        const _exhaustive: never = block;
        throw new Error(`Unknown content block type: ${(_exhaustive as ContentBlock).type}`);
      }
    }
  }

  /**
   * Evict the oldest checkpoint (LRU policy).
   *
   * Called when checkpoint limit is reached before creating a new one.
   */
  private evictOldest(): void {
    if (this.checkpointOrder.length === 0) {
      return;
    }

    const oldestId = this.checkpointOrder.shift();
    if (oldestId) {
      this.checkpoints.delete(oldestId);
    }
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/** Counter for unique checkpoint ID generation */
let checkpointCounter = 0;

/**
 * Generate a unique checkpoint ID.
 *
 * Format: `chk_<timestamp>_<counter>`
 *
 * @returns Unique checkpoint identifier
 *
 * @example
 * ```typescript
 * const id = generateCheckpointId();
 * // 'chk_1703784000000_1'
 * ```
 */
export function generateCheckpointId(): string {
  checkpointCounter += 1;
  return `chk_${Date.now()}_${checkpointCounter}`;
}

/**
 * Reset the checkpoint ID counter.
 *
 * Primarily used for testing to ensure deterministic IDs.
 *
 * @internal
 */
export function resetCheckpointCounter(): void {
  checkpointCounter = 0;
}

/**
 * Create a pre-compression checkpoint.
 *
 * Convenience wrapper for the common use case of creating a checkpoint
 * before running compression operations.
 *
 * @param manager - The checkpoint manager to use
 * @param messages - Current messages to checkpoint
 * @param tokenCount - Current token count
 * @returns The created checkpoint
 *
 * @example
 * ```typescript
 * const checkpoint = createPreCompressionCheckpoint(
 *   checkpointManager,
 *   messages,
 *   85000
 * );
 * // Now safe to run compression
 * ```
 */
export function createPreCompressionCheckpoint(
  manager: CheckpointManager,
  messages: ContextMessage[],
  tokenCount: number
): Checkpoint {
  return manager.create(messages, {
    label: "Pre-compression backup",
    reason: "pre-compression",
    tokenCount,
  });
}
