/**
 * SnapshotCheckpointPanel Component
 *
 * React Ink component for managing file state checkpoints using the Snapshot system.
 * Displays recent snapshots with keyboard navigation for viewing, restoring, and creating.
 *
 * @module tui/components/Checkpoint/SnapshotCheckpointPanel
 */

import type { SnapshotInfo } from "@vellum/core";
import { Box, Text, useInput } from "ink";
import type React from "react";
import { useCallback, useMemo, useState } from "react";
import { useTheme } from "../../theme/index.js";
import { truncateToDisplayWidth } from "../../utils/index.js";
import { HotkeyHints } from "../common/HotkeyHints.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the SnapshotCheckpointPanel component.
 */
export interface SnapshotCheckpointPanelProps {
  /** List of snapshots to display */
  readonly snapshots: readonly SnapshotInfo[];
  /** Whether snapshots are loading */
  readonly isLoading: boolean;
  /** Error message if any */
  readonly error: string | null;
  /** Whether the snapshot system is initialized */
  readonly isInitialized: boolean;
  /** Maximum height in lines */
  readonly maxHeight?: number;
  /** Whether the panel is focused for keyboard input */
  readonly isFocused?: boolean;
  /** Callback when restore is requested */
  readonly onRestore?: (hash: string) => void;
  /** Callback when diff is requested */
  readonly onDiff?: (hash: string) => void;
  /** Callback when new checkpoint is requested */
  readonly onTakeCheckpoint?: () => void;
  /** Callback to refresh the list */
  readonly onRefresh?: () => void;
  /** Callback when a snapshot is selected */
  readonly onSelect?: (snapshot: SnapshotInfo | null) => void;
}

// =============================================================================
// Constants
// =============================================================================

/** Default maximum height */
const DEFAULT_MAX_HEIGHT = 12;

/** Number of items per page */
const PAGE_SIZE = 5;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Format relative time from a date.
 */
