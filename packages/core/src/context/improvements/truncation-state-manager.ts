/**
 * Truncation State Manager
 *
 * Provides recoverable truncation through snapshot storage.
 * Addresses P0-2: Truncation Recovery Mechanism.
 *
 * Features:
 * - Snapshot storage before truncation
 * - LRU eviction for memory management
 * - Optional zlib compression for large snapshots
 * - Recovery capability for truncated messages
 *
 * @module @vellum/core/context/improvements/truncation-state-manager
 */

import { deflateSync, inflateSync } from "node:zlib";

import type { ContextMessage } from "../types.js";
import type {
  TruncationReason,
  TruncationRecoveryOptions,
  TruncationSnapshot,
  TruncationState,
} from "./types.js";

// ============================================================================
// Constants
// ============================================================================

/** Default configuration for truncation recovery */
const DEFAULT_OPTIONS: TruncationRecoveryOptions = {
  maxSnapshots: 3,
  maxSnapshotSize: 1024 * 1024, // 1MB
  enableCompression: true,
  expirationMs: 30 * 60 * 1000, // 30 minutes
};

/** Compression level for zlib (1-9, higher = more compression) */
const COMPRESSION_LEVEL = 6;

// ============================================================================
// Compression Utilities
// ============================================================================

/**
 * Compress a string using zlib deflate.
 *
 * @param data - String to compress
 * @returns Compressed data as base64 string
 */
function compressData(data: string): string {
  const buffer = Buffer.from(data, "utf-8");
  const compressed = deflateSync(buffer, { level: COMPRESSION_LEVEL });
  return compressed.toString("base64");
}

/**
 * Decompress a base64-encoded zlib compressed string.
 *
 * @param compressedBase64 - Base64-encoded compressed data
 * @returns Original string
 */
function decompressData(compressedBase64: string): string {
  const buffer = Buffer.from(compressedBase64, "base64");
  const decompressed = inflateSync(buffer);
  return decompressed.toString("utf-8");
}

/**
 * Calculate byte size of a string.
 *
 * @param str - String to measure
 * @returns Size in bytes
 */
function getByteSize(str: string): number {
  return Buffer.byteLength(str, "utf-8");
}

// ============================================================================
// TruncationStateManager
// ============================================================================

/**
 * Manages truncation state with snapshot storage and recovery.
 *
 * Provides an LRU-based storage system for truncated messages,
 * allowing recovery of recently truncated content.
 *
 * @example
 * ```typescript
 * const manager = new TruncationStateManager({
 *   maxSnapshots: 3,
 *   maxSnapshotSize: 1024 * 1024,
 *   enableCompression: true,
 *   expirationMs: 30 * 60 * 1000,
 * });
 *
 * // Before truncation
 * const state = manager.saveSnapshot('trunc-1', messagesToTruncate, 'token_overflow');
 *
 * // Later, if needed
 * const recovered = manager.recover('trunc-1');
 * if (recovered) {
 *   console.log('Recovered', recovered.length, 'messages');
 * }
 * ```
 */
export class TruncationStateManager {
  private readonly options: TruncationRecoveryOptions;

  /**
   * LRU-ordered map of truncation states.
   * Most recently accessed entries are at the end.
   */
  private readonly states = new Map<string, TruncationState>();

  /**
   * Access order tracking for LRU eviction.
   * Higher index = more recently accessed.
   */
  private accessOrder: string[] = [];

