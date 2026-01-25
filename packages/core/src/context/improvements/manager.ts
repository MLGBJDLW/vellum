/**
 * Context Improvements Manager
 *
 * Unified management class for all context management improvement components.
 * Provides centralized configuration, lifecycle management, and convenient access.
 *
 * Managed Components:
 * - P0-1: SummaryQualityValidator - Validates summary quality
 * - P0-2: TruncationStateManager - Recoverable truncation snapshots
 * - P1-1: CrossSessionInheritanceResolver - Session context inheritance
 * - P1-2: SummaryProtectionFilter - Cascade compression protection
 * - P2-1: DiskCheckpointPersistence - Checkpoint disk storage
 * - P2-2: CompactionStatsTracker - Compression statistics tracking
 *
 * @module @vellum/core/context/improvements/manager
 *
 * @example
 * ```typescript
 * import { ContextImprovementsManager, DEFAULT_IMPROVEMENTS_CONFIG } from './improvements';
 *
 * const manager = new ContextImprovementsManager({
 *   // Override specific settings
 *   summaryQuality: {
 *     ...DEFAULT_IMPROVEMENTS_CONFIG.summaryQuality,
 *     enableLLMValidation: true, // Enable deep validation
 *   },
 * });
 *
 * await manager.initialize();
 *
 * // Use components
 * const validator = manager.qualityValidator;
 * const stats = manager.statsTracker.getStats();
 *
 * // Cleanup on shutdown
 * await manager.shutdown();
 * ```
 */

import { createLogger } from "../../logger/index.js";
import { CompactionStatsTracker } from "./compaction-stats-tracker.js";
import { CrossSessionInheritanceResolver } from "./cross-session-inheritance.js";
import { DiskCheckpointPersistence } from "./disk-checkpoint-persistence.js";
import { SummaryProtectionFilter } from "./summary-protection-filter.js";
import { SummaryQualityValidator } from "./summary-quality-validator.js";
import { TruncationStateManager } from "./truncation-state-manager.js";
import {
  type CompactionStatsConfig,
  type ContextImprovementsConfig,
  DEFAULT_IMPROVEMENTS_CONFIG,
  type DiskCheckpointConfig,
  type SessionInheritanceConfig,
  type SummaryProtectionConfig,
  type SummaryQualityConfig,
  type TruncationRecoveryOptions,
} from "./types.js";

// ============================================================================
// Logger
// ============================================================================

const logger = createLogger({ name: "context-improvements-manager" });

// ============================================================================
// Types
// ============================================================================

/**
 * Initialization status for tracking component state.
 */
interface InitializationStatus {
  /** Whether the manager has been initialized */
  initialized: boolean;
  /** Timestamp when initialization completed */
  initializedAt?: number;
  /** Components that failed to initialize (non-fatal) */
  failedComponents: string[];
}

// ============================================================================
// ContextImprovementsManager
// ============================================================================

/**
 * Unified manager for all context improvement components.
 *
 * Provides:
 * - Centralized configuration management
 * - Lazy component initialization
 * - Lifecycle management (initialize/shutdown)
 * - Convenient accessor methods for all components
 *
 * @example
 * ```typescript
 * // Create with partial config (uses defaults for unspecified)
 * const manager = new ContextImprovementsManager({
 *   summaryQuality: { enableLLMValidation: false },
 *   compactionStats: { enabled: true, persist: true },
 * });
 *
 * // Initialize all components
 * await manager.initialize();
 *
 * // Access components as needed
 * const report = await manager.qualityValidator.validate(messages, summary);
 * await manager.statsTracker.record({ ... });
 *
 * // Cleanup
 * await manager.shutdown();
 * ```
 */
export class ContextImprovementsManager {
  private readonly config: ContextImprovementsConfig;
  private readonly status: InitializationStatus = {
    initialized: false,
    failedComponents: [],
  };

  // Component instances (created lazily)
  private _qualityValidator?: SummaryQualityValidator;
  private _truncationManager?: TruncationStateManager;
  private _inheritanceResolver?: CrossSessionInheritanceResolver;
  private _summaryProtection?: SummaryProtectionFilter;
  private _diskCheckpoint?: DiskCheckpointPersistence;
  private _statsTracker?: CompactionStatsTracker;

