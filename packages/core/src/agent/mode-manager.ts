// ============================================
// Mode Manager - Central Mode Coordinator
// ============================================
// T035: ModeManager class with EventEmitter
// ============================================

import { EventEmitter } from "node:events";
import type { AgentConfig } from "./agent-config.js";
import { AgentRegistry } from "./agent-registry.js";
import type { CodingMode, CodingModeConfig } from "./coding-modes.js";
import { BUILTIN_CODING_MODES } from "./coding-modes.js";
import { type DetectionResult, ModeDetector, type ModeDetectorConfig } from "./mode-detection.js";
import { PlanModeHandler } from "./mode-handlers/plan.js";
import { SpecModeHandler } from "./mode-handlers/spec.js";
import type { HandlerResult, ModeHandler, UserMessage } from "./mode-handlers/types.js";
import { VibeModeHandler } from "./mode-handlers/vibe.js";
import {
  type ActivityTracker,
  ModeSwitcher,
  type ModeSwitchResult,
  SimpleActivityTracker,
} from "./mode-switching.js";

// ============================================
// Event Types
// ============================================

/**
 * Event emitted when the mode changes.
 */
export interface ModeChangedEvent {
  /** The mode before the change */
  previousMode: CodingMode;
  /** The mode after the change */
  currentMode: CodingMode;
  /** Timestamp of the change */
  timestamp: number;
}

/**
 * Event emitted when a mode switch fails.
 */
export interface ModeSwitchFailedEvent {
  /** The mode that was attempted */
  attemptedMode: CodingMode;
  /** The reason for failure */
  reason: string;
  /** Timestamp of the failure */
  timestamp: number;
}

/**
 * Event emitted when spec mode confirmation is required.
 */
export interface SpecConfirmationRequiredEvent {
  /** The current mode */
  currentMode: CodingMode;
  /** Timestamp when confirmation was requested */
  timestamp: number;
}

/**
 * Events emitted by ModeManager.
 */
export interface ModeManagerEvents {
  "mode-changed": (event: ModeChangedEvent) => void;
  "mode-switch-failed": (event: ModeSwitchFailedEvent) => void;
  "spec-confirmation-required": (event: SpecConfirmationRequiredEvent) => void;
  "handler-entered": (mode: CodingMode) => void;
  "handler-exited": (mode: CodingMode) => void;
}

// ============================================
// Type-Safe EventEmitter
// ============================================

/**
 * Type-safe EventEmitter for ModeManager events.
 */
export class TypedEventEmitter extends EventEmitter {
  override on<K extends keyof ModeManagerEvents>(event: K, listener: ModeManagerEvents[K]): this {
    return super.on(event, listener);
  }

  override once<K extends keyof ModeManagerEvents>(event: K, listener: ModeManagerEvents[K]): this {
    return super.once(event, listener);
  }

  override off<K extends keyof ModeManagerEvents>(event: K, listener: ModeManagerEvents[K]): this {
    return super.off(event, listener);
  }

  override emit<K extends keyof ModeManagerEvents>(
    event: K,
    ...args: Parameters<ModeManagerEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }
}

// ============================================
// ModeManager Configuration
// ============================================

/**
 * Configuration options for ModeManager.
 */
export interface ModeManagerConfig {
  /** Initial mode (defaults to 'vibe') */
  initialMode?: CodingMode;
  /** Mode configurations to use */
  modes?: Record<CodingMode, CodingModeConfig>;
  /** Pre-created mode handlers */
  handlers?: Map<CodingMode, ModeHandler>;
  /** Activity tracker for blocking checks */
  activityTracker?: ActivityTracker;
  /** Whether to require confirmation for spec mode */
  requireSpecConfirmation?: boolean;
  /** ModeDetector configuration */
  detectorConfig?: ModeDetectorConfig;
  /** File checker function for spec handler (for testing) */
  fileChecker?: (path: string) => Promise<boolean>;
}

// ============================================
// ModeManager Class (T035)
// ============================================

/**
 * Central coordinator for coding mode management.
 *
 * ModeManager provides:
 * - EventEmitter for mode change notifications
 * - Handler map for mode implementations
 * - Mode detection and switching integration
 * - Lifecycle management for handlers
 *
 * @example
 * ```typescript
 * const manager = new ModeManager();
 *
 * // Listen for mode changes
 * manager.on('mode-changed', (event) => {
 *   console.log(`Changed from ${event.previousMode} to ${event.currentMode}`);
 * });
 *
 * // Get current mode and handler
 * console.log(manager.getCurrentMode()); // 'vibe'
 * const handler = manager.getCurrentHandler();
 *
 * // Switch modes
 * const result = await manager.switchMode('plan');
 * if (result.success) {
 *   console.log('Switched to plan mode');
 * }
 *
 * // Auto-detect mode from input
 * const detected = manager.detectMode('quick fix for the typo');
 * console.log(detected.suggestedMode); // 'vibe'
 * ```
 */
