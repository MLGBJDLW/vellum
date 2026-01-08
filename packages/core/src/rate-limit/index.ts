// ============================================
// Rate Limiting Module - Phase 34
// ============================================

// =============================================================================
// Type Exports
// Note: BackpressureConfig, BackpressureState, BackpressureStrategy, and RetryOptions
// are NOT exported here to avoid conflicts with streaming/index.js and errors/index.js
// =============================================================================

export type {
  BackpressureLevel,
  RateLimiterConfig,
  RateLimiterKeyState,
  RateLimiterStats,
  RequestPriority,
  TokenBucketConfig,
  TokenBucketState,
} from "./types.js";

// =============================================================================
// Constant Exports
// =============================================================================

export {
  DEFAULT_BUCKET_CONFIG,
  DEFAULT_RATE_LIMITER_CONFIG,
  PRIORITY_WEIGHTS,
} from "./types.js";

// =============================================================================
// Class Exports
// =============================================================================

export { createRateLimiter, RateLimiter } from "./rate-limiter.js";
export { TokenBucket } from "./token-bucket.js";
