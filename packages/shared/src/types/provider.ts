/**
 * @deprecated This file is deprecated. Use @vellum/core for credential types
 * and @vellum/provider for provider interfaces.
 *
 * Migration:
 * - For Credential types: import { Credential, CredentialType } from "@vellum/core"
 * - For ConfigCredential: import { ConfigCredentialSchema } from "@vellum/core"
 * - For Provider interface: import { Provider } from "@vellum/provider"
 *
 * This file will be removed in a future version.
 */

/**
 * @deprecated Use ConfigCredential from @vellum/core instead
 *
 * The apiKey field has been removed. Use the credential field from
 * LLMProviderSchema in @vellum/core for flexible credential management:
 *
 * @example
 * ```typescript
 * import { LLMProviderSchema } from "@vellum/core";
 *
 * const config = {
 *   provider: "anthropic",
 *   model: "claude-3-5-sonnet",
 *   credential: {
 *     type: "api_key",
 *     envVar: "ANTHROPIC_API_KEY"
 *   }
 * };
 * ```
 */
export interface ProviderConfig {
  name: string;
  // NOTE: apiKey field removed in T015B - use credential from @vellum/core
  baseUrl?: string;
  defaultModel: string;
}

/**
 * @deprecated Consider using provider-specific model info from @vellum/provider
 */
export interface ModelInfo {
  id: string;
  name: string;
  contextWindow: number;
  maxOutputTokens: number;
  supportsStreaming: boolean;
  supportsTools: boolean;
}
