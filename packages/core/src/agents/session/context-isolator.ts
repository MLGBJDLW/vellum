// ============================================
// Context Isolator
// ============================================
// REQ-022: Context isolation for subagent sessions

import { randomUUID } from "node:crypto";

// ============================================
// IsolatedContext Interface
// ============================================

/**
 * Represents an isolated execution context for a subagent session.
 *
 * Provides memory isolation between parent and child contexts:
 * - sharedMemory: Read-only access to parent's exported values
 * - localMemory: Writable storage for the current context only
 *
 * @example
 * ```typescript
 * const context: IsolatedContext = {
 *   id: '550e8400-e29b-41d4-a716-446655440000',
 *   parentId: '660e8400-e29b-41d4-a716-446655440001',
 *   sharedMemory: { apiKey: 'xxx', config: { timeout: 5000 } },
 *   localMemory: { scratchpad: 'working...' },
 *   files: ['src/index.ts', 'src/utils.ts'],
 *   createdAt: new Date(),
 * };
 * ```
 */
export interface IsolatedContext {
  /** Unique identifier for this context */
  id: string;
  /** Parent context ID if this is a child context */
  parentId?: string;
  /** Read-only shared memory from parent context */
  sharedMemory: Readonly<Record<string, unknown>>;
  /** Writable local memory for this context only */
  localMemory: Record<string, unknown>;
  /** List of file paths accessible to this context */
  files: string[];
  /** Timestamp when the context was created */
  createdAt: Date;
}

// ============================================
// ContextIsolator Interface
// ============================================

/**
 * Interface for managing isolated execution contexts.
 *
 * Provides operations for creating, forking, and merging
 * isolated contexts with proper memory isolation.
 *
 * @example
 * ```typescript
 * const isolator = createContextIsolator();
 *
 * // Create root context
 * const root = isolator.createIsolated();
 * isolator.setLocal(root, 'config', { debug: true });
 *
 * // Fork for child agent
 * const child = isolator.fork(root);
 * isolator.setLocal(child, 'result', 'completed');
 *
 * // Merge child results back
 * const merged = isolator.merge(child, root);
 * ```
 */
export interface ContextIsolator {
  /**
   * Creates a new isolated context.
   *
   * If a parent context is provided, the parent's localMemory becomes
   * the child's sharedMemory (read-only). Files can optionally be inherited.
   *
   * @param parentContext - Optional parent context to inherit from
   * @param inheritFiles - Whether to inherit parent's file list (default: true)
   * @returns A new isolated context
   */
  createIsolated(parentContext?: IsolatedContext, inheritFiles?: boolean): IsolatedContext;

  /**
   * Merges a child context's local changes back into the parent.
   *
   * Creates a new parent context with the child's local memory
   * merged into the parent's local memory. Does not mutate either input.
   *
   * @param child - The child context to merge from
   * @param parent - The parent context to merge into
   * @returns A new merged context based on the parent
   */
  merge(child: IsolatedContext, parent: IsolatedContext): IsolatedContext;

  /**
   * Creates a child context with a snapshot of the parent.
   *
   * The parent's combined memory (shared + local) becomes the child's
   * sharedMemory. The child starts with empty localMemory.
   *
   * @param context - The context to fork from
   * @returns A new child context
   */
  fork(context: IsolatedContext): IsolatedContext;

  /**
   * Gets a defensive copy of the shared memory.
   *
   * Returns a deep clone to prevent external mutation.
   *
   * @param context - The context to get shared memory from
   * @returns A read-only copy of the shared memory
   */
  getShared(context: IsolatedContext): Readonly<Record<string, unknown>>;

