// ============================================
// Vellum MCP Integration
// ============================================

// Apply polyfills first (must be before other imports)
import "./polyfills.js";

// ============================================
// MCP Architecture Exports
// ============================================

// Constants
export {
  CONFIG_WATCH_DEBOUNCE_MS,
  DEFAULT_MCP_TIMEOUT_SECONDS,
  DEFAULT_OAUTH_PORT,
  DEFAULT_SHUTDOWN_TIMEOUT_MS,
  MAX_CONNECTION_RETRIES,
  MCP_CLIENT_NAME,
  MIN_MCP_TIMEOUT_SECONDS,
  OAUTH_TIMEOUT_MS,
  RETRY_BASE_DELAY_MS,
} from "./constants.js";
// Environment variable expansion
export {
  expandEnvironmentVariables,
  extractEnvironmentVariables,
  hasEnvironmentVariables,
  validateConfigEnvironmentVariables,
  validateEnvironmentVariables,
} from "./env-expansion.js";
// Error types
export {
  isAuthRequiredError,
  isMcpError,
  McpConfigError,
  McpConnectionError,
  McpError,
  McpErrorCode,
  type McpErrorOptions,
  McpTimeoutError,
  McpToolError,
  McpTransportError,
  NeedsClientRegistrationError,
  OAuthTimeoutError,
} from "./errors.js";
// McpCapabilityDiscovery - Capability Discovery & Operations
export {
  type CapabilityDiscoveryOptions,
  type ConnectionProvider,
  McpCapabilityDiscovery,
} from "./McpCapabilityDiscovery.js";
// McpConfigManager - Config File Management
export {
  type ConfigReadResult,
  type McpConfigChangeHandler,
  McpConfigManager,
  type McpConfigManagerOptions,
} from "./McpConfigManager.js";
// McpHub - Central MCP Server Manager
export {
  McpHub,
  type McpHubOptions,
} from "./McpHub.js";
// McpIncrementalUpdater - Incremental Server Update Logic
export {
  type ConnectionCallbacks,
  type ConnectionProvider as UpdaterConnectionProvider,
  McpIncrementalUpdater,
  type ServerChanges,
  type UpdaterOptions,
} from "./McpIncrementalUpdater.js";
// McpServerLifecycle - Connection Lifecycle Management
export {
  type ConnectionStore,
  type LifecycleOptions,
  McpServerLifecycle,
} from "./McpServerLifecycle.js";
// McpServerRegistry - Server UID Management
export { McpServerRegistry } from "./McpServerRegistry.js";
// Schemas
export {
  // Individual schemas
  AutoApproveSchema,
  BaseConfigSchema,
  type CliConfig,
  CliConfigSchema,
  type EnterpriseConfig,
  EnterpriseConfigSchema,
  EnvRecordSchema,
  HeadersRecordSchema,
  isRemoteConfigSchema,
  isSSEConfigSchema,
  isStdioConfigSchema,
  isStreamableHttpConfigSchema,
  isWebSocketConfigSchema,
  type McpSettingsConfig,
  McpSettingsSchema,
  // Validation helpers
  type McpSettingsValidationResult,
  // Trust level schema
  type McpTrustLevel,
  McpTrustLevelSchema,
  type RemoteConfig,
  RemoteConfigSchema,
  requiresUrl,
  type ServerConfig,
  ServerConfigSchema,
  type SSEConfig,
  SSEConfigSchema,
  // Inferred types
  type StdioConfig,
  StdioConfigSchema,
  type StreamableHttpConfig,
  StreamableHttpConfigSchema,
  // Tool filter schema
  type ToolFilter,
  ToolFilterSchema,
  validateMcpSettings,
  validateServerConfig,
  type WebSocketConfig,
  WebSocketConfigSchema,
} from "./schemas.js";
// Transport Adapters
export {
  // Remote transport with fallback
  createRemoteTransport,
  // SSE transport (deprecated)
  createSSETransport,
  // Stdio transport (local process)
  createStdioTransport,
  // Streamable HTTP transport (preferred for remote)
  createStreamableHttpTransport,
  // WebSocket transport
  createWebSocketTransport,
  type RemoteTransportOptions,
  type RemoteTransportResult,
  type SSETransportOptions,
  type SSETransportResult,
  type StdioTransportOptions,
  type StdioTransportResult,
  type StreamableHttpTransportOptions,
  type StreamableHttpTransportResult,
  validateRemoteConfig,
  validateSseConfig,
  validateStdioConfig,
  validateStreamableHttpConfig,
  validateWebSocketConfig,
  type WebSocketTransportOptions,
  type WebSocketTransportResult,
} from "./transports/index.js";
// Types
export {
  isRemoteConfig,
  isServerAvailable,
  isServerError,
  isSseConfig,
  // Type guards
  isStdioConfig,
  isStreamableHttpConfig,
  isWebSocketConfig,
  // Tool types
  type JsonSchema,
  // Configuration types
  type McpBaseConfig,
  type McpCliConfig,
  type McpConnection,
  type McpEnterpriseConfig,
  // Event types
  type McpHubEvents,
  type McpOAuthStatus,
  type McpPrompt,
  // Prompt types
  type McpPromptArgument,
  type McpPromptContent,
  type McpPromptMessage,
  type McpPromptResponse,
  type McpRemoteConfig,
  // Resource types
  type McpResource,
  type McpResourceContent,
  type McpResourceResponse,
  type McpResourceTemplate,
  // Server & Connection types
  type McpServer,
  type McpServerConfig,
  // Status types
  type McpServerStatus,
  McpServerStatusType,
  type McpSettings,
  type McpSseConfig,
  type McpStdioConfig,
  type McpStreamableHttpConfig,
  type McpTool,
  type McpToolCallResponse,
  type McpToolContent,
  type McpTransport,
  // Transport types
  type McpTransportType,
  type McpWebSocketConfig,
  // Tool filter type from types.ts (interface version)
  type ToolFilter as McpToolFilter,
} from "./types.js";

