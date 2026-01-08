/**
 * Onboarding Type Definitions (Phase 38)
 *
 * Types for the onboarding wizard flow that guides new users through
 * initial setup: provider selection, credential configuration, and mode selection.
 *
 * @module onboarding/types
 */

import { z } from "zod";

import type { CodingMode } from "../agent/coding-modes.js";
import type { ProviderName } from "../config/schema.js";

// =============================================================================
// Step Types
// =============================================================================

/**
 * Onboarding step identifiers
 */
export const OnboardingStepSchema = z.enum([
  "welcome",
  "provider-select",
  "credential-setup",
  "mode-select",
  "complete",
]);

export type OnboardingStep = z.infer<typeof OnboardingStepSchema>;

/**
 * All onboarding steps in order
 */
export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  "welcome",
  "provider-select",
  "credential-setup",
  "mode-select",
  "complete",
] as const;

/**
 * Step metadata for display
 */
export interface OnboardingStepConfig {
  /** Step identifier */
  readonly id: OnboardingStep;
  /** Human-readable title */
  readonly title: string;
  /** Brief description */
  readonly description: string;
  /** Icon for visual identification */
  readonly icon: string;
  /** Whether step can be skipped */
  readonly skippable: boolean;
}

/**
 * Configuration for each onboarding step
 */
export const ONBOARDING_STEP_CONFIG: Record<OnboardingStep, OnboardingStepConfig> = {
  welcome: {
    id: "welcome",
    title: "Welcome to Vellum",
    description: "Introduction to Vellum AI coding assistant",
    icon: "👋",
    skippable: false,
  },
  "provider-select": {
    id: "provider-select",
    title: "Select Provider",
    description: "Choose your default AI provider",
    icon: "🤖",
    skippable: false,
  },
  "credential-setup": {
    id: "credential-setup",
    title: "Configure Credentials",
    description: "Enter your API key",
    icon: "🔐",
    skippable: false,
  },
  "mode-select": {
    id: "mode-select",
    title: "Choose Mode",
    description: "Select your preferred coding mode",
    icon: "⚡",
    skippable: true,
  },
  complete: {
    id: "complete",
    title: "Setup Complete",
    description: "You're ready to start coding!",
    icon: "🎉",
    skippable: false,
  },
};

// =============================================================================
// State Types
// =============================================================================

/**
 * Onboarding state schema
 */
export const OnboardingStateSchema = z.object({
  /** Current step in the wizard */
  currentStep: OnboardingStepSchema,
  /** Whether wizard has been completed */
  completed: z.boolean(),
  /** Timestamp when onboarding started */
  startedAt: z.string().datetime().optional(),
  /** Timestamp when onboarding completed */
  completedAt: z.string().datetime().optional(),
  /** Selected provider during onboarding */
  selectedProvider: z.string().optional(),
  /** Selected mode during onboarding */
  selectedMode: z.string().optional(),
  /** Whether credential was successfully configured */
  credentialConfigured: z.boolean().optional(),
  /** Error message if onboarding failed */
  error: z.string().optional(),
});

export type OnboardingState = z.infer<typeof OnboardingStateSchema>;

/**
 * Initial onboarding state
 */
export const INITIAL_ONBOARDING_STATE: OnboardingState = {
  currentStep: "welcome",
  completed: false,
  startedAt: undefined,
  completedAt: undefined,
  selectedProvider: undefined,
  selectedMode: undefined,
  credentialConfigured: undefined,
  error: undefined,
};

// =============================================================================
// Result Types
// =============================================================================

/**
 * Result of a single step
 */
export interface StepResult {
  /** Whether step completed successfully */
  success: boolean;
  /** Move to next step */
  next: boolean;
  /** Move to previous step */
  back: boolean;
  /** Skip remaining steps */
  skip: boolean;
  /** Error message if failed */
  error?: string;
  /** Data collected from step */
  data?: Record<string, unknown>;
}

/**
 * Result of the complete onboarding flow
 */
export interface OnboardingResult {
  /** Whether onboarding completed successfully */
  success: boolean;
  /** Whether user skipped onboarding */
  skipped: boolean;
  /** Selected provider */
  provider?: ProviderName;
  /** Selected coding mode */
  mode?: CodingMode;
  /** Whether credentials were configured */
  credentialsConfigured: boolean;
  /** Error message if failed */
  error?: string;
}

