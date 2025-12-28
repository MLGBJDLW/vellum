// ============================================
// Graceful Shutdown Handler (T024)
// ============================================

/**
 * Graceful shutdown handling for agent loops.
 *
 * Handles SIGINT, SIGTERM, and SIGQUIT signals to ensure
 * proper state persistence before exit.
 *
 * @module @vellum/core/agent/shutdown
 */

import type { AgentLoop } from "./loop.js";
import type { SessionSnapshot, SnapshotContext, StatePersister } from "./state-persister.js";
import { createSnapshot } from "./state-persister.js";

/**
 * Shutdown signal types handled by the handler.
 */
export type ShutdownSignal = "SIGINT" | "SIGTERM" | "SIGQUIT";

/**
 * Options for GracefulShutdownHandler.
 */
export interface GracefulShutdownHandlerOptions {
  /** Timeout for saving state in milliseconds (default: 5000) */
  saveTimeoutMs?: number;
  /** Whether to exit the process after handling (default: true) */
  exitProcess?: boolean;
  /** Callback when shutdown starts */
  onShutdownStart?: (signal: ShutdownSignal) => void;
  /** Callback when state is saved */
  onStateSaved?: (sessionId: string) => void;
  /** Callback when shutdown completes */
  onShutdownComplete?: (exitCode: number) => void;
  /** Callback when shutdown fails */
  onShutdownError?: (error: Error) => void;
}

/**
 * Default options for graceful shutdown.
 */
const DEFAULT_OPTIONS: Required<
  Omit<
    GracefulShutdownHandlerOptions,
    "onShutdownStart" | "onStateSaved" | "onShutdownComplete" | "onShutdownError"
  >
> = {
  saveTimeoutMs: 5000,
  exitProcess: true,
};

/**
 * Result of a shutdown operation.
 */
export interface ShutdownResult {
  /** Whether shutdown was clean */
  success: boolean;
  /** The signal that triggered shutdown */
  signal: ShutdownSignal;
  /** Whether state was saved */
  stateSaved: boolean;
  /** Error if shutdown failed */
  error?: Error;
  /** Exit code */
  exitCode: number;
}

/**
 * Graceful shutdown handler for agent loops.
 *
 * Registers signal handlers to ensure session state is persisted
 * before the process exits.
 *
 * @example
 * ```typescript
 * const handler = new GracefulShutdownHandler({
 *   saveTimeoutMs: 5000,
 *   onShutdownStart: (signal) => console.log(`Shutting down: ${signal}`),
 * });
 *
 * const agentLoop = new AgentLoop({ ... });
 * const persister = new FileStatePersister({ baseDir: '/project' });
 *
 * handler.register(agentLoop, persister);
 *
 * // Later, to unregister:
 * handler.unregister();
 * ```
 */
export class GracefulShutdownHandler {
  private readonly options: Required<
    Omit<
      GracefulShutdownHandlerOptions,
      "onShutdownStart" | "onStateSaved" | "onShutdownComplete" | "onShutdownError"
    >
  > &
    Pick<
      GracefulShutdownHandlerOptions,
      "onShutdownStart" | "onStateSaved" | "onShutdownComplete" | "onShutdownError"
    >;

  private agentLoop: AgentLoop | null = null;
  private persister: StatePersister | null = null;
  private isShuttingDown = false;
  private signalHandlers: Map<ShutdownSignal, NodeJS.SignalsListener> = new Map();

  /** Context provider for creating snapshots */
  private contextProvider: (() => Partial<SnapshotContext>) | null = null;

