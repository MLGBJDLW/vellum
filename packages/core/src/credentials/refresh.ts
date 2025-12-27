/**
 * OAuth Token Refresh Timer
 *
 * Automatic token refresh with exponential backoff for OAuth credentials.
 * Schedules refresh before token expiry to ensure continuous authentication.
 *
 * @module credentials/refresh
 */

// =============================================================================
// Refresh Timer Types
// =============================================================================

/**
 * Configuration for RefreshTimer
 */
export interface RefreshTimerConfig {
  /** Initial backoff delay in milliseconds (default: 30000 = 30s) */
  readonly initialBackoffMs?: number;
  /** Maximum backoff delay in milliseconds (default: 300000 = 5min) */
  readonly maxBackoffMs?: number;
  /** Backoff multiplier on each failure (default: 2) */
  readonly backoffMultiplier?: number;
  /** How many minutes before expiry to trigger refresh (default: 5) */
  readonly refreshBeforeExpiryMin?: number;
  /** Maximum number of consecutive failures before giving up (default: 10) */
  readonly maxConsecutiveFailures?: number;
}

/**
 * Callback for performing the actual token refresh
 *
 * Should return the new expiry time on success, or throw/return null on failure.
 */
export type RefreshCallback = () => Promise<Date | null>;

/**
 * Events emitted by RefreshTimer
 */
export type RefreshTimerEvent =
  | { type: "token:refreshed"; newExpiresAt: Date; provider?: string }
  | { type: "token:refresh_failed"; error: string; attempt: number; nextRetryMs: number }
  | { type: "timer:started"; expiresAt: Date; refreshAt: Date }
  | { type: "timer:stopped"; reason: "manual" | "max_failures" | "success" }
  | { type: "timer:scheduled"; nextRefreshAt: Date };

/**
 * Event listener type
 */
export type RefreshTimerListener = (event: RefreshTimerEvent) => void;

/**
 * State of the refresh timer
 */
export interface RefreshTimerState {
  /** Whether the timer is currently running */
  readonly isRunning: boolean;
  /** Current token expiry time */
  readonly expiresAt: Date | null;
  /** When the next refresh is scheduled */
  readonly nextRefreshAt: Date | null;
  /** Number of consecutive failures */
  readonly consecutiveFailures: number;
  /** Current backoff delay in milliseconds */
  readonly currentBackoffMs: number;
}

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_CONFIG: Required<RefreshTimerConfig> = {
  initialBackoffMs: 30000, // 30 seconds
  maxBackoffMs: 300000, // 5 minutes
  backoffMultiplier: 2,
  refreshBeforeExpiryMin: 5,
  maxConsecutiveFailures: 10,
};

// =============================================================================
// RefreshTimer Implementation
// =============================================================================

/**
 * OAuth Token Refresh Timer
 *
 * Automatically refreshes OAuth tokens before they expire.
 * Implements exponential backoff on refresh failures.
 *
 * Features:
 * - Schedules refresh 5 minutes before token expiry
 * - Exponential backoff: 30s → 60s → 120s → 240s → 300s (max)
 * - Configurable failure thresholds
 * - Event emission for monitoring
 *
 * @example
 * ```typescript
 * const timer = new RefreshTimer({
 *   initialBackoffMs: 30000,
 *   maxBackoffMs: 300000,
 * });
 *
 * // Listen for events
 * timer.on((event) => {
 *   switch (event.type) {
 *     case 'token:refreshed':
 *       console.log('Token refreshed, new expiry:', event.newExpiresAt);
 *       break;
 *     case 'token:refresh_failed':
 *       console.log(`Refresh failed (attempt ${event.attempt}), retry in ${event.nextRetryMs}ms`);
 *       break;
 *   }
 * });
 *
 * // Start the timer with a refresh callback
 * timer.start(expiresAt, async () => {
 *   const newToken = await oauthClient.refreshToken();
 *   await credentialManager.store({ provider: 'google', value: newToken.accessToken });
 *   return newToken.expiresAt;
 * });
 *
 * // Check status
 * console.log('Timer running:', timer.isRunning());
 *
 * // Stop when done
 * timer.stop();
 * ```
 */
