/**
 * Complete Step (Phase 38)
 *
 * Final step of the onboarding wizard that summarizes configuration
 * and provides quick-start tips for using Vellum.
 *
 * @module onboarding/steps/complete
 */

import type { CodingMode } from "../../agent/coding-modes.js";
import {
  MODE_INFO,
  type OnboardingProvider,
  type OnboardingResult,
  type OnboardingState,
  PROVIDER_INFO,
  type StepResult,
} from "../types.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Complete step summary
 */
export interface OnboardingSummary {
  /** Selected provider */
  provider: OnboardingProvider;
  /** Selected mode */
  mode: CodingMode;
  /** Whether credentials were configured */
  credentialsConfigured: boolean;
  /** Any warnings from setup */
  warnings: string[];
}

/**
 * Complete step handler interface
 */
export interface CompleteStepHandler {
  /** Generate summary from state */
  generateSummary(state: OnboardingState): OnboardingSummary;
  /** Get quick start tips */
  getQuickStartTips(): string[];
  /** Get next steps */
  getNextSteps(summary: OnboardingSummary): string[];
  /** Execute complete step */
  execute(state: OnboardingState): Promise<StepResult>;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Quick start tips for new users
 */
const QUICK_START_TIPS = [
  "Start with a simple task: 'add a function to calculate sum'",
  "Use /mode to switch between vibe, plan, and spec modes",
  "Type /help for a list of all commands",
  "Press Ctrl+C to cancel the current operation",
  "Use /clear to reset the conversation context",
];

/**
 * Common next steps based on configuration
 */
const NEXT_STEPS = {
  createProject: "Run 'vellum init' in your project directory",
  configureMore: "Edit ~/.vellum/config.toml for advanced settings",
  tryTask: "Try: 'vellum \"add a README file\"'",
  learnModes: "Learn about modes: 'vellum --help modes'",
};

// =============================================================================
// Implementation
// =============================================================================

/**
 * Create a complete step handler
 */
export function createCompleteStep(): CompleteStepHandler {
  return {
    generateSummary(state: OnboardingState): OnboardingSummary {
      return {
        provider: (state.selectedProvider as OnboardingProvider) || "anthropic",
        mode: (state.selectedMode as CodingMode) || "vibe",
        credentialsConfigured: state.credentialConfigured ?? false,
        warnings: state.error ? [state.error] : [],
      };
    },

    getQuickStartTips(): string[] {
      return QUICK_START_TIPS;
    },

    getNextSteps(summary: OnboardingSummary): string[] {
      const steps: string[] = [];

      // Add credential setup reminder if needed
      if (!summary.credentialsConfigured) {
        steps.push(
          `⚠️  Credentials not configured - run 'vellum credentials add ${summary.provider}'`
        );
      }

      // Add standard next steps
      steps.push(NEXT_STEPS.tryTask);
      steps.push(NEXT_STEPS.createProject);

      return steps;
    },

    async execute(state: OnboardingState): Promise<StepResult> {
      // Complete step always succeeds
      const summary = this.generateSummary(state);

      return {
        success: true,
        next: false, // No next step - we're done
        back: false,
        skip: false,
        data: {
          summary,
          tips: this.getQuickStartTips(),
          nextSteps: this.getNextSteps(summary),
        },
      };
    },
  };
}

/**
 * Format completion message
 */
export function formatCompletionMessage(summary: OnboardingSummary): string {
  const providerInfo = PROVIDER_INFO[summary.provider];
  const modeInfo = MODE_INFO[summary.mode];

  const credStatus = summary.credentialsConfigured ? "✅ Configured" : "⚠️  Not configured";
  const providerIcon = providerInfo?.icon ?? "🤖";
  const providerName = providerInfo?.name ?? summary.provider;
  const modeIcon = modeInfo?.icon ?? "⚡";
  const modeName = modeInfo?.name ?? summary.mode;

  return `
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   🎉  Setup Complete!                                        ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝

Your Configuration:
  ${providerIcon} Provider:    ${providerName}
  ${modeIcon} Mode:        ${modeName}
  🔐 Credentials: ${credStatus}

`;
}

/**
 * Format quick start section
 */
export function formatQuickStart(tips: string[], nextSteps: string[]): string {
  const lines: string[] = [
    "💡 Quick Start Tips:",
    ...tips.map((tip) => `   • ${tip}`),
    "",
    "📋 Next Steps:",
    ...nextSteps.map((step) => `   → ${step}`),
    "",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "",
    "Ready to code! Just describe what you want to build.",
    "",
  ];

  return lines.join("\n");
}

/**
 * Create onboarding result from state
 */
export function createOnboardingResult(state: OnboardingState): OnboardingResult {
  return {
    success: state.completed,
    skipped: !state.completed && !state.error,
    provider: state.selectedProvider as OnboardingProvider | undefined,
    mode: state.selectedMode as CodingMode | undefined,
    credentialsConfigured: state.credentialConfigured ?? false,
    error: state.error,
  };
}
