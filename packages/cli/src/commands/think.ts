/**
 * Think Slash Command (Thinking Mode Toggle)
 *
 * Provides slash command for managing extended thinking/reasoning mode:
 * - /think [on|off] - Toggle or set thinking mode
 * - /think [on] --budget <tokens> - Set thinking budget
 *
 * @module cli/commands/think
 */

import { loadConfig } from "@vellum/core";
import {
  getThinkingDisplayMode,
  getThinkingSettings,
  setThinkingDisplayMode,
  setThinkingSettings,
  type ThinkingDisplayMode,
  type ThinkingSettings,
} from "../tui/i18n/index.js";
import type { CommandContext, CommandResult, SlashCommand } from "./types.js";
import { error, success } from "./types.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Priority for merging thinking configuration.
 * - "global": Global /think state takes precedence
 * - "mode": Mode's extendedThinking setting takes precedence
 * - "merge": Either enabled means thinking is enabled
 */
export type ThinkingPriority = "global" | "mode" | "merge";

/** Re-export ThinkingDisplayMode for consumers */
export type { ThinkingDisplayMode };

/**
 * Effective thinking configuration for LLM calls.
 */
export interface EffectiveThinkingConfig {
  enabled: boolean;
  budgetTokens?: number;
}

// =============================================================================
// Module State
// =============================================================================

/**
 * Current thinking configuration state.
 * This is a simple in-memory state for now.
 * In a full implementation, this would be persisted to config.
 */
interface ThinkingState {
  enabled: boolean;
  budgetTokens: number;
  priority: ThinkingPriority;
}

/**
 * Default thinking state
 */
const defaultThinkingState: ThinkingState = {
  enabled: false,
  budgetTokens: 10000,
  priority: "merge",
};

/**
 * Load initial thinking state from settings file first, then config file.
 * Settings file takes precedence (user-modified via /think command).
 * Falls back to config, then defaults if neither is available.
 */
function loadInitialThinkingState(): ThinkingState {
  // First try to load from persisted settings (user preference)
  const savedSettings = getThinkingSettings();
  if (savedSettings) {
    return {
      enabled: savedSettings.enabled ?? defaultThinkingState.enabled,
      budgetTokens: savedSettings.budgetTokens ?? defaultThinkingState.budgetTokens,
      priority: savedSettings.priority ?? defaultThinkingState.priority,
    };
  }

  // Fall back to config file
  const result = loadConfig({ suppressDeprecationWarnings: true });
  if (!result.ok || !result.value.thinking) {
    return { ...defaultThinkingState };
  }

  const { enabled, budgetTokens, priority } = result.value.thinking;
  return {
    enabled: enabled ?? defaultThinkingState.enabled,
    budgetTokens: budgetTokens ?? defaultThinkingState.budgetTokens,
    priority: priority ?? defaultThinkingState.priority,
  };
}

/**
 * Current thinking state (initialized from config, managed in memory at runtime)
 */
let thinkingState: ThinkingState = loadInitialThinkingState();

/**
 * Listeners for thinking state changes
 */
type ThinkingStateListener = (state: ThinkingState) => void;
const listeners: Set<ThinkingStateListener> = new Set();

/**
 * Persist current thinking state to settings file.
 * Called async to avoid blocking UI.
 */
function persistThinkingState(): void {
  const settings: ThinkingSettings = {
    enabled: thinkingState.enabled,
    budgetTokens: thinkingState.budgetTokens,
    priority: thinkingState.priority,
  };
  // Fire-and-forget - don't block UI for settings persistence
  setThinkingSettings(settings);
}

// =============================================================================
// Public API for State Management
// =============================================================================

/**
 * Get the current thinking state.
 *
 * @returns Current thinking configuration
 */
export function getThinkingState(): Readonly<ThinkingState> {
  return { ...thinkingState };
}

/**
 * Set the thinking enabled state.
 *
 * @param enabled - Whether thinking is enabled
 */