  /**
   * Create a new ContextImprovementsManager.
   *
   * @param config - Partial configuration (merged with defaults)
   */
  constructor(config: Partial<ContextImprovementsConfig> = {}) {
    // Deep merge with defaults
    this.config = this.mergeConfig(config);
    logger.debug("ContextImprovementsManager created with config", {
      summaryQualityEnabled: this.config.summaryQuality.enableRuleValidation,
      truncationRecoveryEnabled: this.config.truncationRecovery.maxSnapshots > 0,
      sessionInheritanceEnabled: this.config.sessionInheritance.enabled,
      summaryProtectionEnabled: this.config.summaryProtection.enabled,
      diskCheckpointEnabled: this.config.diskCheckpoint.enabled,
      compactionStatsEnabled: this.config.compactionStats.enabled,
    });
  }

  // ==========================================================================
  // Component Accessors (lazy initialization)
  // ==========================================================================

  /**
   * Get the SummaryQualityValidator instance.
   * Creates the instance on first access.
   */
  get qualityValidator(): SummaryQualityValidator {
    if (!this._qualityValidator) {
      this._qualityValidator = new SummaryQualityValidator(this.config.summaryQuality);
    }
    return this._qualityValidator;
  }

  /**
   * Get the TruncationStateManager instance.
   * Creates the instance on first access.
   */
  get truncationManager(): TruncationStateManager {
    if (!this._truncationManager) {
      this._truncationManager = new TruncationStateManager(this.config.truncationRecovery);
    }
    return this._truncationManager;
  }

  /**
   * Get the CrossSessionInheritanceResolver instance.
   * Creates the instance on first access.
   */
  get inheritanceResolver(): CrossSessionInheritanceResolver {
    if (!this._inheritanceResolver) {
      this._inheritanceResolver = new CrossSessionInheritanceResolver(
        this.config.sessionInheritance
      );
    }
    return this._inheritanceResolver;
  }

  /**
   * Get the SummaryProtectionFilter instance.
   * Creates the instance on first access.
   */
  get summaryProtection(): SummaryProtectionFilter {
    if (!this._summaryProtection) {
      this._summaryProtection = new SummaryProtectionFilter(this.config.summaryProtection);
    }
    return this._summaryProtection;
  }

  /**
   * Get the DiskCheckpointPersistence instance.
   * Creates the instance on first access.
   */
  get diskCheckpoint(): DiskCheckpointPersistence {
    if (!this._diskCheckpoint) {
      this._diskCheckpoint = new DiskCheckpointPersistence(this.config.diskCheckpoint);
    }
    return this._diskCheckpoint;
  }

  /**
   * Get the CompactionStatsTracker instance.
   * Creates the instance on first access.
   */
  get statsTracker(): CompactionStatsTracker {
    if (!this._statsTracker) {
      this._statsTracker = new CompactionStatsTracker(this.config.compactionStats);
    }
    return this._statsTracker;
  }

  // ==========================================================================
  // Configuration Access
  // ==========================================================================

  /**
   * Get the current configuration.
   *
   * @returns Full configuration including defaults
   */
  getConfig(): ContextImprovementsConfig {
    return { ...this.config };
  }

  /**
   * Get summary quality configuration.
   */
  getSummaryQualityConfig(): SummaryQualityConfig {
    return { ...this.config.summaryQuality };
  }

  /**
   * Get truncation recovery configuration.
   */
  getTruncationRecoveryConfig(): TruncationRecoveryOptions {
    return { ...this.config.truncationRecovery };
  }

  /**
   * Get session inheritance configuration.
   */
  getSessionInheritanceConfig(): SessionInheritanceConfig {
    return { ...this.config.sessionInheritance };
  }

  /**
   * Get summary protection configuration.
   */
  getSummaryProtectionConfig(): SummaryProtectionConfig {
    return { ...this.config.summaryProtection };
  }

  /**
   * Get disk checkpoint configuration.
   */
  getDiskCheckpointConfig(): DiskCheckpointConfig {
    return { ...this.config.diskCheckpoint };
  }

  /**
   * Get compaction stats configuration.
   */
  getCompactionStatsConfig(): CompactionStatsConfig {
    return { ...this.config.compactionStats };
  }

  // ==========================================================================
  // Lifecycle Management
  // ==========================================================================

  /**
   * Initialize all components.
   *
   * Performs necessary setup like loading persisted data from disk.
   * Non-fatal errors in component initialization are logged but don't
   * prevent other components from initializing.
   */
  async initialize(): Promise<void> {
    if (this.status.initialized) {
      logger.debug("ContextImprovementsManager already initialized");
      return;
    }

    logger.info("Initializing ContextImprovementsManager");
    const startTime = Date.now();
    this.status.failedComponents = [];

    // Initialize components that need async setup
    await Promise.all([this.initializeCompactionStats(), this.initializeDiskCheckpoint()]);

    this.status.initialized = true;
    this.status.initializedAt = Date.now();

    logger.info("ContextImprovementsManager initialized", {
      durationMs: Date.now() - startTime,
      failedComponents: this.status.failedComponents,
    });
  }

