/**
 * Mode Slash Commands (T041)
 *
 * Provides slash commands for coding mode management:
 * - /mode - Show current mode and options
 * - /vibe - Switch to vibe mode
 * - /plan - Switch to plan mode
 * - /spec - Switch to spec mode (with confirmation)
 *
 * @module cli/commands/mode
 */

import {
  BUILTIN_CODING_MODES,
  CODING_MODES,
  type CodingMode,
  type ModeManager,
} from "@vellum/core";
import type { CommandContext, CommandResult, SlashCommand } from "./types.js";
import { error, interactive, success } from "./types.js";

// =============================================================================
// Module State
// =============================================================================

/**
 * Reference to the active ModeManager instance.
 * Set by the App component when initialized.
 */
let modeManager: ModeManager | null = null;

/**
 * Set the ModeManager instance for mode commands.
 * Called by the App component during initialization.
 *
 * @param manager - The ModeManager instance to use
 */
export function setModeCommandsManager(manager: ModeManager | null): void {
  modeManager = manager;
}

/**
 * Get the current ModeManager instance.
 * Returns null if not yet initialized.
 */
export function getModeCommandsManager(): ModeManager | null {
  return modeManager;
}

// =============================================================================
// Mode Description Helpers
// =============================================================================

/**
 * Get a human-readable description for a coding mode.
 */
function getModeDescription(mode: CodingMode): string {
  const config = BUILTIN_CODING_MODES[mode];
  return config?.description ?? mode;
}

/**
 * Get emoji indicator for a coding mode.
 */
function getModeEmoji(mode: CodingMode): string {
  switch (mode) {
    case "vibe":
      return "⚡";
    case "plan":
      return "📋";
    case "spec":
      return "📐";
  }
}

/**
 * Format mode information for display.
 */
function formatModeInfo(mode: CodingMode, isCurrent: boolean): string {
  const emoji = getModeEmoji(mode);
  const desc = getModeDescription(mode);
  const marker = isCurrent ? " (current)" : "";
  return `  ${emoji} ${mode}${marker} - ${desc}`;
}

// =============================================================================
// /mode Command - Show Current Mode and Options
// =============================================================================

/**
 * /mode command - Display current mode and available options.
 *
 * Shows the current coding mode and lists all available modes
 * with their descriptions. Without a ModeManager, shows a
 * placeholder indicating the mode system is not initialized.
 */
export const modeCommand: SlashCommand = {
  name: "mode",
  description: "Show current coding mode and options",
  kind: "builtin",
  category: "workflow",
  aliases: ["modes"],
  positionalArgs: [
    {
      name: "mode",
      type: "string",
      description: "Mode to switch to (vibe, plan, spec)",
      required: false,
    },
  ],
  examples: [
    "/mode        - Show current mode and options",
    "/mode vibe   - Switch to vibe mode",
    "/mode plan   - Switch to plan mode",
    "/mode spec   - Switch to spec mode",
  ],
  subcommands: [
    { name: "vibe", description: "Quick autonomous mode" },
    { name: "plan", description: "Plan before execute mode" },
    { name: "spec", description: "Full specification workflow" },
  ],

  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    const requestedMode = ctx.parsedArgs.positional[0] as string | undefined;

    // If a mode is specified, delegate to switch logic
    if (requestedMode) {
      return switchToMode(requestedMode, ctx);
    }

    // Show current mode and options
    if (!modeManager) {
      // No manager available - show static info
      const lines = [
        "🎯 Coding Modes",
        "",
        "Available modes:",
        ...CODING_MODES.map((m) => formatModeInfo(m, m === "vibe")),
        "",
        "Mode system not yet initialized. Using default: vibe",
        "",
        "Use /vibe, /plan, or /spec to switch modes.",
      ];
      return success(lines.join("\n"));
    }

    const currentMode = modeManager.getCurrentMode();
    const lines = [
      "🎯 Coding Modes",
      "",
      `Current mode: ${getModeEmoji(currentMode)} ${currentMode}`,
      "",
      "Available modes:",
      ...CODING_MODES.map((m) => formatModeInfo(m, m === currentMode)),
      "",
      "Use /vibe, /plan, or /spec to switch modes.",
    ];

    return success(lines.join("\n"));
  },
};

// =============================================================================
// Mode Switch Helper
// =============================================================================

/**
 * Switch to a specified mode with validation.
 *
 * @param mode - Mode name to switch to
 * @param ctx - Command context
 * @returns Command result
 */
