// ============================================
// T004: Comprehensive MCP Types
// ============================================

import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

// ============================================
// Legacy Types (Deprecated - Kept for Migration)
// ============================================

/**
 * @deprecated Use McpStdioConfig instead. Will be removed in v2.0.
 */
export interface MCPConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

/**
 * @deprecated Use McpTool instead. Will be removed in v2.0.
 */
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

// ============================================
// Transport Types
// ============================================

/**
 * Supported MCP transport types.
 * - stdio: Local process communication (command line tools)
 * - sse: Server-Sent Events (deprecated, use streamableHttp for new servers)
 * - streamableHttp: HTTP with streaming (preferred for remote servers)
 * - remote: Generic remote transport (auto-detects streamableHttp vs sse)
 */
export type McpTransportType = "stdio" | "sse" | "streamableHttp" | "remote";

// ============================================
// Server Status Types
// ============================================

/**
 * Discriminated union for MCP server connection status.
 * Enables exhaustive switch statements and precise type narrowing.
 */
export type McpServerStatus =
  | { status: "connecting" }
  | { status: "connected" }
  | { status: "disconnected" }
  | { status: "disabled" }
  | { status: "failed"; error: string }
  | { status: "needs_auth" }
  | { status: "needs_client_registration"; error: string };

/**
 * Status constants for convenience.
 */
export const McpServerStatusType = {
  CONNECTING: "connecting",
  CONNECTED: "connected",
  DISCONNECTED: "disconnected",
  DISABLED: "disabled",
  FAILED: "failed",
  NEEDS_AUTH: "needs_auth",
  NEEDS_CLIENT_REGISTRATION: "needs_client_registration",
} as const;

/**
 * OAuth authentication status for remote servers.
 */
export type McpOAuthStatus = "authenticated" | "unauthenticated" | "pending";

// ============================================
// Server & Connection Types
// ============================================

/**
 * Represents an MCP server configuration and its current state.
 */
export interface McpServer {
  /** Display name for the server */
  name: string;
  /** JSON-stringified configuration for change detection */
  config: string;
  /** Current connection status */
  statusInfo: McpServerStatus;
  /** Available tools from this server */
  tools?: McpTool[];
  /** Available resources from this server */
  resources?: McpResource[];
  /** Available resource templates from this server */
  resourceTemplates?: McpResourceTemplate[];
  /** Whether the server is disabled in configuration */
  disabled?: boolean;
  /** Operation timeout in seconds */
  timeout?: number;
  /** Unique identifier for short tool naming (nanoid) */
  uid?: string;
  /** Whether OAuth is required for this server */
  oauthRequired?: boolean;
  /** Current OAuth authentication status */
  oauthAuthStatus?: McpOAuthStatus;
}

/**
 * Represents an active connection to an MCP server.
 */
export interface McpConnection {
  /** Server metadata and status */
  server: McpServer;
  /** MCP SDK client instance */
  client: Client;
  /** Active transport (Stdio, SSE, or StreamableHttp) */
  transport: McpTransport;
  /** OAuth provider for authenticated connections */
  authProvider?: OAuthClientProvider;
}

/**
 * Generic transport interface representing any MCP transport.
 * The actual type comes from @modelcontextprotocol/sdk.
 */
export interface McpTransport {
  /** Start the transport connection */
  start(): Promise<void>;
  /** Close the transport connection */
  close(): Promise<void>;
  /** Error handler */
  onerror?: (error: Error) => void;
  /** Close handler */
  onclose?: () => void;
}

// ============================================
// Tool Types
// ============================================

/**
 * JSON Schema type for tool input schemas.
 */
export interface JsonSchema {
  type?: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  default?: unknown;
  [key: string]: unknown;
}

/**
 * Represents an MCP tool exposed by a server.
 */
export interface McpTool {
  /** Tool name (used for invocation) */
  name: string;
  /** Human-readable description */
  description?: string;
  /** JSON Schema for tool input parameters */
  inputSchema?: {
    type: "object";
    properties?: Record<string, JsonSchema>;
    required?: string[];
  };
  /** Tool names that can be auto-approved without user confirmation */
  autoApprove?: boolean;
}

/**
 * Response from an MCP tool call.
 */
export interface McpToolCallResponse {
  /** Response content items */
  content: McpToolContent[];
  /** Whether the tool call resulted in an error */
  isError?: boolean;
}

/**
 * Content types that can be returned from tool calls.
 */
export type McpToolContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }
  | { type: "resource"; resource: McpResource };

// ============================================
// Resource Types
// ============================================

/**
 * Represents an MCP resource (data that can be read).
 */
export interface McpResource {
  /** Unique URI for the resource */
  uri: string;
  /** Human-readable name */
  name: string;
  /** MIME type of the resource content */
  mimeType?: string;
  /** Human-readable description */
  description?: string;
}

/**
 * Template for dynamic resource URIs.
 */
export interface McpResourceTemplate {
  /** URI template with placeholders (e.g., "file://{path}") */
  uriTemplate: string;
  /** Human-readable name */
  name: string;
  /** Human-readable description */
  description?: string;
  /** MIME type of resources matching this template */
  mimeType?: string;
}

/**
 * Response from reading an MCP resource.
 */
export interface McpResourceResponse {
  /** Resource content items */
  contents: McpResourceContent[];
}

/**
 * Content types that can be returned from resource reads.
 */
export type McpResourceContent =
  | { uri: string; mimeType?: string; text: string }
  | { uri: string; mimeType?: string; blob: string };

// ============================================
// Prompt Types
// ============================================

/**
 * Argument definition for an MCP prompt.
 */
