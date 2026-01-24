/**
 * New Messages Banner
 *
 * 显示未读消息提示，允许快速跳转到最新消息
 *
 * 特性:
 * - 显示未读数量
 * - 点击跳转到底部
 * - 自动隐藏当 atBottom
 *
 * @example
 * ```tsx
 * <NewMessagesBanner
 *   unreadCount={5}
 *   isAtBottom={false}
 *   onJumpToBottom={() => scrollToBottom()}
 * />
 * ```
 */

import { Box, Text } from "ink";
import type React from "react";
import { useCallback, useMemo } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Configuration options for NewMessagesBanner
 */
export interface NewMessagesBannerConfig {
  /** 显示阈值 (至少 N 条未读才显示) */
  showThreshold: number;
  /** 最大显示数量 (超过显示 "99+") */
  maxDisplay: number;
  /** 位置 ('top' | 'bottom') */
  position: "top" | "bottom";
  /** 背景色 */
  backgroundColor: string;
  /** 文字颜色 */
  textColor: string;
}

/**
 * Default banner configuration
 */
export const DEFAULT_BANNER_CONFIG: NewMessagesBannerConfig = {
  showThreshold: 1,
  maxDisplay: 99,
  position: "bottom",
  backgroundColor: "blue",
  textColor: "white",
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format unread count for display
 *
 * @param count - Number of unread messages
 * @param maxDisplay - Maximum number to display before showing "+"
 * @returns Formatted string (e.g., "5" or "99+")
 *
 * @example
 * ```ts
 * formatUnreadCount(5, 99)   // "5"
 * formatUnreadCount(150, 99) // "99+"
 * ```
 */
export function formatUnreadCount(count: number, maxDisplay: number): string {
  if (count <= 0) {
    return "0";
  }
  if (count > maxDisplay) {
    return `${maxDisplay}+`;
  }
  return String(count);
}

/**
 * Determine if banner should be visible
 *
 * @param unreadCount - Number of unread messages
 * @param isAtBottom - Whether scroll position is at bottom
 * @param threshold - Minimum unread count to show banner
 * @returns Whether banner should be displayed
 *
 * @example
 * ```ts
 * shouldShowBanner(5, false, 1) // true
 * shouldShowBanner(5, true, 1)  // false (at bottom)
 * shouldShowBanner(0, false, 1) // false (no unread)
 * ```
 */
export function shouldShowBanner(
  unreadCount: number,
  isAtBottom: boolean,
  threshold: number
): boolean {
  return unreadCount >= threshold && !isAtBottom;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Hook for managing NewMessagesBanner state
 *
 * @param unreadCount - Number of unread messages
 * @param isAtBottom - Whether scroll position is at bottom
 * @param onJumpToBottom - Callback to scroll to bottom
 * @param config - Optional banner configuration
 * @returns Banner state and handlers
 *
 * @example
 * ```tsx
 * const { isVisible, displayText, handleJump } = useNewMessagesBanner(
 *   unreadCount,
 *   isAtBottom,
 *   scrollToBottom
 * );
 * ```
 */
export function useNewMessagesBanner(
  unreadCount: number,
  isAtBottom: boolean,
  onJumpToBottom?: () => void,
  config?: Partial<NewMessagesBannerConfig>
): {
  isVisible: boolean;
  displayText: string;
  handleJump: () => void;
} {
  const mergedConfig = useMemo(() => ({ ...DEFAULT_BANNER_CONFIG, ...config }), [config]);

  const isVisible = useMemo(
    () => shouldShowBanner(unreadCount, isAtBottom, mergedConfig.showThreshold),
    [unreadCount, isAtBottom, mergedConfig.showThreshold]
  );

  const displayText = useMemo(
    () => formatUnreadCount(unreadCount, mergedConfig.maxDisplay),
    [unreadCount, mergedConfig.maxDisplay]
  );

  const handleJump = useCallback(() => {
    onJumpToBottom?.();
  }, [onJumpToBottom]);

  return {
    isVisible,
    displayText,
    handleJump,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Props for NewMessagesBanner component
 */
export interface NewMessagesBannerProps {
  /** 未读消息数量 */
  unreadCount: number;
  /** 是否在底部 */
  isAtBottom: boolean;
  /** 点击回调 (跳转到底部) */
  onJumpToBottom?: () => void;
  /** 配置覆盖 */
  config?: Partial<NewMessagesBannerConfig>;
  /** 容器宽度 (用于居中计算) */
  width?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * New Messages Banner Component
 *
 * 显示未读消息数量的横幅，支持快速跳转到最新消息
 *
 * @example
 * ```tsx
 * // Basic usage
 * <NewMessagesBanner
 *   unreadCount={5}
 *   isAtBottom={false}
 *   onJumpToBottom={() => listRef.current?.scrollToBottom()}
 * />
 *
 * // With custom config
 * <NewMessagesBanner
 *   unreadCount={10}
 *   isAtBottom={false}
 *   config={{
 *     backgroundColor: 'cyan',
 *     textColor: 'black',
 *     maxDisplay: 50,
 *   }}
 * />
 * ```
 */
export const NewMessagesBanner: React.FC<NewMessagesBannerProps> = ({
  unreadCount,
  isAtBottom,
  onJumpToBottom,
  config,
  width,
}) => {
  const mergedConfig = useMemo(() => ({ ...DEFAULT_BANNER_CONFIG, ...config }), [config]);

  const { isVisible, displayText } = useNewMessagesBanner(
    unreadCount,
    isAtBottom,
    onJumpToBottom,
    mergedConfig
  );

  // Don't render if not visible
  if (!isVisible) {
    return null;
  }

  // Build message text
  const messageText = unreadCount === 1 ? "↓ 1 new message" : `↓ ${displayText} new messages`;

  const hintText = onJumpToBottom ? " (press End to jump)" : "";

  return (
    <Box
      flexDirection="row"
      justifyContent="center"
      alignItems="center"
      width={width ?? "100%"}
      paddingX={1}
    >
      <Box paddingX={2} paddingY={0} borderStyle="round" borderColor={mergedConfig.backgroundColor}>
        <Text color={mergedConfig.textColor} backgroundColor={mergedConfig.backgroundColor} bold>
          {" "}
          {messageText}
          {hintText}{" "}
        </Text>
      </Box>
    </Box>
  );
};

NewMessagesBanner.displayName = "NewMessagesBanner";

export default NewMessagesBanner;
