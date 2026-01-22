/**
 * MCP Permission Bridge
 * Bridges MCP trust levels with the permission system
 *
 * @module permission/mcp-permission-bridge
 */

// ============================================
// Types (duplicated from @vellum/mcp to avoid circular dependency)
// ============================================

/**
 * Trust levels for MCP servers.
 * - false: Always confirm tool calls (default, most secure)
 * - "readonly": Auto-approve read operations, confirm writes
 * - true: Auto-approve all tool calls (use with caution)
 *
 * Note: This type is duplicated from @vellum/mcp to avoid circular dependency.
 * The canonical definition lives in packages/mcp/src/types.ts
 */
export type McpTrustLevel = false | "readonly" | true;

// ============================================
// Constants
// ============================================

/** Operations that are considered read-only (safe for readonly trust level) */
const READ_ONLY_OPERATIONS = new Set([
  "check",
  "describe",
  "fetch",
  "get",
  "info",
  "list",
  "query",
  "read",
  "search",
  "show",
  "status",
  "view",
]);

/** Write operation indicators (explicit destructive actions) */
const WRITE_INDICATORS = [
  "commit",
  "create",
  "delete",
  "execute",
  "modify",
  "push",
  "remove",
  "run",
  "update",
  "write",
];

// ============================================
// Core Functions
// ============================================

/**
 * Infer if a tool operation is read-only based on its name.
 * Uses conservative heuristics - if unsure, assumes NOT read-only.
 *
 * @param toolName - The MCP tool name (e.g., "read_file", "git_commit")
 * @returns true if the tool appears to be a read-only operation
 *
 * @example
 * ```ts
 * inferReadOperation("read_file")     // true
 * inferReadOperation("list_users")    // true
 * inferReadOperation("git_commit")    // false
 * inferReadOperation("write_file")    // false
 * inferReadOperation("execute_query") // false (execute = write indicator)
 * ```
 */
export function inferReadOperation(toolName: string): boolean {
  const lowerName = toolName.toLowerCase();

  // First check for explicit write indicators - these always mean NOT read-only
  if (WRITE_INDICATORS.some((w) => lowerName.includes(w))) {
    return false;
  }

  // Check for read-only operation patterns
  for (const op of READ_ONLY_OPERATIONS) {
    // Matches: "read_file", "file_read", "readFile", "get", "get_user"
    if (
      lowerName.startsWith(op) ||
      lowerName.startsWith(`${op}_`) ||
      lowerName.includes(`_${op}`) ||
      lowerName.includes(`_${op}_`)
    ) {
      return true;
    }
  }

  // Default to NOT read-only (conservative)
  return false;
}

/**
 * Determine if permission check should be bypassed for an MCP tool.
 *
 * @param trustLevel - Server's trust level from configuration
 * @param toolName - Name of the tool being invoked
 * @returns true if permission check should be skipped
 *
 * @example
 * ```ts
 * // Full trust - always bypass
 * shouldBypassPermission(true, "any_tool")        // true
 *
 * // No trust - never bypass
 * shouldBypassPermission(false, "read_file")      // false
 * shouldBypassPermission(undefined, "read_file")  // false
 *
 * // Readonly trust - bypass only for read operations
 * shouldBypassPermission("readonly", "read_file") // true
 * shouldBypassPermission("readonly", "write_file") // false
 * ```
 */
export function shouldBypassPermission(
  trustLevel: McpTrustLevel | undefined,
  toolName: string
): boolean {
  // No trust level or explicit false = always ask
  if (trustLevel === undefined || trustLevel === false) {
    return false;
  }

  // Full trust = never ask
  if (trustLevel === true) {
    return true;
  }

  // Readonly trust = skip for read operations only
  if (trustLevel === "readonly") {
    return inferReadOperation(toolName);
  }

  // Unknown trust level = be safe, don't bypass
  return false;
}

/**
 * Get human-readable description of a trust level for logging/UI.
 *
 * @param trustLevel - The trust level to describe
 * @returns Human-readable description
 *
 * @example
 * ```ts
 * getTrustLevelDescription(true)       // "fully trusted (auto-approve)"
 * getTrustLevelDescription(false)      // "untrusted (confirm all)"
 * getTrustLevelDescription("readonly") // "read-trusted (confirm writes)"
 * getTrustLevelDescription(undefined)  // "untrusted (confirm all)"
 * ```
 */
export function getTrustLevelDescription(trustLevel: McpTrustLevel | undefined): string {
  if (trustLevel === undefined || trustLevel === false) {
    return "untrusted (confirm all)";
  }
  if (trustLevel === true) {
    return "fully trusted (auto-approve)";
  }
  if (trustLevel === "readonly") {
    return "read-trusted (confirm writes)";
  }
  return "unknown";
}

/**
 * Check if a trust level allows any auto-approval.
 * Useful for UI indicators showing trust status.
 *
 * @param trustLevel - The trust level to check
 * @returns true if any auto-approval is enabled
 */
export function hasTrustEnabled(trustLevel: McpTrustLevel | undefined): boolean {
  return trustLevel === true || trustLevel === "readonly";
}

// ============================================
// Integration Notes
// ============================================
//
// To integrate MCP trust-based permission bypass:
//
// 1. In DefaultPermissionChecker (checker.ts):
//    - Detect MCP tools by name prefix: `mcp:{serverId}/{toolName}`
//    - Look up server's trustLevel from McpHub
//    - Call shouldBypassPermission(trustLevel, toolName)
//    - If returns true, return "allow" immediately
//
// 2. In McpHub.ts registerMcpTool callback:
//    - Pass server.trustLevel to the tool's metadata
//    - The PermissionChecker can then access it via tool context
//
// 3. Alternative: Use permissionOverride in ToolExecutor.execute():
//    - McpHub can check trust before calling ToolExecutor
//    - Pass permissionOverride: "allow" if shouldBypassPermission() returns true
//
// Example integration in McpHub.ts callTool() or tool registration:
// ```typescript
// import { shouldBypassPermission } from '@vellum/core/permission/mcp-permission-bridge';
//
// // In tool executor callback:
// const permissionOverride = shouldBypassPermission(server.trustLevel, toolName)
//   ? 'allow'
//   : undefined;
// await toolExecutor.execute(name, params, context, { permissionOverride });
// ```
//
