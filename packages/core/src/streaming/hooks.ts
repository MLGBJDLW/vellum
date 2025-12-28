/**
 * Streaming Hooks Module
 *
 * Provides interfaces and classes for hooking into the streaming lifecycle.
 * Allows consumers to register callbacks for stream events.
 *
 * @module @vellum/core/streaming/hooks
 */

import type { StreamEvent } from "@vellum/provider";
import type { AssistantMessage } from "./collector.js";
import type { StreamError } from "./processor.js";

// =============================================================================
// T020: StreamContext and StreamingHooks Interfaces
// =============================================================================

/** Context provided to stream hooks */
export interface StreamContext {
  /** Unique stream ID */
  streamId: string;

  /** Start timestamp (ms since epoch) */
  startTime: number;

  /** Current event count */
  eventCount: number;

  /** Metadata bag for custom data */
  metadata: Record<string, unknown>;
}

/** Streaming lifecycle hooks */
export interface StreamingHooks {
  /** Called when stream starts */
  onStreamStart?: (ctx: StreamContext) => void | Promise<void>;

  /** Called for each chunk received */
  onChunk?: (event: StreamEvent, ctx: StreamContext) => void | Promise<void>;

  /** Called when stream completes successfully */
  onStreamEnd?: (message: AssistantMessage, ctx: StreamContext) => void | Promise<void>;

  /** Called when stream encounters an error */
  onStreamError?: (error: StreamError, ctx: StreamContext) => void | Promise<void>;
}

// =============================================================================
// T021: StreamingHookManager Class
// =============================================================================

/**
 * Manages multiple streaming hook registrations.
 *
 * Allows registering multiple sets of hooks and fires them
 * sequentially when events occur.
 *
 * @example
 * ```typescript
 * const manager = new StreamingHookManager();
 *
 * // Register logging hooks
 * const unregister = manager.register({
 *   onStreamStart: (ctx) => console.log(`Stream ${ctx.streamId} started`),
 *   onChunk: (event, ctx) => console.log(`Event: ${event.type}`),
 *   onStreamEnd: (msg, ctx) => console.log(`Stream completed`),
 * });
 *
 * // Fire events
 * await manager.fireStreamStart({ streamId: '123', startTime: Date.now(), eventCount: 0, metadata: {} });
 *
 * // Unregister when done
 * unregister();
 * ```
 */
export class StreamingHookManager {
  private hooks: StreamingHooks[] = [];

  /**
   * Register hooks.
   *
   * @param hooks - The hooks to register
   * @returns Unregister function to remove these hooks
   */
  register(hooks: StreamingHooks): () => void {
    this.hooks.push(hooks);
    // Return unregister function
    return () => {
      const idx = this.hooks.indexOf(hooks);
      if (idx !== -1) this.hooks.splice(idx, 1);
    };
  }

  /**
   * Fire onStreamStart for all registered hooks.
   *
   * @param ctx - The stream context
   */
  async fireStreamStart(ctx: StreamContext): Promise<void> {
    for (const hook of this.hooks) {
      await hook.onStreamStart?.(ctx);
    }
  }

  /**
   * Fire onChunk for all registered hooks.
   *
   * @param event - The stream event
   * @param ctx - The stream context
   */
  async fireChunk(event: StreamEvent, ctx: StreamContext): Promise<void> {
    for (const hook of this.hooks) {
      await hook.onChunk?.(event, ctx);
    }
  }

  /**
   * Fire onStreamEnd for all registered hooks.
   *
   * @param message - The completed assistant message
   * @param ctx - The stream context
   */
  async fireStreamEnd(message: AssistantMessage, ctx: StreamContext): Promise<void> {
    for (const hook of this.hooks) {
      await hook.onStreamEnd?.(message, ctx);
    }
  }

  /**
   * Fire onStreamError for all registered hooks.
   *
   * @param error - The stream error
   * @param ctx - The stream context
   */
  async fireStreamError(error: StreamError, ctx: StreamContext): Promise<void> {
    for (const hook of this.hooks) {
      await hook.onStreamError?.(error, ctx);
    }
  }

  /**
   * Clear all registered hooks.
   */
  clear(): void {
    this.hooks = [];
  }
}
