/**
 * Safe Split Point Detection for Markdown Text
 *
 * Finds safe points to split streaming markdown text without
 * breaking code blocks or creating awkward visual splits.
 *
 * Pattern adapted from Gemini CLI: useGeminiStream.ts
 *
 * @module tui/utils/findLastSafeSplitPoint
 */

/**
 * Find the last safe point to split markdown text.
 *
 * Safe split points are:
 * - After paragraph breaks (\n\n)
 * - After list items (\n- or \n* or \n1.)
 * - After headers (\n#)
 *
 * NOT safe (avoid splitting inside):
 * - Code blocks (``` ... ```)
 * - Inline code (`)
 * - Mid-word
 *
 * @param text - The text to analyze
 * @param minLength - Minimum length before looking for split (default 2000)
 * @returns Split index or -1 if no safe split found
 */
export function findLastSafeSplitPoint(text: string, minLength = 2000): number {
  // Don't split short text
  if (text.length < minLength) {
    return -1;
  }

  // Count open code blocks - don't split inside them
  const codeBlockMatches = text.match(/```/g);
  const openCodeBlocks = (codeBlockMatches?.length ?? 0) % 2 !== 0;
  if (openCodeBlocks) {
    // We're inside a code block, find the last complete block
    const lastClosingBlock = text.lastIndexOf("```\n");
    if (lastClosingBlock > minLength) {
      return lastClosingBlock + 4; // After the closing ``` and newline
    }
    return -1; // Can't safely split inside code block
  }

  // Find safe split points (paragraph breaks, list items, headers)
  const safeSplitPatterns = [
    /\n\n(?=[A-Z#\-*\d])/g, // Paragraph break before new content
    /\n(?=#{1,6}\s)/g, // Before headers
    /\n(?=[-*]\s)/g, // Before list items
    /\n(?=\d+\.\s)/g, // Before numbered list items
  ];

  let bestSplit = -1;
  for (const pattern of safeSplitPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      if (match.index > minLength && match.index > bestSplit) {
        bestSplit = match.index + 1; // After the newline(s)
      }
    }
  }

  // If no good split found, try just a double newline
  if (bestSplit === -1) {
    const lastDoubleNewline = text.lastIndexOf("\n\n");
    if (lastDoubleNewline > minLength) {
      bestSplit = lastDoubleNewline + 2;
    }
  }

  return bestSplit;
}
