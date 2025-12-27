/**
 * Provider Credential Format Definitions
 *
 * Defines credential format patterns for each supported LLM provider.
 * Used by the validation service for credential format verification.
 *
 * @module credentials/providers/formats
 */

import { z } from "zod";

// =============================================================================
// Provider Format Types
// =============================================================================

/**
 * Supported provider types for credential validation
 */
export type CredentialProvider =
  | "anthropic"
  | "openai"
  | "google"
  | "azure"
  | "vertex"
  | "cohere"
  | "mistral";

/**
 * Schema for credential provider types
 */
export const CredentialProviderSchema = z.enum([
  "anthropic",
  "openai",
  "google",
  "azure",
  "vertex",
  "cohere",
  "mistral",
]);

// =============================================================================
// Format Patterns
// =============================================================================

/**
 * Anthropic API key format
 * Format: sk-ant-api03-*
 */
export const ANTHROPIC_KEY_PATTERN = /^sk-ant-api03-/;

/**
 * OpenAI API key formats
 * Format: sk-* (legacy) or sk-proj-* (project keys)
 */
export const OPENAI_KEY_PATTERN = /^sk-/;
export const OPENAI_PROJECT_KEY_PATTERN = /^sk-proj-/;

/**
 * Google AI API key format
 * Format: AIza*
 */
export const GOOGLE_KEY_PATTERN = /^AIza/;

/**
 * Azure OpenAI API key format
 * Format: 32-character hexadecimal string
 */
export const AZURE_KEY_PATTERN = /^[a-fA-F0-9]{32}$/;

/**
 * Google Vertex AI (uses OAuth tokens)
 * Format: ya29.* (OAuth 2.0 access token) or service account JSON
 */
export const VERTEX_OAUTH_TOKEN_PATTERN = /^ya29\./;

/**
 * Cohere API key format
 * Format: 40-character alphanumeric string
 */
export const COHERE_KEY_PATTERN = /^[a-zA-Z0-9]{40}$/;

/**
 * Mistral AI API key format
 * Format: At least 32 characters
 */
export const MISTRAL_MIN_KEY_LENGTH = 32;

// =============================================================================
// Format Definitions
// =============================================================================

/**
 * Credential format definition for a provider
 */
export interface CredentialFormat {
  /** Provider identifier */
  readonly provider: CredentialProvider;
  /** Human-readable format description */
  readonly description: string;
  /** Expected format pattern(s) */
  readonly patterns: readonly RegExp[];
  /** Minimum key length (if applicable) */
  readonly minLength?: number;
  /** Maximum key length (if applicable) */
  readonly maxLength?: number;
  /** Example format (redacted) */
  readonly example: string;
  /** Additional validation hints */
  readonly hints?: readonly string[];
}

/**
 * Format definitions for all supported providers
 */
export const CREDENTIAL_FORMATS: Record<CredentialProvider, CredentialFormat> = {
  anthropic: {
    provider: "anthropic",
    description: "Anthropic API key",
    patterns: [ANTHROPIC_KEY_PATTERN],
    example: "sk-ant-api03-***",
    hints: ["Keys start with 'sk-ant-api03-'", "Get keys from console.anthropic.com"],
  },

  openai: {
    provider: "openai",
    description: "OpenAI API key",
    patterns: [OPENAI_KEY_PATTERN],
    example: "sk-*** or sk-proj-***",
    hints: [
      "Legacy keys start with 'sk-'",
      "Project keys start with 'sk-proj-'",
      "Get keys from platform.openai.com",
    ],
  },

  google: {
    provider: "google",
    description: "Google AI API key",
    patterns: [GOOGLE_KEY_PATTERN],
    example: "AIza***",
    hints: ["Keys start with 'AIza'", "Get keys from aistudio.google.com"],
  },

  azure: {
    provider: "azure",
    description: "Azure OpenAI API key",
    patterns: [AZURE_KEY_PATTERN],
    minLength: 32,
    maxLength: 32,
    example: "a1b2c3d4e5f6...",
    hints: ["32-character hexadecimal string", "Get keys from Azure Portal"],
  },

  vertex: {
    provider: "vertex",
    description: "Google Vertex AI OAuth token or service account",
    patterns: [VERTEX_OAUTH_TOKEN_PATTERN],
    example: "ya29.*** (OAuth) or JSON service account",
    hints: [
      "OAuth tokens start with 'ya29.'",
      "Service accounts are JSON objects",
      "ADC (Application Default Credentials) can be used",
    ],
  },

  cohere: {
    provider: "cohere",
    description: "Cohere API key",
    patterns: [COHERE_KEY_PATTERN],
    minLength: 40,
    maxLength: 40,
    example: "a1b2c3d4...",
    hints: ["40-character alphanumeric string", "Get keys from dashboard.cohere.ai"],
  },

  mistral: {
    provider: "mistral",
    description: "Mistral AI API key",
    patterns: [],
    minLength: MISTRAL_MIN_KEY_LENGTH,
    example: "***",
    hints: ["At least 32 characters", "Get keys from console.mistral.ai"],
  },
};

/**
 * Get format definition for a provider
 *
 * @param provider - Provider name
 * @returns Format definition or undefined if not found
 */
export function getCredentialFormat(provider: string): CredentialFormat | undefined {
  return CREDENTIAL_FORMATS[provider as CredentialProvider];
}

/**
 * Get all supported provider names
 *
 * @returns Array of supported provider names
 */
export function getSupportedProviders(): CredentialProvider[] {
  return Object.keys(CREDENTIAL_FORMATS) as CredentialProvider[];
}
