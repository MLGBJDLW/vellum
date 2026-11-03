/**
 * Think Slash Command (Thinking Mode Toggle)
 *
 * Provides slash command for managing extended thinking/reasoning mode:
 * - /think effort - Select model-supported reasoning effort
 *
 * @module cli/commands/think
 */

import { loadConfig } from "@vellum/core";
import { getModelInfo, type ReasoningEffort, reasoningEffortSchema } from "@vellum/provider";
import {
  getThinkingAutoCollapse,
  getThinkingAutoCollapseDelayMs,
  getThinkingDisplayMode,
  getThinkingExpandedByDefault,
  getThinkingSettings,
  setThinkingAutoCollapse,
  setThinkingAutoCollapseDelayMs,
  setThinkingDisplayMode,
  setThinkingExpandedByDefault,
  setThinkingSettings,
  subscribeToThinkingAutoCollapse,
  subscribeToThinkingAutoCollapseDelay,
  subscribeToThinkingExpandedByDefault,
  type ThinkingDisplayMode,
  type ThinkingSettings,
} from "../tui/i18n/index.js";
import { getModelCommandConfig } from "./model.js";
import type { CommandContext, CommandResult, SlashCommand } from "./types.js";
import { error, success } from "./types.js";

// =============================================================================
// Types
// =============================================================================

/** Re-export ThinkingDisplayMode for consumers */
export type { ThinkingDisplayMode };

/**
 * Effective thinking configuration for LLM calls.
 */
export interface EffectiveThinkingConfig {
  enabled: boolean;
  budgetTokens?: number;
  reasoningEffort?: ReasoningEffort;
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
  reasoningEffort?: ReasoningEffort;
}

/**
 * Default thinking state
 */
