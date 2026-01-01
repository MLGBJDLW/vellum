// ============================================
// Subsession Manager
// ============================================
// REQ-020: Subsession management for agent isolation
// REQ-021: Subsession lifecycle management

import { randomUUID } from "node:crypto";

import type { AgentLevel } from "../../agent/level.js";
import type { ToolRegistry } from "../../tool/registry.js";
import type { ApprovalRequest } from "../orchestrator/approval-forwarder.js";
import type { ContextIsolator, IsolatedContext } from "./context-isolator.js";
import { createFilteredToolRegistry, type FilteredToolRegistry } from "./filtered-tool-registry.js";
import type { PermissionInheritance, PermissionSet } from "./permission-inheritance.js";
import type { ResourceQuota, ResourceQuotaManager } from "./resource-quota.js";

// ============================================
// Subsession Status Type
// ============================================

/**
 * Status of a subsession lifecycle.
 *
 * - active: Subsession is running and can execute tasks
 * - suspended: Subsession is paused (quota exceeded or awaiting approval)
 * - terminated: Subsession has ended and cannot be resumed
 */
export type SubsessionStatus = "active" | "suspended" | "terminated";

// ============================================
// Subsession Interface
// ============================================

/**
 * Represents an isolated execution environment for a subagent.
 *
 * A subsession encapsulates:
 * - Isolated context (memory, files)
 * - Permission set (derived from parent)
 * - Filtered tool registry (based on agent level)
 * - Resource quota tracking
 *
 * @example
 * ```typescript
 * const subsession: Subsession = {
 *   id: '550e8400-e29b-41d4-a716-446655440000',
 *   parentId: '660e8400-e29b-41d4-a716-446655440001',
 *   agentSlug: 'ouroboros-coder',
 *   level: AgentLevel.worker,
 *   context: isolatedContext,
 *   permissions: derivedPermissions,
 *   toolRegistry: filteredRegistry,
 *   status: 'active',
 *   createdAt: new Date(),
 * };
 * ```
 */
export interface Subsession {
  /** Unique identifier for this subsession */
  id: string;
  /** Parent subsession ID (undefined for root) */
  parentId?: string;
  /** Slug/identifier for the agent running in this subsession */
  agentSlug: string;
  /** Hierarchy level of the agent */
  level: AgentLevel;
  /** Isolated execution context */
  context: IsolatedContext;
  /** Permission set for this subsession */
  permissions: PermissionSet;
  /** Filtered tool registry based on level and permissions */
  toolRegistry: FilteredToolRegistry;
  /** Current lifecycle status */
  status: SubsessionStatus;
  /** Timestamp when subsession was created */
  createdAt: Date;
  /** Timestamp when subsession was terminated (if applicable) */
  terminatedAt?: Date;
}

// ============================================
// Subsession Creation Config
// ============================================

/**
 * Configuration for creating a new subsession.
 */
export interface SubsessionCreateConfig {
  /** Parent subsession ID (undefined for root) */
  parentId?: string;
  /** Slug/identifier for the agent */
  agentSlug: string;
  /** Hierarchy level of the agent */
  level: AgentLevel;
  /** Initial context values (optional) */
  initialContext?: Partial<IsolatedContext>;
  /** Requested permissions (will be intersected with parent) */
  requestedPermissions?: Partial<PermissionSet>;
  /** Resource quota allocation */
  quota?: ResourceQuota;
}

// ============================================
// SubsessionManager Interface
// ============================================

/**
 * Manages subsession lifecycle for multi-agent orchestration.
 *
 * Provides:
 * - Subsession creation with context/permission inheritance
 * - Subsession execution with quota tracking
 * - Approval forwarding to parent session
 *
 * @example
 * ```typescript
 * const manager = createSubsessionManager({
 *   contextIsolator,
 *   permissionInheritance,
 *   resourceQuotaManager,
 *   baseToolRegistry,
 * });
 *
 * // Create a subsession for a worker agent
 * const subsession = manager.create({
 *   parentId: parentSession.id,
 *   agentSlug: 'ouroboros-coder',
 *   level: AgentLevel.worker,
 * });
 *
 * // Execute work in subsession context
 * const result = await manager.execute(subsession.id, async () => {
 *   return await doWork();
 * });
 *
 * // Terminate when done
 * manager.terminate(subsession.id);
 * ```
 */
