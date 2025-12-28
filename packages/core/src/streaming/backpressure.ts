/**
 * Backpressure Module
 *
 * Provides backpressure control for streaming systems, including queue
 * management, throughput tracking, and latency monitoring.
 *
 * @module @vellum/core/streaming/backpressure
 */

// =============================================================================
// T012: Backpressure Types and Configuration
// =============================================================================

/** Current state of backpressure system */
export type BackpressureState = "normal" | "warning" | "critical";

/** Strategy for handling backpressure */
export type BackpressureStrategy =
  | "block" // Block sender until space available
  | "drop_oldest" // Drop oldest items when full
  | "drop_newest" // Drop newest items when full
  | "coalesce"; // Merge consecutive similar items

/** Configuration for backpressure controller */
export interface BackpressureConfig {
  /** Maximum items in queue (default: 1000) */
  maxQueueSize: number;

  /** Threshold to enter warning state (default: 0.8 = 80%) */
  warningThreshold: number;

  /** Default strategy when backpressure activates */
  strategy: BackpressureStrategy;

  /** Whether to emit metrics */
  enableMetrics: boolean;
}

export const DEFAULT_BACKPRESSURE_CONFIG: BackpressureConfig = {
  maxQueueSize: 1000,
  warningThreshold: 0.8,
  strategy: "block",
  enableMetrics: false,
};

// =============================================================================
// T034: ThroughputTracker Class
// =============================================================================

/** Tracks events per second throughput */
export class ThroughputTracker {
  private events: number[] = []; // timestamps
  private readonly windowMs: number;

  constructor(windowMs: number = 1000) {
    this.windowMs = windowMs;
  }

  /** Record an event occurrence */
  record(): void {
    this.events.push(Date.now());
    this.pruneOldEvents();
  }

  /** Get events per second rate */
  eventsPerSecond(): number {
    this.pruneOldEvents();
    return this.events.length * (1000 / this.windowMs);
  }

  private pruneOldEvents(): void {
    const cutoff = Date.now() - this.windowMs;
    this.events = this.events.filter((t) => t > cutoff);
  }

  reset(): void {
    this.events = [];
  }
}

// =============================================================================
// T035: LatencyTracker Class
// =============================================================================

/** Tracks processing latency */
export class LatencyTracker {
  private samples: number[] = [];
  private readonly maxSamples: number;

  constructor(maxSamples: number = 100) {
    this.maxSamples = maxSamples;
  }

  /** Record a latency sample in ms */
  record(latencyMs: number): void {
    this.samples.push(latencyMs);
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }
  }

  /** Get average latency in ms */
  averageMs(): number {
    if (this.samples.length === 0) return 0;
    return this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
  }

  /** Get p95 latency in ms */
  p95Ms(): number {
    if (this.samples.length === 0) return 0;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const idx = Math.floor(sorted.length * 0.95);
    return sorted[idx] ?? sorted[sorted.length - 1] ?? 0;
  }

  reset(): void {
    this.samples = [];
  }
}

// =============================================================================
// T013: BackpressureController Class
// =============================================================================

/** Controller for managing backpressure in stream processing */
export class BackpressureController<T> {
  private queue: T[] = [];
  private readonly config: BackpressureConfig;
  private blocked: boolean = false;
  private waitPromise: Promise<void> | null = null;
  private resolveWait: (() => void) | null = null;

  constructor(config: Partial<BackpressureConfig> = {}) {
    this.config = { ...DEFAULT_BACKPRESSURE_CONFIG, ...config };
  }

  /** Get current backpressure state */
  get state(): BackpressureState {
    const ratio = this.queue.length / this.config.maxQueueSize;
    if (ratio >= 1) return "critical";
    if (ratio >= this.config.warningThreshold) return "warning";
    return "normal";
  }

  /** Get current queue size */
  get size(): number {
    return this.queue.length;
  }

  /** Get whether controller is blocked */
  get isBlocked(): boolean {
    return this.blocked;
  }

  /**
   * Send an item to the queue.
   * Behavior depends on strategy when queue is full:
   * - block: wait until space available
   * - drop_oldest: remove oldest item
   * - drop_newest: discard this item
   * - coalesce: merge with similar items (returns false if merged)
   */
  async send(item: T): Promise<boolean> {
    if (this.queue.length >= this.config.maxQueueSize) {
      switch (this.config.strategy) {
        case "block":
          await this.waitForSpace();
          break;
        case "drop_oldest":
          this.queue.shift();
          break;
        case "drop_newest":
          return false; // Item dropped
        case "coalesce":
          // Try to merge with last item
          if (this.canCoalesce(item)) {
            this.coalesce(item);
            return false; // Merged, not added as new item
          }
          this.queue.shift(); // Fall back to drop_oldest
          break;
      }
    }

    this.queue.push(item);
    return true;
  }

