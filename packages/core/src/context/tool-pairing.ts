/**
 * Tool Pairing Analyzer
 *
 * Identifies and analyzes tool_use/tool_result message pairs in context.
 * Tool pairs MUST be kept together during truncation (REQ-WIN-002).
 *
 * Key behaviors:
 * - O(n) analysis with Map for ID lookups
 * - Handles messages with multiple tool blocks
 * - Handles nested content arrays in tool_result
 * - Tracks orphaned tool_use blocks (no matching result)
 * - Tracks orphaned tool_result blocks (no matching use)
 *
 * @module @vellum/core/context/tool-pairing
 */

import type { ContentBlock, ContextMessage, ToolResultBlock, ToolUseBlock } from "./types.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Represents a paired tool_use and tool_result.
 */
export interface ToolPair {
  /** Tool invocation ID (matches both blocks) */
  readonly toolId: string;

  /** Index of message containing tool_use block */
  readonly useMessageIndex: number;

  /** Index of tool_use block within the message content */
  readonly useBlockIndex: number;

  /** Index of message containing tool_result block */
  readonly resultMessageIndex: number;

  /** Index of tool_result block within the message content */
  readonly resultBlockIndex: number;

  /** Tool name from tool_use block */
  readonly toolName: string;

  /** Whether both parts exist */
  readonly isComplete: boolean;
}

/**
 * Information about an orphaned tool block.
 */
export interface OrphanedBlock {
  /** Index of the message containing the orphaned block */
  readonly messageIndex: number;
  /** Index of the block within the message content */
  readonly blockIndex: number;
  /** Tool ID that was not matched */
  readonly toolId: string;
}

/**
 * Result of tool pair analysis.
 */
export interface ToolPairAnalysis {
  /** All complete tool pairs found */
  readonly pairs: ToolPair[];

  /** Orphaned tool_use blocks (no matching result) */
  readonly orphanedUses: OrphanedBlock[];

  /** Orphaned tool_result blocks (no matching use) */
  readonly orphanedResults: OrphanedBlock[];

  /** Set of message indices involved in any tool pair */
  readonly pairedMessageIndices: Set<number>;
}

// ============================================================================
// Internal Types
// ============================================================================

/**
 * Internal tracking for tool_use blocks during analysis.
 */
interface ToolUseInfo {
  readonly messageIndex: number;
  readonly blockIndex: number;
  readonly toolName: string;
  matched: boolean;
}

/**
 * Internal tracking for tool_result blocks during analysis.
 */
