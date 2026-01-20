/**
 * Default Permission Checker for Vellum
 *
 * Implements the PermissionChecker interface by integrating all permission components.
 * This is the main entry point for permission checking in the tool executor.
 *
 * Implements REQ-014: Main permission checker integration.
 *
 * @module @vellum/core/permission
 */

import type { PermissionChecker, PermissionDecision } from "../tool/executor.js";
import type { ToolContext } from "../types/tool.js";

import { type AskResult, type PermissionAskHandler, PermissionAskService } from "./ask-service.js";
import { AutoApprovalLimitsHandler } from "./auto-approval.js";
import { DangerousOperationDetector } from "./danger-detector.js";
import {
  createPermissionCheckEvent,
  createPermissionDeniedEvent,
  createPermissionGrantedEvent,
  PermissionEventBus,
  type PermissionGrantedEvent,
} from "./event-bus.js";
import { SessionPermissionManager } from "./session-manager.js";
import {
  isToolAllowedByGroups,
  type PermissionToolGroupConfig,
  type ToolGroupCheckResult,
} from "./tool-groups.js";
import { TrustPresetManager } from "./trust-manager.js";
import {
  createPermissionInfo,
  isAllowed,
  isDenied,
  type PatternPermission,
  type PermissionLevel,
} from "./types.js";
import { Wildcard } from "./wildcard.js";

// ============================================
// Types
// ============================================

/**
 * Permission type mapping from tool kind to config key.
 */
type PermissionType = "edit" | "bash" | "webfetch" | "external_directory" | "doom_loop" | "mcp";

/**
 * Options for DefaultPermissionChecker.
 */
export interface DefaultPermissionCheckerOptions {
  /** Trust manager for preset resolution */
  trustManager?: TrustPresetManager;
  /** Session manager for session-scoped permissions */
  sessionManager?: SessionPermissionManager;
  /** Danger detector for dangerous operation checks */
  dangerDetector?: DangerousOperationDetector;
  /** Ask service for user prompts */
  askService?: PermissionAskService;
  /** Auto-approval limits handler */
  autoApprovalHandler?: AutoApprovalLimitsHandler;
  /** Event bus for permission events */
  eventBus?: PermissionEventBus;
  /** Initial permission ask handler */
  askHandler?: PermissionAskHandler;
  /** Whether to emit events (default: true) */
  emitEvents?: boolean;
  /** Tool group configurations for group-based permission checks */
  toolGroups?: PermissionToolGroupConfig[];
}

/**
 * Result of permission resolution with metadata.
 */
export interface PermissionResolutionResult {
  /** Final permission decision */
  decision: PermissionDecision;
  /** Source of the decision */
  source:
    | "config"
    | "session"
    | "user"
    | "danger"
    | "auto-limit"
    | "timeout"
    | "default"
    | "tool-group";
  /** Reason for the decision */
  reason: string;
  /** Whether this was from a cached decision */
  cached: boolean;
  /** Matched pattern if applicable */
  matchedPattern?: string;
  /** Auto-approve hint from tool group config */
  autoApprove?: boolean;
}

// Note: Tool kind mapping is handled via inferPermissionType based on tool name and params

// ============================================
// DefaultPermissionChecker
// ============================================

/**
 * Default implementation of PermissionChecker.
 *
 * Integrates:
 * - TrustManager for preset-based config resolution
 * - SessionPermissionManager for session-scoped permissions
 * - DangerousOperationDetector for safety checks
 * - PermissionAskService for user prompts
 * - AutoApprovalLimitsHandler for rate limiting
 * - PermissionEventBus for event notifications
 *
 * @example
 * ```typescript
 * const checker = createDefaultPermissionChecker({
 *   askHandler: async (info, ctx) => {
 *     // Show UI and get response
 *     return await showPermissionDialog(info, ctx.signal);
 *   },
 * });
 *
 * // Use in tool executor
 * const executor = new ToolExecutor({
 *   permissionChecker: checker,
 * });
 *
 * // Or check directly
 * const decision = await checker.checkPermission('bash', { command: 'ls' }, context);
 * ```
 */
