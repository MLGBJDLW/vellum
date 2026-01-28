/**
 * Provider Selection Step (Phase 38)
 *
 * Allows user to select their preferred AI provider during onboarding.
 * Displays available providers with descriptions and validates selection.
 *
 * @module onboarding/steps/provider-select
 */

import type { ProviderName } from "../../config/schema.js";
import {
  ONBOARDING_PROVIDERS,
  type OnboardingProvider,
  type OnboardingState,
  PROVIDER_INFO,
  type ProviderInfo,
  type StepResult,
} from "../types.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Provider selection result data
 */
export interface ProviderSelectData {
  /** Selected provider */
  provider: OnboardingProvider;
  /** Provider display info */
  providerInfo: ProviderInfo;
}

/**
 * Provider select step handler interface
 */
export interface ProviderSelectStepHandler {
  /** Get available providers */
  getProviders(): ProviderInfo[];
  /** Validate provider selection */
  validateSelection(provider: string): boolean;
  /** Get default provider */
  getDefault(): OnboardingProvider;
  /** Execute provider selection step */
  execute(state: OnboardingState, selection: string): Promise<StepResult>;
}

// =============================================================================
// Implementation
// =============================================================================

/**
 * Create a provider selection step handler
 */
export function createProviderSelectStep(): ProviderSelectStepHandler {
  return {
    getProviders(): ProviderInfo[] {
      return ONBOARDING_PROVIDERS.map((id) => PROVIDER_INFO[id]);
    },

    validateSelection(provider: string): boolean {
      return ONBOARDING_PROVIDERS.includes(provider as OnboardingProvider);
    },

    getDefault(): OnboardingProvider {
      // Default to Anthropic as it's optimized for coding
      return "anthropic";
    },

    async execute(_state: OnboardingState, selection: string): Promise<StepResult> {
      // Handle back navigation
      if (selection === "back") {
        return {
          success: true,
          next: false,
          back: true,
          skip: false,
        };
      }

      // Handle skip
      if (selection === "skip") {
        return {
          success: true,
          next: true,
          back: false,
          skip: true,
          data: {
            provider: this.getDefault(),
            skipped: true,
          },
        };
      }

      // Validate selection
      if (!this.validateSelection(selection)) {
        return {
          success: false,
          next: false,
          back: false,
          skip: false,
          error: `Invalid provider: ${selection}. Choose from: ${ONBOARDING_PROVIDERS.join(", ")}`,
        };
      }

      const provider = selection as OnboardingProvider;
      const providerInfo = PROVIDER_INFO[provider];

      return {
        success: true,
        next: true,
        back: false,
        skip: false,
        data: {
          provider,
          providerInfo,
        } satisfies ProviderSelectData,
      };
    },
  };
}

/**
 * Get provider as ProviderName type for config
 */
export function toProviderName(provider: OnboardingProvider): ProviderName {
  // Map onboarding provider to config ProviderName
  // Most are direct mappings except a few
  const mapping: Record<OnboardingProvider, ProviderName> = {
    anthropic: "anthropic",
    openai: "openai",
    google: "google",
    mistral: "mistral",
    groq: "groq",
    openrouter: "openrouter",
    xai: "xai",
    deepseek: "deepseek",
    qwen: "qwen",
    moonshot: "moonshot",
    zhipu: "zhipu",
    yi: "yi",
    baichuan: "baichuan",
    doubao: "doubao",
    minimax: "minimax",
    ollama: "ollama",
    lmstudio: "lmstudio",
  };

  return mapping[provider];
}

/**
 * Format provider list for display
 */
export function formatProviderList(providers: ProviderInfo[]): string {
  const lines: string[] = [
    "🤖 Select your AI Provider:",
    "",
    ...providers.map((p, index) => {
      const num = index + 1;
      const apiNote = p.requiresApiKey ? "(requires API key)" : "(local, no key needed)";
      return `  ${num}. ${p.icon} ${p.name}\n     ${p.description} ${apiNote}`;
    }),
    "",
    `Enter number (1-${providers.length}) or provider name:`,
  ];

  return lines.join("\n");
}

/**
 * Get default model for a provider
 */
export function getDefaultModelForProvider(provider: OnboardingProvider): string {
  const models: Record<OnboardingProvider, string> = {
    anthropic: "claude-sonnet-4-20250514",
    openai: "gpt-4o",
    google: "gemini-2.5-pro",
    mistral: "mistral-large-latest",
    groq: "llama-3.3-70b-versatile",
    openrouter: "anthropic/claude-3.5-sonnet",
    xai: "grok-2",
    deepseek: "deepseek-chat",
    qwen: "qwen-plus",
    moonshot: "kimi-k2.5",
    zhipu: "glm-4",
    yi: "yi-large",
    baichuan: "baichuan4",
    doubao: "doubao-1-5-pro-256k-250115",
    minimax: "MiniMax-M2",
    ollama: "llama3.2",
    lmstudio: "local-model",
  };

  return models[provider];
}
