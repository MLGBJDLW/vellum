/**
 * SessionPicker Component (T056)
 *
 * Modal dialog for selecting a session from the session list.
 * Triggered by Ctrl+S keybinding.
 *
 * @module tui/components/session/SessionPicker
 */

import { getIcons } from "@vellum/shared";
import { Box, Text, useInput } from "ink";
import type React from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTheme } from "../../theme/index.js";
import { SessionPreview } from "./SessionPreview.js";
import type { SessionMetadata, SessionPickerProps, SessionPreviewMessage } from "./types.js";

// =============================================================================
// Constants
// =============================================================================

/** Maximum height for the session list */
const LIST_MAX_HEIGHT = 12;

/** Maximum height for the preview panel */
const PREVIEW_MAX_HEIGHT = 6;

/** Page size for navigation */
const PAGE_SIZE = 5;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Format timestamp for session item display.
 */
function formatTimestamp(date: Date): string {
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isToday) {
    return date.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/**
 * Truncate text with ellipsis.
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1)}…`;
}

/**
 * Generate mock preview messages from session metadata.
 * In a real implementation, this would fetch actual messages.
 */
function getMockPreviewMessages(session: SessionMetadata): SessionPreviewMessage[] {
  const messages: SessionPreviewMessage[] = [];

  // Add a mock user message
  messages.push({
    id: `${session.id}-preview-user`,
    role: "user",
    content: session.title,
    timestamp: new Date(session.timestamp.getTime() - 60000), // 1 minute before
  });

  // Add a mock assistant response if there's a last message
  if (session.lastMessage) {
    messages.push({
      id: `${session.id}-preview-assistant`,
      role: "assistant",
      content: session.lastMessage,
      timestamp: session.timestamp,
    });
  }

  return messages;
}

// =============================================================================
// Sub-Components
// =============================================================================

/**
 * Session list item in the picker.
 */
interface PickerItemProps {
  readonly session: SessionMetadata;
  readonly isSelected: boolean;
  readonly isActive: boolean;
  readonly primaryColor: string;
  readonly textColor: string;
  readonly mutedColor: string;
  readonly successColor: string;
}

function PickerItem({
  session,
  isSelected,
  isActive,
  primaryColor,
  textColor,
  mutedColor,
  successColor,
}: PickerItemProps): React.JSX.Element {
  const indicator = isSelected ? "▶" : isActive ? "●" : " ";
  const indicatorColor = isSelected ? primaryColor : isActive ? successColor : mutedColor;
  const displayTitle = truncateText(session.title, 35);

  return (
    <Box flexDirection="row" paddingX={1}>
      <Text color={indicatorColor}>{indicator} </Text>
      <Box flexDirection="row" justifyContent="space-between" flexGrow={1}>
        <Text color={isSelected ? primaryColor : textColor} bold={isSelected}>
          {displayTitle}
        </Text>
        <Box flexDirection="row" gap={1}>
          <Text dimColor>({session.messageCount})</Text>
          <Text color={mutedColor}>{formatTimestamp(session.timestamp)}</Text>
        </Box>
      </Box>
    </Box>
  );
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * SessionPicker is a modal dialog for selecting sessions.
 *
 * Features:
 * - j/k or arrow keys for navigation
 * - Enter to select session
 * - Escape or q to close
 * - Preview panel shows selected session messages
 * - Page up/down for faster navigation
 * - g/G to jump to first/last
 *
 * @example
 * ```tsx
 * <SessionPicker
 *   sessions={sessionList}
 *   activeSessionId="current-session"
 *   onSelect={(id) => switchToSession(id)}
 *   onClose={() => setPickerOpen(false)}
 *   isOpen={pickerOpen}
 * />
 * ```
 */
export function SessionPicker({
  sessions,
  activeSessionId,
  onSelect,
  onClose,
  isOpen,
}: SessionPickerProps): React.JSX.Element | null {
  const { theme } = useTheme();

  // Track selection index
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Track scroll offset
  const [scrollOffset, setScrollOffset] = useState(0);

  // Prevent double-handling of input
  const handledRef = useRef(false);

  // Calculate visible sessions
  const maxVisible = LIST_MAX_HEIGHT - 4; // Account for header, footer, borders

  const visibleSessions = useMemo(
    () => sessions.slice(scrollOffset, scrollOffset + maxVisible),
    [sessions, scrollOffset, maxVisible]
  );

  // Get selected session
  const selectedSession = sessions[selectedIndex];

  // Get preview messages for selected session
  const previewMessages = useMemo(
    () => (selectedSession ? getMockPreviewMessages(selectedSession) : []),
    [selectedSession]
  );

  // Scroll indicators
  const canScrollUp = scrollOffset > 0;
  const canScrollDown = scrollOffset + maxVisible < sessions.length;

  /**
   * Navigate to a specific index.
   */
  const navigateToIndex = useCallback(
    (newIndex: number) => {
      const clampedIndex = Math.max(0, Math.min(newIndex, sessions.length - 1));
      setSelectedIndex(clampedIndex);

      // Adjust scroll to keep selection visible
      if (clampedIndex < scrollOffset) {
        setScrollOffset(clampedIndex);
      } else if (clampedIndex >= scrollOffset + maxVisible) {
        setScrollOffset(clampedIndex - maxVisible + 1);
      }
    },
    [sessions.length, scrollOffset, maxVisible]
  );

  /**
   * Handle close action with double-handling prevention.
   */
  const handleClose = useCallback(() => {
    if (handledRef.current) return false;
    handledRef.current = true;
    onClose();
    setTimeout(() => {
      handledRef.current = false;
    }, 0);
    return true;
  }, [onClose]);

  /**
   * Handle select action with double-handling prevention.
   */
  const handleSelect = useCallback(() => {
    if (handledRef.current || !selectedSession) return false;
    handledRef.current = true;
    onSelect(selectedSession.id);
    setTimeout(() => {
      handledRef.current = false;
    }, 0);
    return true;
  }, [onSelect, selectedSession]);

  /**
   * Check navigation direction from key input.
   */
  const getNavDirection = (
    input: string,
    key: {
      downArrow: boolean;
      upArrow: boolean;
      pageDown?: boolean;
      pageUp?: boolean;
      ctrl?: boolean;
    }
  ): number | null => {
    if (input === "j" || key.downArrow) return 1;
    if (input === "k" || key.upArrow) return -1;
    if (key.pageDown || (key.ctrl && input === "d")) return PAGE_SIZE;
    if (key.pageUp || (key.ctrl && input === "u")) return -PAGE_SIZE;
    if (input === "g") return -selectedIndex; // Jump to 0
    if (input === "G") return sessions.length - 1 - selectedIndex; // Jump to end
    return null;
  };

  // Handle keyboard input
  useInput(
    (input, key) => {
      if (handledRef.current) return;

      // Close: Escape or q
      if (key.escape || input.toLowerCase() === "q") {
        handleClose();
        return;
      }

      // Select: Enter
      if (key.return) {
        handleSelect();
        return;
      }

      // Navigation
      const delta = getNavDirection(input, key);
      if (delta !== null) {
        navigateToIndex(selectedIndex + delta);
      }
    },
    { isActive: isOpen }
  );

  // Don't render if not open
  if (!isOpen) {
    return null;
  }

  const textColor = theme.semantic.text.primary;
  const mutedColor = theme.semantic.text.muted;
  const primaryColor = theme.colors.primary;
  const successColor = theme.colors.success;

  // Empty state
  if (sessions.length === 0) {
    return (
      <Box
        flexDirection="column"
        borderStyle="double"
        borderColor={primaryColor}
        paddingX={2}
        paddingY={1}
      >
        <Text color={textColor} bold>
          {getIcons().plan} Select Session
        </Text>
        <Box marginY={1}>
          <Text color={mutedColor} italic>
            No sessions available
          </Text>
        </Box>
        <Text color={mutedColor} dimColor>
          Press <Text bold>Esc</Text> or <Text bold>q</Text> to close
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {/* Main modal */}
      <Box
        flexDirection="column"
        borderStyle="double"
        borderColor={primaryColor}
        paddingX={1}
        paddingY={0}
      >
        {/* Header */}
        <Box flexDirection="row" justifyContent="space-between" marginBottom={1}>
          <Text color={textColor} bold>
            {getIcons().plan} Select Session ({sessions.length})
          </Text>
          <Box flexDirection="row" gap={1}>
            {canScrollUp && <Text color={mutedColor}>↑</Text>}
            {canScrollDown && <Text color={mutedColor}>↓</Text>}
          </Box>
        </Box>

        {/* Session list */}
        <Box flexDirection="column">
          {visibleSessions.map((session, visibleIndex) => {
            const actualIndex = scrollOffset + visibleIndex;
            return (
              <PickerItem
                key={session.id}
                session={session}
                isSelected={actualIndex === selectedIndex}
                isActive={session.id === activeSessionId}
                primaryColor={primaryColor}
                textColor={textColor}
                mutedColor={mutedColor}
                successColor={successColor}
              />
            );
          })}
        </Box>

        {/* Footer with keybindings */}
        <Box marginTop={1} flexDirection="row" gap={2}>
          <Text color={mutedColor} dimColor>
            <Text bold>j/k</Text> navigate
          </Text>
          <Text color={mutedColor} dimColor>
            <Text bold>Enter</Text> select
          </Text>
          <Text color={mutedColor} dimColor>
            <Text bold>Esc/q</Text> close
          </Text>
        </Box>
      </Box>

      {/* Preview panel */}
      {selectedSession && (
        <Box marginTop={1}>
          <SessionPreview
            messages={previewMessages}
            title={selectedSession.title}
            maxHeight={PREVIEW_MAX_HEIGHT}
          />
        </Box>
      )}
    </Box>
  );
}

export default SessionPicker;
