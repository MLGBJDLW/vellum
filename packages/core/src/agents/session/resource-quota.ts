// ============================================
// Resource Quota Manager
// ============================================
// REQ-024: Resource quota management for subagents
// REQ-038: Resource usage tracking and enforcement

// ============================================
// ResourceQuota Interface
// ============================================

/**
 * Defines resource limits for a subagent session.
 *
 * @example
 * ```typescript
 * const quota: ResourceQuota = {
 *   maxTokens: 100000,
 *   maxDurationMs: 300000,  // 5 minutes
 *   maxSubagents: 3,
 *   maxFileOps: 50,
 * };
 * ```
 */
export interface ResourceQuota {
  /** Maximum number of tokens the session can consume */
  maxTokens: number;
  /** Maximum duration in milliseconds the session can run */
  maxDurationMs: number;
  /** Maximum number of subagents that can be spawned */
  maxSubagents: number;
  /** Maximum number of file operations allowed */
  maxFileOps: number;
}

// ============================================
// ResourceUsage Interface
// ============================================

/**
 * Tracks current resource consumption for a session.
 *
 * @example
 * ```typescript
 * const usage: ResourceUsage = {
 *   tokensUsed: 5000,
 *   durationMs: 60000,
 *   subagentsSpawned: 1,
 *   fileOpsPerformed: 10,
 * };
 * ```
 */
export interface ResourceUsage {
  /** Number of tokens consumed so far */
  tokensUsed: number;
  /** Duration in milliseconds since session start */
  durationMs: number;
  /** Number of subagents spawned */
  subagentsSpawned: number;
  /** Number of file operations performed */
  fileOpsPerformed: number;
}

// ============================================
// QuotaStatus Interface
// ============================================

/**
 * Complete status of quota allocation and usage for a session.
 *
 * @example
 * ```typescript
 * const status: QuotaStatus = {
 *   quota: { maxTokens: 100000, maxDurationMs: 300000, maxSubagents: 3, maxFileOps: 50 },
 *   usage: { tokensUsed: 5000, durationMs: 60000, subagentsSpawned: 1, fileOpsPerformed: 10 },
 *   remaining: { tokensUsed: 95000, durationMs: 240000, subagentsSpawned: 2, fileOpsPerformed: 40 },
 *   exceeds: false,
 * };
 * ```
 */
export interface QuotaStatus {
  /** The allocated quota for the session */
  quota: ResourceQuota;
  /** Current resource usage */
  usage: ResourceUsage;
  /** Remaining resources (quota - usage) */
  remaining: ResourceUsage;
  /** Whether any resource has exceeded its quota */
  exceeds: boolean;
}

// ============================================
// ResourceQuotaManager Interface
// ============================================

/**
 * Manages resource quotas for subagent sessions.
 *
 * Provides allocation, consumption tracking, and enforcement of resource limits.
 * When a quota is exceeded, the session should be terminated.
 *
 * @example
 * ```typescript
 * const manager = createResourceQuotaManager();
 *
 * // Allocate quota for a session
 * manager.allocate('session-123', {
 *   maxTokens: 100000,
 *   maxDurationMs: 300000,
 *   maxSubagents: 3,
 *   maxFileOps: 50,
 * });
 *
 * // Consume resources (returns false if would exceed)
 * const canContinue = manager.consume('session-123', 'tokensUsed', 1000);
 *
 * // Check if quota exceeded
 * if (manager.isExceeded('session-123')) {
 *   // Trigger termination
 * }
 *
 * // Get remaining resources
 * const remaining = manager.getRemaining('session-123');
 *
 * // Release when done
 * manager.release('session-123');
 * ```
 */
export interface ResourceQuotaManager {
  /**
   * Allocates a resource quota for a session.
   *
   * If a quota already exists for the session, it will be replaced.
   *
   * @param sessionId - The unique session identifier
   * @param quota - The resource quota to allocate
   */
  allocate(sessionId: string, quota: ResourceQuota): void;

  /**
   * Consumes a resource amount from the session's quota.
   *
   * Returns false if consuming the amount would exceed the quota.
   * The resource is only consumed if the operation succeeds.
   *
   * @param sessionId - The unique session identifier
   * @param resource - The resource type to consume
   * @param amount - The amount to consume
   * @returns True if consumption succeeded, false if would exceed quota
   */
  consume(sessionId: string, resource: keyof ResourceUsage, amount: number): boolean;

  /**
   * Gets the remaining resources for a session.
   *
   * @param sessionId - The unique session identifier
   * @returns The remaining resources or null if session not found
   */
  getRemaining(sessionId: string): ResourceUsage | null;

  /**
   * Releases the quota allocation for a session.
   *
   * Should be called when a session completes or is terminated.
   *
   * @param sessionId - The unique session identifier
   */
  release(sessionId: string): void;

  /**
   * Gets the complete quota status for a session.
   *
   * @param sessionId - The unique session identifier
   * @returns The quota status or null if session not found
   */
  getStatus(sessionId: string): QuotaStatus | null;

