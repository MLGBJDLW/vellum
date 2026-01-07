/**
 * Diff Formatter Module
 *
 * Parses unified diff text into structured data for display and analysis.
 * Supports standard unified diff format as produced by git diff.
 *
 * @module git/diff-formatter
 */

import type { DiffHunk, DiffLine, DiffLineType, FileChangeType, FormattedDiff } from "./types.js";

// =============================================================================
// T039: Diff Formatter Module
// =============================================================================

/**
 * Regular expression to match hunk headers.
 * Format: @@ -oldStart,oldLines +newStart,newLines @@
 * The line counts are optional (default to 1 if omitted).
 */
const HUNK_HEADER_REGEX = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/;

/**
 * Regular expression to match diff file headers.
 * Format: diff --git a/path b/path
 */
const DIFF_HEADER_REGEX = /^diff --git a\/(.+) b\/(.+)$/;

/**
 * Regular expression to match old file path.
 * Format: --- a/path or --- /dev/null
 */
const OLD_FILE_REGEX = /^---\s+(?:a\/)?(.+)$/;

/**
 * Regular expression to match new file path.
 * Format: +++ b/path or +++ /dev/null
 */
const NEW_FILE_REGEX = /^\+\+\+\s+(?:b\/)?(.+)$/;

/**
 * Parses a hunk header to extract line numbers.
 *
 * @param line - The hunk header line
 * @returns Parsed line numbers or null if invalid
 */
function parseHunkHeader(
  line: string
): { oldStart: number; oldLines: number; newStart: number; newLines: number } | null {
  const match = HUNK_HEADER_REGEX.exec(line);
  if (!match || !match[1] || !match[3]) {
    return null;
  }

  return {
    oldStart: parseInt(match[1], 10),
    oldLines: parseInt(match[2] ?? "1", 10),
    newStart: parseInt(match[3], 10),
    newLines: parseInt(match[4] ?? "1", 10),
  };
}

/**
 * Determines the type of diff line based on its prefix.
 *
 * @param line - The diff line
 * @returns The line type
 */
function getLineType(line: string): DiffLineType {
  if (line.startsWith("+")) {
    return "add";
  }
  if (line.startsWith("-")) {
    return "remove";
  }
  if (line.startsWith("@@")) {
    return "header";
  }
  return "context";
}

/**
 * Parses a single hunk from diff lines.
 *
 * @param lines - Array of lines starting from the hunk header
 * @param startIndex - Index of the hunk header in the lines array
 * @returns Parsed hunk and the number of lines consumed
 */
function parseHunk(
  lines: string[],
  startIndex: number
): { hunk: DiffHunk; linesConsumed: number } | null {
  const headerLine = lines[startIndex];
  if (!headerLine) {
    return null;
  }
  const headerInfo = parseHunkHeader(headerLine);
  if (!headerInfo) {
    return null;
  }

  const hunkLines: DiffLine[] = [];
  let oldLineNum = headerInfo.oldStart;
  let newLineNum = headerInfo.newStart;
  let i = startIndex + 1;

  // Parse lines until we hit another hunk header, end of input, or diff header
  while (i < lines.length) {
    const line = lines[i];
    if (line === undefined) {
      break;
    }

    // Stop at next hunk or diff
    if (line.startsWith("@@") || line.startsWith("diff ")) {
      break;
    }

    // Skip binary file indicators
    if (line.startsWith("Binary files")) {
      i++;
      continue;
    }

    // Skip extended header lines
    if (
      line.startsWith("index ") ||
      line.startsWith("old mode") ||
      line.startsWith("new mode") ||
      line.startsWith("deleted file") ||
      line.startsWith("new file") ||
      line.startsWith("similarity") ||
      line.startsWith("rename") ||
      line.startsWith("---") ||
      line.startsWith("+++")
    ) {
      i++;
      continue;
    }

    const type = getLineType(line);
    const content = line.slice(1); // Remove prefix character

    const diffLine: DiffLine = {
      type,
      content,
    };

    // Assign line numbers based on type
    if (type === "context") {
      diffLine.oldLineNumber = oldLineNum++;
      diffLine.newLineNumber = newLineNum++;
    } else if (type === "remove") {
      diffLine.oldLineNumber = oldLineNum++;
    } else if (type === "add") {
      diffLine.newLineNumber = newLineNum++;
    }

    hunkLines.push(diffLine);
    i++;
  }

  const hunk: DiffHunk = {
    oldStart: headerInfo.oldStart,
    oldLines: headerInfo.oldLines,
    newStart: headerInfo.newStart,
    newLines: headerInfo.newLines,
    lines: hunkLines,
  };

  return {
    hunk,
    linesConsumed: i - startIndex,
  };
}

