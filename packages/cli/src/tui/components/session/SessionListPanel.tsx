/**
 * SessionListPanel Component (T056)
 *
 * Displays a scrollable list of sessions with keyboard navigation.
 *
 * @module tui/components/session/SessionListPanel
 */

import { Box, Text, useInput } from "ink";
import type React from "react";
import { useCallback, useMemo, useState } from "react";
import { useTheme } from "../../theme/index.js";
import { SessionItem } from "./SessionItem.js";
import type { SessionListPanelProps } from "./types.js";

// =============================================================================
// Constants
// =============================================================================

/** Default maximum height for the session list */
const DEFAULT_MAX_HEIGHT = 10;

/** Number of sessions to skip when using page up/down */
const PAGE_SIZE = 5;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Calculate visible sessions based on scroll position and max height.
 */
function getVisibleSessions<T>(
  sessions: readonly T[],
  scrollOffset: number,
  maxVisible: number
): readonly T[] {
  return sessions.slice(scrollOffset, scrollOffset + maxVisible);
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * SessionListPanel displays a scrollable list of sessions.
 *
 * Features:
 * - j/k or arrow keys for navigation
 * - Page up/down support
 * - Home/End to jump to first/last
 * - Visual scroll indicators
 * - Highlights selected and active sessions
 *
 * @example
 * ```tsx
 * <SessionListPanel
 *   sessions={sessionList}
 *   selectedSessionId="sess-1"
 *   activeSessionId="sess-2"
 *   onSelectSession={(id) => handleSelect(id)}
 *   maxHeight={10}
 *   isFocused={true}
 * />
 * ```
 */
export function SessionListPanel({
  sessions,
  selectedSessionId,
  activeSessionId,
  onSelectSession,
  maxHeight = DEFAULT_MAX_HEIGHT,
  isFocused = true,
}: SessionListPanelProps): React.JSX.Element {
  const { theme } = useTheme();

  // Track the index of the selected session
  const [selectedIndex, setSelectedIndex] = useState(() => {
    if (selectedSessionId) {
      const index = sessions.findIndex((s) => s.id === selectedSessionId);
      return index >= 0 ? index : 0;
    }
    return 0;
  });

  // Track scroll offset for virtualization
  const [scrollOffset, setScrollOffset] = useState(0);

  // Calculate visible items (account for header)
  const maxVisible = Math.max(1, maxHeight - 2);

  // Get visible sessions based on scroll
  const visibleSessions = useMemo(
    () => getVisibleSessions(sessions, scrollOffset, maxVisible),
    [sessions, scrollOffset, maxVisible]
  );

  // Check if we can scroll
  const canScrollUp = scrollOffset > 0;
  const canScrollDown = scrollOffset + maxVisible < sessions.length;

  /**
   * Navigate to a specific index, adjusting scroll as needed.
   */
  const navigateToIndex = useCallback(
    (newIndex: number) => {
      // Clamp index to valid range
      const clampedIndex = Math.max(0, Math.min(newIndex, sessions.length - 1));
      setSelectedIndex(clampedIndex);

      // Adjust scroll to keep selection visible
      if (clampedIndex < scrollOffset) {
        setScrollOffset(clampedIndex);
      } else if (clampedIndex >= scrollOffset + maxVisible) {
        setScrollOffset(clampedIndex - maxVisible + 1);
      }

      // Notify parent of selection change
      if (onSelectSession && sessions[clampedIndex]) {
        onSelectSession(sessions[clampedIndex].id);
      }
    },
    [sessions, scrollOffset, maxVisible, onSelectSession]
  );

  /**
   * Check if key matches navigation down.
   */
  const isNavigateDown = (input: string, key: { downArrow: boolean }) =>
    input === "j" || key.downArrow;

  /**
   * Check if key matches navigation up.
   */
  const isNavigateUp = (input: string, key: { upArrow: boolean }) => input === "k" || key.upArrow;

  /**
   * Check if key matches page navigation.
   */
  const isPageNav = (
    input: string,
    key: { pageDown?: boolean; pageUp?: boolean; ctrl?: boolean }
  ): "down" | "up" | null => {
    if (key.pageDown || (key.ctrl && input === "d")) return "down";
    if (key.pageUp || (key.ctrl && input === "u")) return "up";
    return null;
  };

  // Handle keyboard input
  useInput(
    (input, key) => {
      if (isNavigateDown(input, key)) {
        navigateToIndex(selectedIndex + 1);
        return;
      }
      if (isNavigateUp(input, key)) {
        navigateToIndex(selectedIndex - 1);
        return;
      }
      const pageDir = isPageNav(input, key);
      if (pageDir === "down") {
        navigateToIndex(selectedIndex + PAGE_SIZE);
        return;
      }
      if (pageDir === "up") {
        navigateToIndex(selectedIndex - PAGE_SIZE);
        return;
      }
      // g/G: vim-style jump to first/last
      if (input === "g") {
        navigateToIndex(0);
        return;
      }
      if (input === "G") {
        navigateToIndex(sessions.length - 1);
      }
    },
    { isActive: isFocused }
  );

  const textColor = theme.semantic.text.primary;
  const mutedColor = theme.semantic.text.muted;
  const borderColor = theme.semantic.border.default;

  // Empty state
  if (sessions.length === 0) {
    return (
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor={borderColor}
        paddingX={1}
        height={maxHeight}
      >
        <Text color={textColor} bold>
          📋 Sessions
        </Text>
        <Box flexGrow={1} justifyContent="center" alignItems="center">
          <Text color={mutedColor} italic>
            No sessions found
          </Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={borderColor}
      paddingX={1}
      height={maxHeight}
    >
      {/* Header with scroll indicators */}
      <Box flexDirection="row" justifyContent="space-between">
        <Text color={textColor} bold>
          📋 Sessions ({sessions.length})
        </Text>
        <Box flexDirection="row" gap={1}>
          {canScrollUp && <Text color={mutedColor}>↑</Text>}
          {canScrollDown && <Text color={mutedColor}>↓</Text>}
        </Box>
      </Box>

      {/* Session list */}
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        {visibleSessions.map((session, visibleIndex) => {
          const actualIndex = scrollOffset + visibleIndex;
          return (
            <SessionItem
              key={session.id}
              session={session}
              isSelected={actualIndex === selectedIndex}
              isActive={session.id === activeSessionId}
              onSelect={onSelectSession}
            />
          );
        })}
      </Box>

      {/* Footer with navigation hints */}
      <Box marginTop={0}>
        <Text color={mutedColor} dimColor>
          j/k: navigate • Enter: select • g/G: first/last
        </Text>
      </Box>
    </Box>
  );
}

export default SessionListPanel;
