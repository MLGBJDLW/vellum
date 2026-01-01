// ============================================
// WorkerFactory Interface
// ============================================
// REQ-028: Factory for instantiating and managing workers

import type { BaseWorker, WorkerCapabilities } from "./base.js";

// ============================================
// Error Classes
// ============================================

/**
 * Error thrown when attempting to create or access an unknown worker.
 *
 * @example
 * ```typescript
 * throw new UnknownWorkerError('nonexistent-worker');
 * // Error: Unknown worker: nonexistent-worker
 * ```
 */
export class UnknownWorkerError extends Error {
  /** The slug that was not found */
  readonly slug: string;

  constructor(slug: string) {
    super(`Unknown worker: ${slug}`);
    this.name = "UnknownWorkerError";
    this.slug = slug;
  }
}

/**
 * Error thrown when attempting to register a worker with a duplicate slug.
 *
 * @example
 * ```typescript
 * throw new DuplicateWorkerError('coder');
 * // Error: Worker already registered: coder
 * ```
 */
export class DuplicateWorkerError extends Error {
  /** The duplicate slug */
  readonly slug: string;

  constructor(slug: string) {
    super(`Worker already registered: ${slug}`);
    this.name = "DuplicateWorkerError";
    this.slug = slug;
  }
}

// ============================================
// Worker Metadata
// ============================================

/**
 * Metadata returned when listing workers.
 */
export interface WorkerMetadata {
  /** Unique slug identifier */
  slug: string;
  /** Human-readable name */
  name: string;
  /** Worker capabilities */
  capabilities: WorkerCapabilities;
}

// ============================================
// WorkerFactory Interface
// ============================================

/**
 * Factory interface for managing worker instances.
 *
 * Provides O(1) lookup, registration, and enumeration of workers.
 *
 * @example
 * ```typescript
 * const factory = createWorkerFactory();
 *
 * // Register workers
 * factory.register(coderWorker);
 * factory.register(qaWorker);
 *
 * // Create worker instance by slug
 * const coder = factory.create('ouroboros-coder');
 *
 * // List all workers
 * const workers = factory.listWorkers();
 * ```
 */
export interface WorkerFactory {
  /**
   * Create/retrieve a worker instance by slug.
   *
   * @param slug - The unique worker identifier
   * @returns The worker instance
   * @throws {UnknownWorkerError} If no worker is registered with the given slug
   */
  create(slug: string): BaseWorker;

  /**
   * Register a worker with the factory.
   *
   * @param worker - The worker to register
   * @throws {DuplicateWorkerError} If a worker with the same slug is already registered
   */
  register(worker: BaseWorker): void;

  /**
   * Unregister a worker by slug.
   *
   * @param slug - The worker slug to unregister
   * @returns True if the worker was removed, false if it wasn't registered
   */
  unregister(slug: string): boolean;

  /**
   * List all registered workers with their metadata.
   *
   * @returns Array of worker metadata objects
   */
  listWorkers(): WorkerMetadata[];

  /**
   * Check if a worker is registered.
   *
   * @param slug - The worker slug to check
   * @returns True if the worker is registered
   */
  has(slug: string): boolean;
}

// ============================================
// Factory Implementation
// ============================================

/**
 * Creates a new WorkerFactory instance.
 *
 * Uses a Map internally for O(1) lookup operations.
 *
 * @returns A new WorkerFactory instance
 *
 * @example
 * ```typescript
 * const factory = createWorkerFactory();
 *
 * // Register a worker
 * factory.register(createBaseWorker({
 *   slug: 'ouroboros-coder',
 *   name: 'Coder',
 *   capabilities: {
 *     canEdit: true,
 *     canExecute: true,
 *     canNetwork: false,
 *     specializations: ['typescript'],
 *   },
 *   handler: async (ctx) => ({ success: true }),
 * }));
 *
 * // Check and create
 * if (factory.has('ouroboros-coder')) {
 *   const worker = factory.create('ouroboros-coder');
 * }
 *
 * // List all
 * console.log(factory.listWorkers());
 * // [{ slug: 'ouroboros-coder', name: 'Coder', capabilities: {...} }]
 * ```
 */
export function createWorkerFactory(): WorkerFactory {
  // Internal registry using Map for O(1) lookup
  const registry = new Map<string, BaseWorker>();

  return {
    create(slug: string): BaseWorker {
      const worker = registry.get(slug);
      if (!worker) {
        throw new UnknownWorkerError(slug);
      }
      return worker;
    },

    register(worker: BaseWorker): void {
      if (registry.has(worker.slug)) {
        throw new DuplicateWorkerError(worker.slug);
      }
      registry.set(worker.slug, worker);
    },

    unregister(slug: string): boolean {
      return registry.delete(slug);
    },

    listWorkers(): WorkerMetadata[] {
      return Array.from(registry.values()).map((worker) => ({
        slug: worker.slug,
        name: worker.name,
        capabilities: worker.capabilities,
      }));
    },

    has(slug: string): boolean {
      return registry.has(slug);
    },
  };
}
