/**
 * Tool Output Trimming Module
 *
 * Provides functionality for pruning large tool outputs to reduce token usage.
 * Implements REQ-PRM-001 (Back-to-Front Tool Output Pruning) and
 * REQ-PRM-002 (Protected Tools Configuration).
 *
 * Key features:
 * - Immutable operations (returns new arrays, never mutates input)
 * - Protected tools are never pruned (skill, memory_search, code_review)
 * - Truncation marker indicates content was trimmed
 * - Optional compactedAt timestamp tracking
 *
 * @module @vellum/core/context/tool-trimming
 */

import type { ContentBlock, ContextMessage, ToolResultBlock, ToolUseBlock } from "./types.js";

// ============================================================================
// Constants
// ============================================================================

/** Default maximum characters per tool output */
export const DEFAULT_MAX_OUTPUT_CHARS = 10_000;

/** Default truncation marker appended to trimmed content */
export const DEFAULT_TRUNCATION_MARKER = "\n\n[... truncated]";

/** Minimum total tokens before pruning is considered (from REQ-PRM-001) */
export const PRUNE_MINIMUM_TOKENS = 20_000;

/** Token count to protect from pruning (most recent messages) */
export const PRUNE_PROTECT_TOKENS = 40_000;

/**
 * Default protected tools that should never be pruned.
 * These tools provide critical context that must be preserved.
 */
export const DEFAULT_PROTECTED_TOOLS = ["skill", "memory_search", "code_review"] as const;

// ============================================================================
// Types
// ============================================================================

/**
 * Options for tool output pruning.
 */
export interface PruneOptions {
  /** Maximum characters per tool output (default: 10000) */
  maxOutputChars?: number;

  /** Tools that should never be pruned */
  protectedTools?: readonly string[];

  /** Custom marker for truncated content (default: "\n\n[... truncated]") */
  truncationMarker?: string;

  /** Whether to track compaction timestamp */
  trackCompaction?: boolean;
}

/**
 * Result of pruning operation.
 */
export interface PruneResult {
  /** Messages after pruning (new array, originals unchanged) */
  messages: ContextMessage[];

  /** Number of tool outputs that were trimmed */
  trimmedCount: number;

  /** Total characters removed */
  charsRemoved: number;

  /** Estimated tokens saved (chars / 4 approximation) */
  tokensSaved: number;

  /** Names of tools that were trimmed */
  trimmedTools: string[];
}

/**
 * Result of trimming a single tool result block.
 */
export interface TrimBlockResult {
  /** The trimmed block (new object, original unchanged) */
  block: ToolResultBlock;

  /** Whether the block was actually trimmed */
  trimmed: boolean;

