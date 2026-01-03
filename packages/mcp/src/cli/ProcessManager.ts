// ============================================
// T035: Process Manager for Signal Handling
// ============================================

/**
 * Process manager for graceful signal handling.
 * Manages child processes and ensures clean shutdown on SIGINT/SIGTERM.
 *
 * @module mcp/cli/ProcessManager
 */

import type { ChildProcess } from "node:child_process";
import { DEFAULT_SHUTDOWN_TIMEOUT_MS } from "../constants.js";

// ============================================
// Types
// ============================================

/**
 * Process shutdown state.
 */
export type ProcessState = "running" | "shutting_down" | "terminated";

/**
 * Registered process entry.
 */
export interface ProcessEntry {
  /** The child process */
  process: ChildProcess;
  /** Human-readable name for logging */
  name: string;
  /** Whether SIGTERM has been sent */
  termSent: boolean;
}

/**
 * Cleanup handler function type.
 */
export type CleanupHandler = () => void | Promise<void>;

/**
 * Configuration for ProcessManager.
 */
export interface ProcessManagerConfig {
  /** Timeout in ms before SIGKILL after SIGTERM (default: 5000) */
  shutdownTimeoutMs?: number;
  /** Custom logger for shutdown messages */
  logger?: {
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
  };
}

// ============================================
// ProcessManager Implementation
// ============================================

/**
 * Process Manager
 *
 * Manages graceful shutdown of child processes and cleanup handlers.
 * Handles SIGINT (Ctrl+C) and SIGTERM with:
 *
 * 1. First signal: Send SIGTERM to all children, run cleanup handlers
 * 2. After timeout: Send SIGKILL to remaining processes
 * 3. Exit with appropriate code
 *
 * @example
 * ```typescript
 * import { ProcessManager } from '@vellum/mcp/cli';
 * import { spawn } from 'node:child_process';
 *
 * const manager = new ProcessManager({ shutdownTimeoutMs: 5000 });
 *
 * // Register a child process
 * const child = spawn('node', ['server.js']);
 * manager.registerProcess(child, 'mcp-server');
 *
 * // Register cleanup handlers
 * manager.onCleanup(async () => {
 *   await db.close();
 * });
 *
 * // Start signal handling
 * manager.installSignalHandlers();
 *
 * // Later: Manual cleanup if needed
 * await manager.shutdown();
 * ```
 */
export class ProcessManager {
  private readonly shutdownTimeoutMs: number;
  private readonly logger: ProcessManagerConfig["logger"];
  private readonly processes: Map<number, ProcessEntry> = new Map();
  private readonly cleanupHandlers: CleanupHandler[] = [];
  private state: ProcessState = "running";
  private signalHandlersInstalled = false;
  private shutdownPromise: Promise<void> | null = null;

  /**
   * Create a new ProcessManager.
   *
   * @param config - Configuration options
   */
  constructor(config?: ProcessManagerConfig) {
    this.shutdownTimeoutMs = config?.shutdownTimeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS;
    this.logger = config?.logger ?? {
      info: (msg) => console.log(`[ProcessManager] ${msg}`),
      warn: (msg) => console.warn(`[ProcessManager] ${msg}`),
      error: (msg) => console.error(`[ProcessManager] ${msg}`),
    };
  }

  /**
   * Get the current process state.
   */
  getState(): ProcessState {
    return this.state;
  }

  /**
   * Check if shutdown is in progress.
   */
  isShuttingDown(): boolean {
    return this.state === "shutting_down" || this.state === "terminated";
  }

  /**
   * Register a child process to be managed.
   *
   * @param process - Child process to manage
   * @param name - Human-readable name for logging
   */
  registerProcess(process: ChildProcess, name: string): void {
    if (this.isShuttingDown()) {
      this.logger?.warn(`Cannot register process "${name}" during shutdown`);
      return;
    }

    if (process.pid === undefined) {
      this.logger?.warn(`Process "${name}" has no PID, skipping registration`);
      return;
    }

    const entry: ProcessEntry = {
      process,
      name,
      termSent: false,
    };

    this.processes.set(process.pid, entry);
    this.logger?.info(`Registered process "${name}" (PID: ${process.pid})`);

    // Auto-remove when process exits
    process.once("exit", (code, signal) => {
      if (process.pid !== undefined) {
        this.processes.delete(process.pid);
        this.logger?.info(`Process "${name}" exited (code: ${code}, signal: ${signal})`);
      }
    });
  }

  /**
   * Unregister a child process.
   *
   * @param process - Child process to unregister
   */
  unregisterProcess(process: ChildProcess): void {
    if (process.pid !== undefined) {
      const entry = this.processes.get(process.pid);
      if (entry) {
        this.processes.delete(process.pid);
        this.logger?.info(`Unregistered process "${entry.name}"`);
      }
    }
  }

  /**
   * Register a cleanup handler to run during shutdown.
   * Handlers are called in registration order.
   *
   * @param handler - Async or sync cleanup function
   */
  onCleanup(handler: CleanupHandler): void {
    this.cleanupHandlers.push(handler);
  }