/**
 * Determines the file change type from diff metadata.
 *
 * @param oldPath - Path in old version (or /dev/null for new files)
 * @param newPath - Path in new version (or /dev/null for deleted files)
 * @param lines - All diff lines for additional context
 * @returns The type of change
 */
function determineChangeType(oldPath: string, newPath: string, lines: string[]): FileChangeType {
  // Check for explicit file mode indicators
  for (const line of lines) {
    if (line.startsWith("new file mode")) {
      return "added";
    }
    if (line.startsWith("deleted file mode")) {
      return "deleted";
    }
    if (line.startsWith("rename from") || line.startsWith("similarity index")) {
      return "renamed";
    }
  }

  // Fall back to path analysis
  if (oldPath === "/dev/null") {
    return "added";
  }
  if (newPath === "/dev/null") {
    return "deleted";
  }
  if (oldPath !== newPath) {
    return "renamed";
  }
  return "modified";
}

/**
 * Parses a unified diff text for a single file.
 *
 * @param diffText - Unified diff text to parse
 * @returns FormattedDiff structure with hunks
 *
 * @example
 * ```typescript
 * const diff = `diff --git a/file.ts b/file.ts
 * index abc123..def456 100644
 * --- a/file.ts
 * +++ b/file.ts
 * @@ -1,3 +1,4 @@
 *  line1
 * +added line
 *  line2
 *  line3`;
 *
 * const formatted = formatFileDiff(diff);
 * console.log(formatted.hunks[0].lines);
 * // [
 * //   { type: "context", content: "line1", oldLineNumber: 1, newLineNumber: 1 },
 * //   { type: "add", content: "added line", newLineNumber: 2 },
 * //   { type: "context", content: "line2", oldLineNumber: 2, newLineNumber: 3 },
 * //   { type: "context", content: "line3", oldLineNumber: 3, newLineNumber: 4 },
 * // ]
 * ```
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Diff parsing requires comprehensive line-by-line analysis
export function formatFileDiff(diffText: string): FormattedDiff {
  const lines = diffText.split("\n");

  let path = "";
  let oldPath: string | undefined;
  let newPath: string | undefined;
  let isBinary = false;

  // Parse header information
  for (const line of lines) {
    // Check for diff header
    const diffMatch = DIFF_HEADER_REGEX.exec(line);
    if (diffMatch?.[1] && diffMatch[2]) {
      oldPath = diffMatch[1];
      newPath = diffMatch[2];
      path = newPath;
      continue;
    }

    // Check for old file path
    const oldMatch = OLD_FILE_REGEX.exec(line);
    if (oldMatch?.[1] && oldMatch[1] !== "/dev/null") {
      oldPath = oldPath ?? oldMatch[1];
    }

    // Check for new file path
    const newMatch = NEW_FILE_REGEX.exec(line);
    if (newMatch?.[1] && newMatch[1] !== "/dev/null") {
      newPath = newPath ?? newMatch[1];
      path = newPath;
    }

    // Check for binary indicator
    if (line.startsWith("Binary files")) {
      isBinary = true;
    }
  }

  // Determine change type
  const type = determineChangeType(oldPath ?? "/dev/null", newPath ?? "/dev/null", lines);

  // Parse hunks
  const hunks: DiffHunk[] = [];
  let i = 0;

  while (i < lines.length) {
    const currentLine = lines[i];
    if (currentLine?.startsWith("@@")) {
      const result = parseHunk(lines, i);
      if (result) {
        hunks.push(result.hunk);
        i += result.linesConsumed;
      } else {
        i++;
      }
    } else {
      i++;
    }
  }

  return {
    path,
    oldPath: type === "renamed" ? oldPath : undefined,
    type,
    hunks,
    isBinary,
  };
}

/**
 * Parses a multi-file diff text into an array of FormattedDiff structures.
 *
 * @param diffText - Multi-file unified diff text
 * @returns Array of FormattedDiff for each file
 *
 * @example
 * ```typescript
 * const diffs = formatMultiFileDiff(gitDiffOutput);
 * for (const diff of diffs) {
 *   console.log(`${diff.path}: ${diff.type} (${diff.hunks.length} hunks)`);
 * }
 * ```
 */