function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ago`;
  }
  if (hours > 0) {
    return `${hours}h ago`;
  }
  if (minutes > 0) {
    return `${minutes}m ago`;
  }
  return "just now";
}

/**
 * Truncate text to max width.
 */
function truncate(text: string, maxLength: number): string {
  return truncateToDisplayWidth(text, maxLength);
}

/**
 * Get visible entries based on scroll position.
 */
function getVisibleEntries<T>(
  entries: readonly T[],
  scrollOffset: number,
  maxVisible: number
): readonly T[] {
  return entries.slice(scrollOffset, scrollOffset + maxVisible);
}

// =============================================================================
// SnapshotItem Component
// =============================================================================

interface SnapshotItemProps {
  readonly snapshot: SnapshotInfo;
  readonly index: number;
  readonly isSelected: boolean;
  readonly width: number;
  readonly primaryColor: string;
  readonly mutedColor: string;
  readonly textColor: string;
}

function SnapshotItem({
  snapshot,
  index,
  isSelected,
  width,
  primaryColor,
  mutedColor,
  textColor,
}: SnapshotItemProps): React.JSX.Element {
  const indicator = isSelected ? "[>]" : `[${index + 1}]`;
  const hashShort = snapshot.hash.slice(0, 7);
  const timeStr = formatRelativeTime(snapshot.timestamp);
  const message = snapshot.message ?? "(no message)";
  const fileCount = snapshot.files.length;

  // Calculate available width for message
  const fixedWidth = 5 + 8 + 3 + 10 + 3; // indicator + hash + spacing + time + spacing
  const messageWidth = Math.max(width - fixedWidth - 4, 10);

  return (
    <Box flexDirection="column" paddingLeft={1}>
      <Box flexDirection="row">
        <Text color={isSelected ? primaryColor : mutedColor} bold={isSelected}>
          {indicator}
        </Text>
        <Text> </Text>
        <Text color={isSelected ? primaryColor : textColor} bold={isSelected}>
          {hashShort}
        </Text>
        <Text color={mutedColor}> - </Text>
        <Text color={mutedColor}>{timeStr}</Text>
        <Text color={mutedColor}> - </Text>
        <Text color={isSelected ? textColor : mutedColor} dimColor={!isSelected}>
          "{truncate(message, messageWidth)}"
        </Text>
      </Box>
      <Box paddingLeft={5}>
        <Text color={mutedColor} dimColor>
          Files: {fileCount} changed
        </Text>
      </Box>
    </Box>
  );
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * SnapshotCheckpointPanel - Displays file state checkpoints from the Snapshot system.
 *
 * Features:
 * - List recent checkpoints (limit 10)
 * - Show relative time, message, file count
 * - Keyboard navigation: j/k or arrows
 * - r = restore selected
 * - d = show diff
 * - n = take new checkpoint
 *
 * @example
 * ```tsx
 * <SnapshotCheckpointPanel
 *   snapshots={snapshots}
 *   isLoading={false}
 *   error={null}
 *   isInitialized={true}
 *   isFocused={true}
 *   onRestore={(hash) => restore(hash)}
 *   onDiff={(hash) => showDiff(hash)}
 *   onTakeCheckpoint={() => takeCheckpoint()}
 * />
 * ```
 */
export function SnapshotCheckpointPanel({
  snapshots,
  isLoading,
  error,
  isInitialized,
  maxHeight = DEFAULT_MAX_HEIGHT,
  isFocused = true,
  onRestore,
  onDiff,
  onTakeCheckpoint,
  onRefresh,
  onSelect,
}: SnapshotCheckpointPanelProps): React.JSX.Element {
  const { theme } = useTheme();

  // State
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);

  // Colors from theme
  const primaryColor = theme.brand.primary;
  const mutedColor = theme.semantic.text.muted;
  const textColor = theme.semantic.text.primary;
  const borderColor = theme.semantic.border.default;
  const errorColor = theme.colors.error;

  // Calculate visible items (account for header and hints)
  const maxVisible = Math.max(1, Math.floor((maxHeight - 5) / 2)); // Each item takes 2 lines

  // Get visible snapshots
  const visibleSnapshots = useMemo(
    () => getVisibleEntries(snapshots, scrollOffset, maxVisible),
    [snapshots, scrollOffset, maxVisible]
  );

  // Scroll indicators
  const canScrollUp = scrollOffset > 0;
  const canScrollDown = scrollOffset + maxVisible < snapshots.length;

  // Hotkey hints
  const hints = useMemo(
    () => [
      { keys: "j/k", label: "navigate" },
      { keys: "r", label: "restore" },
      { keys: "d", label: "diff" },
      { keys: "n", label: "new" },
    ],
    []
  );

  /**
   * Navigate to a specific index.
   */
  const navigateToIndex = useCallback(
    (newIndex: number) => {
      const maxIndex = Math.max(0, snapshots.length - 1);
      const clampedIndex = Math.max(0, Math.min(newIndex, maxIndex));
      setSelectedIndex(clampedIndex);

      // Adjust scroll to keep selection visible
      if (clampedIndex < scrollOffset) {
        setScrollOffset(clampedIndex);
      } else if (clampedIndex >= scrollOffset + maxVisible) {
        setScrollOffset(clampedIndex - maxVisible + 1);
      }

      // Notify parent
      const selectedSnapshot = snapshots[clampedIndex] ?? null;
      onSelect?.(selectedSnapshot);
    },
    [snapshots, scrollOffset, maxVisible, onSelect]
  );

  // Handle keyboard input
  useInput(
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Input handler must process multiple key bindings for navigation and actions
    (input, key) => {
      if (!isFocused) return;

      // Navigation down
      if (input === "j" || key.downArrow) {
        navigateToIndex(selectedIndex + 1);
        return;
      }

      // Navigation up
      if (input === "k" || key.upArrow) {
        navigateToIndex(selectedIndex - 1);
        return;
      }

      // Page down
      if (key.pageDown || (key.ctrl && input === "d")) {
        navigateToIndex(selectedIndex + PAGE_SIZE);
        return;
      }

      // Page up
      if (key.pageUp || (key.ctrl && input === "u")) {
        navigateToIndex(selectedIndex - PAGE_SIZE);
        return;
      }

      // Restore
      if (input === "r" && snapshots.length > 0) {
        const snapshot = snapshots[selectedIndex];
        if (snapshot) {
          onRestore?.(snapshot.hash);
        }
        return;
      }

      // Diff
      if (input === "d" && snapshots.length > 0) {
        const snapshot = snapshots[selectedIndex];
        if (snapshot) {
          onDiff?.(snapshot.hash);
        }
        return;
      }

      // New checkpoint
      if (input === "n") {
        onTakeCheckpoint?.();
        return;
      }

      // Refresh
      if (input === "R") {
        onRefresh?.();
        return;
      }
    },
    { isActive: isFocused }
  );

  // Loading state
  if (isLoading) {
    return (
      <Box flexDirection="column" borderStyle="single" borderColor={borderColor} paddingX={1}>
        <Box>
          <Text color={primaryColor} bold>
            [*] Checkpoints
          </Text>
        </Box>
        <Box paddingY={1}>
          <Text color={mutedColor}>Loading...</Text>
        </Box>
      </Box>
    );
  }

  // Error state
  if (error) {
    return (
      <Box flexDirection="column" borderStyle="single" borderColor={borderColor} paddingX={1}>
        <Box>
          <Text color={primaryColor} bold>
            [*] Checkpoints
          </Text>
        </Box>
        <Box paddingY={1}>
          <Text color={errorColor}>Error: {error}</Text>
        </Box>
        <HotkeyHints hints={[{ keys: "n", label: "initialize" }]} />
      </Box>
    );
  }

  // Not initialized state
  if (!isInitialized) {
    return (
      <Box flexDirection="column" borderStyle="single" borderColor={borderColor} paddingX={1}>
        <Box>
          <Text color={primaryColor} bold>
            [*] Checkpoints
          </Text>
        </Box>
        <Box paddingY={1}>
          <Text color={mutedColor}>Not initialized. Press 'n' to create first checkpoint.</Text>
        </Box>
        <HotkeyHints hints={[{ keys: "n", label: "new checkpoint" }]} />
      </Box>
    );
  }

  // Empty state
  if (snapshots.length === 0) {
    return (
      <Box flexDirection="column" borderStyle="single" borderColor={borderColor} paddingX={1}>
        <Box>
          <Text color={primaryColor} bold>
            [*] Checkpoints (0)
          </Text>
        </Box>
        <Box paddingY={1}>
          <Text color={mutedColor}>No checkpoints yet. Press 'n' to create one.</Text>
        </Box>
        <HotkeyHints hints={[{ keys: "n", label: "new checkpoint" }]} />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" borderStyle="single" borderColor={borderColor} paddingX={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text color={primaryColor} bold>
          [*] Checkpoints ({snapshots.length})
        </Text>
        {canScrollUp && <Text color={mutedColor}> [-] more above</Text>}
        {canScrollDown && <Text color={mutedColor}> [+] more below</Text>}
      </Box>

      {/* Separator */}
      <Box>
        <Text color={borderColor}>{"─".repeat(40)}</Text>
      </Box>

      {/* Snapshot list */}
      <Box flexDirection="column">
        {visibleSnapshots.map((snapshot, visibleIdx) => {
          const actualIndex = scrollOffset + visibleIdx;
          return (
            <SnapshotItem
              key={snapshot.hash}
              snapshot={snapshot}
              index={actualIndex}
              isSelected={actualIndex === selectedIndex}
              width={60}
              primaryColor={primaryColor}
              mutedColor={mutedColor}
              textColor={textColor}
            />
          );
        })}
      </Box>

      {/* Hints */}
      <Box marginTop={1}>
        <HotkeyHints hints={hints} />
      </Box>
    </Box>
  );
}

export default SnapshotCheckpointPanel;