export class ModeManager extends TypedEventEmitter {
  private readonly handlers: Map<CodingMode, ModeHandler>;
  private readonly switcher: ModeSwitcher;
  private readonly detector: ModeDetector;
  private readonly modes: Record<CodingMode, CodingModeConfig>;
  private readonly activityTracker: ActivityTracker;

  /**
   * Create a new ModeManager.
   *
   * @param config - Optional configuration options
   */
  constructor(config: ModeManagerConfig = {}) {
    super();

    // Initialize configuration
    this.modes = config.modes ?? BUILTIN_CODING_MODES;
    this.activityTracker = config.activityTracker ?? new SimpleActivityTracker();

    // Initialize handlers
    if (config.handlers) {
      this.handlers = config.handlers;
    } else {
      this.handlers = this.createDefaultHandlers(config.fileChecker);
    }

    // Initialize switcher
    this.switcher = new ModeSwitcher({
      initialMode: config.initialMode,
      activityTracker: this.activityTracker,
      requireSpecConfirmation: config.requireSpecConfirmation,
      modes: this.modes,
    });

    // Initialize detector
    this.detector = new ModeDetector(config.detectorConfig);
  }

  // ============================================
  // Public Properties
  // ============================================

  /**
   * Get the current mode.
   */
  getCurrentMode(): CodingMode {
    return this.switcher.currentMode;
  }

  /**
   * Get the previous mode (before last switch).
   */
  getPreviousMode(): CodingMode {
    return this.switcher.previousMode;
  }

  /**
   * Check if a spec mode switch is pending confirmation.
   */
  isPendingSpecConfirmation(): boolean {
    return this.switcher.isPendingSpecConfirmation;
  }

  /**
   * Get the handler for the current mode.
   */
  getCurrentHandler(): ModeHandler {
    const handler = this.handlers.get(this.switcher.currentMode);
    if (!handler) {
      throw new Error(`No handler registered for mode: ${this.switcher.currentMode}`);
    }
    return handler;
  }

  /**
   * Get the handler for a specific mode.
   *
   * @param mode - The mode to get the handler for
   * @returns The handler or undefined if not registered
   */
  getHandler(mode: CodingMode): ModeHandler | undefined {
    return this.handlers.get(mode);
  }

  /**
   * Get the configuration for a specific mode.
   *
   * @param mode - The mode to get the configuration for
   * @returns The mode configuration
   */
  getModeConfig(mode: CodingMode): CodingModeConfig {
    return this.modes[mode];
  }

  /**
   * Get the AgentConfig for a coding mode.
   *
   * Resolves the agent via AgentRegistry using the mode's agentName.
   * Falls back to a default worker agent config if no agentName is specified
   * or if the agent is not found in the registry.
   *
   * @param mode - The CodingModeConfig to resolve agent for
   * @returns The AgentConfig, or undefined if not found and no fallback available
   *
   * @example
   * ```typescript
   * const manager = new ModeManager();
   * const modeConfig = manager.getModeConfig('vibe');
   * const agentConfig = manager.getAgentConfig(modeConfig);
   * console.log(agentConfig?.name); // 'vibe-agent'
   * console.log(agentConfig?.level); // 2 (worker)
   * ```
   */
  getAgentConfig(mode: CodingModeConfig): AgentConfig | undefined {
    // If mode has an agentName, resolve via registry
    if (mode.agentName) {
      const registry = AgentRegistry.getInstance();
      const agent = registry.get(mode.agentName);
      if (agent) {
        return agent;
      }
    }

    // Fallback to default worker agent (vibe-agent)
    const registry = AgentRegistry.getInstance();
    return registry.get("vibe-agent");
  }

  /**
   * Get the AgentConfig for the current mode.
   *
   * Convenience method that combines getCurrentMode and getAgentConfig.
   *
   * @returns The AgentConfig for the current mode
   */
  getCurrentAgentConfig(): AgentConfig | undefined {
    const mode = this.getModeConfig(this.getCurrentMode());
    return this.getAgentConfig(mode);
  }

  /**
   * Get all registered handlers.
   */
  getAllHandlers(): Map<CodingMode, ModeHandler> {
    return new Map(this.handlers);
  }

  // ============================================
  // Mode Detection
  // ============================================

  /**
   * Detect the appropriate mode for user input.
   *
   * @param input - The user's input text to analyze
   * @returns Detection result with suggested mode and confidence
   */
  detectMode(input: string): DetectionResult {
    return this.detector.analyze(input);
  }

  /**
   * Check if a mode switch is possible.
   *
   * @param targetMode - The mode to switch to
   * @param force - Whether to bypass blocking checks
   * @returns Object with canSwitch boolean and optional reason
   */
  canSwitchMode(targetMode: CodingMode, force = false): { canSwitch: boolean; reason?: string } {
    return this.switcher.canSwitch(targetMode, force);
  }

  // ============================================
  // Mode Switching
  // ============================================

