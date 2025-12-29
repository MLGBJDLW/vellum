// ============================================
// Model Availability Service
// ============================================

/**
 * Model state indicating why a model is unavailable.
 *
 * - `terminal`: Model permanently unavailable (e.g., deprecated, auth revoked)
 * - `sticky_retry`: Temporary unavailability with auto-expiration (e.g., rate limit)
 */
export type ModelState = "terminal" | "sticky_retry";

/**
 * Status information for a model's availability.
 */
export interface ModelStatus {
  /** Whether the model is currently available for requests */
  available: boolean;
  /** The state if model is unavailable */
  state?: ModelState;
  /** Remaining time in ms before sticky_retry expires (0 if not applicable) */
  retryAfterMs?: number;
  /** Timestamp when the model was marked unavailable */
  markedAt?: number;
}

/**
 * Internal entry for tracking model unavailability.
 */
interface ModelEntry {
  state: ModelState;
  markedAt: number;
  expiresAt?: number;
}

// Default cleanup interval: 60 seconds
const DEFAULT_CLEANUP_INTERVAL_MS = 60_000;

/**
 * ModelAvailabilityService - Singleton service for tracking model health states.
 *
 * Tracks which models are unavailable due to terminal errors or temporary
 * rate limits, preventing requests to unavailable models.
 *
 * @example
 * ```ts
 * const availability = ModelAvailabilityService.getInstance();
 *
 * // Mark a model as temporarily unavailable for 30 seconds
 * availability.markUnavailable('gpt-4', 'sticky_retry', 30_000);
 *
 * // Check if available
 * if (!availability.isAvailable('gpt-4')) {
 *   const retryMs = availability.getRetryAfter('gpt-4');
 *   console.log(`Retry after ${retryMs}ms`);
 * }
 * ```
 */
export class ModelAvailabilityService {
  private static instance: ModelAvailabilityService;

  private models = new Map<string, ModelEntry>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  private constructor() {
    this.startCleanupTimer();
  }

  /**
   * Get the singleton instance of ModelAvailabilityService.
   */
  static getInstance(): ModelAvailabilityService {
    if (!ModelAvailabilityService.instance) {
      ModelAvailabilityService.instance = new ModelAvailabilityService();
    }
    return ModelAvailabilityService.instance;
  }

  /**
   * Reset the singleton instance (for testing).
   */
  static resetInstance(): void {
    if (ModelAvailabilityService.instance) {
      ModelAvailabilityService.instance.dispose();
    }
    ModelAvailabilityService.instance = undefined as unknown as ModelAvailabilityService;
  }

  /**
   * Check if a model is available for requests.
   *
   * @param modelId - The model identifier to check
   * @returns `true` if available, `false` if unavailable
   *
   * Unknown models are considered available (default behavior).
   */
  isAvailable(modelId: string): boolean {
    const entry = this.models.get(modelId);
    if (!entry) {
      return true; // Unknown models are available by default
    }

    // Terminal state is always unavailable
    if (entry.state === "terminal") {
      return false;
    }

    // Check if sticky_retry has expired
    if (entry.state === "sticky_retry" && entry.expiresAt !== undefined) {
      if (Date.now() >= entry.expiresAt) {
        // Expired, remove entry and return available
        this.models.delete(modelId);
        return true;
      }
      return false;
    }

    return false;
  }

  /**
   * Mark a model as unavailable.
   *
   * @param modelId - The model identifier
   * @param state - The unavailability state ('terminal' or 'sticky_retry')
   * @param durationMs - Duration in milliseconds for sticky_retry (ignored for terminal)
   */
  markUnavailable(modelId: string, state: ModelState, durationMs?: number): void {
    const now = Date.now();
    const entry: ModelEntry = {
      state,
      markedAt: now,
    };

    if (state === "sticky_retry" && durationMs !== undefined && durationMs > 0) {
      entry.expiresAt = now + durationMs;
    }

    this.models.set(modelId, entry);
  }

  /**
   * Clear the unavailable status for a model.
   *
   * @param modelId - The model identifier to clear
   */
  clearUnavailable(modelId: string): void {
    this.models.delete(modelId);
  }

  /**
   * Get the full status for a model.
   *
   * @param modelId - The model identifier
   * @returns ModelStatus with availability and state information
   */
  getStatus(modelId: string): ModelStatus {
    const entry = this.models.get(modelId);

    if (!entry) {
      return { available: true };
    }

    const now = Date.now();

    // Check if sticky_retry has expired
    if (entry.state === "sticky_retry" && entry.expiresAt !== undefined) {
      if (now >= entry.expiresAt) {
        this.models.delete(modelId);
        return { available: true };
      }

      return {
        available: false,
        state: entry.state,
        retryAfterMs: entry.expiresAt - now,
        markedAt: entry.markedAt,
      };
    }

    // Terminal state
    return {
      available: false,
      state: entry.state,
      retryAfterMs: 0,
      markedAt: entry.markedAt,
    };
  }

  /**
   * Get the remaining time in milliseconds before retry is allowed.
   *
   * @param modelId - The model identifier
   * @returns Remaining milliseconds, or 0 if immediately available or terminal
   */
  getRetryAfter(modelId: string): number {
    const entry = this.models.get(modelId);

    if (!entry) {
      return 0;
    }

    if (entry.state === "terminal") {
      return 0; // Terminal models don't have a retry period
    }

    if (entry.expiresAt !== undefined) {
      const remaining = entry.expiresAt - Date.now();
      return remaining > 0 ? remaining : 0;
    }

    return 0;
  }

  /**
   * Cleanup expired sticky_retry entries.
   * Called automatically by the cleanup timer.
   */
  cleanup(): void {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [modelId, entry] of this.models) {
      if (
        entry.state === "sticky_retry" &&
        entry.expiresAt !== undefined &&
        now >= entry.expiresAt
      ) {
        toDelete.push(modelId);
      }
    }

    for (const modelId of toDelete) {
      this.models.delete(modelId);
    }
  }

  /**
   * Dispose of the service, clearing the cleanup timer.
   * Call this when shutting down to prevent memory leaks.
   */
  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.models.clear();
  }

  /**
   * Start the automatic cleanup timer.
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, DEFAULT_CLEANUP_INTERVAL_MS);

    // Prevent timer from keeping process alive
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }
}
