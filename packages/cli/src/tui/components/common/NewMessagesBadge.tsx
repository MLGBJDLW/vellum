/**
 * NewMessagesBadge Component
 *
 * Badge showing unread message count with scroll-to-bottom action.
 * Displays "↓ N new messages" when user is in manual scroll mode.
 *
 * @module tui/components/common/NewMessagesBadge
 */

import { Box, Text } from "ink";
import type React from "react";
import { useTheme } from "../../theme/index.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for NewMessagesBadge component.
 */
export interface NewMessagesBadgeProps {
  /** Number of new messages */
  readonly count: number;
  /** Callback when clicked/activated */
  readonly onScrollToBottom?: () => void;
}

// =============================================================================
// Component
// =============================================================================

/**
 * Badge showing unread message count with scroll-to-bottom hint.
 *
 * Displays "↓ N new messages (press End)" when count > 0.
 * Hidden when count = 0 (no visual clutter).
 *
 * @example
 * ```tsx
 * <NewMessagesBadge
 *   count={unreadCount}
 *   onScrollToBottom={() => scrollController.resumeFollow()}
 * />
 * ```
 */
export function NewMessagesBadge({
  count,
  onScrollToBottom: _onScrollToBottom,
}: NewMessagesBadgeProps): React.ReactElement | null {
  const { theme } = useTheme();

  // Don't render if no new messages
  if (count <= 0) {
    return null;
  }

  // Format message text
  const messageText = count === 1 ? "1 new message" : `${count} new messages`;

  return (
    <Box justifyContent="center" paddingX={1}>
      <Text color={theme.colors.info}>↓ {messageText} (press End)</Text>
    </Box>
  );
}
