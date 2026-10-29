/**
 * SnapshotCheckpointPanel Component
 *
 * React Ink component for managing file state checkpoints using the Snapshot system.
 * Displays recent snapshots with keyboard navigation for viewing, restoring, and creating.
 *
 * @module tui/components/Checkpoint/SnapshotCheckpointPanel
 */

import type { SnapshotInfo } from "@vellum/core";
import { Box, type DOMElement, Text } from "ink";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMouseScroll } from "../../hooks/useMouseScroll.js";
import { useInput } from "../../hooks/useTerminalInput.js";
import { useTheme } from "../../theme/index.js";
import { Clickable, getVisibleClickBounds } from "../common/Clickable.js";
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
  /** Available sidebar width in terminal columns. Defaults to the parent width. */
  readonly width?: number;
  /** Whether the panel is focused for keyboard input */
  readonly isFocused?: boolean;
  /** Whether the visible sidebar accepts mouse actions independently of keyboard focus. */
  readonly mouseEnabled?: boolean;
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
  readonly primaryColor: string;
  readonly mutedColor: string;
  readonly textColor: string;
}

function SnapshotItem({
  snapshot,
  index,
  isSelected,
  primaryColor,
  mutedColor,
  textColor,
}: SnapshotItemProps): React.JSX.Element {
  const indicator = isSelected ? "[>]" : `[${index + 1}]`;
  const hashShort = snapshot.hash.slice(0, 7);
  const timeStr = formatRelativeTime(snapshot.timestamp);
  const message = snapshot.message ?? "(no message)";
  const fileCount = snapshot.files.length;

  return (
    <Box flexDirection="column" width="100%" height={2} flexShrink={0}>
      <Text wrap="truncate">
        <Text color={isSelected ? primaryColor : mutedColor} bold={isSelected}>
          {indicator}{" "}
        </Text>
        <Text color={isSelected ? textColor : mutedColor} bold={isSelected}>
          {message}
        </Text>
      </Text>
      <Text color={mutedColor} dimColor wrap="truncate">
        {hashShort} • {fileCount} file{fileCount === 1 ? "" : "s"} • {timeStr}
      </Text>
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
  width,
  isFocused = true,
  mouseEnabled = isFocused,
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
  const listRef = useRef<DOMElement>(null);

  // Colors from theme
  const primaryColor = theme.brand.primary;
  const mutedColor = theme.semantic.text.muted;
  const textColor = theme.semantic.text.primary;
  const borderColor = theme.semantic.border.default;
  const errorColor = theme.colors.error;

  // Reserve both borders, two header lines, and the fixed three-line action bar.
  const panelHeight = Math.max(1, Math.floor(maxHeight));
  const listHeight = Math.max(0, panelHeight - 7);
  const maxVisible = Math.max(1, Math.floor(listHeight / 2));
  const canUseSnapshots = !isLoading && !error && isInitialized && snapshots.length > 0;
  const maxOffset = Math.max(0, snapshots.length - maxVisible);
  useEffect(() => {
    setSelectedIndex((index) => Math.min(index, Math.max(0, snapshots.length - 1)));
    setScrollOffset((offset) => Math.min(offset, maxOffset));
  }, [snapshots.length, maxOffset]);
  useEffect(() => {
    setScrollOffset((offset) =>
      Math.min(
        maxOffset,
        selectedIndex < offset
          ? selectedIndex
          : selectedIndex >= offset + maxVisible
            ? selectedIndex - maxVisible + 1
            : offset
      )
    );
  }, [selectedIndex, maxVisible, maxOffset]);
  useMouseScroll({
    enabled: mouseEnabled && !isLoading && !error && isInitialized,
    bounds: () => {
      const bounds = getVisibleClickBounds(listRef.current);
      return bounds ? { ...bounds, top: bounds.top - 1, left: bounds.left - 1 } : null;
    },
    onScroll: (delta) =>
      setScrollOffset((offset) => Math.max(0, Math.min(offset + delta, maxOffset))),
  });

  // Get visible snapshots
  const visibleSnapshots = useMemo(
    () => getVisibleEntries(snapshots, scrollOffset, maxVisible),
    [snapshots, scrollOffset, maxVisible]
  );

  // Scroll indicators
  const canScrollUp = scrollOffset > 0;
  const canScrollDown = scrollOffset + maxVisible < snapshots.length;

  const newCheckpoint = (
    <Clickable
      id="snapshot-new"
      width="auto"
      enabled={mouseEnabled && !isLoading && !!onTakeCheckpoint}
      onClick={() => onTakeCheckpoint?.()}
    >
      <HotkeyHints hints={[{ keys: "n", label: "new" }]} />
    </Clickable>
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
    (input, key) => {
      if (!isFocused || isLoading) return;
      if (input === "n") {
        onTakeCheckpoint?.();
        return;
      }
      if (input === "R") {
        onRefresh?.();
        return;
      }
      if (!canUseSnapshots) return;

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
    },
    { isActive: isFocused }
  );

  const statusMessage = isLoading
    ? "Loading..."
    : error
      ? `Error: ${error}`
      : !isInitialized
        ? "Not initialized. Press n to create a checkpoint."
        : snapshots.length === 0
          ? "No checkpoints yet. Press n to create one."
          : null;
  return (
    <Box
      flexDirection="column"
      width={width ?? "100%"}
      maxWidth="100%"
      height={panelHeight}
      flexShrink={0}
      overflow="hidden"
      borderStyle="single"
      borderColor={borderColor}
      paddingX={1}
    >
      {/* Header */}
      <Box height={1} flexShrink={0}>
        <Text color={primaryColor} bold wrap="truncate">
          [*] Checkpoints ({snapshots.length})
        </Text>
      </Box>
      <Box height={1} flexShrink={0}>
        <Text color={mutedColor} wrap="truncate">
          j/k navigate{" "}
          {canUseSnapshots
            ? `${scrollOffset + 1}-${Math.min(scrollOffset + maxVisible, snapshots.length)}/${snapshots.length}`
            : ""}{" "}
          {canScrollUp ? "↑" : ""}
          {canScrollDown ? "↓" : ""}
        </Text>
      </Box>

      {/* Snapshot list */}
      <Box
        ref={listRef}
        flexDirection="column"
        height={listHeight}
        flexShrink={0}
        overflow="hidden"
      >
        {statusMessage ? (
          <Text color={error ? errorColor : mutedColor}>{statusMessage}</Text>
        ) : (
          visibleSnapshots.map((snapshot, visibleIdx) => {
            const actualIndex = scrollOffset + visibleIdx;
            return (
              <Clickable
                key={snapshot.hash}
                id={`snapshot-${snapshot.hash}`}
                enabled={mouseEnabled}
                onClick={() => navigateToIndex(actualIndex)}
              >
                <SnapshotItem
                  snapshot={snapshot}
                  index={actualIndex}
                  isSelected={actualIndex === selectedIndex}
                  primaryColor={primaryColor}
                  mutedColor={mutedColor}
                  textColor={textColor}
                />
              </Clickable>
            );
          })
        )}
      </Box>

      {/* Hints */}
      <Box
        flexDirection="column"
        height={3}
        flexShrink={0}
        borderStyle="single"
        borderTop
        borderBottom={false}
        borderLeft={false}
        borderRight={false}
        borderColor={borderColor}
      >
        <Box height={1} flexShrink={0} gap={2}>
          <Clickable
            id="snapshot-restore"
            width="auto"
            enabled={mouseEnabled && canUseSnapshots && !!onRestore}
            onClick={() => {
              const snapshot = snapshots[selectedIndex];
              if (snapshot) onRestore?.(snapshot.hash);
            }}
          >
            <HotkeyHints hints={[{ keys: "r", label: "restore" }]} />
          </Clickable>
          <Clickable
            id="snapshot-diff"
            width="auto"
            enabled={mouseEnabled && canUseSnapshots && !!onDiff}
            onClick={() => {
              const snapshot = snapshots[selectedIndex];
              if (snapshot) onDiff?.(snapshot.hash);
            }}
          >
            <HotkeyHints hints={[{ keys: "d", label: "diff" }]} />
          </Clickable>
        </Box>
        <Box height={1} flexShrink={0} gap={2}>
          {newCheckpoint}
          <Clickable
            id="snapshot-refresh"
            width="auto"
            enabled={mouseEnabled && !isLoading && !!onRefresh}
            onClick={() => onRefresh?.()}
          >
            <HotkeyHints hints={[{ keys: "R", label: "refresh" }]} />
          </Clickable>
        </Box>
      </Box>
    </Box>
  );
}

export default SnapshotCheckpointPanel;
