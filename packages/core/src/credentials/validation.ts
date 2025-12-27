/**
 * Credential Validation Service
 *
 * Central validation service for credential format verification.
 * Supports provider-specific regex patterns and custom validators.
 *
 * @module credentials/validation
 */

import type { Result } from "../types/result.js";
import { Err, Ok } from "../types/result.js";
import {
  type CredentialFormat,
  type CredentialProvider,
  getCredentialFormat,
  getSupportedProviders,
} from "./providers/formats.js";

// =============================================================================
// Validation Result Types
// =============================================================================

/**
 * Result of format validation
 */
export interface FormatValidationResult {
  /** Whether the credential format is valid */
  readonly valid: boolean;
  /** Error message if validation failed */
  readonly error?: string;
  /** Provider that was validated */
  readonly provider: string;
  /** Warning messages for non-critical issues */
  readonly warnings?: readonly string[];
  /** Format hints if validation failed */
  readonly hints?: readonly string[];
}

/**
 * Custom validator function type
 *
 * @param provider - Provider name
 * @param value - Credential value to validate
 * @returns Validation result or null to use default validation
 */
export type CustomValidator = (provider: string, value: string) => FormatValidationResult | null;

// =============================================================================
// Validation Service Options
// =============================================================================

/**
 * Options for the CredentialValidationService
 */
export interface ValidationServiceOptions {
  /** Custom validators to use before default validation */
  readonly customValidators?: readonly CustomValidator[];
  /** Whether to include format hints in error responses */
  readonly includeHints?: boolean;
  /** Strict mode: fail on unknown providers (default: false) */
  readonly strictMode?: boolean;
}

// =============================================================================
// Validation Service Implementation
// =============================================================================

/**
 * Credential Validation Service
 *
 * Provides format validation for LLM provider credentials.
 * Supports built-in patterns for major providers and custom validators.
 *
 * @example
 * ```typescript
 * const validator = new CredentialValidationService();
 *
 * // Validate a credential
 * const result = validator.validateFormat('anthropic', 'sk-ant-api03-xxx');
 * if (!result.valid) {
 *   console.error(result.error);
 *   console.log('Hints:', result.hints);
 * }
 *
 * // With custom validator
 * const customValidator = new CredentialValidationService({
 *   customValidators: [
 *     (provider, value) => {
 *       if (provider === 'custom-provider') {
 *         return { valid: value.startsWith('cp-'), provider };
 *       }
 *       return null; // Use default validation
 *     }
 *   ]
 * });
 * ```
 */
export class CredentialValidationService {
  private readonly customValidators: readonly CustomValidator[];
  private readonly includeHints: boolean;
  private readonly strictMode: boolean;

  constructor(options: ValidationServiceOptions = {}) {
    this.customValidators = options.customValidators ?? [];
    this.includeHints = options.includeHints ?? true;
    this.strictMode = options.strictMode ?? false;
  }

  /**
   * Validate credential format for a specific provider
   *
   * @param provider - Provider name (e.g., 'anthropic', 'openai')
   * @param value - Credential value to validate
   * @returns Validation result with success/failure and details
   */
  validateFormat(provider: string, value: string): FormatValidationResult {
    // Check custom validators first
    for (const validator of this.customValidators) {
      const result = validator(provider, value);
      if (result !== null) {
        return result;
      }
    }

    // Get format definition for provider
    const format = getCredentialFormat(provider);
    if (!format) {
      if (this.strictMode) {
        return {
          valid: false,
          provider,
          error: `Unknown provider: ${provider}`,
          hints: [`Supported providers: ${getSupportedProviders().join(", ")}`],
        };
      }
      // Non-strict mode: accept unknown providers with basic validation
      return this.validateUnknownProvider(provider, value);
    }

    // Run format validation
    return this.validateWithFormat(format, value);
  }

  /**
   * Validate a credential value against a format definition
   */
  private validateWithFormat(format: CredentialFormat, value: string): FormatValidationResult {
    const warnings: string[] = [];

    // Check minimum length
    if (format.minLength !== undefined && value.length < format.minLength) {
      return this.createErrorResult(
        format.provider,
        `${format.description} must be at least ${format.minLength} characters`,
        format.hints
      );
    }

    // Check maximum length
    if (format.maxLength !== undefined && value.length > format.maxLength) {
      return this.createErrorResult(
        format.provider,
        `${format.description} must be at most ${format.maxLength} characters`,
        format.hints
      );
    }

    // Check patterns (if any patterns exist, at least one must match)
    if (format.patterns.length > 0) {
      const patternMatches = format.patterns.some((pattern) => pattern.test(value));
      if (!patternMatches) {
        return this.createErrorResult(
          format.provider,
          `Invalid ${format.description} format. Expected: ${format.example}`,
          format.hints
        );
      }
    }

    // Valid
    return {
      valid: true,
      provider: format.provider,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Basic validation for unknown providers
   */
  private validateUnknownProvider(provider: string, value: string): FormatValidationResult {
    // Basic validation: must have some length
    if (!value || value.trim().length === 0) {
      return {
        valid: false,
        provider,
        error: "Credential value cannot be empty",
      };
    }

    // Minimum reasonable length for any API key
    if (value.length < 8) {
      return {
        valid: false,
        provider,
        error: "Credential value is too short (minimum 8 characters)",
        warnings: [`Provider '${provider}' is not in the supported list, using basic validation`],
      };
    }

    return {
      valid: true,
      provider,
      warnings: [`Provider '${provider}' is not in the supported list, format not verified`],
    };
  }

  /**
   * Create an error validation result
   */
  private createErrorResult(
    provider: string,
    error: string,
    hints?: readonly string[]
  ): FormatValidationResult {
    return {
      valid: false,
      provider,
      error,
      hints: this.includeHints ? hints : undefined,
    };
  }

  /**
   * Get format information for a provider
   *
   * @param provider - Provider name
   * @returns Format definition or undefined
   */
  getFormat(provider: string): CredentialFormat | undefined {
    return getCredentialFormat(provider);
  }

  /**
   * Get list of supported providers
   *
   * @returns Array of provider names with format definitions
   */
  getSupportedProviders(): CredentialProvider[] {
    return getSupportedProviders();
  }

  /**
   * Check if a provider is supported
   *
   * @param provider - Provider name to check
   * @returns true if provider has format definition
   */
  isProviderSupported(provider: string): boolean {
    return getCredentialFormat(provider) !== undefined;
  }
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Default validation service instance
 */
let defaultService: CredentialValidationService | null = null;

/**
 * Get the default validation service
 *
 * @returns Shared validation service instance
 */
export function getDefaultValidationService(): CredentialValidationService {
  if (!defaultService) {
    defaultService = new CredentialValidationService();
  }
  return defaultService;
}

/**
 * Validate credential format using the default service
 *
 * @param provider - Provider name
 * @param value - Credential value
 * @returns Validation result
 */
export function validateFormat(provider: string, value: string): FormatValidationResult {
  return getDefaultValidationService().validateFormat(provider, value);
}

/**
 * Create a Result wrapper for format validation
 *
 * @param provider - Provider name
 * @param value - Credential value
 * @returns Result type with validation result
 */
export function validateFormatResult(
  provider: string,
  value: string
): Result<FormatValidationResult, FormatValidationResult> {
  const result = validateFormat(provider, value);
  return result.valid ? Ok(result) : Err(result);
}