  /** Number of characters removed */
  charsRemoved: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a tool result should be protected from pruning.
 *
 * @param toolName - The name of the tool
 * @param protectedTools - List of protected tool names
 * @returns true if the tool should be protected
 *
 * @example
 * ```ts
 * isProtectedTool('skill', DEFAULT_PROTECTED_TOOLS); // true
 * isProtectedTool('read_file', DEFAULT_PROTECTED_TOOLS); // false
 * ```
 */
export function isProtectedTool(toolName: string, protectedTools: readonly string[]): boolean {
  const normalizedName = toolName.toLowerCase();
  return protectedTools.some((protected_) => protected_.toLowerCase() === normalizedName);
}

/**
 * Get the tool name for a tool_result block by looking up the corresponding tool_use.
 *
 * @param toolUseId - The tool_use_id from the tool_result block
 * @param messages - The message array to search
 * @returns The tool name, or undefined if not found
 *
 * @example
 * ```ts
 * const toolName = getToolNameForResult('tool-123', messages);
 * if (toolName && isProtectedTool(toolName, protectedTools)) {
 *   // Skip pruning
 * }
 * ```
 */
export function getToolNameForResult(
  toolUseId: string,
  messages: readonly ContextMessage[]
): string | undefined {
  for (const message of messages) {
    const content = message.content;
    if (typeof content === "string") {
      continue;
    }

    for (const block of content) {
      if (block.type === "tool_use" && (block as ToolUseBlock).id === toolUseId) {
        return (block as ToolUseBlock).name;
      }
    }
  }

  return undefined;
}

/**
 * Calculate content length for a tool result.
 * Handles both string and ContentBlock[] content.
 *
 * @param block - The tool result block
 * @returns Total character count of the content
 *
 * @example
 * ```ts
 * const length = getToolResultLength(toolResultBlock);
 * if (length > maxOutputChars) {
 *   // Needs trimming
 * }
 * ```
 */
export function getToolResultLength(block: ToolResultBlock): number {
  const content = block.content;

  if (typeof content === "string") {
    return content.length;
  }

  // ContentBlock[] - sum up text content
  let length = 0;
  for (const contentBlock of content) {
    if (contentBlock.type === "text") {
      length += contentBlock.text.length;
    }
    // Other block types (image, tool_use, tool_result) don't contribute to trimming logic
  }

  return length;
}

/**
 * Deep clone a message for immutable operations.
 *
 * @param message - The message to clone
 * @returns A deep copy of the message
 */
export function cloneMessage(message: ContextMessage): ContextMessage {
  // For content, we need to handle both string and array cases
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

// ============================================================================
// Core Trimming Functions
// ============================================================================

/**
 * Trim a single tool result block.
 * Returns a new block (doesn't mutate original).
 *
 * @param block - The tool result block to trim
 * @param maxChars - Maximum characters allowed
 * @param marker - Truncation marker to append
 * @param trackCompaction - Whether to set compactedAt timestamp
 * @returns Object containing the trimmed block, whether it was trimmed, and chars removed
 *
 * @example
 * ```ts
 * const result = trimToolResult(block, 5000, '[... truncated]', true);
 * if (result.trimmed) {
 *   console.log(`Removed ${result.charsRemoved} characters`);
 * }
 * ```
 */
export function trimToolResult(
  block: ToolResultBlock,
  maxChars: number,
  marker: string,
  trackCompaction: boolean
): TrimBlockResult {
  const currentLength = getToolResultLength(block);

  // No trimming needed if within limit
  if (currentLength <= maxChars) {
    return {
      block,
      trimmed: false,
      charsRemoved: 0,
    };
  }

  const content = block.content;
  const charsRemoved = currentLength - maxChars;
  let newContent: string | ContentBlock[];

  if (typeof content === "string") {
    // Simple string truncation
    const keepLength = Math.max(0, maxChars - marker.length);
    newContent = content.slice(0, keepLength) + marker;
  } else {
    // ContentBlock[] - need to handle trimming text blocks
    newContent = trimContentBlocks(content, maxChars, marker);
  }

  // Create new block with trimmed content
  const newBlock: ToolResultBlock = {
    ...block,
    content: newContent,
    ...(trackCompaction ? { compactedAt: Date.now() } : {}),
  };

  return {
    block: newBlock,
    trimmed: true,
    charsRemoved,
  };
}

/**
 * Trim an array of content blocks to fit within maxChars.
 * Preserves non-text blocks and trims text blocks as needed.
 *
 * @param blocks - The content blocks to trim
 * @param maxChars - Maximum total characters
 * @param marker - Truncation marker to append
 * @returns New array of trimmed content blocks
 */
function trimContentBlocks(
  blocks: readonly ContentBlock[],
  maxChars: number,
  marker: string
): ContentBlock[] {
  const result: ContentBlock[] = [];
  let remainingChars = maxChars;

  for (const block of blocks) {
    if (block.type !== "text") {
      // Preserve non-text blocks
      result.push({ ...block });
      continue;
    }

    const textBlock = block;
    if (remainingChars <= 0) {
      // No more space, skip remaining text blocks
      continue;
    }

    if (textBlock.text.length <= remainingChars) {
      // Block fits entirely
      result.push({ ...textBlock });
      remainingChars -= textBlock.text.length;
    } else {
      // Need to truncate this block
      const keepLength = Math.max(0, remainingChars - marker.length);
      result.push({
        type: "text",
        text: textBlock.text.slice(0, keepLength) + marker,
      });
      remainingChars = 0;
    }
  }

  return result;
}

// ============================================================================
// Main Pruning Function
// ============================================================================

/**
 * Prune large tool outputs to reduce token usage.
 *
 * Algorithm (per REQ-PRM-001):
 * 1. Scan messages for tool_result blocks
 * 2. Skip protected tools (per REQ-PRM-002)
 * 3. Trim content exceeding maxOutputChars
 * 4. Add truncation marker
 * 5. Optionally set compactedAt timestamp
 *
 * @param messages - The messages to prune
 * @param options - Pruning options
 * @returns Pruning result with new messages array and metrics
 *
 * @example
 * ```ts
 * const result = pruneToolOutputs(messages, {
 *   maxOutputChars: 5000,
 *   protectedTools: ['skill', 'memory_search'],
 * });
 * console.log(`Trimmed ${result.trimmedCount} outputs, saved ~${result.tokensSaved} tokens`);
 * ```
 */
export function pruneToolOutputs(
  messages: readonly ContextMessage[],
  options?: PruneOptions
): PruneResult {
  const {
    maxOutputChars = DEFAULT_MAX_OUTPUT_CHARS,
    protectedTools = DEFAULT_PROTECTED_TOOLS,
    truncationMarker = DEFAULT_TRUNCATION_MARKER,
    trackCompaction = false,
  } = options ?? {};

  // Track metrics
  let trimmedCount = 0;
  let charsRemoved = 0;
  const trimmedToolsSet = new Set<string>();

  // Build a map of tool_use_id -> tool name for quick lookup
  const toolNameMap = buildToolNameMap(messages);

  // Process messages immutably
  const newMessages: ContextMessage[] = messages.map((message) => {
    const content = message.content;

    // Skip string content messages
    if (typeof content === "string") {
      return message;
    }

    // Check if any tool_result blocks need trimming
    let needsClone = false;
    for (const block of content) {
      if (block.type === "tool_result") {
        const toolResult = block as ToolResultBlock;
        const toolName = toolNameMap.get(toolResult.tool_use_id);

        // Skip protected tools
        if (toolName && isProtectedTool(toolName, protectedTools)) {
          continue;
        }

        // Check if trimming needed
        if (getToolResultLength(toolResult) > maxOutputChars) {
          needsClone = true;
          break;
        }
      }
    }

    // If no trimming needed, return original message
    if (!needsClone) {
      return message;
    }

    // Clone and process the message
    const newContent: ContentBlock[] = content.map((block) => {
      if (block.type !== "tool_result") {
        return block;
      }

      const toolResult = block as ToolResultBlock;
      const toolName = toolNameMap.get(toolResult.tool_use_id);

      // Skip protected tools
      if (toolName && isProtectedTool(toolName, protectedTools)) {
        return block;
      }

      // Attempt to trim
      const trimResult = trimToolResult(
        toolResult,
        maxOutputChars,
        truncationMarker,
        trackCompaction
      );

      if (trimResult.trimmed) {
        trimmedCount++;
        charsRemoved += trimResult.charsRemoved;
        if (toolName) {
          trimmedToolsSet.add(toolName);
        }
        return trimResult.block;
      }

      return block;
    });

    // Return new message with trimmed content
    return {
      ...message,
      content: newContent,
    };
  });

  // Calculate estimated tokens saved (rough approximation: ~4 chars per token)
  const tokensSaved = Math.floor(charsRemoved / 4);

  return {
    messages: newMessages,
    trimmedCount,
    charsRemoved,
    tokensSaved,
    trimmedTools: Array.from(trimmedToolsSet),
  };
}

/**
 * Build a map of tool_use_id to tool name for efficient lookup.
 *
 * @param messages - Messages to scan for tool_use blocks
 * @returns Map from tool_use_id to tool name
 */
function buildToolNameMap(messages: readonly ContextMessage[]): Map<string, string> {
  const map = new Map<string, string>();

  for (const message of messages) {
    const content = message.content;
    if (typeof content === "string") {
      continue;
    }

    for (const block of content) {
      if (block.type === "tool_use") {
        const toolUse = block as ToolUseBlock;
        map.set(toolUse.id, toolUse.name);
      }
    }
  }

  return map;
}
