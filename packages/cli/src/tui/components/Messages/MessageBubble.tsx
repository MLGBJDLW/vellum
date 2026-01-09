/**
 * MessageBubble Component (T018)
 *
 * Renders a styled message bubble with role-specific formatting.
 * User messages are right-aligned, assistant messages left-aligned,
 * system messages centered, and tool messages with tool icon.
 *
 * @module tui/components/Messages/MessageBubble
 */

import { getIcons, getRoleBorderColor, getRoleTextColor, type VellumTheme } from "@vellum/shared";
import { Box, Text } from "ink";
import type { Message } from "../../context/MessagesContext.js";
import { useTheme } from "../../theme/index.js";
import { StreamingText } from "./StreamingText.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the MessageBubble component.
 */
export interface MessageBubbleProps {
  /** The message to display */
  readonly message: Message;
  /** Whether to show the timestamp (default: false) */
  readonly showTimestamp?: boolean;
  /** Whether to show the avatar/icon (default: false) */
  readonly showAvatar?: boolean;
  /** Whether to use compact mode for dense display (default: false) */
  readonly compact?: boolean;
}

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
function getRoleIcon(role: Message["role"]): string {
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
 * Get the role display label.
 */
function getRoleLabel(role: Message["role"]): string {
  switch (role) {
    case "user":
      return "You";
    case "assistant":
      return "Assistant";
    case "system":
      return "System";
    case "tool":
      return "Tool";
    default:
      return "Unknown";
  }
}

/**
 * Get alignment configuration for a message role.
 */
function getAlignment(role: Message["role"]): "flex-start" | "center" | "flex-end" {
  switch (role) {
    case "user":
      return "flex-end"; // Right-aligned
    case "assistant":
      return "flex-start"; // Left-aligned
    case "system":
      return "center"; // Centered
    case "tool":
      return "flex-start"; // Left-aligned with tool icon
    default:
      return "flex-start";
  }
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * MessageBubble displays a single message with role-specific styling.
 *
 * Features:
 * - User messages: right-aligned with user color
 * - Assistant messages: left-aligned with assistant color
 * - System messages: centered with muted color
 * - Tool messages: left-aligned with tool icon
 * - Optional timestamp display
 * - Optional avatar/icon
 * - Compact mode for dense display
 *
 * @example
 * ```tsx
 * // Basic usage
 * <MessageBubble message={message} />
 *
 * // With timestamp and avatar
 * <MessageBubble
 *   message={message}
 *   showTimestamp
 *   showAvatar
 * />
 *
 * // Compact mode
 * <MessageBubble
 *   message={message}
 *   compact
 * />
 * ```
 */
export function MessageBubble({
  message,
  showTimestamp = false,
  showAvatar = false,
  compact = false,
}: MessageBubbleProps): React.JSX.Element {
  const { theme } = useTheme();

  // Get role-specific styling using semantic tokens
  const roleColor = getRoleColor(message.role, theme);
  const borderColor = getMessageBorderColor(message.role, theme);
  const textColor = theme.semantic.text.primary;
  const mutedColor = theme.semantic.text.muted;
  const alignment = getAlignment(message.role);

  const icon = getRoleIcon(message.role);
  const label = getRoleLabel(message.role);
  const timestamp = formatTimestamp(message.timestamp);

  // Calculate padding based on alignment
  const paddingLeft = alignment === "flex-end" ? 4 : 0;
  const paddingRight = alignment === "flex-start" ? 4 : 0;

  return (
    <Box
      flexDirection="column"
      alignItems={alignment}
      marginBottom={compact ? 0 : 1}
      paddingLeft={paddingLeft}
      paddingRight={paddingRight}
    >
      {/* Message bubble with border and background */}
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={borderColor}
        paddingX={1}
        paddingY={compact ? 0 : 0}
      >
        {/* Message header: avatar/icon, label, and timestamp */}
        <Box>
          <Text>
            {showAvatar && <>{icon} </>}
            <Text color={roleColor} bold>
              {label}
            </Text>
            {showTimestamp && <Text color={mutedColor}> • {timestamp}</Text>}
            {message.isStreaming && (
              <Text color={mutedColor} italic>
                {" "}
                (streaming...)
              </Text>
            )}
          </Text>
        </Box>

        {/* Message content */}
        <Box marginLeft={showAvatar ? 2 : 0} marginTop={compact ? 0 : 0}>
          {message.isStreaming ? (
            <StreamingText content={message.content || ""} isStreaming={true} />
          ) : (
            <Text color={textColor} wrap="wrap">
              {message.content || "(empty)"}
            </Text>
          )}
        </Box>

        {/* Tool calls, if any */}
        {message.toolCalls && message.toolCalls.length > 0 && !compact && (
          <Box flexDirection="column" marginLeft={showAvatar ? 2 : 0} marginTop={1}>
            {message.toolCalls.map((toolCall) => (
              <Box key={toolCall.id}>
                <Text color={mutedColor}>
                  {getIcons().tool} {toolCall.name}
                  <Text dimColor> [{toolCall.status}]</Text>
                </Text>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}

/**
 * Get the color for a message role from the theme.
 * Uses semantic role colors for consistent theming.
 */
function getRoleColor(role: Message["role"], theme: VellumTheme): string {
  const validRole = role as "user" | "assistant" | "system" | "tool";
  return getRoleTextColor(validRole, theme);
}

/**
 * Get the border color for a message role from the theme.
 * Uses semantic border colors for consistent theming.
 */
function getMessageBorderColor(role: Message["role"], theme: VellumTheme): string {
  const validRole = role as "user" | "assistant" | "system" | "tool";
  return getRoleBorderColor(validRole, theme);
}
