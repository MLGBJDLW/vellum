/**
 * Tool Block Repair Module
 *
 * Fixes mismatched tool blocks in message history (REQ-TBR-001).
 * Handles:
 * - tool_result appearing before tool_use → reorder
 * - Orphaned tool_use (no result) → log warning, optionally remove
 * - Orphaned tool_result (no use) → add placeholder tool_use
 *
 * All operations are non-destructive (return new arrays).
 *
 * @module @vellum/core/context/tool-block-repair
 */

import { analyzeToolPairs, type ToolPairAnalysis } from "./tool-pairing.js";
import type { ContextMessage, ToolUseBlock } from "./types.js";
import { MessagePriority } from "./types.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Repair result with details about changes made.
 */
export interface RepairResult {
  /** Repaired messages (new array) */
  readonly messages: ContextMessage[];

  /** Whether any repairs were made */
  readonly repaired: boolean;

  /** Details about repairs */
  readonly repairs: RepairAction[];

  /** Warnings about unfixable issues */
  readonly warnings: string[];
}

/**
 * Individual repair action taken.
 */
export interface RepairAction {
  /** Type of repair performed */
  readonly type: "reorder" | "remove_orphan_use" | "remove_orphan_result" | "add_placeholder";

  /** Tool ID involved */
  readonly toolId: string;

  /** Human-readable description */
  readonly description: string;
}

/**
 * Validation error for tool block pairing.
 */
export interface ValidationError {
  /** Type of validation error */
  readonly type: "mismatched" | "orphan_use" | "orphan_result" | "wrong_order";

  /** Tool ID involved */
  readonly toolId: string;

  /** Human-readable error message */
  readonly message: string;

  /** Message index where issue was found */
  readonly messageIndex?: number;
}

/**
 * Options for repair behavior.
 */
export interface RepairOptions {
  /** Remove orphaned tool_use blocks (default: false) */
  removeOrphanedUses?: boolean;

  /** Add placeholder tool_use for orphaned results (default: true) */
  addPlaceholderUses?: boolean;

  /** Log repairs to console (default: false) */
  verbose?: boolean;
}

/**
 * Tool block health summary.
 */
export interface ToolBlockHealthSummary {
  /** Total number of tool pairs found */
  readonly totalPairs: number;

  /** Number of complete pairs (use + result) */
  readonly completePairs: number;

  /** Number of orphaned tool_use blocks */
  readonly orphanedUses: number;

  /** Number of orphaned tool_result blocks */
  readonly orphanedResults: number;