  /**
   * Shutdown all components.
   *
   * Persists any pending data and cleans up resources.
   */
  async shutdown(): Promise<void> {
    if (!this.status.initialized) {
      logger.debug("ContextImprovementsManager not initialized, skipping shutdown");
      return;
    }

    logger.info("Shutting down ContextImprovementsManager");
    const startTime = Date.now();

    // Persist compaction stats
    if (this._statsTracker && this.config.compactionStats.persist) {
      try {
        await this._statsTracker.persist();
        logger.debug("Compaction stats persisted");
      } catch (error) {
        logger.warn("Failed to persist compaction stats on shutdown", { error });
      }
    }

    // Cleanup disk checkpoint resources
    if (this._diskCheckpoint) {
      try {
        await this._diskCheckpoint.cleanup();
        logger.debug("Disk checkpoint resources cleaned up");
      } catch (error) {
        logger.warn("Failed to cleanup disk checkpoint on shutdown", { error });
      }
    }

    this.status.initialized = false;
    this.status.initializedAt = undefined;

    logger.info("ContextImprovementsManager shutdown complete", {
      durationMs: Date.now() - startTime,
    });
  }

  /**
   * Check if the manager has been initialized.
   */
  isInitialized(): boolean {
    return this.status.initialized;
  }

  /**
   * Get initialization status.
   */
  getStatus(): InitializationStatus {
    return { ...this.status };
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Merge user config with defaults.
   * Performs deep merge for nested config objects.
   */
  private mergeConfig(partial: Partial<ContextImprovementsConfig>): ContextImprovementsConfig {
    return {
      summaryQuality: {
        ...DEFAULT_IMPROVEMENTS_CONFIG.summaryQuality,
        ...partial.summaryQuality,
      },
      truncationRecovery: {
        ...DEFAULT_IMPROVEMENTS_CONFIG.truncationRecovery,
        ...partial.truncationRecovery,
      },
      sessionInheritance: {
        ...DEFAULT_IMPROVEMENTS_CONFIG.sessionInheritance,
        ...partial.sessionInheritance,
      },
      summaryProtection: {
        ...DEFAULT_IMPROVEMENTS_CONFIG.summaryProtection,
        ...partial.summaryProtection,
      },
      diskCheckpoint: {
        ...DEFAULT_IMPROVEMENTS_CONFIG.diskCheckpoint,
        ...partial.diskCheckpoint,
      },
      compactionStats: {
        ...DEFAULT_IMPROVEMENTS_CONFIG.compactionStats,
        ...partial.compactionStats,
      },
    };
  }

  /**
   * Initialize compaction stats tracker with persisted data.
   */
  private async initializeCompactionStats(): Promise<void> {
    if (!this.config.compactionStats.enabled) {
      return;
    }

    try {
      // Access the tracker to create it
      const tracker = this.statsTracker;
      // Load persisted stats
      await tracker.load();
      logger.debug("Compaction stats loaded");
    } catch (error) {
      this.status.failedComponents.push("compactionStats");
      logger.warn("Failed to initialize compaction stats", { error });
    }
  }

  /**
   * Initialize disk checkpoint persistence.
   */
  private async initializeDiskCheckpoint(): Promise<void> {
    if (!this.config.diskCheckpoint.enabled) {
      return;
    }

    try {
      // Access the persistence to create it (lazy initialization)
      const persistence = this.diskCheckpoint;
      // Verify it's operational by checking disk usage (triggers directory creation)
      await persistence.getDiskUsage();
      logger.debug("Disk checkpoint persistence initialized");
    } catch (error) {
      this.status.failedComponents.push("diskCheckpoint");
      logger.warn("Failed to initialize disk checkpoint persistence", { error });
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new ContextImprovementsManager with optional configuration.
 *
 * @param config - Partial configuration (uses defaults for unspecified)
 * @returns New ContextImprovementsManager instance
 *
 * @example
 * ```typescript
 * // Create with all defaults
 * const manager = createContextImprovementsManager();
 *
 * // Create with custom compaction stats config
 * const manager = createContextImprovementsManager({
 *   compactionStats: { persist: true, maxHistoryEntries: 200 },
 * });
 * ```
 */
export function createContextImprovementsManager(
  config: Partial<ContextImprovementsConfig> = {}
): ContextImprovementsManager {
  return new ContextImprovementsManager(config);
}
