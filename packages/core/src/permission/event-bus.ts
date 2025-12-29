/**
 * Permission Event Bus for Vellum
 *
 * Provides event definitions and a type-safe event bus for permission-related events.
 * Implements REQ-013: Permission events with Zod validation.
 *
 * @module @vellum/core/permission
 */

import { z } from "zod";

import type { TrustPreset } from "./types.js";

// ============================================
// Event Payload Schemas (Zod Validated)
// ============================================

/**
 * Payload for permission check events.
 */
export const PermissionCheckEventSchema = z.object({
  /** Name of the tool being checked */
  toolName: z.string(),
  /** Type of permission (bash, edit, etc.) */
  permissionType: z.string(),
  /** Parameters passed to the tool */
  params: z.record(z.string(), z.unknown()).optional(),
  /** Session ID */
  sessionId: z.string().optional(),
  /** Timestamp of the check */
  timestamp: z.number(),
});
export type PermissionCheckEvent = z.infer<typeof PermissionCheckEventSchema>;

/**
 * Payload for permission granted events.
 */
export const PermissionGrantedEventSchema = z.object({
  /** Name of the tool that was granted permission */
  toolName: z.string(),
  /** Type of permission */
  permissionType: z.string(),
  /** How the permission was granted */
  grantType: z.enum(["auto", "user-once", "user-always", "config"]),
  /** Pattern that was granted (if applicable) */
  pattern: z.string().optional(),
  /** Session ID */
  sessionId: z.string().optional(),
  /** Timestamp of the grant */
  timestamp: z.number(),
});
export type PermissionGrantedEvent = z.infer<typeof PermissionGrantedEventSchema>;

/**
 * Payload for permission denied events.
 */
export const PermissionDeniedEventSchema = z.object({
  /** Name of the tool that was denied permission */
  toolName: z.string(),
  /** Type of permission */
  permissionType: z.string(),
  /** Reason for denial */
  reason: z.string(),
  /** Whether this was an auto-denial (timeout, config, etc.) */
  isAutoDenial: z.boolean(),
  /** Session ID */
  sessionId: z.string().optional(),
  /** Timestamp of the denial */
  timestamp: z.number(),
});
export type PermissionDeniedEvent = z.infer<typeof PermissionDeniedEventSchema>;

/**
 * Payload for trust level changed events.
 */
export const TrustChangedEventSchema = z.object({
  /** Previous trust preset */
  previousPreset: z.enum(["paranoid", "cautious", "default", "relaxed", "yolo"]),
  /** New trust preset */
  newPreset: z.enum(["paranoid", "cautious", "default", "relaxed", "yolo"]),
  /** Source of the change */
  source: z.enum(["cli", "env", "config", "user", "system"]),
  /** Reason for the change */
  reason: z.string().optional(),
  /** Timestamp of the change */
  timestamp: z.number(),
});
export type TrustChangedEvent = z.infer<typeof TrustChangedEventSchema>;

// ============================================
// Event Types
// ============================================

/**
 * All permission event types.
 */
export type PermissionEventType =
  | "permissionCheck"
  | "permissionGranted"
  | "permissionDenied"
  | "trustChanged";

/**
 * Event payloads by type.
 */
export interface PermissionEventPayloads {
  permissionCheck: PermissionCheckEvent;
  permissionGranted: PermissionGrantedEvent;
  permissionDenied: PermissionDeniedEvent;
  trustChanged: TrustChangedEvent;
}

/**
 * Schema map for validation.
 */
const EVENT_SCHEMAS: Record<PermissionEventType, z.ZodType> = {
  permissionCheck: PermissionCheckEventSchema,
  permissionGranted: PermissionGrantedEventSchema,
  permissionDenied: PermissionDeniedEventSchema,
  trustChanged: TrustChangedEventSchema,
};

// ============================================
// Event Listener Types
// ============================================

/**
 * Type-safe event listener function.
 */
export type PermissionEventListener<T extends PermissionEventType> = (
  event: PermissionEventPayloads[T]
) => void;

/**
 * Options for event subscription.
 */
export interface SubscribeOptions {
  /** Only receive events once then automatically unsubscribe */
  once?: boolean;
}

// ============================================
// PermissionEventBus
// ============================================

/**
 * Type-safe event bus for permission events.
 *
 * Features:
 * - Zod validation for all event payloads
 * - Type-safe event emission and subscription
 * - Support for one-time listeners
 * - Event listener cleanup
 *
 * @example
 * ```typescript
 * const eventBus = new PermissionEventBus();
 *
 * // Subscribe to events
 * eventBus.on('permissionGranted', (event) => {
 *   console.log(`Permission granted for ${event.toolName}`);
 * });
 *
 * // Emit events
 * eventBus.emit('permissionGranted', {
 *   toolName: 'bash',
 *   permissionType: 'bash',
 *   grantType: 'user-once',
 *   timestamp: Date.now(),
 * });
 *
 * // One-time listener
 * eventBus.once('trustChanged', (event) => {
 *   console.log(`Trust changed to ${event.newPreset}`);
 * });
 * ```
 */
export class PermissionEventBus {
  readonly #listeners: Map<PermissionEventType, Set<PermissionEventListener<PermissionEventType>>>;
  readonly #onceListeners: Set<PermissionEventListener<PermissionEventType>>;
  readonly #validateOnEmit: boolean;