  /**
   * Switch to a new mode.
   *
   * Handles:
   * - Validation and blocking checks
   * - Spec mode confirmation
   * - Handler lifecycle (onExit/onEnter)
   * - Event emission
   *
   * @param targetMode - The mode to switch to
   * @param options - Switch options
   * @returns ModeSwitchResult with success status
   */
  async switchMode(
    targetMode: CodingMode,
    options: { force?: boolean; skipConfirmation?: boolean } = {}
  ): Promise<ModeSwitchResult> {
    const previousMode = this.switcher.currentMode;

    // Attempt the switch
    const result = this.switcher.switchTo(targetMode, options);

    // Handle spec confirmation requirement
    if (result.requiresConfirmation) {
      this.emit("spec-confirmation-required", {
        currentMode: previousMode,
        timestamp: Date.now(),
      });
      return result;
    }

    // Handle failure
    if (!result.success) {
      this.emit("mode-switch-failed", {
        attemptedMode: targetMode,
        reason: result.reason ?? "Unknown error",
        timestamp: Date.now(),
      });
      return result;
    }

    // Perform handler lifecycle
    await this.performHandlerTransition(previousMode, targetMode);

    // Emit mode changed event
    this.emit("mode-changed", {
      previousMode,
      currentMode: targetMode,
      timestamp: Date.now(),
    });

    return result;
  }

  /**
   * Confirm a pending spec mode switch.
   *
   * @returns ModeSwitchResult with success status
   */
  async confirmSpecMode(): Promise<ModeSwitchResult> {
    const previousMode = this.switcher.currentMode;
    const result = this.switcher.confirmSpecMode();

    if (result.success) {
      await this.performHandlerTransition(previousMode, "spec");
      this.emit("mode-changed", {
        previousMode,
        currentMode: "spec",
        timestamp: Date.now(),
      });
    }

    return result;
  }

  /**
   * Cancel a pending spec mode switch.
   *
   * @returns ModeSwitchResult indicating cancellation
   */
  cancelSpecSwitch(): ModeSwitchResult {
    return this.switcher.cancelSpecSwitch();
  }

  /**
   * Force switch to a mode, aborting any pending operations.
   *
   * @param targetMode - The mode to switch to
   * @returns ModeSwitchResult with success status
   */
  async forceSwitch(targetMode: CodingMode): Promise<ModeSwitchResult> {
    const previousMode = this.switcher.currentMode;
    const result = this.switcher.forceSwitch(targetMode);

    if (result.success) {
      await this.performHandlerTransition(previousMode, targetMode);
      this.emit("mode-changed", {
        previousMode,
        currentMode: targetMode,
        timestamp: Date.now(),
      });
    }

    return result;
  }

  // ============================================
  // Message Processing
  // ============================================

  /**
   * Process a user message through the current handler.
   *
   * @param message - The user message to process
   * @returns Handler result with continuation flag
   */
  async processMessage(message: UserMessage): Promise<HandlerResult> {
    const handler = this.getCurrentHandler();
    return handler.processMessage(message);
  }

  // ============================================
  // Handler Registration
  // ============================================

  /**
   * Register a custom handler for a mode.
   *
   * @param mode - The mode to register the handler for
   * @param handler - The handler implementation
   */
  registerHandler(mode: CodingMode, handler: ModeHandler): void {
    this.handlers.set(mode, handler);
  }

  // ============================================
  // Activity Tracking
  // ============================================

  /**
   * Get the activity tracker.
   */
  getActivityTracker(): ActivityTracker {
    return this.activityTracker;
  }

  // ============================================
  // Private Methods
  // ============================================

  /**
   * Create default handlers for all built-in modes.
   */
  private createDefaultHandlers(
    fileChecker?: (path: string) => Promise<boolean>
  ): Map<CodingMode, ModeHandler> {
    const handlers = new Map<CodingMode, ModeHandler>();

    handlers.set("vibe", new VibeModeHandler(this.modes.vibe));
    handlers.set("plan", new PlanModeHandler(this.modes.plan));
    handlers.set("spec", new SpecModeHandler(this.modes.spec, fileChecker));

    return handlers;
  }

  /**
   * Perform handler transition (exit old, enter new).
   *
   * @param previousMode - The mode being exited
   * @param newMode - The mode being entered
   */
  private async performHandlerTransition(
    previousMode: CodingMode,
    newMode: CodingMode
  ): Promise<void> {
    // Exit previous handler
    const previousHandler = this.handlers.get(previousMode);
    if (previousHandler) {
      await previousHandler.onExit();
      this.emit("handler-exited", previousMode);
    }

    // Enter new handler
    const newHandler = this.handlers.get(newMode);
    if (newHandler) {
      await newHandler.onEnter();
      this.emit("handler-entered", newMode);
    }
  }
}

// ============================================
// Convenience Functions
// ============================================

/**
 * Create a ModeManager with default configuration.
 *
 * @param config - Optional configuration options
 * @returns A new ModeManager instance
 */
export function createModeManager(config?: ModeManagerConfig): ModeManager {
  return new ModeManager(config);
}
