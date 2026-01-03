// ============================================
// Mode Switching - Safe Mode Transitions
// ============================================
// T031: ModeSwitcher class
// T032: Spec mode confirmation logic
// T033: Active work blocking logic
// T034: ModeSwitchResult type
// ============================================

import { z } from "zod";
import type { CodingMode, CodingModeConfig } from "./coding-modes.js";
import { BUILTIN_CODING_MODES, CodingModeSchema } from "./coding-modes.js";

// ============================================
// ModeSwitchResult Type (T034)
// ============================================

/**
 * Result of a mode switch operation.
 *
 * Contains information about whether the switch succeeded,
 * the reason for any failure, and mode state information.
 *
 * @example
 * ```typescript
 * // Successful switch
 * const success: ModeSwitchResult = {
 *   success: true,
 *   previousMode: 'vibe',
 *   currentMode: 'plan',
 * };
 *
 * // Failed switch
 * const failed: ModeSwitchResult = {
 *   success: false,
 *   reason: 'Cannot switch modes: file operation in progress',
 *   previousMode: 'vibe',
 *   currentMode: 'vibe',
 * };
 *
 * // Requires confirmation
 * const confirmation: ModeSwitchResult = {
 *   success: false,
 *   reason: 'Spec mode requires confirmation',
 *   previousMode: 'vibe',
 *   currentMode: 'vibe',
 *   requiresConfirmation: true,
 * };
 * ```
 */
export interface ModeSwitchResult {
  /** Whether the mode switch succeeded */
  success: boolean;
  /** Reason for failure (if any) */
  reason?: string;
  /** The mode before the switch attempt */
  previousMode: CodingMode;
  /** The current mode after the switch attempt */
  currentMode: CodingMode;
  /** Whether user confirmation is required before proceeding */
  requiresConfirmation?: boolean;
}

/**
 * Zod schema for ModeSwitchResult validation.
 */
export const ModeSwitchResultSchema = z.object({
  success: z.boolean(),
  reason: z.string().optional(),
  previousMode: CodingModeSchema,
  currentMode: CodingModeSchema,
  requiresConfirmation: z.boolean().optional(),
});

// ============================================
// Activity Tracker Interface
// ============================================

/**
 * Interface for tracking active operations that may block mode switches.
 *
 * Implementations should track file operations, tool executions,
 * and other blocking activities.
 *
 * @example
 * ```typescript
 * class MyActivityTracker implements ActivityTracker {
 *   private activeOps = new Set<string>();
 *
 *   hasActiveOperations(): boolean {
 *     return this.activeOps.size > 0;
 *   }
 *
 *   getActiveOperationTypes(): string[] {
 *     return Array.from(this.activeOps);
 *   }
 *
 *   isFileOperationInProgress(): boolean {
 *     return this.activeOps.has('file-write');
 *   }
 *
 *   isToolExecutionInProgress(): boolean {
 *     return this.activeOps.has('tool-execution');
 *   }
 * }
 * ```
 */
export interface ActivityTracker {
  /** Check if any operations are currently active */
  hasActiveOperations(): boolean;
  /** Get list of active operation types */
  getActiveOperationTypes(): string[];
  /** Check if file operations are in progress */
  isFileOperationInProgress(): boolean;
  /** Check if tool execution is in progress */
  isToolExecutionInProgress(): boolean;
}

/**
 * Default activity tracker that reports no active operations.
 *
 * Used as fallback when no tracker is provided.
 */
export class NoOpActivityTracker implements ActivityTracker {
  hasActiveOperations(): boolean {
    return false;
  }

  getActiveOperationTypes(): string[] {
    return [];
  }

  isFileOperationInProgress(): boolean {
    return false;
  }

  isToolExecutionInProgress(): boolean {
    return false;
  }
}

/**
 * Simple in-memory activity tracker for tracking blocking operations.
 *
 * @example
 * ```typescript
 * const tracker = new SimpleActivityTracker();
 *
 * // Start a file operation
 * tracker.startOperation('file-write');
 *
 * // Check if blocked
 * console.log(tracker.isFileOperationInProgress()); // true
 *
 * // Complete the operation
 * tracker.endOperation('file-write');
 * ```
 */
export class SimpleActivityTracker implements ActivityTracker {
  private readonly activeOperations = new Set<string>();

