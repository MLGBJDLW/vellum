// ============================================
// Vellum Event Bus
// Type-safe event system with Zod validation
// ============================================

import type { z } from "zod";

// ============================================
// T057 - TimeoutError Class
// ============================================

/**
 * Error thrown when EventBus.waitFor() times out waiting for an event.
 */
export class TimeoutError extends Error {
  readonly timeout: number;

  constructor(timeout: number, eventName: string) {
    super(`Timeout after ${timeout}ms waiting for event "${eventName}"`);
    this.name = "TimeoutError";
    this.timeout = timeout;
  }
}

// ============================================
// T046 - EventDefinition Interface
// ============================================

/**
 * Defines a typed event with name and Zod schema for validation.
 * Used with defineEvent() factory and EventBus for type-safe event handling.
 */
export interface EventDefinition<T> {
  readonly name: string;
  readonly schema: z.ZodType<T>;
}

// ============================================
// T047 - defineEvent Factory Function
// ============================================

/**
 * Factory function to create a type-safe event definition.
 *
 * @example
 * ```typescript
 * const userCreated = defineEvent('user:created', z.object({
 *   id: z.string(),
 *   name: z.string(),
 * }));
 *
 * bus.on(userCreated, (payload) => {
 *   // payload is typed as { id: string; name: string }
 * });
 * ```
 */
export function defineEvent<T>(name: string, schema: z.ZodType<T>): EventDefinition<T> {
  return { name, schema };
}

// ============================================
// T048, T049, T050 - EventBus Class
// ============================================

/**
 * Configuration options for EventBus.
 */
export interface EventBusOptions {
  /**
   * When true, validates payloads against Zod schemas before emit.
   * Useful for development/testing. Skip in production for performance.
   */
  debug?: boolean;
}

type Handler<T> = (payload: T) => void;

/**
 * Type-safe event bus with subscription management and optional validation.
 *
 * @example
 * ```typescript
 * const bus = new EventBus({ debug: true });
 *
 * const messageEvent = defineEvent('message', z.object({
 *   text: z.string(),
 * }));
 *
 * // Subscribe with auto-typed handler
 * const unsubscribe = bus.on(messageEvent, (payload) => {
 *   console.log(payload.text);
 * });
 *
 * // Emit with type checking
 * bus.emit(messageEvent, { text: 'Hello!' });
 *
 * // Cleanup
 * unsubscribe();
 * ```
 */
export class EventBus {
  private readonly handlers: Map<string, Set<Handler<unknown>>> = new Map();
  private readonly debug: boolean;

  constructor(options: EventBusOptions = {}) {
    this.debug = options.debug ?? false;
  }

  /**
   * Subscribe to an event. Returns an unsubscribe function.
   *
   * @param event - The event definition to subscribe to
   * @param handler - Callback invoked when event is emitted
   * @returns Unsubscribe function to remove the handler
   */
  on<T>(event: EventDefinition<T>, handler: Handler<T>): () => void {
    const handlers = this.getOrCreateHandlers(event.name);
    handlers.add(handler as Handler<unknown>);

    // Return unsubscribe function
    return () => {
      this.off(event, handler);
    };
  }

  /**
   * Subscribe to an event once. Handler auto-unsubscribes after first call.
   *
   * @param event - The event definition to subscribe to
   * @param handler - Callback invoked once when event is emitted
   * @returns Unsubscribe function (can be called before event fires)
   */
  once<T>(event: EventDefinition<T>, handler: Handler<T>): () => void {
    const wrappedHandler: Handler<T> = (payload) => {
      this.off(event, wrappedHandler);
      handler(payload);
    };

    return this.on(event, wrappedHandler);
  }

  /**
   * Unsubscribe a handler from an event.
   *
   * @param event - The event definition to unsubscribe from
   * @param handler - The handler to remove
   */
  off<T>(event: EventDefinition<T>, handler: Handler<T>): void {
    const handlers = this.handlers.get(event.name);
    if (handlers) {
      handlers.delete(handler as Handler<unknown>);
      // Clean up empty sets
      if (handlers.size === 0) {
        this.handlers.delete(event.name);
      }
    }
  }

  /**
   * Emit an event to all subscribed handlers.
   * Handlers are called synchronously in subscription order.
   *
   * @param event - The event definition to emit
   * @param payload - The payload to pass to handlers (must match schema type)
   * @throws Error if debug mode is enabled and payload fails schema validation
   */
  emit<T>(event: EventDefinition<T>, payload: T): void {
    // T050 - Debug mode validation
    if (this.debug) {
      const result = event.schema.safeParse(payload);
      if (!result.success) {
        throw new Error(
          `EventBus validation failed for event "${event.name}": ${result.error.message}`
        );
      }
    }

    const handlers = this.handlers.get(event.name);
    if (handlers) {
      // Call handlers synchronously
      for (const handler of handlers) {
        handler(payload);
      }
    }
  }

  /**
   * Check if an event has any subscribers.
   *
   * @param event - The event definition to check
   * @returns True if event has at least one subscriber
   */
  hasListeners<T>(event: EventDefinition<T>): boolean {
    const handlers = this.handlers.get(event.name);
    return handlers !== undefined && handlers.size > 0;
  }

  /**
   * Remove all handlers for a specific event or all events.
   *
   * @param event - Optional event to clear. If omitted, clears all events.
   */
  clear<T>(event?: EventDefinition<T>): void {
    if (event) {
      this.handlers.delete(event.name);
    } else {
      this.handlers.clear();
    }
  }

  private getOrCreateHandlers(eventName: string): Set<Handler<unknown>> {
    let handlers = this.handlers.get(eventName);
    if (!handlers) {
      handlers = new Set();
      this.handlers.set(eventName, handlers);
    }
    return handlers;
  }

  // ============================================
  // T056, T057 - waitFor Method
  // ============================================

  /**
   * Wait for an event to be emitted. Returns a Promise that resolves
   * with the event payload when the event fires.
   *
   * @param event - The event definition to wait for
   * @param options - Optional filter and timeout configuration
   * @param options.filter - Function to filter which payloads trigger resolution
   * @param options.timeout - Maximum ms to wait before rejecting with TimeoutError
   * @returns Promise that resolves with the event payload
   * @throws TimeoutError if timeout is specified and exceeded
   *
   * @example
   * ```typescript
   * // Wait for any message event
   * const payload = await bus.waitFor(messageEvent);
   *
   * // Wait for specific message
   * const payload = await bus.waitFor(messageEvent, {
   *   filter: (p) => p.id === 'abc',
   *   timeout: 5000,
   * });
   * ```
   */
  waitFor<T>(
    event: EventDefinition<T>,
    options?: { filter?: (payload: T) => boolean; timeout?: number }
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      let unsubscribe: (() => void) | undefined;

      const cleanup = () => {
        if (timeoutId !== undefined) {
          clearTimeout(timeoutId);
        }
        if (unsubscribe) {
          unsubscribe();
        }
      };

      // Subscribe to event
      unsubscribe = this.on(event, (payload) => {
        // Apply filter if provided
        if (options?.filter && !options.filter(payload)) {
          return; // Skip, keep waiting
        }

        // Event matched, resolve
        cleanup();
        resolve(payload);
      });

      // Set up timeout if specified
      if (options?.timeout !== undefined && options.timeout > 0) {
        const timeoutMs = options.timeout;
        timeoutId = setTimeout(() => {
          cleanup();
          reject(new TimeoutError(timeoutMs, event.name));
        }, options.timeout);
      }
    });
  }
}
