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
export const WELCOME_MESSAGE = `
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   👋  Welcome to Vellum!                                     ║
║                                                              ║
║   Vellum is an AI-powered coding assistant that helps        ║
║   you write, refactor, and understand code faster.           ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`;

/**
 * Setup overview displayed after welcome
 */
export const SETUP_OVERVIEW = `
This quick setup will help you:

  1. 🤖  Select your AI provider (Anthropic, OpenAI, etc.)
  2. 🔐  Configure your API credentials securely
  3. ⚡  Choose your preferred coding mode

It only takes a minute!
`;

/**
 * Tips displayed at the end of welcome
 */
export const QUICK_TIPS = [
  "Press Enter to continue, Esc to skip setup",
  "You can run 'vellum onboard' anytime to restart this wizard",
  "Check 'vellum --help' for all available commands",
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