  /**
   * Install signal handlers for SIGINT and SIGTERM.
   * Safe to call multiple times (only installs once).
   */
  installSignalHandlers(): void {
    if (this.signalHandlersInstalled) {
      return;
    }

    this.signalHandlersInstalled = true;

    const handleSignal = (signal: NodeJS.Signals) => {
      this.logger?.info(`Received ${signal}`);
      this.shutdown().then(() => {
        process.exit(signal === "SIGINT" ? 130 : 143);
      });
    };

    process.on("SIGINT", () => handleSignal("SIGINT"));
    process.on("SIGTERM", () => handleSignal("SIGTERM"));

    // Windows: Handle CTRL+C and CTRL+BREAK
    if (process.platform === "win32") {
      process.on("SIGHUP", () => handleSignal("SIGHUP"));
    }
  }

  /**
   * Initiate graceful shutdown.
   *
   * 1. Send SIGTERM to all registered processes
   * 2. Run all cleanup handlers in parallel
   * 3. Wait for processes to exit (up to timeout)
   * 4. Send SIGKILL to remaining processes
   *
   * @returns Promise that resolves when shutdown is complete
   */
  async shutdown(): Promise<void> {
    // Return existing promise if shutdown already in progress
    if (this.shutdownPromise) {
      return this.shutdownPromise;
    }

    if (this.state === "terminated") {
      return;
    }

    this.state = "shutting_down";
    this.logger?.info("Starting graceful shutdown...");

    this.shutdownPromise = this.executeShutdown();
    return this.shutdownPromise;
  }

  /**
   * Execute the shutdown sequence.
   */
  private async executeShutdown(): Promise<void> {
    // Step 1: Send SIGTERM to all processes
    this.sendTermSignals();

    // Step 2: Run cleanup handlers in parallel
    await this.runCleanupHandlers();

    // Step 3: Wait for processes to exit with timeout
    const allExited = await this.waitForProcesses();

    // Step 4: Send SIGKILL to remaining processes if needed
    if (!allExited) {
      this.sendKillSignals();
    }

    this.state = "terminated";
    this.logger?.info("Shutdown complete");
  }

  /**
   * Send SIGTERM to all registered processes.
   */
  private sendTermSignals(): void {
    for (const [pid, entry] of this.processes) {
      if (!entry.termSent && entry.process.kill) {
        try {
          this.logger?.info(`Sending SIGTERM to "${entry.name}" (PID: ${pid})`);
          entry.process.kill("SIGTERM");
          entry.termSent = true;
        } catch (error) {
          this.logger?.warn(
            `Failed to send SIGTERM to "${entry.name}": ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    }
  }

  /**
   * Send SIGKILL to all remaining processes.
   */
  private sendKillSignals(): void {
    for (const [pid, entry] of this.processes) {
      if (entry.process.kill) {
        try {
          this.logger?.warn(`Sending SIGKILL to "${entry.name}" (PID: ${pid})`);
          entry.process.kill("SIGKILL");
        } catch (error) {
          // Process may have already exited
          this.logger?.warn(
            `Failed to send SIGKILL to "${entry.name}": ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    }
  }

  /**
   * Run all registered cleanup handlers.
   */
  private async runCleanupHandlers(): Promise<void> {
    if (this.cleanupHandlers.length === 0) {
      return;
    }

    this.logger?.info(`Running ${this.cleanupHandlers.length} cleanup handler(s)...`);

    const results = await Promise.allSettled(
      this.cleanupHandlers.map(async (handler) => {
        try {
          await handler();
        } catch (error) {
          throw error;
        }
      })
    );

    // Log any failures
    for (const result of results) {
      if (result.status === "rejected") {
        this.logger?.error(
          `Cleanup handler failed: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`
        );
      }
    }
  }

  /**
   * Wait for all processes to exit within timeout.
   *
   * @returns True if all processes exited, false if timeout reached
   */
  private async waitForProcesses(): Promise<boolean> {
    if (this.processes.size === 0) {
      return true;
    }

    this.logger?.info(
      `Waiting up to ${this.shutdownTimeoutMs}ms for ${this.processes.size} process(es) to exit...`
    );

    return new Promise<boolean>((resolve) => {
      // Set up timeout
      const timeout = setTimeout(() => {
        this.logger?.warn("Shutdown timeout reached, processes still running");
        resolve(false);
      }, this.shutdownTimeoutMs);

      // Check periodically if all processes have exited
      const checkInterval = setInterval(() => {
        if (this.processes.size === 0) {
          clearTimeout(timeout);
          clearInterval(checkInterval);
          resolve(true);
        }
      }, 100);
    });
  }

  /**
   * Get count of currently registered processes.
   */
  getProcessCount(): number {
    return this.processes.size;
  }

  /**
   * Get names of all registered processes.
   */
  getProcessNames(): string[] {
    return Array.from(this.processes.values()).map((entry) => entry.name);
  }
}

/**
 * Create a process manager with default configuration.
 *
 * @param config - Optional configuration
 * @returns Configured ProcessManager instance
 */
export function createProcessManager(config?: ProcessManagerConfig): ProcessManager {
  return new ProcessManager(config);
}

/**
 * Global singleton instance for convenience.
 */
let globalProcessManager: ProcessManager | null = null;

/**
 * Get or create the global ProcessManager instance.
 *
 * @param config - Configuration (only used on first call)
 * @returns Global ProcessManager instance
 */
export function getProcessManager(config?: ProcessManagerConfig): ProcessManager {
  if (!globalProcessManager) {
    globalProcessManager = new ProcessManager(config);
  }
  return globalProcessManager;
}

export default ProcessManager;
