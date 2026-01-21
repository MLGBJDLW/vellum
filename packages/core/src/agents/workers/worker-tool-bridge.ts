// ============================================
// Worker Tool Bridge
// ============================================
// Bridges worker subsession tools to ToolExecutor for AgentLoop execution
// REQ-027: Worker tool execution
// REQ-037: Anti-recursion - Workers cannot spawn agents

import { AgentLevel } from "../../agent/level.js";
import {
  type ExecuteOptions,
  type ExecutionResult,
  type PermissionChecker,
  type PermissionDecision,
  ToolExecutor,
  type ToolExecutorConfig,
} from "../../tool/executor.js";
import type { ToolContext } from "../../types/tool.js";
import type { FilteredToolRegistry } from "../session/filtered-tool-registry.js";
import { WORKER_TOOL_SETS } from "./worker-tool-constants.js";

// ============================================
// Types
// ============================================

/**
 * Configuration for creating a WorkerToolBridge.
 */
export interface WorkerToolBridgeConfig {
  /** The worker's slug for tool set filtering */
  workerSlug: string;
  /** The subsession's filtered tool registry */
  toolRegistry: FilteredToolRegistry;
  /** Optional permission checker for additional authorization */
  permissionChecker?: PermissionChecker;
  /** Optional executor config overrides */
  executorConfig?: Partial<ToolExecutorConfig>;
}

/**
 * Result of bridge validation.
 */
export interface BridgeValidationResult {
  /** Whether the bridge is valid */
  valid: boolean;
  /** List of available tool names */
  availableTools: string[];
  /** List of requested but blocked tools */
  blockedTools: string[];
  /** List of requested but missing tools */
  missingTools: string[];
  /** Error message if invalid */
  error?: string;
}

// ============================================
// Worker Permission Wrapper
// ============================================

/**
 * Permission checker that wraps an existing checker with worker-level restrictions.
 *
 * Ensures workers cannot bypass level-based tool restrictions even if the
 * underlying permission checker would allow it.
 */
class WorkerPermissionWrapper implements PermissionChecker {
  constructor(
    private readonly toolRegistry: FilteredToolRegistry,
    private readonly innerChecker?: PermissionChecker
  ) {}

  async checkPermission(
    toolName: string,
    params: unknown,
    context: ToolContext
  ): Promise<PermissionDecision> {
    // First check: Is the tool allowed for this worker level?
    if (!this.toolRegistry.isAllowed(toolName)) {
      return "deny";
    }

    // Second check: Delegate to inner permission checker if provided
    if (this.innerChecker) {
      return this.innerChecker.checkPermission(toolName, params, context);
    }

    // Default: allow if tool exists in registry
    return "allow";
  }
}

// ============================================
// WorkerToolBridge Implementation
// ============================================

/**
 * WorkerToolBridge creates a ToolExecutor pre-populated with tools
 * from a worker's subsession FilteredToolRegistry.
 *
 * This bridge:
 * - Respects the 3-level hierarchy (workers are Level 2, cannot spawn agents)
 * - Uses the existing permission system
 * - Integrates with the existing tool registry
 * - Maintains isolation between worker sessions
 *
 * @example
 * ```typescript
 * // Create a bridge for a coder worker
 * const bridge = createWorkerToolBridge({
 *   workerSlug: 'coder',
 *   toolRegistry: subsession.toolRegistry,
 * });
 *
 * // Get the executor for AgentLoop
 * const toolExecutor = bridge.getExecutor();
 *
 * // Use in AgentLoop config
 * const loop = new AgentLoop({
 *   ...config,
 *   toolExecutor,
 * });
 * ```
 */
export class WorkerToolBridge {
  private readonly workerSlug: string;
  private readonly toolRegistry: FilteredToolRegistry;
  private readonly executor: ToolExecutor;
  private readonly allowedToolNames: readonly string[];

  constructor(config: WorkerToolBridgeConfig) {
    this.workerSlug = config.workerSlug;
    this.toolRegistry = config.toolRegistry;

    // Get allowed tool names for this worker type
    this.allowedToolNames = WORKER_TOOL_SETS[config.workerSlug] ?? WORKER_TOOL_SETS.coder ?? [];

    // Create permission wrapper that enforces level restrictions
    const permissionWrapper = new WorkerPermissionWrapper(
      config.toolRegistry,
      config.permissionChecker
    );

    // Create executor with permission wrapper
    this.executor = new ToolExecutor({
      ...config.executorConfig,
      permissionChecker: permissionWrapper,
    });

    // Register allowed tools from the filtered registry
    this.registerTools();
  }

  /**
   * Register tools from the filtered registry into the executor.
   */
  private registerTools(): void {
    // Get all tools from the filtered registry
    const allTools = this.toolRegistry.list();

    // Filter to only tools allowed for this worker type
    const allowedSet = new Set(this.allowedToolNames.map((n) => n.toLowerCase()));

    for (const tool of allTools) {
      const toolName = tool.definition.name.toLowerCase();

      // Only register if:
      // 1. Tool is in the worker's allowed set
      // 2. Tool is allowed by the filtered registry (level restrictions)
      if (allowedSet.has(toolName) && this.toolRegistry.isAllowed(tool.definition.name)) {
        this.executor.registerTool(tool);
      }
    }
  }

