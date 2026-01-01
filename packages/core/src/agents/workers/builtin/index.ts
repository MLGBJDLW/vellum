// ============================================
// Builtin Workers Registry
// ============================================
// REQ-029: Builtin worker implementations
// REQ-030: Worker registration and capabilities

import type { BaseWorker, WorkerCapabilities } from "../base.js";
import type { WorkerFactory } from "../factory.js";
import { analystWorker } from "./analyst.js";
import { architectWorker } from "./architect.js";
import { coderWorker } from "./coder.js";
import { devopsWorker } from "./devops.js";
import { qaWorker } from "./qa.js";
import { researcherWorker } from "./researcher.js";
import { securityWorker } from "./security.js";
import { writerWorker } from "./writer.js";

// ============================================
// Worker Registry
// ============================================

/**
 * Registry of all builtin workers.
 *
 * Contains all Level 2 worker implementations that ship
 * with the multi-agent orchestration system.
 *
 * @example
 * ```typescript
 * import { BUILTIN_WORKERS } from './builtin/index.js';
 *
 * console.log(`${BUILTIN_WORKERS.length} builtin workers available`);
 * for (const worker of BUILTIN_WORKERS) {
 *   console.log(`- ${worker.name} (${worker.slug})`);
 * }
 * ```
 */
export const BUILTIN_WORKERS: readonly BaseWorker[] = [
  coderWorker,
  qaWorker,
  writerWorker,
  analystWorker,
  architectWorker,
  devopsWorker,
  securityWorker,
  researcherWorker,
] as const;

// ============================================
// Registration Functions
// ============================================

/**
 * Register all builtin workers with a WorkerFactory.
 *
 * Iterates through BUILTIN_WORKERS and registers each with
 * the provided factory for O(1) lookup by slug.
 *
 * @param factory - The WorkerFactory to register workers with
 *
 * @example
 * ```typescript
 * import { createWorkerFactory } from '../factory.js';
 * import { registerBuiltinWorkers } from './builtin/index.js';
 *
 * const factory = createWorkerFactory();
 * registerBuiltinWorkers(factory);
 *
 * // Now all builtin workers are accessible
 * const coder = factory.create('coder');
 * ```
 */
export function registerBuiltinWorkers(factory: WorkerFactory): void {
  for (const worker of BUILTIN_WORKERS) {
    factory.register(worker);
  }
}

/**
 * Get capabilities map for all builtin workers.
 *
 * Creates a Map from worker slug to WorkerCapabilities,
 * useful for task routing and capability queries.
 *
 * @returns Map of worker slug to capabilities
 *
 * @example
 * ```typescript
 * import { getBuiltinWorkerCapabilities } from './builtin/index.js';
 *
 * const capabilities = getBuiltinWorkerCapabilities();
 *
 * // Check if a specific worker can edit files
 * const coderCaps = capabilities.get('coder');
 * if (coderCaps?.canEdit) {
 *   console.log('Coder can edit files');
 * }
 *
 * // Find all workers that can execute commands
 * for (const [slug, caps] of capabilities) {
 *   if (caps.canExecute) {
 *     console.log(`${slug} can execute commands`);
 *   }
 * }
 * ```
 */
export function getBuiltinWorkerCapabilities(): Map<string, WorkerCapabilities> {
  const map = new Map<string, WorkerCapabilities>();
  for (const worker of BUILTIN_WORKERS) {
    map.set(worker.slug, worker.capabilities);
  }
  return map;
}

// ============================================
// Re-exports
// ============================================

export { analystWorker } from "./analyst.js";
export { architectWorker } from "./architect.js";
export { coderWorker } from "./coder.js";
export { devopsWorker } from "./devops.js";
export { qaWorker } from "./qa.js";
export { researcherWorker } from "./researcher.js";
export { securityWorker } from "./security.js";
export { writerWorker } from "./writer.js";