  /**
   * Sets a value in the context's local memory.
   *
   * @param context - The context to modify
   * @param key - The key to set
   * @param value - The value to store
   */
  setLocal(context: IsolatedContext, key: string, value: unknown): void;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Creates a deep clone of an object.
 * Uses JSON serialization for simplicity and safety.
 *
 * @param obj - The object to clone
 * @returns A deep clone of the object
 */
function deepClone<T>(obj: T): T {
  if (obj === undefined || obj === null) {
    return obj;
  }
  return JSON.parse(JSON.stringify(obj)) as T;
}

/**
 * Creates a frozen (read-only) deep clone of a record.
 *
 * @param record - The record to freeze
 * @returns A frozen copy of the record
 */
function createReadOnlySnapshot(
  record: Record<string, unknown>
): Readonly<Record<string, unknown>> {
  const clone = deepClone(record);
  return Object.freeze(clone);
}

// ============================================
// Factory Function
// ============================================

/**
 * Creates a new ContextIsolator instance.
 *
 * Factory function for creating context isolation managers.
 * Implements proper memory isolation with defensive copying
 * to prevent unintended mutations across context boundaries.
 *
 * @returns A new ContextIsolator instance
 *
 * @example
 * ```typescript
 * const isolator = createContextIsolator();
 *
 * // Create a root context
 * const root = isolator.createIsolated();
 * isolator.setLocal(root, 'sharedConfig', { timeout: 5000 });
 *
 * // Create child with inherited shared memory
 * const child = isolator.createIsolated(root);
 * console.log(isolator.getShared(child)); // { sharedConfig: { timeout: 5000 } }
 *
 * // Child can write to local memory
 * isolator.setLocal(child, 'childResult', 'success');
 *
 * // Fork creates a snapshot
 * const forked = isolator.fork(root);
 *
 * // Merge brings child changes back to parent
 * const merged = isolator.merge(child, root);
 * console.log(merged.localMemory); // { sharedConfig: {...}, childResult: 'success' }
 * ```
 */
export function createContextIsolator(): ContextIsolator {
  return {
    createIsolated(parentContext?: IsolatedContext, inheritFiles = true): IsolatedContext {
      if (parentContext) {
        // Create child context with parent's local memory as read-only shared
        return {
          id: randomUUID(),
          parentId: parentContext.id,
          sharedMemory: createReadOnlySnapshot(parentContext.localMemory),
          localMemory: {},
          files: inheritFiles ? [...parentContext.files] : [],
          createdAt: new Date(),
        };
      }

      // Create root context with empty memories
      return {
        id: randomUUID(),
        parentId: undefined,
        sharedMemory: Object.freeze({}),
        localMemory: {},
        files: [],
        createdAt: new Date(),
      };
    },

    merge(child: IsolatedContext, parent: IsolatedContext): IsolatedContext {
      // Merge child's local memory into parent's local memory
      // Creates a new context - does not mutate either input
      const mergedLocalMemory = {
        ...deepClone(parent.localMemory),
        ...deepClone(child.localMemory),
      };

      // Combine file lists, removing duplicates
      const mergedFiles = Array.from(new Set([...parent.files, ...child.files]));

      return {
        id: parent.id,
        parentId: parent.parentId,
        sharedMemory: parent.sharedMemory,
        localMemory: mergedLocalMemory,
        files: mergedFiles,
        createdAt: parent.createdAt,
      };
    },

    fork(context: IsolatedContext): IsolatedContext {
      // Combine shared and local memory for the child's shared memory
      const combinedMemory = {
        ...deepClone(context.sharedMemory as Record<string, unknown>),
        ...deepClone(context.localMemory),
      };

      return {
        id: randomUUID(),
        parentId: context.id,
        sharedMemory: Object.freeze(combinedMemory),
        localMemory: {},
        files: [...context.files],
        createdAt: new Date(),
      };
    },

    getShared(context: IsolatedContext): Readonly<Record<string, unknown>> {
      // Return defensive copy to prevent external mutation
      return createReadOnlySnapshot(context.sharedMemory as Record<string, unknown>);
    },

    setLocal(context: IsolatedContext, key: string, value: unknown): void {
      // Set value with deep clone to prevent reference sharing
      context.localMemory[key] = deepClone(value);
    },
  };
}
