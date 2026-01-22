/**
 * Tip Engine
 *
 * Provides contextual tips based on user actions and state.
 *
 * @module cli/onboarding/tips/tip-engine
 */

import { ICONS } from "../../utils/icons.js";
import type { Tip, TipContext, TipState } from "../tutorial/types.js";

// =============================================================================
// Built-in Tips
// =============================================================================

/**
 * Default contextual tips
 */
export const BUILTIN_TIPS: Tip[] = [
  // Shortcuts
  {
    id: "tip-shortcuts-help",
    title: "Quick Help",
    content: "Press /help anytime to see available commands.",
    category: "shortcuts",
    trigger: {
      screens: ["main"],
      maxShows: 3,
    },
    priority: 10,
    dismissable: true,
    icon: ICONS.tips.hint,
  },
  {
    id: "tip-shortcuts-clear",
    title: "Clear Screen",
    content: "Use /clear to reset the conversation display.",
    category: "shortcuts",
    trigger: {
      minFeatureUsage: 5,
      maxShows: 2,
    },
    priority: 5,
    dismissable: true,
    icon: "[Clear]",
  },
  {
    id: "tip-shortcuts-mode",
    title: "Switch Modes",
    content: "Use /mode to change between architect, code, debug modes.",
    category: "shortcuts",
    trigger: {
      commands: ["mode"],
      maxShows: 2,
    },
    priority: 8,
    dismissable: true,
    relatedLessonId: "modes",
    icon: ICONS.tips.vibe,
  },

  // Features
  {
    id: "tip-feature-multiline",
    title: "Multi-line Input",
    content: "Use \\ at the end of a line for multi-line input.",
    category: "features",
    trigger: {
      minFeatureUsage: 3,
      maxShows: 2,
    },
    priority: 7,
    dismissable: true,
    icon: ICONS.tips.edit,
  },
  {
    id: "tip-feature-history",
    title: "Command History",
    content: "Use ↑/↓ arrows to navigate command history.",
    category: "features",
    trigger: {
      minFeatureUsage: 10,
      maxShows: 2,
    },
    priority: 6,
    dismissable: true,
    icon: "[Hist]",
  },
  {
    id: "tip-feature-tools",
    title: "Available Tools",
    content: "Use /tools to see what Vellum can do for you.",
    category: "features",
    trigger: {
      screens: ["main"],
      maxShows: 2,
    },
    priority: 9,
    dismissable: true,
    relatedLessonId: "tools",
    icon: ICONS.tips.tools,
  },

  // Best Practices
  {
    id: "tip-practice-specific",
    title: "Be Specific",
    content: "More specific requests get better results. Include file names and line numbers!",
    category: "best-practices",
    trigger: {
      minFeatureUsage: 5,
      maxShows: 3,
    },
    priority: 10,
    dismissable: true,
    icon: ICONS.tips.target,
  },
  {
    id: "tip-practice-context",
    title: "Provide Context",
    content: "Share error messages and relevant code for better debugging help.",
    category: "best-practices",
    trigger: {
      modes: ["debug"],
      maxShows: 2,
    },
    priority: 8,
    dismissable: true,
    icon: ICONS.tips.plan,
  },
  {
    id: "tip-practice-review",
    title: "Review Before Commit",
    content: "Use /mode review before committing to catch issues.",
    category: "best-practices",
    trigger: {
      commands: ["commit", "git"],
      maxShows: 2,
    },
    priority: 7,
    dismissable: true,
    relatedLessonId: "modes",
    icon: "[Review]",
  },

  // Error Tips
  {
    id: "tip-error-stack",
    title: "Share Stack Traces",
    content: "Copy the full error message including stack trace for better debugging.",
    category: "errors",
    trigger: {
      onError: true,
      maxShows: 3,
    },
    priority: 15,
    dismissable: true,
    icon: ICONS.tips.search,
  },
  {
    id: "tip-error-debug-mode",
    title: "Debug Mode",
    content: "Switch to /mode debug for focused error investigation.",
    category: "errors",
    trigger: {
      onError: true,
      maxShows: 2,
    },
    priority: 12,
    dismissable: true,
    relatedLessonId: "modes",
    icon: "[Debug]",
  },

  // Performance
  {
    id: "tip-perf-focus",
    title: "Stay Focused",
    content: "Break large tasks into smaller, focused requests.",
    category: "performance",
    trigger: {
      minFeatureUsage: 20,
      maxShows: 2,
    },
    priority: 6,
    dismissable: true,
    icon: ICONS.tips.rocket,
  },
];

// =============================================================================
// Tip Engine Class
// =============================================================================

/**
 * Engine for managing contextual tips
 */
export class TipEngine {
  private tips: Map<string, Tip> = new Map();
  private tipStates: Map<string, TipState> = new Map();
  private dismissedTips: Set<string> = new Set();

  constructor() {
    // Register builtin tips
    for (const tip of BUILTIN_TIPS) {
      this.tips.set(tip.id, tip);
    }
  }

  // ===========================================================================
  // Tip Registration
  // ===========================================================================

  /**
   * Register a new tip
   */
  registerTip(tip: Tip): void {
    this.tips.set(tip.id, tip);
  }