export class DefaultPermissionChecker implements PermissionChecker {
  readonly #trustManager: TrustPresetManager;
  readonly #sessionManager: SessionPermissionManager;
  readonly #dangerDetector: DangerousOperationDetector;
  readonly #askService: PermissionAskService;
  readonly #autoApprovalHandler: AutoApprovalLimitsHandler;
  readonly #eventBus: PermissionEventBus;
  readonly #emitEvents: boolean;
  #toolGroups: PermissionToolGroupConfig[];

  /**
   * Creates a new DefaultPermissionChecker.
   *
   * @param options - Configuration options
   */
  constructor(options: DefaultPermissionCheckerOptions = {}) {
    this.#trustManager = options.trustManager ?? new TrustPresetManager();
    this.#sessionManager = options.sessionManager ?? new SessionPermissionManager();
    this.#dangerDetector = options.dangerDetector ?? new DangerousOperationDetector();
    this.#askService = options.askService ?? new PermissionAskService();
    this.#autoApprovalHandler = options.autoApprovalHandler ?? new AutoApprovalLimitsHandler();
    this.#eventBus = options.eventBus ?? new PermissionEventBus();
    this.#emitEvents = options.emitEvents ?? true;
    this.#toolGroups = options.toolGroups ?? [];

    // Set initial ask handler if provided
    if (options.askHandler) {
      this.#askService.setHandler(options.askHandler);
    }
  }

  /**
   * Check if a tool execution is permitted.
   *
   * Flow:
   * 1. Detect dangerous operations → deny if critical
   * 2. Check session cache → return cached decision if found
   * 3. Resolve from config → return if allow or deny
   * 4. Ask user → handle response (once/always/reject)
   * 5. Handle timeout → default to deny (EC-006)
   *
   * @param toolName - Name of the tool being executed
   * @param params - Parameters passed to the tool
   * @param context - Tool execution context
   * @returns Permission decision
   */
  async checkPermission(
    toolName: string,
    params: unknown,
    context: ToolContext
  ): Promise<PermissionDecision> {
    const result = await this.checkPermissionWithDetails(toolName, params, context);
    return result.decision;
  }

  /**
   * Check permission with full resolution details.
   *
   * @param toolName - Name of the tool
   * @param params - Tool parameters
   * @param context - Tool context
   * @returns Full resolution result with metadata
   */
  async checkPermissionWithDetails(
    toolName: string,
    params: unknown,
    context: ToolContext
  ): Promise<PermissionResolutionResult> {
    const permissionType = this.#inferPermissionType(toolName, params);
    const pattern = this.#extractPattern(toolName, params, permissionType);

    // Emit check event
    if (this.#emitEvents) {
      this.#eventBus.emit(
        "permissionCheck",
        createPermissionCheckEvent(toolName, permissionType, {
          params: params as Record<string, unknown>,
          sessionId: context.sessionId,
        })
      );
    }

