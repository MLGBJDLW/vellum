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
import { useTheme } from "../../theme/index.js";

// =============================================================================
// Types
// =============================================================================

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

function DiffLineRenderer({
  line,
  showLineNumbers,
  lineNumberWidth,
}: DiffLineRendererProps): React.ReactElement {
  const { theme } = useTheme();
  const diffColors = theme.semantic.diff;

  // Determine colors based on line type
  const getLineStyle = (): { bgColor?: string; textColor: string; prefix: string } => {
    switch (line.type) {
      case "added":
        return {
          bgColor: diffColors.added,
          textColor: diffColors.added,
          prefix: "+",
        };
      case "removed":
        return {
          bgColor: diffColors.removed,
          textColor: diffColors.removed,
          prefix: "-",
        };
      case "hunk":
        return {
          textColor: theme.colors.info,
          prefix: "",
        };
      case "header":
        return {
          textColor: theme.semantic.text.muted,
          prefix: "",
        };
      default:
        return {
          textColor: theme.semantic.text.primary,
          prefix: " ",
        };
    }
  };

  const style = getLineStyle();

  // Format line numbers
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

  return (
    <Box>
      {showLineNumbers &&
        (line.type === "added" || line.type === "removed" || line.type === "context") && (
          <Box marginRight={1}>
            <Text color={theme.semantic.text.muted} dimColor>
              {formatLineNumber(line.oldLineNumber)}
            </Text>
            <Text color={theme.semantic.border.muted}> </Text>
            <Text color={theme.semantic.text.muted} dimColor>
              {formatLineNumber(line.newLineNumber)}
            </Text>
            <Text color={theme.semantic.border.muted}>│</Text>
          </Box>
        )}
      {showLineNumbers && (line.type === "hunk" || line.type === "header") && (
        <Box marginRight={1}>
          <Text color={theme.semantic.text.muted}>{"".padStart(lineNumberWidth * 2 + 2, " ")}</Text>
          <Text color={theme.semantic.border.muted}>│</Text>
        </Box>
      )}
      <Box flexGrow={1}>
        {line.type === "added" && (
          <Text color={style.textColor} bold>
            +
          </Text>
        )}
        {line.type === "removed" && (
          <Text color={style.textColor} bold>
            -
          </Text>
        )}
        {line.type === "context" && <Text color={style.textColor}> </Text>}
        <Text color={style.textColor}>{displayContent}</Text>
      </Box>
    </Box>
  );
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * DiffView displays a unified diff with proper styling.
 *
 * @example
 * ```tsx
 * <DiffView
 *   diff={unifiedDiff}
 *   fileName="src/index.ts"
 *   showLineNumbers
 * />
 * ```
 */
export function DiffView({
  diff,
  fileName,
  showLineNumbers = false,
  compact = false,
}: DiffViewProps): React.ReactElement {
  const { theme } = useTheme();

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
