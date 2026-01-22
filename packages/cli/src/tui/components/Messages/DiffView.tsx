/**
 * DiffView Component (T022)
 *
 * Renders unified diff format with proper styling for added, removed,
 * and context lines. Supports line numbers and file headers.
 *
 * @module tui/components/Messages/DiffView
 */

import { Box, Text } from "ink";
import type React from "react";
import { useMemo } from "react";
import type { DiffViewMode } from "../../i18n/index.js";
import { useTheme } from "../../theme/index.js";
import { getTerminalWidth } from "../../utils/ui-sizing.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Minimum terminal width required for side-by-side mode.
 * Below this, automatically degrades to unified mode.
 */
const SIDE_BY_SIDE_MIN_WIDTH = 100;

/**
 * Props for the DiffView component.
 */
export interface DiffViewProps {
  /** The unified diff content to display */
  readonly diff: string;
  /** Optional file name to show in header */
  readonly fileName?: string;
  /** Show line numbers (old/new) on the left (default: false) */
  readonly showLineNumbers?: boolean;
  /** Reduce spacing for compact display (default: false) */
  readonly compact?: boolean;
  /** Display mode: "unified" or "side-by-side" (default: "unified") */
  readonly mode?: DiffViewMode;
}

/**
 * Line type in a diff
 */
type DiffLineType = "added" | "removed" | "context" | "hunk" | "header";

/**
 * A parsed diff line
 */
interface ParsedLine {
  readonly type: DiffLineType;
  readonly content: string;
  readonly oldLineNumber?: number;
  readonly newLineNumber?: number;
}

/**
 * Parsed hunk information
 */
interface HunkInfo {
  readonly oldStart: number;
  readonly oldCount: number;
  readonly newStart: number;
  readonly newCount: number;
}

// =============================================================================
// Diff Parser
// =============================================================================

/**
 * Parse hunk header to extract line numbers
 * Format: @@ -oldStart,oldCount +newStart,newCount @@
 */
function parseHunkHeader(line: string): HunkInfo | null {
  const match = line.match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/);
  if (!match || !match[1] || !match[3]) {
    return null;
  }

  return {
    oldStart: Number.parseInt(match[1], 10),
    oldCount: Number.parseInt(match[2] ?? "1", 10),
    newStart: Number.parseInt(match[3], 10),
    newCount: Number.parseInt(match[4] ?? "1", 10),
  };
}

/**
 * Parse a unified diff string into structured lines
 */
function parseDiff(diff: string): ParsedLine[] {
  const lines = diff.split("\n");
  const result: ParsedLine[] = [];

  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    // Skip empty lines at end
    if (line === "" && result.length > 0) {
      continue;
    }

    // File headers (--- and +++ lines)
    if (line.startsWith("---") || line.startsWith("+++")) {
      result.push({ type: "header", content: line });
      continue;
    }

    // Hunk header
    if (line.startsWith("@@")) {
      const hunkInfo = parseHunkHeader(line);
      if (hunkInfo) {
        oldLine = hunkInfo.oldStart;
        newLine = hunkInfo.newStart;
      }
      result.push({ type: "hunk", content: line });
      continue;
    }

    // Added line
    if (line.startsWith("+")) {
      result.push({
        type: "added",
        content: line,
        newLineNumber: newLine,
      });
      newLine++;
      continue;
    }

    // Removed line
    if (line.startsWith("-")) {
      result.push({
        type: "removed",
        content: line,
        oldLineNumber: oldLine,
      });
      oldLine++;
      continue;
    }

    // Context line (starts with space or is empty context)
    if (line.startsWith(" ") || line === "") {
      result.push({
        type: "context",
        content: line,
        oldLineNumber: oldLine,
        newLineNumber: newLine,
      });
      oldLine++;
      newLine++;
      continue;
    }

    // Other lines (like "\ No newline at end of file")
    result.push({ type: "context", content: line });
  }

  return result;
}

// =============================================================================
// Sub-components
// =============================================================================

/**
 * File header component
 */
interface FileHeaderProps {
  readonly fileName: string;
}

function FileHeader({ fileName }: FileHeaderProps): React.ReactElement {
  const { theme } = useTheme();

  return (
    <Box
      borderStyle="single"
      borderColor={theme.semantic.border.default}
      borderBottom={false}
      paddingX={1}
    >
      <Text color={theme.semantic.text.secondary} bold>
        📄 {fileName}
      </Text>
    </Box>
  );
}

/**
 * Render a single diff line
 */
interface DiffLineRendererProps {
  readonly line: ParsedLine;
  readonly showLineNumbers: boolean;
  readonly lineNumberWidth: number;
}

