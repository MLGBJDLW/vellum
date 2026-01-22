/**
 * Line Buffer Hook
 *
 * Pre-wraps messages into line arrays for efficient scroll calculations.
 * Uses a ring buffer to limit memory usage with very long conversations.
 *
 * Key features:
 * - Pre-wraps text at specified terminal width
 * - Caches wrap results by message ID + width
 * - Ring buffer discards oldest entries when maxLines exceeded
 * - O(1) line range queries via index lookup
 *
 * @module tui/hooks/useLineBuffer
 */

import { useMemo, useRef } from "react";
import stringWidth from "string-width";
import type { Message } from "../context/MessagesContext.js";

// =============================================================================
// Types
// =============================================================================

/**
 * A single entry in the line buffer representing one message's wrapped lines.
 */
export interface LineBufferEntry {
  /** Original message ID */
  readonly messageId: string;
  /** Pre-wrapped lines (each line fits within wrapWidth) */
  readonly lines: readonly string[];
  /** Width used for wrapping (for cache invalidation) */
  readonly wrapWidth: number;
}

/**
 * State returned by useLineBuffer hook.
 */
export interface LineBufferState {
  /** All entries in the buffer */
  readonly entries: readonly LineBufferEntry[];
  /** Total line count across all entries */
  readonly totalLines: number;
  /**
   * Get lines in range [start, end).
   * Uses 0-based line indexing across all messages.
   */
  getVisibleLines(start: number, end: number): string[];
}

/**
 * Options for useLineBuffer hook.
 */
export interface UseLineBufferOptions {
  /** Terminal width for wrapping */
  readonly width: number;
  /** Max lines to keep (ring buffer). Default: 10000 */
  readonly maxLines?: number;
  /** Content padding to subtract from width. Default: 4 */
  readonly contentPadding?: number;
}

// =============================================================================
// Constants
// =============================================================================

/** Default maximum lines to keep in buffer */
const DEFAULT_MAX_LINES = 10000;

/** Default content padding for wrapping */
const DEFAULT_CONTENT_PADDING = 4;

// =============================================================================
// Pure Functions
// =============================================================================

/**
 * Wrap a single line of text to fit within a given width.
 * Uses string-width for accurate CJK/Emoji/ANSI handling.
 *
 * @param text - Text to wrap (single logical line, no newlines)
 * @param width - Maximum display width per line
 * @returns Array of wrapped lines
 */
export function wrapLine(text: string, width: number): string[] {
  const safeWidth = Math.max(1, width);

  // Empty or whitespace-only lines
  if (!text || text.trim().length === 0) {
    return [text || ""];
  }

  const result: string[] = [];
  let currentLine = "";
  let currentWidth = 0;

  // Process character by character for accurate width handling
  // This handles CJK (2-width), emoji, and combining characters correctly
  const chars = [...text]; // Spread to handle multi-byte chars

  for (const char of chars) {
    const charWidth = stringWidth(char);

    // Would adding this char exceed the width?
    if (currentWidth + charWidth > safeWidth && currentLine.length > 0) {
      result.push(currentLine);
      currentLine = char;
      currentWidth = charWidth;
    } else {
      currentLine += char;
      currentWidth += charWidth;
    }
  }

  // Don't forget the last line
  if (currentLine.length > 0) {
    result.push(currentLine);
  }

  // Handle edge case: empty result
  if (result.length === 0) {
    result.push("");
  }

  return result;
}

/**
 * Wrap multi-line text (with \n) to fit within width.
 *
 * @param text - Text to wrap (may contain newlines)
 * @param width - Maximum display width per line
 * @returns Array of wrapped lines
 */
export function wrapText(text: string, width: number): string[] {
  if (!text) {
    return [""];
  }

  const lines = text.split("\n");
  const result: string[] = [];

  for (const line of lines) {
    const wrapped = wrapLine(line, width);
    result.push(...wrapped);
  }

  return result;
}

/**
 * Extract displayable content from a message for line buffering.
 *
 * @param message - Message to extract content from
 * @returns Combined text content (content + thinking + tool info)
 */
function extractMessageContent(message: Message): string {
  const parts: string[] = [];

  // Message header line
  const role =
    message.role === "user" ? "You" : message.role === "assistant" ? "Vellum" : message.role;
  parts.push(`${role}:`);

  // Thinking content (if present)
  if (message.thinking && message.thinking.length > 0) {
    parts.push("  Thinking...");
    // Indent thinking content
    const thinkingLines = message.thinking.split("\n");
    for (const line of thinkingLines) {
      parts.push(`    ${line}`);
    }
  }

  // Main content
  if (message.content) {
    const contentLines = message.content.split("\n");
    for (const line of contentLines) {
      parts.push(`  ${line}`);
    }
  } else if (!message.isStreaming) {
    parts.push("  (empty)");
  }

  // Tool calls (simplified representation)
  if (message.toolCalls && message.toolCalls.length > 0) {
    for (const tool of message.toolCalls) {
      const status = tool.status === "completed" ? "+" : tool.status === "error" ? "x" : "-";
      parts.push(`  ${status} ${tool.name}`);
    }
  }

  return parts.join("\n");
}

