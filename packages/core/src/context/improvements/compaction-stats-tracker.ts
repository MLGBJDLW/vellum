/**
 * Compaction Stats Tracker
 *
 * Tracks compression statistics across sessions with persistence.
 * Addresses P2-2: Compaction Stats Tracking.
 *
 * Features:
 * - Record each compaction with detailed metrics
 * - Detect cascade compactions (re-compaction of summaries)
 * - Persist statistics to disk
 * - Query compaction history
 *
 * @module @vellum/core/context/improvements/compaction-stats-tracker
 */

import { existsSync, mkdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type {
  CompactionHistoryEntry,
  CompactionStats,
  CompactionStatsConfig,
  SummaryQualityReport,
} from "./types.js";

// ============================================================================
// Constants
// ============================================================================

/** Default configuration for compaction stats tracking */
const DEFAULT_CONFIG: CompactionStatsConfig = {
  enabled: true,
  persist: true,
  maxHistoryEntries: 100,
  statsFilePath: ".vellum/compaction-stats.json",
};

/** Schema version for stats file format */
const STATS_FILE_VERSION = 1;

// ============================================================================
// Types
// ============================================================================

/**
 * Internal structure for persisted stats file.
 */
interface PersistedStatsFile {
  /** Schema version */
  version: number;
  /** Compaction statistics */
  stats: CompactionStats;
  /** Last updated timestamp */
  lastUpdated: number;
}

/**
 * Input for recording a compaction operation.
 */
export interface CompactionRecordInput {
  /** Timestamp when compaction occurred */
  timestamp: number;
  /** Token count before compaction */
  originalTokens: number;
  /** Token count after compaction */
  compressedTokens: number;
  /** Number of messages compacted */
  messageCount: number;
  /** Whether this was a cascade compaction */
  isCascade: boolean;
  /** Quality report if validation was enabled */
  qualityReport?: SummaryQualityReport;
}

/**
 * Information about messages being compacted for cascade detection.
 */
export interface CompactionMessageInfo {
  /** Message ID */
  id: string;
  /** Whether message is already a summary */
  isSummary?: boolean;
  /** Condense ID if message was from previous compaction */
  condenseId?: string;
}

// ============================================================================
// CompactionStatsTracker Class
// ============================================================================

/**
 * Tracks compaction statistics with optional persistence.
 *
 * Usage:
 * ```typescript
 * const tracker = new CompactionStatsTracker({
 *   enabled: true,
 *   persist: true,
 *   maxHistoryEntries: 100,
 *   statsFilePath: '.vellum/compaction-stats.json',
 * });
 *
 * await tracker.load();
 *
 * await tracker.record({
 *   timestamp: Date.now(),
 *   originalTokens: 5000,
 *   compressedTokens: 500,
 *   messageCount: 10,
 *   isCascade: false,
 * });
 *
 * const stats = tracker.getStats();
 * console.log(`Total compactions: ${stats.totalCompactions}`);
 * ```
 */
export class CompactionStatsTracker {
  private readonly config: CompactionStatsConfig;
  private stats: CompactionStats;
  private compactedMessageIds: Set<string> = new Set();
  private persistPending = false;
  private pendingPersist: Promise<void> | null = null;

  /**
   * Create a new CompactionStatsTracker.
   *
   * @param config - Configuration options
   */
  constructor(config: Partial<CompactionStatsConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.stats = this.createEmptyStats();
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Record a compaction operation.
   *
   * @param entry - Compaction record (without compactionId)
   */
  async record(entry: CompactionRecordInput): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    const compactionId = this.generateCompactionId();

    const historyEntry: CompactionHistoryEntry = {
      compactionId,
      ...entry,
    };

    // Update statistics
    this.stats.totalCompactions++;
    this.stats.sessionCompactions++;
    this.stats.totalOriginalTokens += entry.originalTokens;
    this.stats.totalCompressedTokens += entry.compressedTokens;

    if (entry.isCascade) {
      this.stats.cascadeCompactions++;
    }

    // Add to history
    this.stats.history.push(historyEntry);

    // Enforce history limit
    this.enforceHistoryLimit();

    // Persist asynchronously
    if (this.config.persist) {
      this.schedulePersist();
    }
  }

  /**
   * Get current compaction statistics.
   *
   * @returns Current stats
   */
  getStats(): CompactionStats {
    return { ...this.stats };
  }

  /**
   * Get compaction history entries.
   *
   * @param limit - Maximum number of entries to return (default: all)
   * @returns History entries (newest first)
   */
  getHistory(limit?: number): CompactionHistoryEntry[] {
    const history = [...this.stats.history].reverse(); // Newest first
    if (limit !== undefined && limit > 0) {
      return history.slice(0, limit);
    }
    return history;
  }

  /**
   * Check if messages would trigger a cascade compaction.
   * A cascade compaction occurs when compacting messages that are
   * already summaries (have isSummary=true or condenseId set).
   *
   * @param messages - Information about messages being compacted
   * @returns True if this would be a cascade compaction
   */
  isCascadeCompaction(messages: CompactionMessageInfo[]): boolean {
    for (const msg of messages) {
      // If message is marked as a summary, it's a cascade
      if (msg.isSummary === true) {
        return true;
      }
      // If message has a condenseId, it came from previous compaction
      if (msg.condenseId !== undefined && msg.condenseId !== "") {
        return true;
      }
      // If message ID is in our tracked compacted set, it's a cascade
      if (this.compactedMessageIds.has(msg.id)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Track message IDs that have been compacted.
   * Used for cascade detection across operations.
   *
   * @param messageIds - IDs of compacted messages
   * @param summaryId - ID of the resulting summary message
   */
  trackCompactedMessages(messageIds: string[], summaryId: string): void {
    // Track original message IDs
    for (const id of messageIds) {
      this.compactedMessageIds.add(id);
    }
    // Track the summary itself for future cascade detection
    this.compactedMessageIds.add(summaryId);
  }

  /**
   * Persist statistics to disk.
   */
  async persist(): Promise<void> {
    if (!this.config.persist || !this.config.statsFilePath) {
      return;
    }

    const filePath = this.config.statsFilePath;
    const dir = dirname(filePath);

    // Ensure directory exists
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const fileContent: PersistedStatsFile = {
      version: STATS_FILE_VERSION,
      stats: this.stats,
      lastUpdated: Date.now(),
    };

    const json = JSON.stringify(fileContent, null, 2);
    await writeFile(filePath, json, "utf-8");

    this.persistPending = false;
  }

  /**
   * Load statistics from disk.
   */
  async load(): Promise<void> {
    if (!this.config.persist || !this.config.statsFilePath) {
      return;
    }

    const filePath = this.config.statsFilePath;

    if (!existsSync(filePath)) {
      // No existing stats file, start fresh
      return;
    }

    try {
      const content = await readFile(filePath, "utf-8");
      const fileData = JSON.parse(content) as PersistedStatsFile;

      // Version check for future compatibility
      if (fileData.version !== STATS_FILE_VERSION) {
        // Migration could happen here in future versions
        console.warn(
          `[CompactionStatsTracker] Stats file version mismatch: ` +
            `expected ${STATS_FILE_VERSION}, got ${fileData.version}. ` +
            `Starting fresh.`
        );
        return;
      }

      // Merge loaded stats with current session
      this.stats = {
        ...fileData.stats,
        // Reset session-specific counters
        sessionId: this.stats.sessionId,
        sessionCompactions: 0,
      };

      // Rebuild compactedMessageIds from history
      for (const entry of this.stats.history) {
        this.compactedMessageIds.add(entry.compactionId);
      }
    } catch (error) {
      console.warn(`[CompactionStatsTracker] Failed to load stats from ${filePath}:`, error);
      // Continue with empty stats
    }
  }

  /**
   * Reset all statistics.
   * Clears history and all counters, optionally persists the reset.
   */
  reset(): void {
    this.stats = this.createEmptyStats();
    this.compactedMessageIds.clear();

    if (this.config.persist) {
      this.schedulePersist();
    }
  }

  /**
   * Set the session ID for tracking.
   *
   * @param sessionId - New session ID
   */
  setSessionId(sessionId: string): void {
    this.stats.sessionId = sessionId;
    this.stats.sessionCompactions = 0;
  }

  /**
   * Get compression efficiency ratio.
   *
   * @returns Ratio of total tokens saved (0-1)
   */
  getCompressionEfficiency(): number {
    if (this.stats.totalOriginalTokens === 0) {
      return 0;
    }
    return 1 - this.stats.totalCompressedTokens / this.stats.totalOriginalTokens;
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Create empty statistics object.
   */
  private createEmptyStats(): CompactionStats {
    return {
      sessionId: `session-${Date.now()}`,
      totalCompactions: 0,
      sessionCompactions: 0,
      cascadeCompactions: 0,
      totalOriginalTokens: 0,
      totalCompressedTokens: 0,
      history: [],
    };
  }

  /**
   * Generate a unique compaction ID.
   */
  private generateCompactionId(): string {
    return `compact-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  /**
   * Enforce the maximum history entries limit.
   */
  private enforceHistoryLimit(): void {
    const maxEntries = this.config.maxHistoryEntries;
    if (this.stats.history.length > maxEntries) {
      // Remove oldest entries
      const excess = this.stats.history.length - maxEntries;
      this.stats.history.splice(0, excess);
    }
  }

  /**
   * Schedule an async persist operation.
   * Debounces multiple rapid calls.
   */
  private schedulePersist(): void {
    if (this.persistPending) {
      return;
    }
    this.persistPending = true;

    this.pendingPersist = new Promise<void>((resolve) => {
      queueMicrotask(() => {
        this.persist()
          .catch((error) => {
            console.warn("[CompactionStatsTracker] Failed to persist:", error);
          })
          .finally(() => {
            this.pendingPersist = null;
            resolve();
          });
      });
    });
  }

  /**
   * Wait for any pending persist operations to complete.
   * Useful in tests or when ensuring data is written before reading.
   */
  async flush(): Promise<void> {
    if (this.pendingPersist) {
      await this.pendingPersist;
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new CompactionStatsTracker with the given configuration.
 *
 * @param config - Configuration options
 * @returns New tracker instance
 */
export function createCompactionStatsTracker(
  config: Partial<CompactionStatsConfig> = {}
): CompactionStatsTracker {
  return new CompactionStatsTracker(config);
}