    // Step 0: Check tool group permissions (if configured)
    const toolGroupResult = this.#checkToolGroups(toolName, params, permissionType);
    if (toolGroupResult) {
      if (toolGroupResult.decision === "deny") {
        this.#emitDenied(toolName, permissionType, toolGroupResult.reason, true, context.sessionId);
        return toolGroupResult;
      }
      // If tool group allows and has autoApprove, use that as the decision
      if (toolGroupResult.autoApprove) {
        this.#emitGrantedOrDenied(
          toolName,
          permissionType,
          toolGroupResult,
          context.sessionId,
          pattern
        );
        return toolGroupResult;
      }
    }

    // Step 1: Check for dangerous operations
    const dangerResult = this.#checkDanger(toolName, params, permissionType);
    if (dangerResult) {
      this.#emitDenied(toolName, permissionType, dangerResult.reason, true, context.sessionId);
      return dangerResult;
    }

    // Step 2: Check session cache
    const sessionResult = this.#checkSessionCache(permissionType, pattern);
    if (sessionResult) {
      this.#emitGrantedOrDenied(
        toolName,
        permissionType,
        sessionResult,
        context.sessionId,
        pattern
      );
      return sessionResult;
    }

    // Step 3: Resolve from config
    const configResult = this.#resolveFromConfig(permissionType, pattern);
    if (configResult.decision !== "ask") {
      this.#emitGrantedOrDenied(toolName, permissionType, configResult, context.sessionId, pattern);
      return configResult;
    }

    // Step 4: Ask user (if handler is set)
    const askResult = await this.#askUser(toolName, permissionType, pattern, params, context);
    this.#emitGrantedOrDenied(toolName, permissionType, askResult, context.sessionId, pattern);
    return askResult;
  }

  /**
   * Set the permission ask handler.
   *
   * @param handler - Handler for user prompts
   */
  setAskHandler(handler: PermissionAskHandler | undefined): void {
    this.#askService.setHandler(handler);
  }

  /**
   * Get the ask service for direct access.
   */
  get askService(): PermissionAskService {
    return this.#askService;
  }

  /**
   * Get the session manager for direct access.
   */
  get sessionManager(): SessionPermissionManager {
    return this.#sessionManager;
  }

  /**
   * Get the trust manager for direct access.
   */
  get trustManager(): TrustPresetManager {
    return this.#trustManager;
  }

  /**
   * Get the event bus for subscriptions.
   */
  get eventBus(): PermissionEventBus {
    return this.#eventBus;
  }

  /**
   * Get the auto-approval handler for stats/reset.
   */
  get autoApprovalHandler(): AutoApprovalLimitsHandler {
    return this.#autoApprovalHandler;
  }

  /**
   * Reset session state (call at session start).
   */
  resetSession(): void {
    this.#sessionManager.clear();
    this.#autoApprovalHandler.reset();
  }

  /**
   * Set tool group configurations.
   *
   * @param groups - Array of tool group configurations
   */
  setToolGroups(groups: PermissionToolGroupConfig[]): void {
    this.#toolGroups = groups;
  }

  /**
   * Get current tool group configurations.
   */
  get toolGroups(): PermissionToolGroupConfig[] {
    return this.#toolGroups;
  }

  // ============================================
  // Private Methods
  // ============================================

  /**
   * Check tool group permissions.
   *
   * Returns null if no tool groups are configured or the tool is allowed.
   * Returns a deny result if the tool is not allowed by group config.
   * Returns an allow result if the tool group has autoApprove enabled.
   */
  #checkToolGroups(
    toolName: string,
    params: unknown,
    _permissionType: PermissionType
  ): PermissionResolutionResult | null {
    // Skip if no tool groups configured
    if (this.#toolGroups.length === 0) {
      return null;
    }

    // Extract file path from params if present
    let filePath: string | undefined;
    if (params && typeof params === "object") {
      const p = params as Record<string, unknown>;
      if (typeof p.path === "string") {
        filePath = p.path;
      } else if (typeof p.filePath === "string") {
        filePath = p.filePath;
      }
    }

    // Check against tool groups
    const result: ToolGroupCheckResult = isToolAllowedByGroups(
      toolName,
      filePath,
      this.#toolGroups
    );

    if (!result.allowed) {
      return {
        decision: "deny",
        source: "tool-group",
        reason: result.reason ?? "Tool not allowed by group configuration",
        cached: false,
      };
    }

    // If allowed with autoApprove, return allow immediately
    if (result.autoApprove) {
      return {
        decision: "allow",
        source: "tool-group",
        reason: "Auto-approved by tool group configuration",
        cached: false,
        autoApprove: true,
      };
    }

    // Allowed but no autoApprove - continue to other checks
    return null;
  }

  /**
   * Infer permission type from tool name and params.
   */
  #inferPermissionType(toolName: string, params: unknown): PermissionType {
    // Check for known tool patterns
    const lowerName = toolName.toLowerCase();

    if (lowerName.includes("bash") || lowerName.includes("shell") || lowerName.includes("exec")) {
      return "bash";
    }
    if (lowerName.includes("edit") || lowerName.includes("write") || lowerName.includes("create")) {
      return "edit";
    }
    if (
      lowerName.includes("fetch") ||
      lowerName.includes("http") ||
      lowerName.includes("browser")
    ) {
      return "webfetch";
    }
    if (lowerName.includes("mcp")) {
      return "mcp";
    }

    // Check params for command (indicates bash)
    if (params && typeof params === "object" && "command" in params) {
      return "bash";
    }

    // Default to edit
    return "edit";
  }

  /**
   * Extract the relevant pattern for permission matching.
   */
  #extractPattern(
    _toolName: string,
    params: unknown,
    permissionType: PermissionType
  ): string | undefined {
    if (!params || typeof params !== "object") {
      return undefined;
    }

    const p = params as Record<string, unknown>;

    switch (permissionType) {
      case "bash":
        // Use command for pattern
        if (typeof p.command === "string") {
          return p.command;
        }
        break;
      case "edit":
        // Use file path for pattern
        if (typeof p.path === "string") {
          return p.path;
        }
        if (typeof p.filePath === "string") {
          return p.filePath;
        }
        break;
      case "webfetch":
        // Use URL for pattern
        if (typeof p.url === "string") {
          return p.url;
        }
        break;
    }

    return undefined;
  }

  /**
   * Check for dangerous operations.
   */
  #checkDanger(
    _toolName: string,
    params: unknown,
    permissionType: PermissionType
  ): PermissionResolutionResult | null {
    if (permissionType !== "bash") {
      return null;
    }

    const p = params as Record<string, unknown>;
    const command = typeof p?.command === "string" ? p.command : undefined;

    if (!command) {
      return null;
    }

    const dangerResult = this.#dangerDetector.checkCommand(command);

    if (dangerResult.isDangerous && dangerResult.severity === "critical") {
      return {
        decision: "deny",
        source: "danger",
        reason: dangerResult.reason,
        cached: false,
        matchedPattern: dangerResult.details?.matchedPattern,
      };
    }

    return null;
  }

  /**
   * Check session cache for cached permission.
   */
  #checkSessionCache(
    permissionType: PermissionType,
    pattern?: string
  ): PermissionResolutionResult | null {
    const result = this.#sessionManager.has({ type: permissionType, pattern });

    if (result.hasPermission && result.level) {
      return {
        decision: this.#levelToDecision(result.level),
        source: "session",
        reason: `Session permission: ${result.level}`,
        cached: true,
      };
    }

    return null;
  }

  /**
   * Resolve permission from config.
   */
  #resolveFromConfig(permissionType: PermissionType, pattern?: string): PermissionResolutionResult {
    const config = this.#trustManager.getEffectiveConfig();
    const patternPermission = config[permissionType] as PatternPermission | undefined;

    if (patternPermission === undefined) {
      return {
        decision: "ask",
        source: "default",
        reason: "No config found, defaulting to ask",
        cached: false,
      };
    }

    // Simple permission level
    if (typeof patternPermission === "string") {
      const level = patternPermission as PermissionLevel;
      return {
        decision: this.#levelToDecision(level),
        source: "config",
        reason: `Config permission: ${level}`,
        cached: false,
      };
    }

    // Pattern-based permission
    if (pattern && typeof patternPermission === "object") {
      const level = Wildcard.resolvePermission(pattern, patternPermission);
      if (level) {
        return {
          decision: this.#levelToDecision(level),
          source: "config",
          reason: `Config pattern permission: ${level}`,
          cached: false,
          matchedPattern: pattern,
        };
      }
    }

    return {
      decision: "ask",
      source: "default",
      reason: "No matching pattern in config",
      cached: false,
    };
  }

  /**
   * Ask user for permission.
   */
  async #askUser(
    toolName: string,
    permissionType: PermissionType,
    pattern: string | undefined,
    params: unknown,
    context: ToolContext
  ): Promise<PermissionResolutionResult> {
    // Check auto-approval limit
    if (this.#autoApprovalHandler.isLimitReached()) {
      return {
        decision: "deny",
        source: "auto-limit",
        reason: "Auto-approval limit reached",
        cached: false,
      };
    }

    // Create permission info
    const info = createPermissionInfo(
      permissionType,
      `Allow ${toolName}?`,
      context.sessionId,
      context.messageId,
      {
        pattern,
        callId: context.callId,
        metadata: {
          toolName,
          // Surface params for UI renderers (e.g., TUI PermissionDialog).
          // NOTE: Callers should take care not to persist/log sensitive values.
          params:
            params && typeof params === "object" && params !== null
              ? (params as Record<string, unknown>)
              : { value: params },
        },
      }
    );

    // Ask for permission
    const askResult = await this.#askService.askPermission(info);

    // Handle response
    return this.#handleAskResponse(askResult, permissionType, pattern);
  }

  /**
   * Handle ask response and update session.
   */
  #handleAskResponse(
    askResult: AskResult,
    permissionType: PermissionType,
    pattern?: string
  ): PermissionResolutionResult {
    // Timeout - deny
    if (askResult.timedOut) {
      return {
        decision: "deny",
        source: "timeout",
        reason: "Permission prompt timed out (EC-006)",
        cached: false,
      };
    }

    // Process response
    switch (askResult.response) {
      case "once":
        // Allow this time only, don't cache
        this.#autoApprovalHandler.recordApproval({ type: permissionType });
        return {
          decision: "allow",
          source: "user",
          reason: "User granted permission (once)",
          cached: false,
        };

      case "always":
        // Grant and cache for session
        this.#sessionManager.grant({ type: permissionType, pattern }, "allow", {
          source: "user",
        });
        this.#autoApprovalHandler.recordApproval({ type: permissionType });
        return {
          decision: "allow",
          source: "user",
          reason: "User granted permission (always)",
          cached: false,
        };
      default:
        // Deny this action
        return {
          decision: "deny",
          source: "user",
          reason: "User denied permission",
          cached: false,
        };
    }
  }

  /**
   * Convert permission level to decision.
   */
  #levelToDecision(level: PermissionLevel): PermissionDecision {
    if (isAllowed(level)) return "allow";
    if (isDenied(level)) return "deny";
    return "ask";
  }

  /**
   * Emit granted or denied event based on result.
   */
  #emitGrantedOrDenied(
    toolName: string,
    permissionType: PermissionType,
    result: PermissionResolutionResult,
    sessionId: string,
    pattern?: string
  ): void {
    if (!this.#emitEvents) return;

    if (result.decision === "allow") {
      const grantType = this.#sourceToGrantType(result.source);
      this.#eventBus.emit(
        "permissionGranted",
        createPermissionGrantedEvent(toolName, permissionType, grantType, {
          pattern,
          sessionId,
        })
      );
    } else if (result.decision === "deny") {
      this.#emitDenied(
        toolName,
        permissionType,
        result.reason,
        result.source !== "user",
        sessionId
      );
    }
  }

  /**
   * Emit denied event.
   */
  #emitDenied(
    toolName: string,
    permissionType: PermissionType,
    reason: string,
    isAutoDenial: boolean,
    sessionId?: string
  ): void {
    if (!this.#emitEvents) return;

    this.#eventBus.emit(
      "permissionDenied",
      createPermissionDeniedEvent(toolName, permissionType, reason, isAutoDenial, {
        sessionId,
      })
    );
  }

  /**
   * Map resolution source to grant type.
   */
  #sourceToGrantType(
    source: PermissionResolutionResult["source"]
  ): PermissionGrantedEvent["grantType"] {
    switch (source) {
      case "config":
        return "config";
      case "session":
        return "auto";
      case "user":
        return "user-once"; // Could be user-always, but we lose that info
      case "tool-group":
        return "auto";
      default:
        return "auto";
    }
  }
}

// ============================================
// Factory Function
// ============================================

/**
 * Create a DefaultPermissionChecker with default wiring.
 *
 * This is the recommended way to create a permission checker for most use cases.
 *
 * @param options - Optional configuration overrides
 * @returns Configured DefaultPermissionChecker instance
 *
 * @example
 * ```typescript
 * // Basic usage
 * const checker = createDefaultPermissionChecker();
 *
 * // With TUI handler
 * const checker = createDefaultPermissionChecker({
 *   askHandler: async (info, ctx) => {
 *     return await tuiShowPermissionPrompt(info, ctx.signal);
 *   },
 * });
 *
 * // With custom trust preset
 * const checker = createDefaultPermissionChecker({
 *   trustManager: new TrustPresetManager({ cliPreset: 'cautious' }),
 * });
 *
 * // Use with ToolExecutor
 * const executor = new ToolExecutor({
 *   permissionChecker: checker,
 * });
 * ```
 */
export function createDefaultPermissionChecker(
  options?: DefaultPermissionCheckerOptions
): DefaultPermissionChecker {
  return new DefaultPermissionChecker(options);
}
