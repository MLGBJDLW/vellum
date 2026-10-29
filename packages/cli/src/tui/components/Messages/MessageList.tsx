/**
 * MessageList Component (T017)
 *
 * Displays a list of messages with auto-scroll support and optimized rendering.
 * Uses virtualized rendering for optimal performance with large message lists.
 *
 * V2 Simplified Props (Phase 3):
 * - Core: messages, isStreaming, isFocused
 * - Callbacks: onScrollChange
 * - Configuration: estimatedItemHeight, scrollKeyMode
 *
 * Features:
 * - Virtualized rendering (always enabled for performance)
 * - Auto-scroll to bottom with manual override
 * - Keyboard navigation (PageUp/Down, Home/End)
 * - Thinking indicator during streaming
 * - New messages banner for unread notifications
 *
 * @module tui/components/Messages/MessageList
 */

import { getIcons } from "@vellum/shared";
import { Box, type Key, Text, useInput } from "ink";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getThinkingAutoCollapse,
  getThinkingAutoCollapseDelayMs,
  getThinkingDisplayMode,
  getThinkingExpandedByDefault,
  subscribeToDisplayMode,
  subscribeToThinkingAutoCollapse,
  subscribeToThinkingAutoCollapseDelay,
  subscribeToThinkingExpandedByDefault,
} from "../../../commands/think.js";
import { useLayoutPositionContext } from "../../context/LayoutPositionContext.js";
import type { Message, ToolCallInfo } from "../../context/MessagesContext.js";
import { useAlternateBuffer } from "../../hooks/useAlternateBuffer.js";
import { useAnimatedScrollbar } from "../../hooks/useAnimatedScrollbar.js";
import { useDiffMode } from "../../hooks/useDiffMode.js";
import { useMouseScroll } from "../../hooks/useMouseScroll.js";
import type { ThinkingDisplayMode } from "../../i18n/index.js";
import { useTUITranslation } from "../../i18n/index.js";
import { useTheme } from "../../theme/index.js";
import { isEndKey, isHomeKey } from "../../types/ink-extended.js";
import { estimateMessageHeight } from "../../utils/heightEstimator.js";
import { BannerShimmerText } from "../Banner/ShimmerText.js";
import { MaxSizedBox } from "../common/MaxSizedBox.js";
import { Spinner } from "../common/Spinner.js";
import { StreamingIndicator } from "../common/StreamingIndicator.js";
import {
  // New Messages Banner - unread notification
  NewMessagesBanner,
  SCROLL_TO_ITEM_END,
  VirtualizedList,
  type VirtualizedListRef,
} from "../common/VirtualizedList/index.js";
import type { VirtualizedScrollState } from "../common/VirtualizedList/types.js";
import { DiffView } from "./DiffView.js";
import { MarkdownRenderer } from "./MarkdownRenderer.js";
import { ThinkingBlock } from "./ThinkingBlock.js";
import { ToolResultPreview } from "./ToolResultPreview.js";

// =============================================================================
// Constants
// =============================================================================

/** ASCII text spinner animation frames for running tools (no Unicode/emoji) */
const SPINNER_FRAMES = ["-", "\\", "|", "/"] as const;
const THINKING_TOGGLE_HINT = "Alt+E";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the MessageList component.
 *
 * V2 Simplified Interface (Phase 3):
 * - Core: messages, isStreaming, isFocused
 * - Callbacks: onScrollChange
 * - Configuration: estimatedItemHeight, scrollKeyMode
 *
 * Deprecated props are kept for backward compatibility but will be removed in v3.
 */
export interface MessageListProps {
  // ===========================================================================
  // Core Props (Required/Recommended)
  // ===========================================================================

  /** Array of messages to display */
  readonly messages: readonly Message[];

  /**
   * Whether the agent is currently streaming a response.
   * Shows thinking indicator when true and no content has arrived.
   * @default false
   */
  readonly isStreaming?: boolean;

  /**
   * Whether this component has keyboard focus.
   * Controls whether PageUp/PageDown/arrow keys work.
   * @default true
   */
  readonly isFocused?: boolean;

  // ===========================================================================
  // Callbacks
  // ===========================================================================

  /** Callback when scroll position changes relative to bottom */
  readonly onScrollChange?: (isAtBottom: boolean) => void;

  // ===========================================================================
  // Configuration
  // ===========================================================================

