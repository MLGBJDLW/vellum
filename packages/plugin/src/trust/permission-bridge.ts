/**
 * PermissionBridge - Bridge between plugin trust system and core permission system.
 *
 * Translates plugin operations into capability checks and provides a unified
 * interface for permission verification across the plugin system.
 *
 * @module trust/permission-bridge
 */

import type { TrustedPluginsManager } from "./manager.js";
import type { PluginCapability } from "./types.js";

/**
 * Types of plugin operations that can be checked.
 */
export type PluginOperationType = "hook" | "command" | "agent" | "mcp";

/**
 * Represents a plugin operation that requires permission verification.
 */
export interface PluginOperation {
  /** The type of operation being performed */
  type: PluginOperationType;
  /** The specific action being performed (e.g., 'run_terminal', 'read_file') */
  action: string;
  /** Optional target resource (file path or resource identifier) */
  target?: string;
}

/**
 * Result of an operation permission check.
 */
export interface OperationResult {
  /** Whether the operation is allowed */
  allowed: boolean;
  /** Human-readable reason for the decision */
  reason?: string;
  /** The capability required to perform this operation, if denied */
  requiredCapability?: PluginCapability;
}

/**
 * Interface for external permission checkers that can be integrated.
 */
export interface PermissionChecker {
  /**
   * Checks if an action is allowed for a given target.
   *
   * @param action - The action being performed
   * @param target - Optional target resource
   * @returns Promise resolving to true if allowed
   */
  checkPermission(action: string, target?: string): Promise<boolean>;
}

/**
 * Maps operation types to their required capabilities.
 */
const OPERATION_CAPABILITY_MAP: Record<PluginOperationType, PluginCapability> = {
  hook: "execute-hooks",
  command: "execute-hooks",
  agent: "spawn-subagent",
  mcp: "mcp-servers",
};

/**
 * Maps specific actions to additional required capabilities.
 */
const ACTION_CAPABILITY_MAP: Record<string, PluginCapability> = {
  run_terminal: "execute-hooks",
  read_file: "access-filesystem",
  write_file: "access-filesystem",
  delete_file: "access-filesystem",
  fetch: "network-access",
  http_request: "network-access",
  spawn_agent: "spawn-subagent",
  start_mcp: "mcp-servers",
};

/**
 * Bridge between plugin trust system and core permission system.
 *
 * Provides a unified interface for checking plugin operations against
 * the trust configuration and optionally delegating to an external
 * permission checker.
 *
 * @example
 * ```typescript
 * const bridge = new PermissionBridge(trustedPluginsManager);
 *
 * const result = bridge.checkOperation("my-plugin", {
 *   type: "hook",
 *   action: "read_file",
 *   target: "/path/to/file.ts"
 * });
 *
 * if (!result.allowed) {
 *   console.error(`Denied: ${result.reason}`);
 * }
 * ```
 */
export class PermissionBridge {
  /** Trust manager for plugin capability verification */
  private readonly trustManager: TrustedPluginsManager;

  /** Optional external permission checker for additional validation */
  private readonly permissionChecker?: PermissionChecker;

  /**
   * Creates a new PermissionBridge instance.
   *
   * @param trustManager - The TrustedPluginsManager for capability checks
   * @param permissionChecker - Optional external permission checker for delegation
   *
   * @example
   * ```typescript
   * const bridge = new PermissionBridge(trustManager);
   *
   * // With external permission checker
   * const bridgeWithChecker = new PermissionBridge(trustManager, corePermissionChecker);
   * ```
   */
  constructor(trustManager: TrustedPluginsManager, permissionChecker?: PermissionChecker) {
    this.trustManager = trustManager;
    this.permissionChecker = permissionChecker;
  }

  /**
   * Checks if a plugin operation is allowed.
   *
   * Evaluates the operation against the plugin's trust level and capabilities.
   * For 'full' trust, all operations are allowed. For 'limited' trust, only
   * operations matching granted capabilities are allowed. For 'none', all
   * operations are blocked.
   *
   * @param pluginName - Name of the plugin requesting the operation
   * @param operation - The operation to check
   * @returns Result indicating if the operation is allowed
   *
   * @example
   * ```typescript
   * const result = bridge.checkOperation("my-plugin", {
   *   type: "hook",
   *   action: "read_file",
   *   target: "/path/to/file.ts"
   * });
   *
   * if (result.allowed) {
   *   // Proceed with operation
   * } else {
   *   console.error(`Operation denied: ${result.reason}`);
   *   if (result.requiredCapability) {
   *     console.error(`Required capability: ${result.requiredCapability}`);
   *   }
   * }
   * ```
   */
  checkOperation(pluginName: string, operation: PluginOperation): OperationResult {
    const trustLevel = this.trustManager.getTrustLevel(pluginName);

    // Plugin not found or no trust entry
    if (trustLevel === undefined) {
      return {
        allowed: false,
        reason: `Plugin "${pluginName}" is not registered in the trust store`,
      };
    }

    // Trust level: none - block all operations
    if (trustLevel === "none") {
      return {
        allowed: false,
        reason: `Plugin "${pluginName}" has no trust (trust level: none)`,
      };
    }

    // Trust level: full - allow all operations
    if (trustLevel === "full") {
      return {
        allowed: true,
        reason: "Full trust granted",
      };
    }

    // Trust level: limited - check specific capabilities
    return this.checkLimitedTrustOperation(pluginName, operation);
  }

  /**
   * Requests a capability for a plugin.
   *
   * If an external permission checker is configured, delegates the capability
   * request to it. Otherwise, checks if the plugin already has the capability.
   *
   * @param pluginName - Name of the plugin requesting the capability
   * @param capability - The capability being requested
   * @returns Promise resolving to true if the capability is granted
   *
   * @example
   * ```typescript
   * const granted = await bridge.requestCapability("my-plugin", "network-access");
   * if (granted) {
   *   // Capability is available
   * } else {
   *   console.error("Network access capability not available");
   * }
   * ```
   */
  async requestCapability(pluginName: string, capability: PluginCapability): Promise<boolean> {
    // First check if plugin already has the capability
    if (this.trustManager.hasCapability(pluginName, capability)) {
      return true;
    }

    // If external permission checker available, delegate to it
    if (this.permissionChecker) {
      return this.permissionChecker.checkPermission(`capability:${capability}`, pluginName);
    }

    // No external checker and capability not granted
    return false;
  }

  /**
   * Checks an operation for a plugin with limited trust.
   *
   * @param pluginName - Name of the plugin
   * @param operation - The operation to check
   * @returns Result with capability requirements if denied
   */
  private checkLimitedTrustOperation(
    pluginName: string,
    operation: PluginOperation
  ): OperationResult {
    // Get the base capability required for this operation type
    const baseCapability = OPERATION_CAPABILITY_MAP[operation.type];

    // Check if plugin has the base capability for this operation type
    if (!this.trustManager.hasCapability(pluginName, baseCapability)) {
      return {
        allowed: false,
        reason: `Plugin "${pluginName}" lacks capability for ${operation.type} operations`,
        requiredCapability: baseCapability,
      };
    }

    // Check if the specific action requires an additional capability
    const actionCapability = ACTION_CAPABILITY_MAP[operation.action];
    if (actionCapability && actionCapability !== baseCapability) {
      if (!this.trustManager.hasCapability(pluginName, actionCapability)) {
        return {
          allowed: false,
          reason: `Plugin "${pluginName}" lacks capability for action "${operation.action}"`,
          requiredCapability: actionCapability,
        };
      }
    }

    return {
      allowed: true,
      reason: "Operation permitted by granted capabilities",
    };
  }
}