  constructor(options: Partial<TruncationRecoveryOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Save a snapshot before truncation.
   *
   * @param truncationId - Unique identifier for this truncation operation
   * @param messages - Messages that will be truncated
   * @param reason - Reason for truncation
   * @returns The created truncation state
   * @throws If snapshot exceeds maxSnapshotSize
   */
  saveSnapshot(
    truncationId: string,
    messages: ContextMessage[],
    reason: TruncationReason
  ): TruncationState {
    // Serialize messages
    const serialized = JSON.stringify(messages);
    const originalSize = getByteSize(serialized);

    // Compress if enabled and beneficial
    let messagesData: string;
    let compressed = false;
    let finalSize: number;

    if (this.options.enableCompression && originalSize > 1024) {
      // Only compress if > 1KB
      const compressedData = compressData(serialized);
      const compressedSize = getByteSize(compressedData);

      // Use compressed only if it's actually smaller
      if (compressedSize < originalSize) {
        messagesData = compressedData;
        compressed = true;
        finalSize = compressedSize;
      } else {
        messagesData = serialized;
        finalSize = originalSize;
      }
    } else {
      messagesData = serialized;
      finalSize = originalSize;
    }

    // Check size limit
    if (finalSize > this.options.maxSnapshotSize) {
      throw new Error(
        `Snapshot size ${finalSize} bytes exceeds limit of ${this.options.maxSnapshotSize} bytes`
      );
    }

    // Create snapshot
    const snapshot: TruncationSnapshot = {
      snapshotId: `snap-${truncationId}`,
      messagesData,
      sizeBytes: finalSize,
      compressed,
    };

    // Create state
    const state: TruncationState = {
      truncationId,
      truncatedMessageIds: messages.map((m) => m.id),
      truncatedAt: Date.now(),
      reason,
      snapshot,
    };

    // Evict if at capacity (before adding new)
    this.evictIfNeeded();

    // Store state
    this.states.set(truncationId, state);
    this.updateAccessOrder(truncationId);

    return state;
  }

  /**
   * Recover truncated messages from a snapshot.
   *
   * @param truncationId - ID of the truncation to recover
   * @returns Recovered messages, or null if not found/expired
   */
  recover(truncationId: string): ContextMessage[] | null {
    const state = this.states.get(truncationId);

    if (!state) {
      return null;
    }

    // Check expiration
    if (this.isExpired(state)) {
      this.states.delete(truncationId);
      this.removeFromAccessOrder(truncationId);
      return null;
    }

    // Update LRU order
    this.updateAccessOrder(truncationId);

    // Decompress and parse
    if (!state.snapshot) {
      return null;
    }

    try {
      const serialized = state.snapshot.compressed
        ? decompressData(state.snapshot.messagesData)
        : state.snapshot.messagesData;

      return JSON.parse(serialized) as ContextMessage[];
    } catch {
      // Corrupted snapshot
      this.states.delete(truncationId);
      this.removeFromAccessOrder(truncationId);
      return null;
    }
  }

  /**
   * Get truncation state without recovering messages.
   *
   * @param truncationId - ID of the truncation
   * @returns State info, or null if not found
   */
  getState(truncationId: string): TruncationState | null {
    const state = this.states.get(truncationId);

    if (!state) {
      return null;
    }

    // Check expiration
    if (this.isExpired(state)) {
      this.states.delete(truncationId);
      this.removeFromAccessOrder(truncationId);
      return null;
    }

    // Don't update access order for read-only state check
    return state;
  }

  /**
   * List all recoverable truncations.
   *
   * @returns Array of truncation states that can still be recovered
   */
  listRecoverable(): TruncationState[] {
    // Clean up expired first
    this.cleanup();

    return Array.from(this.states.values());
  }

  /**
   * Clean up expired snapshots.
   *
   * @returns Number of snapshots cleaned up
   */
  cleanup(): number {
    let cleaned = 0;
    const now = Date.now();

    for (const [id, state] of this.states) {
      if (now - state.truncatedAt > this.options.expirationMs) {
        this.states.delete(id);
        this.removeFromAccessOrder(id);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Clear all snapshots.
   * Useful for testing or when resetting state.
   */
  clear(): void {
    this.states.clear();
    this.accessOrder = [];
  }

  /**
   * Get current snapshot count.
   */
  get size(): number {
    return this.states.size;
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Check if a truncation state has expired.
   */
  private isExpired(state: TruncationState): boolean {
    return Date.now() - state.truncatedAt > this.options.expirationMs;
  }

  /**
   * Evict oldest entries if at capacity.
   */
  private evictIfNeeded(): void {
    while (this.states.size >= this.options.maxSnapshots) {
      // Remove least recently used (first in access order)
      const lru = this.accessOrder[0];
      if (lru) {
        this.states.delete(lru);
        this.accessOrder.shift();
      } else {
        break;
      }
    }
  }

  /**
   * Update access order for LRU tracking.
   */
  private updateAccessOrder(truncationId: string): void {
    // Remove from current position
    this.removeFromAccessOrder(truncationId);
    // Add to end (most recent)
    this.accessOrder.push(truncationId);
  }

  /**
   * Remove an ID from access order tracking.
   */
  private removeFromAccessOrder(truncationId: string): void {
    const index = this.accessOrder.indexOf(truncationId);
    if (index !== -1) {
      this.accessOrder.splice(index, 1);
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a TruncationStateManager with default or custom options.
 *
 * @param options - Optional configuration overrides
 * @returns Configured TruncationStateManager instance
 *
 * @example
 * ```typescript
 * // Use defaults
 * const manager = createTruncationStateManager();
 *
 * // Custom configuration
 * const manager = createTruncationStateManager({
 *   maxSnapshots: 5,
 *   enableCompression: false,
 * });
 * ```
 */
export function createTruncationStateManager(
  options?: Partial<TruncationRecoveryOptions>
): TruncationStateManager {
  return new TruncationStateManager(options);
}