  /**
   * Creates a new PermissionEventBus.
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
  on<T extends PermissionEventType>(
    type: T,
    listener: PermissionEventListener<T>,
    options: SubscribeOptions = {}
  ): () => void {
    let listeners = this.#listeners.get(type);
    if (!listeners) {
      listeners = new Set();
      this.#listeners.set(type, listeners);
    }

    const typedListener = listener as PermissionEventListener<PermissionEventType>;
    listeners.add(typedListener);

    if (options.once) {
      this.#onceListeners.add(typedListener);
    }

    // Return unsubscribe function
    return () => this.off(type, listener);
  }

  /**
   * Subscribe to an event type for a single emission.
   *
   * @param type - Event type to subscribe to
   * @param listener - Listener function
   * @returns Unsubscribe function
   */
  once<T extends PermissionEventType>(type: T, listener: PermissionEventListener<T>): () => void {
    return this.on(type, listener, { once: true });
  }

  /**
   * Unsubscribe from an event type.
   *
   * @param type - Event type
   * @param listener - Listener function to remove
   */
  off<T extends PermissionEventType>(type: T, listener: PermissionEventListener<T>): void {
    const listeners = this.#listeners.get(type);
    if (listeners) {
      const typedListener = listener as PermissionEventListener<PermissionEventType>;
      listeners.delete(typedListener);
      this.#onceListeners.delete(typedListener);
    }
  }

  /**
   * Emit an event.
   *
   * @param type - Event type
   * @param payload - Event payload (will be validated if validateOnEmit is true)
   * @throws {z.ZodError} If validation is enabled and payload is invalid
   */
  emit<T extends PermissionEventType>(type: T, payload: PermissionEventPayloads[T]): void {
    // Validate payload if enabled
    if (this.#validateOnEmit) {
      const schema = EVENT_SCHEMAS[type];
      schema.parse(payload);
    }

    const listeners = this.#listeners.get(type);
    if (!listeners) return;

    // Collect once listeners to remove after iteration
    const toRemove: PermissionEventListener<PermissionEventType>[] = [];

    for (const listener of listeners) {
      try {
        listener(payload);
      } catch {
        // Listener errors should not break emission
      }

      if (this.#onceListeners.has(listener)) {
        toRemove.push(listener);
      }
    }

    // Remove once listeners
    for (const listener of toRemove) {
      listeners.delete(listener);
      this.#onceListeners.delete(listener);
    }
  }

  /**
   * Remove all listeners for an event type or all event types.
   *
   * @param type - Optional event type to clear. If not provided, clears all.
   */
  removeAllListeners(type?: PermissionEventType): void {
    if (type) {
      const listeners = this.#listeners.get(type);
      if (listeners) {
        for (const listener of listeners) {
          this.#onceListeners.delete(listener);
        }
        listeners.clear();
      }
    } else {
      for (const listeners of this.#listeners.values()) {
        listeners.clear();
      }
      this.#onceListeners.clear();
    }
  }

  /**
   * Get the count of listeners for an event type.
   *
   * @param type - Event type
   * @returns Number of listeners
   */
  listenerCount(type: PermissionEventType): number {
    return this.#listeners.get(type)?.size ?? 0;
  }
}

// ============================================
// Helper Functions
// ============================================

/**
 * Create a permission check event payload.
 */
export function createPermissionCheckEvent(
  toolName: string,
  permissionType: string,
  options?: {
    params?: Record<string, unknown>;
    sessionId?: string;
  }
): PermissionCheckEvent {
  return {
    toolName,
    permissionType,
    params: options?.params,
    sessionId: options?.sessionId,
    timestamp: Date.now(),
  };
}

/**
 * Create a permission granted event payload.
 */
export function createPermissionGrantedEvent(
  toolName: string,
  permissionType: string,
  grantType: PermissionGrantedEvent["grantType"],
  options?: {
    pattern?: string;
    sessionId?: string;
  }
): PermissionGrantedEvent {
  return {
    toolName,
    permissionType,
    grantType,
    pattern: options?.pattern,
    sessionId: options?.sessionId,
    timestamp: Date.now(),
  };
}

/**
 * Create a permission denied event payload.
 */
export function createPermissionDeniedEvent(
  toolName: string,
  permissionType: string,
  reason: string,
  isAutoDenial: boolean,
  options?: {
    sessionId?: string;
  }
): PermissionDeniedEvent {
  return {
    toolName,
    permissionType,
    reason,
    isAutoDenial,
    sessionId: options?.sessionId,
    timestamp: Date.now(),
  };
}

/**
 * Create a trust changed event payload.
 */
export function createTrustChangedEvent(
  previousPreset: TrustPreset,
  newPreset: TrustPreset,
  source: TrustChangedEvent["source"],
  reason?: string
): TrustChangedEvent {
  return {
    previousPreset,
    newPreset,
    source,
    reason,
    timestamp: Date.now(),
  };
}

/**
 * Create a PermissionEventBus with default options.
 *
 * @param options - Optional configuration
 * @returns Configured PermissionEventBus instance
 */
export function createPermissionEventBus(options?: {
  validateOnEmit?: boolean;
}): PermissionEventBus {
  return new PermissionEventBus(options);
}
