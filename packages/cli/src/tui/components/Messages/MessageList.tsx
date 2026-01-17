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
import { Box, type Key, Static, Text, useInput } from "ink";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAnimationFrame } from "../../context/AnimationContext.js";
import type { Message, ToolCallInfo } from "../../context/MessagesContext.js";
import { useTUITranslation } from "../../i18n/index.js";
import { useTheme } from "../../theme/index.js";
import { MaxSizedBox } from "../common/MaxSizedBox.js";
import {
  SCROLL_TO_ITEM_END,
  VirtualizedList,
  type VirtualizedListRef,
} from "../common/VirtualizedList/index.js";
import { MarkdownRenderer } from "./MarkdownRenderer.js";

// =============================================================================
// Constants
// =============================================================================

/** ASCII text spinner animation frames for running tools (no Unicode/emoji) */
const SPINNER_FRAMES = ["-", "\\", "|", "/"] as const;

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
  /** Whether the agent is currently processing (shows thinking indicator) */
  readonly isLoading?: boolean;
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
  /**
   * Whether this component has focus for keyboard input.
   * Controls whether PageUp/PageDown/arrow keys work.
   * @default true (active when not specified for backward compatibility)
   */
  readonly isFocused?: boolean;
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

/**
 * Estimate wrapped line count for a text block using a target width.
 */
function estimateWrappedLineCount(text: string, width: number): number {
  const safeWidth = Math.max(1, width);
  if (!text) {
    return 1;
  }

  let total = 0;
  const lines = text.split("\n");
  for (const line of lines) {
    const lineLength = line.length;
    if (lineLength === 0) {
      total += 1;
      continue;
    }
    total += Math.max(1, Math.ceil(lineLength / safeWidth));
  }
  return total;
}

/**
 * Estimate a message height in lines to keep virtualized scrolling accurate.
 */
function estimateMessageHeight(message: Message, width: number, includeToolCalls: boolean): number {
  const headerLines = 1;
  const marginLines = 1;
  const contentWidth = Math.max(10, width - 4);
  const thinkingWidth = Math.max(10, width - 6);

  if (message.role === "tool_group") {
    const toolLines = message.toolCalls?.length ?? 0;
    return Math.max(1, toolLines) + marginLines;
  }

  const content = message.content || (message.isStreaming ? "" : "(empty)");
  let lines = headerLines;

  lines += estimateWrappedLineCount(content, contentWidth);

  if (message.thinking && message.thinking.length > 0) {
    lines += 1; // "Thinking..." label
    lines += estimateWrappedLineCount(message.thinking, thinkingWidth);
  }

  if (includeToolCalls && message.toolCalls && message.toolCalls.length > 0) {
    lines += 1; // margin before tool calls
    lines += message.toolCalls.length;
  }

  return lines + marginLines;
}

// =============================================================================
// Sub-Components
// =============================================================================

/**
 * Props for inline tool call indicator.
 */
interface InlineToolCallProps {
  readonly toolCall: ToolCallInfo;
  readonly accentColor: string;
  readonly mutedColor: string;
  readonly successColor: string;
  readonly errorColor: string;
}

/**
 * Renders an inline tool call with status indicator (spinner/checkmark/error).
 * Gemini-style: shows tool name with animated spinner while running,
 * checkmark when completed, X when error.
 */
const InlineToolCall = memo(function InlineToolCall({
  toolCall,
  accentColor,
  mutedColor,
  successColor,
  errorColor,
}: InlineToolCallProps) {
  // Use animation frame for spinner (only animates when running)
  const frameIndex = useAnimationFrame(SPINNER_FRAMES);

  // Determine status indicator and color
  let statusIcon: string;
  let statusColor: string;

  switch (toolCall.status) {
    case "running":
    case "pending":
      statusIcon = SPINNER_FRAMES[frameIndex] ?? "-";
      statusColor = accentColor;
      break;
    case "completed":
      statusIcon = "+";
      statusColor = successColor;
      break;
    case "error":
      statusIcon = "x";
      statusColor = errorColor;
      break;
    default:
      statusIcon = "o";
      statusColor = mutedColor;
  }

  return (
    <Box flexDirection="row">
      <Text color={statusColor}>{statusIcon}</Text>
      <Text> </Text>
      <Text color={accentColor} bold>
        {toolCall.name}
      </Text>
      {/* Show error message inline if present */}
      {toolCall.status === "error" && toolCall.error && (
        <Text color={errorColor} dimColor>
          {" "}
          — {toolCall.error}
        </Text>
      )}
    </Box>
  );
});

