/**
 * CheckpointDiffView Component
 *
 * React Ink component for displaying diff output between current state
 * and a selected snapshot checkpoint.
 *
 * @module tui/components/Checkpoint/CheckpointDiffView
 */

import { Box, Text, useInput } from "ink";
import type React from "react";
import { useCallback, useMemo, useState } from "react";
import { useTheme } from "../../theme/index.js";
import { HotkeyHints } from "../common/HotkeyHints.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the CheckpointDiffView component.
 */
export interface CheckpointDiffViewProps {
  /** The diff content to display */
  readonly diffContent: string;
  /** The snapshot hash being diffed */
  readonly snapshotHash?: string;
  /** Maximum height in lines */
  readonly maxHeight?: number;
  /** Whether the panel is focused for keyboard input */
  readonly isFocused?: boolean;
  /** Whether the diff is loading */
  readonly isLoading?: boolean;
  /** Callback to close the diff view */
  readonly onClose?: () => void;
}

// =============================================================================
// Constants
// =============================================================================

/** Default maximum height */
const DEFAULT_MAX_HEIGHT = 20;

/** Number of lines per page */
const PAGE_SIZE = 10;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Parse diff content into lines with styling information.
 */
interface DiffLine {
  readonly content: string;
  readonly type: "header" | "add" | "remove" | "context" | "hunk" | "meta";
}

function parseDiffLines(content: string): readonly DiffLine[] {
  const lines = content.split("\n");
  return lines.map((line): DiffLine => {
    if (line.startsWith("diff --git") || line.startsWith("index ")) {
      return { content: line, type: "meta" };
    }
    if (line.startsWith("---") || line.startsWith("+++")) {
      return { content: line, type: "header" };
    }
    if (line.startsWith("@@")) {
      return { content: line, type: "hunk" };
    }
    if (line.startsWith("+")) {
      return { content: line, type: "add" };
    }
    if (line.startsWith("-")) {
      return { content: line, type: "remove" };
    }
    return { content: line, type: "context" };
  });
}

/**
 * Get visible lines based on scroll position.
 */
function getVisibleLines<T>(
  lines: readonly T[],
  scrollOffset: number,
  maxVisible: number
): readonly T[] {
  return lines.slice(scrollOffset, scrollOffset + maxVisible);
}

// =============================================================================
// DiffLineComponent
// =============================================================================

interface DiffLineComponentProps {
  readonly line: DiffLine;
  readonly addColor: string;
  readonly removeColor: string;
  readonly headerColor: string;
  readonly hunkColor: string;
  readonly metaColor: string;
  readonly contextColor: string;
}