interface ToolResultInfo {
  readonly messageIndex: number;
  readonly blockIndex: number;
  matched: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Type guard for ToolUseBlock.
 */
function isToolUseBlock(block: ContentBlock): block is ToolUseBlock {
  return block.type === "tool_use";
}

/**
 * Type guard for ToolResultBlock.
 */
function isToolResultBlock(block: ContentBlock): block is ToolResultBlock {
  return block.type === "tool_result";
}

/**
 * Extract content blocks from message content.
 * Handles both string content (returns empty array) and block array content.
 */
function getContentBlocks(content: string | ContentBlock[]): ContentBlock[] {
  if (typeof content === "string") {
    return [];
  }
  return content;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Extract tool_use blocks from a message.
 *
 * @param message - The context message to extract from
 * @returns Array of ToolUseBlock found in the message
 *
 * @example
 * ```typescript
 * const message: ContextMessage = {
 *   id: '1',
 *   role: 'assistant',
 *   content: [
 *     { type: 'text', text: 'Reading file...' },
 *     { type: 'tool_use', id: 'tool-1', name: 'read_file', input: { path: 'file.ts' } },
 *   ],
 *   priority: MessagePriority.TOOL_PAIR,
 * };
 * const uses = extractToolUseBlocks(message);
 * // uses[0].id === 'tool-1'
 * ```
 */
export function extractToolUseBlocks(message: ContextMessage): ToolUseBlock[] {
  const blocks = getContentBlocks(message.content);
  return blocks.filter(isToolUseBlock);
}

/**
 * Extract tool_result blocks from a message.
 *
 * @param message - The context message to extract from
 * @returns Array of ToolResultBlock found in the message
 *
 * @example
 * ```typescript
 * const message: ContextMessage = {
 *   id: '2',
 *   role: 'user',
 *   content: [
 *     { type: 'tool_result', tool_use_id: 'tool-1', content: 'file contents...' },
 *   ],
 *   priority: MessagePriority.TOOL_PAIR,
 * };
 * const results = extractToolResultBlocks(message);
 * // results[0].tool_use_id === 'tool-1'
 * ```
 */
export function extractToolResultBlocks(message: ContextMessage): ToolResultBlock[] {
  const blocks = getContentBlocks(message.content);
  return blocks.filter(isToolResultBlock);
}

/**
 * Check if content array contains tool blocks (tool_use or tool_result).
 *
 * @param content - The message content to check
 * @returns true if content contains any tool blocks
 *
 * @example
 * ```typescript
 * hasToolBlocks('Hello world'); // false
 * hasToolBlocks([{ type: 'text', text: 'Hello' }]); // false
 * hasToolBlocks([{ type: 'tool_use', id: 'x', name: 'test', input: {} }]); // true
 * ```
 */
export function hasToolBlocks(content: string | ContentBlock[]): boolean {
  const blocks = getContentBlocks(content);
  return blocks.some((block) => block.type === "tool_use" || block.type === "tool_result");
}

/**
 * Analyze messages for tool_use/tool_result pairs.
 *
 * Tool pairs MUST be kept together during truncation (REQ-WIN-002).
 * This function performs O(n) analysis using Map for ID lookups.
 *
 * @param messages - Array of context messages to analyze
 * @returns Analysis with pairs, orphans, and paired message indices
 *
 * @example
 * ```typescript
 * const messages = [
 *   {
 *     id: '1',
 *     role: 'assistant',
 *     content: [{ type: 'tool_use', id: 'xyz', name: 'read_file', input: {} }],
 *     priority: MessagePriority.TOOL_PAIR,
 *   },
 *   {
 *     id: '2',
 *     role: 'user',
 *     content: [{ type: 'tool_result', tool_use_id: 'xyz', content: '...' }],
 *     priority: MessagePriority.TOOL_PAIR,
 *   },
 * ];
 * const analysis = analyzeToolPairs(messages);
 * // analysis.pairs[0].toolId === 'xyz'
 * // analysis.pairs[0].useMessageIndex === 0
 * // analysis.pairs[0].resultMessageIndex === 1
 * // analysis.pairedMessageIndices.has(0) === true
 * // analysis.pairedMessageIndices.has(1) === true
 * ```
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Tool pairing requires comprehensive block analysis
export function analyzeToolPairs(messages: ContextMessage[]): ToolPairAnalysis {
  // Map from toolId to tool_use info
  const useMap = new Map<string, ToolUseInfo>();

  // Map from toolId to tool_result info
  const resultMap = new Map<string, ToolResultInfo>();

  // First pass: collect all tool_use and tool_result blocks
  for (let msgIndex = 0; msgIndex < messages.length; msgIndex++) {
    const message = messages[msgIndex];
    if (!message) continue;
    const blocks = getContentBlocks(message.content);

    for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
      const block = blocks[blockIndex];
      if (!block) continue;

      if (isToolUseBlock(block)) {
        useMap.set(block.id, {
          messageIndex: msgIndex,
          blockIndex,
          toolName: block.name,
          matched: false,
        });
      } else if (isToolResultBlock(block)) {
        resultMap.set(block.tool_use_id, {
          messageIndex: msgIndex,
          blockIndex,
          matched: false,
        });
      }
    }
  }

  // Second pass: match pairs
  const pairs: ToolPair[] = [];
  const pairedMessageIndices = new Set<number>();

  for (const [toolId, useInfo] of useMap) {
    const resultInfo = resultMap.get(toolId);

    if (resultInfo) {
      // Found matching pair
      useInfo.matched = true;
      resultInfo.matched = true;

      pairs.push({
        toolId,
        useMessageIndex: useInfo.messageIndex,
        useBlockIndex: useInfo.blockIndex,
        resultMessageIndex: resultInfo.messageIndex,
        resultBlockIndex: resultInfo.blockIndex,
        toolName: useInfo.toolName,
        isComplete: true,
      });

      pairedMessageIndices.add(useInfo.messageIndex);
      pairedMessageIndices.add(resultInfo.messageIndex);
    }
  }

  // Collect orphaned blocks
  const orphanedUses: OrphanedBlock[] = [];
  const orphanedResults: OrphanedBlock[] = [];

  for (const [toolId, useInfo] of useMap) {
    if (!useInfo.matched) {
      orphanedUses.push({
        messageIndex: useInfo.messageIndex,
        blockIndex: useInfo.blockIndex,
        toolId,
      });
    }
  }

  for (const [toolId, resultInfo] of resultMap) {
    if (!resultInfo.matched) {
      orphanedResults.push({
        messageIndex: resultInfo.messageIndex,
        blockIndex: resultInfo.blockIndex,
        toolId,
      });
    }
  }

  return {
    pairs,
    orphanedUses,
    orphanedResults,
    pairedMessageIndices,
  };
}

/**
 * Check if two message indices are in the same tool pair.
 *
 * @param analysis - The tool pair analysis result
 * @param index1 - First message index
 * @param index2 - Second message index
 * @returns true if both indices are part of the same tool pair
 *
 * @example
 * ```typescript
 * const analysis = analyzeToolPairs(messages);
 * // If message 0 has tool_use and message 1 has its tool_result:
 * areInSameToolPair(analysis, 0, 1); // true
 * areInSameToolPair(analysis, 0, 2); // false
 * ```
 */
export function areInSameToolPair(
  analysis: ToolPairAnalysis,
  index1: number,
  index2: number
): boolean {
  return analysis.pairs.some(
    (pair) =>
      (pair.useMessageIndex === index1 && pair.resultMessageIndex === index2) ||
      (pair.useMessageIndex === index2 && pair.resultMessageIndex === index1)
  );
}

/**
 * Get all message indices that must be kept together with a given index
 * (due to tool pairing).
 *
 * If the message at the given index is part of one or more tool pairs,
 * this returns all linked indices (including the input index).
 *
 * @param analysis - The tool pair analysis result
 * @param messageIndex - The message index to check
 * @returns Array of all message indices linked via tool pairs (includes input index if linked)
 *
 * @example
 * ```typescript
 * const analysis = analyzeToolPairs(messages);
 * // If message 2 has tool_use and message 3 has its tool_result:
 * getLinkedIndices(analysis, 2); // [2, 3]
 * getLinkedIndices(analysis, 3); // [2, 3]
 * getLinkedIndices(analysis, 0); // [] (not in any pair)
 * ```
 */
export function getLinkedIndices(analysis: ToolPairAnalysis, messageIndex: number): number[] {
  const linkedSet = new Set<number>();

  for (const pair of analysis.pairs) {
    if (pair.useMessageIndex === messageIndex || pair.resultMessageIndex === messageIndex) {
      linkedSet.add(pair.useMessageIndex);
      linkedSet.add(pair.resultMessageIndex);
    }
  }

  // Return sorted for consistent ordering
  return Array.from(linkedSet).sort((a, b) => a - b);
}