  /**
   * Estimated height per message in lines (for virtualization).
   * Can be a fixed number or function for variable heights.
   * @default 4
   */
  readonly estimatedItemHeight?: number | ((index: number) => number);

  /**
   * Which keys are allowed for scroll control.
   * - "all": arrows, PageUp/PageDown, Home/End (default)
   * - "page": only PageUp/PageDown to avoid stealing input navigation
   */
  readonly scrollKeyMode?: "all" | "page";

  // ===========================================================================
  // Deprecated Props (kept for backward compatibility)
  // ===========================================================================

  /**
   * @deprecated No longer used. Use `messages` array directly.
   * Static rendering is handled internally.
   */
  readonly historyMessages?: readonly Message[];

  /**
   * @deprecated No longer needed. Streaming messages should have `isStreaming: true`
   * in the messages array. This prop is merged into `messages` internally.
   */
  readonly pendingMessage?: Message | null;

  /**
   * @deprecated Use `isStreaming` instead. This prop is kept for backward compatibility.
   * Shows thinking indicator when true and no content has arrived.
   */
  readonly isLoading?: boolean;

  /**
   * @deprecated Always enabled. Auto-scroll is the default behavior.
   * Users can manually scroll up to pause, scroll to bottom to resume.
   */
  readonly autoScroll?: boolean;

  /**
   * @deprecated Container height is used automatically.
   * Maximum height in lines (optional, for windowed display).
   */
  readonly maxHeight?: number;

  /**
   * @deprecated Always true. Virtualized rendering is always enabled for performance.
   */
  readonly useVirtualizedList?: boolean;

  /**
   * Resume follow on submission (Enter) when requested. Editing never moves history.
   */
  readonly forceFollowOnInput?: boolean;

  /**
   * @deprecated Handled at App level. Alternate buffer mode for viewport calculation.
   */
  readonly useAltBuffer?: boolean;

  /**
   * Enable mouse wheel scrolling. Keyboard navigation remains available when focused.
   */
  readonly enableScroll?: boolean;
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
 * Get the role display label using i18n.
 * @param role - Message role
 * @param t - Translation function from useTUITranslation
 */
function getRoleLabel(role: Message["role"], t: (key: string) => string): string {
  switch (role) {
    case "user":
      return t("messages.user");
    case "assistant":
      return t("messages.assistant");
    case "system":
      return t("messages.system");
    case "tool":
      return t("messages.tool");
    default:
      return t("messages.unknown");
  }
}

/**
 * Legacy estimateMessageHeight wrapper for virtualization.
 * Uses the extracted heightEstimator utility internally.
 */
function estimateMessageHeightLegacy(
  message: Message,
  width: number,
  includeToolCalls: boolean
): number {
  return estimateMessageHeight(message, { width, includeToolCalls });
}

interface DiffMetadata {
  readonly diff: string;
  readonly additions: number;
  readonly deletions: number;
}

function isDiffMetadata(value: unknown): value is DiffMetadata {
  if (!value || typeof value !== "object") {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.diff === "string" &&
    typeof obj.additions === "number" &&
    typeof obj.deletions === "number"
  );
}

function getDiffMetadata(result: unknown): DiffMetadata | null {
  if (isDiffMetadata(result)) {
    return result;
  }
  if (!result || typeof result !== "object") {
    return null;
  }
  const diffMeta = (result as Record<string, unknown>).diffMeta;
  return isDiffMetadata(diffMeta) ? diffMeta : null;
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
  // Get current diff view mode
  const { mode: diffMode } = useDiffMode();

  // Determine status indicator and color
  let statusIcon: React.ReactNode;
  let statusColor: string;

  switch (toolCall.status) {
    case "running":
    case "pending":
      statusIcon = <Spinner frames={SPINNER_FRAMES} color={accentColor} />;
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

  const diffMeta = getDiffMetadata(toolCall.result);
  const hasDiffStats =
    toolCall.status === "completed" &&
    diffMeta !== null &&
    (diffMeta.additions > 0 || diffMeta.deletions > 0);
  const hasDiffContent =
    toolCall.status === "completed" &&
    diffMeta !== null &&
    diffMeta.diff.trim() !== "" &&
    diffMeta.diff !== "(no changes)";

  // Show result preview for non-diff tool results
  const hasResultPreview =
    toolCall.status === "completed" &&
    !hasDiffContent &&
    toolCall.result !== undefined &&
    toolCall.result !== null;

  // Shimmer effect for running tools - use accent as base, highlight gold as shimmer peak
  const isRunning = toolCall.status === "running" || toolCall.status === "pending";

  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        <Text color={statusColor}>{statusIcon}</Text>
        <Text> </Text>
        {isRunning ? (
          <BannerShimmerText
            baseColor={accentColor}
            highlightColor="#FFD700"
            shimmerConfig={{ cycleDuration: 2000 }}
            shimmerWidth={0.2}
            bold
          >
            {toolCall.name}
          </BannerShimmerText>
        ) : (
          <Text color={accentColor} bold>
            {toolCall.name}
          </Text>
        )}
        {hasDiffStats && diffMeta && (
          <>
            <Text> </Text>
            <Text color={successColor}>+{diffMeta.additions}</Text>
            <Text> </Text>
            <Text color={errorColor}>-{diffMeta.deletions}</Text>
          </>
        )}
        {/* Show error message inline if present */}
        {toolCall.status === "error" && toolCall.error && (
          <Text color={errorColor} dimColor>
            {" "}
            — {toolCall.error}
          </Text>
        )}
      </Box>
      {hasDiffContent && diffMeta && (
        <Box marginLeft={2} marginTop={1}>
          <MaxSizedBox maxHeight={12} truncationIndicator="... (diff truncated)">
            <DiffView diff={diffMeta.diff} compact mode={diffMode} />
          </MaxSizedBox>
        </Box>
      )}
      {hasResultPreview && (
        <Box marginLeft={2} marginTop={0}>
          <ToolResultPreview result={toolCall.result} toolName={toolCall.name} />
        </Box>
      )}
    </Box>
  );
});

