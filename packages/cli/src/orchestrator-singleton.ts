/**
 * Orchestrator singleton for CLI
 *
 * Provides access to OrchestratorCore instance across CLI components.
 * This module ensures a single orchestrator instance is used throughout
 * the CLI lifecycle for task resumption, delegation, and multi-agent
 * orchestration.
 *
 * @module cli/orchestrator-singleton
 */

import {
  createContextIsolator,
  createModeRegistry,
  createOrchestrator,
  createPermissionInheritance,
  createResourceQuotaManager,
  createSubsessionManager,
  type ModeRegistry,
  type OrchestratorCore,
  type UnifiedToolContainer,
} from "@vellum/core";

// =============================================================================
// Singleton State
// =============================================================================

let orchestratorInstance: OrchestratorCore | null = null;
let modeRegistryInstance: ModeRegistry | null = null;

// =============================================================================
// Configuration Interface
// =============================================================================

/**
 * Configuration options for orchestrator initialization.
 */
export interface OrchestratorSingletonConfig {
  /** The same live tool container used by the primary agent. */
  toolContainer?: UnifiedToolContainer;
  /** Maximum number of concurrent subagents (default: 3) */
  maxConcurrentSubagents?: number;
  /** Optional explicit task deadline in milliseconds. */
  taskTimeout?: number;
}

// =============================================================================
// Singleton Access Functions
// =============================================================================

/**
 * Get or create the orchestrator singleton instance.
 *
 * This function lazily initializes the orchestrator on first call.
 * Subsequent calls return the same instance.
 *
 * @param config - Optional configuration for first-time initialization
 * @returns The OrchestratorCore instance
 *
 * @example
 * ```typescript
 * // First call initializes with config
 * const orchestrator = getOrCreateOrchestrator({
 *   maxConcurrentSubagents: 5,
 *   taskTimeout: 600_000,
 * });
 *
 * // Subsequent calls return the same instance
 * const same = getOrCreateOrchestrator();
 * ```
 */
export function getOrCreateOrchestrator(config?: OrchestratorSingletonConfig): OrchestratorCore {
  if (!orchestratorInstance) {
    modeRegistryInstance = createModeRegistry();
    const subsessionManager = config?.toolContainer
      ? createSubsessionManager({
          contextIsolator: createContextIsolator(),
          permissionInheritance: createPermissionInheritance(),
          resourceQuotaManager: createResourceQuotaManager(),
          baseToolRegistry: config.toolContainer,
        })
      : undefined;
    const rootSession = subsessionManager?.create({
      agentSlug: "orch",
      level: 0,
      initialContext: { localMemory: { cwd: config?.toolContainer?.getCwd() } },
    });
    orchestratorInstance = createOrchestrator({
      modeRegistry: modeRegistryInstance,
      subsessionManager,
      parentSessionId: rootSession?.id,
      maxConcurrentSubagents: config?.maxConcurrentSubagents ?? 3,
      taskTimeout: config?.taskTimeout,
    });
  }
  return orchestratorInstance;
}

/**
 * Get the orchestrator singleton if it exists.
 *
 * Unlike getOrCreateOrchestrator, this function does not create
 * the instance if it doesn't exist.
 *
 * @returns The OrchestratorCore instance or null if not initialized
 *
 * @example
 * ```typescript
 * const orchestrator = getOrchestrator();
 * if (orchestrator) {
 *   // Use orchestrator
 * } else {
 *   // Handle not initialized case
 * }
 * ```
 */
export function getOrchestrator(): OrchestratorCore | null {
  return orchestratorInstance;
}

/**
 * Get the mode registry singleton if it exists.
 *
 * The mode registry is created alongside the orchestrator.
 *
 * @returns The ModeRegistry instance or null if not initialized
 */
export function getModeRegistry(): ModeRegistry | null {
  return modeRegistryInstance;
}

/**
 * Reset the orchestrator singleton.
 *
 * This cancels any active tasks and clears the singleton instances.
 * Primarily used for testing or when reinitializing the CLI.
 *
 * @example
 * ```typescript
 * // Cleanup before exit
 * resetOrchestrator();
 * ```
 */
export function resetOrchestrator(): void {
  if (orchestratorInstance) {
    // Cancel any active tasks
    orchestratorInstance.cancelAll();
  }
  orchestratorInstance = null;
  modeRegistryInstance = null;
}
