/**
 * Height Estimation Utilities (T002)
 *
 * Functions for estimating rendered line heights of text and messages.
 * Used by virtualization and adaptive rendering systems.
 *
 * CRITICAL: Height estimates MUST be UPPER BOUNDS (never under-estimate).
 * Under-estimation causes terminal overflow and UI "sinking" bugs.
 *
 * @module tui/utils/heightEstimator
 */

import stringWidth from "string-width";
import type { Message } from "../context/MessagesContext.js";

// =============================================================================
// Constants - Upper Bound Safety Margins
// =============================================================================

/**
 * Safety margin added to all height estimates to prevent overflow.
 * Accounts for borders, padding, and rendering variations.
 */
export const HEIGHT_SAFETY_MARGIN = 2;

/**
 * Upper bound lines per tool call.
 * Tool calls render as inline status indicators (Gemini-style):
 * - Status icon + tool name + optional error = typically 1-2 lines
 * Previous value of 10 was too conservative for inline rendering.
 */
export const TOOL_CALL_UPPER_BOUND = 3;

/**
 * Upper bound lines per tool call when a diff preview is shown.
 * Accounts for status line + margin + MaxSizedBox diff preview (12 lines).
 */
export const TOOL_CALL_DIFF_UPPER_BOUND = 14;

/**
 * Upper bound for thinking block header and chrome.
 * Includes collapsible header, borders, and internal padding.
 */
export const THINKING_HEADER_UPPER_BOUND = 4;

/**
 * Default estimated item height for virtualization.
 * Used when no specific estimate is available.
 * Increased from 4 to prevent overflow from under-estimation.
 */
export const DEFAULT_ESTIMATED_ITEM_HEIGHT = 12;

/**
 * Minimum message height (header + minimal content + margin).
 */
export const MIN_MESSAGE_HEIGHT = 4;

// =============================================================================
// Types
// =============================================================================

interface DiffMetadata {
  readonly diff: string;
  readonly additions: number;
  readonly deletions: number;
}

type ToolCallInfo = NonNullable<Message["toolCalls"]>[number];

/**
 * Options for message height estimation.
 */
export interface HeightEstimatorOptions {
  /** Terminal width for line wrapping calculation */
  readonly width: number;
  /** Whether to include tool calls in height calculation (default: true) */
  readonly includeToolCalls?: boolean;
  /** Padding to subtract from width for content area (default: 4) */
  readonly contentPadding?: number;
  /** Padding to subtract for thinking blocks (default: 6) */
  readonly thinkingPadding?: number;
}

// =============================================================================
// Functions
// =============================================================================

function isDiffMetadata(value: unknown): value is DiffMetadata {
  if (!value || typeof value !== "object") {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.diff === "string" &&
    typeof obj.additions === "number" &&
    typeof obj.deletions === "number"
  );
}

function getDiffMetadata(result: unknown): DiffMetadata | null {
  if (isDiffMetadata(result)) {
    return result;
  }
  if (!result || typeof result !== "object") {
    return null;
  }
  const diffMeta = (result as Record<string, unknown>).diffMeta;
  return isDiffMetadata(diffMeta) ? diffMeta : null;
}

function getToolCallUpperBound(toolCall: ToolCallInfo): number {
  const diffMeta = getDiffMetadata(toolCall.result);
  const hasDiffContent =
    toolCall.status === "completed" &&
    diffMeta !== null &&
    diffMeta.diff.trim() !== "" &&
    diffMeta.diff !== "(no changes)";
  return hasDiffContent ? TOOL_CALL_DIFF_UPPER_BOUND : TOOL_CALL_UPPER_BOUND;
}

/**
 * Estimate the number of lines a text will occupy when wrapped.
 * Uses string-width for accurate CJK/Emoji/ANSI handling.
 *
 * @param text - The text to measure
 * @param width - The available terminal width
 * @returns Estimated number of lines after wrapping
 */
export function estimateWrappedLineCount(text: string, width: number): number {
  const safeWidth = Math.max(1, width);
  if (!text) {
    return 1;
  }

  let total = 0;
  const lines = text.split("\n");
  for (const line of lines) {
    // Use string-width for accurate display width calculation
    // This correctly handles CJK characters (2 cells), Emoji, and ANSI escape codes
    const lineWidth = stringWidth(line);
    if (lineWidth === 0) {
      total += 1;
      continue;
    }
    total += Math.max(1, Math.ceil(lineWidth / safeWidth));
  }
  return total;
}

/**
 * Fast height estimation for streaming content.
 *
 * This is a lightweight function optimized for real-time updates during streaming.
 * It only considers the content text and doesn't account for thinking blocks,
 * tool calls, or other message metadata. Use this for rapid height updates
 * during streaming; use estimateMessageHeight for complete estimation.
 *
 * @param content - The content text to estimate height for
 * @param width - Terminal width for line wrapping calculation
 * @param headerLines - Number of lines for header (default: 2)
 * @returns Estimated height in lines
 */
export function estimateStreamingContentHeight(
  content: string,
  width: number,
  headerLines: number = 2
): number {
  const contentWidth = Math.max(10, width - 4); // Account for padding
  const contentLines = estimateWrappedLineCount(content, contentWidth);
  return Math.max(MIN_MESSAGE_HEIGHT, headerLines + contentLines + HEIGHT_SAFETY_MARGIN);
}

/**
 * Estimate a message height in lines for virtualized scrolling and layout.
 * Uses UPPER BOUND estimation to prevent terminal overflow.
 *
 * @param message - The message to measure
 * @param options - Height estimation options
 * @returns Estimated height in lines (conservative upper bound)
 */
export function estimateMessageHeight(message: Message, options: HeightEstimatorOptions): number {
  const { width, includeToolCalls = true, contentPadding = 4, thinkingPadding = 6 } = options;

  // Use 2 lines for header (role + timestamp) to account for wrapping
  const headerLines = 2;
  // Margin between messages
  const marginLines = 2;
  const contentWidth = Math.max(10, width - contentPadding);
  const thinkingWidth = Math.max(10, width - thinkingPadding);
  const toolCalls = message.toolCalls ?? [];

  // Tool group messages have special handling
  if (message.role === "tool_group") {
    const toolLines = toolCalls.reduce((sum, call) => sum + getToolCallUpperBound(call), 0);
    // Each tool in a group can expand to multiple lines
    return Math.max(MIN_MESSAGE_HEIGHT, toolLines) + marginLines;
  }

  const content = message.content || (message.isStreaming ? "" : "(empty)");
  let lines = headerLines;

  lines += estimateWrappedLineCount(content, contentWidth);

  // Add thinking block lines if present (with upper bound for chrome)
  if (message.thinking && message.thinking.length > 0) {
    lines += THINKING_HEADER_UPPER_BOUND; // Collapsible header + borders
    lines += estimateWrappedLineCount(message.thinking, thinkingWidth);
  }

  // Add tool call lines if enabled and present (UPPER BOUND per tool)
  if (includeToolCalls && toolCalls.length > 0) {
    lines += 1; // separator before tool calls (margin already counted)
    lines += toolCalls.reduce((sum, call) => sum + getToolCallUpperBound(call), 0);
  }

  // FIX: Simplified height calculation to avoid double-counting margins
  // Previous version added marginLines (2) + HEIGHT_SAFETY_MARGIN (2) = 4 extra lines
  // which caused over-estimation and blank spaces in virtualized list
  // Now we only add a single safety buffer
  return Math.max(MIN_MESSAGE_HEIGHT, lines + HEIGHT_SAFETY_MARGIN);
}
