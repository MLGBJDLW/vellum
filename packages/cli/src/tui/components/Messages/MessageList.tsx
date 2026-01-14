/**
 * MessageList Component (T017)
 *
 * Displays a list of messages with auto-scroll support and optimized rendering.
 * Uses Ink's <Static> component for completed messages (never re-render)
 * and only re-renders the pending streaming message.
 *
 * Key optimization: Static rendering pattern from Gemini CLI
 * - historyMessages: Rendered in <Static>, never re-render
 * - pendingMessage: Only this causes re-renders during streaming
 *
 * Virtualized mode (useVirtualizedList=true):
 * - Only renders visible items for optimal performance
 * - Best for very long conversations (100+ messages)
 * - Uses VirtualizedList component ported from Gemini CLI
 *
 * @module tui/components/Messages/MessageList
 */

import { getIcons } from "@vellum/shared";
import { Box, Static, Text, useInput } from "ink";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Message } from "../../context/MessagesContext.js";
import { useTheme } from "../../theme/index.js";
import {
  SCROLL_TO_ITEM_END,
  VirtualizedList,
  type VirtualizedListRef,
} from "../common/VirtualizedList/index.js";
import { StreamingText } from "./StreamingText.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the MessageList component.
 */
export interface MessageListProps {
  /** Array of messages to display (for backward compatibility) */
  readonly messages: readonly Message[];
  /** Completed messages for <Static> rendering (never re-render) */
  readonly historyMessages?: readonly Message[];
  /** Currently streaming message (only this causes re-renders) */
  readonly pendingMessage?: Message | null;
  /** Whether to automatically scroll to bottom on new messages (default: true) */
  readonly autoScroll?: boolean;
  /** Callback when scroll position changes relative to bottom */
  readonly onScrollChange?: (isAtBottom: boolean) => void;
  /** Maximum height in lines (optional, for windowed display) */
  readonly maxHeight?: number;
  /**
   * Enable virtualized rendering for optimal performance with large lists.
   * When true, only visible messages are rendered.
   * Best for conversations with 100+ messages.
   * @default false
   */
  readonly useVirtualizedList?: boolean;
  /**
   * Estimated height per message in lines (for virtualization).
   * Can be a fixed number or function for variable heights.
   * @default 4
   */
  readonly estimatedItemHeight?: number | ((index: number) => number);
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
      return "Vellum";
    case "system":
      return "System";
    case "tool":
      return "Tool";
    default:
      return "Unknown";
  }
}

// =============================================================================
// Sub-Components
// =============================================================================

/**
 * Props for a single message item.
 */
interface MessageItemProps {
  readonly message: Message;
  readonly roleColor: string;
  readonly textColor: string;
  readonly mutedColor: string;
}

/**
 * Renders a single message with role icon, timestamp, and content.
 */
const MessageItem = memo(function MessageItem({
  message,
  roleColor,
  textColor,
  mutedColor,
}: MessageItemProps) {
  const icon = getRoleIcon(message.role);
  const label = getRoleLabel(message.role);
  const timestamp = formatTimestamp(message.timestamp);

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* Message header: role icon, label, and timestamp */}
      <Box>
        <Text>
          {icon}{" "}
          <Text color={roleColor} bold>
            {label}
          </Text>
          <Text color={mutedColor}> • {timestamp}</Text>
          {message.isStreaming && (
            <Text color={mutedColor} italic>
              {" "}
              (streaming...)
            </Text>
          )}
        </Text>
      </Box>

      {/* Message content */}
      <Box marginLeft={2} marginTop={0}>
        {message.isStreaming ? (
          <StreamingText content={message.content || ""} isStreaming={true} />
        ) : (
          <Text color={textColor} wrap="wrap">
            {message.content || "(empty)"}
          </Text>
        )}
      </Box>

      {/* Tool calls, if any */}
      {message.toolCalls && message.toolCalls.length > 0 && (
        <Box flexDirection="column" marginLeft={2} marginTop={1}>
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
  );
});

// =============================================================================
// Main Component
// =============================================================================