async function switchToMode(mode: string, _ctx: CommandContext): Promise<CommandResult> {
  // Validate mode name
  if (!CODING_MODES.includes(mode as CodingMode)) {
    return error("INVALID_ARGUMENT", `Invalid mode: ${mode}`, [
      `Valid modes: ${CODING_MODES.join(", ")}`,
    ]);
  }

  const targetMode = mode as CodingMode;

  // If no manager, return a message about it
  if (!modeManager) {
    return success(
      `Mode system not initialized. Would switch to ${getModeEmoji(targetMode)} ${targetMode}.`
    );
  }

  // Check if already in this mode
  const currentMode = modeManager.getCurrentMode();
  if (currentMode === targetMode) {
    return success(`Already in ${getModeEmoji(targetMode)} ${targetMode} mode.`);
  }

  // Spec mode requires confirmation
  if (targetMode === "spec") {
    return interactive({
      inputType: "confirm",
      message: `⚠️ Switch to spec mode? This enables a 6-phase structured workflow.`,
      defaultValue: "n",
      handler: async (value: string): Promise<CommandResult> => {
        const confirmed = value.toLowerCase() === "y" || value.toLowerCase() === "yes";
        if (confirmed) {
          return await executeSwitch(targetMode);
        }
        return success("Mode switch cancelled.");
      },
      onCancel: () => success("Mode switch cancelled."),
    });
  }

  // Direct switch for vibe and plan modes
  return await executeSwitch(targetMode);
}

/**
 * Execute the actual mode switch via ModeManager.
 *
 * @param targetMode - Mode to switch to
 * @returns Command result
 */
async function executeSwitch(targetMode: CodingMode): Promise<CommandResult> {
  if (!modeManager) {
    return error("OPERATION_NOT_ALLOWED", "Mode system not initialized", []);
  }

  const result = await modeManager.switchMode(targetMode, {
    skipConfirmation: targetMode === "spec",
  });

  if (result.success) {
    const emoji = getModeEmoji(targetMode);
    return success(`${emoji} Switched to ${targetMode} mode.`, {
      previousMode: result.previousMode,
      currentMode: result.currentMode,
    });
  }

  return error(
    "OPERATION_NOT_ALLOWED",
    `Cannot switch to ${targetMode}: ${result.reason ?? "Unknown error"}`,
    []
  );
}

// =============================================================================
// /vibe Command - Switch to Vibe Mode
// =============================================================================

/**
 * /vibe command - Switch to vibe (fast autonomous) mode.
 *
 * Vibe mode enables fast, autonomous coding with full tool access.
 * No checkpoints or confirmations required - the AI executes
 * tasks directly.
 */
export const vibeCommand: SlashCommand = {
  name: "vibe",
  description: "Switch to vibe mode (fast autonomous coding)",
  kind: "builtin",
  category: "workflow",
  aliases: [],
  examples: ["/vibe - Switch to fast autonomous mode"],

  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    return switchToMode("vibe", ctx);
  },
};

// =============================================================================
// /plan Command - Switch to Plan Mode
// =============================================================================

/**
 * /plan command - Switch to plan mode.
 *
 * Plan mode requires the AI to create a plan before execution.
 * One checkpoint for plan approval, then execution proceeds.
 */
export const planCommand: SlashCommand = {
  name: "plan",
  description: "Switch to plan mode (plan-then-execute)",
  kind: "builtin",
  category: "workflow",
  aliases: [],
  examples: ["/plan - Switch to plan-then-execute mode"],

  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    return switchToMode("plan", ctx);
  },
};

// =============================================================================
// /spec Command - Switch to Spec Mode
// =============================================================================

/**
 * /spec command - Switch to spec mode.
 *
 * Spec mode enables a 6-phase structured workflow:
 * 1. Research
 * 2. Requirements
 * 3. Design
 * 4. Tasks
 * 5. Implementation
 * 6. Validation
 *
 * Requires confirmation before switching due to its structured nature.
 */
export const specCommand: SlashCommand = {
  name: "spec",
  description: "Switch to spec mode (6-phase structured workflow)",
  kind: "builtin",
  category: "workflow",
  aliases: [],
  examples: ["/spec - Switch to 6-phase structured workflow"],

  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    return switchToMode("spec", ctx);
  },
};

// =============================================================================
// Export All Mode Commands
// =============================================================================

/**
 * All mode-related slash commands for registration.
 */
export const modeSlashCommands: SlashCommand[] = [
  modeCommand,
  vibeCommand,
  planCommand,
  specCommand,
];
