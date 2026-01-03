// ============================================
// Spec Workflow Handoff Executor
// ============================================

/**
 * Manages handoff from spec workflow to orchestrator for implementation.
 *
 * Provides functionality to build handoff packets, emit them for the orchestrator,
 * and await callback to resume the workflow after implementation completes.
 *
 * @module @vellum/core/spec/handoff-executor
 */

import { EventEmitter } from "node:events";
import type { SpecPhase } from "./types.js";

// =============================================================================
// Handoff Types
// =============================================================================

/**
 * Packet sent to orchestrator when handing off for implementation.
 *
 * Contains all information needed to resume the spec workflow
 * after implementation completes.
 */
export interface SpecHandoffPacket {
  /** Packet type identifier */
  type: "spec_handoff";
  /** The workflow ID being handed off */
  workflowId: string;
  /** Directory containing spec files */
  specDir: string;
  /** Path to the tasks file for implementation */
  tasksFile: string;
  /** The current phase at time of handoff */
  currentPhase: SpecPhase;
  /** Callback information for resuming */
  callback: {
    /** Target to return to after implementation */
    returnTo: "spec";
    /** Phase to resume at after callback */
    resumePhase: "validation";
    /** Checkpoint ID for recovery */
    checkpointId: string;
  };
}

/**
 * Result received from orchestrator after implementation completes.
 */
export interface ImplementationResult {
  /** Whether implementation was successful overall */
  success: boolean;
  /** List of task IDs that completed successfully */
  completedTasks: string[];
  /** List of task IDs that failed (if any) */
  failedTasks?: string[];
  /** Error message if implementation failed */
  error?: string;
}

// =============================================================================
// Handoff Executor Class
// =============================================================================

/**
 * Manages handoff from spec workflow to orchestrator/coder for implementation.
 *
 * The handoff executor is responsible for:
 * 1. Building handoff packets with all required information
 * 2. Emitting the packet for the orchestrator to receive
 * 3. Awaiting the callback when implementation completes
 *
 * @example
 * ```typescript
 * const executor = new HandoffExecutor("/path/to/spec");
 *
 * // Build and emit handoff packet
 * const packet = executor.buildPacket("workflow-123", "checkpoint-456");
 * await executor.emit(packet);
 *
 * // Wait for implementation to complete
 * const result = await executor.awaitResume();
 * if (result.success) {
 *   console.log("Implementation complete:", result.completedTasks);
 * }
 * ```
 */
export class HandoffExecutor extends EventEmitter {
  private pendingResolve: ((result: ImplementationResult) => void) | null = null;
  private pendingReject: ((error: Error) => void) | null = null;

  /**
   * Creates a new HandoffExecutor instance.
   *
   * @param specDir - Directory containing spec files
   */
  constructor(private readonly specDir: string) {
    super();
  }

  /**
   * Builds a handoff packet for sending to the orchestrator.
   *
   * @param workflowId - The workflow ID being handed off
   * @param checkpointId - The checkpoint ID for recovery
   * @returns A complete handoff packet
   */
  buildPacket(workflowId: string, checkpointId: string): SpecHandoffPacket {
    return {
      type: "spec_handoff",
      workflowId,
      specDir: this.specDir,
      tasksFile: `${this.specDir}/tasks.md`,
      currentPhase: "implementation",
      callback: {
        returnTo: "spec",
        resumePhase: "validation",
        checkpointId,
      },
    };
  }

  /**
   * Emits a handoff packet for the orchestrator to receive.
   *
   * The packet is emitted as a 'handoff' event that the orchestrator
   * should listen for and process.
   *
   * @param packet - The handoff packet to emit
   * @returns True if the event had listeners, false otherwise
   */
  emitHandoff(packet: SpecHandoffPacket): boolean {
    return this.emit("handoff", packet);
  }

  /**
   * Awaits callback from orchestrator after implementation completes.
   *
   * This method returns a promise that resolves when the orchestrator
   * calls `receiveResult()` with the implementation result.
   *
   * @param timeout - Optional timeout in milliseconds (default: no timeout)
   * @returns The implementation result
   * @throws Error if timeout is reached or an error occurs
   */
  awaitResume(timeout?: number): Promise<ImplementationResult> {
    return new Promise<ImplementationResult>((resolve, reject) => {
      this.pendingResolve = resolve;
      this.pendingReject = reject;

      if (timeout !== undefined && timeout > 0) {
        setTimeout(() => {
          if (this.pendingReject) {
            this.pendingReject(new Error(`Handoff timeout after ${timeout}ms`));
            this.pendingResolve = null;
            this.pendingReject = null;
          }
        }, timeout);
      }
    });
  }

  /**
   * Receives the implementation result from the orchestrator.
   *
   * Call this method to resolve the pending `awaitResume()` promise.
   *
   * @param result - The implementation result
   */
  receiveResult(result: ImplementationResult): void {
    if (this.pendingResolve) {
      this.pendingResolve(result);
      this.pendingResolve = null;
      this.pendingReject = null;
    } else {
      // No pending promise, emit as event instead
      super.emit("implementation:result", result);
    }
  }

  /**
   * Reports an error during implementation.
   *
   * Call this method to reject the pending `awaitResume()` promise.
   *
   * @param error - The error that occurred
   */
  receiveError(error: Error): void {
    if (this.pendingReject) {
      this.pendingReject(error);
      this.pendingResolve = null;
      this.pendingReject = null;
    } else {
      // No pending promise, emit as event instead
      super.emit("implementation:error", error);
    }
  }

  /**
   * Checks if the executor is currently awaiting a result.
   *
   * @returns True if awaiting implementation result
   */
  isAwaiting(): boolean {
    return this.pendingResolve !== null;
  }

  /**
   * Cancels the pending await operation.
   *
   * @param reason - Optional reason for cancellation
   */
  cancel(reason = "Handoff cancelled"): void {
    if (this.pendingReject) {
      this.pendingReject(new Error(reason));
      this.pendingResolve = null;
      this.pendingReject = null;
    }
  }
}
