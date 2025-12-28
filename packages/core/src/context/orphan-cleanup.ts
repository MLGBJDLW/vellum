/**
 * Context Management System - Orphan Pointer Cleanup Module
 *
 * Provides utilities for detecting and cleaning up orphaned parent pointers
 * in context messages. Orphaned pointers occur when messages reference
 * condenseParent or truncationParent IDs that no longer exist in the context.
 *
 * Features:
 * - Clear invalid parent pointers
 * - Count orphaned pointers for diagnostics
 * - Validate all parent pointer relationships
 *
 * @module @vellum/core/context/orphan-cleanup
 */

import type { ContextMessage } from "./types.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Result of orphan pointer counting operation.
 */
export interface OrphanPointerCount {
  /** Number of orphaned condenseParent pointers */
  readonly orphanedCondenseParent: number;
  /** Number of orphaned truncationParent pointers */
  readonly orphanedTruncationParent: number;
  /** Total number of orphaned pointers */
  readonly total: number;
}

/**
 * Information about an invalid pointer.
 */
export interface InvalidPointerInfo {
  /** ID of the message with the invalid pointer */
  readonly messageId: string;
  /** Field name containing the invalid pointer */
  readonly field: "condenseParent" | "truncationParent";
  /** The ID that the pointer references (which doesn't exist) */
  readonly pointsTo: string;
}

/**
 * Result of parent pointer validation.
 */
export interface ValidationResult {
  /** Whether all pointers are valid */
  readonly valid: boolean;
  /** List of invalid pointers found */
  readonly invalidPointers: readonly InvalidPointerInfo[];
}

// ============================================================================
// Pointer Cleanup
// ============================================================================

/**
 * Clear invalid condenseParent and truncationParent pointers.
 *
 * Returns a new array of messages where any pointers that reference
 * non-existent message IDs are removed. The original messages array
 * is not modified (immutable operation).
 *
 * @param messages - Array of context messages to clean
 * @returns New array with orphaned pointers cleared
 *
 * @example
 * ```typescript
 * const messages: ContextMessage[] = [
 *   { id: 'msg-1', role: 'user', content: 'Hello', priority: 30 },
 *   {
 *     id: 'msg-2',
 *     role: 'assistant',
 *     content: 'Hi',
 *     priority: 30,
 *     condenseParent: 'deleted-summary', // Orphaned pointer
 *   },
 * ];
 *
 * const cleaned = clearOrphanedParentPointers(messages);
 * // cleaned[1].condenseParent is undefined
 * ```
 */
export function clearOrphanedParentPointers(messages: ContextMessage[]): ContextMessage[] {
  if (!Array.isArray(messages) || messages.length === 0) {
    return [];
  }

  // Build set of existing message IDs and condenseIds for O(1) lookup
  const existingIds = new Set<string>();

  for (const msg of messages) {
    existingIds.add(msg.id);
    if (msg.condenseId) {
      existingIds.add(msg.condenseId);
    }
  }

  // Map messages, clearing orphaned pointers
  return messages.map((msg) => {
    const hasOrphanedCondense =
      msg.condenseParent !== undefined && !existingIds.has(msg.condenseParent);

    const hasOrphanedTruncation =
      msg.truncationParent !== undefined && !existingIds.has(msg.truncationParent);

    // Return original if no changes needed
    if (!hasOrphanedCondense && !hasOrphanedTruncation) {
      return msg;
    }

    // Create new message without orphaned pointers
    const { condenseParent, truncationParent, ...rest } = msg;

    const result: ContextMessage = { ...rest };

    // Keep valid pointers
    if (!hasOrphanedCondense && condenseParent !== undefined) {
      (result as { condenseParent: string }).condenseParent = condenseParent;
    }

    if (!hasOrphanedTruncation && truncationParent !== undefined) {
      (result as { truncationParent: string }).truncationParent = truncationParent;
    }

    return result;
  });
}

// ============================================================================
// Diagnostics
// ============================================================================

/**
 * Count orphaned pointers for diagnostics.
 *
 * Returns counts of orphaned condenseParent and truncationParent pointers
 * without modifying the messages array.
 *
 * @param messages - Array of context messages to analyze
 * @returns Counts of orphaned pointers by type
 *
 * @example
 * ```typescript
 * const messages: ContextMessage[] = [...];
 * const counts = countOrphanedPointers(messages);
 *
 * console.log(`Orphaned condenseParent: ${counts.orphanedCondenseParent}`);
 * console.log(`Orphaned truncationParent: ${counts.orphanedTruncationParent}`);
 * console.log(`Total orphaned: ${counts.total}`);
 * ```
 */
