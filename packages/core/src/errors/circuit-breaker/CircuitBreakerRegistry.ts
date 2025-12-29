// ============================================
// CircuitBreakerRegistry - T014
// Singleton registry for managing circuit breakers
// ============================================

import type { EventBus } from "../../events/bus.js";
import { CircuitBreaker, type CircuitBreakerOptions } from "./CircuitBreaker.js";

/**
 * Singleton registry for managing circuit breaker instances.
 *
 * Provides centralized access to circuit breakers by ID,
 * allowing consistent configuration and monitoring across
 * the application.
 *
 * @example
 * ```typescript
 * const registry = CircuitBreakerRegistry.getInstance();
 *
 * // Configure defaults
 * registry.configure({
 *   failureThreshold: 5,
 *   resetTimeoutMs: 30000,
 * });
 *
 * // Get or create a circuit breaker
 * const breaker = registry.get('api-service');
 *
 * // Use the breaker
 * await breaker.execute(() => callApi());
 *
 * // Monitor all breakers
 * for (const cb of registry.getAll()) {
 *   console.log(`${cb.id}: ${cb.getState()}`);
 * }
 * ```
 */
export class CircuitBreakerRegistry {
  private static instance: CircuitBreakerRegistry;

  private readonly breakers = new Map<string, CircuitBreaker>();
  private defaultOptions: CircuitBreakerOptions = {};
  private eventBus?: EventBus;

  private constructor() {}

  /**
   * Get the singleton instance of CircuitBreakerRegistry.
   */
  static getInstance(): CircuitBreakerRegistry {
    if (!CircuitBreakerRegistry.instance) {
      CircuitBreakerRegistry.instance = new CircuitBreakerRegistry();
    }
    return CircuitBreakerRegistry.instance;
  }

  /**
   * Reset the singleton instance.
   * Useful for testing to ensure clean state between tests.
   */
  static resetInstance(): void {
    if (CircuitBreakerRegistry.instance) {
      CircuitBreakerRegistry.instance.dispose();
    }
    CircuitBreakerRegistry.instance = undefined as unknown as CircuitBreakerRegistry;
  }

  /**
   * Get a circuit breaker by ID.
   * Creates a new one with default options if it doesn't exist.
   *
   * @param id - Unique identifier for the circuit breaker
   * @returns The circuit breaker instance
   */
  get(id: string): CircuitBreaker {
    let breaker = this.breakers.get(id);
    if (!breaker) {
      breaker = new CircuitBreaker(id, {
        ...this.defaultOptions,
        eventBus: this.eventBus,
      });
      this.breakers.set(id, breaker);
    }
    return breaker;
  }

  /**
   * Get a circuit breaker by ID with custom options.
   * Creates a new one with the specified options if it doesn't exist.
   * If it exists, returns the existing breaker (ignores custom options).
   *
   * @param id - Unique identifier for the circuit breaker
   * @param options - Custom options for this circuit breaker
   * @returns The circuit breaker instance
   */
  getOrCreate(id: string, options?: CircuitBreakerOptions): CircuitBreaker {
    let breaker = this.breakers.get(id);
    if (!breaker) {
      breaker = new CircuitBreaker(id, {
        ...this.defaultOptions,
        ...options,
        eventBus: options?.eventBus ?? this.eventBus,
      });
      this.breakers.set(id, breaker);
    }
    return breaker;
  }

  /**
   * Check if a circuit breaker exists with the given ID.
   *
   * @param id - Circuit breaker ID to check
   * @returns true if the circuit breaker exists
   */
  has(id: string): boolean {
    return this.breakers.has(id);
  }

  /**
   * Remove a circuit breaker by ID.
   * Disposes of the breaker to clean up any resources.
   *
   * @param id - Circuit breaker ID to remove
   * @returns true if the breaker was removed, false if it didn't exist
   */
  remove(id: string): boolean {
    const breaker = this.breakers.get(id);
    if (breaker) {
      breaker.dispose();
      this.breakers.delete(id);
      return true;
    }
    return false;
  }

  /**
   * Get all registered circuit breakers.
   *
   * @returns Array of all circuit breaker instances
   */
  getAll(): CircuitBreaker[] {
    return Array.from(this.breakers.values());
  }

  /**
   * Get all circuit breaker IDs.
   *
   * @returns Array of all registered circuit breaker IDs
   */
  getIds(): string[] {
    return Array.from(this.breakers.keys());
  }

  /**
   * Reset all circuit breakers to CLOSED state.
   * Useful for recovery scenarios or testing.
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }

  /**
   * Configure default options for new circuit breakers.
   * Does not affect existing circuit breakers.
   *
   * @param options - Default options to apply to new circuit breakers
   */
  configure(options: CircuitBreakerOptions): void {
    this.defaultOptions = { ...this.defaultOptions, ...options };
    if (options.eventBus) {
      this.eventBus = options.eventBus;
    }
  }

  /**
   * Set the EventBus for emitting circuit breaker events.
   * Applies to new circuit breakers only.
   *
   * @param eventBus - EventBus instance for event emission
   */
  setEventBus(eventBus: EventBus): void {
    this.eventBus = eventBus;
  }

  /**
   * Get the current default options.
   *
   * @returns Current default circuit breaker options
   */
  getDefaultOptions(): CircuitBreakerOptions {
    return { ...this.defaultOptions };
  }

  /**
   * Get summary statistics for all circuit breakers.
   *
   * @returns Object with counts by state
   */
  getStats(): { total: number; closed: number; open: number; halfOpen: number } {
    let closed = 0;
    let open = 0;
    let halfOpen = 0;

    for (const breaker of this.breakers.values()) {
      switch (breaker.getState()) {
        case "CLOSED":
          closed++;
          break;
        case "OPEN":
          open++;
          break;
        case "HALF_OPEN":
          halfOpen++;
          break;
      }
    }

    return {
      total: this.breakers.size,
      closed,
      open,
      halfOpen,
    };
  }

  /**
   * Dispose of all circuit breakers and clean up resources.
   * Also clears the default options and event bus.
   */
  dispose(): void {
    for (const breaker of this.breakers.values()) {
      breaker.dispose();
    }
    this.breakers.clear();
    this.defaultOptions = {};
    this.eventBus = undefined;
  }
}