export interface SubsessionManager {
  /**
   * Creates a new subsession with isolated context and permissions.
   *
   * The subsession's permissions are derived as the intersection of:
   * - Parent's permissions (if parent exists)
   * - Requested permissions (if provided)
   *
   * @param config - Subsession creation configuration
   * @returns The created subsession
   * @throws Error if parent not found or level hierarchy violated
   */
  create(config: SubsessionCreateConfig): Subsession;

  /**
   * Gets a subsession by ID.
   *
   * @param id - Subsession ID
   * @returns The subsession or undefined if not found
   */
  get(id: string): Subsession | undefined;

  /**
   * Terminates a subsession and releases its resources.
   *
   * Also terminates all child subsessions recursively.
   *
   * @param id - Subsession ID to terminate
   * @returns true if terminated, false if not found
   */
  terminate(id: string): boolean;

  /**
   * Lists all subsessions with a given parent.
   *
   * @param parentId - Parent subsession ID
   * @returns Array of child subsessions
   */
  listByParent(parentId: string): Subsession[];

  /**
   * Executes a function in the context of a subsession.
   *
   * Tracks resource usage and enforces quotas.
   * Throws if subsession not found or not active.
   *
   * @param subsessionId - Subsession ID to execute in
   * @param fn - Async function to execute
   * @returns Promise resolving to the function result
   * @throws Error if subsession not found, not active, or quota exceeded
   */
  execute<T>(subsessionId: string, fn: () => Promise<T>): Promise<T>;

  /**
   * Forwards an approval request to the parent session.
   *
   * Used when a subagent needs elevated permissions or
   * approval for a sensitive operation.
   *
   * @param subsessionId - Subsession requesting approval
   * @param request - The approval request details
   * @returns Promise resolving to approval decision
   * @throws Error if subsession not found or has no parent
   */
  requestApproval(subsessionId: string, request: ApprovalRequest): Promise<boolean>;

  /**
   * Sets the approval handler for root-level approval requests.
   *
   * @param handler - Function to handle approval requests
   */
  setApprovalHandler(handler: (request: ApprovalRequest) => Promise<boolean>): void;

  /**
   * Gets count of active subsessions.
   */
  getActiveCount(): number;
}

// ============================================
// Default Resource Quota
// ============================================

/**
 * Default resource quota for subsessions when not specified.
 */
const DEFAULT_QUOTA: ResourceQuota = {
  maxTokens: 100000,
  maxDurationMs: 300000, // 5 minutes
  maxSubagents: 3,
  maxFileOps: 50,
};

/**
 * Default permissions for root subsessions.
 */
const DEFAULT_ROOT_PERMISSIONS: PermissionSet = {
  filePatterns: [{ pattern: "**/*", access: "write" }],
  toolGroups: [],
  canApproveSubagent: true,
  maxSubagentDepth: 3,
};

// ============================================
// SubsessionManager Implementation
// ============================================

/**
 * Internal implementation of SubsessionManager.
 */
class SubsessionManagerImpl implements SubsessionManager {
  private readonly subsessions: Map<string, Subsession> = new Map();
  private readonly contextIsolator: ContextIsolator;
  private readonly permissionInheritance: PermissionInheritance;
  private readonly resourceQuotaManager: ResourceQuotaManager;
  private readonly baseToolRegistry: ToolRegistry;
  private approvalHandler?: (request: ApprovalRequest) => Promise<boolean>;