/**
 * Create a LineBufferEntry for a message.
 *
 * @param message - Message to wrap
 * @param width - Terminal width
 * @param contentPadding - Padding to subtract from width
 * @returns LineBufferEntry with wrapped lines
 */
function createEntry(message: Message, width: number, contentPadding: number): LineBufferEntry {
  const contentWidth = Math.max(10, width - contentPadding);
  const content = extractMessageContent(message);
  const lines = wrapText(content, contentWidth);

  return {
    messageId: message.id,
    lines,
    wrapWidth: width,
  };
}

// =============================================================================
// Cache Key Generation
// =============================================================================

/**
 * Generate a cache key for a message + width combination.
 */
function getCacheKey(messageId: string, width: number): string {
  return `${messageId}:${width}`;
}

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * useLineBuffer - Pre-wraps messages into line arrays for efficient scrolling.
 *
 * This hook maintains a cache of wrapped lines per message, re-wrapping only
 * when width changes or new messages arrive. Uses a ring buffer to limit
 * memory usage.
 *
 * @example
 * ```tsx
 * const lineBuffer = useLineBuffer(messages, {
 *   width: terminalWidth,
 *   maxLines: 5000,
 * });
 *
 * // Get visible lines for current scroll position
 * const visibleLines = lineBuffer.getVisibleLines(
 *   scrollState.offsetFromBottom,
 *   scrollState.offsetFromBottom + viewportHeight
 * );
 * ```
 *
 * @param messages - Array of messages to buffer
 * @param options - Buffer configuration options
 * @returns LineBufferState with entries and query methods
 */
export function useLineBuffer(
  messages: readonly Message[],
  options: UseLineBufferOptions
): LineBufferState {
  const { width, maxLines = DEFAULT_MAX_LINES, contentPadding = DEFAULT_CONTENT_PADDING } = options;

  // Cache for wrapped entries: Map<cacheKey, LineBufferEntry>
  const cacheRef = useRef<Map<string, LineBufferEntry>>(new Map());

  // Compute entries with memoization
  const entries = useMemo(() => {
    const cache = cacheRef.current;
    const result: LineBufferEntry[] = [];
    let totalLineCount = 0;

    // Build entries, using cache when available
    for (const message of messages) {
      const cacheKey = getCacheKey(message.id, width);
      let entry = cache.get(cacheKey);

      // Cache miss or width changed - recompute
      if (!entry || entry.wrapWidth !== width) {
        entry = createEntry(message, width, contentPadding);
        cache.set(cacheKey, entry);
      }

      result.push(entry);
      totalLineCount += entry.lines.length;
    }

    // Ring buffer: trim oldest entries if exceeding maxLines
    while (totalLineCount > maxLines && result.length > 1) {
      const removed = result.shift();
      if (removed) {
        totalLineCount -= removed.lines.length;
        // Clean cache for removed entry
        cache.delete(getCacheKey(removed.messageId, width));
      }
    }

    // Clean stale cache entries (messages no longer in list)
    const activeKeys = new Set(result.map((e) => getCacheKey(e.messageId, width)));
    for (const key of cache.keys()) {
      if (!activeKeys.has(key)) {
        cache.delete(key);
      }
    }

    return result;
  }, [messages, width, maxLines, contentPadding]);

  // Compute total lines
  const totalLines = useMemo(() => {
    return entries.reduce((sum, entry) => sum + entry.lines.length, 0);
  }, [entries]);

  // Build line index for O(1) range queries
  // lineIndex[i] = { entryIndex, lineOffset } for global line i
  const lineIndex = useMemo(() => {
    const index: Array<{ entryIndex: number; lineOffset: number }> = [];
    let entryIdx = 0;
    for (const entry of entries) {
      for (let lineOffset = 0; lineOffset < entry.lines.length; lineOffset++) {
        index.push({ entryIndex: entryIdx, lineOffset });
      }
      entryIdx++;
    }
    return index;
  }, [entries]);

  // Get visible lines in range [start, end)
  const getVisibleLines = useMemo(() => {
    return (start: number, end: number): string[] => {
      const result: string[] = [];
      const safeStart = Math.max(0, start);
      const safeEnd = Math.min(totalLines, end);

      for (let i = safeStart; i < safeEnd; i++) {
        const loc = lineIndex[i];
        if (loc) {
          const entry = entries[loc.entryIndex];
          if (entry) {
            const line = entry.lines[loc.lineOffset];
            if (line !== undefined) {
              result.push(line);
            }
          }
        }
      }

      return result;
    };
  }, [entries, lineIndex, totalLines]);

  return {
    entries,
    totalLines,
    getVisibleLines,
  };
}
