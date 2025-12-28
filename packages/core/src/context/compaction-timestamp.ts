/**
 * Compaction Timestamp Tracking Module
 *
 * Provides functionality for tracking when tool outputs were compacted/pruned.
 * Implements REQ-CMP-004 (Compaction Timestamp Tracking).
 *
 * Key features:
 * - Immutable operations (returns new objects, never mutates input)
 * - Human-readable age formatting
 * - Batch operations for efficiency
 * - Statistics for monitoring compaction behavior
 *
 * @module @vellum/core/context/compaction-timestamp
 */

import type { ContentBlock, ContextMessage, ToolResultBlock } from "./types.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Compaction status for a tool result block.
 */
export interface CompactionStatus {
  /** Whether the content was compacted */
  isCompacted: boolean;

  /** Timestamp when compacted (undefined if not compacted) */
  compactedAt?: number;

  /** Age of compaction in milliseconds (undefined if not compacted) */
  ageMs?: number;

  /** Human-readable age (e.g., "5 minutes ago") */
  ageFormatted?: string;
}

/**
 * Location of a compacted block in the message array.
 */
export interface CompactedBlockLocation {
  /** Index of the message in the array */
  messageIndex: number;

  /** Index of the block within the message content */
  blockIndex: number;

  /** Tool use ID for the result */
  toolId: string;

  /** Compaction status details */
  status: CompactionStatus;
}

/**
 * Statistics about compaction across messages.
 */
export interface CompactionStats {
  /** Total number of tool result blocks found */
  totalToolResults: number;

  /** Number of compacted tool results */
  compactedCount: number;

  /** Ratio of compacted to total (0-1) */
  compactionRate: number;

  /** Oldest compaction timestamp (undefined if none compacted) */
  oldestCompaction?: number;

  /** Newest compaction timestamp (undefined if none compacted) */
  newestCompaction?: number;

  /** Average age in milliseconds (undefined if none compacted) */
  averageAgeMs?: number;
}

// ============================================================================
// Time Formatting
// ============================================================================

/**
 * Time unit configuration for formatting.
 */
interface TimeUnit {
  readonly limit: number;
  readonly divisor: number;
  readonly singular: string;
  readonly plural: string;
}

/**
 * Time unit thresholds for formatting (ascending order by limit).
 */
const TIME_UNITS: readonly TimeUnit[] = [
  { limit: 60_000, divisor: 1000, singular: "second", plural: "seconds" },
  { limit: 3_600_000, divisor: 60_000, singular: "minute", plural: "minutes" },
  { limit: 86_400_000, divisor: 3_600_000, singular: "hour", plural: "hours" },
  { limit: Infinity, divisor: 86_400_000, singular: "day", plural: "days" },
] as const;

/**
 * Format a duration in milliseconds to a human-readable string.
 *
 * @param ms - Duration in milliseconds
 * @returns Human-readable string (e.g., "5 seconds ago", "2 hours ago")
 *
 * @example
 * ```ts
 * formatDuration(5000);    // "5 seconds ago"
 * formatDuration(120000);  // "2 minutes ago"
 * formatDuration(3600000); // "1 hour ago"
 * formatDuration(0);       // "just now"
 * ```
 */