/**
 * ThinkingIndicator component.
 * Shows an animated spinner with "Thinking..." text while the agent is processing
 * and before any streaming content has arrived.
 *
 * Uses StreamingIndicator for consistent styling across all streaming phases.
 */
const ThinkingIndicator = memo(function ThinkingIndicator() {
  // Use StreamingIndicator for consistent styling
  return (
    <Box marginBottom={1} paddingX={1}>
      <StreamingIndicator phase="thinking" showPhaseTime narrow showCancelHint />
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
  /** Display mode for thinking blocks */
  readonly thinkingDisplayMode?: "full" | "compact";
  /** Toggle signal for thinking blocks */
  readonly thinkingToggleSignal?: number;
  /** Hint text for thinking toggle */
  readonly thinkingToggleHint?: string;
  /** Callback when thinking block height changes (for virtualized list re-measurement) */
  readonly onThinkingHeightChange?: () => void;
  /** Whether thinking blocks start expanded by default */
  readonly thinkingExpandedByDefault?: boolean;
  /** Whether thinking blocks auto-collapse after streaming ends */
  readonly thinkingAutoCollapse?: boolean;
  /** Delay before auto-collapsing in milliseconds */
  readonly thinkingAutoCollapseDelayMs?: number;
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
  thinkingColor: _thinkingColor, // ThinkingBlock handles its own theming
  successColor,
  errorColor,
  showToolCalls = true,
  thinkingDisplayMode,
  thinkingToggleSignal,
  thinkingToggleHint,
  onThinkingHeightChange,
  thinkingExpandedByDefault = true,
  thinkingAutoCollapse = false,
  thinkingAutoCollapseDelayMs = 300,
}: MessageItemProps) {
  const { t } = useTUITranslation();
  const icon = getRoleIcon(message.role);
  const label = getRoleLabel(message.role, t);
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
        <ThinkingBlock
          content={message.thinking ?? ""}
          durationMs={message.thinkingDuration}
          isStreaming={message.isStreaming && !message.isThinkingComplete}
          isThinkingComplete={message.isThinkingComplete}
          initialCollapsed={!thinkingExpandedByDefault}
          expandedByDefault={thinkingExpandedByDefault}
          autoCollapse={thinkingAutoCollapse}
          autoCollapseDelayMs={thinkingAutoCollapseDelayMs}
          persistenceId={`thinking-${message.id}`}
          showCharCount
          displayMode={thinkingDisplayMode}
          toggleSignal={thinkingToggleSignal}
          toggleHint={thinkingToggleHint}
          onHeightChange={onThinkingHeightChange}
        />
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
 * // Optional Static rendering (static output mode only)
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
  // Core props
  messages,
  isStreaming,
  isFocused,
  // Callbacks
  onScrollChange,
  // Configuration
  estimatedItemHeight = 4,
  scrollKeyMode = "all",
  // Deprecated props (kept for backward compatibility)
  historyMessages: _historyMessages,
  pendingMessage,
  isLoading,
  autoScroll = true,
  maxHeight,
  useVirtualizedList: _useVirtualizedList,
  forceFollowOnInput = false,
  useAltBuffer = false,
  enableScroll = false,
}: MessageListProps) {
  // Merge isStreaming and isLoading for backward compatibility
  // isStreaming takes precedence over deprecated isLoading
  const isLoadingInternal = isStreaming ?? isLoading ?? false;

  const { theme } = useTheme();

  // Subscribe to thinking display mode changes
  const [thinkingDisplayMode, setThinkingDisplayMode] =
    useState<ThinkingDisplayMode>(getThinkingDisplayMode);
  useEffect(() => {
    const unsubscribe = subscribeToDisplayMode(setThinkingDisplayMode);
    return unsubscribe;
  }, []);

  // Subscribe to thinking expanded-by-default changes
  const [thinkingExpandedByDefault, setThinkingExpandedByDefaultState] = useState<boolean>(
    getThinkingExpandedByDefault
  );
  useEffect(() => {
    const unsubscribe = subscribeToThinkingExpandedByDefault(setThinkingExpandedByDefaultState);
    return unsubscribe;
  }, []);

  // Subscribe to thinking auto-collapse changes
  const [thinkingAutoCollapse, setThinkingAutoCollapseState] =
    useState<boolean>(getThinkingAutoCollapse);
  useEffect(() => {
    const unsubscribe = subscribeToThinkingAutoCollapse(setThinkingAutoCollapseState);
    return unsubscribe;
  }, []);

  // Subscribe to thinking auto-collapse delay changes
  const [thinkingAutoCollapseDelayMs, setThinkingAutoCollapseDelayMsState] = useState<number>(
    getThinkingAutoCollapseDelayMs
  );
  useEffect(() => {
    const unsubscribe = subscribeToThinkingAutoCollapseDelay(setThinkingAutoCollapseDelayMsState);
    return unsubscribe;
  }, []);

  // Determine if we should show the thinking indicator:
  // - Agent is streaming (processing/waiting)
  // - AND no pending content has arrived yet
  // NOTE: Hoisted here to avoid TDZ error with scrollViewportHeight calculation
  const hasPendingContent = pendingMessage?.content && pendingMessage.content.length > 0;
  const showThinkingIndicator = isLoadingInternal && !hasPendingContent;
  const hasActiveStreaming = Boolean(
    pendingMessage?.isStreaming || messages.some((message) => message.isStreaming)
  );
  const activeThinkingMessageId = useMemo(() => {
    if (pendingMessage?.thinking && pendingMessage.thinking.length > 0) {
      return pendingMessage.id;
    }
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message?.thinking && message.thinking.length > 0) {
        return message.id;
      }
    }
    return null;
  }, [messages, pendingMessage?.id, pendingMessage?.thinking]);

  // Get viewport dimensions for adaptive rendering
  // FIX: Use consistent inputReserve value matching useAlternateBuffer default (7)
  // This ensures height calculations are accurate:
  // - Input minHeight: 5 lines (for multiline input)
  // - Border: 2 lines (top + bottom)
  // Total: 7 lines reserved for input area
  const INPUT_RESERVE_HEIGHT = 7;
  const { availableHeight, width } = useAlternateBuffer({
    withViewport: true,
    enabled: useAltBuffer,
    inputReserve: INPUT_RESERVE_HEIGHT,
  });

  const layout = useLayoutPositionContext();
  const estimatedContentWidth = Math.max(20, (layout?.contentBounds.width ?? width) - 4);

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

  const isStaticOutputMode = process.env.VELLUM_STATIC_OUTPUT === "1";
  const shouldConstrainHeight =
    !isStaticOutputMode && (useAltBuffer || (process.stdout.isTTY ?? false));

  // Ref for VirtualizedList imperative control
  const virtualizedListRef = useRef<VirtualizedListRef<Message>>(null);

  // Normalize maxHeight - treat 0, undefined, null as "no max height"
  const effectiveMaxHeight = maxHeight && maxHeight > 0 ? maxHeight : undefined;

  // Compute max height for virtualized list
  const computedMaxHeight = useMemo(() => {
    if (effectiveMaxHeight !== undefined) {
      // Explicit maxHeight prop takes precedence
      return effectiveMaxHeight;
    }
    // When the layout isn't height-constrained, give VirtualizedList a fixed height
    // so it doesn't expand with content and push the input/footer out of view.
    if (!shouldConstrainHeight) {
      return availableHeight;
    }
    return undefined;
  }, [effectiveMaxHeight, shouldConstrainHeight, availableHeight]);

  const thinkingIndicatorHeight = showThinkingIndicator ? 3 : 0;
  const [following, setFollowing] = useState(autoScroll);
  const [unreadCount, setUnreadCount] = useState(0);
  const [thinkingToggleNonce, setThinkingToggleNonce] = useState(0);

  const scrollToBottom = useCallback(() => {
    virtualizedListRef.current?.scrollToEnd();
  }, []);

  const scrollBy = useCallback((delta: number) => {
    const list = virtualizedListRef.current;
    if (!list) return;
    const { scrollTop, scrollHeight, innerHeight } = list.getScrollState();
    if (scrollHeight <= innerHeight) return;
    if (delta > 0 && scrollTop + delta >= scrollHeight - innerHeight - 1) {
      list.scrollToEnd();
    } else {
      list.scrollBy(delta);
    }
  }, []);

  const { scrollbarColor: animatedThumbColor, scrollByWithAnimation } = useAnimatedScrollbar(
    isFocused !== false,
    scrollBy
  );

  useMouseScroll({
    enabled: enableScroll && isFocused !== false,
    onScroll: scrollByWithAnimation,
    bounds: layout?.contentBounds,
  });

  useInput(
    (char, key: Key) => {
      const isAltE =
        (key.meta && ["e", "ê", "€"].includes(char.toLowerCase())) ||
        char === "\x1be" ||
        char === "´";
      if (isAltE && thinkingDisplayMode !== "compact" && activeThinkingMessageId) {
        setThinkingToggleNonce((previous) => previous + 1);
        return;
      }
      const list = virtualizedListRef.current;
      if (!list) return;
      const halfPage = Math.max(1, Math.floor(list.getScrollState().innerHeight / 2));
      if (key.pageUp) return scrollByWithAnimation(-halfPage);
      if (key.pageDown) return scrollByWithAnimation(halfPage);
      // While composing, arrows/Home/End belong to the editor. Typing does not move history.
      if (scrollKeyMode === "all") {
        if (key.upArrow) return scrollByWithAnimation(-1);
        if (key.downArrow) return scrollByWithAnimation(1);
        if (isHomeKey(char)) return list.scrollTo(0);
        if (isEndKey(char)) return scrollToBottom();
      }
      if (forceFollowOnInput && key.return) scrollToBottom();
    },
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
  const successColor = theme.colors.success;
  const errorColor = theme.colors.error;
  // Use muted color for thinking/reasoning content (dimmed appearance)
  const thinkingColor = theme.semantic.text.secondary ?? mutedColor;

  const getThinkingToggleInfo = useCallback(
    (message: Message) => {
      if (!message.thinking || message.thinking.length === 0) {
        return { signal: undefined, hint: undefined };
      }
      if (thinkingDisplayMode === "compact") {
        return { signal: undefined, hint: undefined };
      }
      if (message.id !== activeThinkingMessageId) {
        return { signal: undefined, hint: undefined };
      }
      return {
        signal: thinkingToggleNonce > 0 ? thinkingToggleNonce : undefined,
        hint: THINKING_TOGGLE_HINT,
      };
    },
    [activeThinkingMessageId, thinkingDisplayMode, thinkingToggleNonce]
  );

  // Callback to trigger re-measurement when ThinkingBlock height changes
  const handleThinkingHeightChange = useCallback(() => {
    virtualizedListRef.current?.forceRemeasure();
  }, []);

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
      const thinkingToggle = getThinkingToggleInfo(item);
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
          thinkingDisplayMode={thinkingDisplayMode}
          thinkingToggleSignal={thinkingToggle.signal}
          thinkingToggleHint={thinkingToggle.hint}
          onThinkingHeightChange={handleThinkingHeightChange}
          thinkingExpandedByDefault={thinkingExpandedByDefault}
          thinkingAutoCollapse={thinkingAutoCollapse}
          thinkingAutoCollapseDelayMs={thinkingAutoCollapseDelayMs}
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
      thinkingDisplayMode,
      getThinkingToggleInfo,
      handleThinkingHeightChange,
      thinkingExpandedByDefault,
      thinkingAutoCollapse,
      thinkingAutoCollapseDelayMs,
    ]
  );

  const keyExtractor = useCallback((item: Message) => item.id, []);

  const handleVirtualizedScrollChange = useCallback(
    (next: VirtualizedScrollState) => {
      const isFollowing = next.followMode !== "off";
      setFollowing(isFollowing);
      setUnreadCount(next.newMessageCount);
      onScrollChange?.(isFollowing);
    },
    [onScrollChange]
  );

  // IMPORTANT: pendingMessage is merged into allMessages to avoid Ink <Static>
  // layout issues. Ink's <Static> doesn't participate in Flexbox layout and
  // renders at top, causing position problems when rendered separately.
  // NOTE: This useMemo MUST be before early return to satisfy React hooks rules.
  const allMessages = useMemo(() => {
    const msgs = messages as Message[];
    if (!pendingMessage) {
      return msgs;
    }

    // Only append pendingMessage if its ID is not already in messages.
    // This avoids creating new array references when content streams.
    const existsInMessages = msgs.some((m) => m.id === pendingMessage.id);
    if (existsInMessages) {
      return msgs;
    }
    return [...msgs, pendingMessage];
  }, [messages, pendingMessage]);

  // Streaming and completed messages share one viewport and one follow-mode owner.
  const virtualizedMessages = allMessages;

  const estimatedItemHeightForVirtualization = useMemo(() => {
    if (typeof estimatedItemHeight === "function") {
      return estimatedItemHeight;
    }
    const baseEstimate = estimatedItemHeight;
    return (index: number) => {
      const message = virtualizedMessages[index];
      if (!message) {
        return baseEstimate;
      }
      const includeToolCalls = shouldRenderInlineToolCalls(message);
      return Math.max(
        baseEstimate,
        estimateMessageHeightLegacy(message, estimatedContentWidth, includeToolCalls)
      );
    };
  }, [
    estimatedItemHeight,
    virtualizedMessages,
    estimatedContentWidth,
    shouldRenderInlineToolCalls,
  ]);

  // Empty state
  if (allMessages.length === 0) {
    return (
      <Box flexDirection="column" flexGrow={1} paddingX={1}>
        <Text color={mutedColor} italic>
          No messages yet. Ask a question or give Vellum a task.
        </Text>
      </Box>
    );
  }

  // ==========================================================================
  // Virtualized Rendering (only rendering mode - Phase 2a)
  // ==========================================================================
  // FIX: When computedMaxHeight is undefined, rely on flex sizing so the list can
  // shrink to make room for streaming messages rendered below VirtualizedList.
  // Streaming area height is computed above (estimate + measurement) for the
  // constrained-height path.
  const listHeight =
    computedMaxHeight !== undefined
      ? Math.max(1, computedMaxHeight - thinkingIndicatorHeight - (!following ? 1 : 0))
      : undefined;

  return (
    <Box flexDirection="column" flexGrow={1} minHeight={0} height={computedMaxHeight}>
      <Box flexDirection="row" flexGrow={1} minHeight={0} height={listHeight}>
        <Box flexDirection="column" flexGrow={1} minHeight={0} height={listHeight}>
          <VirtualizedList
            ref={virtualizedListRef}
            data={virtualizedMessages}
            renderItem={renderMessageItem}
            keyExtractor={keyExtractor}
            estimatedItemHeight={estimatedItemHeightForVirtualization}
            initialScrollIndex={autoScroll ? SCROLL_TO_ITEM_END : 0}
            initialScrollOffsetInIndex={autoScroll ? SCROLL_TO_ITEM_END : 0}
            onScrollStateChange={handleVirtualizedScrollChange}
            scrollbarThumbColor={animatedThumbColor}
            alignToBottom
            isStreaming={hasActiveStreaming}
          />
        </Box>
      </Box>

      {/* Thinking indicator - shows while agent is processing before first token */}
      {showThinkingIndicator && <ThinkingIndicator />}

      {!following && (
        <Box flexShrink={0}>
          {unreadCount > 0 ? (
            <NewMessagesBanner
              unreadCount={unreadCount}
              isAtBottom={false}
              onJumpToBottom={scrollToBottom}
            />
          ) : (
            <Text dimColor>Reading history · PgDn to return to latest</Text>
          )}
        </Box>
      )}
    </Box>
  );
});

export { MessageList };
export default MessageList;