/**
 * ThinkingIndicator component.
 * Shows an animated spinner with "Thinking..." text while the agent is processing
 * and before any streaming content has arrived.
 */
const ThinkingIndicator = memo(function ThinkingIndicator() {
  const { t } = useTUITranslation();
  const frameIndex = useAnimationFrame(SPINNER_FRAMES);

  return (
    <Box marginBottom={1} paddingX={1}>
      <Text color="cyan">
        {SPINNER_FRAMES[frameIndex]} {t("messages.thinking")}
      </Text>
    </Box>
  );
});

/**
 * ToolGroupItem component.
 * Renders tool call rows inline between assistant segments.
 */
interface ToolGroupItemProps {
  readonly message: Message & { role: "tool_group" };
  readonly accentColor: string;
  readonly mutedColor: string;
  readonly successColor: string;
  readonly errorColor: string;
}

const ToolGroupItem = memo(function ToolGroupItem({
  message,
  accentColor,
  mutedColor,
  successColor,
  errorColor,
}: ToolGroupItemProps) {
  if (!message.toolCalls || message.toolCalls.length === 0) {
    return <Box />;
  }

  return (
    <Box flexDirection="column" marginBottom={1}>
      <MaxSizedBox maxHeight={15} truncationIndicator="... (more tool calls)">
        <Box flexDirection="column" marginLeft={2}>
          {message.toolCalls.map((toolCall) => (
            <InlineToolCall
              key={toolCall.id}
              toolCall={toolCall}
              accentColor={accentColor}
              mutedColor={mutedColor}
              successColor={successColor}
              errorColor={errorColor}
            />
          ))}
        </Box>
      </MaxSizedBox>
    </Box>
  );
});

/**
 * Props for a single message item.
 */
interface MessageItemProps {
  readonly message: Message;
  readonly roleColor: string;
  readonly mutedColor: string;
  readonly accentColor: string;
  /** Color for thinking/reasoning content */
  readonly thinkingColor: string;
  /** Color for success indicators */
  readonly successColor: string;
  /** Color for error indicators */
  readonly errorColor: string;
  /** Whether to render inline tool calls for this message */
  readonly showToolCalls?: boolean;
}

/**
 * Renders a single message with role icon, timestamp, and content.
 * Includes optional thinking/reasoning content displayed before the main content.
 * Tool calls are displayed inline with Gemini-style status indicators.
 */