export class RefreshTimer {
  /** Configuration */
  private readonly config: Required<RefreshTimerConfig>;

  /** Provider name for event context */
  private provider?: string;

  /** Current token expiry time */
  private expiresAt: Date | null = null;

  /** The refresh callback */
  private refreshCallback: RefreshCallback | null = null;

  /** Timer handle */
  private timerId: ReturnType<typeof setTimeout> | null = null;

  /** Whether the timer is running */
  private running = false;

  /** Number of consecutive failures */
  private consecutiveFailures = 0;

  /** Current backoff delay */
  private currentBackoffMs: number;

  /** When the next refresh is scheduled */
  private nextRefreshAt: Date | null = null;

  /** Event listeners */
  private readonly listeners: Set<RefreshTimerListener> = new Set();

  /**
   * Create a new RefreshTimer
   *
   * @param config - Timer configuration
   * @param provider - Optional provider name for event context
   */
  constructor(config: RefreshTimerConfig = {}, provider?: string) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.currentBackoffMs = this.config.initialBackoffMs;
    this.provider = provider;
  }

  /**
   * Start the refresh timer
   *
   * Schedules the first refresh based on token expiry time.
   *
   * @param expiresAt - When the current token expires
   * @param callback - Function to call to refresh the token
   */
  start(expiresAt: Date, callback: RefreshCallback): void {
    // Stop any existing timer
    this.stop();

    this.expiresAt = expiresAt;
    this.refreshCallback = callback;
    this.running = true;
    this.consecutiveFailures = 0;
    this.currentBackoffMs = this.config.initialBackoffMs;

    // Calculate when to refresh (5 min before expiry)
    const refreshAt = this.calculateRefreshTime(expiresAt);

    this.emit({
      type: "timer:started",
      expiresAt,
      refreshAt,
    });

    this.scheduleRefresh(refreshAt);
  }

  /**
   * Stop the refresh timer
   *
   * Cancels any scheduled refresh.
   */
  stop(): void {
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }

    if (this.running) {
      this.emit({
        type: "timer:stopped",
        reason: "manual",
      });
    }

    this.running = false;
    this.refreshCallback = null;
    this.nextRefreshAt = null;
  }

  /**
   * Check if the timer is running
   *
   * @returns True if the timer is active
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get the current timer state
   *
   * @returns Current state snapshot
   */
  getState(): RefreshTimerState {
    return {
      isRunning: this.running,
      expiresAt: this.expiresAt,
      nextRefreshAt: this.nextRefreshAt,
      consecutiveFailures: this.consecutiveFailures,
      currentBackoffMs: this.currentBackoffMs,
    };
  }

  /**
   * Update the expiry time without restarting
   *
   * Useful when the token is refreshed externally.
   *
   * @param newExpiresAt - New expiry time
   */
  updateExpiry(newExpiresAt: Date): void {
    if (!this.running || !this.refreshCallback) {
      return;
    }

    this.expiresAt = newExpiresAt;
    this.consecutiveFailures = 0;
    this.currentBackoffMs = this.config.initialBackoffMs;

    // Cancel current timer and reschedule
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }

    const refreshAt = this.calculateRefreshTime(newExpiresAt);
    this.scheduleRefresh(refreshAt);
  }

  /**
   * Force an immediate refresh attempt
   *
   * @returns Promise that resolves when refresh completes
   */
  async forceRefresh(): Promise<boolean> {
    if (!this.refreshCallback) {
      return false;
    }

    return this.executeRefresh();
  }

  // ===========================================================================
  // Event Handling
  // ===========================================================================

  /**
   * Add an event listener
   *
   * @param listener - Function to call on events
   * @returns Unsubscribe function
   */
  on(listener: RefreshTimerListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Remove all event listeners
   */
  removeAllListeners(): void {
    this.listeners.clear();
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Emit an event to all listeners
   */
  private emit(event: RefreshTimerEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Ignore listener errors
      }
    }
  }

  /**
   * Calculate when to trigger refresh
   *
   * @param expiresAt - Token expiry time
   * @returns When to trigger refresh
   */
  private calculateRefreshTime(expiresAt: Date): Date {
    const refreshBeforeMs = this.config.refreshBeforeExpiryMin * 60 * 1000;
    const refreshTime = new Date(expiresAt.getTime() - refreshBeforeMs);

    // If already past refresh time, refresh immediately
    const now = new Date();
    if (refreshTime <= now) {
      return now;
    }

    return refreshTime;
  }

  /**
   * Schedule a refresh at the specified time
   */
  private scheduleRefresh(refreshAt: Date): void {
    const now = new Date();
    const delayMs = Math.max(0, refreshAt.getTime() - now.getTime());

    this.nextRefreshAt = refreshAt;

    this.emit({
      type: "timer:scheduled",
      nextRefreshAt: refreshAt,
    });

    this.timerId = setTimeout(() => {
      void this.executeRefresh();
    }, delayMs);
  }

  /**
   * Execute the refresh callback
   */
  private async executeRefresh(): Promise<boolean> {
    if (!this.refreshCallback || !this.running) {
      return false;
    }

    try {
      const newExpiresAt = await this.refreshCallback();

      if (newExpiresAt) {
        // Success - reset backoff and schedule next refresh
        this.consecutiveFailures = 0;
        this.currentBackoffMs = this.config.initialBackoffMs;
        this.expiresAt = newExpiresAt;

        this.emit({
          type: "token:refreshed",
          newExpiresAt,
          provider: this.provider,
        });

        // Schedule next refresh
        if (this.running) {
          const nextRefreshAt = this.calculateRefreshTime(newExpiresAt);
          this.scheduleRefresh(nextRefreshAt);
        }

        return true;
      } else {
        // Callback returned null - treat as failure
        return this.handleRefreshFailure("Refresh callback returned null");
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.handleRefreshFailure(errorMessage);
    }
  }

  /**
   * Handle a refresh failure with exponential backoff
   */
  private handleRefreshFailure(error: string): boolean {
    this.consecutiveFailures++;

    // Calculate next backoff
    const nextBackoffMs = Math.min(
      this.currentBackoffMs * this.config.backoffMultiplier,
      this.config.maxBackoffMs
    );

    this.emit({
      type: "token:refresh_failed",
      error,
      attempt: this.consecutiveFailures,
      nextRetryMs: this.currentBackoffMs,
    });

    // Check if we've exceeded max failures
    if (this.consecutiveFailures >= this.config.maxConsecutiveFailures) {
      this.emit({
        type: "timer:stopped",
        reason: "max_failures",
      });

      this.running = false;
      this.timerId = null;
      this.nextRefreshAt = null;
      return false;
    }

    // Schedule retry with current backoff
    const retryAt = new Date(Date.now() + this.currentBackoffMs);
    this.currentBackoffMs = nextBackoffMs;

    this.scheduleRefresh(retryAt);

    return false;
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a RefreshTimer with default settings
 *
 * @param provider - Provider name for event context
 * @returns Configured RefreshTimer
 */
export function createRefreshTimer(provider?: string): RefreshTimer {
  return new RefreshTimer({}, provider);
}

/**
 * Create a RefreshTimer with custom backoff settings
 *
 * @param initialBackoffMs - Initial backoff in milliseconds
 * @param maxBackoffMs - Maximum backoff in milliseconds
 * @param provider - Provider name for event context
 * @returns Configured RefreshTimer
 */
export function createRefreshTimerWithBackoff(
  initialBackoffMs: number,
  maxBackoffMs: number,
  provider?: string
): RefreshTimer {
  return new RefreshTimer(
    {
      initialBackoffMs,
      maxBackoffMs,
    },
    provider
  );
}
