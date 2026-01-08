/**
 * Resilience Integration
 *
 * Wires circuit breaker, rate limiter, and provider fallback chain
 * to create resilient provider connections.
 *
 * @module cli/tui/resilience
 */

import {
  CircuitBreaker,
  type CircuitBreakerOptions,
  CircuitOpenError,
  // Rate limiter (from rate-limit module, now exported via core index)
  createRateLimiter,
  type FallbackConfig,
  type FallbackProvider,
  type FallbackResult,
  ProviderFallbackChain,
  RateLimiter,
  type RateLimiterConfig,
} from "@vellum/core";

// =============================================================================
// Types
// =============================================================================

/**
 * Provider interface for resilience wrapping
 */
export interface Provider {
  /** Provider identifier */
  id: string;
  /** Provider name for display */
  name: string;
  /** Priority (lower = higher priority) */
  priority?: number;
  /** Execute a request */
  execute: <T>(request: () => Promise<T>) => Promise<T>;
  /** Check if provider is healthy */
  isHealthy?: () => boolean;
}

/**
 * Resilient provider configuration
 */
export interface ResilientProviderConfig {
  /** Circuit breaker options */
  circuitBreaker?: Partial<CircuitBreakerOptions>;
  /** Rate limiter options */
  rateLimiter?: Partial<RateLimiterConfig>;
  /** Fallback configuration */
  fallback?: Partial<FallbackConfig>;
  /** Enable metrics collection */
  enableMetrics?: boolean;
}

/**
 * Resilient provider wrapper
 */
export interface ResilientProvider {
  /** Circuit breaker instance */
  breaker: CircuitBreaker;
  /** Rate limiter instance */
  limiter: RateLimiter;
  /** Execute a request with full resilience stack */
  execute: <T>(
    providerId: string,
    request: () => Promise<T>
  ) => Promise<{ success: boolean; value?: T; error?: Error }>;
  /** Get circuit breaker state for a provider */
  getCircuitState: (providerId: string) => string;
  /** Get rate limiter stats */
  getRateLimiterStats: () => { allowedRequests: number; throttledRequests: number };
  /** Reset all circuits */
  resetAllCircuits: () => void;
  /** Dispose resources */
  dispose: () => void;
}

/**
 * Metrics for resilience tracking
 */
export interface ResilienceMetrics {
  /** Total requests */
  totalRequests: number;
  /** Successful requests */
  successfulRequests: number;
  /** Failed requests */
  failedRequests: number;
  /** Circuit breaker trips */
  circuitTrips: number;
  /** Rate limited requests */
  rateLimitedRequests: number;
  /** Fallback activations */
  fallbackActivations: number;
}

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_CIRCUIT_BREAKER_OPTIONS: CircuitBreakerOptions = {
  failureThreshold: 5,
  resetTimeoutMs: 30000, // 30 seconds
  halfOpenMaxAttempts: 3,
  windowMs: 60000, // 1 minute
};

const DEFAULT_RATE_LIMITER_CONFIG: Partial<RateLimiterConfig> = {
  defaultBucket: {
    capacity: 60,
    refillRate: 1, // 1 token per second = 60 RPM
  },
};

// =============================================================================
// Resilience Factory
// =============================================================================

/**
 * Create a resilient provider wrapper with circuit breaker and rate limiter.
 *
 * @param providers - Array of providers to wrap
 * @param config - Resilience configuration
 * @returns Resilient provider wrapper
 *
 * @example
 * ```typescript
 * const resilient = createResilientProvider([
 *   { id: "anthropic", name: "Anthropic Claude", execute: anthropicExecute },
 *   { id: "openai", name: "OpenAI GPT", execute: openaiExecute, priority: 1 },
 * ]);
 *
 * const result = await resilient.execute("anthropic", () => client.chat(...));
 * if (result.success) {
 *   console.log(result.value);
 * } else {
 *   console.error("Request failed:", result.error);
 * }
 * ```
 */
