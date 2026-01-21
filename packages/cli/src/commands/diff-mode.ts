/**
 * Diff Mode Slash Command
 *
 * Provides slash command for managing diff view display mode:
 * - /diff-mode - Show current diff view mode
 * - /diff-mode unified - Switch to unified diff view
 * - /diff-mode side-by-side - Switch to side-by-side diff view
 *
 * @module cli/commands/diff-mode
 */

import { type DiffViewMode, getDiffViewMode, setDiffViewMode } from "../tui/i18n/index.js";
import type { CommandContext, CommandResult, SlashCommand } from "./types.js";
import { error, success } from "./types.js";

// =============================================================================
// Module State
// =============================================================================

/**
 * Minimum terminal width for side-by-side mode.
 * Must match SIDE_BY_SIDE_MIN_WIDTH in DiffView.tsx.
 */
const SIDE_BY_SIDE_MIN_WIDTH = 100;

/**
 * Valid diff view modes.
 */
const VALID_MODES: readonly DiffViewMode[] = ["unified", "side-by-side"] as const;

/**
 * Current diff view mode state.
 * Initialized from settings on module load.
 */
let currentMode: DiffViewMode = getDiffViewMode() ?? "unified";

/**
 * Listeners for diff mode changes.
 */
type DiffModeListener = (mode: DiffViewMode) => void;
const listeners: Set<DiffModeListener> = new Set();

// =============================================================================
// Public API for State Management
// =============================================================================

/**
 * Get the current diff view mode.
 *
 * @returns Current diff view mode
 */
export function getDiffMode(): DiffViewMode {
  return currentMode;
}

/**
 * Set the diff view mode.
 *
 * @param mode - The diff view mode to set
 */
export function setDiffMode(mode: DiffViewMode): void {
  if (currentMode !== mode) {
    currentMode = mode;
    setDiffViewMode(mode);
    notifyListeners();
  }
}

/**
 * Toggle between unified and side-by-side modes.
 *
 * @returns The new mode after toggling
 */
export function toggleDiffMode(): DiffViewMode {
  const newMode = currentMode === "unified" ? "side-by-side" : "unified";
  setDiffMode(newMode);
  return newMode;
}

/**
 * Subscribe to diff mode changes.
 *
 * @param listener - Callback function called when mode changes
 * @returns Unsubscribe function
 */
export function subscribeDiffMode(listener: DiffModeListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Notify all listeners of mode change.
 */
function notifyListeners(): void {
  for (const listener of listeners) {
    listener(currentMode);
  }
}

// =============================================================================
// Mode Display Helpers
// =============================================================================

/**
 * Get icon for diff mode.
 */
function getModeIcon(mode: DiffViewMode): string {
  return mode === "unified" ? "📋" : "⬌";
}

/**
 * Format mode info for display.
 */
function formatModeInfo(mode: DiffViewMode, isCurrent: boolean): string {
  const icon = getModeIcon(mode);
  const marker = isCurrent ? " <- current" : "";
  const description =
    mode === "unified" ? "Traditional unified diff format" : "Split view with old/new side by side";
  return `  ${icon} ${mode} - ${description}${marker}`;
}

// =============================================================================
// /diff-mode Command
// =============================================================================

/**
 * /diff-mode command - Display or change diff view mode.
 *
 * Without arguments, shows the current mode and available options.
 * With a mode argument, switches to that mode.
 */
export const diffModeCommand: SlashCommand = {
  name: "diff-mode",
  description: "Show or change diff view display mode",
  kind: "builtin",
  category: "config",
  aliases: ["diffmode", "diff"],
  positionalArgs: [
    {
      name: "mode",
      type: "string",
      description: "Diff view mode: unified or side-by-side",
      required: false,
    },
  ],
  examples: [
    "/diff-mode            - Show current mode and options",
    "/diff-mode unified    - Switch to unified diff view",
    "/diff-mode side-by-side - Switch to side-by-side diff view",
  ],
  subcommands: VALID_MODES.map((m) => ({
    name: m,
    description: m === "unified" ? "Unified diff format" : "Side-by-side split view",
  })),

  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    const requestedMode = ctx.parsedArgs.positional[0] as string | undefined;

    // If a mode is specified, switch to it
    if (requestedMode) {
      return switchToMode(requestedMode);
    }

    // Show current mode and list options
    const terminalWidth = process.stdout.columns ?? 80;
    const modeList = VALID_MODES.map((m) => formatModeInfo(m, m === currentMode)).join("\n");

    const lines = [
      "=== Diff View Mode ===",
      "",
      `Current mode: ${getModeIcon(currentMode)} ${currentMode}`,
      "",
      "Available modes:",
      modeList,
      "",
    ];

    // Add warning if terminal is too narrow for side-by-side
    if (terminalWidth < SIDE_BY_SIDE_MIN_WIDTH) {
      lines.push(
        `⚠️  Terminal width (${terminalWidth}) is below ${SIDE_BY_SIDE_MIN_WIDTH} columns.`,
        "   Side-by-side mode will auto-degrade to unified mode.",
        ""
      );
    }

    lines.push("Usage: /diff-mode <mode>");

    return success(lines.join("\n"));
  },
};

// =============================================================================
// Mode Switch Helper
// =============================================================================

/**
 * Switch to a specified diff mode with validation.
 *
 * @param modeName - Mode name to switch to
 * @returns Command result
 */
function switchToMode(modeName: string): CommandResult {
  const normalizedName = modeName.toLowerCase() as DiffViewMode;

  // Validate mode name
  if (!VALID_MODES.includes(normalizedName)) {
    return error("INVALID_ARGUMENT", `Unknown diff mode: "${modeName}"`, [
      `Available modes: ${VALID_MODES.join(", ")}`,
    ]);
  }

  // Check if already using this mode
  if (currentMode === normalizedName) {
    return success(`Already using ${getModeIcon(normalizedName)} ${normalizedName} mode.`);
  }

  // Check terminal width for side-by-side
  const terminalWidth = process.stdout.columns ?? 80;
  if (normalizedName === "side-by-side" && terminalWidth < SIDE_BY_SIDE_MIN_WIDTH) {
    setDiffMode(normalizedName);
    return success(
      `${getModeIcon(normalizedName)} Switched to ${normalizedName} mode.\n` +
        `⚠️  Note: Terminal width (${terminalWidth}) is below ${SIDE_BY_SIDE_MIN_WIDTH} columns.\n` +
        `   Diffs will auto-degrade to unified mode until terminal is wider.`
    );
  }

  // Execute the switch
  setDiffMode(normalizedName);
  return success(`${getModeIcon(normalizedName)} Switched to ${normalizedName} mode.`);
}

// =============================================================================
// Export Commands
// =============================================================================

/**
 * All diff-mode related slash commands for registration.
 */
export const diffModeSlashCommands: SlashCommand[] = [diffModeCommand];
