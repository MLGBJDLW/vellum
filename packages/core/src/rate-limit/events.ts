/**
 * Resilience Events - Rate Limiting & Retry Event Bus
 *
 * Provides event definitions and a type-safe event bus for resilience-related events
 * including rate limiting, retry attempts, and circuit breaker state changes.
 *
 * @module @vellum/core/rate-limit/events
 */

import { z } from "zod";

// ============================================
// Event Payload Schemas (Zod Validated)
// ============================================

/**
 * Payload for rate limit throttle events.
 * Emitted when a request is delayed due to rate limiting.
 */
export const RateLimitThrottleEventSchema = z.object({
  /** Key identifier for the rate limited bucket */
  key: z.string(),
  /** Wait time in milliseconds */
  waitTimeMs: z.number(),
  /** Current available tokens */
  availableTokens: z.number(),
  /** Bucket capacity */
  capacity: z.number(),
  /** Timestamp of the event */
  timestamp: z.number(),
});
export type RateLimitThrottleEvent = z.infer<typeof RateLimitThrottleEventSchema>;

/**
 * Payload for rate limit exceeded events.
 * Emitted when a request is rejected due to rate limiting.
 */
export const RateLimitExceededEventSchema = z.object({
  /** Key identifier for the rate limited bucket */
  key: z.string(),
  /** Reason for rejection */
  reason: z.enum(["exceeded", "max_wait"]),
  /** Wait time that would be required */
  waitTimeMs: z.number(),
  /** Maximum allowed wait time (if applicable) */
  maxWaitMs: z.number().optional(),
  /** Timestamp of the event */
  timestamp: z.number(),
});
export type RateLimitExceededEvent = z.infer<typeof RateLimitExceededEventSchema>;

/**
 * Payload for retry attempt events.
 * Emitted before each retry attempt.
 */
export const RetryAttemptEventSchema = z.object({
  /** Current attempt number (1-based) */
  attempt: z.number(),
  /** Maximum number of attempts */
  maxAttempts: z.number(),
  /** Delay before this retry in milliseconds */
  delayMs: z.number(),
  /** Error that triggered the retry */
  errorMessage: z.string(),
  /** Error code if available */
  errorCode: z.string().optional(),
  /** Source of retry (provider name, session, etc.) */
  source: z.string().optional(),
  /** Timestamp of the event */
  timestamp: z.number(),
});
export type RetryAttemptEvent = z.infer<typeof RetryAttemptEventSchema>;

/**
 * Payload for retry completed events.
 * Emitted when retry operation completes (success or final failure).
 */
export const RetryCompletedEventSchema = z.object({
  /** Whether the operation succeeded */
  success: z.boolean(),
  /** Total attempts made */
  totalAttempts: z.number(),
  /** Total time spent in milliseconds */
  totalTimeMs: z.number(),
  /** Final error message if failed */
  errorMessage: z.string().optional(),
  /** Source of retry */
  source: z.string().optional(),
  /** Timestamp of the event */
  timestamp: z.number(),
});
export type RetryCompletedEvent = z.infer<typeof RetryCompletedEventSchema>;

// ============================================
// Event Types
// ============================================

/**
 * All resilience event types.
 */
export type ResilienceEventType =
  | "rateLimitThrottle"
  | "rateLimitExceeded"
  | "retryAttempt"
  | "retryCompleted";

/**
 * Event payloads by type.
 */
export interface ResilienceEventPayloads {
  rateLimitThrottle: RateLimitThrottleEvent;
  rateLimitExceeded: RateLimitExceededEvent;
  retryAttempt: RetryAttemptEvent;
  retryCompleted: RetryCompletedEvent;
}

/**
 * Schema map for validation.
 */
const EVENT_SCHEMAS: Record<ResilienceEventType, z.ZodType> = {
  rateLimitThrottle: RateLimitThrottleEventSchema,
  rateLimitExceeded: RateLimitExceededEventSchema,
  retryAttempt: RetryAttemptEventSchema,
  retryCompleted: RetryCompletedEventSchema,
};

// ============================================
// Event Listener Types
// ============================================

/**
 * Type-safe event listener function.
 */
export type ResilienceEventListener<T extends ResilienceEventType> = (
  event: ResilienceEventPayloads[T]
) => void;

/**
 * Options for event subscription.
 */
export interface ResilienceSubscribeOptions {
  /** Only receive events once then automatically unsubscribe */
  once?: boolean;
}

// ============================================
// ResilienceEventBus
// ============================================

/**
 * Type-safe event bus for resilience events.
 *
 * Features:
 * - Zod validation for all event payloads
 * - Type-safe event emission and subscription
 * - Support for one-time listeners
 * - Event listener cleanup
 * - Global singleton for cross-module communication
 *
 * @example
 * ```typescript
 * const eventBus = new ResilienceEventBus();
 *
 * // Subscribe to rate limit events
 * eventBus.on('rateLimitThrottle', (event) => {
 *   console.log(`Rate limited: waiting ${event.waitTimeMs}ms`);
 * });
 *
 * // Subscribe to retry events
 * eventBus.on('retryAttempt', (event) => {
 *   console.log(`Retry ${event.attempt}/${event.maxAttempts}`);
 * });
 * ```
 */
