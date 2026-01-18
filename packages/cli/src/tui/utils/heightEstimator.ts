/**
 * Height Estimation Utilities (T002)
 *
 * Functions for estimating rendered line heights of text and messages.
 * Used by virtualization and adaptive rendering systems.
 *
 * @module tui/utils/heightEstimator
 */

import stringWidth from "string-width";
import type { Message } from "../context/MessagesContext.js";

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
 *
 * @param message - The message to measure
 * @param options - Height estimation options
 * @returns Estimated height in lines
 */
export function estimateMessageHeight(message: Message, options: HeightEstimatorOptions): number {
  const { width, includeToolCalls = true, contentPadding = 4, thinkingPadding = 6 } = options;

  const headerLines = 1;
  const marginLines = 1;
  const contentWidth = Math.max(10, width - contentPadding);
  const thinkingWidth = Math.max(10, width - thinkingPadding);

  // Tool group messages have special handling
  if (message.role === "tool_group") {
    const toolLines = message.toolCalls?.length ?? 0;
    return Math.max(1, toolLines) + marginLines;
  }

  const content = message.content || (message.isStreaming ? "" : "(empty)");
  let lines = headerLines;

  lines += estimateWrappedLineCount(content, contentWidth);

  // Add thinking block lines if present
  if (message.thinking && message.thinking.length > 0) {
    lines += 1; // "Thinking..." label
    lines += estimateWrappedLineCount(message.thinking, thinkingWidth);
  }

  // Add tool call lines if enabled and present
  if (includeToolCalls && message.toolCalls && message.toolCalls.length > 0) {
    lines += 1; // margin before tool calls
    lines += message.toolCalls.length;
  }

  return lines + marginLines;
}
