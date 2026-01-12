/**
 * Onboard Command (Phase 38)
 *
 * CLI command to run or restart the onboarding wizard.
 * Can be invoked as `vellum onboard` or `/onboard` slash command.
 *
 * @module cli/commands/onboard
 */

import { EXIT_CODES } from "./exit-codes.js";
import type { CommandContext, CommandResult, SlashCommand } from "./types.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Onboard command options
 */
export interface OnboardOptions {
  /** Force restart even if already completed */
  force?: boolean;
  /** Skip to specific step */
  step?: string;
  /** Non-interactive mode */
  nonInteractive?: boolean;
}

/**
 * Onboard command result
 */
export interface OnboardResult {
  /** Whether onboarding completed successfully */
  success: boolean;
  /** Selected provider */
  provider?: string;
  /** Selected mode */
  mode?: string;
  /** Whether credentials were configured */
  credentialsConfigured: boolean;
  /** Error message if failed */
  error?: string;
  /** Exit code */
  exitCode: number;
}

// =============================================================================
// Slash Command Definition
// =============================================================================

/**
 * Onboard slash command definition
 */
export const onboardCommand: SlashCommand = {
  name: "onboard",
  aliases: ["setup", "wizard"],
  description: "Run the onboarding wizard to configure Vellum",
  category: "session",
  kind: "builtin",
  positionalArgs: [
    {
      name: "force",
      type: "boolean",
      description: "Force restart even if already completed",
      required: false,
    },
  ],
  namedArgs: [
    {
      name: "step",
      type: "string",
      description:
        "Skip to specific step (welcome, provider-select, credential-setup, mode-select)",
      required: false,
    },
  ],
  subcommands: [
    { name: "welcome", description: "Show welcome screen" },
    { name: "provider", description: "Configure LLM provider", aliases: ["provider-select"] },
    { name: "credential", description: "Setup API credentials", aliases: ["credential-setup"] },
    { name: "mode", description: "Choose default mode", aliases: ["mode-select"] },
  ],
  examples: [
    "/onboard - Run onboarding wizard",
    "/onboard --force - Restart onboarding from beginning",
    "/onboard --step provider-select - Jump to provider selection",
  ],
  execute: async (context: CommandContext): Promise<CommandResult> => {
    const { parsedArgs } = context;
    const force = parsedArgs.positional[0] === "true" || parsedArgs.named.force === "true";
    const stepArg = parsedArgs.named.step as string | undefined;

    // Import dynamically to avoid circular dependencies
    const { OnboardingWizard, shouldRunOnboarding, ONBOARDING_STEPS } = await import(
      "@vellum/core"
    );

    // Check if onboarding needed
    const needsOnboarding = await shouldRunOnboarding();

    if (!needsOnboarding && !force) {
      return {
        kind: "success",
        message: "✅ Onboarding already completed. Use --force to restart.",
      };
    }

    // Create wizard with force option
    const wizard = new OnboardingWizard({ force });
    await wizard.loadState();

    // Jump to specific step if requested
    if (stepArg) {
      const validSteps = ONBOARDING_STEPS as readonly string[];
      if (!validSteps.includes(stepArg)) {
        return {
          kind: "error",
          code: "INVALID_ARGUMENT",
          message: `Invalid step: ${stepArg}. Valid steps: ${validSteps.join(", ")}`,
        };
      }
      await wizard.goToStep(
        stepArg as "welcome" | "provider-select" | "credential-setup" | "mode-select" | "complete"
      );
    }

    // Return interactive prompt that triggers wizard
    return {
      kind: "interactive",
      prompt: {
        inputType: "text",
        message: `🚀 Starting Vellum Setup Wizard\n\nThis will guide you through:\n• Provider selection (Anthropic, OpenAI, etc.)\n• API key configuration\n• Default mode selection\n\nPress Enter to continue or type 'skip' to exit.`,
        placeholder: "",
        defaultValue: "",
        handler: async (value: string): Promise<CommandResult> => {
          if (value.toLowerCase() === "skip") {
            return {
              kind: "success",
              message: "Onboarding skipped. Run /onboard when ready.",
            };
          }

          // Run welcome step
          await wizard.executeWelcome();

          return {
            kind: "success",
            message: `✅ Welcome complete!\n\nCurrent step: ${wizard.getCurrentStep()}\n\nFor the full wizard experience, use the TUI or run:\n• /provider - Select AI provider\n• /credentials - Configure API keys\n• /mode - Set default mode`,
          };
        },
        onCancel: () => ({
          kind: "success",
          message: "Onboarding cancelled. Run /onboard when ready.",
        }),
      },
    };
  },
};

// =============================================================================
// CLI Entry Point
// =============================================================================

/**
 * Run onboard command from CLI (non-TUI mode)
 */
export async function runOnboardCommand(options: OnboardOptions = {}): Promise<OnboardResult> {
  const { OnboardingWizard, shouldRunOnboarding } = await import("@vellum/core");

  // Check if needed
  if (!options.force && !(await shouldRunOnboarding())) {
    return {
      success: true,
      credentialsConfigured: true,
      exitCode: EXIT_CODES.SUCCESS,
    };
  }

  // For non-interactive, just report status
  if (options.nonInteractive) {
    const isFirstRun = OnboardingWizard.isFirstRun();
    return {
      success: false,
      credentialsConfigured: false,
      error: isFirstRun
        ? "First run detected. Please run 'vellum onboard' interactively."
        : "Onboarding incomplete. Please run 'vellum onboard' interactively.",
      exitCode: EXIT_CODES.ERROR,
    };
  }

  // Interactive mode handled by TUI
  const wizard = new OnboardingWizard({ force: options.force });
  await wizard.loadState();

  // Return wizard for TUI to handle
  return {
    success: false,
    credentialsConfigured: false,
    error: "Interactive mode required",
    exitCode: EXIT_CODES.SUCCESS,
  };
}

export default onboardCommand;