/**
 * Enhanced diff line styling configuration
 */
interface DiffLineStyle {
  readonly textColor: string;
  readonly bgColor?: string;
  readonly symbol: string;
  readonly bold: boolean;
  readonly dimContent: boolean;
}

function DiffLineRenderer({
  line,
  showLineNumbers,
  lineNumberWidth,
}: DiffLineRendererProps): React.ReactElement {
  const { theme } = useTheme();
  const diffColors = theme.semantic.diff;

  // Enhanced style configuration with better visual distinction
  const getLineStyle = (): DiffLineStyle => {
    switch (line.type) {
      case "added":
        return {
          textColor: theme.colors.success,
          bgColor: diffColors.added,
          symbol: "▶",
          bold: true,
          dimContent: false,
        };
      case "removed":
        return {
          textColor: theme.colors.error,
          bgColor: diffColors.removed,
          symbol: "◀",
          bold: true,
          dimContent: false,
        };
      case "hunk":
        return {
          textColor: theme.colors.info,
          symbol: "≡",
          bold: false,
          dimContent: false,
        };
      case "header":
        return {
          textColor: theme.semantic.text.muted,
          symbol: "",
          bold: false,
          dimContent: true,
        };
      default:
        return {
          textColor: theme.semantic.text.secondary,
          symbol: " ",
          bold: false,
          dimContent: false,
        };
    }
  };

  const style = getLineStyle();

  // Format line numbers with proper alignment
  const formatLineNumber = (num: number | undefined): string => {
    if (num === undefined) {
      return "".padStart(lineNumberWidth, " ");
    }
    return String(num).padStart(lineNumberWidth, " ");
  };

  // Get the content without the prefix character for display
  const displayContent =
    line.type === "added" || line.type === "removed" || line.type === "context"
      ? line.content.slice(1)
      : line.content;

  // Render line numbers section
  const renderLineNumbers = (): React.ReactElement | null => {
    if (!showLineNumbers) return null;

    if (line.type === "hunk" || line.type === "header") {
      return (
        <Box marginRight={1}>
          <Text color={theme.semantic.text.muted}>{"".padStart(lineNumberWidth * 2 + 2, " ")}</Text>
          <Text color={theme.semantic.border.muted}>│</Text>
        </Box>
      );
    }

    if (line.type === "added" || line.type === "removed" || line.type === "context") {
      return (
        <Box marginRight={1}>
          {/* Old line number - dimmed for removed lines */}
          <Text
            color={line.type === "removed" ? theme.colors.error : theme.semantic.text.muted}
            dimColor={line.type !== "removed"}
          >
            {formatLineNumber(line.oldLineNumber)}
          </Text>
          <Text color={theme.semantic.border.muted}> </Text>
          {/* New line number - highlighted for added lines */}
          <Text
            color={line.type === "added" ? theme.colors.success : theme.semantic.text.muted}
            dimColor={line.type !== "added"}
          >
            {formatLineNumber(line.newLineNumber)}
          </Text>
          <Text color={theme.semantic.border.muted}>│</Text>
        </Box>
      );
    }

    return null;
  };

  // Render the symbol prefix with enhanced visibility
  const renderSymbol = (): React.ReactElement | null => {
    if (line.type === "header") return null;

    return (
      <Text color={style.textColor} bold={style.bold}>
        {style.symbol}
      </Text>
    );
  };

  return (
    <Box>
      {renderLineNumbers()}
      <Box flexGrow={1}>
        {renderSymbol()}
        {style.symbol && <Text> </Text>}
        <Text
          color={style.textColor}
          bold={style.bold && (line.type === "added" || line.type === "removed")}
          dimColor={style.dimContent}
        >
          {displayContent}
        </Text>
      </Box>
    </Box>
  );
}

// =============================================================================
// Side-by-Side Types and Helpers
// =============================================================================

/**
 * A paired line for side-by-side display.
 * Left is the old version, right is the new version.
 * Either side can be empty (for additions/deletions).
 */
interface SideBySideLine {
  readonly left: ParsedLine | null;
  readonly right: ParsedLine | null;
}

/**
 * Convert parsed diff lines to side-by-side pairs.
 * Matches removed and added lines, and preserves context on both sides.
 */