const defaultThinkingState: ThinkingState = {};

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
      reasoningEffort: reasoningEffortSchema.safeParse(savedSettings.reasoningEffort).data,
    };
  }

  // Fall back to config file
  const result = loadConfig({ suppressDeprecationWarnings: true });
  if (!result.ok || !result.value.thinking) {
    return { ...defaultThinkingState };
  }

  return {
    reasoningEffort: result.value.thinking.reasoningEffort,
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
    reasoningEffort: thinkingState.reasoningEffort,
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

export function setThinkingEffort(reasoningEffort: ReasoningEffort | undefined): void {
  thinkingState = { ...thinkingState, reasoningEffort };
  notifyListeners();
  persistThinkingState();
}

/** The same catalog used by the request resolver owns the displayed choices. */
export function getThinkingEffortOptions(provider: string, model: string): ReasoningEffort[] {
  return [...(getModelInfo(provider, model).reasoningEfforts ?? [])];
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
/**
 * Get whether thinking blocks start expanded by default.
 *
 * @returns True if expanded by default, false if collapsed
 */
/**
 * Get whether thinking blocks auto-collapse after streaming.
 */
/**
 * Get the auto-collapse delay in milliseconds.
 */
/**
 * Subscribe to thinking expanded-by-default changes.
 *
 * @param listener - Callback function for expanded-by-default changes
 * @returns Unsubscribe function
 */
/**
 * Subscribe to thinking auto-collapse changes.
 */
/**
 * Subscribe to thinking auto-collapse delay changes.
 */
export {
  getThinkingAutoCollapse,
  getThinkingAutoCollapseDelayMs,
  getThinkingDisplayMode,
  getThinkingExpandedByDefault,
  subscribeToThinkingAutoCollapse,
  subscribeToThinkingAutoCollapseDelay,
  subscribeToThinkingExpandedByDefault,
};

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
  // Effort is the sole request control. Legacy on/off and budgets do not
  // override model defaults; adapters derive any required wire-level budget.
  void modeExtendedThinking;
  const model = getModelCommandConfig();
  const supportsReasoning = model
    ? getModelInfo(model.provider, model.model).supportsReasoning !== false
    : true;
  return {
    enabled: supportsReasoning && thinkingState.reasoningEffort !== "none",
    reasoningEffort: thinkingState.reasoningEffort,
  };
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Parse delay value from string.
 *
 * @param value - String value to parse (e.g., "500", "1000")
 * @returns Parsed number or null if invalid
 */
function parseDelayMs(value: string): number | null {
  const normalized = value.trim();
  const num = Number.parseFloat(normalized);
  if (Number.isNaN(num) || !Number.isFinite(num) || num < 0) {
    return null;
  }
  return Math.round(num);
}

/** Configure model reasoning effort and the presentation of reasoning text. */
export const thinkCommand: SlashCommand = {
  name: "think",
  description: "Configure reasoning effort and display",
  kind: "builtin",
  category: "workflow",
  aliases: ["thinking"],
  subcommands: [
    { name: "effort", description: "Select reasoning effort for the current model" },
    { name: "mode", description: "Set display mode (full/compact)" },
    { name: "expand", description: "Set expanded by default (on/off/auto)" },
  ],
  positionalArgs: [
    {
      name: "state",
      type: "string",
      description: "Configure effort or display/expand modes",
      required: false,
    },
  ],
  examples: [
    "/think              - Show current thinking status",
    "/think effort       - Choose model-supported reasoning effort",
    "/think effort high  - Set reasoning effort (auto uses the model default)",
    "/think mode full    - Show full thinking content",
    "/think mode compact - Show compact thinking header only",
    "/think expand on    - Thinking blocks start expanded",
    "/think expand off   - Thinking blocks start collapsed",
    "/think expand auto  - Start expanded, auto-collapse after streaming",
    "/think expand auto 1000 - Auto-collapse after 1000ms",
  ],

  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    const stateArg = ctx.parsedArgs.positional[0] as string | undefined;
    if (ctx.parsedArgs.named.budget !== undefined || stateArg === "on" || stateArg === "off") {
      return error(
        "INVALID_ARGUMENT",
        "Use /think effort; on/off and thinking budgets have been removed."
      );
    }

    if (stateArg === "effort") {
      const config = getModelCommandConfig();
      if (!config)
        return error("INVALID_ARGUMENT", "Select a model before choosing reasoning effort.");
      const choices = getThinkingEffortOptions(config.provider, config.model);
      if (choices.length === 0) {
        return error(
          "INVALID_ARGUMENT",
          `${config.model} does not advertise reasoning effort controls.`,
          ["This model uses its provider default reasoning settings."]
        );
      }
      const select = async (value: string): Promise<CommandResult> => {
        const parsed = reasoningEffortSchema.safeParse(value);
        if (value !== "auto" && (!parsed.success || !choices.includes(parsed.data))) {
          return error("INVALID_ARGUMENT", `Supported effort: auto, ${choices.join(", ")}`);
        }
        setThinkingEffort(value === "auto" ? undefined : parsed.data);

        return success(`Reasoning effort: ${value}. Applies to the next model request.`);
      };
      const value = ctx.parsedArgs.positional[1];
      if (typeof value === "string") return select(value);
      return {
        kind: "interactive",
        prompt: {
          inputType: "select",
          message: `Reasoning effort · ${config.model} (higher effort trades speed for depth)`,
          options: ["auto", ...choices],
          defaultValue: choices.includes(thinkingState.reasoningEffort as ReasoningEffort)
            ? thinkingState.reasoningEffort
            : "auto",
          handler: select,
        },
      };
    }

    if (!stateArg) {
      return success(
        `Reasoning effort: ${thinkingState.reasoningEffort ?? "auto (model default)"}\nUse /think effort to choose effort, /think mode or /think expand to configure display.`
      );
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

    // Handle "expand" subcommand
    if (normalizedState === "expand") {
      const expandArg = ctx.parsedArgs.positional[1] as string | undefined;
      const currentExpanded = getThinkingExpandedByDefault();
      const currentAutoCollapse = getThinkingAutoCollapse();
      const currentAutoCollapseDelayMs = getThinkingAutoCollapseDelayMs();

      if (!expandArg) {
        // Show current expand default setting
        const statusText = currentExpanded ? "on (expanded)" : "off (collapsed)";
        const autoText = currentAutoCollapse ? `auto (${currentAutoCollapseDelayMs}ms)` : "off";
        return success(
          `🧠 Thinking expanded by default: ${statusText}\n` +
            `   Auto-collapse: ${autoText}\n` +
            "   /think expand on    - Start expanded\n" +
            "   /think expand off   - Start collapsed\n" +
            "   /think expand auto [delayMs] - Start expanded, auto-collapse"
        );
      }

      const normalizedExpand = expandArg.toLowerCase().trim();
      if (normalizedExpand === "on" || normalizedExpand === "1" || normalizedExpand === "true") {
        setThinkingExpandedByDefault(true);
        setThinkingAutoCollapse(false);
        return success("🧠 Thinking blocks will start expanded by default.");
      }

      if (normalizedExpand === "off" || normalizedExpand === "0" || normalizedExpand === "false") {
        setThinkingExpandedByDefault(false);
        setThinkingAutoCollapse(true);
        setThinkingAutoCollapseDelayMs(0);
        return success("🧠 Thinking blocks will stay collapsed after streaming.");
      }

      if (normalizedExpand === "auto") {
        const delayArg = ctx.parsedArgs.positional[2] as string | number | undefined;
        let delayMs: number | undefined;
        if (delayArg !== undefined) {
          const parsedDelay = parseDelayMs(String(delayArg));
          if (parsedDelay === null) {
            return error("INVALID_ARGUMENT", `Invalid delay value: ${delayArg}`, [
              "Delay must be a non-negative number in milliseconds.",
              "Example: /think expand auto 1000",
            ]);
          }
          delayMs = parsedDelay;
        }

        setThinkingExpandedByDefault(true);
        setThinkingAutoCollapse(true);
        if (delayMs !== undefined) {
          setThinkingAutoCollapseDelayMs(delayMs);
        }

        const resolvedDelay = delayMs ?? getThinkingAutoCollapseDelayMs();
        return success(
          `🧠 Thinking blocks will auto-collapse after streaming (${resolvedDelay}ms).`
        );
      }

      return error("INVALID_ARGUMENT", `Invalid expand setting: ${expandArg}`, [
        "Valid settings: on, off, auto",
        "Example: /think expand auto 1000",
      ]);
    }

    // Invalid state argument
    return error("INVALID_ARGUMENT", `Invalid state: ${stateArg}`, [
      "Valid settings: effort, mode, expand",
      "Example: /think effort high",
      "Example: /think mode compact",
      "Example: /think expand auto 1000",
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