// =============================================================================
// Provider Configuration
// =============================================================================

/**
 * Supported providers for onboarding
 */
export const ONBOARDING_PROVIDERS = [
  "anthropic",
  "openai",
  "google",
  "gemini",
  "mistral",
  "groq",
  "openrouter",
  "ollama",
] as const;

export type OnboardingProvider = (typeof ONBOARDING_PROVIDERS)[number];

/**
 * Provider display information
 */
export interface ProviderInfo {
  /** Provider identifier */
  readonly id: OnboardingProvider;
  /** Display name */
  readonly name: string;
  /** Brief description */
  readonly description: string;
  /** Environment variable for API key */
  readonly envVar: string;
  /** Whether provider requires API key */
  readonly requiresApiKey: boolean;
  /** Icon for visual identification */
  readonly icon: string;
}

/**
 * Provider information for onboarding UI
 */
export const PROVIDER_INFO: Record<OnboardingProvider, ProviderInfo> = {
  anthropic: {
    id: "anthropic",
    name: "Anthropic Claude",
    description: "Claude 3.5 Sonnet - Best for coding tasks",
    envVar: "ANTHROPIC_API_KEY",
    requiresApiKey: true,
    icon: "🟣",
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    description: "GPT-4o - Versatile and powerful",
    envVar: "OPENAI_API_KEY",
    requiresApiKey: true,
    icon: "🟢",
  },
  google: {
    id: "google",
    name: "Google AI",
    description: "Gemini Pro - Fast and capable",
    envVar: "GOOGLE_API_KEY",
    requiresApiKey: true,
    icon: "🔵",
  },
  gemini: {
    id: "gemini",
    name: "Google Gemini",
    description: "Gemini 2.0 Flash - Latest Google model",
    envVar: "GEMINI_API_KEY",
    requiresApiKey: true,
    icon: "💎",
  },
  mistral: {
    id: "mistral",
    name: "Mistral AI",
    description: "Mistral Large - European alternative",
    envVar: "MISTRAL_API_KEY",
    requiresApiKey: true,
    icon: "🌊",
  },
  groq: {
    id: "groq",
    name: "Groq",
    description: "Ultra-fast inference",
    envVar: "GROQ_API_KEY",
    requiresApiKey: true,
    icon: "⚡",
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    description: "Access multiple models with one API key",
    envVar: "OPENROUTER_API_KEY",
    requiresApiKey: true,
    icon: "🔀",
  },
  ollama: {
    id: "ollama",
    name: "Ollama (Local)",
    description: "Run models locally - No API key needed",
    envVar: "OLLAMA_HOST",
    requiresApiKey: false,
    icon: "🏠",
  },
};

// =============================================================================
// Mode Configuration
// =============================================================================

/**
 * Mode display information for onboarding
 */
export interface ModeInfo {
  /** Mode identifier */
  readonly id: CodingMode;
  /** Display name */
  readonly name: string;
  /** Brief description */
  readonly description: string;
  /** When to use this mode */
  readonly useCase: string;
  /** Icon for visual identification */
  readonly icon: string;
}

/**
 * Mode information for onboarding UI
 */
export const MODE_INFO: Record<string, ModeInfo> = {
  vibe: {
    id: "vibe" as CodingMode,
    name: "Vibe Mode",
    description: "Fast, autonomous coding with minimal interruption",
    useCase: "Quick fixes, simple tasks, exploration",
    icon: "⚡",
  },
  plan: {
    id: "plan" as CodingMode,
    name: "Plan Mode",
    description: "Structured approach with planning phase",
    useCase: "Medium complexity, new features",
    icon: "📋",
  },
  spec: {
    id: "spec" as CodingMode,
    name: "Spec Mode",
    description: "Full specification-driven development",
    useCase: "Complex features, architecture changes",
    icon: "🔧",
  },
};

// =============================================================================
// Wizard Options
// =============================================================================

/**
 * Options for running the onboarding wizard
 */
export interface OnboardingOptions {
  /** Skip welcome step */
  skipWelcome?: boolean;
  /** Force re-run even if already completed */
  force?: boolean;
  /** Non-interactive mode (use defaults) */
  nonInteractive?: boolean;
  /** Pre-selected provider */
  provider?: OnboardingProvider;
  /** Pre-selected mode */
  mode?: CodingMode;
  /** Working directory */
  cwd?: string;
}