// ============================================
// OAuth Integration (Phase 5)
// ============================================

// CLI OAuth utilities
export {
  type CleanupHandler,
  // T034: CLI Host Provider
  CliHostProvider,
  type CliHostProviderConfig,
  createCliHostProvider,
  createProcessManager,
  createUrlElicitationHandler,
  getProcessManager,
  type IHostProvider,
  type OAuthCallbackResult,
  OAuthCallbackServer,
  type OAuthCallbackServerConfig,
  type ProcessEntry,
  // T035: Process Manager
  ProcessManager,
  type ProcessManagerConfig,
  type ProcessState,
  type ProgressOptions,
  type ProgressSpinner,
  setupUrlElicitationHandler,
  type UrlElicitationCallbacks,
  type UrlElicitationConfig,
  UrlElicitationHandler,
  type UrlElicitationRequest,
  type UrlElicitationResult,
  type WaitForCallbackOptions,
} from "./cli/index.js";
// Credential Adapter (for bridging @vellum/core CredentialManager)
export {
  type CoreCredential,
  type CoreCredentialInput,
  type CoreCredentialManager,
  createOAuthCredentialAdapter,
  isCoreCredentialManager,
} from "./credential-adapter.js";
// OAuth Manager
export {
  McpOAuthManager,
  type McpOAuthManagerConfig,
  type OAuthCredentialInput,
  type OAuthCredentialManager,
  type OAuthRefreshTimer,
  type OAuthResult,
  type OAuthStoredCredential,
  VellumOAuthClientProvider,
} from "./McpOAuthManager.js";

// Dynamic Client Registration (RFC 7591)
export {
  type AuthorizationServerMetadata,
  type CachedClientInfo,
  type ClientRegistrationRequest,
  type ClientRegistrationResponse,
  createDynamicClientRegistration,
  DynamicClientRegistration,
  type DynamicClientRegistrationConfig,
} from "./oauth/index.js";

// ============================================
// Telemetry (Phase 6)
// ============================================

// T038: MCP Telemetry (opt-in)
export {
  type AggregatedMetrics,
  createMcpTelemetry,
  getMcpTelemetry,
  McpTelemetry,
  type McpTelemetryConfig,
  type McpTelemetryEvents,
  type RecordToolCallOptions,
  type TelemetrySummary,
  type ToolCallMetric,
  type ToolCallStatus,
} from "./telemetry.js";

// ============================================
// MCP Command Loader (Step 13)
// ============================================

// T013: MCP Prompts to Slash Commands
export {
  type ArgType,
  type CommandCategory,
  type CommandKind,
  type CommandLoader,
  createMcpCommandLoader,
  type McpCommandChangeHandler,
  type McpCommandContext,
  McpCommandLoader,
  type McpCommandLoaderOptions,
  type McpCommandResult,
  type McpSlashCommand,
  type PositionalArg,
} from "./McpCommandLoader.js";

// ============================================
// Enterprise Features (Phase 7)
// ============================================

// T039-T042: Enterprise Configuration, Validation, and Audit
export {
  type AuditDestination,
  AuditDestinationSchema,
  type AuditEvent,
  type AuditEventType,
  // Audit Logging
  AuditLogger,
  clearFullEnterpriseConfigCache,
  DEFAULT_FULL_ENTERPRISE_CONFIG,
  type FullEnterpriseConfig,
  // Configuration
  FullEnterpriseConfigSchema,
  filterAllowedServers,
  filterAllowedTools,
  getAuditLogger,
  getEnterpriseConfigPath,
  getFullEnterpriseConfig,
  initializeAuditLogger,
  isEnterpriseMode,
  loadFullEnterpriseConfig,
  ServerIdentifierSchema,
  type ServerInfo,
  type ServerValidationResult,
  shutdownAuditLogger,
  type ToolCallInfo,
  ToolPatternSchema,
  type ToolValidationResult,
  // Server Validation
  validateServer,
  validateToolCall,
} from "./enterprise/index.js";