  constructor(config: {
    contextIsolator: ContextIsolator;
    permissionInheritance: PermissionInheritance;
    resourceQuotaManager: ResourceQuotaManager;
    baseToolRegistry: ToolRegistry;
  }) {
    this.contextIsolator = config.contextIsolator;
    this.permissionInheritance = config.permissionInheritance;
    this.resourceQuotaManager = config.resourceQuotaManager;
    this.baseToolRegistry = config.baseToolRegistry;
  }

  /**
   * Validates that parent-child level hierarchy is correct.
   */
  private validateParentHierarchy(parentId: string, childLevel: AgentLevel): Subsession {
    const parent = this.subsessions.get(parentId);
    if (!parent) {
      throw new Error(`Parent subsession not found: ${parentId}`);
    }
    if (parent.status !== "active") {
      throw new Error(`Parent subsession is not active: ${parentId}`);
    }
    if (childLevel <= parent.level) {
      throw new Error(
        `Invalid level hierarchy: child level ${childLevel} must be greater than parent level ${parent.level}`
      );
    }
    return parent;
  }

  /**
   * Applies initial context values to a base context.
   */
  private applyInitialContext(
    context: IsolatedContext,
    initialContext?: Partial<IsolatedContext>
  ): IsolatedContext {
    if (!initialContext) {
      return context;
    }

    let result = context;
    if (initialContext.localMemory) {
      result = {
        ...result,
        localMemory: { ...result.localMemory, ...initialContext.localMemory },
      };
    }
    if (initialContext.files) {
      result = {
        ...result,
        files: [...new Set([...result.files, ...initialContext.files])],
      };
    }
    return result;
  }

  /**
   * Derives permissions for a subsession.
   */
  private derivePermissions(
    parent: Subsession | undefined,
    requestedPermissions?: Partial<PermissionSet>
  ): PermissionSet {
    if (parent) {
      return this.permissionInheritance.derive(parent.permissions, requestedPermissions ?? {});
    }
    return requestedPermissions
      ? { ...DEFAULT_ROOT_PERMISSIONS, ...requestedPermissions }
      : DEFAULT_ROOT_PERMISSIONS;
  }

  create(config: SubsessionCreateConfig): Subsession {
    const { parentId, agentSlug, level, initialContext, requestedPermissions, quota } = config;

    // Validate parent hierarchy if parent exists
    const parent = parentId ? this.validateParentHierarchy(parentId, level) : undefined;

    // Create isolated context from parent
    const parentContext = parent?.context;
    const baseContext = this.contextIsolator.createIsolated(parentContext, true);
    const context = this.applyInitialContext(baseContext, initialContext);

    // Derive permissions from parent
    const permissions = this.derivePermissions(parent, requestedPermissions);

    // Create filtered tool registry based on level
    const toolRegistry = createFilteredToolRegistry(
      this.baseToolRegistry,
      level,
      permissions.toolGroups
    );

    // Allocate resource quota
    const effectiveQuota = quota ?? DEFAULT_QUOTA;
    const id = randomUUID();
    this.resourceQuotaManager.allocate(id, effectiveQuota);

    const subsession: Subsession = {
      id,
      parentId,
      agentSlug,
      level,
      context,
      permissions,
      toolRegistry,
      status: "active",
      createdAt: new Date(),
    };

    this.subsessions.set(id, subsession);

    // Track subagent spawn in parent's quota
    if (parentId) {
      this.resourceQuotaManager.consume(parentId, "subagentsSpawned", 1);
    }

    return subsession;
  }

  get(id: string): Subsession | undefined {
    return this.subsessions.get(id);
  }

  terminate(id: string): boolean {
    const subsession = this.subsessions.get(id);
    if (!subsession) {
      return false;
    }

    // Terminate all children first (recursive)
    const children = this.listByParent(id);
    for (const child of children) {
      this.terminate(child.id);
    }

    // Update status
    subsession.status = "terminated";
    subsession.terminatedAt = new Date();

    // Release quota allocation
    this.resourceQuotaManager.release(id);

    return true;
  }

