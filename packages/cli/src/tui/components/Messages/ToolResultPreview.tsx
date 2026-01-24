/**
 * ToolResultPreview Component
 *
 * Renders tool call results with line truncation and format-aware display.
 * Supports different content types: strings, objects, arrays, directory listings.
 *
 * @module tui/components/Messages/ToolResultPreview
 */

import { Box, Text } from "ink";
import type React from "react";
import { memo, useMemo } from "react";
import { useTheme } from "../../theme/index.js";

// =============================================================================
// Constants
// =============================================================================

/** Default maximum lines for tool result preview */
export const TOOL_RESULT_MAX_LINES = 5;

/** Maximum lines for shell/bash command output */
export const SHELL_TOOL_MAX_LINES = 50;

/** Shell-related tool names that get more output lines */
const SHELL_TOOLS = new Set(["bash", "shell", "run_command", "execute_command", "terminal"]);

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the ToolResultPreview component.
 */
export interface ToolResultPreviewProps {
  /** The result content to display */
  readonly result: unknown;
  /** The tool name (used to determine line limits) */
  readonly toolName: string;
  /** Override the maximum lines to display */
  readonly maxLines?: number;
}

/**
 * A displayable line with optional styling metadata.
 */
interface DisplayLine {
  readonly text: string;
  /** If true, render with bold + cyan for directories */
  readonly isDirectory?: boolean;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Determines if a tool is a shell/command execution tool.
 */
function isShellTool(toolName: string): boolean {
  const lowerName = toolName.toLowerCase();
  return SHELL_TOOLS.has(lowerName) || lowerName.includes("bash") || lowerName.includes("shell");
}

/**
 * Checks if an item looks like a directory entry.
 */
function isDirectoryItem(item: unknown): item is { name: string; type?: string } {
  if (!item || typeof item !== "object") {
    return false;
  }
  const obj = item as Record<string, unknown>;
  return typeof obj.name === "string";
}

/**
 * Formats a directory item with type indicator.
 * Directories: bold cyan with trailing slash
 * Files: indented plain text
 */
function formatDirectoryItem(item: unknown): DisplayLine {
  if (!isDirectoryItem(item)) {
    return { text: String(item) };
  }
  const { name, type } = item;
  const isDir = type === "directory" || type === "dir" || name.endsWith("/");
  if (isDir) {
    const cleanName = name.replace(/\/$/, "");
    return { text: `${cleanName}/`, isDirectory: true };
  }
  return { text: `  ${name}` };
}

/**
 * Creates a plain display line from text.
 */
function plainLine(text: string): DisplayLine {
  return { text };
}

/**
 * Converts result to displayable lines.
 */
function resultToLines(result: unknown): DisplayLine[] {
  if (result === null || result === undefined) {
    return [];
  }

  if (typeof result === "string") {
    return result.split("\n").map(plainLine);
  }

  if (Array.isArray(result)) {
    // Check if it's a directory listing (items with name/type)
    if (result.length > 0 && isDirectoryItem(result[0])) {
      return result.map(formatDirectoryItem);
    }
    // Generic array - show as JSON lines
    return result
      .map((item) => (typeof item === "string" ? item : JSON.stringify(item, null, 2)))
      .flatMap((s) => s.split("\n"))
      .map(plainLine);
  }

  if (typeof result === "object") {
    // Check for content field (common in tool results)
    const obj = result as Record<string, unknown>;
    if (typeof obj.content === "string") {
      return obj.content.split("\n").map(plainLine);
    }
    if (typeof obj.output === "string") {
      return obj.output.split("\n").map(plainLine);
    }
    if (typeof obj.text === "string") {
      return obj.text.split("\n").map(plainLine);
    }
    // Check for entries array (directory listings)
    if (Array.isArray(obj.entries)) {
      return obj.entries.map(formatDirectoryItem);
    }
    // Fallback: JSON stringify
    return JSON.stringify(result, null, 2).split("\n").map(plainLine);
  }

  return [plainLine(String(result))];
}

/**
 * Truncates lines and returns truncation info.
 */
function truncateLines(
  lines: DisplayLine[],
  maxLines: number
): { visibleLines: DisplayLine[]; hiddenCount: number } {
  if (lines.length <= maxLines) {
    return { visibleLines: lines, hiddenCount: 0 };
  }
  return {
    visibleLines: lines.slice(0, maxLines),
    hiddenCount: lines.length - maxLines,
  };
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * ToolResultPreview displays tool call results with smart truncation.
 *
 * Features:
 * - Codex-style line truncation (5 lines default, 50 for shell)
 * - Format-aware rendering (directory listings, JSON, plain text)
 * - Shows "+ N lines" indicator when truncated
 * - Directories styled with bold cyan, files with indent
 *
 * @example
 * ```tsx
 * <ToolResultPreview
 *   result="line1\nline2\nline3\nline4\nline5\nline6"
 *   toolName="read_file"
 * />
 * // Output:
 * // line1
 * // line2
 * // line3
 * // line4
 * // line5
 * // ... +1 lines
 * ```
 */
export const ToolResultPreview = memo(function ToolResultPreview({
  result,
  toolName,
  maxLines: maxLinesOverride,
}: ToolResultPreviewProps): React.JSX.Element | null {
  const { theme } = useTheme();

  // Determine max lines based on tool type
  const maxLines = useMemo(() => {
    if (maxLinesOverride !== undefined) {
      return maxLinesOverride;
    }
    return isShellTool(toolName) ? SHELL_TOOL_MAX_LINES : TOOL_RESULT_MAX_LINES;
  }, [toolName, maxLinesOverride]);

  // Convert result to lines and truncate
  const { visibleLines, hiddenCount } = useMemo(() => {
    const allLines = resultToLines(result);
    // Filter out empty trailing lines
    while (allLines.length > 0 && allLines[allLines.length - 1]?.text.trim() === "") {
      allLines.pop();
    }
    return truncateLines(allLines, maxLines);
  }, [result, maxLines]);

  // Don't render if no content
  if (visibleLines.length === 0) {
    return null;
  }

  const mutedColor = theme.semantic.text.muted;

  return (
    <Box flexDirection="column">
      {visibleLines.map((line, index) => (
        <Text
          key={`${index}-${line.text.slice(0, 20)}`}
          wrap="truncate"
          bold={line.isDirectory}
          color={line.isDirectory ? theme.colors.info : undefined}
        >
          {line.text}
        </Text>
      ))}
      {hiddenCount > 0 && (
        <Text color={mutedColor} dimColor>
          ... +{hiddenCount} {hiddenCount === 1 ? "line" : "lines"}
        </Text>
      )}
    </Box>
  );
});