  /**
   * Start tracking an operation.
   *
   * @param type - The operation type
   */
  startOperation(type: string): void {
    this.activeOperations.add(type);
  }

  /**
   * Stop tracking an operation.
   *
   * @param type - The operation type
   */
  endOperation(type: string): void {
    this.activeOperations.delete(type);
  }

  /**
   * Clear all tracked operations.
   */
  clearAll(): void {
    this.activeOperations.clear();
  }

  hasActiveOperations(): boolean {
    return this.activeOperations.size > 0;
  }

  getActiveOperationTypes(): string[] {
    return Array.from(this.activeOperations);
  }

  isFileOperationInProgress(): boolean {
    return (
      this.activeOperations.has("file-write") ||
      this.activeOperations.has("file-delete") ||
      this.activeOperations.has("file-create")
    );
  }

  isToolExecutionInProgress(): boolean {
    return (
      this.activeOperations.has("tool-execution") || this.activeOperations.has("bash-execution")
    );
  }
}

// ============================================
// ModeSwitcher Configuration
// ============================================

/**
 * Configuration options for ModeSwitcher.
 */
export interface ModeSwitcherConfig {
  /** Initial mode (defaults to 'vibe') */
  initialMode?: CodingMode;
  /** Activity tracker for blocking checks */
  activityTracker?: ActivityTracker;
  /** Whether to require confirmation for spec mode */
  requireSpecConfirmation?: boolean;
  /** Available mode configurations */
  modes?: Record<CodingMode, CodingModeConfig>;
}

// ============================================
// ModeSwitcher Class (T031, T032, T033)
// ============================================

/**
 * Handles safe mode transitions with validation.
 *
 * Features:
 * - Validates target mode exists
 * - Blocks switches during active operations (T033)
 * - Requires confirmation for spec mode (T032)
 * - Tracks previous and current mode state
 *
 * @example
 * ```typescript
 * const switcher = new ModeSwitcher();
 *
 * // Check if switch is possible
 * if (switcher.canSwitch('plan')) {
 *   const result = switcher.switchTo('plan');
 *   console.log(result.success); // true
 * }
 *
 * // Spec mode requires confirmation
 * const specResult = switcher.switchTo('spec');
 * if (specResult.requiresConfirmation) {
 *   // Prompt user for confirmation
 *   switcher.confirmSpecMode();
 * }
 * ```
 */
export class ModeSwitcher {
  private _currentMode: CodingMode;
  private _previousMode: CodingMode;
  private _pendingSpecSwitch = false;
  private readonly activityTracker: ActivityTracker;
  private readonly requireSpecConfirmation: boolean;
  private readonly modes: Record<CodingMode, CodingModeConfig>;

  /**
   * Create a new ModeSwitcher.
   *
   * @param config - Optional configuration options
   */
  constructor(config: ModeSwitcherConfig = {}) {
    this._currentMode = config.initialMode ?? "vibe";
    this._previousMode = this._currentMode;
    this.activityTracker = config.activityTracker ?? new NoOpActivityTracker();
    this.requireSpecConfirmation = config.requireSpecConfirmation ?? true;
    this.modes = config.modes ?? BUILTIN_CODING_MODES;
  }

  // ============================================
  // Public Properties
  // ============================================

  /**
   * Get the current mode.
   */
  get currentMode(): CodingMode {
    return this._currentMode;
  }

  /**
   * Get the previous mode (before last switch).
   */
  get previousMode(): CodingMode {
    return this._previousMode;
  }

  /**
   * Check if a spec mode switch is pending confirmation.
   */
  get isPendingSpecConfirmation(): boolean {
    return this._pendingSpecSwitch;
  }

  // ============================================
  // Switch Validation
  // ============================================

