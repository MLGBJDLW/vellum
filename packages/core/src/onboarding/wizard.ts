/**
 * Onboarding Wizard (Phase 38)
 *
 * Orchestrates the onboarding flow for new Vellum users.
 * Manages step transitions, state persistence, and integration
 * with credential management.
 *
 * @module onboarding/wizard
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import type { CodingMode } from "../agent/coding-modes.js";
import type { CredentialManager } from "../credentials/manager.js";
import type { CredentialSource } from "../credentials/types.js";
import { Err, Ok, type Result } from "../types/result.js";
import {
  createCompleteStep,
  createCredentialSetupStep,
  createModeSelectStep,
  createOnboardingResult,
  createProviderSelectStep,
  createWelcomeStep,
  getDefaultModelForProvider,
  toProviderName,
} from "./steps/index.js";
import {
  INITIAL_ONBOARDING_STATE,
  ONBOARDING_STEP_CONFIG,
  ONBOARDING_STEPS,
  type OnboardingOptions,
  type OnboardingProvider,
  type OnboardingResult,
  type OnboardingState,
  type OnboardingStep,
  type StepResult,
} from "./types.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Error codes for onboarding operations
 */
export type OnboardingErrorCode =
  | "STATE_LOAD_FAILED"
  | "STATE_SAVE_FAILED"
  | "CREDENTIAL_SAVE_FAILED"
  | "CONFIG_SAVE_FAILED"
  | "STEP_FAILED"
  | "CANCELLED";

/**
 * Onboarding error
 */
export interface OnboardingError {
  code: OnboardingErrorCode;
  message: string;
  cause?: unknown;
}

/**
 * Wizard event types
 */
export interface WizardEvents {
  /** Fired when step changes */
  onStepChange?: (step: OnboardingStep, state: OnboardingState) => void;
  /** Fired when step completes */
  onStepComplete?: (step: OnboardingStep, result: StepResult) => void;
  /** Fired on error */
  onError?: (error: OnboardingError) => void;
  /** Fired when wizard completes */
  onComplete?: (result: OnboardingResult) => void;
}

// =============================================================================
// Paths
// =============================================================================

/**
 * Get Vellum config directory
 */
function getVellumDir(): string {
  const home = os.homedir();
  return path.join(home, ".vellum");
}

/**
 * Get onboarding state file path
 */
function getOnboardingStatePath(): string {
  return path.join(getVellumDir(), "onboarding.json");
}

// =============================================================================
// OnboardingWizard Class
// =============================================================================

/**
 * Onboarding wizard that guides new users through setup
 */
export class OnboardingWizard {
  private state: OnboardingState;
  private events: WizardEvents;
  private credentialManager?: CredentialManager;

  // Step handlers
  private readonly welcomeStep = createWelcomeStep();
  private readonly providerStep = createProviderSelectStep();
  private readonly credentialStep = createCredentialSetupStep();
  private readonly modeStep = createModeSelectStep();
  private readonly completeStep = createCompleteStep();

  constructor(_options: OnboardingOptions = {}, events: WizardEvents = {}) {
    this.state = { ...INITIAL_ONBOARDING_STATE };
    this.events = events;
  }

  /**
   * Set credential manager for secure storage
   */
  setCredentialManager(manager: CredentialManager): void {
    this.credentialManager = manager;
  }

  /**
   * Check if onboarding has been completed
   */
  static async isCompleted(): Promise<boolean> {
    try {
      const statePath = getOnboardingStatePath();
      if (!fs.existsSync(statePath)) {
        return false;
      }

      const content = fs.readFileSync(statePath, "utf-8");
      const state = JSON.parse(content) as OnboardingState;
      return state.completed === true;
    } catch {
      return false;
    }
  }

  /**
   * Check if this is first run (no config exists)
   */
  static isFirstRun(): boolean {
    const vellumDir = getVellumDir();
    return !fs.existsSync(vellumDir);
  }

  /**
   * Reset onboarding state
   */
  static async reset(): Promise<void> {
    const statePath = getOnboardingStatePath();
    if (fs.existsSync(statePath)) {
      fs.unlinkSync(statePath);
    }
  }

  // ===========================================================================
  // State Management
  // ===========================================================================

