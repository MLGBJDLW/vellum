// ============================================
// Cancellation Token for Agent Operations
// ============================================

import { ErrorCode, VellumError } from "../errors/index.js";

/**
 * Error thrown when an operation is cancelled.
 */
export class CancelledError extends VellumError {
  constructor(message = "Operation was cancelled", context?: Record<string, unknown>) {
    super(message, ErrorCode.UNKNOWN, {
      context: { ...context, cancelled: true },
      isRetryable: false,
    });
    this.name = "CancelledError";
  }
}

/**
 * Callback function type for cancellation listeners.
 */
export type CancelCallback = () => void;

/**
 * Represents a pending tool execution that can be cancelled.
 */
export interface PendingTool {
  /** Unique identifier for the tool call */
  toolCallId: string;
  /** Name of the tool being executed */
  toolName: string;
  /** Abort controller for this specific tool */
  abortController: AbortController;
  /** Timestamp when tool execution started */
  startedAt: number;
}

/**
 * CancellationToken wraps AbortController to provide a richer cancellation API.
 *
 * Features:
 * - Wraps AbortController for signal-based cancellation
 * - Supports onCancel callbacks for cleanup
 * - Provides throwIfCancelled for checking cancellation state
 * - Manages pending tool executions with cleanupPendingTools()
 *
 * @example
 * ```typescript
 * const token = new CancellationToken();
 *
 * token.onCancel(() => {
 *   console.log("Cleaning up...");
 * });
 *
 * // In async code
 * token.throwIfCancelled();
 *
 * // Register a tool execution
 * const toolController = token.registerTool("call-123", "file_read");
 *
 * // Later, cancel everything
 * token.cancel();
 * ```
 */
export class CancellationToken {
  private readonly abortController: AbortController;
  private readonly callbacks: Set<CancelCallback> = new Set();
  private readonly pendingTools: Map<string, PendingTool> = new Map();
  private _reason?: string;

  constructor() {
    this.abortController = new AbortController();
  }

  /**
   * The AbortSignal associated with this token.
   * Use this to pass to fetch, stream, and other cancellable APIs.
   */
  get signal(): AbortSignal {
    return this.abortController.signal;
  }

  /**
   * Whether this token has been cancelled.
   */
  get isCancelled(): boolean {
    return this.abortController.signal.aborted;
  }

  /**
   * The reason for cancellation, if any.
   */
  get reason(): string | undefined {
    return this._reason;
  }

  /**
   * Registers a callback to be called when cancellation occurs.
   *
   * @param callback - Function to call on cancellation
   * @returns Cleanup function to unregister the callback
   */
  onCancel(callback: CancelCallback): () => void {
    this.callbacks.add(callback);

    // If already cancelled, invoke immediately
    if (this.isCancelled) {
      try {
        callback();
      } catch {
        // Ignore callback errors
      }
    }

    return () => {
      this.callbacks.delete(callback);
    };
  }

  /**
   * Throws CancelledError if this token has been cancelled.
   *
   * @throws CancelledError if cancelled
   */
  throwIfCancelled(): void {
    if (this.isCancelled) {
      throw new CancelledError(this._reason ?? "Operation was cancelled");
    }
  }

  /**
   * Cancels all operations associated with this token.
   *
   * @param reason - Optional reason for cancellation
   */
  cancel(reason?: string): void {
    if (this.isCancelled) {
      return;
    }

    this._reason = reason;
    this.abortController.abort(reason);

    // Invoke all callbacks
    for (const callback of this.callbacks) {
      try {
        callback();
      } catch {
        // Ignore callback errors to ensure all callbacks are invoked
      }
    }

    // Cleanup pending tools
    this.cleanupPendingTools();
  }

  /**
   * Registers a pending tool execution.
   *
   * @param toolCallId - Unique identifier for the tool call
   * @param toolName - Name of the tool
   * @returns AbortController for the tool execution
   */
  registerTool(toolCallId: string, toolName: string): AbortController {
    // If already cancelled, return an already-aborted controller
    if (this.isCancelled) {
      const controller = new AbortController();
      controller.abort(this._reason);
      return controller;
    }

    const controller = new AbortController();
    const pendingTool: PendingTool = {
      toolCallId,
      toolName,
      abortController: controller,
      startedAt: Date.now(),
    };

    this.pendingTools.set(toolCallId, pendingTool);

    // Link to parent signal
    const abortHandler = () => {
      controller.abort(this._reason);
    };
    this.abortController.signal.addEventListener("abort", abortHandler, { once: true });

    return controller;
  }

  /**
   * Unregisters a tool execution (call when tool completes normally).
   *
   * @param toolCallId - The tool call to unregister
   */
  unregisterTool(toolCallId: string): void {
    this.pendingTools.delete(toolCallId);
  }

  /**
   * Cancels all in-flight tool executions.
   * Called automatically when the token is cancelled.
   */
  cleanupPendingTools(): void {
    for (const [toolCallId, pendingTool] of this.pendingTools) {
      try {
        pendingTool.abortController.abort(this._reason ?? "Cancellation cleanup");
      } catch {
        // Ignore abort errors
      }
      this.pendingTools.delete(toolCallId);
    }
  }

  /**
   * Returns the list of currently pending tool executions.
   */
  getPendingTools(): readonly PendingTool[] {
    return Array.from(this.pendingTools.values());
  }

  /**
   * Creates a linked child token that is cancelled when this token is cancelled.
   *
   * @returns A new CancellationToken linked to this one
   */
  createLinkedToken(): CancellationToken {
    const child = new CancellationToken();

    if (this.isCancelled) {
      child.cancel(this._reason);
    } else {
      this.onCancel(() => {
        child.cancel(this._reason);
      });
    }

    return child;
  }
}