  /**
   * Check if a mode switch is possible.
   *
   * Validates:
   * - Target mode exists
   * - No blocking operations in progress
   * - Not already in target mode (unless forcing)
   *
   * @param targetMode - The mode to switch to
   * @param force - Whether to bypass blocking checks
   * @returns Object with canSwitch boolean and optional reason
   */
  canSwitch(targetMode: CodingMode, force = false): { canSwitch: boolean; reason?: string } {
    // Validate target mode exists
    if (!this.modes[targetMode]) {
      return {
        canSwitch: false,
        reason: `Invalid mode: ${targetMode}`,
      };
    }

    // Allow same-mode switches (refresh)
    if (targetMode === this._currentMode) {
      return { canSwitch: true };
    }

    // Check for blocking operations (T033)
    if (!force && this.activityTracker.hasActiveOperations()) {
      const activeTypes = this.activityTracker.getActiveOperationTypes();

      if (this.activityTracker.isFileOperationInProgress()) {
        return {
          canSwitch: false,
          reason: `Cannot switch modes: file operation in progress (${activeTypes.join(", ")})`,
        };
      }

      if (this.activityTracker.isToolExecutionInProgress()) {
        return {
          canSwitch: false,
          reason: `Cannot switch modes: tool execution in progress (${activeTypes.join(", ")})`,
        };
      }

      return {
        canSwitch: false,
        reason: `Cannot switch modes: operations in progress (${activeTypes.join(", ")})`,
      };
    }

    return { canSwitch: true };
  }

  // ============================================
  // Mode Switching
  // ============================================

  /**
   * Attempt to switch to a new mode.
   *
   * @param targetMode - The mode to switch to
   * @param options - Switch options
   * @returns ModeSwitchResult with success status and details
   */
  switchTo(
    targetMode: CodingMode,
    options: { force?: boolean; skipConfirmation?: boolean } = {}
  ): ModeSwitchResult {
    const { force = false, skipConfirmation = false } = options;

    // Check if switch is allowed
    const validation = this.canSwitch(targetMode, force);
    if (!validation.canSwitch) {
      return {
        success: false,
        reason: validation.reason,
        previousMode: this._currentMode,
        currentMode: this._currentMode,
      };
    }

    // Handle spec mode confirmation (T032)
    if (targetMode === "spec" && this.requireSpecConfirmation && !skipConfirmation) {
      this._pendingSpecSwitch = true;
      return {
        success: false,
        reason: "Spec mode requires 6 checkpoints. Continue? [y/N]",
        previousMode: this._currentMode,
        currentMode: this._currentMode,
        requiresConfirmation: true,
      };
    }

    // Perform the switch
    return this.performSwitch(targetMode);
  }

  /**
   * Confirm and complete a pending spec mode switch.
   *
   * @returns ModeSwitchResult with success status
   */
  confirmSpecMode(): ModeSwitchResult {
    if (!this._pendingSpecSwitch) {
      return {
        success: false,
        reason: "No pending spec mode switch to confirm",
        previousMode: this._currentMode,
        currentMode: this._currentMode,
      };
    }

    this._pendingSpecSwitch = false;
    return this.performSwitch("spec");
  }

  /**
   * Cancel a pending spec mode switch.
   *
   * @returns ModeSwitchResult indicating cancellation
   */
  cancelSpecSwitch(): ModeSwitchResult {
    this._pendingSpecSwitch = false;
    return {
      success: false,
      reason: "Spec mode switch cancelled by user",
      previousMode: this._currentMode,
      currentMode: this._currentMode,
    };
  }

  /**
   * Force switch to a mode, aborting any pending operations.
   *
   * @param targetMode - The mode to switch to
   * @returns ModeSwitchResult with success status
   */
  forceSwitch(targetMode: CodingMode): ModeSwitchResult {
    this._pendingSpecSwitch = false;
    return this.switchTo(targetMode, { force: true, skipConfirmation: true });
  }

  // ============================================
  // Private Methods
  // ============================================

  /**
   * Perform the actual mode switch.
   *
   * @param targetMode - The mode to switch to
   * @returns ModeSwitchResult with success status
   */
  private performSwitch(targetMode: CodingMode): ModeSwitchResult {
    this._previousMode = this._currentMode;
    this._currentMode = targetMode;

    return {
      success: true,
      previousMode: this._previousMode,
      currentMode: this._currentMode,
    };
  }
}

// ============================================
// Convenience Functions
// ============================================

/**
 * Create a ModeSwitcher with default configuration.
 *
 * @param config - Optional configuration options
 * @returns A new ModeSwitcher instance
 */
export function createModeSwitcher(config?: ModeSwitcherConfig): ModeSwitcher {
  return new ModeSwitcher(config);
}

/**
 * Create a SimpleActivityTracker.
 *
 * @returns A new SimpleActivityTracker instance
 */
export function createActivityTracker(): SimpleActivityTracker {
  return new SimpleActivityTracker();
}