export function formatMultiFileDiff(diffText: string): FormattedDiff[] {
  const lines = diffText.split("\n");
  const results: FormattedDiff[] = [];

  // Find diff boundaries
  const diffStarts: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const currentLine = lines[i];
    if (currentLine?.startsWith("diff --git")) {
      diffStarts.push(i);
    }
  }

  // Parse each diff section
  for (let i = 0; i < diffStarts.length; i++) {
    const start = diffStarts[i];
    const end = i + 1 < diffStarts.length ? diffStarts[i + 1] : lines.length;
    const sectionLines = lines.slice(start, end);
    const sectionText = sectionLines.join("\n");

    const formatted = formatFileDiff(sectionText);
    if (formatted.path) {
      results.push(formatted);
    }
  }

  return results;
}

/**
 * Renders a formatted diff as a string for display.
 *
 * @param diff - The formatted diff to render
 * @param options - Rendering options
 * @param options.showLineNumbers - Include line numbers in output (default: true)
 * @param options.contextLines - Maximum context lines to show per hunk
 * @returns Rendered diff string in unified diff format
 *
 * @example
 * ```typescript
 * const output = renderFormattedDiff(diff, { showLineNumbers: true });
 * console.log(output);
 * ```
 */
export function renderFormattedDiff(
  diff: FormattedDiff,
  options: {
    /** Include line numbers in output */
    showLineNumbers?: boolean;
    /** Maximum context lines to show per hunk */
    contextLines?: number;
  } = {}
): string {
  const { showLineNumbers = true } = options;
  const lines: string[] = [];

  // Header
  if (diff.oldPath && diff.oldPath !== diff.path) {
    lines.push(`--- a/${diff.oldPath}`);
    lines.push(`+++ b/${diff.path}`);
  } else {
    lines.push(`--- a/${diff.path}`);
    lines.push(`+++ b/${diff.path}`);
  }

  if (diff.isBinary) {
    lines.push("Binary file differs");
    return lines.join("\n");
  }

  // Hunks
  for (const hunk of diff.hunks) {
    lines.push(`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`);

    for (const line of hunk.lines) {
      let prefix = " ";
      if (line.type === "add") {
        prefix = "+";
      } else if (line.type === "remove") {
        prefix = "-";
      }

      if (showLineNumbers) {
        const oldNum = line.oldLineNumber?.toString().padStart(4, " ") ?? "    ";
        const newNum = line.newLineNumber?.toString().padStart(4, " ") ?? "    ";
        lines.push(`${oldNum} ${newNum} ${prefix}${line.content}`);
      } else {
        lines.push(`${prefix}${line.content}`);
      }
    }
  }

  return lines.join("\n");
}

/**
 * Calculates statistics for a formatted diff.
 *
 * @param diff - The formatted diff to analyze
 * @returns Statistics object with additions, deletions, and totalChanges counts
 *
 * @example
 * ```typescript
 * const stats = getDiffStats(formattedDiff);
 * console.log(`+${stats.additions} -${stats.deletions}`);
 * ```
 */
export function getDiffStats(diff: FormattedDiff): {
  additions: number;
  deletions: number;
  totalChanges: number;
} {
  let additions = 0;
  let deletions = 0;

  for (const hunk of diff.hunks) {
    for (const line of hunk.lines) {
      if (line.type === "add") {
        additions++;
      } else if (line.type === "remove") {
        deletions++;
      }
    }
  }

  return {
    additions,
    deletions,
    totalChanges: additions + deletions,
  };
}