  /**
   * Get the ToolExecutor instance for use with AgentLoop.
   *
   * @returns The configured ToolExecutor
   */
  getExecutor(): ToolExecutor {
    return this.executor;
  }

  /**
   * Validate the bridge configuration.
   *
   * Checks that required tools are available and no tools are unexpectedly blocked.
   *
   * @returns Validation result with details
   */
  validate(): BridgeValidationResult {
    const availableTools: string[] = [];
    const blockedTools: string[] = [];
    const missingTools: string[] = [];

    for (const toolName of this.allowedToolNames) {
      if (this.executor.hasTool(toolName)) {
        availableTools.push(toolName);
      } else if (this.toolRegistry.has(toolName)) {
        // Tool exists but was blocked (level restriction)
        blockedTools.push(toolName);
      } else {
        // Tool doesn't exist in registry at all
        missingTools.push(toolName);
      }
    }

    const valid = availableTools.length > 0;
    let error: string | undefined;

    if (!valid) {
      error = `No tools available for worker '${this.workerSlug}'`;
      if (blockedTools.length > 0) {
        error += `. Blocked: ${blockedTools.join(", ")}`;
      }
      if (missingTools.length > 0) {
        error += `. Missing: ${missingTools.join(", ")}`;
      }
    }

    return {
      valid,
      availableTools,
      blockedTools,
      missingTools,
      error,
    };
  }

  /**
   * Get the list of tool names registered with the executor.
   *
   * @returns Array of registered tool names
   */
  getRegisteredToolNames(): string[] {
    return this.executor.listTools().map((t) => t.definition.name);
  }

  /**
   * Check if a specific tool is available through this bridge.
   *
   * @param toolName - Name of the tool to check
   * @returns true if tool is available
   */
  hasTool(toolName: string): boolean {
    return this.executor.hasTool(toolName);
  }

  /**
   * Execute a tool through the bridge.
   *
   * This method provides a direct way to execute tools without going through
   * AgentLoop, useful for testing or programmatic tool calls.
   *
   * @param name - Tool name
   * @param params - Tool parameters
   * @param context - Execution context
   * @param options - Optional execution options
   * @returns Execution result
   */
  async execute(
    name: string,
    params: unknown,
    context: ToolContext,
    options?: ExecuteOptions
  ): Promise<ExecutionResult> {
    return this.executor.execute(name, params, context, options);
  }
}

// ============================================
// Factory Function
// ============================================

/**
 * Create a WorkerToolBridge for a worker subsession.
 *
 * This factory function creates a bridge that:
 * - Populates a ToolExecutor with tools from the filtered registry
 * - Enforces worker-level restrictions (REQ-037)
 * - Integrates with the permission system
 *
 * @param config - Bridge configuration
 * @returns A configured WorkerToolBridge
 *
 * @example
 * ```typescript
 * const bridge = createWorkerToolBridge({
 *   workerSlug: 'coder',
 *   toolRegistry: subsession.toolRegistry,
 *   permissionChecker: subsession.permissions,
 * });
 *
 * // Validate the bridge
 * const validation = bridge.validate();
 * if (!validation.valid) {
 *   console.error('Bridge validation failed:', validation.error);
 * }
 *
 * // Get executor for AgentLoop
 * const executor = bridge.getExecutor();
 * ```
 */
export function createWorkerToolBridge(config: WorkerToolBridgeConfig): WorkerToolBridge {
  // Validate that registry is for worker level
  if (config.toolRegistry.agentLevel !== AgentLevel.worker) {
    throw new Error(
      `WorkerToolBridge requires a worker-level registry, got level: ${config.toolRegistry.agentLevel}`
    );
  }

  return new WorkerToolBridge(config);
}

/**
 * Create a ToolExecutor for a worker directly from a FilteredToolRegistry.
 *
 * Convenience function that creates a WorkerToolBridge and returns just the executor.
 *
 * @param workerSlug - The worker's slug
 * @param toolRegistry - The subsession's filtered tool registry
 * @param permissionChecker - Optional permission checker
 * @returns A configured ToolExecutor
 *
 * @example
 * ```typescript
 * const executor = createWorkerToolExecutor(
 *   'coder',
 *   subsession.toolRegistry,
 *   subsession.permissions
 * );
 *
 * // Use directly in AgentLoop
 * const loop = new AgentLoop({
 *   ...config,
 *   toolExecutor: executor,
 * });
 * ```
 */
export function createWorkerToolExecutor(
  workerSlug: string,
  toolRegistry: FilteredToolRegistry,
  permissionChecker?: PermissionChecker
): ToolExecutor {
  const bridge = createWorkerToolBridge({
    workerSlug,
    toolRegistry,
    permissionChecker,
  });
  return bridge.getExecutor();
}
