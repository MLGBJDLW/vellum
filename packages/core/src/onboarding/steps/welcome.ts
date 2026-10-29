/**
 * Welcome Step (Phase 38)
 *
 * First step of the onboarding wizard that introduces Vellum
 * and explains what the setup process will configure.
 *
 * @module onboarding/steps/welcome
 */

import type { OnboardingState, StepResult } from "../types.js";

// =============================================================================
// Constants
// =============================================================================

/**
 * Welcome message displayed to new users
 */
export const WELCOME_MESSAGE =
  "Welcome to Vellum, your personal AI assistant.\nResearch, write, organize, analyze, and code in one conversation.";

/**
 * Setup overview displayed after welcome
 */
export const SETUP_OVERVIEW =
  "Choose a provider and configure its API key.\nYour assistant will choose planning and delegation as needed.";

/**
 * Tips displayed at the end of welcome
 */
export const QUICK_TIPS = [
  "Press Enter to continue, Esc to skip setup",
  "Use /onboard to revisit setup, or /auth set <provider> to add a key",
];

// =============================================================================
// Step Handler
// =============================================================================

/**
 * Welcome step handler interface
 */
export interface WelcomeStepHandler {
  /** Get welcome content */
  getContent(): WelcomeContent;
  /** Execute the welcome step */
  execute(state: OnboardingState): Promise<StepResult>;
}

/**
 * Welcome content structure
 */
export interface WelcomeContent {
  /** Main welcome message */
  message: string;
  /** Setup overview */
  overview: string;
  /** Quick tips */
  tips: string[];
}

/**
 * Create a welcome step handler
 */
export function createWelcomeStep(): WelcomeStepHandler {
  return {
    getContent(): WelcomeContent {
      return {
        message: WELCOME_MESSAGE,
        overview: SETUP_OVERVIEW,
        tips: QUICK_TIPS,
      };
    },

    async execute(_state: OnboardingState): Promise<StepResult> {
      // Welcome step always succeeds - it's just informational
      return {
        success: true,
        next: true,
        back: false,
        skip: false,
      };
    },
  };
}

/**
 * Format welcome content for terminal display
 */
export function formatWelcomeContent(content: WelcomeContent): string {
  const lines: string[] = [
    content.message,
    content.overview,
    "",
    "💡 Tips:",
    ...content.tips.map((tip) => `   • ${tip}`),
    "",
  ];

  return lines.join("\n");
}
