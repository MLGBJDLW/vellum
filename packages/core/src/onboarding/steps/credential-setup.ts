/**
 * Credential Setup Step (Phase 38)
 *
 * Guides user through API key entry and secure credential storage.
 * Integrates with the existing credential management system.
 *
 * @module onboarding/steps/credential-setup
 */

import type { CredentialInput, CredentialSource } from "../../credentials/types.js";
import {
  type OnboardingProvider,
  type OnboardingState,
  PROVIDER_INFO,
  type StepResult,
} from "../types.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Credential setup result data
 */
export interface CredentialSetupData {
  /** Provider for credential */
  provider: OnboardingProvider;
  /** Whether credential was saved */
  saved: boolean;
  /** Storage location used */
  source: CredentialSource;
}

/**
 * Credential setup step handler interface
 */
export interface CredentialSetupStepHandler {
  /** Check if provider needs credentials */
  needsCredentials(provider: OnboardingProvider): boolean;
  /** Get environment variable name for provider */
  getEnvVar(provider: OnboardingProvider): string;
  /** Check if credential already exists */
  checkExisting(provider: OnboardingProvider): Promise<boolean>;
  /** Validate API key format */
  validateApiKey(provider: OnboardingProvider, apiKey: string): ValidationResult;
  /** Create credential input for storage */
  createCredentialInput(
    provider: OnboardingProvider,
    apiKey: string,
    source: CredentialSource
  ): CredentialInput;
  /** Execute credential setup step */
  execute(
    state: OnboardingState,
    provider: OnboardingProvider,
    apiKey: string,
    source: CredentialSource
  ): Promise<StepResult>;
}

/**
 * API key validation result
 */
export interface ValidationResult {
  /** Whether key is valid */
  valid: boolean;
  /** Validation error message */
  error?: string;
  /** Warnings (non-blocking) */
  warnings?: string[];
}

// =============================================================================
// API Key Validation Patterns
// =============================================================================

/**
 * API key validation patterns by provider
 */
const API_KEY_PATTERNS: Record<OnboardingProvider, RegExp | null> = {
  anthropic: /^sk-ant-[a-zA-Z0-9-_]{90,}$/,
  openai: /^sk-[a-zA-Z0-9-_]{40,}$/,
  google: /^[a-zA-Z0-9-_]{39}$/,
  mistral: /^[a-zA-Z0-9]{32}$/,
  groq: /^gsk_[a-zA-Z0-9]{50,}$/,
  openrouter: /^sk-or-[a-zA-Z0-9-_]{40,}$/,
  xai: /^xai-[a-zA-Z0-9-_]{40,}$/,
  deepseek: /^sk-[a-zA-Z0-9]{32,}$/,
  qwen: /^sk-[a-zA-Z0-9]{32,}$/,
  moonshot: /^sk-[a-zA-Z0-9]{32,}$/,
  zhipu: /^[a-zA-Z0-9]{32,}$/,
  yi: /^[a-zA-Z0-9]{32,}$/,
  baichuan: /^[a-zA-Z0-9]{32,}$/,
  doubao: /^[a-zA-Z0-9]{32,}$/,
  minimax: /^[a-zA-Z0-9]{32,}$/,
  ollama: null, // No API key required
  lmstudio: null, // No API key required
};

/**
 * Human-readable format descriptions
 */
const API_KEY_FORMAT_HINTS: Record<OnboardingProvider, string> = {
  anthropic: "Should start with 'sk-ant-' followed by ~90+ characters",
  openai: "Should start with 'sk-' followed by ~40+ characters",
  google: "Should be 39 alphanumeric characters",
  mistral: "Should be 32 alphanumeric characters",
  groq: "Should start with 'gsk_' followed by ~50+ characters",
  openrouter: "Should start with 'sk-or-' followed by ~40+ characters",
  xai: "Should start with 'xai-' followed by ~40+ characters",
  deepseek: "Should start with 'sk-' followed by ~32+ characters",
  qwen: "Should start with 'sk-' followed by ~32+ characters",
  moonshot: "Should start with 'sk-' followed by ~32+ characters",
  zhipu: "Should be 32+ alphanumeric characters",
  yi: "Should be 32+ alphanumeric characters",
  baichuan: "Should be 32+ alphanumeric characters",
  doubao: "Should be 32+ alphanumeric characters",
  minimax: "Should be 32+ alphanumeric characters",
  ollama: "No API key required for local Ollama",
  lmstudio: "No API key required for local LM Studio",
};

// =============================================================================
// Implementation
// =============================================================================

/**
 * Create a credential setup step handler
 */
