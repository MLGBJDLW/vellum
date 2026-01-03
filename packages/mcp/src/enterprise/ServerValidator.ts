// ============================================
// T040: Enterprise Server and Tool Validator
// ============================================

import { type FullEnterpriseConfig, getFullEnterpriseConfig } from "./EnterpriseConfig.js";

// ============================================
// Types
// ============================================

export interface ServerValidationResult {
  allowed: boolean;
  reason?: string;
  policyMessage?: string;
}

export interface ToolValidationResult {
  allowed: boolean;
  reason?: string;
  policyMessage?: string;
  blockedPattern?: string;
}

export interface ServerInfo {
  name: string;
  type: "stdio" | "sse" | "streamableHttp" | "remote";
  url?: string;
}

export interface ToolCallInfo {
  serverName: string;
  toolName: string;
  arguments?: Record<string, unknown>;
}

// ============================================
// Pattern Matching
// ============================================

/**
 * Convert a glob pattern to a RegExp.
 * Supports: * (any chars), ? (single char)
 */
function globToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}

/**
 * Check if a string matches any of the given glob patterns.
 */
function matchesAnyPattern(value: string, patterns: string[]): string | null {
  for (const pattern of patterns) {
    if (globToRegExp(pattern).test(value)) {
      return pattern;
    }
  }
  return null;
}

// ============================================
// Server Validation
// ============================================

/**
 * Validate if a server is allowed by enterprise policy.
 */
export function validateServer(
  server: ServerInfo,
  config?: FullEnterpriseConfig
): ServerValidationResult {
  const enterpriseConfig = config ?? getFullEnterpriseConfig();

  // Stdio servers are always allowed (local processes)
  if (server.type === "stdio") {
    return { allowed: true };
  }

  // If blocking remote servers, check allowlist
  if (enterpriseConfig.blockPersonalRemoteMCPServers) {
    const isAllowed = matchesAnyPattern(server.name, enterpriseConfig.allowedMCPServers);
    const urlAllowed = server.url
      ? matchesAnyPattern(server.url, enterpriseConfig.allowedMCPServers)
      : null;

    if (!isAllowed && !urlAllowed) {
      return {
        allowed: false,
        reason: `Remote server "${server.name}" is not in the allowed list`,
        policyMessage: enterpriseConfig.policyMessage,
      };
    }
  }

  return { allowed: true };
}

/**
 * Validate if a tool call is allowed by enterprise policy.
 */
export function validateToolCall(
  toolCall: ToolCallInfo,
  config?: FullEnterpriseConfig
): ToolValidationResult {
  const enterpriseConfig = config ?? getFullEnterpriseConfig();

  // Check blocked tool patterns
  const blockedPatterns = enterpriseConfig.blockedToolPatterns;
  if (blockedPatterns.length > 0) {
    // Check tool name alone
    const toolBlocked = matchesAnyPattern(toolCall.toolName, blockedPatterns);
    if (toolBlocked) {
      return {
        allowed: false,
        reason: `Tool "${toolCall.toolName}" is blocked by enterprise policy`,
        policyMessage: enterpriseConfig.policyMessage,
        blockedPattern: toolBlocked,
      };
    }

    // Check server:tool format
    const qualifiedName = `${toolCall.serverName}:${toolCall.toolName}`;
    const qualifiedBlocked = matchesAnyPattern(qualifiedName, blockedPatterns);
    if (qualifiedBlocked) {
      return {
        allowed: false,
        reason: `Tool "${qualifiedName}" is blocked by enterprise policy`,
        policyMessage: enterpriseConfig.policyMessage,
        blockedPattern: qualifiedBlocked,
      };
    }
  }

  return { allowed: true };
}

// ============================================
// Batch Validation
// ============================================

/**
 * Filter a list of servers to only those allowed by policy.
 */
export function filterAllowedServers(
  servers: ServerInfo[],
  config?: FullEnterpriseConfig
): { allowed: ServerInfo[]; blocked: Array<{ server: ServerInfo; reason: string }> } {
  const allowed: ServerInfo[] = [];
  const blocked: Array<{ server: ServerInfo; reason: string }> = [];

  for (const server of servers) {
    const result = validateServer(server, config);
    if (result.allowed) {
      allowed.push(server);
    } else {
      blocked.push({ server, reason: result.reason ?? "Blocked by policy" });
    }
  }

  return { allowed, blocked };
}

/**
 * Filter a list of tools to only those allowed by policy.
 */
export function filterAllowedTools(
  tools: Array<{ serverName: string; toolName: string }>,
  config?: FullEnterpriseConfig
): { allowed: string[]; blocked: Array<{ tool: string; reason: string }> } {
  const allowed: string[] = [];
  const blocked: Array<{ tool: string; reason: string }> = [];

  for (const tool of tools) {
    const result = validateToolCall(tool, config);
    const qualifiedName = `${tool.serverName}:${tool.toolName}`;
    if (result.allowed) {
      allowed.push(qualifiedName);
    } else {
      blocked.push({ tool: qualifiedName, reason: result.reason ?? "Blocked by policy" });
    }
  }

  return { allowed, blocked };
}
