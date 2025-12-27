// ============================================
// T027, T043 - Config Module Barrel Export
// ============================================

// T034-T038 - Config loader utilities
// T023-T025 - Credential integration
export {
  type ConfigError,
  type ConfigErrorCode,
  // T023 - Credential wizard types
  type CredentialPromptCallback,
  type CredentialPromptOptions,
  // T024 - Deprecation warnings
  checkDeprecatedApiKeyUsage,
  clearDeprecationWarningsCache,
  deepMerge,
  findProjectConfig,
  // T023 - Credential wizard helpers
  getProviderDisplayName,
  // T025 - Credential resolution
  hasProviderCredentials,
  type LoadConfigOptions,
  // T025 - Extended config loading with credentials
  type LoadConfigWithCredentialsResult,
  loadConfig,
  loadConfigWithCredentials,
  parseEnvConfig,
  promptForCredentials,
  resolveProviderCredential,
  storeCredential,
} from "./loader.js";
// Logging configuration
export {
  createLoggingConfig,
  developmentConfig,
  getLoggingConfig,
  type LoggingConfig,
  productionConfig,
  testConfig,
} from "./logging.config.js";
// T040-T042 - ConfigManager
export {
  ConfigManager,
  type ConfigManagerEmitter,
  type ConfigManagerEvents,
} from "./manager.js";
export {
  // T031 - Agent config schema
  AgentConfigSchema,
  type AgentConfigSettings,
  type ApiKeyCredential,
  // T014 - Credential config schemas
  ApiKeyCredentialSchema,
  type BearerTokenCredential,
  BearerTokenCredentialSchema,
  type CertificateCredential,
  CertificateCredentialSchema,
  type Config,
  type ConfigCredential,
  ConfigCredentialSchema,
  ConfigSchema,
  type CredentialMetadata,
  CredentialMetadataSchema,
  type CredentialSource,
  CredentialSourceSchema,
  type CredentialType,
  CredentialTypeSchema,
  type LLMProvider,
  // T029 - LLM provider schema
  LLMProviderSchema,
  type LogLevel,
  // T032 - Complete config schema
  LogLevelSchema,
  type OAuthTokenCredential,
  OAuthTokenCredentialSchema,
  type PartialConfig,
  type Permission,
  type PermissionMode,
  // T030 - Permission schemas
  PermissionModeSchema,
  PermissionSchema,
  type ProviderName,
  // T028 - Provider name enum
  ProviderNameSchema,
  type ServiceAccountCredential,
  ServiceAccountCredentialSchema,
} from "./schema.js";