function toSideBySidePairs(lines: ParsedLine[]): SideBySideLine[] {
  const result: SideBySideLine[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line) break;

    // Headers and hunks span both columns
    if (line.type === "header" || line.type === "hunk") {
      result.push({ left: line, right: line });
      i++;
      continue;
    }

    // Context lines appear on both sides
    if (line.type === "context") {
      result.push({ left: line, right: line });
      i++;
      continue;
    }

    // Collect consecutive removed lines
    const removedLines: ParsedLine[] = [];
    while (i < lines.length) {
      const current = lines[i];
      if (!current || current.type !== "removed") break;
      removedLines.push(current);
      i++;
    }

    // Collect consecutive added lines
    const addedLines: ParsedLine[] = [];
    while (i < lines.length) {
      const current = lines[i];
      if (!current || current.type !== "added") break;
      addedLines.push(current);
      i++;
    }

    // Pair removed and added lines
    const maxLen = Math.max(removedLines.length, addedLines.length);
    for (let j = 0; j < maxLen; j++) {
      const leftLine = removedLines[j];
      const rightLine = addedLines[j];
      result.push({
        left: leftLine ?? null,
        right: rightLine ?? null,
      });
    }
  }

  return result;
}

// =============================================================================
// Side-by-Side Renderer
// =============================================================================

/**
 * Render a single side-by-side row.
 */
interface SideBySideRowProps {
  readonly pair: SideBySideLine;
  readonly showLineNumbers: boolean;
  readonly lineNumberWidth: number;
  readonly columnWidth: number;
}