const MessageItem = memo(function MessageItem({
  message,
  roleColor,
  mutedColor,
  accentColor,
  thinkingColor,
  successColor,
  errorColor,
  showToolCalls = true,
}: MessageItemProps) {
  const icon = getRoleIcon(message.role);
  const label = getRoleLabel(message.role);
  const timestamp = formatTimestamp(message.timestamp);
  const hasThinking = message.thinking && message.thinking.length > 0;

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* Message header: role icon, label, and timestamp (or minimal for continuations) */}
      <Box>
        {message.isContinuation ? (
          <Text color={mutedColor}>↳</Text>
        ) : (
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
        )}
      </Box>

      {/* Thinking/reasoning content (if present) - displayed before main content */}
      {hasThinking && (
        <Box marginLeft={2} marginTop={0} flexDirection="column">
          <Text color={thinkingColor} dimColor italic>
            {getIcons().thinking} Thinking...
          </Text>
          <Box marginLeft={2}>
            <Text color={thinkingColor} dimColor>
              {message.thinking}
            </Text>
          </Box>
        </Box>
      )}

      {/* Message content */}
      <Box marginLeft={2} marginTop={0}>
        <MarkdownRenderer
          content={message.content || (message.isStreaming ? "" : "(empty)")}
          compact
          textColor={roleColor}
          isStreaming={message.isStreaming}
        />
      </Box>

      {/* Tool calls, if any - Gemini-style inline with status icons */}
      {showToolCalls && message.toolCalls && message.toolCalls.length > 0 && (
        <MaxSizedBox maxHeight={15} truncationIndicator="... (more tool calls)">
          <Box flexDirection="column" marginLeft={2} marginTop={1}>
            {message.toolCalls.map((toolCall) => (
              <InlineToolCall
                key={toolCall.id}
                toolCall={toolCall}
                accentColor={accentColor}
                mutedColor={mutedColor}
                successColor={successColor}
                errorColor={errorColor}
              />
            ))}
          </Box>
        </MaxSizedBox>
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
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Complex component with multiple rendering modes (virtualized, static, legacy) and scroll management
const MessageList = memo(function MessageList({
  messages,
  historyMessages,
  pendingMessage,
  isLoading = false,
  autoScroll = true,
  onScrollChange,
  maxHeight,
  useVirtualizedList = false,
  estimatedItemHeight = 4,
  isFocused,
}: MessageListProps) {
  const { theme } = useTheme();

  const toolGroupCallIds = useMemo(() => {
    const ids = new Set<string>();
    for (const message of messages) {
      if (message.role !== "tool_group" || !message.toolCalls) {
        continue;
      }
      for (const call of message.toolCalls) {
        ids.add(call.id);
      }
    }
    return ids;
  }, [messages]);
  const hasToolGroups = toolGroupCallIds.size > 0;
  const shouldRenderInlineToolCalls = useCallback(
    (message: Message) => {
      if (message.role !== "assistant") {
        return true;
      }
      if (!message.toolCalls || message.toolCalls.length === 0) {
        return true;
      }
      for (const call of message.toolCalls) {
        if (toolGroupCallIds.has(call.id)) {
          return false;
        }
      }
      return true;
    },
    [toolGroupCallIds]
  );

  // Ref for VirtualizedList imperative control
  const virtualizedListRef = useRef<VirtualizedListRef<Message>>(null);

  // Normalize maxHeight - treat 0, undefined, null as "no max height"
  const effectiveMaxHeight = maxHeight && maxHeight > 0 ? maxHeight : undefined;

  // Determine if we're using optimized Static rendering
  // If historyMessages is provided, use the split architecture
  // NOTE: Static rendering does not support windowed scrolling; fall back when maxHeight is set.
  const useStaticRendering = historyMessages !== undefined && !effectiveMaxHeight && !hasToolGroups;

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

  // Helper: Handle virtualized list keyboard navigation
  const handleVirtualizedNavigation = useCallback(
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Complex keyboard navigation with many key combinations
    (key: Key, list: VirtualizedListRef<Message>): boolean => {
      const scrollState = list.getScrollState();
      if (scrollState.scrollHeight <= scrollState.innerHeight) {
        return false;
      }

      const pageSize = Math.max(1, Math.floor(scrollState.innerHeight / 2));
      const lineStep = 1;

      if (key.pageUp) {
        list.scrollBy(-pageSize);
        setUserScrolledUp(true);
        return true;
      }

      if (key.pageDown) {
        const reachesBottom =
          scrollState.scrollTop + pageSize >=
          scrollState.scrollHeight - scrollState.innerHeight - 1;
        if (reachesBottom) {
          list.scrollToEnd();
          setUserScrolledUp(false);
        } else {
          list.scrollBy(pageSize);
        }
        return true;
      }

      if (key.upArrow) {
        list.scrollBy(-lineStep);
        setUserScrolledUp(true);
        return true;
      }

      if (key.downArrow) {
        const reachesBottom =
          scrollState.scrollTop + lineStep >=
          scrollState.scrollHeight - scrollState.innerHeight - 1;
        if (reachesBottom) {
          list.scrollToEnd();
          setUserScrolledUp(false);
        } else {
          list.scrollBy(lineStep);
        }
        return true;
      }

      if (key.home) {
        list.scrollTo(0);
        setUserScrolledUp(true);
        return true;
      }

      if (key.end) {
        list.scrollToEnd();
        setUserScrolledUp(false);
        return true;
      }

      if (key.meta && key.upArrow) {
        list.scrollTo(0);
        setUserScrolledUp(true);
        return true;
      }

      if (key.meta && key.downArrow) {
        list.scrollToEnd();
        setUserScrolledUp(false);
        return true;
      }

      return false;
    },
    []
  );

  // Helper: Handle direct (non-virtualized) keyboard navigation
  const handleDirectNavigation = useCallback(
    (key: Key): boolean => {
      if (!effectiveMaxHeight || messages.length <= effectiveMaxHeight) {
        return false;
      }

      if (key.pageUp) {
        scrollUp(Math.floor(effectiveMaxHeight / 2));
        return true;
      }

      if (key.pageDown) {
        scrollDown(Math.floor(effectiveMaxHeight / 2));
        return true;
      }

      if (key.upArrow) {
        scrollUp(1);
        return true;
      }

      if (key.downArrow) {
        scrollDown(1);
        return true;
      }

      if (key.meta && key.upArrow) {
        setScrollOffset(0);
        setUserScrolledUp(true);
        return true;
      }

      if (key.meta && key.downArrow) {
        scrollToBottom();
        return true;
      }

      return false;
    },
    [effectiveMaxHeight, messages.length, scrollUp, scrollDown, scrollToBottom]
  );

  // Handle keyboard input for scrolling
  // isActive defaults to true when isFocused is undefined (backward compatible)
  useInput(
    useCallback(
      (_char, key) => {
        if (useVirtualizedList) {
          const list = virtualizedListRef.current;
          if (list) {
            handleVirtualizedNavigation(key, list);
          }
        } else {
          handleDirectNavigation(key);
        }
      },
      [useVirtualizedList, handleVirtualizedNavigation, handleDirectNavigation]
    ),
    { isActive: isFocused !== false }
  );

  // Theme-based styling
  const roleColors: Record<Message["role"], string> = useMemo(
    () => ({
      user: theme.semantic.text.role.user,
      assistant: theme.semantic.text.role.assistant,
      system: theme.semantic.text.role.system,
      tool: theme.semantic.text.role.tool,
      tool_group: theme.semantic.text.role.tool,
    }),
    [
      theme.semantic.text.role.user,
      theme.semantic.text.role.assistant,
      theme.semantic.text.role.system,
      theme.semantic.text.role.tool,
    ]
  );
  const mutedColor = theme.semantic.text.muted;
  const accentColor = theme.colors.accent;
  const borderColor = theme.semantic.border.default;
  const successColor = theme.colors.success;
  const errorColor = theme.colors.error;
  // Use muted color for thinking/reasoning content (dimmed appearance)
  const thinkingColor = theme.semantic.text.secondary ?? mutedColor;

  // Virtualized list callbacks must be defined unconditionally to keep hook order stable.
  const renderMessageItem = useCallback(
    ({ item }: { item: Message; index: number }) => {
      if (item.role === "tool_group") {
        return (
          <ToolGroupItem
            message={item as Message & { role: "tool_group" }}
            accentColor={accentColor}
            mutedColor={mutedColor}
            successColor={successColor}
            errorColor={errorColor}
          />
        );
      }
      const showToolCallsForItem = shouldRenderInlineToolCalls(item);
      // Standard message rendering
      return (
        <MessageItem
          message={item}
          roleColor={roleColors[item.role]}
          mutedColor={mutedColor}
          accentColor={accentColor}
          thinkingColor={thinkingColor}
          successColor={successColor}
          errorColor={errorColor}
          showToolCalls={showToolCallsForItem}
        />
      );
    },
    [
      roleColors,
      mutedColor,
      accentColor,
      thinkingColor,
      successColor,
      errorColor,
      shouldRenderInlineToolCalls,
    ]
  );

  const keyExtractor = useCallback((item: Message) => item.id, []);

  const handleStickingChange = useCallback(
    (isSticking: boolean) => {
      setUserScrolledUp(!isSticking);
      onScrollChange?.(isSticking);
    },
    [onScrollChange]
  );

  const estimatedContentWidth = Math.max(20, (process.stdout.columns ?? 80) - 24);

  // IMPORTANT: pendingMessage is merged into allMessages to avoid Ink <Static>
  // layout issues. Ink's <Static> doesn't participate in Flexbox layout and
  // renders at top, causing position problems when rendered separately.
  // NOTE: This useMemo MUST be before early return to satisfy React hooks rules.
  const allMessages = useMemo(() => {
    const msgs = messages as Message[];
    if (!pendingMessage) {
      return msgs;
    }

    // Filter out any message with same ID as pendingMessage (avoid duplicates),
    // then always append pendingMessage to ensure streaming content is visible.
    // Previous approach checked `lastMessage?.id === pendingMessage.id` which
    // skipped appending when IDs matched, causing streaming updates to be invisible.
    const filtered = msgs.filter((m) => m.id !== pendingMessage.id);
    return [...filtered, pendingMessage];
  }, [messages, pendingMessage]);

  // Determine if we should show the thinking indicator:
  // - Agent is loading (processing/waiting)
  // - AND no pending content has arrived yet
  const hasPendingContent = pendingMessage?.content && pendingMessage.content.length > 0;
  const showThinkingIndicator = isLoading && !hasPendingContent;

  const estimatedItemHeightForVirtualization = useMemo(() => {
    if (typeof estimatedItemHeight === "function") {
      return estimatedItemHeight;
    }
    const baseEstimate = estimatedItemHeight;
    return (index: number) => {
      const message = allMessages[index];
      if (!message) {
        return baseEstimate;
      }
      const includeToolCalls = shouldRenderInlineToolCalls(message);
      return Math.max(
        baseEstimate,
        estimateMessageHeight(message, estimatedContentWidth, includeToolCalls)
      );
    };
  }, [estimatedItemHeight, allMessages, estimatedContentWidth, shouldRenderInlineToolCalls]);

  // Auto-scroll to end when new messages arrive or pending content updates (virtualized mode only)
  const allMessagesLengthRef = useRef(allMessages.length);
  const prevPendingContentRef = useRef<string | undefined>(pendingMessage?.content);
  const prevPendingIdRef = useRef<string | undefined>(pendingMessage?.id);
  useEffect(() => {
    const hasNewMessages = allMessages.length > allMessagesLengthRef.current;
    const pendingContentChanged = pendingMessage?.content !== prevPendingContentRef.current;
    // Detect when a NEW assistant message starts streaming (different ID than before)
    const newPendingMessageStarted =
      pendingMessage?.id !== prevPendingIdRef.current && pendingMessage?.isStreaming;

    allMessagesLengthRef.current = allMessages.length;
    prevPendingContentRef.current = pendingMessage?.content;
    prevPendingIdRef.current = pendingMessage?.id;

    // Reset userScrolledUp when a new assistant message starts streaming
    // This ensures auto-scroll resumes for new responses even if user scrolled up previously
    if (newPendingMessageStarted && autoScroll) {
      setUserScrolledUp(false);
    }

    // Scroll when: new message arrived OR pending message content is streaming
    const shouldScroll = hasNewMessages || (pendingMessage?.isStreaming && pendingContentChanged);

    // Skip scroll if user manually scrolled up (but not if we just reset it above)
    if (
      !useVirtualizedList ||
      !autoScroll ||
      (userScrolledUp && !newPendingMessageStarted) ||
      !shouldScroll
    ) {
      return;
    }
    virtualizedListRef.current?.scrollToEnd();
  }, [
    useVirtualizedList,
    autoScroll,
    userScrolledUp,
    allMessages,
    pendingMessage?.content,
    pendingMessage?.isStreaming,
    pendingMessage?.id,
  ]);

  // Empty state
  if (allMessages.length === 0) {
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
      <Box flexDirection="column" flexGrow={1} minHeight={0} height={effectiveMaxHeight}>
        <VirtualizedList
          ref={virtualizedListRef}
          data={allMessages}
          renderItem={renderMessageItem}
          keyExtractor={keyExtractor}
          estimatedItemHeight={estimatedItemHeightForVirtualization}
          initialScrollIndex={SCROLL_TO_ITEM_END}
          initialScrollOffsetInIndex={SCROLL_TO_ITEM_END}
          onStickingToBottomChange={handleStickingChange}
          scrollbarThumbColor={theme.semantic.text.muted}
          alignToBottom
        />

        {/* Thinking indicator - shows while agent is processing before first token */}
        {showThinkingIndicator && <ThinkingIndicator />}

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
        {/* Spacer pushes messages toward Input at bottom */}
        <Box flexGrow={1} />

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
                mutedColor={mutedColor}
                accentColor={accentColor}
                thinkingColor={thinkingColor}
                successColor={successColor}
                errorColor={errorColor}
                showToolCalls={shouldRenderInlineToolCalls(message)}
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
              mutedColor={mutedColor}
              accentColor={accentColor}
              thinkingColor={thinkingColor}
              successColor={successColor}
              errorColor={errorColor}
              showToolCalls={shouldRenderInlineToolCalls(pendingMessage)}
            />
          </Box>
        )}

        {/* Thinking indicator - shows while agent is processing before first token */}
        {showThinkingIndicator && <ThinkingIndicator />}

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
      {/* Spacer pushes messages toward Input at bottom */}
      <Box flexGrow={1} />

      {/* Scroll up indicator */}
      {showScrollUp && (
        <Box justifyContent="center" borderBottom borderColor={borderColor}>
          <Text color={mutedColor}>↑ {scrollOffset} more above ↑</Text>
        </Box>
      )}

      {/* Messages */}
      <Box flexDirection="column" paddingX={1}>
        {visibleMessages.map((message) =>
          message.role === "tool_group" ? (
            <ToolGroupItem
              key={message.id}
              message={message as Message & { role: "tool_group" }}
              accentColor={accentColor}
              mutedColor={mutedColor}
              successColor={successColor}
              errorColor={errorColor}
            />
          ) : (
            <MessageItem
              key={message.id}
              message={message}
              roleColor={roleColors[message.role]}
              mutedColor={mutedColor}
              accentColor={accentColor}
              thinkingColor={thinkingColor}
              successColor={successColor}
              errorColor={errorColor}
              showToolCalls={shouldRenderInlineToolCalls(message)}
            />
          )
        )}
      </Box>

      {/* Thinking indicator - shows while agent is processing before first token */}
      {showThinkingIndicator && <ThinkingIndicator />}

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
