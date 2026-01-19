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

  // Tool group messages have special handling
  if (message.role === "tool_group") {
    const toolCount = message.toolCalls?.length ?? 0;
    // Each tool in a group can expand to multiple lines
    return Math.max(MIN_MESSAGE_HEIGHT, toolCount * TOOL_CALL_UPPER_BOUND) + marginLines;
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
  if (includeToolCalls && message.toolCalls && message.toolCalls.length > 0) {
    lines += 2; // margin + separator before tool calls
    lines += message.toolCalls.length * TOOL_CALL_UPPER_BOUND;
  }

  // Add safety margin and ensure minimum height
  return Math.max(MIN_MESSAGE_HEIGHT, lines + marginLines + HEIGHT_SAFETY_MARGIN);
}
