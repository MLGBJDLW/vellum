/**
 * SessionItem Component (T056)
 *
 * Displays a single session in the session list with title,
 * last message preview, and timestamp.
 *
 * @module tui/components/session/SessionItem
 */

import { Box, Text } from "ink";
import type React from "react";
import { useTheme } from "../../theme/index.js";
import { truncateToDisplayWidth } from "../../utils/index.js";
import type { SessionItemProps } from "./types.js";

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Format a timestamp for display.
 * Shows time if today, otherwise shows date.
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
 * Truncate text to a maximum display width with ellipsis.
 * Uses string-width for accurate CJK/Emoji handling.
 */
function truncateText(text: string, maxLength: number): string {
  return truncateToDisplayWidth(text, maxLength);
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * SessionItem displays a single session entry.
 *
 * Features:
 * - Shows session title with truncation
 * - Displays last message preview (muted)
 * - Shows relative timestamp
 * - Visual indicators for selected/active states
 * - Message count badge
 *
 * @example
 * ```tsx
 * <SessionItem
 *   session={{
 *     id: "sess-1",
 *     title: "Debug React app",
 *     lastMessage: "I'll help you fix that...",
 *     timestamp: new Date(),
 *     messageCount: 12
 *   }}
 *   isSelected={true}
 *   isActive={false}
 *   onSelect={(id) => handleSelect(id)}
 * />
 * ```
 */
export function SessionItem({
  session,
  isSelected = false,
  isActive = false,
}: SessionItemProps): React.JSX.Element {
  const { theme } = useTheme();

  const textColor = theme.semantic.text.primary;
  const mutedColor = theme.semantic.text.muted;
  const primaryColor = theme.colors.primary;
  const successColor = theme.colors.success;

  // Determine background indicator
  const indicator = isSelected ? "▶" : isActive ? "●" : " ";
  const indicatorColor = isSelected ? primaryColor : isActive ? successColor : mutedColor;

  // Truncate title and last message for display
  const displayTitle = truncateText(session.title, 40);
  const displayMessage = session.lastMessage ? truncateText(session.lastMessage, 50) : "";

  return (
    <Box
      flexDirection="column"
      paddingX={1}
      paddingY={0}
      borderStyle={isSelected ? "single" : undefined}
      borderColor={isSelected ? primaryColor : undefined}
    >
      {/* Title row with indicator and timestamp */}
      <Box flexDirection="row" justifyContent="space-between">
        <Box flexDirection="row" gap={1}>
          <Text color={indicatorColor}>{indicator}</Text>
          <Text color={isSelected ? primaryColor : textColor} bold={isSelected || isActive}>
            {displayTitle}
          </Text>
        </Box>
        <Box flexDirection="row" gap={1}>
          <Text dimColor>({session.messageCount})</Text>
          <Text color={mutedColor}>{formatTimestamp(session.timestamp)}</Text>
        </Box>
      </Box>

      {/* Last message preview */}
      {displayMessage && (
        <Box marginLeft={2}>
          <Text color={mutedColor} wrap="truncate">
            {displayMessage}
          </Text>
        </Box>
      )}
    </Box>
  );
}

export default SessionItem;
