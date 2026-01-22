// ============================================
// Rate Limit Events (T028)
// Type-safe event definitions for rate limiting system
// ============================================

import { z } from "zod";
import { defineEvent } from "./bus.js";

// Rate limit low warning
export const rateLimitLow = defineEvent(
  "rate-limit:low",
  z.object({
    key: z.string(),
    remainingTokens: z.number(),
    threshold: z.number(),
    timestamp: z.number(),
  })
);

// Rate limit throttled
export const rateLimitThrottled = defineEvent(
  "rate-limit:throttled",
  z.object({
    key: z.string(),
    waitTimeMs: z.number(),
    timestamp: z.number(),
  })
);

// Rate limit exceeded
export const rateLimitExceeded = defineEvent(
  "rate-limit:exceeded",
  z.object({
    key: z.string(),
    reason: z.enum(["exceeded", "max_wait"]),
    waitTimeMs: z.number(),
    timestamp: z.number(),
  })
);

// Backpressure level changed
export const backpressureLevelChanged = defineEvent(
  "rate-limit:backpressure-changed",
  z.object({
    key: z.string(),
    level: z.enum(["none", "low", "medium", "high", "critical"]),
    previousLevel: z.enum(["none", "low", "medium", "high", "critical"]),
    timestamp: z.number(),
  })
);

// Quota terminal (unrecoverable)
export const quotaTerminal = defineEvent(
  "rate-limit:quota-terminal",
  z.object({
    key: z.string(),
    reason: z.string(),
    timestamp: z.number(),
  })
);

// Quota retryable
export const quotaRetryable = defineEvent(
  "rate-limit:quota-retryable",
  z.object({
    key: z.string(),
    retryAfterMs: z.number(),
    timestamp: z.number(),
  })
);

// Rate limit acquired
export const rateLimitAcquired = defineEvent(
  "rate-limit:acquired",
  z.object({
    key: z.string(),
    tokensAcquired: z.number(),
    remainingTokens: z.number(),
    timestamp: z.number(),
  })
);

// Rate limit released
export const rateLimitReleased = defineEvent(
  "rate-limit:released",
  z.object({
    key: z.string(),
    tokensReleased: z.number(),
    timestamp: z.number(),
  })
);

// Model health changed
export const modelHealthChanged = defineEvent(
  "rate-limit:model-health-changed",
  z.object({
    modelId: z.string(),
    health: z.enum(["healthy", "degraded", "unhealthy"]),
    previousHealth: z.enum(["healthy", "degraded", "unhealthy"]).optional(),
    reason: z.string().optional(),
    timestamp: z.number(),
  })
);

// Namespace for all rate limit events
export const RateLimitEvents = {
  rateLimitLow,
  rateLimitThrottled,
  rateLimitExceeded,
  backpressureLevelChanged,
  quotaTerminal,
  quotaRetryable,
  rateLimitAcquired,
  rateLimitReleased,
  modelHealthChanged,
} as const;
