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
 * Detect if an index is inside a code block.
 *
 * Searches backwards from the given index to find any opening ```.
 * If found, checks if there's a closing ``` after it before our index.
 *
 * @param content - The text to analyze
 * @param index - The index to check
 * @returns true if inside a code block
 */
function isIndexInsideCodeBlock(content: string, index: number): boolean {
  // Find all code block markers before the index
  const textBefore = content.slice(0, index);
  const markers = [...textBefore.matchAll(/```/g)];

  // If odd number of markers, we're inside a code block
  return markers.length % 2 !== 0;
}

/**
 * Find the start of the enclosing code block (if any).
 *
 * @param content - The text to analyze
 * @param index - The index to check
 * @returns Start index of enclosing code block, or -1 if not inside one
 */
function findEnclosingCodeBlockStart(content: string, index: number): number {
  if (!isIndexInsideCodeBlock(content, index)) {
    return -1;
  }

  // Find the last opening ``` before the index
  const textBefore = content.slice(0, index);
  const lastOpening = textBefore.lastIndexOf("```");
  return lastOpening;
}

/**
 * Find the last safe point to split markdown text.
 *
 * Newline-gated strategy (like Codex/Gemini CLI):
 * - Only splits at double newlines (\n\n) - paragraph boundaries
 * - Never splits inside code blocks
 * - No arbitrary character limit - waits for natural break points
 *
 * This prevents visual jitter from mid-sentence or mid-paragraph splits.
 *
 * @param text - The text to analyze
 * @param _minLength - Deprecated, kept for API compatibility (ignored)
 * @returns Split index after \n\n, or -1 if no safe split found
 */
export function findLastSafeSplitPoint(text: string, _minLength = 0): number {
  // Check if we're currently inside a code block
  const enclosingBlockStart = findEnclosingCodeBlockStart(text, text.length);
  if (enclosingBlockStart !== -1) {
    // End of content is inside a code block - split right before it
    return enclosingBlockStart;
  }

  // Search for the last double newline (\n\n) not inside a code block
  let searchStartIndex = text.length;
  while (searchStartIndex >= 0) {
    const dnlIndex = text.lastIndexOf("\n\n", searchStartIndex);
    if (dnlIndex === -1) {
      // No more double newlines found
      break;
    }

    const potentialSplitPoint = dnlIndex + 2;
    if (!isIndexInsideCodeBlock(text, potentialSplitPoint)) {
      return potentialSplitPoint;
    }

    // If potentialSplitPoint was inside a code block,
    // search before the \n\n we just found
    searchStartIndex = dnlIndex - 1;
  }

  // No safe split point found - don't split
  return -1;
}