export function formatDuration(ms: number): string {
  if (ms < 0) {
    return "in the future";
  }

  if (ms < 1000) {
    return "just now";
  }

  // Find the appropriate time unit
  for (const unit of TIME_UNITS) {
    if (ms < unit.limit) {
      const value = Math.floor(ms / unit.divisor);
      const label = value === 1 ? unit.singular : unit.plural;
      return `${value} ${label} ago`;
    }
  }

  // Fallback for very large durations (should use 'days')
  const days = Math.floor(ms / 86_400_000);
  return `${days} days ago`;
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Mark a tool result block as compacted.
 * Returns a new block (doesn't mutate the original).
 *
 * @param block - Tool result block to mark
 * @param timestamp - Timestamp to set (default: Date.now())
 * @returns New block with compactedAt set
 *
 * @example
 * ```ts
 * const compactedBlock = markAsCompacted(originalBlock);
 * console.log(compactedBlock.compactedAt); // Current timestamp
 *
 * // With custom timestamp
 * const block = markAsCompacted(originalBlock, 1703750400000);
 * ```
 */
export function markAsCompacted(
  block: ToolResultBlock,
  timestamp: number = Date.now()
): ToolResultBlock {
  return {
    ...block,
    compactedAt: timestamp,
  };
}

/**
 * Check if a tool result block has been compacted.
 *
 * @param block - Tool result block to check
 * @returns true if the block has a compactedAt timestamp
 *
 * @example
 * ```ts
 * if (isCompacted(block)) {
 *   console.log(`Compacted at: ${block.compactedAt}`);
 * }
 * ```
 */
export function isCompacted(block: ToolResultBlock): boolean {
  return block.compactedAt !== undefined;
}

/**
 * Get the compaction age in milliseconds.
 *
 * @param block - Tool result block to check
 * @returns Age in milliseconds, or undefined if not compacted
 *
 * @example
 * ```ts
 * const age = getCompactionAge(block);
 * if (age !== undefined && age > 300000) {
 *   console.log('Compacted more than 5 minutes ago');
 * }
 * ```
 */
export function getCompactionAge(block: ToolResultBlock): number | undefined {
  if (block.compactedAt === undefined) {
    return undefined;
  }

  return Date.now() - block.compactedAt;
}

/**
 * Get detailed compaction status for a tool result block.
 *
 * @param block - Tool result block to analyze
 * @returns Compaction status with age information
 *
 * @example
 * ```ts
 * const status = getCompactionStatus(block);
 * if (status.isCompacted) {
 *   console.log(`Compacted ${status.ageFormatted}`);
 * }
 * ```
 */
export function getCompactionStatus(block: ToolResultBlock): CompactionStatus {
  if (block.compactedAt === undefined) {
    return {
      isCompacted: false,
    };
  }

  const ageMs = Date.now() - block.compactedAt;

  return {
    isCompacted: true,
    compactedAt: block.compactedAt,
    ageMs,
    ageFormatted: formatDuration(ageMs),
  };
}

/**
 * Clear compaction timestamp from a block.
 * Used for rollback/restore scenarios.
 *
 * @param block - Tool result block to clear
 * @returns New block without compactedAt
 *
 * @example
 * ```ts
 * // Restore original state for rollback
 * const restoredBlock = clearCompactionTimestamp(compactedBlock);
 * console.log(restoredBlock.compactedAt); // undefined
 * ```
 */
export function clearCompactionTimestamp(block: ToolResultBlock): ToolResultBlock {
  // Destructure to exclude compactedAt
  const { compactedAt: _, ...rest } = block;
  return rest as ToolResultBlock;
}

// ============================================================================
// Message Array Operations
// ============================================================================

/**
 * Check if a content block is a tool result block.
 *
 * @param block - Content block to check
 * @returns Type predicate for ToolResultBlock
 */
function isToolResultBlock(block: ContentBlock): block is ToolResultBlock {
  return block.type === "tool_result";
}

/**
 * Find all compacted tool results in messages.
 *
 * @param messages - Array of context messages to search
 * @returns Array of compacted block locations with status
 *
 * @example
 * ```ts
 * const compacted = findCompactedBlocks(messages);
 * for (const loc of compacted) {
 *   console.log(`Tool ${loc.toolId} compacted ${loc.status.ageFormatted}`);
 * }
 * ```
 */
export function findCompactedBlocks(messages: readonly ContextMessage[]): CompactedBlockLocation[] {
  const results: CompactedBlockLocation[] = [];

  for (let messageIndex = 0; messageIndex < messages.length; messageIndex++) {
    const message = messages[messageIndex]!;
    const content = message.content;

    // Skip string content
    if (typeof content === "string") {
      continue;
    }

    for (let blockIndex = 0; blockIndex < content.length; blockIndex++) {
      const block = content[blockIndex]!;

      if (isToolResultBlock(block) && isCompacted(block)) {
        results.push({
          messageIndex,
          blockIndex,
          toolId: block.tool_use_id,
          status: getCompactionStatus(block),
        });
      }
    }
  }

  return results;
}

/**
 * Get compaction statistics for messages.
 *
 * @param messages - Array of context messages to analyze
 * @returns Statistics about compaction
 *
 * @example
 * ```ts
 * const stats = getCompactionStats(messages);
 * console.log(`Compaction rate: ${(stats.compactionRate * 100).toFixed(1)}%`);
 * if (stats.averageAgeMs) {
 *   console.log(`Average age: ${formatDuration(stats.averageAgeMs)}`);
 * }
 * ```
 */
export function getCompactionStats(messages: readonly ContextMessage[]): CompactionStats {
  let totalToolResults = 0;
  let compactedCount = 0;
  let oldestCompaction: number | undefined;
  let newestCompaction: number | undefined;
  let totalAgeMs = 0;

  const now = Date.now();

  for (const message of messages) {
    const content = message.content;

    // Skip string content
    if (typeof content === "string") {
      continue;
    }

    for (const block of content) {
      if (!isToolResultBlock(block)) {
        continue;
      }

      totalToolResults++;

      if (block.compactedAt !== undefined) {
        compactedCount++;

        // Track oldest/newest
        if (oldestCompaction === undefined || block.compactedAt < oldestCompaction) {
          oldestCompaction = block.compactedAt;
        }
        if (newestCompaction === undefined || block.compactedAt > newestCompaction) {
          newestCompaction = block.compactedAt;
        }

        // Accumulate age
        totalAgeMs += now - block.compactedAt;
      }
    }
  }

  const compactionRate = totalToolResults > 0 ? compactedCount / totalToolResults : 0;
  const averageAgeMs = compactedCount > 0 ? totalAgeMs / compactedCount : undefined;

  return {
    totalToolResults,
    compactedCount,
    compactionRate,
    oldestCompaction,
    newestCompaction,
    averageAgeMs,
  };
}

// ============================================================================
// Batch Operations
// ============================================================================

/**
 * Deep clone a message for immutable operations.
 *
 * @param message - The message to clone
 * @returns A deep copy of the message
 */
function cloneMessage(message: ContextMessage): ContextMessage {
  const content = message.content;
  let clonedContent: string | ContentBlock[];

  if (typeof content === "string") {
    clonedContent = content;
  } else {
    // Deep clone content blocks
    clonedContent = content.map((block) => ({ ...block })) as ContentBlock[];
  }

  // Clone metadata if present
  const clonedMetadata = message.metadata ? { ...message.metadata } : undefined;

  return {
    ...message,
    content: clonedContent,
    metadata: clonedMetadata,
  };
}

/**
 * Batch mark multiple blocks as compacted.
 * Returns a new messages array with updated blocks.
 *
 * @param messages - Original messages array
 * @param blockLocations - Array of block locations to mark
 * @param timestamp - Timestamp to use (default: Date.now())
 * @returns New messages array with marked blocks
 *
 * @example
 * ```ts
 * const locations = [
 *   { messageIndex: 2, blockIndex: 0 },
 *   { messageIndex: 5, blockIndex: 1 },
 * ];
 * const updated = markBlocksAsCompacted(messages, locations);
 * ```
 */
export function markBlocksAsCompacted(
  messages: readonly ContextMessage[],
  blockLocations: ReadonlyArray<{ messageIndex: number; blockIndex: number }>,
  timestamp: number = Date.now()
): ContextMessage[] {
  // Early return if no locations to mark
  if (blockLocations.length === 0) {
    return [...messages];
  }

  // Create a set of message indices that need cloning
  const messageIndicesToClone = new Set(blockLocations.map((loc) => loc.messageIndex));

  // Create a map of messageIndex -> blockIndices to mark
  const blocksByMessage = new Map<number, Set<number>>();
  for (const loc of blockLocations) {
    const existing = blocksByMessage.get(loc.messageIndex);
    if (existing) {
      existing.add(loc.blockIndex);
    } else {
      blocksByMessage.set(loc.messageIndex, new Set([loc.blockIndex]));
    }
  }

  // Create new messages array
  const result: ContextMessage[] = [];

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i]!;

    if (!messageIndicesToClone.has(i)) {
      // No changes needed for this message
      result.push(message);
      continue;
    }

    const blocksToMark = blocksByMessage.get(i);

    // Clone the message
    const clonedMessage = cloneMessage(message);

    // Mark the specified blocks
    if (blocksToMark && typeof clonedMessage.content !== "string") {
      const content = clonedMessage.content as ContentBlock[];

      for (const blockIndex of Array.from(blocksToMark)) {
        if (blockIndex >= 0 && blockIndex < content.length) {
          const block = content[blockIndex]!;

          if (isToolResultBlock(block)) {
            content[blockIndex] = markAsCompacted(block, timestamp);
          }
        }
      }
    }

    result.push(clonedMessage);
  }

  return result;
}

