/**
 * Disk Checkpoint Persistence
 *
 * Provides persistent storage for checkpoints to survive crashes.
 * Addresses P2-1: Checkpoint Disk Persistence.
 *
 * Features:
 * - Lazy/immediate persistence strategies
 * - zlib compression for reduced disk usage
 * - Disk space management with configurable limits
 * - Recovery from disk on demand
 *
 * @module @vellum/core/context/improvements/disk-checkpoint-persistence
 */

import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { deflateSync, inflateSync } from "node:zlib";

import type { ContextMessage } from "../types.js";
import type { DiskCheckpointConfig, PersistedCheckpoint } from "./types.js";

// ============================================================================
// Constants
// ============================================================================

/** Default configuration for disk checkpoint persistence */
const DEFAULT_CONFIG: DiskCheckpointConfig = {
  enabled: true,
  directory: ".vellum/checkpoints",
  maxDiskUsage: 100 * 1024 * 1024, // 100MB
  strategy: "lazy",
  enableCompression: true,
};

/** Compression level for zlib (1-9, higher = more compression) */
const COMPRESSION_LEVEL = 6;

/** File extension for checkpoint files */
const CHECKPOINT_EXTENSION = ".checkpoint";

/** File extension for compressed checkpoint files */
const COMPRESSED_EXTENSION = ".checkpoint.gz";

/** Manifest file name */
const MANIFEST_FILE = "manifest.json";

// ============================================================================
// Types
// ============================================================================

/**
 * Internal structure for checkpoint file content.
 */
interface CheckpointFileContent {
  /** Checkpoint ID */
  checkpointId: string;
  /** Serialized messages (JSON string) */
  messagesData: string;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
  /** Creation timestamp */
  createdAt: number;
  /** Message count */
  messageCount: number;
  /** Version for future compatibility */
  version: 1;
}

/**
 * Manifest file structure for tracking persisted checkpoints.
 */
interface CheckpointManifest {
  /** Map of checkpoint ID to metadata */
  checkpoints: Record<string, PersistedCheckpoint>;
  /** Last updated timestamp */
  lastUpdated: number;
  /** Schema version */
  version: 1;
}

// ============================================================================
// Compression Utilities
// ============================================================================

/**
 * Compress a string using zlib deflate.
 *
 * @param data - String to compress
 * @returns Compressed data as Buffer
 */
function compressData(data: string): Buffer {
  const buffer = Buffer.from(data, "utf-8");
  return deflateSync(buffer, { level: COMPRESSION_LEVEL });
}

/**
 * Decompress a zlib compressed buffer.
 *
 * @param compressed - Compressed buffer
 * @returns Original string
 */
function decompressData(compressed: Buffer): string {
  const decompressed = inflateSync(compressed);
  return decompressed.toString("utf-8");
}

// ============================================================================
// DiskCheckpointPersistence
// ============================================================================

/**
 * Manages checkpoint persistence to disk with compression and space management.
 *
 * Provides durable storage for checkpoints that survive process crashes,
 * with configurable compression and automatic cleanup when disk limits are exceeded.
 *
 * @example
 * ```typescript
 * const persistence = new DiskCheckpointPersistence({
 *   enabled: true,
 *   directory: '.vellum/checkpoints',
 *   maxDiskUsage: 100 * 1024 * 1024, // 100MB
 *   strategy: 'lazy',
 *   enableCompression: true,
 * });
 *
 * // Persist a checkpoint
 * const persisted = await persistence.persist({
 *   checkpointId: 'chk_123',
 *   messages: [...],
 *   metadata: { reason: 'pre-compression' },
 * });
 *
 * // Load checkpoint later
 * const loaded = await persistence.load('chk_123');
 * if (loaded) {
 *   console.log('Recovered', loaded.messages.length, 'messages');
 * }
 * ```
 */
export class DiskCheckpointPersistence {
  private readonly config: DiskCheckpointConfig;

  /** In-memory cache of manifest */
  private manifest: CheckpointManifest | null = null;

  /** Pending persist operations (for lazy strategy) */
  private pendingPersists: Map<
    string,
    {
      checkpointId: string;
      messages: ContextMessage[];
      metadata?: Record<string, unknown>;
    }
  > = new Map();

  /** Whether persistence is currently disabled (e.g., due to errors) */
  private disabled = false;

