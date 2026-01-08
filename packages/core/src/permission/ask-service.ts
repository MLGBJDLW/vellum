/**
 * Permission Ask Service for Vellum
 *
 * Manages user permission prompts with configurable handlers.
 * Implements REQ-009: User prompt with 30 second timeout → deny.
 *
 * @module @vellum/core/permission
 */

import { CONFIG_DEFAULTS } from "../config/defaults.js";
import type { PermissionInfo, PermissionResponse } from "./types.js";

// ============================================
// Constants
// ============================================

/**
 * Default timeout for permission prompts in milliseconds (30 seconds).
 * EC-006: Timeout defaults to deny.
 */
export const DEFAULT_ASK_TIMEOUT_MS = CONFIG_DEFAULTS.timeouts.permissionAsk;

// ============================================
// Types
// ============================================

/**
 * Context provided to permission handlers.
 */
export interface AskContext {
  /** Timeout in milliseconds for this prompt */
  timeoutMs: number;
  /** Signal that aborts when timeout expires */
  signal: AbortSignal;
}

/**
 * Handler function for permission prompts.
 * Returns undefined if the handler couldn't get a response (e.g., no UI available).
 */
export type PermissionAskHandler = (
  info: PermissionInfo,
  context: AskContext
) => Promise<PermissionResponse | undefined>;

/**
 * Result of asking for permission.
 */
export interface AskResult {
  /** The response received */
  response: PermissionResponse;
  /** Whether the response was due to timeout */
  timedOut: boolean;
  /** Duration in milliseconds to get the response */
  durationMs: number;
}

/**
 * Options for PermissionAskService.
 */
export interface PermissionAskServiceOptions {
  /** Default timeout for prompts in milliseconds */
  defaultTimeoutMs?: number;
  /** Initial handler to set */
  handler?: PermissionAskHandler;
}

// ============================================
// PermissionAskService
// ============================================

/**
 * Service for prompting users for permissions.
 *
 * Features:
 * - Injectable handler for TUI/CLI to provide UI
 * - Configurable timeout (default 30s)
 * - Timeout defaults to deny (EC-006)
 * - Abort signal support
 *
 * @example
 * ```typescript
 * const askService = new PermissionAskService();
 *
 * // Set handler (TUI/CLI provides this)
 * askService.setHandler(async (info, ctx) => {
 *   // Show UI and get response
 *   return await showPermissionDialog(info, ctx.signal);
 * });
 *
 * // Ask for permission
 * const result = await askService.askPermission({
 *   id: 'perm_123',
 *   type: 'bash',
 *   title: 'Allow command execution?',
 *   sessionId: 'sess_1',
 *   messageId: 'msg_1',
 *   time: { created: Date.now() }
 * });
 *
 * if (result.timedOut) {
 *   console.log('Timed out - defaulted to deny');
 * }
 * ```
 */
export class PermissionAskService {
  #handler: PermissionAskHandler | undefined;
  readonly #defaultTimeoutMs: number;

  /**
   * Creates a new PermissionAskService.
   *
   * @param options - Configuration options
   */
  constructor(options: PermissionAskServiceOptions = {}) {
    this.#defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_ASK_TIMEOUT_MS;
    this.#handler = options.handler;
  }

  /**
   * Set the permission prompt handler.
   *
   * The handler is typically provided by the TUI/CLI layer to
   * present UI for the user to respond to permission prompts.
   *
   * @param handler - Handler function for permission prompts
   */
  setHandler(handler: PermissionAskHandler | undefined): void {
    this.#handler = handler;
  }

  /**
   * Get the current handler.
   *
   * @returns The current handler or undefined if not set
   */
  getHandler(): PermissionAskHandler | undefined {
    return this.#handler;
  }

  /**
   * Check if a handler is currently set.
   *
   * @returns true if a handler is set
   */
  hasHandler(): boolean {
    return this.#handler !== undefined;
  }

  /**
   * Ask for permission with timeout.
   *
   * If no handler is set, returns "reject" immediately.
   * If handler returns undefined, returns "reject".
   * If timeout expires, returns "reject" (EC-006).
   *
   * @param info - Permission information to display
   * @param options - Optional overrides
   * @returns Ask result with response and metadata
   */
  async askPermission(info: PermissionInfo, options?: { timeoutMs?: number }): Promise<AskResult> {
    const startTime = Date.now();
    const timeoutMs = options?.timeoutMs ?? this.#defaultTimeoutMs;

    // No handler - reject immediately
    if (!this.#handler) {
      return {
        response: "reject",
        timedOut: false,
        durationMs: Date.now() - startTime,
      };
    }

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const context: AskContext = {
        timeoutMs,
        signal: controller.signal,
      };

      // Race between handler and timeout
      const response = await Promise.race([
        this.#handler(info, context),
        this.#createTimeoutPromise(timeoutMs, controller.signal),
      ]);

      clearTimeout(timeoutId);

      // Handler returned undefined or timeout occurred
      if (response === undefined) {
        return {
          response: "reject",
          timedOut: controller.signal.aborted,
          durationMs: Date.now() - startTime,
        };
      }

      return {
        response,
        timedOut: false,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      // AbortError means timeout
      if (error instanceof Error && error.name === "AbortError") {
        return {
          response: "reject",
          timedOut: true,
          durationMs: Date.now() - startTime,
        };
      }

      // Any other error - reject
      return {
        response: "reject",
        timedOut: false,
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Create a promise that rejects after timeout.
   */
  #createTimeoutPromise(timeoutMs: number, signal: AbortSignal): Promise<undefined> {
    return new Promise((_, reject) => {
      const timeoutId = setTimeout(() => {
        const error = new Error("Permission prompt timed out");
        error.name = "AbortError";
        reject(error);
      }, timeoutMs);

      // If already aborted, reject immediately
      if (signal.aborted) {
        clearTimeout(timeoutId);
        const error = new Error("Permission prompt timed out");
        error.name = "AbortError";
        reject(error);
      }

      // Clean up if signal aborts
      signal.addEventListener("abort", () => {
        clearTimeout(timeoutId);
        const error = new Error("Permission prompt timed out");
        error.name = "AbortError";
        reject(error);
      });
    });
  }

  /**
   * Get the default timeout in milliseconds.
   */
  get defaultTimeoutMs(): number {
    return this.#defaultTimeoutMs;
  }
}

/**
 * Create a PermissionAskService with default options.
 *
 * @param options - Optional configuration
 * @returns Configured PermissionAskService instance
 */
export function createPermissionAskService(
  options?: PermissionAskServiceOptions
): PermissionAskService {
  return new PermissionAskService(options);
}
