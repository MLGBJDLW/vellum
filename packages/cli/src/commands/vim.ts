/**
 * Vim Mode Slash Command (T041)
 *
 * Provides the /vim command for toggling Vim editing mode.
 *
 * @module cli/commands/vim
 */

import type { CommandContext, CommandResult, SlashCommand } from "./types.js";
import { success } from "./types.js";

// =============================================================================
// Module State
// =============================================================================

/**
 * Callback to toggle vim mode.
 * Set by the App component when initialized.
 */
let vimToggleCallback: (() => void) | null = null;

/**
 * Callback to check if vim mode is enabled.
 * Set by the App component when initialized.
 */
let vimEnabledCallback: (() => boolean) | null = null;

/**
 * Set the vim mode callbacks for the /vim command.
 * Called by the App component during initialization.
 *
 * @param toggle - Callback to toggle vim mode on/off
 * @param isEnabled - Callback to check if vim mode is currently enabled
 */
export function setVimCallbacks(toggle: () => void, isEnabled: () => boolean): void {
  vimToggleCallback = toggle;
  vimEnabledCallback = isEnabled;
}

/**
 * Clear vim mode callbacks.
 * Called during cleanup.
 */
export function clearVimCallbacks(): void {
  vimToggleCallback = null;
  vimEnabledCallback = null;
}

// =============================================================================
// /vim Command
// =============================================================================

/**
 * /vim command - Toggle Vim editing mode.
 *
 * When enabled:
 * - Input field uses Vim-style modal editing
 * - NORMAL mode: navigation and commands
 * - INSERT mode: text entry (i, a, I, A, o, O)
 * - VISUAL mode: text selection (v, V)
 * - COMMAND mode: command line (:)
 * - Press Escape to return to NORMAL mode
 * - Press Ctrl+V to toggle vim mode on/off
 *
 * @example
 * ```
 * /vim         - Toggle vim mode on/off
 * /vim on      - Enable vim mode
 * /vim off     - Disable vim mode
 * ```
 */
export const vimCommand: SlashCommand = {
  name: "vim",
  description: "Toggle Vim editing mode for input",
  kind: "builtin",
  category: "config",
  aliases: ["vi"],
  positionalArgs: [
    {
      name: "state",
      type: "string",
      description: "Explicitly set state: 'on' or 'off'",
      required: false,
    },
  ],
  examples: [
    "/vim      - Toggle vim mode on/off",
    "/vim on   - Enable vim mode",
    "/vim off  - Disable vim mode",
  ],

  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    const state = ctx.parsedArgs.positional[0] as string | undefined;

    // Check if callbacks are available
    if (!vimToggleCallback || !vimEnabledCallback) {
      return success("Vim mode system not initialized.");
    }

    const currentlyEnabled = vimEnabledCallback();

    // Handle explicit on/off
    if (state === "on") {
      if (currentlyEnabled) {
        return success(
          "Vim mode is already enabled.\n\nUse 'i' to enter INSERT mode, Escape to return to NORMAL mode."
        );
      }
      vimToggleCallback();
      return success(
        "🟢 Vim mode enabled.\n\nYou are now in NORMAL mode. Press 'i' to enter INSERT mode for typing."
      );
    }

    if (state === "off") {
      if (!currentlyEnabled) {
        return success("Vim mode is already disabled.");
      }
      vimToggleCallback();
      return success("⚫ Vim mode disabled.\n\nReturned to standard input mode.");
    }

    // Toggle
    vimToggleCallback();
    const newState = vimEnabledCallback();

    if (newState) {
      return success(
        "🟢 Vim mode enabled.\n\n" +
          "You are now in NORMAL mode. Key bindings:\n" +
          "  • i, a, I, A, o, O - Enter INSERT mode\n" +
          "  • v, V - Enter VISUAL mode\n" +
          "  • : - Enter COMMAND mode\n" +
          "  • h, j, k, l - Navigation\n" +
          "  • Escape - Return to NORMAL mode\n" +
          "  • Ctrl+V - Toggle vim mode off\n\n" +
          "Press 'i' to start typing."
      );
    }

    return success("⚫ Vim mode disabled.\n\nReturned to standard input mode.");
  },
};

// =============================================================================
// Export
// =============================================================================

/**
 * All vim-related slash commands for registration.
 */
export const vimSlashCommands: SlashCommand[] = [vimCommand];
