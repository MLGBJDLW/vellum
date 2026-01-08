/**
 * MemoryPanel Component (Phase 31)
 *
 * React Ink component for displaying project memories in a scrollable list.
 * Shows recent memories with expandable details view.
 *
 * @module tui/components/MemoryPanel
 */

import type { MemoryEntry, MemoryEntryType } from "@vellum/core";
import { Box, Text, useInput } from "ink";
import type React from "react";
import { useCallback, useMemo, useState } from "react";
import { useTheme } from "../theme/index.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the MemoryPanel component.
 */
export interface MemoryPanelProps {
  /** List of memory entries to display */
  readonly entries: readonly MemoryEntry[];
  /** Maximum height in lines */
  readonly maxHeight?: number;
  /** Whether the panel is focused for keyboard input */
  readonly isFocused?: boolean;
  /** Callback when an entry is selected */
  readonly onSelectEntry?: (entry: MemoryEntry) => void;
  /** Callback when Enter is pressed on an entry */
  readonly onActivateEntry?: (entry: MemoryEntry) => void;
  /** Whether to show the details panel */
  readonly showDetails?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/** Default maximum height */
const DEFAULT_MAX_HEIGHT = 12;

/** Number of items per page */
const PAGE_SIZE = 5;

/** Type badge colors */
const TYPE_COLORS: Record<MemoryEntryType, string> = {
  context: "cyan",
  preference: "magenta",
  decision: "yellow",
  summary: "green",
};

/** Type icons */
const TYPE_ICONS: Record<MemoryEntryType, string> = {
  context: "📋",
  preference: "⚙️",
  decision: "🎯",
  summary: "📝",
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Format a date for display.
 */
function formatDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${month}/${day} ${hours}:${minutes}`;
}

/**
 * Truncate text to a maximum length.
 */
function truncate(text: string, maxLength: number): string {
  const singleLine = text.replace(/\n/g, " ").trim();
  if (singleLine.length <= maxLength) {
    return singleLine;
  }
  return `${singleLine.slice(0, maxLength - 1)}…`;
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
// MemoryItem Component
// =============================================================================

interface MemoryItemProps {
  entry: MemoryEntry;
  isSelected: boolean;
  width: number;
}

function MemoryItem({ entry, isSelected, width }: MemoryItemProps): React.JSX.Element {
  const { theme } = useTheme();
  const icon = TYPE_ICONS[entry.type];
  const color = TYPE_COLORS[entry.type];
  const date = formatDate(entry.updatedAt);

  // Calculate available width for content preview
  const keyWidth = Math.min(entry.key.length, 20);
  const fixedWidth = 4 + keyWidth + 2 + 12; // icon + key + spacing + date
  const contentWidth = Math.max(width - fixedWidth - 4, 10);
  const preview = truncate(entry.content, contentWidth);

  return (
    <Box>
      {isSelected && (
        <Text color={theme.colors.primary} bold>
          {"› "}
        </Text>
      )}
      {!isSelected && <Text dimColor>{"  "}</Text>}

      <Text>{icon} </Text>
      <Text color={color} bold>
        {truncate(entry.key, 20)}
      </Text>
      <Text dimColor> </Text>
      <Text color={theme.colors.muted}>{preview}</Text>
      <Text dimColor> </Text>
      <Text dimColor>{date}</Text>
    </Box>
  );
}

// =============================================================================
// MemoryDetails Component
// =============================================================================

interface MemoryDetailsProps {
  entry: MemoryEntry;
  width: number;
}

function MemoryDetails({ entry, width }: MemoryDetailsProps): React.JSX.Element {
  const { theme } = useTheme();
  const icon = TYPE_ICONS[entry.type];
  const color = TYPE_COLORS[entry.type];

  // Wrap content to width
  const contentLines = entry.content.split("\n").slice(0, 5);
  const hasMore = entry.content.split("\n").length > 5;

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={theme.semantic.border.default}
      paddingX={1}
    >
      <Box marginBottom={1}>
        <Text>{icon} </Text>
        <Text color={color} bold>
          {entry.key}
        </Text>
        <Text dimColor> ({entry.type})</Text>
      </Box>

      <Box flexDirection="column" marginLeft={1}>
        {contentLines.map((line, i) => (
          <Text key={`${entry.key}-line-${i}`} wrap="truncate">
            {truncate(line, width - 6)}
          </Text>
        ))}
        {hasMore && <Text dimColor>…</Text>}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text dimColor>─────────────────</Text>
        <Box>
          <Text color={theme.colors.muted}>Created: </Text>
          <Text>{formatDate(entry.createdAt)}</Text>
        </Box>
        <Box>
          <Text color={theme.colors.muted}>Updated: </Text>
          <Text>{formatDate(entry.updatedAt)}</Text>
        </Box>
        {entry.metadata.tags.length > 0 && (
          <Box>
            <Text color={theme.colors.muted}>Tags: </Text>
            <Text color="cyan">{entry.metadata.tags.map((t) => `#${t}`).join(" ")}</Text>
          </Box>
        )}
        <Box>
          <Text color={theme.colors.muted}>Importance: </Text>
          <Text>{(entry.metadata.importance * 100).toFixed(0)}%</Text>
        </Box>
      </Box>
    </Box>
  );
}