  constructor(options?: GracefulShutdownHandlerOptions) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
    };
  }

  /**
   * Registers signal handlers for an agent loop.
   *
   * @param agentLoop - The agent loop to handle shutdown for
   * @param persister - The state persister to save state to
   * @param contextProvider - Optional function to provide additional context
   */
  register(
    agentLoop: AgentLoop,
    persister: StatePersister,
    contextProvider?: () => Partial<SnapshotContext>
  ): void {
    // Unregister any existing handlers
    this.unregister();

    this.agentLoop = agentLoop;
    this.persister = persister;
    this.contextProvider = contextProvider ?? null;

    // Create handlers for each signal
    const signals: ShutdownSignal[] = ["SIGINT", "SIGTERM", "SIGQUIT"];

    for (const signal of signals) {
      const handler = () => {
        void this.handleSignal(signal);
      };
      this.signalHandlers.set(signal, handler);
      process.on(signal, handler);
    }
  }

  /**
   * Unregisters all signal handlers.
   */
  unregister(): void {
    for (const [signal, handler] of this.signalHandlers) {
      process.off(signal, handler);
    }
    this.signalHandlers.clear();
    this.agentLoop = null;
    this.persister = null;
    this.contextProvider = null;
    this.isShuttingDown = false;
  }

  /**
   * Handles a shutdown signal.
   *
   * @param signal - The signal that was received
   */
  private async handleSignal(signal: ShutdownSignal): Promise<void> {
    // Prevent multiple shutdown attempts
    if (this.isShuttingDown) {
      return;
    }

    // Notify callback
    this.options.onShutdownStart?.(signal);

    const result = await this.shutdown(signal);

    // Call complete callback
    this.options.onShutdownComplete?.(result.exitCode);

    // Exit process if configured
    if (this.options.exitProcess) {
      process.exit(result.exitCode);
    }
  }

  /**
   * Performs shutdown with state saving.
   *
   * @param signal - The signal that triggered shutdown
   * @returns ShutdownResult
   */
  async shutdown(signal: ShutdownSignal): Promise<ShutdownResult> {
    // Set shutting down flag (also prevents multiple calls)
    this.isShuttingDown = true;

    const result: ShutdownResult = {
      success: false,
      signal,
      stateSaved: false,
      exitCode: 1,
    };

    if (!this.agentLoop || !this.persister) {
      result.error = new Error("Shutdown handler not registered");
      this.options.onShutdownError?.(result.error);
      return result;
    }

    try {
      // Cancel the agent loop
      this.agentLoop.cancel(`Received ${signal}`);

      // Create snapshot
      const snapshot = this.createSnapshotFromLoop();

      // Save with timeout
      const saved = await this.saveWithTimeout(snapshot);

      if (saved) {
        result.stateSaved = true;
        this.options.onStateSaved?.(snapshot.id);
        result.success = true;
        result.exitCode = 0;
      } else {
        // Save failed or timed out
        result.error = new Error("Failed to save state");
        this.options.onShutdownError?.(result.error);
      }
    } catch (error) {
      result.error = error instanceof Error ? error : new Error(String(error));
      result.exitCode = 1;
      this.options.onShutdownError?.(result.error);
    }

    return result;
  }

  /**
   * Creates a snapshot from the current agent loop state.
   */
  private createSnapshotFromLoop(): SessionSnapshot {
    if (!this.agentLoop) {
      throw new Error("No agent loop registered");
    }

    const config = this.agentLoop.getConfig();
    const state = this.agentLoop.getState();
    const stateContext = this.agentLoop.getContext();
    const messages = this.agentLoop.getMessages();
    const terminationContext = this.agentLoop.getTerminationContext();

    // Get additional context from provider
    const additionalContext = this.contextProvider?.() ?? {};

    const context: SnapshotContext = {
      stateContext,
      cwd: config.cwd,
      projectRoot: config.projectRoot,
      providerType: config.providerType,
      model: config.model,
      mode: config.mode.name,
      tokenUsage: terminationContext.tokenUsage,
      ...additionalContext,
    };

    return createSnapshot(config.sessionId, state, messages, context);
  }

  /**
   * Saves a snapshot with a timeout.
   *
   * @param snapshot - The snapshot to save
   * @returns true if saved successfully within timeout
   */
  private async saveWithTimeout(snapshot: SessionSnapshot): Promise<boolean> {
    if (!this.persister) {
      return false;
    }

    return new Promise<boolean>((resolve) => {
      let settled = false;

      // Set up timeout
      const timeoutId = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve(false);
        }
      }, this.options.saveTimeoutMs);

      // Attempt to save
      this.persister
        ?.save(snapshot)
        .then(() => {
          if (!settled) {
            settled = true;
            clearTimeout(timeoutId);
            resolve(true);
          }
        })
        .catch(() => {
          if (!settled) {
            settled = true;
            clearTimeout(timeoutId);
            resolve(false);
          }
        });
    });
  }

  /**
   * Returns whether the handler is currently shutting down.
   */
  isInShutdown(): boolean {
    return this.isShuttingDown;
  }

  /**
   * Returns the configured save timeout.
   */
  getSaveTimeoutMs(): number {
    return this.options.saveTimeoutMs;
  }
}

/**
 * Creates and registers a graceful shutdown handler.
 *
 * Convenience function for common use case.
 *
 * @param agentLoop - The agent loop to handle shutdown for
 * @param persister - The state persister to save state to
 * @param options - Handler options
 * @returns The created handler
 */
export function registerShutdownHandler(
  agentLoop: AgentLoop,
  persister: StatePersister,
  options?: GracefulShutdownHandlerOptions
): GracefulShutdownHandler {
  const handler = new GracefulShutdownHandler(options);
  handler.register(agentLoop, persister);
  return handler;
}
