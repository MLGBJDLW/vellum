/**
 * Provider-specific Credential Definitions
 *
 * @module credentials/providers
 */

export {
  // Patterns
  ANTHROPIC_KEY_PATTERN,
  AZURE_KEY_PATTERN,
  COHERE_KEY_PATTERN,
  // Format definitions
  CREDENTIAL_FORMATS,
  type CredentialFormat,
  // Types
  type CredentialProvider,
  // Schemas
  CredentialProviderSchema,
  GOOGLE_KEY_PATTERN,
  // Functions
  getCredentialFormat,
  getSupportedProviders,
  MISTRAL_MIN_KEY_LENGTH,
  OPENAI_KEY_PATTERN,
  OPENAI_PROJECT_KEY_PATTERN,
  VERTEX_OAUTH_TOKEN_PATTERN,
} from "./formats.js";