  /**
   * Unregister a tip
   */
  unregisterTip(tipId: string): void {
    this.tips.delete(tipId);
  }

  /**
   * Get all registered tips
   */
  getAllTips(): Tip[] {
    return Array.from(this.tips.values());
  }

  // ===========================================================================
  // Tip Retrieval
  // ===========================================================================

  /**
   * Get a tip for the current context
   */
  getTip(context: TipContext): Tip | null {
    const matchingTips = this.getMatchingTips(context);

    if (matchingTips.length === 0) {
      return null;
    }

    // Sort by priority (descending) and return highest
    matchingTips.sort((a, b) => b.priority - a.priority);
    // Array is guaranteed non-empty due to check above
    const tip = matchingTips[0] as Tip;

    // Update state
    this.recordTipShown(tip.id);

    return tip;
  }

  /**
   * Get all tips matching the context
   */
  getMatchingTips(context: TipContext): Tip[] {
    const matching: Tip[] = [];

    for (const tip of this.tips.values()) {
      if (this.isTipEligible(tip, context)) {
        matching.push(tip);
      }
    }

    return matching;
  }

  /**
   * Get tips for a specific category
   */
  getTipsByCategory(category: Tip["category"]): Tip[] {
    return Array.from(this.tips.values()).filter((tip) => tip.category === category);
  }

  // ===========================================================================
  // Tip State Management
  // ===========================================================================

  /**
   * Dismiss a tip
   */
  dismissTip(tipId: string): void {
    this.dismissedTips.add(tipId);

    const state = this.tipStates.get(tipId) ?? this.createInitialState(tipId);
    state.dismissed = true;
    this.tipStates.set(tipId, state);
  }

  /**
   * Check if a tip is dismissed
   */
  isTipDismissed(tipId: string): boolean {
    return this.dismissedTips.has(tipId);
  }

  /**
   * Get tip state
   */
  getTipState(tipId: string): TipState | undefined {
    return this.tipStates.get(tipId);
  }

  /**
   * Reset all tip states
   */
  resetAllStates(): void {
    this.tipStates.clear();
    this.dismissedTips.clear();
  }

  /**
   * Reset state for a specific tip
   */
  resetTipState(tipId: string): void {
    this.tipStates.delete(tipId);
    this.dismissedTips.delete(tipId);
  }

  // ===========================================================================
  // Serialization (for persistence)
  // ===========================================================================

  /**
   * Export tip states for persistence
   */
  exportStates(): Record<string, TipState> {
    const states: Record<string, TipState> = {};
    for (const [id, state] of this.tipStates) {
      states[id] = state;
    }
    return states;
  }

  /**
   * Import tip states from persistence
   */
  importStates(states: Record<string, TipState>): void {
    this.tipStates.clear();
    this.dismissedTips.clear();

    for (const [id, state] of Object.entries(states)) {
      this.tipStates.set(id, state);
      if (state.dismissed) {
        this.dismissedTips.add(id);
      }
    }
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Check if a tip is eligible to be shown
   */
  private isTipEligible(tip: Tip, context: TipContext): boolean {
    // Check if dismissed
    if (this.dismissedTips.has(tip.id)) {
      return false;
    }

    // Check max shows
    const state = this.tipStates.get(tip.id);
    if (tip.trigger.maxShows && state && state.showCount >= tip.trigger.maxShows) {
      return false;
    }

    // Check trigger conditions
    const { trigger } = tip;

    // Command trigger
    if (trigger.commands && trigger.commands.length > 0) {
      if (
        !context.command ||
        !trigger.commands.some((cmd: string) => context.command?.includes(cmd))
      ) {
        return false;
      }
    }

    // Mode trigger
    if (trigger.modes && trigger.modes.length > 0) {
      if (!context.mode || !trigger.modes.includes(context.mode)) {
        return false;
      }
    }

    // Screen trigger
    if (trigger.screens && trigger.screens.length > 0) {
      if (!context.screen || !trigger.screens.includes(context.screen)) {
        return false;
      }
    }

    // Error trigger
    if (trigger.onError === true && !context.hasError) {
      return false;
    }

    // Feature usage trigger
    if (trigger.minFeatureUsage !== undefined) {
      const usage = context.featuresUsedCount ?? 0;
      if (usage < trigger.minFeatureUsage) {
        return false;
      }
    }

    return true;
  }

  /**
   * Record that a tip was shown
   */
  private recordTipShown(tipId: string): void {
    const now = new Date().toISOString();
    const existing = this.tipStates.get(tipId);

    if (existing) {
      existing.showCount++;
      existing.lastShownAt = now;
    } else {
      this.tipStates.set(tipId, this.createInitialState(tipId, now));
    }
  }

  /**
   * Create initial tip state
   */
  private createInitialState(tipId: string, now?: string): TipState {
    const timestamp = now ?? new Date().toISOString();
    return {
      tipId,
      showCount: 1,
      dismissed: false,
      firstShownAt: timestamp,
      lastShownAt: timestamp,
    };
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a tip engine instance
 */
export function createTipEngine(): TipEngine {
  return new TipEngine();
}
