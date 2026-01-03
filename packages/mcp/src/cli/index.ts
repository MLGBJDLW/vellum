// ============================================
// CLI Module Barrel Export
// ============================================

/**
 * CLI-specific MCP utilities and handlers.
 *
 * This module provides CLI-specific implementations for:
 * - OAuth callback handling (T028)
 * - URL elicitation for OAuth flows (T032)
 * - CLI host provider for colored output (T034)
 * - Process manager for signal handling (T035)
 *
 * @module mcp/cli
 */

// T034: CLI Host Provider
export {
  CliHostProvider,
  type CliHostProviderConfig,
  createCliHostProvider,
  type IHostProvider,
  type ProgressOptions,
  type ProgressSpinner,
} from "./CliHostProvider.js";
// T028: OAuth Callback Server
export {
  type OAuthCallbackResult,
  OAuthCallbackServer,
  type OAuthCallbackServerConfig,
  OAuthTimeoutError,
  type WaitForCallbackOptions,
} from "./OAuthCallbackServer.js";
// T035: Process Manager
export {
  type CleanupHandler,
  createProcessManager,
  getProcessManager,
  type ProcessEntry,
  ProcessManager,
  type ProcessManagerConfig,
  type ProcessState,
} from "./ProcessManager.js";
// T032: URL Elicitation Handler
export {
  createUrlElicitationHandler,
  setupUrlElicitationHandler,
  type UrlElicitationCallbacks,
  type UrlElicitationConfig,
  UrlElicitationHandler,
  type UrlElicitationRequest,
  type UrlElicitationResult,
} from "./UrlElicitationHandler.js";
