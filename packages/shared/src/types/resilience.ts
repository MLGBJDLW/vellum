/**
 * Minimal interface for ResilienceEventBus used across packages.
 * Full implementation in @vellum/core/rate-limit/events.ts
 *
 * @module @vellum/shared/types/resilience
 */

/**
 * Event bus interface for resilience-related events.
 * Used by retry logic to emit retry/circuit-breaker events.
 */
export interface ResilienceEventBusInterface {
  /**
   * Emit an event to the bus
   */
  emit(type: string, payload: unknown): void;
}