  /** Number of ordering issues (result before use) */
  readonly orderIssues: number;
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Generate unique ID for placeholder messages.
 */
function generatePlaceholderId(): string {
  return `placeholder-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Log repair action if verbose mode is enabled.
 */
function logRepair(action: RepairAction, verbose: boolean): void {
  if (verbose) {
    console.log(`[tool-block-repair] ${action.type}: ${action.description}`);
  }
}

/**
 * Log warning if verbose mode is enabled.
 */
function logWarning(warning: string, verbose: boolean): void {
  if (verbose) {
    console.warn(`[tool-block-repair] Warning: ${warning}`);
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Fix mismatched tool blocks in message history.
 *
 * Repairs:
 * 1. tool_result appearing before tool_use → reorder
 * 2. Orphaned tool_use (no result) → log warning, optionally remove
 * 3. Orphaned tool_result (no use) → append placeholder use at start
 *
 * @param messages - Messages to repair
 * @param options - Repair options
 * @returns Repaired messages with action log
 *
 * @example
 * ```typescript
 * const result = fixMismatchedToolBlocks(messages, { verbose: true });
 * if (result.repaired) {
 *   console.log(`Made ${result.repairs.length} repairs`);
 * }
 * ```
 */
export function fixMismatchedToolBlocks(
  messages: ContextMessage[],
  options: RepairOptions = {}
): RepairResult {
  const { removeOrphanedUses = false, addPlaceholderUses = true, verbose = false } = options;

  // Handle empty input
  if (messages.length === 0) {
    return {
      messages: [],
      repaired: false,
      repairs: [],
      warnings: [],
    };
  }

  // Clone messages to avoid mutation
  let repairedMessages = messages.map((m) => ({ ...m }));
  const repairs: RepairAction[] = [];
  const warnings: string[] = [];

  // Analyze current state
  let analysis = analyzeToolPairs(repairedMessages);

  // 1. Fix ordering issues (tool_result before tool_use)
  for (const pair of analysis.pairs) {
    if (pair.resultMessageIndex < pair.useMessageIndex) {
      // Result appears before use - reorder
      repairedMessages = reorderToolResult(
        repairedMessages,
        pair.resultMessageIndex,
        pair.useMessageIndex
      );

      const action: RepairAction = {
        type: "reorder",
        toolId: pair.toolId,
        description: `Reordered tool_result for '${pair.toolName}' (${pair.toolId}) to appear after tool_use`,
      };
      repairs.push(action);
      logRepair(action, verbose);

      // Re-analyze after reorder (indices may have changed)
      analysis = analyzeToolPairs(repairedMessages);
    }
  }

  // 2. Handle orphaned tool_use blocks (no matching result)
  for (const orphan of analysis.orphanedUses) {
    if (removeOrphanedUses) {
      // Remove the orphaned tool_use
      repairedMessages = repairedMessages.filter((_, idx) => idx !== orphan.messageIndex);

      const action: RepairAction = {
        type: "remove_orphan_use",
        toolId: orphan.toolId,
        description: `Removed orphaned tool_use (${orphan.toolId}) with no matching result`,
      };
      repairs.push(action);
      logRepair(action, verbose);

      // Re-analyze after removal
      analysis = analyzeToolPairs(repairedMessages);
    } else {
      // Just log warning
      const warning = `Orphaned tool_use (${orphan.toolId}) at index ${orphan.messageIndex} has no matching result`;
      warnings.push(warning);
      logWarning(warning, verbose);
    }
  }

  // 3. Handle orphaned tool_result blocks (no matching use)
  // Re-analyze to get current orphaned results
  analysis = analyzeToolPairs(repairedMessages);

  for (const orphan of analysis.orphanedResults) {
    if (addPlaceholderUses) {
      // Create placeholder tool_use and insert before the orphaned result
      const placeholder = createPlaceholderToolUse(orphan.toolId, "unknown_tool");

      // Insert placeholder before the orphaned result
      const insertIndex = orphan.messageIndex;
      repairedMessages = [
        ...repairedMessages.slice(0, insertIndex),
        placeholder,
        ...repairedMessages.slice(insertIndex),
      ];

      const action: RepairAction = {
        type: "add_placeholder",
        toolId: orphan.toolId,
        description: `Added placeholder tool_use for orphaned result (${orphan.toolId})`,
      };
      repairs.push(action);
      logRepair(action, verbose);

      // Re-analyze after insertion (indices shifted)
      analysis = analyzeToolPairs(repairedMessages);
    } else {
      // Just log warning
      const warning = `Orphaned tool_result (${orphan.toolId}) at index ${orphan.messageIndex} has no matching use`;
      warnings.push(warning);
      logWarning(warning, verbose);
    }
  }

  return {
    messages: repairedMessages,
    repaired: repairs.length > 0,
    repairs,
    warnings,
  };
}

/**
 * Validate tool block pairing in messages.
 * Returns errors without modifying anything.
 *
 * @param messages - Messages to validate
 * @returns Array of validation errors
 *
 * @example
 * ```typescript
 * const errors = validateToolBlockPairing(messages);
 * if (errors.length > 0) {
 *   console.log('Found issues:', errors);
 * }
 * ```
 */
export function validateToolBlockPairing(messages: ContextMessage[]): ValidationError[] {
  const errors: ValidationError[] = [];

  // Handle empty input
  if (messages.length === 0) {
    return errors;
  }

  const analysis = analyzeToolPairs(messages);

  // Check for ordering issues
  for (const pair of analysis.pairs) {
    if (pair.resultMessageIndex < pair.useMessageIndex) {
      errors.push({
        type: "wrong_order",
        toolId: pair.toolId,
        message: `tool_result for '${pair.toolName}' appears at index ${pair.resultMessageIndex} before tool_use at index ${pair.useMessageIndex}`,
        messageIndex: pair.resultMessageIndex,
      });
    }
  }

  // Check for orphaned tool_use blocks
  for (const orphan of analysis.orphanedUses) {
    errors.push({
      type: "orphan_use",
      toolId: orphan.toolId,
      message: `tool_use (${orphan.toolId}) at index ${orphan.messageIndex} has no matching tool_result`,
      messageIndex: orphan.messageIndex,
    });
  }

  // Check for orphaned tool_result blocks
  for (const orphan of analysis.orphanedResults) {
    errors.push({
      type: "orphan_result",
      toolId: orphan.toolId,
      message: `tool_result (${orphan.toolId}) at index ${orphan.messageIndex} has no matching tool_use`,
      messageIndex: orphan.messageIndex,
    });
  }

  return errors;
}

/**
 * Check if messages have any tool block issues.
 *
 * @param messages - Messages to check
 * @returns true if any issues exist
 *
 * @example
 * ```typescript
 * if (hasToolBlockIssues(messages)) {
 *   const result = fixMismatchedToolBlocks(messages);
 * }
 * ```
 */
export function hasToolBlockIssues(messages: ContextMessage[]): boolean {
  return validateToolBlockPairing(messages).length > 0;
}

/**
 * Reorder a tool_result to appear after its tool_use.
 * Returns new messages array.
 *
 * @param messages - Original messages
 * @param resultIndex - Current index of tool_result message
 * @param useIndex - Index of corresponding tool_use message
 * @returns New messages array with corrected order
 *
 * @example
 * ```typescript
 * // If result is at index 2 and use is at index 5
 * const fixed = reorderToolResult(messages, 2, 5);
 * // Result is now after use (at index 5, use stays at 5)
 * ```
 */
export function reorderToolResult(
  messages: ContextMessage[],
  resultIndex: number,
  useIndex: number
): ContextMessage[] {
  // Validate indices
  if (
    resultIndex < 0 ||
    resultIndex >= messages.length ||
    useIndex < 0 ||
    useIndex >= messages.length
  ) {
    return [...messages];
  }

  // If result is already after use, no reorder needed
  if (resultIndex > useIndex) {
    return [...messages];
  }

  // Remove result from current position and insert after use
  const result: ContextMessage[] = [];
  const resultMessage = messages[resultIndex];

  for (let i = 0; i < messages.length; i++) {
    if (i === resultIndex) {
      // Skip result at original position
      continue;
    }

    const msg = messages[i];
    if (msg) result.push(msg);

    // Insert result after use (accounting for removed element)
    // Since we skipped resultIndex, useIndex in new array is useIndex - 1 if resultIndex < useIndex
    const adjustedUseIndex = resultIndex < useIndex ? useIndex - 1 : useIndex;
    if (result.length - 1 === adjustedUseIndex && resultMessage) {
      result.push(resultMessage);
    }
  }

  return result;
}

/**
 * Create a placeholder tool_use block for an orphaned result.
 *
 * @param toolId - The tool_use_id from the orphaned result
 * @param toolName - Optional tool name (default: 'unknown_tool')
 * @returns A new ContextMessage containing the placeholder tool_use
 *
 * @example
 * ```typescript
 * const placeholder = createPlaceholderToolUse('tool-123', 'read_file');
 * ```
 */
export function createPlaceholderToolUse(
  toolId: string,
  toolName: string = "unknown_tool"
): ContextMessage {
  const toolUseBlock: ToolUseBlock = {
    type: "tool_use",
    id: toolId,
    name: toolName,
    input: {},
  };

  return {
    id: generatePlaceholderId(),
    role: "assistant",
    content: [
      {
        type: "text",
        text: `[Placeholder: Original tool invocation was lost or truncated]`,
      },
      toolUseBlock,
    ],
    priority: MessagePriority.TOOL_PAIR,
  };
}

/**
 * Get summary of tool block health.
 *
 * @param messages - Messages to analyze
 * @returns Health summary with counts
 *
 * @example
 * ```typescript
 * const health = getToolBlockHealthSummary(messages);
 * console.log(`Complete pairs: ${health.completePairs}/${health.totalPairs}`);
 * ```
 */
export function getToolBlockHealthSummary(messages: ContextMessage[]): ToolBlockHealthSummary {
  // Handle empty input
  if (messages.length === 0) {
    return {
      totalPairs: 0,
      completePairs: 0,
      orphanedUses: 0,
      orphanedResults: 0,
      orderIssues: 0,
    };
  }

  const analysis = analyzeToolPairs(messages);

  // Count order issues
  let orderIssues = 0;
  for (const pair of analysis.pairs) {
    if (pair.resultMessageIndex < pair.useMessageIndex) {
      orderIssues++;
    }
  }

  // Total pairs = complete pairs + orphaned uses + orphaned results
  const totalPairs =
    analysis.pairs.length + analysis.orphanedUses.length + analysis.orphanedResults.length;

  return {
    totalPairs,
    completePairs: analysis.pairs.length,
    orphanedUses: analysis.orphanedUses.length,
    orphanedResults: analysis.orphanedResults.length,
    orderIssues,
  };
}

// Re-export ToolPairAnalysis for convenience
export type { ToolPairAnalysis };