  listByParent(parentId: string): Subsession[] {
    const children: Subsession[] = [];
    for (const subsession of this.subsessions.values()) {
      if (subsession.parentId === parentId) {
        children.push(subsession);
      }
    }
    return children;
  }

  async execute<T>(subsessionId: string, fn: () => Promise<T>): Promise<T> {
    const subsession = this.subsessions.get(subsessionId);

    if (!subsession) {
      throw new Error(`Subsession not found: ${subsessionId}`);
    }

    if (subsession.status !== "active") {
      throw new Error(`Subsession is not active: ${subsessionId} (status: ${subsession.status})`);
    }

    // Check if quota already exceeded before execution
    if (this.resourceQuotaManager.isExceeded(subsessionId)) {
      subsession.status = "suspended";
      throw new Error(`Resource quota exceeded for subsession: ${subsessionId}`);
    }

    const startTime = Date.now();

    try {
      const result = await fn();

      // Track duration after execution
      const duration = Date.now() - startTime;
      const canContinue = this.resourceQuotaManager.consume(subsessionId, "durationMs", duration);

      if (!canContinue) {
        subsession.status = "suspended";
      }

      return result;
    } catch (error) {
      // Track duration even on error
      const duration = Date.now() - startTime;
      this.resourceQuotaManager.consume(subsessionId, "durationMs", duration);
      throw error;
    }
  }

  async requestApproval(subsessionId: string, request: ApprovalRequest): Promise<boolean> {
    const subsession = this.subsessions.get(subsessionId);

    if (!subsession) {
      throw new Error(`Subsession not found: ${subsessionId}`);
    }

    // If subsession has a parent, forward to parent
    if (subsession.parentId) {
      const parent = this.subsessions.get(subsession.parentId);
      if (!parent) {
        throw new Error(`Parent subsession not found: ${subsession.parentId}`);
      }

      // Check if parent can approve
      if (!parent.permissions.canApproveSubagent) {
        // Forward to parent's parent
        return this.requestApproval(subsession.parentId, request);
      }

      // Parent can approve - forward to parent's handler or continue chain
      if (parent.parentId) {
        return this.requestApproval(parent.parentId, request);
      }
    }

    // Root level - use the approval handler
    if (this.approvalHandler) {
      return this.approvalHandler(request);
    }

    // No handler configured - deny by default
    return false;
  }

  setApprovalHandler(handler: (request: ApprovalRequest) => Promise<boolean>): void {
    this.approvalHandler = handler;
  }

  getActiveCount(): number {
    let count = 0;
    for (const subsession of this.subsessions.values()) {
      if (subsession.status === "active") {
        count++;
      }
    }
    return count;
  }
}

// ============================================
// Factory Function
// ============================================

/**
 * Creates a new SubsessionManager instance.
 *
 * @param config - Configuration with required dependencies
 * @returns A new SubsessionManager instance
 *
 * @example
 * ```typescript
 * const manager = createSubsessionManager({
 *   contextIsolator: createContextIsolator(),
 *   permissionInheritance: createPermissionInheritance(),
 *   resourceQuotaManager: createResourceQuotaManager(),
 *   baseToolRegistry: toolRegistry,
 * });
 *
 * // Create root subsession
 * const root = manager.create({
 *   agentSlug: 'ouroboros',
 *   level: AgentLevel.orchestrator,
 * });
 *
 * // Create child subsession
 * const child = manager.create({
 *   parentId: root.id,
 *   agentSlug: 'ouroboros-coder',
 *   level: AgentLevel.worker,
 * });
 * ```
 */
export function createSubsessionManager(config: {
  contextIsolator: ContextIsolator;
  permissionInheritance: PermissionInheritance;
  resourceQuotaManager: ResourceQuotaManager;
  baseToolRegistry: ToolRegistry;
}): SubsessionManager {
  return new SubsessionManagerImpl(config);
}
