/**
 * Onboarding Module (Phase 38)
 *
 * Provides first-run onboarding wizard for new Vellum users.
 * Guides through provider selection, credential setup, and mode selection.
 *
 * @module onboarding
 *
 * @example
 * ```typescript
 * import {
 *   OnboardingWizard,
 *   runOnboarding,
 *   shouldRunOnboarding,
 * } from '@vellum/core/onboarding';
 *
 * // Check if onboarding needed
 * if (await shouldRunOnboarding()) {
 *   const wizard = await runOnboarding();
 *   if (wizard) {
 *     // Run wizard steps...
 *   }
 * }
 * ```
 */

// =============================================================================
// Types
// =============================================================================

export {
  INITIAL_ONBOARDING_STATE,
  MODE_INFO,
  // Mode types
  type ModeInfo,
  ONBOARDING_PROVIDERS,
  ONBOARDING_STEP_CONFIG,
  ONBOARDING_STEPS,
  // Options
  type OnboardingOptions,
  // Provider types
  type OnboardingProvider,
  type OnboardingResult,
  // State
  type OnboardingState,
  OnboardingStateSchema,
  // Step type
  type OnboardingStep,
  // Step config
  type OnboardingStepConfig,
  OnboardingStepSchema,
  PROVIDER_INFO,
  type ProviderInfo,
  // Result types
  type StepResult,
} from "./types.js";

// =============================================================================
// Steps
// =============================================================================

export {
  type CompleteStepHandler,
  type CredentialSetupData,
  type CredentialSetupStepHandler,
  // Complete
  createCompleteStep,
  // Credential setup
  createCredentialSetupStep,
  // Mode select
  createModeSelectStep,
  createOnboardingResult,
  // Provider select
  createProviderSelectStep,
  // Welcome
  createWelcomeStep,
  formatCompletionMessage,
  formatCredentialPrompt,
  formatModeList,
  formatProviderList,
  formatQuickStart,
  formatWelcomeContent,
  getApiKeyUrl,
  getDefaultModelForProvider,
  getModeExplanation,
  getRecommendedSource,
  type ModeSelectData,
  type ModeSelectStepHandler,
  type OnboardingSummary,
  type ProviderSelectData,
  type ProviderSelectStepHandler,
  QUICK_TIPS,
  SETUP_OVERVIEW,
  toProviderName,
  type ValidationResult,
  WELCOME_MESSAGE,
  type WelcomeContent,
  type WelcomeStepHandler,
} from "./steps/index.js";

// =============================================================================
// Wizard
// =============================================================================

export {
  type OnboardingError,
  type OnboardingErrorCode,
  OnboardingWizard,
  resetOnboarding,
  runOnboarding,
  shouldRunOnboarding,
  type WizardEvents,
} from "./wizard.js";