/**
 * Batch clear compaction timestamps from multiple blocks.
 * Returns a new messages array with cleared blocks.
 *
 * @param messages - Original messages array
 * @param blockLocations - Array of block locations to clear
 * @returns New messages array with cleared timestamps
 *
 * @example
 * ```ts
 * // Clear all compacted blocks for rollback
 * const compacted = findCompactedBlocks(messages);
 * const locations = compacted.map(c => ({
 *   messageIndex: c.messageIndex,
 *   blockIndex: c.blockIndex
 * }));
 * const restored = clearBlocksCompaction(messages, locations);
 * ```
 */
export function clearBlocksCompaction(
  messages: readonly ContextMessage[],
  blockLocations: ReadonlyArray<{ messageIndex: number; blockIndex: number }>
): ContextMessage[] {
  // Early return if no locations to clear
  if (blockLocations.length === 0) {
    return [...messages];
  }

  // Create a set of message indices that need cloning
  const messageIndicesToClone = new Set(blockLocations.map((loc) => loc.messageIndex));

  // Create a map of messageIndex -> blockIndices to clear
  const blocksByMessage = new Map<number, Set<number>>();
  for (const loc of blockLocations) {
    const existing = blocksByMessage.get(loc.messageIndex);
    if (existing) {
      existing.add(loc.blockIndex);
    } else {
      blocksByMessage.set(loc.messageIndex, new Set([loc.blockIndex]));
    }
  }

  // Create new messages array
  const result: ContextMessage[] = [];

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i]!;

    if (!messageIndicesToClone.has(i)) {
      result.push(message);
      continue;
    }

    const blocksToClear = blocksByMessage.get(i);

    // Clone the message
    const clonedMessage = cloneMessage(message);

    // Clear the specified blocks
    if (blocksToClear && typeof clonedMessage.content !== "string") {
      const content = clonedMessage.content as ContentBlock[];

      for (const blockIndex of Array.from(blocksToClear)) {
        if (blockIndex >= 0 && blockIndex < content.length) {
          const block = content[blockIndex]!;

          if (isToolResultBlock(block)) {
            content[blockIndex] = clearCompactionTimestamp(block);
          }
        }
      }
    }

    result.push(clonedMessage);
  }

  return result;
}