// =============================================================================
// Main MemoryPanel Component
// =============================================================================

/**
 * MemoryPanel - Displays project memories in a scrollable list.
 *
 * Features:
 * - j/k or arrow keys for navigation
 * - Page up/down support
 * - Enter to activate an entry
 * - Visual scroll indicators
 * - Optional details panel
 *
 * @example
 * ```tsx
 * <MemoryPanel
 *   entries={memoryEntries}
 *   maxHeight={10}
 *   isFocused={true}
 *   showDetails={true}
 *   onSelectEntry={(entry) => console.log(entry.key)}
 * />
 * ```
 */
export function MemoryPanel({
  entries,
  maxHeight = DEFAULT_MAX_HEIGHT,
  isFocused = true,
  onSelectEntry,
  onActivateEntry,
  showDetails = false,
}: MemoryPanelProps): React.JSX.Element {
  const { theme } = useTheme();

  // Track selection and scroll
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);

  // Calculate visible items (account for header)
  const maxVisible = Math.max(1, maxHeight - 3);

  // Get visible entries
  const visibleEntries = useMemo(
    () => getVisibleEntries(entries, scrollOffset, maxVisible),
    [entries, scrollOffset, maxVisible]
  );

  // Get selected entry
  const selectedEntry = entries[selectedIndex];

  // Scroll indicators
  const canScrollUp = scrollOffset > 0;
  const canScrollDown = scrollOffset + maxVisible < entries.length;

  /**
   * Navigate to a specific index.
   */
  const navigateToIndex = useCallback(
    (newIndex: number) => {
      const clampedIndex = Math.max(0, Math.min(newIndex, entries.length - 1));
      setSelectedIndex(clampedIndex);

      // Adjust scroll to keep selection visible
      if (clampedIndex < scrollOffset) {
        setScrollOffset(clampedIndex);
      } else if (clampedIndex >= scrollOffset + maxVisible) {
        setScrollOffset(clampedIndex - maxVisible + 1);
      }

      // Notify parent
      if (onSelectEntry && entries[clampedIndex]) {
        onSelectEntry(entries[clampedIndex]);
      }
    },
    [entries, scrollOffset, maxVisible, onSelectEntry]
  );

  // Handle keyboard input
  useInput(
    (input, key) => {
      if (!isFocused || entries.length === 0) return;

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

      // Home
      if (input === "g" || key.home) {
        navigateToIndex(0);
        return;
      }

      // End
      if (input === "G" || key.end) {
        navigateToIndex(entries.length - 1);
        return;
      }

      // Enter to activate
      if (key.return && selectedEntry && onActivateEntry) {
        onActivateEntry(selectedEntry);
      }
    },
    { isActive: isFocused }
  );

  // Empty state
  if (entries.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Box marginBottom={1}>
          <Text color={theme.colors.primary} bold>
            📚 Project Memory
          </Text>
        </Box>
        <Text dimColor>No memories saved yet.</Text>
        <Text dimColor>Use /save to remember important context.</Text>
      </Box>
    );
  }

  // Estimate terminal width (fallback)
  const estimatedWidth = 80;

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box marginBottom={1} paddingX={1}>
        <Text color={theme.colors.primary} bold>
          📚 Project Memory
        </Text>
        <Text dimColor>
          {" "}
          ({entries.length} {entries.length === 1 ? "entry" : "entries"})
        </Text>
      </Box>

      {/* Scroll indicator - up */}
      {canScrollUp && (
        <Box paddingX={1}>
          <Text dimColor>↑ {scrollOffset} more above</Text>
        </Box>
      )}

      {/* Memory list */}
      <Box flexDirection="column" paddingX={1}>
        {visibleEntries.map((entry, i) => (
          <MemoryItem
            key={entry.key}
            entry={entry}
            isSelected={scrollOffset + i === selectedIndex}
            width={estimatedWidth}
          />
        ))}
      </Box>

      {/* Scroll indicator - down */}
      {canScrollDown && (
        <Box paddingX={1}>
          <Text dimColor>↓ {entries.length - scrollOffset - maxVisible} more below</Text>
        </Box>
      )}

      {/* Details panel */}
      {showDetails && selectedEntry && (
        <Box marginTop={1} paddingX={1}>
          <MemoryDetails entry={selectedEntry} width={estimatedWidth} />
        </Box>
      )}

      {/* Help hint */}
      {isFocused && (
        <Box marginTop={1} paddingX={1}>
          <Text dimColor>j/k: navigate • Enter: view • g/G: first/last</Text>
        </Box>
      )}
    </Box>
  );
}