export function countOrphanedPointers(messages: ContextMessage[]): OrphanPointerCount {
  if (!Array.isArray(messages) || messages.length === 0) {
    return {
      orphanedCondenseParent: 0,
      orphanedTruncationParent: 0,
      total: 0,
    };
  }

  // Build set of existing message IDs and condenseIds
  const existingIds = new Set<string>();

  for (const msg of messages) {
    existingIds.add(msg.id);
    if (msg.condenseId) {
      existingIds.add(msg.condenseId);
    }
  }

  // Count orphaned pointers
  let orphanedCondenseParent = 0;
  let orphanedTruncationParent = 0;

  for (const msg of messages) {
    if (msg.condenseParent !== undefined && !existingIds.has(msg.condenseParent)) {
      orphanedCondenseParent++;
    }

    if (msg.truncationParent !== undefined && !existingIds.has(msg.truncationParent)) {
      orphanedTruncationParent++;
    }
  }

  return {
    orphanedCondenseParent,
    orphanedTruncationParent,
    total: orphanedCondenseParent + orphanedTruncationParent,
  };
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate all parent pointers point to existing messages.
 *
 * Returns detailed information about any invalid pointers found,
 * including the message ID, field name, and referenced ID.
 *
 * @param messages - Array of context messages to validate
 * @returns Validation result with details of any invalid pointers
 *
 * @example
 * ```typescript
 * const messages: ContextMessage[] = [...];
 * const result = validateParentPointers(messages);
 *
 * if (!result.valid) {
 *   console.log('Invalid pointers found:');
 *   for (const ptr of result.invalidPointers) {
 *     console.log(`  ${ptr.messageId}.${ptr.field} -> ${ptr.pointsTo}`);
 *   }
 * }
 * ```
 */
export function validateParentPointers(messages: ContextMessage[]): ValidationResult {
  if (!Array.isArray(messages) || messages.length === 0) {
    return {
      valid: true,
      invalidPointers: [],
    };
  }

  // Build set of existing message IDs and condenseIds
  const existingIds = new Set<string>();

  for (const msg of messages) {
    existingIds.add(msg.id);
    if (msg.condenseId) {
      existingIds.add(msg.condenseId);
    }
  }

  // Find invalid pointers
  const invalidPointers: InvalidPointerInfo[] = [];

  for (const msg of messages) {
    if (msg.condenseParent !== undefined && !existingIds.has(msg.condenseParent)) {
      invalidPointers.push({
        messageId: msg.id,
        field: "condenseParent",
        pointsTo: msg.condenseParent,
      });
    }

    if (msg.truncationParent !== undefined && !existingIds.has(msg.truncationParent)) {
      invalidPointers.push({
        messageId: msg.id,
        field: "truncationParent",
        pointsTo: msg.truncationParent,
      });
    }
  }

  return {
    valid: invalidPointers.length === 0,
    invalidPointers,
  };
}

// ============================================================================
// Additional Utilities
// ============================================================================

/**
 * Check if a message has any parent pointers.
 *
 * @param message - The message to check
 * @returns True if the message has condenseParent or truncationParent
 */
export function hasParentPointers(message: ContextMessage): boolean {
  return message.condenseParent !== undefined || message.truncationParent !== undefined;
}

/**
 * Get all messages that point to a specific parent ID.
 *
 * @param messages - Array of context messages
 * @param parentId - The parent ID to search for
 * @returns Array of messages pointing to the parent ID
 *
 * @example
 * ```typescript
 * const children = getMessagesPointingTo(messages, 'summary-1');
 * console.log(`${children.length} messages reference summary-1`);
 * ```
 */
export function getMessagesPointingTo(
  messages: ContextMessage[],
  parentId: string
): ContextMessage[] {
  if (!Array.isArray(messages) || messages.length === 0) {
    return [];
  }

  return messages.filter(
    (msg) => msg.condenseParent === parentId || msg.truncationParent === parentId
  );
}

/**
 * Remove all parent pointers from messages (clean slate).
 *
 * Useful for resetting context state or preparing for export.
 *
 * @param messages - Array of context messages
 * @returns New array with all parent pointers removed
 */
export function removeAllParentPointers(messages: ContextMessage[]): ContextMessage[] {
  if (!Array.isArray(messages) || messages.length === 0) {
    return [];
  }

  return messages.map((msg) => {
    if (!hasParentPointers(msg)) {
      return msg;
    }

    const { condenseParent, truncationParent, ...rest } = msg;
    return rest as ContextMessage;
  });
}
