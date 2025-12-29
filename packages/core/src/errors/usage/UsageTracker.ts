// ============================================
// Usage Tracker - Error Rate Tracking
// ============================================

/**
 * Time windows for usage tracking and cooldown decisions.
 */
export type UsageWindow = "minute" | "hour" | "day";

/**
 * A usage event recording error occurrences.
 */
export interface UsageEvent {
  /** Unix timestamp in milliseconds */
  timestamp: number;
  /** Number of errors in this event */
  count: number;
}

/**
 * Options for configuring the UsageTracker.
 */
export interface UsageTrackerOptions {
  /** Thresholds per window that trigger cooldown */
  cooldownThresholds?: Partial<Record<UsageWindow, number>>;
  /** Interval for automatic pruning in milliseconds (default: 60000) */
  pruneIntervalMs?: number;
}

/** Default cooldown thresholds per window */
const DEFAULT_COOLDOWN_THRESHOLDS: Record<UsageWindow, number> = {
  minute: 10,
  hour: 100,
  day: 500,
};

/** Default prune interval: 1 minute */
const DEFAULT_PRUNE_INTERVAL_MS = 60000;

/** Maximum event age: 24 hours in milliseconds */
const MAX_EVENT_AGE_MS = 24 * 60 * 60 * 1000;

/** Window durations in milliseconds */
const WINDOW_DURATIONS: Record<UsageWindow, number> = {
  minute: 60 * 1000,
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
};

/**
 * Tracks error usage over time for rate limiting and cooldown decisions.
 *
 * Features:
 * - Records error events with timestamps (AC-007-1)
 * - Calculates usage within time windows (AC-007-2)
 * - Determines when cooldown should be applied (AC-007-3)
 * - Auto-prunes events older than 24 hours (AC-007-4)
 *
 * @example
 * ```typescript
 * const tracker = UsageTracker.getInstance();
 *
 * // Record an error occurrence
 * tracker.record();
 *
 * // Check usage in the last hour
 * const hourlyUsage = tracker.getUsage('hour');
 *
 * // Check if cooldown should be applied
 * if (tracker.shouldCooldown('minute')) {
 *   console.log('Too many errors, applying cooldown');
 * }
 * ```
 */
export class UsageTracker {
  private static instance: UsageTracker | undefined;

  private events: UsageEvent[] = [];
  private pruneTimer?: ReturnType<typeof setInterval>;
  private readonly cooldownThresholds: Record<UsageWindow, number>;
  private readonly pruneIntervalMs: number;

  private constructor(options: UsageTrackerOptions = {}) {
    this.cooldownThresholds = {
      ...DEFAULT_COOLDOWN_THRESHOLDS,
      ...options.cooldownThresholds,
    };
    this.pruneIntervalMs = options.pruneIntervalMs ?? DEFAULT_PRUNE_INTERVAL_MS;

    // Start automatic pruning
    this.startPruneTimer();
  }

  /**
   * Gets the singleton instance of UsageTracker.
   */
  static getInstance(): UsageTracker {
    if (!UsageTracker.instance) {
      UsageTracker.instance = new UsageTracker();
    }
    return UsageTracker.instance;
  }

  /**
   * Resets the singleton instance (for testing).
   * @internal
   */
  static resetInstance(): void {
    if (UsageTracker.instance) {
      UsageTracker.instance.dispose();
      UsageTracker.instance = undefined;
    }
  }

  /**
   * Records a usage event with the current timestamp.
   * AC-007-1: record() stores event with timestamp
   *
   * @param count - Number of errors to record (default: 1)
   */
  record(count = 1): void {
    this.events.push({
      timestamp: Date.now(),
      count,
    });
  }

  /**
   * Gets the total usage count within the specified time window.
   * AC-007-2: getUsage() calculates sum within window
   *
   * @param window - The time window to calculate usage for
   * @returns Total count of errors within the window
   */
  getUsage(window: UsageWindow): number {
    const now = Date.now();
    const windowStart = now - WINDOW_DURATIONS[window];

    return this.events
      .filter((event) => event.timestamp >= windowStart)
      .reduce((sum, event) => sum + event.count, 0);
  }

  /**
   * Determines if cooldown should be applied based on usage thresholds.
   * AC-007-3: shouldCooldown() returns true when threshold exceeded
   *
   * @param window - The time window to check
   * @returns true if usage exceeds the threshold for the window
   */
  shouldCooldown(window: UsageWindow): boolean {
    const usage = this.getUsage(window);
    const threshold = this.cooldownThresholds[window];
    return usage >= threshold;
  }

  /**
   * Removes events older than 24 hours.
   * AC-007-4: Events older than 24h auto-pruned
   */
  prune(): void {
    const cutoff = Date.now() - MAX_EVENT_AGE_MS;
    this.events = this.events.filter((event) => event.timestamp >= cutoff);
  }

  /**
   * Gets the current number of tracked events (for testing/debugging).
   * @internal
   */
  getEventCount(): number {
    return this.events.length;
  }

  /**
   * Clears all tracked events (for testing).
   * @internal
   */
  clear(): void {
    this.events = [];
  }

  /**
   * Disposes of the tracker, stopping the prune timer.
   */
  dispose(): void {
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = undefined;
    }
    this.events = [];
  }

  private startPruneTimer(): void {
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
    }
    this.pruneTimer = setInterval(() => {
      this.prune();
    }, this.pruneIntervalMs);

    // Allow the process to exit even if the timer is running
    if (this.pruneTimer.unref) {
      this.pruneTimer.unref();
    }
  }
}