function DiffLineComponent({
  line,
  addColor,
  removeColor,
  headerColor,
  hunkColor,
  metaColor,
  contextColor,
}: DiffLineComponentProps): React.JSX.Element {
  let color: string;
  let prefix = "";
  let bold = false;

  switch (line.type) {
    case "add":
      color = addColor;
      prefix = "[+] ";
      break;
    case "remove":
      color = removeColor;
      prefix = "[-] ";
      break;
    case "header":
      color = headerColor;
      bold = true;
      break;
    case "hunk":
      color = hunkColor;
      break;
    case "meta":
      color = metaColor;
      break;
    default:
      color = contextColor;
      prefix = "    ";
      break;
  }

  return (
    <Text color={color} bold={bold} wrap="truncate">
      {prefix}
      {line.content}
    </Text>
  );
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * CheckpointDiffView - Displays diff output for a snapshot.
 *
 * Features:
 * - Syntax highlighted diff output
 * - Scrollable view with j/k navigation
 * - Page up/down support
 * - Press q or Escape to close
 *
 * @example
 * ```tsx
 * <CheckpointDiffView
 *   diffContent={diffOutput}
 *   snapshotHash="abc1234"
 *   isFocused={true}
 *   onClose={() => setShowDiff(false)}
 * />
 * ```
 */
export function CheckpointDiffView({
  diffContent,
  snapshotHash,
  maxHeight = DEFAULT_MAX_HEIGHT,
  isFocused = true,
  isLoading = false,
  onClose,
}: CheckpointDiffViewProps): React.JSX.Element {
  const { theme } = useTheme();

  // State
  const [scrollOffset, setScrollOffset] = useState(0);

  // Colors from theme
  const primaryColor = theme.brand.primary;
  const borderColor = theme.semantic.border.default;
  const mutedColor = theme.semantic.text.muted;
  const addColor = theme.colors.success;
  const removeColor = theme.colors.error;
  const headerColor = theme.colors.info;
  const hunkColor = theme.colors.warning;
  const metaColor = theme.semantic.text.muted;
  const contextColor = theme.semantic.text.secondary;

  // Parse diff lines
  const diffLines = useMemo(() => parseDiffLines(diffContent), [diffContent]);

  // Calculate visible lines (account for header and footer)
  const maxVisible = Math.max(1, maxHeight - 5);

  // Get visible lines
  const visibleLines = useMemo(
    () => getVisibleLines(diffLines, scrollOffset, maxVisible),
    [diffLines, scrollOffset, maxVisible]
  );

  // Scroll indicators
  const canScrollUp = scrollOffset > 0;
  const canScrollDown = scrollOffset + maxVisible < diffLines.length;

  // Hotkey hints
  const hints = useMemo(
    () => [
      { keys: "j/k", label: "scroll" },
      { keys: "PgUp/PgDn", label: "page" },
      { keys: "q/Esc", label: "close" },
    ],
    []
  );

  /**
   * Navigate to a specific scroll position.
   */
  const scrollTo = useCallback(
    (newOffset: number) => {
      const maxOffset = Math.max(0, diffLines.length - maxVisible);
      const clampedOffset = Math.max(0, Math.min(newOffset, maxOffset));
      setScrollOffset(clampedOffset);
    },
    [diffLines.length, maxVisible]
  );

  // Handle keyboard input
  useInput(
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Input handler must process multiple key bindings for navigation
    (input, key) => {
      if (!isFocused) return;

      // Close
      if (input === "q" || key.escape) {
        onClose?.();
        return;
      }

      // Scroll down
      if (input === "j" || key.downArrow) {
        scrollTo(scrollOffset + 1);
        return;
      }

      // Scroll up
      if (input === "k" || key.upArrow) {
        scrollTo(scrollOffset - 1);
        return;
      }

      // Page down
      if (key.pageDown || (key.ctrl && input === "d")) {
        scrollTo(scrollOffset + PAGE_SIZE);
        return;
      }

      // Page up
      if (key.pageUp || (key.ctrl && input === "u")) {
        scrollTo(scrollOffset - PAGE_SIZE);
        return;
      }

      // Home
      if (input === "g") {
        scrollTo(0);
        return;
      }

      // End
      if (input === "G") {
        scrollTo(diffLines.length);
        return;
      }
    },
    { isActive: isFocused }
  );

  // Loading state
  if (isLoading) {
    return (
      <Box flexDirection="column" borderStyle="double" borderColor={borderColor} paddingX={1}>
        <Box>
          <Text color={primaryColor} bold>
            [*] Diff View
          </Text>
        </Box>
        <Box paddingY={1}>
          <Text color={mutedColor}>Loading diff...</Text>
        </Box>
      </Box>
    );
  }

  // Empty diff
  if (!diffContent || diffContent.trim() === "" || diffContent === "(no changes)") {
    return (
      <Box flexDirection="column" borderStyle="double" borderColor={borderColor} paddingX={1}>
        <Box marginBottom={1}>
          <Text color={primaryColor} bold>
            [*] Diff View
          </Text>
          {snapshotHash && <Text color={mutedColor}> ({snapshotHash.slice(0, 7)})</Text>}
        </Box>
        <Box paddingY={1}>
          <Text color={mutedColor}>(no changes from this checkpoint)</Text>
        </Box>
        <HotkeyHints hints={[{ keys: "q/Esc", label: "close" }]} />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" borderStyle="double" borderColor={borderColor} paddingX={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text color={primaryColor} bold>
          [*] Diff View
        </Text>
        {snapshotHash && <Text color={mutedColor}> ({snapshotHash.slice(0, 7)})</Text>}
        <Text color={mutedColor}> - {diffLines.length} lines</Text>
        {canScrollUp && <Text color={mutedColor}> [-] more above</Text>}
        {canScrollDown && <Text color={mutedColor}> [+] more below</Text>}
      </Box>

      {/* Separator */}
      <Box>
        <Text color={borderColor}>{"─".repeat(60)}</Text>
      </Box>

      {/* Diff content */}
      <Box flexDirection="column" height={maxVisible}>
        {visibleLines.map((line, idx) => (
          <DiffLineComponent
            key={`diff-${scrollOffset + idx}`}
            line={line}
            addColor={addColor}
            removeColor={removeColor}
            headerColor={headerColor}
            hunkColor={hunkColor}
            metaColor={metaColor}
            contextColor={contextColor}
          />
        ))}
      </Box>

      {/* Footer */}
      <Box marginTop={1}>
        <Text color={mutedColor}>
          Line {scrollOffset + 1}-{Math.min(scrollOffset + maxVisible, diffLines.length)} of{" "}
          {diffLines.length}
        </Text>
      </Box>

      {/* Hints */}
      <HotkeyHints hints={hints} />
    </Box>
  );
}

export default CheckpointDiffView;