function SideBySideRow({
  pair,
  showLineNumbers,
  lineNumberWidth,
  columnWidth,
}: SideBySideRowProps): React.ReactElement {
  const { theme } = useTheme();

  // Format line number
  const formatLineNumber = (num: number | undefined): string => {
    if (num === undefined) {
      return "".padStart(lineNumberWidth, " ");
    }
    return String(num).padStart(lineNumberWidth, " ");
  };

  // Get content (remove prefix char for display)
  const getContent = (line: ParsedLine | null): string => {
    if (!line) return "";
    if (line.type === "added" || line.type === "removed" || line.type === "context") {
      return line.content.slice(1);
    }
    return line.content;
  };

  // Truncate content to fit column width
  const truncateContent = (content: string, maxWidth: number): string => {
    if (content.length <= maxWidth) {
      return content;
    }
    return `${content.slice(0, maxWidth - 1)}…`;
  };

  // For headers/hunks, span both columns with enhanced styling
  if (pair.left?.type === "header" || pair.left?.type === "hunk") {
    const isHunk = pair.left.type === "hunk";
    return (
      <Box>
        {isHunk && (
          <Text color={theme.colors.info} bold>
            ≡{" "}
          </Text>
        )}
        <Text color={isHunk ? theme.colors.info : theme.semantic.text.muted} dimColor={!isHunk}>
          {pair.left.content}
        </Text>
      </Box>
    );
  }

  // Calculate content width per column
  const lineNumSpace = showLineNumbers ? lineNumberWidth + 2 : 0;
  const contentWidth = columnWidth - lineNumSpace - 3; // -3 for symbol, space, and padding

  // Render left side (old/removed) with enhanced colors
  const leftContent = getContent(pair.left);
  const leftColor =
    pair.left?.type === "removed" ? theme.colors.error : theme.semantic.text.secondary;
  const leftSymbol = pair.left?.type === "removed" ? "◀" : pair.left ? " " : " ";
  const leftIsBold = pair.left?.type === "removed";

  // Render right side (new/added) with enhanced colors
  const rightContent = getContent(pair.right);
  const rightColor =
    pair.right?.type === "added" ? theme.colors.success : theme.semantic.text.secondary;
  const rightSymbol = pair.right?.type === "added" ? "▶" : pair.right ? " " : " ";
  const rightIsBold = pair.right?.type === "added";

  return (
    <Box>
      {/* Left column (old/removed) */}
      <Box width={columnWidth}>
        {showLineNumbers && (
          <Text
            color={pair.left?.type === "removed" ? theme.colors.error : theme.semantic.text.muted}
            dimColor={pair.left?.type !== "removed"}
          >
            {formatLineNumber(pair.left?.oldLineNumber)}
          </Text>
        )}
        {showLineNumbers && <Text color={theme.semantic.border.muted}>│</Text>}
        <Text color={leftColor} bold={leftIsBold}>
          {leftSymbol}{" "}
        </Text>
        <Text color={leftColor} bold={leftIsBold}>
          {truncateContent(leftContent, contentWidth)}
        </Text>
      </Box>

      {/* Center divider */}
      <Text color={theme.semantic.border.default}>║</Text>

      {/* Right column (new/added) */}
      <Box width={columnWidth}>
        {showLineNumbers && (
          <Text
            color={pair.right?.type === "added" ? theme.colors.success : theme.semantic.text.muted}
            dimColor={pair.right?.type !== "added"}
          >
            {formatLineNumber(pair.right?.newLineNumber)}
          </Text>
        )}
        {showLineNumbers && <Text color={theme.semantic.border.muted}>│</Text>}
        <Text color={rightColor} bold={rightIsBold}>
          {rightSymbol}{" "}
        </Text>
        <Text color={rightColor} bold={rightIsBold}>
          {truncateContent(rightContent, contentWidth)}
        </Text>
      </Box>
    </Box>
  );
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * DiffView displays a diff with proper styling.
 * Supports both unified and side-by-side display modes.
 *
 * @example
 * ```tsx
 * <DiffView
 *   diff={unifiedDiff}
 *   fileName="src/index.ts"
 *   showLineNumbers
 *   mode="side-by-side"
 * />
 * ```
 */
export function DiffView({
  diff,
  fileName,
  showLineNumbers = false,
  compact = false,
  mode = "unified",
}: DiffViewProps): React.ReactElement {
  const { theme } = useTheme();

  // Get terminal width for auto-degradation and column calculation
  const terminalWidth = getTerminalWidth();

  // Auto-degrade to unified mode if terminal is too narrow
  const effectiveMode = terminalWidth < SIDE_BY_SIDE_MIN_WIDTH ? "unified" : mode;

  // Parse the diff
  const parsedLines = useMemo(() => parseDiff(diff), [diff]);

  // Calculate line number width based on max line number
  const lineNumberWidth = useMemo(() => {
    let maxLineNumber = 0;
    for (const line of parsedLines) {
      if (line.oldLineNumber !== undefined && line.oldLineNumber > maxLineNumber) {
        maxLineNumber = line.oldLineNumber;
      }
      if (line.newLineNumber !== undefined && line.newLineNumber > maxLineNumber) {
        maxLineNumber = line.newLineNumber;
      }
    }
    return Math.max(3, String(maxLineNumber).length);
  }, [parsedLines]);

  // Filter out file headers if fileName is provided (we'll show our own)
  const displayLines = fileName
    ? parsedLines.filter((line) => line.type !== "header")
    : parsedLines;

  // Generate stable keys for each line based on type and line numbers
  const getLineKey = (line: ParsedLine, position: number): string => {
    const oldNum = line.oldLineNumber ?? "x";
    const newNum = line.newLineNumber ?? "x";
    return `${line.type}-${oldNum}-${newNum}-${position}`;
  };

  // Calculate column width for side-by-side mode
  // Account for: borders (4), divider (1), padding (2)
  const columnWidth = Math.floor((terminalWidth - 7) / 2);

  // Convert to side-by-side pairs if needed
  const sideBySidePairs = useMemo(
    () => (effectiveMode === "side-by-side" ? toSideBySidePairs(displayLines) : []),
    [displayLines, effectiveMode]
  );

  // Render unified mode
  if (effectiveMode === "unified") {
    return (
      <Box flexDirection="column">
        {fileName && <FileHeader fileName={fileName} />}
        <Box
          flexDirection="column"
          borderStyle="single"
          borderColor={theme.semantic.border.default}
          paddingX={compact ? 0 : 1}
          paddingY={compact ? 0 : 0}
        >
          {displayLines.map((line, position) => (
            <DiffLineRenderer
              key={getLineKey(line, position)}
              line={line}
              showLineNumbers={showLineNumbers}
              lineNumberWidth={lineNumberWidth}
            />
          ))}
        </Box>
      </Box>
    );
  }

  // Generate stable key for side-by-side rows
  const getSideBySideKey = (pair: SideBySideLine, position: number): string => {
    const leftNum = pair.left?.oldLineNumber ?? pair.left?.newLineNumber ?? "x";
    const rightNum = pair.right?.newLineNumber ?? pair.right?.oldLineNumber ?? "x";
    const leftType = pair.left?.type ?? "empty";
    const rightType = pair.right?.type ?? "empty";
    return `sbs-${leftType}-${leftNum}-${rightType}-${rightNum}-${position}`;
  };

  // Render side-by-side mode
  return (
    <Box flexDirection="column">
      {fileName && <FileHeader fileName={fileName} />}
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor={theme.semantic.border.default}
        paddingX={compact ? 0 : 1}
        paddingY={compact ? 0 : 0}
      >
        {sideBySidePairs.map((pair, index) => (
          <SideBySideRow
            key={getSideBySideKey(pair, index)}
            pair={pair}
            showLineNumbers={showLineNumbers}
            lineNumberWidth={lineNumberWidth}
            columnWidth={columnWidth}
          />
        ))}
      </Box>
    </Box>
  );
}
