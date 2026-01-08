/**
 * OnboardingWizard TUI Component (Phase 38)
 *
 * React Ink component that renders the onboarding wizard UI.
 * Provides step-by-step navigation with progress indicator.
 *
 * @module tui/components/OnboardingWizard
 */

import {
  createCompleteStep,
  createModeSelectStep,
  createProviderSelectStep,
  createWelcomeStep,
  formatCompletionMessage,
  formatCredentialPrompt,
  formatModeList,
  formatProviderList,
  formatQuickStart,
  formatWelcomeContent,
  getRecommendedSource,
  ONBOARDING_STEP_CONFIG,
  ONBOARDING_STEPS,
  type OnboardingStep,
  type PROVIDER_INFO,
  OnboardingWizard as WizardCore,
} from "@vellum/core";
import { Box, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { useTheme } from "../theme/index.js";

// =============================================================================
// Types
// =============================================================================

/** Onboarding provider type */
type OnboardingProvider = keyof typeof PROVIDER_INFO;

/**
 * Props for OnboardingWizard component
 */
export interface OnboardingWizardProps {
  /** Pre-initialized wizard instance */
  wizard?: WizardCore;
  /** Initial step to show */
  initialStep?: OnboardingStep;
  /** Callback when onboarding completes */
  onComplete?: (result: { provider: string; mode: string; credentialsConfigured: boolean }) => void;
  /** Callback when user cancels */
  onCancel?: () => void;
}

/**
 * Internal state
 */
interface WizardState {
  step: OnboardingStep;
  input: string;
  error: string | null;
  isLoading: boolean;
  selectedProvider: OnboardingProvider | null;
  selectedMode: string | null;
  credentialsConfigured: boolean;
}

// =============================================================================
// Sub-components
// =============================================================================

/**
 * Progress indicator showing current step
 */
function ProgressBar({ currentStep }: { currentStep: OnboardingStep }): React.ReactElement {
  const { theme } = useTheme();
  const currentIndex = ONBOARDING_STEPS.indexOf(currentStep);
  const total = ONBOARDING_STEPS.length;

  return (
    <Box marginBottom={1}>
      <Text color={theme.colors.muted}>
        Step {currentIndex + 1} of {total}:{" "}
      </Text>
      <Text bold color={theme.colors.primary}>
        {ONBOARDING_STEP_CONFIG[currentStep].icon} {ONBOARDING_STEP_CONFIG[currentStep].title}
      </Text>
      <Text color={theme.colors.muted}>
        {" "}
        [
        {ONBOARDING_STEPS.map((_s: OnboardingStep, i: number) =>
          i <= currentIndex ? "●" : "○"
        ).join("")}
        ]
      </Text>
    </Box>
  );
}

/**
 * Welcome step content
 */
function WelcomeContent(): React.ReactElement {
  const welcomeStep = createWelcomeStep();
  const content = welcomeStep.getContent();

  return (
    <Box flexDirection="column">
      <Text>{formatWelcomeContent(content)}</Text>
      <Box marginTop={1}>
        <Text color="gray">Press Enter to continue, Esc to skip setup</Text>
      </Box>
    </Box>
  );
}

/**
 * Provider selection content
 */
function ProviderSelectContent({
  onInputChange,
  inputValue,
  error,
}: {
  onInputChange: (value: string) => void;
  inputValue: string;
  error: string | null;
}): React.ReactElement {
  const providerStep = createProviderSelectStep();
  const providers = providerStep.getProviders();

  return (
    <Box flexDirection="column">
      <Text>{formatProviderList(providers)}</Text>
      <Box marginTop={1}>
        <Text color="cyan">› </Text>
        <TextInput value={inputValue} onChange={onInputChange} />
      </Box>
      {error && (
        <Box marginTop={1}>
          <Text color="red">⚠️ {error}</Text>
        </Box>
      )}
    </Box>
  );
}

/**
 * Credential setup content
 */
function CredentialSetupContent({
  provider,
  onInputChange,
  inputValue,
  error,
}: {
  provider: OnboardingProvider;
  onInputChange: (value: string) => void;
  inputValue: string;
  error: string | null;
}): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text>{formatCredentialPrompt(provider)}</Text>
      <Box marginTop={1}>
        <Text color="cyan">API Key: </Text>
        <TextInput value={inputValue} onChange={onInputChange} mask="*" />
      </Box>
      {error && (
        <Box marginTop={1}>
          <Text color="red">⚠️ {error}</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <Text color="gray">Press Backspace to go back, 'skip' to configure later</Text>
      </Box>
    </Box>
  );
}

/**
 * Mode selection content
 */
function ModeSelectContent({
  onInputChange,
  inputValue,
  error,
}: {
  onInputChange: (value: string) => void;
  inputValue: string;
  error: string | null;
}): React.ReactElement {
  const modeStep = createModeSelectStep();
  const modes = modeStep.getModes();

  return (
    <Box flexDirection="column">
      <Text>{formatModeList(modes)}</Text>
      <Box marginTop={1}>
        <Text color="cyan">› </Text>
        <TextInput value={inputValue} onChange={onInputChange} />
      </Box>
      {error && (
        <Box marginTop={1}>
          <Text color="red">⚠️ {error}</Text>
        </Box>
      )}
    </Box>
  );
}

/**
 * Complete step content
 */
function CompleteContent({
  provider,
  mode,
  credentialsConfigured,
}: {
  provider: OnboardingProvider;
  mode: string;
  credentialsConfigured: boolean;
}): React.ReactElement {
  const completeStep = createCompleteStep();
  const summary = {
    provider,
    mode: mode as "vibe" | "plan" | "spec",
    credentialsConfigured,
    warnings: [],
  };

  return (
    <Box flexDirection="column">
      <Text>{formatCompletionMessage(summary)}</Text>
      <Text>
        {formatQuickStart(completeStep.getQuickStartTips(), completeStep.getNextSteps(summary))}
      </Text>
      <Box marginTop={1}>
        <Text color="green">Press Enter to start using Vellum!</Text>
      </Box>
    </Box>
  );
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * OnboardingWizard - Interactive setup wizard component
 */
export function OnboardingWizard({
  wizard: providedWizard,
  initialStep = "welcome",
  onComplete,
  onCancel,
}: OnboardingWizardProps): React.ReactElement {
  const { exit } = useApp();
  const { theme } = useTheme();

  // Initialize wizard
  const [wizard] = useState(() => providedWizard || new WizardCore());

  // Component state
  const [state, setState] = useState<WizardState>({
    step: initialStep,
    input: "",
    error: null,
    isLoading: false,
    selectedProvider: null,
    selectedMode: null,
    credentialsConfigured: false,
  });

  // Load wizard state on mount
  useEffect(() => {
    wizard.loadState().then(() => {
      const wizardState = wizard.getState();
      setState((s) => ({
        ...s,
        step: wizardState.currentStep,
        selectedProvider: wizardState.selectedProvider as OnboardingProvider | null,
        selectedMode: wizardState.selectedMode || null,
      }));
    });
  }, [wizard]);

  // Handle input change
  const handleInputChange = useCallback((value: string) => {
    setState((s) => ({ ...s, input: value, error: null }));
  }, []);

  // Handle step submission
  const handleSubmit = useCallback(async () => {
    setState((s) => ({ ...s, isLoading: true, error: null }));

    try {
      switch (state.step) {
        case "welcome": {
          const result = await wizard.executeWelcome();
          if (result.next) {
            setState((s) => ({ ...s, step: "provider-select", input: "", isLoading: false }));
          }
          break;
        }

        case "provider-select": {
          // Normalize number input
          let selection = state.input.trim();
          if (["1", "2", "3", "4", "5", "6", "7", "8"].includes(selection)) {
            const providers = [
              "anthropic",
              "openai",
              "google",
              "gemini",
              "mistral",
              "groq",
              "openrouter",
              "ollama",
            ];
            selection = providers[parseInt(selection, 10) - 1] || selection;
          }

          const result = await wizard.executeProviderSelect(selection || "anthropic");
          if (result.success && result.next) {
            setState((s) => ({
              ...s,
              step: "credential-setup",
              input: "",
              isLoading: false,
              selectedProvider: (result.data?.provider as OnboardingProvider) || "anthropic",
            }));
          } else if (result.error) {
            setState((s) => ({ ...s, error: result.error || null, isLoading: false }));
          }
          break;
        }

        case "credential-setup": {
          const source = getRecommendedSource();
          const result = await wizard.executeCredentialSetup(state.input, source);
          if (result.success && result.next) {
            setState((s) => ({
              ...s,
              step: "mode-select",
              input: "",
              isLoading: false,
              credentialsConfigured: (result.data?.saved as boolean) ?? false,
            }));
          } else if (result.back) {
            setState((s) => ({ ...s, step: "provider-select", input: "", isLoading: false }));
          } else if (result.error) {
            setState((s) => ({ ...s, error: result.error || null, isLoading: false }));
          }
          break;
        }

        case "mode-select": {
          const result = await wizard.executeModeSelect(state.input || "1");
          if (result.success && result.next) {
            setState((s) => ({
              ...s,
              step: "complete",
              input: "",
              isLoading: false,
              selectedMode: (result.data?.mode as string) || "vibe",
            }));
          } else if (result.back) {
            setState((s) => ({ ...s, step: "credential-setup", input: "", isLoading: false }));
          } else if (result.error) {
            setState((s) => ({ ...s, error: result.error || null, isLoading: false }));
          }
          break;
        }

        case "complete": {
          await wizard.executeComplete();
          await wizard.saveConfig();

          // Fire completion callback
          onComplete?.({
            provider: state.selectedProvider || "anthropic",
            mode: state.selectedMode || "vibe",
            credentialsConfigured: state.credentialsConfigured,
          });

          // Exit the wizard
          exit();
          break;
        }
      }
    } catch (err) {
      setState((s) => ({
        ...s,
        error: err instanceof Error ? err.message : "An error occurred",
        isLoading: false,
      }));
    }
  }, [state, wizard, onComplete, exit]);

  // Handle keyboard input
  useInput(
    useCallback(
      (_input: string, key) => {
        // Escape to cancel
        if (key.escape) {
          onCancel?.();
          exit();
          return;
        }

        // Enter to submit
        if (key.return) {
          handleSubmit();
          return;
        }

        // Backspace on empty input = back
        if (key.backspace && state.input === "" && state.step !== "welcome") {
          const steps = ONBOARDING_STEPS;
          const currentIndex = steps.indexOf(state.step);
          if (currentIndex > 0) {
            const prevStep = steps[currentIndex - 1];
            if (prevStep) {
              setState((s) => ({ ...s, step: prevStep, error: null }));
            }
          }
        }
      },
      [state, handleSubmit, onCancel, exit]
    )
  );

  // Render step content
  const renderStepContent = () => {
    switch (state.step) {
      case "welcome":
        return <WelcomeContent />;

      case "provider-select":
        return (
          <ProviderSelectContent
            onInputChange={handleInputChange}
            inputValue={state.input}
            error={state.error}
          />
        );

      case "credential-setup":
        return (
          <CredentialSetupContent
            provider={state.selectedProvider || "anthropic"}
            onInputChange={handleInputChange}
            inputValue={state.input}
            error={state.error}
          />
        );

      case "mode-select":
        return (
          <ModeSelectContent
            onInputChange={handleInputChange}
            inputValue={state.input}
            error={state.error}
          />
        );

      case "complete":
        return (
          <CompleteContent
            provider={state.selectedProvider || "anthropic"}
            mode={state.selectedMode || "vibe"}
            credentialsConfigured={state.credentialsConfigured}
          />
        );
    }
  };

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box
        borderStyle="round"
        borderColor={theme.colors.primary}
        paddingX={2}
        paddingY={1}
        marginBottom={1}
      >
        <Text bold color={theme.colors.primary}>
          🚀 Vellum Setup Wizard
        </Text>
      </Box>

      {/* Progress */}
      <ProgressBar currentStep={state.step} />

      {/* Content */}
      <Box flexDirection="column" marginY={1}>
        {state.isLoading ? (
          <Text color={theme.colors.info}>⏳ Processing...</Text>
        ) : (
          renderStepContent()
        )}
      </Box>

      {/* Footer */}
      <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
        <Text color="gray">Esc: Cancel | Enter: Continue | ←/Backspace: Back</Text>
      </Box>
    </Box>
  );
}

export default OnboardingWizard;
