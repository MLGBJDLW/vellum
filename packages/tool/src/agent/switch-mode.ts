// ============================================
// Switch Mode Tool (REQ-018)
// ============================================
// Tool for switching agent modes at runtime

import type { ModeRegistry } from "@vellum/core";
import { z } from "zod";

// ============================================
// Type Definitions
// ============================================

/**
 * Parameters for the switch_mode tool.
 *
 * @example
 * ```typescript
 * const params: SwitchModeParams = {
 *   targetMode: 'coder',
 *   preserveContext: true,
 *   reason: 'Need to implement authentication module',
 * };
 * ```
 */
export interface SwitchModeParams {
  /** Mode slug to switch to */
  targetMode: string;
  /** Keep current context (default: true) */
  preserveContext?: boolean;
  /** Why switching */
  reason?: string;
}

/**
 * Result of a switch_mode invocation.
 *
 * @example
 * ```typescript
 * const result: SwitchModeResult = {
 *   success: true,
 *   previousMode: 'orchestrator',
 *   newMode: 'coder',
 *   contextPreserved: true,
 * };
 * ```
 */
export interface SwitchModeResult {
  /** Whether the switch was successful */
  success: boolean;
  /** The mode before switching */
  previousMode: string;
  /** The mode after switching */
  newMode: string;
  /** Whether context was preserved */
  contextPreserved: boolean;
  /** Error message if switch failed */
  error?: string;
}

// ============================================
// Zod Schemas
// ============================================

/**
 * Zod schema for SwitchModeParams validation.
 */
export const SwitchModeParamsSchema = z.object({
  targetMode: z.string().min(1, "Target mode cannot be empty"),
  preserveContext: z.boolean().optional().default(true),
  reason: z.string().optional(),
});

/**
 * Zod schema for SwitchModeResult validation.
 */
export const SwitchModeResultSchema = z.object({
  success: z.boolean(),
  previousMode: z.string(),
  newMode: z.string(),
  contextPreserved: z.boolean(),
  error: z.string().optional(),
});

// ============================================
// Type Inference
// ============================================

export type SwitchModeParamsInferred = z.infer<typeof SwitchModeParamsSchema>;
export type SwitchModeResultInferred = z.infer<typeof SwitchModeResultSchema>;

// ============================================
// Error Classes
// ============================================

/**
 * Error thrown when the target mode does not exist.
 */
export class ModeNotFoundError extends Error {
  constructor(modeSlug: string) {
    super(`Mode "${modeSlug}" does not exist in the registry`);
    this.name = "ModeNotFoundError";
  }
}

/**
 * Error thrown when mode switch is not allowed due to level constraints.
 */
export class ModeSwitchNotAllowedError extends Error {
  constructor(fromMode: string, toMode: string, reason: string) {
    super(`Cannot switch from "${fromMode}" to "${toMode}": ${reason}`);
    this.name = "ModeSwitchNotAllowedError";
  }
}

// ============================================
// Extended Tool Context
// ============================================

/**
 * Extended context for the switch_mode tool.
 *
 * Includes mode-specific information for switching.
 */
export interface SwitchModeContext {
  /** Current working directory */
  workingDir: string;
  /** Session identifier */
  sessionId: string;
  /** Message identifier */
  messageId: string;
  /** Tool call identifier */
  callId: string;
  /** Abort signal for cancellation */
  abortSignal: AbortSignal;
  /** Current agent's mode slug */
  currentModeSlug: string;
  /** Mode registry for validation */
  modeRegistry: ModeRegistry;
  /** Permission check function */
  checkPermission(action: string, resource?: string): Promise<boolean>;
  /** Event emitter for mode change events */
  onModeChange?: (event: ModeChangeEvent) => void;
}

// ============================================
// Event Types
// ============================================

/**
 * Event emitted when mode is changed.
 */
export interface ModeChangeEvent {
  /** Timestamp of the change */
  timestamp: Date;
  /** Previous mode slug */
  previousMode: string;
  /** New mode slug */
  newMode: string;
  /** Whether context was preserved */
  contextPreserved: boolean;
  /** Reason for the switch */
  reason?: string;
}

// ============================================
// Mode Switch Handler
// ============================================

/**
 * Handler interface for processing mode switches.
 *
 * Implementations handle the actual mode transition logic.
 */
export interface ModeSwitchHandler {
  /**
   * Process a mode switch.
   *
   * @param params - Switch parameters
   * @param ctx - Switch context
   * @returns Promise resolving to the switch result
   */
  switch(params: SwitchModeParams, ctx: SwitchModeContext): Promise<SwitchModeResult>;
}

// Default handler reference (for dependency injection)
let modeSwitchHandler: ModeSwitchHandler | undefined;

/**
 * Set the global mode switch handler.
 *
 * @param handler - Handler to use for mode switches
 */
export function setModeSwitchHandler(handler: ModeSwitchHandler): void {
  modeSwitchHandler = handler;
}

/**
 * Get the current mode switch handler.
 *
 * @returns The current handler or undefined
 */
export function getModeSwitchHandler(): ModeSwitchHandler | undefined {
  return modeSwitchHandler;
}

// ============================================
// Core Logic
// ============================================

/**
 * Validate that the target mode exists in the registry.
 *
 * @param modeSlug - Mode slug to validate
 * @param registry - Mode registry to check
 * @returns true if mode exists
 * @throws ModeNotFoundError if mode doesn't exist
 */