  /**
   * Receive an item from the queue.
   * Returns undefined if queue is empty.
   */
  receive(): T | undefined {
    const item = this.queue.shift();

    // If we were blocking and now have space, unblock
    if (this.blocked && this.queue.length < this.config.maxQueueSize) {
      this.unblock();
    }

    return item;
  }

  /** Check if queue has items */
  hasItems(): boolean {
    return this.queue.length > 0;
  }

  /** Clear the queue */
  clear(): void {
    this.queue = [];
    this.unblock();
  }

  private async waitForSpace(): Promise<void> {
    this.blocked = true;
    this.waitPromise = new Promise((resolve) => {
      this.resolveWait = resolve;
    });
    await this.waitPromise;
  }

  private unblock(): void {
    if (this.resolveWait) {
      this.resolveWait();
      this.resolveWait = null;
      this.waitPromise = null;
    }
    this.blocked = false;
  }

  /** Override in subclass for custom coalesce logic */
  protected canCoalesce(_item: T): boolean {
    return false; // Default: no coalescing
  }

  /** Override in subclass for custom coalesce logic */
  protected coalesce(_item: T): void {
    // Default: no-op
  }
}

// =============================================================================
// T036: AdaptiveBackpressure Class
// =============================================================================

/** Configuration for adaptive backpressure */
export interface AdaptiveBackpressureConfig extends BackpressureConfig {
  /** Latency threshold to switch from block to coalesce (ms) */
  coalesceThresholdMs: number;

  /** Latency threshold to switch from coalesce to drop_newest (ms) */
  dropThresholdMs: number;

  /** Minimum time between strategy adjustments (ms) */
  adjustmentIntervalMs: number;
}

export const DEFAULT_ADAPTIVE_CONFIG: AdaptiveBackpressureConfig = {
  ...DEFAULT_BACKPRESSURE_CONFIG,
  coalesceThresholdMs: 50,
  dropThresholdMs: 100,
  adjustmentIntervalMs: 1000,
};

/** Backpressure controller that adapts strategy based on latency */
export class AdaptiveBackpressure<T> extends BackpressureController<T> {
  private readonly throughput: ThroughputTracker;
  private readonly latency: LatencyTracker;
  private readonly adaptiveConfig: AdaptiveBackpressureConfig;
  private lastAdjustment: number = 0;

  constructor(config: Partial<AdaptiveBackpressureConfig> = {}) {
    const merged = { ...DEFAULT_ADAPTIVE_CONFIG, ...config };
    super(merged);
    this.adaptiveConfig = merged;
    this.throughput = new ThroughputTracker();
    this.latency = new LatencyTracker();
  }

  /**
   * Send with latency tracking.
   * Records throughput and timing.
   */
  async sendWithTracking(item: T): Promise<boolean> {
    const start = Date.now();
    this.throughput.record();
    const result = await this.send(item);
    this.latency.record(Date.now() - start);
    this.maybeAdjustStrategy();
    return result;
  }

  /**
   * Adjust strategy based on current latency.
   * - Low latency (< coalesceThreshold): use 'block' (fairest)
   * - Medium latency (< dropThreshold): use 'coalesce' (merge similar)
   * - High latency: use 'drop_newest' (fastest recovery)
   */
  adjustStrategy(): BackpressureStrategy {
    const avgLatency = this.latency.averageMs();

    let newStrategy: BackpressureStrategy;
    if (avgLatency < this.adaptiveConfig.coalesceThresholdMs) {
      newStrategy = "block";
    } else if (avgLatency < this.adaptiveConfig.dropThresholdMs) {
      newStrategy = "coalesce";
    } else {
      newStrategy = "drop_newest";
    }

    // Strategy change is reflected in config for parent class
    (this.adaptiveConfig as BackpressureConfig).strategy = newStrategy;
    return newStrategy;
  }

  /** Get current throughput rate */
  getThroughput(): number {
    return this.throughput.eventsPerSecond();
  }

  /** Get current average latency */
  getLatency(): number {
    return this.latency.averageMs();
  }

  /** Get P95 latency */
  getP95Latency(): number {
    return this.latency.p95Ms();
  }

  /** Get metrics snapshot */
  getMetrics(): {
    throughput: number;
    latency: number;
    p95Latency: number;
    strategy: BackpressureStrategy;
    queueSize: number;
    state: BackpressureState;
  } {
    return {
      throughput: this.getThroughput(),
      latency: this.getLatency(),
      p95Latency: this.getP95Latency(),
      strategy: this.adaptiveConfig.strategy,
      queueSize: this.size,
      state: this.state,
    };
  }

  private maybeAdjustStrategy(): void {
    const now = Date.now();
    if (now - this.lastAdjustment > this.adaptiveConfig.adjustmentIntervalMs) {
      this.adjustStrategy();
      this.lastAdjustment = now;
    }
  }

  /** Reset all state including trackers */
  reset(): void {
    this.clear();
    this.throughput.reset();
    this.latency.reset();
    this.lastAdjustment = 0;
  }
}
