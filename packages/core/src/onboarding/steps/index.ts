/**
 * Onboarding Steps Barrel Export (Phase 38)
 *
 * @module onboarding/steps
 */

// Complete step
export {
  type CompleteStepHandler,
  createCompleteStep,
  createOnboardingResult,
  formatCompletionMessage,
  formatQuickStart,
  type OnboardingSummary,
} from "./complete.js";
// Credential setup step
export {
  type CredentialSetupData,
  type CredentialSetupStepHandler,
  createCredentialSetupStep,
  formatCredentialPrompt,
  getApiKeyUrl,
  getRecommendedSource,
  type ValidationResult,
} from "./credential-setup.js";
// Mode selection step
export {
  createModeSelectStep,
  formatModeList,
  getModeExplanation,
  type ModeSelectData,
  type ModeSelectStepHandler,
} from "./mode-select.js";
// Provider selection step
export {
  createProviderSelectStep,
  formatProviderList,
  getDefaultModelForProvider,
  type ProviderSelectData,
  type ProviderSelectStepHandler,
  toProviderName,
} from "./provider-select.js";
// Welcome step
export {
  createWelcomeStep,
  formatWelcomeContent,
  QUICK_TIPS,
  SETUP_OVERVIEW,
  WELCOME_MESSAGE,
  type WelcomeContent,
  type WelcomeStepHandler,
} from "./welcome.js";