export function validateModeExists(modeSlug: string, registry: ModeRegistry): boolean {
  const mode = registry.get(modeSlug);
  if (!mode) {
    throw new ModeNotFoundError(modeSlug);
  }
  return true;
}

/**
 * Check if the current mode can switch to the target mode.
 *
 * Mode switching follows hierarchy rules:
 * - Can switch to same level
 * - Can switch to adjacent levels (up or down one level)
 * - Cannot skip levels
 *
 * @param fromSlug - Current mode slug
 * @param toSlug - Target mode slug
 * @param registry - Mode registry
 * @returns true if switch is allowed
 * @throws ModeSwitchNotAllowedError if switch is not allowed
 */
export function canSwitchMode(fromSlug: string, toSlug: string, registry: ModeRegistry): boolean {
  const fromMode = registry.get(fromSlug);
  const toMode = registry.get(toSlug);

  if (!fromMode) {
    throw new ModeNotFoundError(fromSlug);
  }
  if (!toMode) {
    throw new ModeNotFoundError(toSlug);
  }

  // Calculate level difference
  const levelDiff = Math.abs(fromMode.level - toMode.level);

  // Allow switching to same level or adjacent levels
  if (levelDiff > 1) {
    throw new ModeSwitchNotAllowedError(
      fromSlug,
      toSlug,
      `Level difference too large (${levelDiff}). Can only switch to same or adjacent levels.`
    );
  }

  return true;
}

/**
 * Execute the switch_mode tool.
 *
 * @param params - Validated input parameters
 * @param ctx - Tool execution context
 * @returns Promise resolving to the switch result
 */
export async function executeSwitchMode(
  params: SwitchModeParams,
  ctx: SwitchModeContext
): Promise<SwitchModeResult> {
  const { targetMode, preserveContext = true, reason } = params;
  const { currentModeSlug, modeRegistry, onModeChange } = ctx;

  // Start with the previous mode (will be set to newMode on success)
  const result: SwitchModeResult = {
    success: false,
    previousMode: currentModeSlug,
    newMode: currentModeSlug,
    contextPreserved: preserveContext,
  };

  try {
    // Step 1: Validate target mode exists
    validateModeExists(targetMode, modeRegistry);

    // Step 2: Check if switch is allowed (level constraints)
    canSwitchMode(currentModeSlug, targetMode, modeRegistry);

    // Step 3: Use handler if available, otherwise just validate
    if (modeSwitchHandler) {
      return await modeSwitchHandler.switch(params, ctx);
    }

    // Step 4: Emit mode change event if handler exists
    if (onModeChange) {
      const event: ModeChangeEvent = {
        timestamp: new Date(),
        previousMode: currentModeSlug,
        newMode: targetMode,
        contextPreserved: preserveContext,
        reason,
      };
      onModeChange(event);
    }

    // Step 5: Update result on success
    result.success = true;
    result.newMode = targetMode;
    result.contextPreserved = preserveContext;

    return result;
  } catch (error) {
    // Handle known error types
    if (error instanceof ModeNotFoundError) {
      result.error = error.message;
      return result;
    }

    if (error instanceof ModeSwitchNotAllowedError) {
      result.error = error.message;
      return result;
    }

    // Re-throw unexpected errors
    throw error;
  }
}

// ============================================
// Tool Definition
// ============================================

/**
 * The switch_mode tool for changing agent modes.
 *
 * Allows agents to switch to a different operational mode during execution,
 * with optional context preservation.
 *
 * @example
 * ```typescript
 * import { switchModeTool } from '@vellum/tool/agent/switch-mode';
 *
 * // Use in tool registry
 * registry.register(switchModeTool);
 *
 * // Execute mode switch
 * const result = await switchModeTool.execute(
 *   {
 *     targetMode: 'coder',
 *     preserveContext: true,
 *     reason: 'Need to implement feature',
 *   },
 *   toolContext
 * );
 * ```
 */
export const switchModeTool = {
  definition: {
    name: "switch_mode",
    description:
      "Switch to a different agent mode. Use this to change operational context, " +
      "such as switching from analysis to implementation mode. " +
      "Context can be preserved across mode switches.",
    parameters: SwitchModeParamsSchema,
    kind: "agent" as const,
    category: "orchestration",
    enabled: true,
  },

  /**
   * Execute the switch_mode tool.
   *
   * @param input - Validated input parameters
   * @param ctx - Tool execution context (must include currentModeSlug and modeRegistry)
   * @returns Promise resolving to the tool result
   */
  async execute(
    input: z.infer<typeof SwitchModeParamsSchema>,
    ctx: SwitchModeContext
  ): Promise<{ success: true; output: SwitchModeResult } | { success: false; error: string }> {
    const result = await executeSwitchMode(input, ctx);

    if (result.success) {
      return { success: true, output: result };
    }

    return { success: false, error: result.error ?? "Mode switch failed" };
  },

  /**
   * Check if this mode switch requires confirmation.
   *
   * Mode switches that discard context require confirmation.
   *
   * @param input - The input parameters
   * @returns Whether confirmation is required
   */
  shouldConfirm(input: z.infer<typeof SwitchModeParamsSchema>): boolean {
    // Require confirmation if context will not be preserved
    return input.preserveContext === false;
  },
};
