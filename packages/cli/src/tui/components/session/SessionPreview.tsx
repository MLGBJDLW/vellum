/**
 * SessionPreview Component (T056)
 *
 * Displays a preview of messages from a selected session.
 *
 * @module tui/components/session/SessionPreview
 */

import { getIcons } from "@vellum/shared";
import { Box, Text } from "ink";
import type React from "react";
import { useMemo } from "react";
import { useTheme } from "../../theme/index.js";
import type { SessionPreviewMessage, SessionPreviewProps } from "./types.js";

// =============================================================================
// Constants
// =============================================================================

/** Default maximum height for the preview */
const DEFAULT_MAX_HEIGHT = 8;

/** Maximum characters for message content preview */
const MAX_CONTENT_LENGTH = 200;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Format a timestamp for display.
 */
function formatTimestamp(date: Date): string {
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Get the display icon for a message role.
 */
function getRoleIcon(role: SessionPreviewMessage["role"]): string {
  const icons = getIcons();
  switch (role) {
    case "user":
      return icons.user;
    case "assistant":
      return icons.assistant;
    case "system":
      return icons.system;
    case "tool":
      return icons.tool;
    default:
      return icons.info;
  }
}

/**
 * Get role label for display.
 */
function getRoleLabel(role: SessionPreviewMessage["role"]): string {
  switch (role) {
    case "user":
      return "You";
    case "assistant":
      return "Vellum";
    case "system":
      return "System";
    case "tool":
      return "Tool";
    default:
      return "Unknown";
  }
}

/**
 * Truncate text with ellipsis.
 */
function truncateContent(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1)}…`;
}

// =============================================================================
// Sub-Components
// =============================================================================

/**
 * Single message preview item.
 */
interface PreviewMessageItemProps {
  readonly message: SessionPreviewMessage;
  readonly roleColor: string;
  readonly textColor: string;
  readonly mutedColor: string;
}

function PreviewMessageItem({
  message,
  roleColor,
  textColor,
  mutedColor,
}: PreviewMessageItemProps): React.JSX.Element {
  const icon = getRoleIcon(message.role);
  const label = getRoleLabel(message.role);
  const timestamp = formatTimestamp(message.timestamp);
  const content = truncateContent(message.content, MAX_CONTENT_LENGTH);

  return (
    <Box flexDirection="column" marginBottom={0}>
      {/* Header: icon, role, timestamp */}
      <Box flexDirection="row" gap={1}>
        <Text>
          {icon}{" "}
          <Text color={roleColor} bold>
            {label}
          </Text>
        </Text>
        <Text color={mutedColor}>• {timestamp}</Text>
      </Box>

      {/* Content preview */}
      <Box marginLeft={2}>
        <Text color={textColor} wrap="truncate-end">
          {content || "(empty)"}
        </Text>
      </Box>
    </Box>
  );
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * SessionPreview displays a preview of messages from a session.
 *
 * Features:
 * - Shows recent messages with role icons
 * - Truncates long messages
 * - Displays session title
 * - Scrolls to show latest messages
 *
 * @example
 * ```tsx
 * <SessionPreview
 *   messages={previewMessages}
 *   title="Debug React App"
 *   maxHeight={8}
 * />
 * ```
 */
export function SessionPreview({
  messages,
  maxHeight = DEFAULT_MAX_HEIGHT,
  title,
}: SessionPreviewProps): React.JSX.Element {
  const { theme } = useTheme();

  const textColor = theme.semantic.text.primary;
  const mutedColor = theme.semantic.text.muted;
  const borderColor = theme.semantic.border.default;
  const roleColor = theme.colors.primary;

  // Get the last N messages that fit in the view (rough estimate: 2 lines per message)
  const maxMessages = Math.floor((maxHeight - 2) / 2);
  const visibleMessages = useMemo(() => messages.slice(-maxMessages), [messages, maxMessages]);

  const hasMoreMessages = messages.length > maxMessages;

  // Empty state
  if (messages.length === 0) {
    return (
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor={borderColor}
        paddingX={1}
        height={maxHeight}
      >
        <Text color={textColor} bold>
          {getIcons().note} {title || "Session Preview"}
        </Text>
        <Box flexGrow={1} justifyContent="center" alignItems="center">
          <Text color={mutedColor} italic>
            No messages in this session
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
      {/* Header */}
      <Box flexDirection="row" justifyContent="space-between">
        <Text color={textColor} bold>
          {getIcons().note} {title || "Session Preview"}
        </Text>
        <Text color={mutedColor}>
          {messages.length} message{messages.length !== 1 ? "s" : ""}
        </Text>
      </Box>

      {/* More messages indicator */}
      {hasMoreMessages && (
        <Box>
          <Text color={mutedColor} dimColor>
            ... {messages.length - maxMessages} earlier message
            {messages.length - maxMessages !== 1 ? "s" : ""}
          </Text>
        </Box>
      )}

      {/* Message list */}
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        {visibleMessages.map((message) => (
          <PreviewMessageItem
            key={message.id}
            message={message}
            roleColor={roleColor}
            textColor={textColor}
            mutedColor={mutedColor}
          />
        ))}
      </Box>
    </Box>
  );
}

export default SessionPreview;