  /**
   * Load state from file
   */
  async loadState(): Promise<Result<OnboardingState, OnboardingError>> {
    try {
      const statePath = getOnboardingStatePath();

      if (!fs.existsSync(statePath)) {
        return Ok(this.state);
      }

      const content = fs.readFileSync(statePath, "utf-8");
      const loaded = JSON.parse(content) as OnboardingState;
      this.state = { ...INITIAL_ONBOARDING_STATE, ...loaded };
      return Ok(this.state);
    } catch (err) {
      const error: OnboardingError = {
        code: "STATE_LOAD_FAILED",
        message: "Failed to load onboarding state",
        cause: err,
      };
      this.events.onError?.(error);
      return Err(error);
    }
  }

  /**
   * Save state to file
   */
  async saveState(): Promise<Result<void, OnboardingError>> {
    try {
      const vellumDir = getVellumDir();
      if (!fs.existsSync(vellumDir)) {
        fs.mkdirSync(vellumDir, { recursive: true });
      }

      const statePath = getOnboardingStatePath();
      fs.writeFileSync(statePath, JSON.stringify(this.state, null, 2));
      return Ok(undefined);
    } catch (err) {
      const error: OnboardingError = {
        code: "STATE_SAVE_FAILED",
        message: "Failed to save onboarding state",
        cause: err,
      };
      this.events.onError?.(error);
      return Err(error);
    }
  }

  /**
   * Get current state
   */
  getState(): OnboardingState {
    return { ...this.state };
  }

  /**
   * Get current step
   */
  getCurrentStep(): OnboardingStep {
    return this.state.currentStep;
  }

  /**
   * Get step config
   */
  getStepConfig(step: OnboardingStep) {
    return ONBOARDING_STEP_CONFIG[step];
  }

  /**
   * Get step index
   */
  getStepIndex(step: OnboardingStep): number {
    return ONBOARDING_STEPS.indexOf(step);
  }

  /**
   * Get total steps
   */
  getTotalSteps(): number {
    return ONBOARDING_STEPS.length;
  }

  // ===========================================================================
  // Step Execution
  // ===========================================================================

  /**
   * Execute welcome step
   */
  async executeWelcome(): Promise<StepResult> {
    const result = await this.welcomeStep.execute(this.state);
    this.events.onStepComplete?.("welcome", result);

    if (result.next) {
      await this.goToStep("provider-select");
    }

    return result;
  }

  /**
   * Execute provider selection step
   */
  async executeProviderSelect(selection: string): Promise<StepResult> {
    const result = await this.providerStep.execute(this.state, selection);
    this.events.onStepComplete?.("provider-select", result);

    if (result.success && result.data) {
      this.state.selectedProvider = result.data.provider as string | undefined;
    }

    if (result.back) {
      await this.goToStep("welcome");
    } else if (result.next) {
      await this.goToStep("credential-setup");
    }

    return result;
  }

  /**
   * Execute credential setup step
   */
  async executeCredentialSetup(
    apiKey: string,
    source: CredentialSource = "keychain"
  ): Promise<StepResult> {
    const provider = this.state.selectedProvider as OnboardingProvider;
    const result = await this.credentialStep.execute(this.state, provider, apiKey, source);
    this.events.onStepComplete?.("credential-setup", result);

    if (result.success && result.data?.saved && this.credentialManager) {
      // Save credential using credential manager
      const credentialInput = result.data.credentialInput as
        | import("../credentials/types.js").CredentialInput
        | undefined;
      if (credentialInput) {
        const saveResult = await this.credentialManager.store(credentialInput);
        if (saveResult.ok) {
          this.state.credentialConfigured = true;
        } else {
          // Warn but don't fail - user can configure later
          this.events.onError?.({
            code: "CREDENTIAL_SAVE_FAILED",
            message: saveResult.error.message,
          });
        }
      }
    }

    if (result.back) {
      await this.goToStep("provider-select");
    } else if (result.next) {
      await this.goToStep("mode-select");
    }

    return result;
  }