  constructor(config: Partial<DiskCheckpointConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Persist a checkpoint to disk.
   *
   * @param checkpoint - Checkpoint data to persist
   * @returns Persisted checkpoint metadata
   * @throws If persistence fails and recovery is not possible
   */
  async persist(checkpoint: {
    checkpointId: string;
    messages: ContextMessage[];
    metadata?: Record<string, unknown>;
  }): Promise<PersistedCheckpoint> {
    if (!this.config.enabled || this.disabled) {
      return this.createDisabledResult(checkpoint);
    }

    // Handle strategy
    if (this.config.strategy === "lazy") {
      this.pendingPersists.set(checkpoint.checkpointId, checkpoint);
      // Schedule async persist
      this.scheduleLazyPersist(checkpoint.checkpointId);
      return this.createPendingResult(checkpoint);
    }

    // Immediate strategy
    return this.persistToFile(checkpoint);
  }

  /**
   * Load a checkpoint from disk.
   *
   * @param checkpointId - Checkpoint ID to load
   * @returns Checkpoint data or null if not found
   */
  async load(
    checkpointId: string
  ): Promise<{ messages: ContextMessage[]; metadata?: Record<string, unknown> } | null> {
    if (!this.config.enabled || this.disabled) {
      return null;
    }

    // Check pending persists first
    const pending = this.pendingPersists.get(checkpointId);
    if (pending) {
      return {
        messages: pending.messages,
        metadata: pending.metadata,
      };
    }

    // Load from disk
    return this.loadFromFile(checkpointId);
  }

  /**
   * List all persisted checkpoints.
   *
   * @returns Array of persisted checkpoint metadata
   */
  async list(): Promise<PersistedCheckpoint[]> {
    if (!this.config.enabled || this.disabled) {
      return [];
    }

    const manifest = await this.loadManifest();
    return Object.values(manifest.checkpoints).sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Delete a persisted checkpoint.
   *
   * @param checkpointId - Checkpoint ID to delete
   * @returns true if deleted, false if not found
   */
  async delete(checkpointId: string): Promise<boolean> {
    if (!this.config.enabled) {
      return false;
    }

    // Remove from pending
    this.pendingPersists.delete(checkpointId);

    // Remove from disk
    const manifest = await this.loadManifest();
    const persisted = manifest.checkpoints[checkpointId];

    if (!persisted) {
      return false;
    }

    try {
      const filePath = join(this.config.directory, persisted.filePath);
      if (existsSync(filePath)) {
        await rm(filePath, { force: true });
      }

      delete manifest.checkpoints[checkpointId];
      await this.saveManifest(manifest);
      return true;
    } catch {
      // File may already be deleted
      delete manifest.checkpoints[checkpointId];
      await this.saveManifest(manifest);
      return true;
    }
  }

  /**
   * Clean up old checkpoints when disk usage exceeds limit.
   *
   * @returns Number of checkpoints cleaned up
   */
  async cleanup(): Promise<number> {
    if (!this.config.enabled || this.disabled) {
      return 0;
    }

    const currentUsage = await this.getDiskUsage();
    if (currentUsage <= this.config.maxDiskUsage) {
      return 0;
    }

    const manifest = await this.loadManifest();
    const checkpoints = Object.values(manifest.checkpoints).sort(
      (a, b) => a.createdAt - b.createdAt
    );

    let cleaned = 0;
    let freedBytes = 0;
    const targetFree = currentUsage - this.config.maxDiskUsage * 0.8; // Free to 80% of limit

    for (const cp of checkpoints) {
      if (freedBytes >= targetFree) {
        break;
      }

      try {
        const filePath = join(this.config.directory, cp.filePath);
        if (existsSync(filePath)) {
          await rm(filePath, { force: true });
        }
        delete manifest.checkpoints[cp.checkpointId];
        freedBytes += cp.sizeBytes;
        cleaned++;
      } catch {
        // Continue with other files
      }
    }

    if (cleaned > 0) {
      await this.saveManifest(manifest);
    }

    return cleaned;
  }

  /**
   * Get current disk usage for checkpoints.
   *
   * @returns Total bytes used by checkpoint files
   */
  async getDiskUsage(): Promise<number> {
    if (!this.config.enabled || this.disabled) {
      return 0;
    }

    this.ensureDirectory();

    try {
      const files = readdirSync(this.config.directory);
      let totalSize = 0;

      for (const file of files) {
        if (file.endsWith(CHECKPOINT_EXTENSION) || file.endsWith(COMPRESSED_EXTENSION)) {
          try {
            const filePath = join(this.config.directory, file);
            const stats = statSync(filePath);
            totalSize += stats.size;
          } catch {
            // File may have been deleted
          }
        }
      }

      return totalSize;
    } catch {
      return 0;
    }
  }

  /**
   * Flush any pending lazy persists immediately.
   *
   * @returns Number of checkpoints flushed
   */
  async flush(): Promise<number> {
    if (!this.config.enabled || this.disabled || this.pendingPersists.size === 0) {
      return 0;
    }

    let flushed = 0;
    const pending = Array.from(this.pendingPersists.entries());

    for (const [checkpointId, checkpoint] of pending) {
      try {
        await this.persistToFile(checkpoint);
        this.pendingPersists.delete(checkpointId);
        flushed++;
      } catch {
        // Continue with other checkpoints
      }
    }

    return flushed;
  }

  /**
   * Clear all persisted checkpoints.
   *
   * @returns Number of checkpoints cleared
   */
  async clear(): Promise<number> {
    if (!this.config.enabled) {
      return 0;
    }

    this.pendingPersists.clear();

    try {
      this.ensureDirectory();
      const files = readdirSync(this.config.directory);
      let cleared = 0;

      for (const file of files) {
        try {
          const filePath = join(this.config.directory, file);
          rmSync(filePath, { force: true });
          cleared++;
        } catch {
          // Continue with other files
        }
      }

      this.manifest = null;
      return cleared;
    } catch {
      return 0;
    }
  }

  /**
   * Check if persistence is enabled and operational.
   */
  get isEnabled(): boolean {
    return this.config.enabled && !this.disabled;
  }

  /**
   * Get the current configuration.
   */
  get currentConfig(): DiskCheckpointConfig {
    return { ...this.config };
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Ensure the checkpoint directory exists.
   */
  private ensureDirectory(): void {
    if (!existsSync(this.config.directory)) {
      mkdirSync(this.config.directory, { recursive: true });
    }
  }

  /**
   * Persist a checkpoint to file.
   */
  private async persistToFile(checkpoint: {
    checkpointId: string;
    messages: ContextMessage[];
    metadata?: Record<string, unknown>;
  }): Promise<PersistedCheckpoint> {
    this.ensureDirectory();

    // Check disk usage and cleanup if needed
    const currentUsage = await this.getDiskUsage();
    if (currentUsage > this.config.maxDiskUsage * 0.9) {
      await this.cleanup();
    }

    const serialized = JSON.stringify(checkpoint.messages);
    const content: CheckpointFileContent = {
      checkpointId: checkpoint.checkpointId,
      messagesData: serialized,
      metadata: checkpoint.metadata,
      createdAt: Date.now(),
      messageCount: checkpoint.messages.length,
      version: 1,
    };

    const contentJson = JSON.stringify(content);
    let fileData: Buffer | string;
    let compressed = false;
    let fileName: string;

    if (this.config.enableCompression) {
      const compressedBuffer = compressData(contentJson);
      const originalSize = Buffer.byteLength(contentJson, "utf-8");

      // Only use compression if it actually helps
      if (compressedBuffer.length < originalSize) {
        fileData = compressedBuffer;
        compressed = true;
        fileName = `${checkpoint.checkpointId}${COMPRESSED_EXTENSION}`;
      } else {
        fileData = contentJson;
        fileName = `${checkpoint.checkpointId}${CHECKPOINT_EXTENSION}`;
      }
    } else {
      fileData = contentJson;
      fileName = `${checkpoint.checkpointId}${CHECKPOINT_EXTENSION}`;
    }

    const filePath = join(this.config.directory, fileName);
    const sizeBytes =
      typeof fileData === "string" ? Buffer.byteLength(fileData, "utf-8") : fileData.length;

    await writeFile(filePath, fileData);

    const persisted: PersistedCheckpoint = {
      checkpointId: checkpoint.checkpointId,
      filePath: fileName,
      createdAt: content.createdAt,
      sizeBytes,
      messageCount: content.messageCount,
      compressed,
    };

    // Update manifest
    const manifest = await this.loadManifest();
    manifest.checkpoints[checkpoint.checkpointId] = persisted;
    await this.saveManifest(manifest);

    return persisted;
  }

  /**
   * Load a checkpoint from file.
   */
  private async loadFromFile(
    checkpointId: string
  ): Promise<{ messages: ContextMessage[]; metadata?: Record<string, unknown> } | null> {
    this.ensureDirectory();

    const manifest = await this.loadManifest();
    const persisted = manifest.checkpoints[checkpointId];

    if (!persisted) {
      return null;
    }

    const filePath = join(this.config.directory, persisted.filePath);

    if (!existsSync(filePath)) {
      // Remove from manifest if file is missing
      delete manifest.checkpoints[checkpointId];
      await this.saveManifest(manifest);
      return null;
    }

    try {
      const fileData = await readFile(filePath);
      let contentJson: string;

      if (persisted.compressed) {
        contentJson = decompressData(fileData);
      } else {
        contentJson = fileData.toString("utf-8");
      }

      const content: CheckpointFileContent = JSON.parse(contentJson);
      const messages: ContextMessage[] = JSON.parse(content.messagesData);

      return {
        messages,
        metadata: content.metadata,
      };
    } catch {
      // Remove corrupted entry from manifest
      delete manifest.checkpoints[checkpointId];
      await this.saveManifest(manifest);
      return null;
    }
  }

  /**
   * Load the checkpoint manifest.
   */
  private async loadManifest(): Promise<CheckpointManifest> {
    if (this.manifest) {
      return this.manifest;
    }

    this.ensureDirectory();

    const manifestPath = join(this.config.directory, MANIFEST_FILE);

    if (existsSync(manifestPath)) {
      try {
        const content = await readFile(manifestPath, "utf-8");
        this.manifest = JSON.parse(content) as CheckpointManifest;
        return this.manifest;
      } catch {
        // Corrupted manifest, rebuild
      }
    }

    // Create new manifest
    this.manifest = {
      checkpoints: {},
      lastUpdated: Date.now(),
      version: 1,
    };

    // Scan directory for existing checkpoint files
    try {
      const files = readdirSync(this.config.directory);
      for (const file of files) {
        if (file.endsWith(CHECKPOINT_EXTENSION) || file.endsWith(COMPRESSED_EXTENSION)) {
          const checkpointId = file
            .replace(COMPRESSED_EXTENSION, "")
            .replace(CHECKPOINT_EXTENSION, "");
          const filePath = join(this.config.directory, file);

          try {
            const stats = statSync(filePath);
            this.manifest.checkpoints[checkpointId] = {
              checkpointId,
              filePath: file,
              createdAt: stats.mtimeMs,
              sizeBytes: stats.size,
              messageCount: 0, // Unknown without reading file
              compressed: file.endsWith(COMPRESSED_EXTENSION),
            };
          } catch {
            // Skip unreadable files
          }
        }
      }
    } catch {
      // Directory may not exist yet
    }

    await this.saveManifest(this.manifest);
    return this.manifest;
  }

  /**
   * Save the checkpoint manifest.
   */
  private async saveManifest(manifest: CheckpointManifest): Promise<void> {
    this.ensureDirectory();

    manifest.lastUpdated = Date.now();
    this.manifest = manifest;

    const manifestPath = join(this.config.directory, MANIFEST_FILE);
    const content = JSON.stringify(manifest, null, 2);

    await writeFile(manifestPath, content, "utf-8");
  }

  /**
   * Schedule a lazy persist operation.
   */
  private scheduleLazyPersist(checkpointId: string): void {
    // Use setImmediate to defer to next event loop iteration
    setImmediate(async () => {
      const checkpoint = this.pendingPersists.get(checkpointId);
      if (checkpoint) {
        try {
          await this.persistToFile(checkpoint);
          this.pendingPersists.delete(checkpointId);
        } catch {
          // Leave in pending for retry
        }
      }
    });
  }

  /**
   * Create a result for when persistence is disabled.
   */
  private createDisabledResult(checkpoint: {
    checkpointId: string;
    messages: ContextMessage[];
  }): PersistedCheckpoint {
    return {
      checkpointId: checkpoint.checkpointId,
      filePath: "",
      createdAt: Date.now(),
      sizeBytes: 0,
      messageCount: checkpoint.messages.length,
      compressed: false,
    };
  }

  /**
   * Create a result for a pending persist.
   */
  private createPendingResult(checkpoint: {
    checkpointId: string;
    messages: ContextMessage[];
  }): PersistedCheckpoint {
    return {
      checkpointId: checkpoint.checkpointId,
      filePath: `${checkpoint.checkpointId}${this.config.enableCompression ? COMPRESSED_EXTENSION : CHECKPOINT_EXTENSION}`,
      createdAt: Date.now(),
      sizeBytes: 0, // Unknown until persisted
      messageCount: checkpoint.messages.length,
      compressed: this.config.enableCompression,
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new DiskCheckpointPersistence instance.
 *
 * @param config - Optional configuration overrides
 * @returns DiskCheckpointPersistence instance
 *
 * @example
 * ```typescript
 * const persistence = createDiskCheckpointPersistence({
 *   directory: '.vellum/checkpoints',
 *   maxDiskUsage: 50 * 1024 * 1024, // 50MB
 * });
 * ```
 */
export function createDiskCheckpointPersistence(
  config?: Partial<DiskCheckpointConfig>
): DiskCheckpointPersistence {
  return new DiskCheckpointPersistence(config);
}