/**
 * MessageList displays a scrollable list of conversation messages.
 *
 * Features:
 * - Renders completed messages in <Static> (never re-render)
 * - Only pending streaming message causes re-renders
 * - Auto-scrolls to bottom when new messages arrive
 * - Disables auto-scroll when user scrolls up (PageUp/Up arrows)
 * - Re-enables auto-scroll when user scrolls to bottom
 * - Keyboard navigation (PageUp/PageDown, Home/End)
 * - Optional windowed display with maxHeight
 *
 * Optimization pattern from Gemini CLI:
 * - historyMessages → <Static> (rendered once, never re-render)
 * - pendingMessage → Active re-rendering during streaming
 *
 * @example
 * ```tsx
 * // Basic usage with auto-scroll
 * <MessageList messages={messages} />
 *
 * // Optimized usage with Static rendering
 * <MessageList
 *   messages={messages}
 *   historyMessages={historyMessages}
 *   pendingMessage={pendingMessage}
 * />
 *
 * // With scroll change callback
 * <MessageList
 *   messages={messages}
 *   autoScroll={true}
 *   onScrollChange={(atBottom) => setShowNewIndicator(!atBottom)}
 * />
 *
 * // With max height (windowed)
 * <MessageList
 *   messages={messages}
 *   maxHeight={20}
 * />
 * ```
 */
