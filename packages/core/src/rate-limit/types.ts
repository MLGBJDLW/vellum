// ============================================
// Rate Limiting Type Definitions - Phase 34
// ============================================

// =============================================================================
// Request Priority Types
// =============================================================================

/**
 * Request priority levels for queue management.
 * Lower ordinal = higher priority.
 */
export type RequestPriority = "critical" | "high" | "normal" | "low" | "background";

/**
 * Priority weights for queue ordering (higher = processed first).
 */
export const PRIORITY_WEIGHTS: Record<RequestPriority, number> = {
  critical: 100,
  high: 75,
  normal: 50,
  low: 25,
  background: 10,
};

// =============================================================================
// Token Bucket Types
// =============================================================================

/**
 * Configuration for a single token bucket.
 */
export interface TokenBucketConfig {
  /** Maximum tokens in bucket (capacity) */
  readonly capacity: number;
  /** Tokens added per second */
  readonly refillRate: number;
  /** Refill check interval in milliseconds (default: 100) */
  readonly refillInterval?: number;
  /** Initial token count (defaults to capacity) */
  readonly initialTokens?: number;
}

/**
 * Token bucket state snapshot for monitoring.
 */
export interface TokenBucketState {
  /** Current available tokens */
  readonly tokens: number;
  /** Timestamp of last refill */
  readonly lastRefillTime: number;
  /** Total tokens consumed since creation */
  readonly totalConsumed: number;
  /** Total milliseconds waited for tokens */
  readonly totalWaited: number;
}

// =============================================================================
// Rate Limiter Types
// =============================================================================

/**
 * Configuration for the rate limiter service.
 */
export interface RateLimiterConfig {
  /** Default bucket configuration for unknown keys */
  readonly defaultBucket?: TokenBucketConfig;
  /** Per-key bucket configurations */
  readonly buckets?: Record<string, TokenBucketConfig>;
  /** Whether to throw on rate limit exceeded (default: false, waits instead) */
  readonly throwOnExceeded?: boolean;
  /** Maximum wait time in ms before giving up (default: 60000) */
  readonly maxWaitMs?: number;
  /** Cleanup interval for stale buckets in ms (default: 300000 = 5 min) */
  readonly cleanupInterval?: number;
}

/**
 * Rate limiter state for a specific key.
 */
export interface RateLimiterKeyState {
  /** Key identifier */
  readonly key: string;
  /** Current bucket state */
  readonly bucket: TokenBucketState;
  /** Number of pending requests */
  readonly pendingRequests: number;
  /** Created timestamp */
  readonly createdAt: number;
  /** Last accessed timestamp */
  readonly lastAccessedAt: number;
}

/**
 * Overall rate limiter statistics.
 */
export interface RateLimiterStats {
  /** Number of active buckets */
  readonly activeBuckets: number;
  /** Total requests processed */
  readonly totalRequests: number;
  /** Total requests throttled (had to wait) */
  readonly throttledRequests: number;
  /** Total requests rejected */
  readonly rejectedRequests: number;
  /** Per-key states */
  readonly keys: RateLimiterKeyState[];
}

// =============================================================================
// Retry Types (aligned with provider layer)
// =============================================================================

/**
 * Retry options for rate-limited operations.
 */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  readonly maxRetries?: number;
  /** Initial delay in milliseconds (default: 1000) */
  readonly initialDelayMs?: number;
  /** Maximum delay in milliseconds (default: 60000) */
  readonly maxDelayMs?: number;
  /** Multiplier for exponential backoff (default: 2) */
  readonly backoffMultiplier?: number;
  /** Jitter factor (0-1) to randomize delays (default: 0.3) */
  readonly jitterFactor?: number;
  /** AbortSignal to cancel retry attempts */
  readonly signal?: AbortSignal;
}

// =============================================================================
// Backpressure Types
// =============================================================================

/**
 * Backpressure handling strategy.
 */
export type BackpressureStrategy = "reject" | "drop-oldest" | "drop-lowest" | "throttle";

/**
 * Backpressure state levels.
 */
export type BackpressureLevel = "normal" | "warning" | "critical";

/**
 * Backpressure configuration.
 */
export interface BackpressureConfig {
  /** Strategy for handling overflow */
  readonly strategy: BackpressureStrategy;
  /** Threshold percentages (0-100) */
  readonly thresholds: {
    readonly warning: number;
    readonly critical: number;
  };
  /** Cooldown period in ms before returning to normal */
  readonly cooldownMs: number;
}

/**
 * Current backpressure state.
 */
export interface BackpressureState {
  readonly level: BackpressureLevel;
  readonly queueUtilization: number;
  readonly lastTriggered: number | null;
}

// =============================================================================
// Default Configurations
// =============================================================================

/**
 * Default token bucket configuration.
 * Suitable for general-purpose rate limiting.
 */
export const DEFAULT_BUCKET_CONFIG: Required<TokenBucketConfig> = {
  capacity: 100,
  refillRate: 10, // 10 tokens per second
  refillInterval: 100,
  initialTokens: 100,
};

/**
 * Default rate limiter configuration.
 */
export const DEFAULT_RATE_LIMITER_CONFIG: Required<Omit<RateLimiterConfig, "buckets">> & {
  buckets: Record<string, TokenBucketConfig>;
} = {
  defaultBucket: DEFAULT_BUCKET_CONFIG,
  buckets: {},
  throwOnExceeded: false,
  maxWaitMs: 60_000,
  cleanupInterval: 5 * 60 * 1000, // 5 minutes
};