  /**
   * Checks if any resource has exceeded its quota.
   *
   * This should trigger session termination when true.
   *
   * @param sessionId - The unique session identifier
   * @returns True if any resource exceeded, false otherwise
   */
  isExceeded(sessionId: string): boolean;
}

// ============================================
// Internal Session State
// ============================================

/**
 * Internal state for tracking a session's quota and usage.
 */
interface SessionQuotaState {
  quota: ResourceQuota;
  usage: ResourceUsage;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Creates an empty resource usage record.
 *
 * @returns A new ResourceUsage with all values set to 0
 */
function createEmptyUsage(): ResourceUsage {
  return {
    tokensUsed: 0,
    durationMs: 0,
    subagentsSpawned: 0,
    fileOpsPerformed: 0,
  };
}

/**
 * Maps ResourceUsage keys to ResourceQuota keys.
 */
const USAGE_TO_QUOTA_MAP: Record<keyof ResourceUsage, keyof ResourceQuota> = {
  tokensUsed: "maxTokens",
  durationMs: "maxDurationMs",
  subagentsSpawned: "maxSubagents",
  fileOpsPerformed: "maxFileOps",
};

/**
 * Calculates the remaining resources from quota and usage.
 *
 * @param quota - The allocated quota
 * @param usage - The current usage
 * @returns The remaining resources (quota - usage)
 */
function calculateRemaining(quota: ResourceQuota, usage: ResourceUsage): ResourceUsage {
  return {
    tokensUsed: Math.max(0, quota.maxTokens - usage.tokensUsed),
    durationMs: Math.max(0, quota.maxDurationMs - usage.durationMs),
    subagentsSpawned: Math.max(0, quota.maxSubagents - usage.subagentsSpawned),
    fileOpsPerformed: Math.max(0, quota.maxFileOps - usage.fileOpsPerformed),
  };
}

/**
 * Checks if any usage value exceeds its corresponding quota.
 *
 * @param quota - The allocated quota
 * @param usage - The current usage
 * @returns True if any resource exceeded
 */
function checkExceeded(quota: ResourceQuota, usage: ResourceUsage): boolean {
  return (
    usage.tokensUsed > quota.maxTokens ||
    usage.durationMs > quota.maxDurationMs ||
    usage.subagentsSpawned > quota.maxSubagents ||
    usage.fileOpsPerformed > quota.maxFileOps
  );
}

// ============================================
// Factory Function
// ============================================

/**
 * Creates a new ResourceQuotaManager instance.
 *
 * The manager maintains an in-memory store of quota allocations
 * and usage tracking per session.
 *
 * @returns A new ResourceQuotaManager instance
 *
 * @example
 * ```typescript
 * const manager = createResourceQuotaManager();
 *
 * // Allocate quota
 * manager.allocate('session-1', {
 *   maxTokens: 50000,
 *   maxDurationMs: 120000,
 *   maxSubagents: 2,
 *   maxFileOps: 20,
 * });
 *
 * // Track consumption
 * manager.consume('session-1', 'tokensUsed', 1000);
 * manager.consume('session-1', 'fileOpsPerformed', 1);
 *
 * // Check status
 * const status = manager.getStatus('session-1');
 * console.log('Exceeded:', status?.exceeds);
 * ```
 */
export function createResourceQuotaManager(): ResourceQuotaManager {
  const sessions = new Map<string, SessionQuotaState>();

  return {
    allocate(sessionId: string, quota: ResourceQuota): void {
      sessions.set(sessionId, {
        quota: { ...quota },
        usage: createEmptyUsage(),
      });
    },

    consume(sessionId: string, resource: keyof ResourceUsage, amount: number): boolean {
      const state = sessions.get(sessionId);
      if (!state) {
        return false;
      }

      const quotaKey = USAGE_TO_QUOTA_MAP[resource];
      const currentUsage = state.usage[resource];
      const maxAllowed = state.quota[quotaKey];
      const newUsage = currentUsage + amount;

      // Check if consumption would exceed quota
      if (newUsage > maxAllowed) {
        return false;
      }

      // Apply the consumption
      state.usage[resource] = newUsage;
      return true;
    },

    getRemaining(sessionId: string): ResourceUsage | null {
      const state = sessions.get(sessionId);
      if (!state) {
        return null;
      }

      return calculateRemaining(state.quota, state.usage);
    },

    release(sessionId: string): void {
      sessions.delete(sessionId);
    },

    getStatus(sessionId: string): QuotaStatus | null {
      const state = sessions.get(sessionId);
      if (!state) {
        return null;
      }

      return {
        quota: { ...state.quota },
        usage: { ...state.usage },
        remaining: calculateRemaining(state.quota, state.usage),
        exceeds: checkExceeded(state.quota, state.usage),
      };
    },

    isExceeded(sessionId: string): boolean {
      const state = sessions.get(sessionId);
      if (!state) {
        return false;
      }

      return checkExceeded(state.quota, state.usage);
    },
  };
}