export class ResilienceEventBus {
  readonly #listeners: Map<ResilienceEventType, Set<ResilienceEventListener<ResilienceEventType>>>;
  readonly #onceListeners: Set<ResilienceEventListener<ResilienceEventType>>;
  readonly #validateOnEmit: boolean;

  /**
   * Creates a new ResilienceEventBus.
   *
   * @param options - Configuration options
   */
  constructor(options: { validateOnEmit?: boolean } = {}) {
    this.#listeners = new Map();
    this.#onceListeners = new Set();
    this.#validateOnEmit = options.validateOnEmit ?? true;
  }

  /**
   * Subscribe to an event type.
   *
   * @param type - Event type to subscribe to
   * @param listener - Listener function
   * @param options - Subscription options
   * @returns Unsubscribe function
   */
  on<T extends ResilienceEventType>(
    type: T,
    listener: ResilienceEventListener<T>,
    options?: ResilienceSubscribeOptions
  ): () => void {
    if (!this.#listeners.has(type)) {
      this.#listeners.set(type, new Set());
    }

    // Safe cast since we just ensured it exists above
    const listeners = this.#listeners.get(type) as Set<
      ResilienceEventListener<ResilienceEventType>
    >;
    const wrappedListener = listener as ResilienceEventListener<ResilienceEventType>;
    listeners.add(wrappedListener);

    if (options?.once) {
      this.#onceListeners.add(wrappedListener);
    }

    return () => {
      listeners.delete(wrappedListener);
      this.#onceListeners.delete(wrappedListener);
    };
  }

  /**
   * Subscribe to an event type for one emission only.
   *
   * @param type - Event type to subscribe to
   * @param listener - Listener function
   * @returns Unsubscribe function
   */
  once<T extends ResilienceEventType>(type: T, listener: ResilienceEventListener<T>): () => void {
    return this.on(type, listener, { once: true });
  }

  /**
   * Remove a specific listener.
   *
   * @param type - Event type
   * @param listener - Listener to remove
   */
  off<T extends ResilienceEventType>(type: T, listener: ResilienceEventListener<T>): void {
    const listeners = this.#listeners.get(type);
    if (listeners) {
      const wrappedListener = listener as ResilienceEventListener<ResilienceEventType>;
      listeners.delete(wrappedListener);
      this.#onceListeners.delete(wrappedListener);
    }
  }

  /**
   * Emit an event to all subscribers.
   *
   * @param type - Event type to emit
   * @param payload - Event payload (will be validated if validateOnEmit is true)
   */
  emit<T extends ResilienceEventType>(type: T, payload: ResilienceEventPayloads[T]): void {
    // Validate payload if enabled
    if (this.#validateOnEmit) {
      const schema = EVENT_SCHEMAS[type];
      const result = schema.safeParse(payload);
      if (!result.success) {
        console.warn(
          `[ResilienceEventBus] Invalid payload for event "${type}":`,
          result.error.issues
        );
        return;
      }
    }

    const listeners = this.#listeners.get(type);
    if (!listeners || listeners.size === 0) {
      return;
    }

    // Create a copy to handle once listeners being removed during iteration
    const listenersArray = Array.from(listeners);

    for (const listener of listenersArray) {
      try {
        listener(payload);
      } catch (error) {
        console.error(`[ResilienceEventBus] Error in listener for "${type}":`, error);
      }

      // Remove once listeners
      if (this.#onceListeners.has(listener)) {
        listeners.delete(listener);
        this.#onceListeners.delete(listener);
      }
    }
  }

  /**
   * Remove all listeners for a specific event type.
   *
   * @param type - Event type (optional, clears all if not provided)
   */
  clear(type?: ResilienceEventType): void {
    if (type) {
      this.#listeners.delete(type);
    } else {
      this.#listeners.clear();
      this.#onceListeners.clear();
    }
  }

  /**
   * Get the number of listeners for an event type.
   *
   * @param type - Event type
   * @returns Number of listeners
   */
  listenerCount(type: ResilienceEventType): number {
    return this.#listeners.get(type)?.size ?? 0;
  }
}

// ============================================
// Global Instance
// ============================================

/**
 * Global resilience event bus instance.
 * Use this for cross-module event communication.
 */
let globalResilienceEventBus: ResilienceEventBus | null = null;

/**
 * Get or create the global resilience event bus.
 *
 * @param options - Configuration options (only used on first call)
 * @returns Global ResilienceEventBus instance
 */
export function getResilienceEventBus(options?: { validateOnEmit?: boolean }): ResilienceEventBus {
  if (!globalResilienceEventBus) {
    globalResilienceEventBus = new ResilienceEventBus(options);
  }
  return globalResilienceEventBus;
}

/**
 * Create a new ResilienceEventBus instance (for testing or isolation).
 *
 * @param options - Configuration options
 * @returns New ResilienceEventBus instance
 */
export function createResilienceEventBus(options?: {
  validateOnEmit?: boolean;
}): ResilienceEventBus {
  return new ResilienceEventBus(options);
}

/**
 * Reset the global event bus (for testing).
 */
export function resetGlobalResilienceEventBus(): void {
  globalResilienceEventBus?.clear();
  globalResilienceEventBus = null;
}
