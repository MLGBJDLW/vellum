/**
 * Enterprise Integration
 *
 * Wires MCP enterprise features (audit logging, server validation,
 * tool blocking) to the TUI application when enterprise config is present.
 *
 * @module cli/tui/enterprise-integration
 */

import {
  // Audit logging
  type AuditEvent,
  type AuditEventType,
  AuditLogger,
  // Configuration
  type FullEnterpriseConfig,
  getAuditLogger,
  getEnterpriseConfigPath,
  getFullEnterpriseConfig,
  initializeAuditLogger,
  isEnterpriseMode,
  loadFullEnterpriseConfig,
  type ServerInfo,
  type ServerValidationResult,
  shutdownAuditLogger,
  type ToolCallInfo,
  type ToolValidationResult,
  // Server validation
  validateServer,
  validateToolCall,
} from "@vellum/mcp";

// =============================================================================
// Types
// =============================================================================

export interface EnterpriseIntegrationResult {
  /** Whether enterprise mode is enabled */
  enabled: boolean;
  /** Path to enterprise config file */
  configPath: string;
  /** Loaded enterprise configuration */
  config: FullEnterpriseConfig | null;
  /** Audit logger instance */
  auditLogger: AuditLogger | null;
  /** Error message if initialization failed */
  error?: string;
}

export interface EnterpriseHooks {
  /** Hook called before tool execution for validation */
  onBeforeToolCall: (tool: ToolCallInfo) => Promise<{ allowed: boolean; reason?: string }>;
  /** Hook called after tool execution for audit logging */
  onAfterToolCall: (tool: ToolCallInfo, result: unknown, durationMs: number) => Promise<void>;
  /** Hook called to validate MCP server connection */
  onServerConnect: (server: ServerInfo) => Promise<{ allowed: boolean; reason?: string }>;
  /** Hook called on user authentication (if applicable) */
  onUserAction: (action: string, metadata?: Record<string, unknown>) => Promise<void>;
}

// =============================================================================
// Enterprise Integration
// =============================================================================

let enterpriseConfig: FullEnterpriseConfig | null = null;
let enterpriseInitialized = false;

/**
 * Load and initialize enterprise configuration.
 *
 * @returns Enterprise integration result
 *
 * @example
 * ```typescript
 * const enterprise = await initializeEnterprise();
 * if (enterprise.enabled) {
 *   console.log("Enterprise mode active");
 *   console.log("Audit logging:", enterprise.config?.audit?.enabled);
 * }
 * ```
 */
export async function initializeEnterprise(): Promise<EnterpriseIntegrationResult> {
  const configPath = getEnterpriseConfigPath();

  // Check if enterprise mode is available
  if (!isEnterpriseMode()) {
    return {
      enabled: false,
      configPath,
      config: null,
      auditLogger: null,
    };
  }

  try {
    // Load full enterprise configuration
    const config = await loadFullEnterpriseConfig();
    enterpriseConfig = config;

    // Initialize audit logger if enabled
    let auditLogger: AuditLogger | null = null;
    if (config.audit?.enabled) {
      auditLogger = await initializeAuditLogger({ config });
    }

    enterpriseInitialized = true;

    return {
      enabled: true,
      configPath,
      config,
      auditLogger,
    };
  } catch (error) {
    return {
      enabled: false,
      configPath,
      config: null,
      auditLogger: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Get the current enterprise configuration.
 *
 * @returns Enterprise configuration or null if not in enterprise mode
 */
export function getEnterpriseConfig(): FullEnterpriseConfig | null {
  return enterpriseConfig ?? getFullEnterpriseConfig();
}

/**
 * Check if enterprise mode is currently active.
 *
 * @returns Whether enterprise mode is active
 */
export function isEnterpriseActive(): boolean {
  return enterpriseInitialized && enterpriseConfig !== null;
}

/**
 * Create enterprise hooks for tool and server validation.
 *
 * @returns Enterprise hooks object
 *
 * @example
 * ```typescript
 * const hooks = createEnterpriseHooks();
 *
 * // Before tool execution
 * const validation = await hooks.onBeforeToolCall({
 *   serverName: "my-server",
 *   toolName: "bash",
 *   arguments: { command: "ls -la" },
 * });
 * if (!validation.allowed) {
 *   console.error("Tool blocked:", validation.reason);
 * }
 * ```
 */
export function createEnterpriseHooks(): EnterpriseHooks {
  return {
    async onBeforeToolCall(tool: ToolCallInfo) {
      if (!isEnterpriseActive() || !enterpriseConfig) {
        return { allowed: true };
      }

      const result: ToolValidationResult = validateToolCall(tool, enterpriseConfig);
      if (!result.allowed) {
        // Audit log the blocked tool call
        const logger = getAuditLogger();
        if (logger) {
          await logger.log({
            eventType: "tool_blocked",
            toolName: tool.toolName,
            serverName: tool.serverName,
            metadata: {
              reason: result.reason ?? "Enterprise policy violation",
              arguments: tool.arguments,
            },
          });
        }
      }

      return { allowed: result.allowed, reason: result.reason };
    },

    async onAfterToolCall(tool: ToolCallInfo, result: unknown, durationMs: number) {
      if (!isEnterpriseActive()) {
        return;
      }

      const logger = getAuditLogger();
      if (logger) {
        await logger.log({
          eventType: "tool_call",
          toolName: tool.toolName,
          serverName: tool.serverName,
          metadata: {
            durationMs,
            arguments: tool.arguments,
            resultSummary:
              typeof result === "object" && result !== null
                ? Object.keys(result).join(", ")
                : typeof result,
          },
        });
      }
    },

    async onServerConnect(server: ServerInfo) {
      if (!isEnterpriseActive() || !enterpriseConfig) {
        return { allowed: true };
      }

      const result: ServerValidationResult = validateServer(server, enterpriseConfig);
      if (!result.allowed) {
        // Audit log the blocked server connection
        const logger = getAuditLogger();
        if (logger) {
          await logger.log({
            eventType: "server_blocked",
            serverName: server.name,
            metadata: {
              reason: result.reason ?? "Server not in allowlist",
              url: server.url,
            },
          });
        }
      }

      return { allowed: result.allowed, reason: result.reason };
    },

    async onUserAction(action: string, metadata?: Record<string, unknown>) {
      if (!isEnterpriseActive()) {
        return;
      }

      const logger = getAuditLogger();
      if (logger) {
        await logger.log({
          eventType: "config_change",
          metadata: {
            action,
            ...metadata,
          },
        });
      }
    },
  };
}

/**
 * Shutdown enterprise integration and flush audit logs.
 */
export async function shutdownEnterprise(): Promise<void> {
  if (enterpriseInitialized) {
    await shutdownAuditLogger();
    enterpriseConfig = null;
    enterpriseInitialized = false;
  }
}

// =============================================================================
// Exports
// =============================================================================

export {
  type AuditEvent,
  type AuditEventType,
  AuditLogger,
  type FullEnterpriseConfig,
  type ServerInfo,
  isEnterpriseMode,
};

// Note: ToolCallInfo is intentionally not re-exported here to avoid name collision
// with the ToolCallInfo type from ./context/MessagesContext.js
// Import it directly from @vellum/mcp if needed for enterprise validation.