export function setThinkingEnabled(enabled: boolean): void {
  thinkingState = { ...thinkingState, enabled };
  notifyListeners();
  persistThinkingState();
}

/**
 * Set the thinking budget tokens.
 *
 * @param budgetTokens - Number of tokens for thinking budget
 */
export function setThinkingBudget(budgetTokens: number): void {
  thinkingState = { ...thinkingState, budgetTokens };
  notifyListeners();
  persistThinkingState();
}

/**
 * Toggle thinking mode on/off.
 *
 * @returns New enabled state
 */
export function toggleThinking(): boolean {
  thinkingState = { ...thinkingState, enabled: !thinkingState.enabled };
  notifyListeners();
  persistThinkingState();
  return thinkingState.enabled;
}

/**
 * Subscribe to thinking state changes.
 *
 * @param listener - Callback function for state changes
 * @returns Unsubscribe function
 */
export function subscribeToThinkingState(listener: ThinkingStateListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Notify all listeners of state change.
 */
function notifyListeners(): void {
  const state = getThinkingState();
  for (const listener of listeners) {
    listener(state);
  }
}

/**
 * Reset thinking state to defaults.
 */
export function resetThinkingState(): void {
  thinkingState = { ...defaultThinkingState };
  notifyListeners();
}

/**
 * Set the thinking priority.
 *
 * @param priority - Priority for merging thinking config
 */
export function setThinkingPriority(priority: ThinkingPriority): void {
  thinkingState = { ...thinkingState, priority };
  notifyListeners();
  persistThinkingState();
}

// =============================================================================
// Display Mode State (Separate from thinking state)
// =============================================================================

/**
 * Listeners for display mode changes
 */
type DisplayModeListener = (mode: ThinkingDisplayMode) => void;
const displayModeListeners: Set<DisplayModeListener> = new Set();

/**
 * Get the current thinking display mode.
 *
 * @returns Current display mode ("full" or "compact")
 */
export { getThinkingDisplayMode };

/**
 * Set the thinking display mode.
 *
 * @param mode - Display mode ("full" or "compact")
 */
export function setDisplayMode(mode: ThinkingDisplayMode): void {
  setThinkingDisplayMode(mode);
  notifyDisplayModeListeners(mode);
}

/**
 * Subscribe to display mode changes.
 *
 * @param listener - Callback function for mode changes
 * @returns Unsubscribe function
 */
export function subscribeToDisplayMode(listener: DisplayModeListener): () => void {
  displayModeListeners.add(listener);
  return () => {
    displayModeListeners.delete(listener);
  };
}

/**
 * Notify all display mode listeners.
 */
function notifyDisplayModeListeners(mode: ThinkingDisplayMode): void {
  for (const listener of displayModeListeners) {
    listener(mode);
  }
}

/**
 * Get the effective thinking configuration for LLM calls.
 *
 * This function merges the global thinking state (from /think command)
 * with the mode's extendedThinking setting based on the priority setting.
 *
 * @param modeExtendedThinking - Mode's extendedThinking setting (optional)
 * @returns Effective thinking config for LLM.stream()
 *
 * @example
 * ```typescript
 * // Get effective config using mode's extendedThinking
 * const thinkingConfig = getEffectiveThinkingConfig(mode.extendedThinking);
 *
 * // Use in LLM.stream()
 * LLM.stream({
 *   ...otherParams,
 *   thinking: thinkingConfig,
 * });
 * ```
 */
export function getEffectiveThinkingConfig(
  modeExtendedThinking?: boolean
): EffectiveThinkingConfig {
  const { enabled: globalEnabled, budgetTokens, priority } = thinkingState;
  const modeEnabled = modeExtendedThinking ?? false;

  let effectiveEnabled: boolean;

  switch (priority) {
    case "global":
      // Global /think state takes precedence
      effectiveEnabled = globalEnabled;
      break;
    case "mode":
      // Mode's extendedThinking takes precedence
      effectiveEnabled = modeEnabled;
      break;
    default:
      // Either enabled means thinking is enabled
      effectiveEnabled = globalEnabled || modeEnabled;
      break;
  }

  return {
    enabled: effectiveEnabled,
    budgetTokens: effectiveEnabled ? budgetTokens : undefined,
  };
}

// =============================================================================
// Constants
// =============================================================================

/** Minimum budget tokens */
const MIN_BUDGET_TOKENS = 1000;

/** Maximum budget tokens */
const MAX_BUDGET_TOKENS = 128000;

/** Default budget tokens */
const DEFAULT_BUDGET_TOKENS = 10000;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Parse budget value from string.
 *
 * @param value - String value to parse (e.g., "20000", "20k", "20K")
 * @returns Parsed number or null if invalid
 */
function parseBudget(value: string): number | null {
  // Handle k/K suffix for thousands
  const normalized = value.toLowerCase().trim();
  let multiplier = 1;
  let numStr = normalized;

  if (normalized.endsWith("k")) {
    multiplier = 1000;
    numStr = normalized.slice(0, -1);
  }

  const num = Number.parseFloat(numStr);
  if (Number.isNaN(num) || !Number.isFinite(num)) {
    return null;
  }

  return Math.round(num * multiplier);
}

/**
 * Format budget for display.
 *
 * @param tokens - Number of tokens
 * @returns Formatted string (e.g., "10K", "128K")
 */
function formatBudget(tokens: number): string {
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(0)}K`;
  }
  return `${tokens}`;
}

// =============================================================================
// /think Command
// =============================================================================

/**
 * /think command - Toggle or configure extended thinking mode.
 *
 * Usage:
 *   /think           - Show current status and toggle
 *   /think on        - Enable thinking mode
 *   /think off       - Disable thinking mode
 *   /think on --budget 20000  - Enable with custom budget
 *   /think --budget 20k       - Set budget (keeps current on/off state)
 */
export const thinkCommand: SlashCommand = {
  name: "think",
  description: "Toggle extended thinking/reasoning mode",
  kind: "builtin",
  category: "workflow",
  aliases: ["thinking"],
  subcommands: [
    { name: "on", description: "Enable extended thinking" },
    { name: "off", description: "Disable extended thinking" },
    { name: "mode", description: "Set display mode (full/compact)" },
  ],
  positionalArgs: [
    {
      name: "state",
      type: "string",
      description: "Enable or disable thinking (on/off) or set display mode",
      required: false,
    },
  ],
  namedArgs: [
    {
      name: "budget",
      shorthand: "b",
      type: "number",
      description: `Token budget for thinking (${MIN_BUDGET_TOKENS}-${MAX_BUDGET_TOKENS})`,
      required: false,
      default: DEFAULT_BUDGET_TOKENS,
    },
  ],
  examples: [
    "/think              - Show current thinking status",
    "/think on           - Enable thinking mode",
    "/think off          - Disable thinking mode",
    "/think on --budget 20000  - Enable with 20K token budget",
    "/think -b 50k       - Set budget to 50K tokens",
    "/think mode full    - Show full thinking content",
    "/think mode compact - Show compact thinking header only",
  ],

  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    const stateArg = ctx.parsedArgs.positional[0] as string | undefined;
    const budgetArg = ctx.parsedArgs.named.budget as string | number | undefined;

    // Handle budget argument if provided
    let newBudget: number | undefined;
    if (budgetArg !== undefined) {
      const budgetValue =
        typeof budgetArg === "number" ? budgetArg : parseBudget(String(budgetArg));

      if (budgetValue === null) {
        return error("INVALID_ARGUMENT", `Invalid budget value: ${budgetArg}`, [
          `Budget must be a number between ${formatBudget(MIN_BUDGET_TOKENS)} and ${formatBudget(MAX_BUDGET_TOKENS)}.`,
          "Examples: 10000, 20k, 50K, 128000",
        ]);
      }

      if (budgetValue < MIN_BUDGET_TOKENS || budgetValue > MAX_BUDGET_TOKENS) {
        return error("INVALID_ARGUMENT", `Budget out of range: ${formatBudget(budgetValue)}`, [
          `Budget must be between ${formatBudget(MIN_BUDGET_TOKENS)} and ${formatBudget(MAX_BUDGET_TOKENS)}.`,
        ]);
      }

      newBudget = budgetValue;
    }

    // If no state argument, show current status or toggle
    if (!stateArg) {
      // If budget was provided, just update budget
      if (newBudget !== undefined) {
        setThinkingBudget(newBudget);
        const state = getThinkingState();
        return success(
          `🧠 Thinking budget set to ${formatBudget(state.budgetTokens)} tokens.\n` +
            `   Status: ${state.enabled ? "◆ On" : "◇ Off"}`
        );
      }

      // Show current status
      const state = getThinkingState();
      const displayMode = getThinkingDisplayMode();
      const statusIcon = state.enabled ? "◆" : "◇";
      const statusText = state.enabled ? "On" : "Off";

      const lines = [
        "🧠 Extended Thinking Mode",
        "",
        `   Status: ${statusIcon} ${statusText}`,
        `   Budget: ${formatBudget(state.budgetTokens)} tokens`,
        `   Display: ${displayMode}`,
        "",
        "Commands:",
        "   /think on       - Enable thinking",
        "   /think off      - Disable thinking",
        "   /think -b 20k   - Set budget to 20K tokens",
        "   /think mode full|compact - Set display mode",
        "",
        "Shortcuts:",
        "   Ctrl+T          - Toggle thinking on/off",
        "   T (in /model)   - Toggle in model selector",
      ];

      return success(lines.join("\n"));
    }

    // Parse state argument
    const normalizedState = stateArg.toLowerCase().trim();

    // Handle "mode" subcommand
    if (normalizedState === "mode") {
      const modeArg = ctx.parsedArgs.positional[1] as string | undefined;
      const currentMode = getThinkingDisplayMode();

      if (!modeArg) {
        // Show current display mode
        return success(
          `🧠 Thinking display mode: ${currentMode}\n` +
            "   /think mode full    - Show full content\n" +
            "   /think mode compact - Show header only"
        );
      }

      const normalizedMode = modeArg.toLowerCase().trim();
      if (normalizedMode === "full" || normalizedMode === "compact") {
        setDisplayMode(normalizedMode);
        return success(`🧠 Thinking display mode set to: ${normalizedMode}`);
      }

      return error("INVALID_ARGUMENT", `Invalid display mode: ${modeArg}`, [
        "Valid modes: full, compact",
        "Example: /think mode compact",
      ]);
    }

    if (normalizedState === "on" || normalizedState === "1" || normalizedState === "true") {
      setThinkingEnabled(true);
      if (newBudget !== undefined) {
        setThinkingBudget(newBudget);
      }
      const state = getThinkingState();
      return success(
        `🧠 ◆ Thinking mode enabled.\n   Budget: ${formatBudget(state.budgetTokens)} tokens`
      );
    }

    if (normalizedState === "off" || normalizedState === "0" || normalizedState === "false") {
      setThinkingEnabled(false);
      if (newBudget !== undefined) {
        setThinkingBudget(newBudget);
      }
      return success("🧠 ◇ Thinking mode disabled.");
    }

    // Invalid state argument
    return error("INVALID_ARGUMENT", `Invalid state: ${stateArg}`, [
      "Valid states: on, off, mode",
      "Example: /think on --budget 20000",
      "Example: /think mode compact",
    ]);
  },
};

// =============================================================================
// Export All Think Commands
// =============================================================================

/**
 * All think-related slash commands for registration.
 */
export const thinkSlashCommands: SlashCommand[] = [thinkCommand];