const MessageList = memo(function MessageList({
  messages,
  historyMessages,
  pendingMessage,
  autoScroll = true,
  onScrollChange,
  maxHeight,
  useVirtualizedList = false,
  estimatedItemHeight = 4,
}: MessageListProps) {
  const { theme } = useTheme();

  // Ref for VirtualizedList imperative control
  const virtualizedListRef = useRef<VirtualizedListRef<Message>>(null);

  // Determine if we're using optimized Static rendering
  // If historyMessages is provided, use the split architecture
  const useStaticRendering = historyMessages !== undefined;

  // Normalize maxHeight - treat 0, undefined, null as "no max height"
  const effectiveMaxHeight = maxHeight && maxHeight > 0 ? maxHeight : undefined;

  // Current scroll position (index of the first visible message in windowed mode)
  const [scrollOffset, setScrollOffset] = useState(0);

  // Whether user has manually scrolled away from bottom
  const [userScrolledUp, setUserScrolledUp] = useState(false);

  // Track previous message count for auto-scroll detection
  const prevMessageCountRef = useRef(messages.length);

  // Whether we're currently at the bottom of the list
  const isAtBottom = useMemo(() => {
    if (!effectiveMaxHeight || messages.length <= effectiveMaxHeight) {
      return true;
    }
    return scrollOffset >= messages.length - effectiveMaxHeight;
  }, [scrollOffset, messages.length, effectiveMaxHeight]);

  // Calculate visible messages for windowed display (legacy mode only)
  const visibleMessages = useMemo(() => {
    if (!effectiveMaxHeight || messages.length <= effectiveMaxHeight) {
      return messages;
    }
    const start = Math.max(0, Math.min(scrollOffset, messages.length - effectiveMaxHeight));
    return messages.slice(start, start + effectiveMaxHeight);
  }, [messages, effectiveMaxHeight, scrollOffset]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    const messageCountChanged = messages.length !== prevMessageCountRef.current;
    prevMessageCountRef.current = messages.length;

    if (messageCountChanged && autoScroll && !userScrolledUp) {
      // New message arrived and auto-scroll is enabled
      if (effectiveMaxHeight && messages.length > effectiveMaxHeight) {
        setScrollOffset(messages.length - effectiveMaxHeight);
      }
    }
  }, [messages.length, autoScroll, userScrolledUp, effectiveMaxHeight]);

  // Notify parent of scroll position changes
  useEffect(() => {
    onScrollChange?.(isAtBottom);
  }, [isAtBottom, onScrollChange]);

  // Scroll to bottom helper
  const scrollToBottom = useCallback(() => {
    if (effectiveMaxHeight && messages.length > effectiveMaxHeight) {
      setScrollOffset(messages.length - effectiveMaxHeight);
    }
    setUserScrolledUp(false);
  }, [messages.length, effectiveMaxHeight]);

  // Scroll up helper
  const scrollUp = useCallback((amount = 1) => {
    setScrollOffset((prev) => Math.max(0, prev - amount));
    setUserScrolledUp(true);
  }, []);

  // Scroll down helper
  const scrollDown = useCallback(
    (amount = 1) => {
      if (!effectiveMaxHeight || messages.length <= effectiveMaxHeight) return;

      const maxOffset = messages.length - effectiveMaxHeight;
      setScrollOffset((prev) => {
        const newOffset = Math.min(maxOffset, prev + amount);
        // If we've scrolled to the bottom, re-enable auto-scroll
        if (newOffset >= maxOffset) {
          setUserScrolledUp(false);
        }
        return newOffset;
      });
    },
    [messages.length, effectiveMaxHeight]
  );

  // Handle keyboard input for scrolling
  useInput(
    useCallback(
      (_char, key) => {
        // Only handle scroll keys when effectiveMaxHeight is set (windowed mode)
        if (!effectiveMaxHeight || messages.length <= effectiveMaxHeight) return;

        // Page Up - scroll up by half a page
        if (key.pageUp) {
          scrollUp(Math.floor(effectiveMaxHeight / 2));
          return;
        }

        // Page Down - scroll down by half a page
        if (key.pageDown) {
          scrollDown(Math.floor(effectiveMaxHeight / 2));
          return;
        }

        // Up arrow - scroll up by one
        if (key.upArrow) {
          scrollUp(1);
          return;
        }

        // Down arrow - scroll down by one
        if (key.downArrow) {
          scrollDown(1);
          return;
        }

        // Home - scroll to top
        if (key.meta && key.upArrow) {
          setScrollOffset(0);
          setUserScrolledUp(true);
          return;
        }

        // End - scroll to bottom
        if (key.meta && key.downArrow) {
          scrollToBottom();
          return;
        }
      },
      [effectiveMaxHeight, messages.length, scrollUp, scrollDown, scrollToBottom]
    )
  );

  // Theme-based styling
  const roleColors: Record<Message["role"], string> = useMemo(
    () => ({
      user: theme.colors.primary,
      assistant: theme.colors.success,
      system: theme.colors.warning,
      tool: theme.colors.info,
    }),
    [theme.colors.primary, theme.colors.success, theme.colors.warning, theme.colors.info]
  );
  const textColor = theme.semantic.text.primary;
  const mutedColor = theme.semantic.text.muted;
  const borderColor = theme.semantic.border.default;

  // Virtualized list callbacks must be defined unconditionally to keep hook order stable.
  const renderMessageItem = useCallback(
    ({ item }: { item: Message; index: number }) => (
      <MessageItem
        message={item}
        roleColor={roleColors[item.role]}
        textColor={textColor}
        mutedColor={mutedColor}
      />
    ),
    [roleColors, textColor, mutedColor]
  );

  const keyExtractor = useCallback((item: Message) => item.id, []);

  const handleStickingChange = useCallback(
    (isSticking: boolean) => {
      onScrollChange?.(isSticking);
    },
    [onScrollChange]
  );

  // Empty state
  if (messages.length === 0) {
    return (
      <Box flexDirection="column" flexGrow={1} paddingX={1}>
        <Text color={mutedColor} italic>
          No messages yet. Start a conversation!
        </Text>
      </Box>
    );
  }

  // Calculate scroll indicator
  const showScrollUp = effectiveMaxHeight && scrollOffset > 0;
  const showScrollDown = effectiveMaxHeight && messages.length > effectiveMaxHeight && !isAtBottom;

  // ==========================================================================
  // Virtualized Rendering (for optimal performance with large lists)
  // ==========================================================================
  // When useVirtualizedList is enabled, we use VirtualizedList which only
  // renders visible items. This is ideal for very long conversations.
  if (useVirtualizedList) {
    return (
      <Box flexDirection="column" flexGrow={1} height={effectiveMaxHeight ?? "100%"}>
        <VirtualizedList
          ref={virtualizedListRef}
          data={messages as Message[]}
          renderItem={renderMessageItem}
          keyExtractor={keyExtractor}
          estimatedItemHeight={estimatedItemHeight}
          initialScrollIndex={SCROLL_TO_ITEM_END}
          initialScrollOffsetInIndex={SCROLL_TO_ITEM_END}
          onStickingToBottomChange={handleStickingChange}
          scrollbarThumbColor={theme.semantic.text.muted}
        />

        {/* Pending message for streaming (rendered separately for performance) */}
        {pendingMessage && (
          <Box paddingX={1}>
            <MessageItem
              message={pendingMessage}
              roleColor={roleColors[pendingMessage.role]}
              textColor={textColor}
              mutedColor={mutedColor}
            />
          </Box>
        )}

        {/* Auto-scroll status indicator */}
        {userScrolledUp && autoScroll && (
          <Box justifyContent="center">
            <Text color={mutedColor} italic>
              Auto-scroll paused (scroll to bottom to resume)
            </Text>
          </Box>
        )}
      </Box>
    );
  }

  // ==========================================================================
  // Optimized Rendering with Static (for completed messages)
  // ==========================================================================
  // When historyMessages is provided, we use Ink's <Static> for completed
  // messages. Static content is rendered once and never re-renders, which
  // dramatically improves performance during streaming.
  if (useStaticRendering && historyMessages) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        {/* Scroll up indicator */}
        {showScrollUp && (
          <Box justifyContent="center" borderBottom borderColor={borderColor}>
            <Text color={mutedColor}>↑ {scrollOffset} more above ↑</Text>
          </Box>
        )}

        {/* History messages - rendered in <Static>, NEVER re-render */}
        <Static items={historyMessages as Message[]}>
          {(message: Message) => (
            <Box key={message.id} paddingX={1}>
              <MessageItem
                message={message}
                roleColor={roleColors[message.role]}
                textColor={textColor}
                mutedColor={mutedColor}
              />
            </Box>
          )}
        </Static>

        {/* Pending message - this is the ONLY thing that re-renders during streaming */}
        {pendingMessage && (
          <Box paddingX={1}>
            <MessageItem
              message={pendingMessage}
              roleColor={roleColors[pendingMessage.role]}
              textColor={textColor}
              mutedColor={mutedColor}
            />
          </Box>
        )}

        {/* Scroll down indicator */}
        {showScrollDown && (
          <Box justifyContent="center" borderTop borderColor={borderColor}>
            <Text color={mutedColor}>
              ↓ {messages.length - scrollOffset - (effectiveMaxHeight ?? 0)} more below ↓
            </Text>
          </Box>
        )}

        {/* Auto-scroll status indicator when disabled by user scroll */}
        {userScrolledUp && autoScroll && (
          <Box justifyContent="center">
            <Text color={mutedColor} italic>
              Auto-scroll paused (scroll to bottom to resume)
            </Text>
          </Box>
        )}
      </Box>
    );
  }

  // ==========================================================================
  // Legacy Rendering (when historyMessages not provided)
  // ==========================================================================
  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Scroll up indicator */}
      {showScrollUp && (
        <Box justifyContent="center" borderBottom borderColor={borderColor}>
          <Text color={mutedColor}>↑ {scrollOffset} more above ↑</Text>
        </Box>
      )}

      {/* Messages */}
      <Box flexDirection="column" paddingX={1}>
        {visibleMessages.map((message) => (
          <MessageItem
            key={message.id}
            message={message}
            roleColor={roleColors[message.role]}
            textColor={textColor}
            mutedColor={mutedColor}
          />
        ))}
      </Box>

      {/* Scroll down indicator */}
      {showScrollDown && (
        <Box justifyContent="center" borderTop borderColor={borderColor}>
          <Text color={mutedColor}>
            ↓ {messages.length - scrollOffset - (effectiveMaxHeight ?? 0)} more below ↓
          </Text>
        </Box>
      )}

      {/* Auto-scroll status indicator when disabled by user scroll */}
      {userScrolledUp && autoScroll && (
        <Box justifyContent="center">
          <Text color={mutedColor} italic>
            Auto-scroll paused (scroll to bottom to resume)
          </Text>
        </Box>
      )}
    </Box>
  );
});

export { MessageList };
export default MessageList;