  /**
   * Execute mode selection step
   */
  async executeModeSelect(selection: string): Promise<StepResult> {
    const result = await this.modeStep.execute(this.state, selection);
    this.events.onStepComplete?.("mode-select", result);

    if (result.success && result.data) {
      this.state.selectedMode = result.data.mode as string | undefined;
    }

    if (result.back) {
      await this.goToStep("credential-setup");
    } else if (result.next) {
      await this.goToStep("complete");
    }

    return result;
  }

  /**
   * Execute complete step
   */
  async executeComplete(): Promise<StepResult> {
    const result = await this.completeStep.execute(this.state);
    this.events.onStepComplete?.("complete", result);

    // Mark as completed
    this.state.completed = true;
    this.state.completedAt = new Date().toISOString();

    // Save final state
    await this.saveState();

    // Fire completion event
    const onboardingResult = createOnboardingResult(this.state);
    this.events.onComplete?.(onboardingResult);

    return result;
  }

  /**
   * Go to specific step
   */
  async goToStep(step: OnboardingStep): Promise<void> {
    this.state.currentStep = step;
    this.events.onStepChange?.(step, this.state);
    await this.saveState();
  }

  /**
   * Go to next step
   */
  async nextStep(): Promise<OnboardingStep | null> {
    const currentIndex = this.getStepIndex(this.state.currentStep);
    if (currentIndex < ONBOARDING_STEPS.length - 1) {
      const nextStep = ONBOARDING_STEPS[currentIndex + 1];
      if (nextStep) {
        await this.goToStep(nextStep);
        return nextStep;
      }
    }
    return null;
  }

  /**
   * Go to previous step
   */
  async prevStep(): Promise<OnboardingStep | null> {
    const currentIndex = this.getStepIndex(this.state.currentStep);
    if (currentIndex > 0) {
      const prevStep = ONBOARDING_STEPS[currentIndex - 1];
      if (prevStep) {
        await this.goToStep(prevStep);
        return prevStep;
      }
    }
    return null;
  }

  // ===========================================================================
  // Configuration Output
  // ===========================================================================

  /**
   * Generate config from onboarding selections
   */
  generateConfig(): {
    provider: string;
    model: string;
    mode: CodingMode;
  } {
    const provider = (this.state.selectedProvider as OnboardingProvider) || "anthropic";
    const mode = (this.state.selectedMode as CodingMode) || "vibe";

    return {
      provider: toProviderName(provider),
      model: getDefaultModelForProvider(provider),
      mode,
    };
  }

  /**
   * Save generated config to file
   */
  async saveConfig(): Promise<Result<string, OnboardingError>> {
    try {
      const config = this.generateConfig();
      const configPath = path.join(getVellumDir(), "config.toml");

      const tomlContent = `# Vellum Configuration
# Generated by onboarding wizard

[llm]
provider = "${config.provider}"
model = "${config.model}"

[agent]
# Default coding mode
# Options: vibe, plan, spec
defaultMode = "${config.mode}"
`;

      fs.writeFileSync(configPath, tomlContent);
      return Ok(configPath);
    } catch (err) {
      const error: OnboardingError = {
        code: "CONFIG_SAVE_FAILED",
        message: "Failed to save configuration",
        cause: err,
      };
      return Err(error);
    }
  }
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Run onboarding wizard (non-interactive check)
 *
 * Returns null if onboarding already completed, wizard instance otherwise.
 */
export async function runOnboarding(
  options: OnboardingOptions = {}
): Promise<OnboardingWizard | null> {
  // Check if already completed (unless force)
  if (!options.force && (await OnboardingWizard.isCompleted())) {
    return null;
  }

  const wizard = new OnboardingWizard(options);
  await wizard.loadState();

  // Start from beginning if force mode
  if (options.force) {
    await wizard.goToStep("welcome");
  }

  // Set start time
  if (!wizard.getState().startedAt) {
    const state = wizard.getState();
    state.startedAt = new Date().toISOString();
  }

  return wizard;
}

/**
 * Check if onboarding should run
 */
export async function shouldRunOnboarding(): Promise<boolean> {
  // First run always needs onboarding
  if (OnboardingWizard.isFirstRun()) {
    return true;
  }

  // Check if completed
  const completed = await OnboardingWizard.isCompleted();
  return !completed;
}

/**
 * Reset onboarding state
 */
export async function resetOnboarding(): Promise<void> {
  await OnboardingWizard.reset();
}
