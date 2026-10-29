/**
 * Mouse Slash Commands
 *
 * Provides slash commands for mouse mode management:
 * - /mouse - Show current mouse mode
 * - /mouse on - Enable full mouse mode (click + wheel)
 * - /mouse off - Disable mouse capture
 * - /mouse wheel - Wheel-only mode
 * - /mouse status - Show detailed mouse state
 *
 * @module cli/commands/mouse
 */

import { getNoFlickerConfig, type MouseMode } from "../tui/utils/no-flicker.js";
import type { CommandContext, CommandResult, SlashCommand } from "./types.js";
import { error, success } from "./types.js";

// =============================================================================
// Module State
// =============================================================================

/**
 * Runtime mouse mode override. When set, takes priority over config.
 * Null means "use config-based resolution".
 */
let runtimeMouseMode: MouseMode | null = null;

/**
 * Legacy callback for consumers outside React. React uses the external store below.
 */
let onMouseModeChange: ((mode: MouseMode) => void) | null = null;
const mouseModeListeners = new Set<() => void>();

/** External-store subscription shared by mounted mouse input owners. */
export function subscribeMouseModeChange(listener: () => void): () => void {
  mouseModeListeners.add(listener);
  return () => {
    mouseModeListeners.delete(listener);
  };
}

/**
 * Set the callback for runtime mouse mode changes.
 * Mounted input owners use subscribeMouseModeChange instead.
 */
export function setMouseModeChangeCallback(cb: ((mode: MouseMode) => void) | null): void {
  onMouseModeChange = cb;
}

/**
 * Get the current runtime mouse mode override.
 * Returns null if no runtime override is active.
 */
export function getRuntimeMouseMode(): MouseMode | null {
  return runtimeMouseMode;
}

/**
 * Get the effective mouse mode (runtime override > config).
 */
export function getEffectiveMouseMode(): MouseMode {
  if (runtimeMouseMode !== null) return runtimeMouseMode;
  return getNoFlickerConfig().mouseMode;
}

// =============================================================================
// Display Helpers
// =============================================================================

function getModeIcon(mode: MouseMode): string {
  switch (mode) {
    case "full":
      return "🖱️";
    case "wheel-only":
      return "🔄";
    case "disabled":
      return "🚫";
  }
}

function getModeDescription(mode: MouseMode): string {
  switch (mode) {
    case "full":
      return "Full mouse (click + wheel)";
    case "wheel-only":
      return "Wheel-only (scroll, no clicks)";
    case "disabled":
      return "Mouse disabled";
  }
}

// =============================================================================
// Subcommand Handlers
// =============================================================================

function handleMouseStatus(): CommandResult {
  const config = getNoFlickerConfig();
  const effective = getEffectiveMouseMode();
  const isOverridden = runtimeMouseMode !== null;

  const lines = [
    "🖱️  Mouse Status",
    "═".repeat(40),
    "",
    `Mode: ${getModeIcon(effective)} ${getModeDescription(effective)}`,
    `Config mode: ${config.mouseMode}`,
    `Runtime override: ${isOverridden ? runtimeMouseMode : "none"}`,
    "",
    `Mouse disabled (config): ${config.mouseDisabled}`,
    `Clicks disabled (config): ${config.mouseClicksDisabled}`,
    `No-flicker enabled: ${config.synchronizedOutput}`,
    "",
    "─".repeat(40),
    "Commands:",
    "  /mouse on     - Enable full mouse",
    "  /mouse off    - Disable mouse",
    "  /mouse wheel  - Wheel-only mode",
  ];

  return success(lines.join("\n"));
}

function switchMouseMode(mode: MouseMode): CommandResult {
  const previous = getEffectiveMouseMode();
  runtimeMouseMode = mode;
  for (const listener of mouseModeListeners) listener();

  if (onMouseModeChange) {
    onMouseModeChange(mode);
  }

  if (previous === mode) {
    return success(`${getModeIcon(mode)} Already in ${getModeDescription(mode)} mode.`);
  }

  return success(
    `${getModeIcon(mode)} Switched to ${getModeDescription(mode)} mode.\n` +
      `Note: This is a runtime override. Restart will use config defaults.`
  );
}

// =============================================================================
// /mouse Command
// =============================================================================

export const mouseCommand: SlashCommand = {
  name: "mouse",
  description: "Manage mouse mode (on/off/wheel/status)",
  kind: "builtin",
  category: "config",
  aliases: [],
  positionalArgs: [
    {
      name: "subcommand",
      type: "string",
      description: "Subcommand: on, off, wheel, status",
      required: false,
    },
  ],
  examples: [
    "/mouse         - Show current mouse mode",
    "/mouse on      - Enable full mouse (click + wheel)",
    "/mouse off     - Disable mouse capture",
    "/mouse wheel   - Wheel-only mode (no clicks)",
    "/mouse status  - Show detailed mouse state",
  ],
  subcommands: [
    { name: "on", description: "Enable full mouse (click + wheel)" },
    { name: "off", description: "Disable mouse capture" },
    { name: "wheel", description: "Wheel-only mode" },
    { name: "status", description: "Show detailed mouse state" },
  ],

  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    const subcommand = ctx.parsedArgs.positional[0] as string | undefined;

    switch (subcommand) {
      case undefined:
      case "":
      case "status":
        return handleMouseStatus();

      case "on":
      case "full":
        return switchMouseMode("full");

      case "off":
      case "disable":
      case "disabled":
        return switchMouseMode("disabled");

      case "wheel":
      case "wheel-only":
        return switchMouseMode("wheel-only");

      default:
        return error("INVALID_ARGUMENT", `Unknown mouse subcommand: ${subcommand}`, [
          "Valid subcommands: on, off, wheel, status",
        ]);
    }
  },
};

/**
 * All mouse-related slash commands for registration.
 */
export const mouseSlashCommands: SlashCommand[] = [mouseCommand];