export function createCredentialSetupStep(): CredentialSetupStepHandler {
  return {
    needsCredentials(provider: OnboardingProvider): boolean {
      return PROVIDER_INFO[provider].requiresApiKey;
    },

    getEnvVar(provider: OnboardingProvider): string {
      return PROVIDER_INFO[provider].envVar;
    },

    async checkExisting(provider: OnboardingProvider): Promise<boolean> {
      const envVar = this.getEnvVar(provider);
      // Check environment variable
      if (process.env[envVar]) {
        return true;
      }
      // Could also check keychain/file stores, but that requires CredentialManager
      return false;
    },

    validateApiKey(provider: OnboardingProvider, apiKey: string): ValidationResult {
      // Skip validation for providers that don't need keys
      if (!this.needsCredentials(provider)) {
        return { valid: true };
      }

      // Empty check
      if (!apiKey || apiKey.trim() === "") {
        return {
          valid: false,
          error: "API key cannot be empty",
        };
      }

      const trimmed = apiKey.trim();

      // Length check
      if (trimmed.length < 20) {
        return {
          valid: false,
          error: `API key seems too short. ${API_KEY_FORMAT_HINTS[provider]}`,
        };
      }

      // Pattern check (soft validation - warn but don't block)
      const pattern = API_KEY_PATTERNS[provider];
      if (pattern && !pattern.test(trimmed)) {
        return {
          valid: true, // Allow through but warn
          warnings: [
            `Key format doesn't match expected pattern for ${PROVIDER_INFO[provider].name}.`,
            API_KEY_FORMAT_HINTS[provider],
            "Proceeding anyway - the key may still work.",
          ],
        };
      }

      return { valid: true };
    },

    createCredentialInput(
      provider: OnboardingProvider,
      apiKey: string,
      source: CredentialSource
    ): CredentialInput {
      return {
        provider,
        type: "api_key",
        value: apiKey.trim(),
        source,
        metadata: {
          label: `${PROVIDER_INFO[provider].name} API Key`,
          environment: "production",
        },
      };
    },

    async execute(
      _state: OnboardingState,
      provider: OnboardingProvider,
      apiKey: string,
      source: CredentialSource
    ): Promise<StepResult> {
      // Handle back navigation
      if (apiKey === "back") {
        return {
          success: true,
          next: false,
          back: true,
          skip: false,
        };
      }

      // Handle skip
      if (apiKey === "skip") {
        return {
          success: true,
          next: true,
          back: false,
          skip: true,
          data: {
            provider,
            saved: false,
            skipped: true,
          },
        };
      }

      // Skip if provider doesn't need credentials
      if (!this.needsCredentials(provider)) {
        return {
          success: true,
          next: true,
          back: false,
          skip: false,
          data: {
            provider,
            saved: false,
            source: "config",
          } satisfies CredentialSetupData,
        };
      }

      // Validate API key
      const validation = this.validateApiKey(provider, apiKey);
      if (!validation.valid) {
        return {
          success: false,
          next: false,
          back: false,
          skip: false,
          error: validation.error,
        };
      }

      // Create credential input (actual storage handled by wizard)
      const credentialInput = this.createCredentialInput(provider, apiKey, source);

      return {
        success: true,
        next: true,
        back: false,
        skip: false,
        data: {
          provider,
          saved: true,
          source,
          credentialInput,
          warnings: validation.warnings,
        },
      };
    },
  };
}

/**
 * Format credential setup prompt
 */
export function formatCredentialPrompt(provider: OnboardingProvider): string {
  const info = PROVIDER_INFO[provider];

  if (!info.requiresApiKey) {
    return `
🏠 ${info.name} (Local)

No API key required! Ollama runs locally on your machine.

Make sure Ollama is installed and running:
  - Install: https://ollama.ai
  - Start: ollama serve

Press Enter to continue...
`;
  }

  return `
🔐 Configure ${info.name} API Key

Get your API key from the provider's dashboard:
  ${getApiKeyUrl(provider)}

Your key will be stored securely (encrypted or in system keychain).

Enter your API key (or 'skip' to configure later):
`;
}

/**
 * Get API key dashboard URL for provider
 */
export function getApiKeyUrl(provider: OnboardingProvider): string {
  const urls: Record<OnboardingProvider, string> = {
    anthropic: "https://console.anthropic.com/settings/keys",
    openai: "https://platform.openai.com/api-keys",
    google: "https://makersuite.google.com/app/apikey",
    mistral: "https://console.mistral.ai/api-keys/",
    groq: "https://console.groq.com/keys",
    openrouter: "https://openrouter.ai/keys",
    xai: "https://console.x.ai/",
    deepseek: "https://platform.deepseek.com/api_keys",
    qwen: "https://dashscope.console.aliyun.com/apiKey",
    moonshot: "https://platform.moonshot.cn/console/api-keys",
    zhipu: "https://open.bigmodel.cn/",
    yi: "https://platform.lingyiwanwu.com/",
    baichuan: "https://platform.baichuan-ai.com/",
    doubao: "https://www.volcengine.com/",
    minimax: "https://api.minimax.chat/",
    ollama: "https://ollama.ai (no key needed)",
    lmstudio: "https://lmstudio.ai (no key needed)",
  };

  return urls[provider];
}

/**
 * Get recommended storage source
 */
export function getRecommendedSource(): CredentialSource {
  // Prefer keychain on macOS/Windows, encrypted file elsewhere
  const platform = process.platform;
  if (platform === "darwin" || platform === "win32") {
    return "keychain";
  }
  return "file";
}