export interface McpPromptArgument {
  /** Argument name */
  name: string;
  /** Human-readable description */
  description?: string;
  /** Whether the argument is required */
  required?: boolean;
}

/**
 * Represents an MCP prompt template.
 */
export interface McpPrompt {
  /** Prompt name (used for invocation) */
  name: string;
  /** Human-readable description */
  description?: string;
  /** Arguments that can be passed to the prompt */
  arguments?: McpPromptArgument[];
}

/**
 * Response from getting an MCP prompt.
 */
export interface McpPromptResponse {
  /** Description of the prompt */
  description?: string;
  /** Generated prompt messages */
  messages: McpPromptMessage[];
}

/**
 * Message in a prompt response.
 */
export interface McpPromptMessage {
  /** Role of the message sender */
  role: "user" | "assistant";
  /** Message content */
  content: McpPromptContent;
}

/**
 * Content types in prompt messages.
 */
export type McpPromptContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }
  | { type: "resource"; resource: McpResource };

// ============================================
// Configuration Types
// ============================================

/**
 * Base configuration shared by all transport types.
 */
export interface McpBaseConfig {
  /** Tool names that can be auto-approved */
  autoApprove?: string[];
  /** Whether the server is disabled */
  disabled?: boolean;
  /** Operation timeout in seconds */
  timeout?: number;
}

/**
 * Configuration for stdio transport (local process).
 */
export interface McpStdioConfig extends McpBaseConfig {
  type?: "stdio";
  /** Command to execute */
  command: string;
  /** Command arguments */
  args?: string[];
  /** Working directory for the command */
  cwd?: string;
  /** Environment variables */
  env?: Record<string, string>;
}

/**
 * Configuration for SSE transport (deprecated).
 */
export interface McpSseConfig extends McpBaseConfig {
  type: "sse";
  /** SSE endpoint URL */
  url: string;
  /** HTTP headers for requests */
  headers?: Record<string, string>;
}

/**
 * Configuration for Streamable HTTP transport (preferred for remote).
 */
export interface McpStreamableHttpConfig extends McpBaseConfig {
  type: "streamableHttp";
  /** HTTP endpoint URL */
  url: string;
  /** HTTP headers for requests */
  headers?: Record<string, string>;
}

/**
 * Configuration for remote transport (auto-detects protocol).
 */
export interface McpRemoteConfig extends McpBaseConfig {
  type: "remote";
  /** Remote endpoint URL */
  url: string;
  /** HTTP headers for requests */
  headers?: Record<string, string>;
}

/**
 * Union of all MCP server configuration types.
 */
export type McpServerConfig =
  | McpStdioConfig
  | McpSseConfig
  | McpStreamableHttpConfig
  | McpRemoteConfig;

/**
 * CLI-specific configuration options.
 */
export interface McpCliConfig {
  /** Port for OAuth callback server */
  oauthCallbackPort?: number;
  /** Timeout for graceful shutdown in milliseconds */
  shutdownTimeoutMs?: number;
  /** Whether running in non-interactive mode */
  nonInteractive?: boolean;
  /** Whether to automatically open browser for OAuth */
  autoOpenBrowser?: boolean;
}

/**
 * Enterprise policy configuration.
 */
export interface McpEnterpriseConfig {
  /** Block personal remote MCP servers */
  blockPersonalRemoteMCPServers?: boolean;
  /** Allowlist of permitted MCP servers */
  allowedMCPServers?: string[];
  /** Whether MCP marketplace is enabled */
  mcpMarketplaceEnabled?: boolean;
}

/**
 * Complete MCP settings file structure (~/.vellum/mcp.json).
 */
export interface McpSettings {
  /** Server configurations keyed by server name */
  mcpServers: Record<string, McpServerConfig>;
  /** CLI-specific options */
  cli?: McpCliConfig;
  /** Enterprise policy options */
  enterprise?: McpEnterpriseConfig;
}

// ============================================
// Event Types
// ============================================

/**
 * Events emitted by McpHub.
 */
export interface McpHubEvents {
  /** Server connection status changed */
  "server:status": { serverName: string; status: McpServerStatus };
  /** Server connected successfully */
  "server:connected": { serverName: string; tools: McpTool[]; resources: McpResource[] };
  /** Server disconnected */
  "server:disconnected": { serverName: string };
  /** Server error occurred */
  "server:error": { serverName: string; error: Error };
  /** Tool called */
  "tool:called": { serverName: string; toolName: string; duration: number };
  /** Configuration reloaded */
  "config:reloaded": { serverCount: number };
}

// ============================================
// Type Guards
// ============================================

/**
 * Type guard for stdio configuration.
 */
export function isStdioConfig(config: McpServerConfig): config is McpStdioConfig {
  return config.type === "stdio" || config.type === undefined;
}

/**
 * Type guard for SSE configuration.
 */
export function isSseConfig(config: McpServerConfig): config is McpSseConfig {
  return config.type === "sse";
}

/**
 * Type guard for Streamable HTTP configuration.
 */
export function isStreamableHttpConfig(config: McpServerConfig): config is McpStreamableHttpConfig {
  return config.type === "streamableHttp";
}

/**
 * Type guard for remote configuration.
 */
export function isRemoteConfig(config: McpServerConfig): config is McpRemoteConfig {
  return config.type === "remote";
}

/**
 * Check if a server status indicates the server is available for operations.
 */
export function isServerAvailable(status: McpServerStatus): boolean {
  return status.status === "connected";
}

/**
 * Check if a server status indicates an error state.
 */
export function isServerError(
  status: McpServerStatus
): status is { status: "failed"; error: string } {
  return status.status === "failed";
}