export function createResilientProvider(
  providers: Provider[],
  config: ResilientProviderConfig = {}
): ResilientProvider {
  // Create circuit breakers for each provider
  const breakerOptions: CircuitBreakerOptions = {
    ...DEFAULT_CIRCUIT_BREAKER_OPTIONS,
    ...config.circuitBreaker,
  };

  const breakers = new Map<string, CircuitBreaker>();
  for (const provider of providers) {
    breakers.set(provider.id, new CircuitBreaker(provider.id, breakerOptions));
  }

  // Create rate limiter
  const limiterConfig: RateLimiterConfig = {
    ...DEFAULT_RATE_LIMITER_CONFIG,
    ...config.rateLimiter,
  } as RateLimiterConfig;
  const limiter = createRateLimiter(limiterConfig);

  // Metrics tracking
  const metrics: ResilienceMetrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    circuitTrips: 0,
    rateLimitedRequests: 0,
    fallbackActivations: 0,
  };

  // Get a circuit breaker for a provider (or create default)
  const getBreaker = (providerId: string): CircuitBreaker => {
    let breaker = breakers.get(providerId);
    if (!breaker) {
      breaker = new CircuitBreaker(providerId, breakerOptions);
      breakers.set(providerId, breaker);
    }
    return breaker;
  };

  // Get primary breaker
  const primaryBreaker = getBreaker(providers[0]?.id ?? "default");

  return {
    breaker: primaryBreaker,
    limiter,

    async execute<T>(
      providerId: string,
      request: () => Promise<T>
    ): Promise<{ success: boolean; value?: T; error?: Error }> {
      metrics.totalRequests++;

      // Check rate limit first
      const canProceed = limiter.tryAcquire(providerId);
      if (!canProceed) {
        metrics.rateLimitedRequests++;
        // Wait for rate limit or throw
        try {
          await limiter.acquire(providerId, 1);
        } catch {
          return {
            success: false,
            error: new Error("Rate limit exceeded"),
          };
        }
      }

      // Get circuit breaker for provider
      const breaker = getBreaker(providerId);

      // Check circuit state
      if (breaker.getState() === "OPEN") {
        metrics.circuitTrips++;
        return {
          success: false,
          error: new CircuitOpenError(providerId, breaker.getTimeUntilReset()),
        };
      }

      // Execute through circuit breaker
      try {
        const result = await breaker.execute(request);
        metrics.successfulRequests++;
        return {
          success: true,
          value: result,
        };
      } catch (error) {
        metrics.failedRequests++;

        // If circuit opened, record it
        if (error instanceof CircuitOpenError) {
          metrics.circuitTrips++;
        }

        return {
          success: false,
          error: error as Error,
        };
      }
    },

    getCircuitState(providerId: string): string {
      const breaker = breakers.get(providerId);
      return breaker?.getState() ?? "unknown";
    },

    getRateLimiterStats() {
      return {
        allowedRequests: metrics.totalRequests - metrics.rateLimitedRequests,
        throttledRequests: metrics.rateLimitedRequests,
      };
    },

    resetAllCircuits() {
      for (const breaker of breakers.values()) {
        breaker.reset();
      }
      metrics.circuitTrips = 0;
    },

    dispose() {
      breakers.clear();
    },
  };
}

/**
 * Create a simple circuit breaker for a single operation.
 *
 * @param id - Circuit breaker identifier
 * @param options - Circuit breaker options
 * @returns Circuit breaker instance
 *
 * @example
 * ```typescript
 * const breaker = createCircuitBreaker("api", { failureThreshold: 3 });
 * try {
 *   const result = await breaker.execute(() => apiCall());
 * } catch (error) {
 *   if (error instanceof CircuitOpenError) {
 *     console.log("Circuit is open, service unavailable");
 *   }
 * }
 * ```
 */
export function createCircuitBreaker(
  id: string = "default",
  options: Partial<CircuitBreakerOptions> = {}
): CircuitBreaker {
  return new CircuitBreaker(id, {
    ...DEFAULT_CIRCUIT_BREAKER_OPTIONS,
    ...options,
  });
}

/**
 * Create a rate limiter for API calls.
 *
 * @param config - Rate limiter configuration
 * @returns Rate limiter instance
 *
 * @example
 * ```typescript
 * const limiter = createApiRateLimiter({
 *   defaultBucket: { capacity: 100, refillRate: 10 },
 * });
 *
 * if (limiter.tryAcquire("api-key")) {
 *   await makeApiCall();
 * } else {
 *   console.log("Rate limited, please wait");
 * }
 * ```
 */
export function createApiRateLimiter(config: Partial<RateLimiterConfig> = {}): RateLimiter {
  return createRateLimiter({
    ...DEFAULT_RATE_LIMITER_CONFIG,
    ...config,
  } as RateLimiterConfig);
}

// =============================================================================
// Exports
// =============================================================================

export {
  CircuitBreaker,
  type CircuitBreakerOptions,
  CircuitOpenError,
  ProviderFallbackChain,
  type FallbackConfig,
  type FallbackResult,
  type FallbackProvider,
  RateLimiter,
  type RateLimiterConfig,
};
