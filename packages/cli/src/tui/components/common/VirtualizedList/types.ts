/**
 * VirtualizedList Types
 *
 * Type definitions for the virtualized list component.
 * Ported from Gemini CLI with Vellum adaptations.
 *
 * @module tui/components/common/VirtualizedList/types
 */

import type React from "react";
import type { FollowMode } from "./hooks/useStickyBottom.js";
import type { AnchorManager } from "./scrollAnchorAPI.js";

/**
 * Sentinel value indicating scroll to the end of an item or the list.
 */
export const SCROLL_TO_ITEM_END = Number.MAX_SAFE_INTEGER;

/**
 * Props for the VirtualizedList component.
 * Generic type T represents the data item type.
 */
export interface VirtualizedListProps<T> {
  /** Array of data items to render */
  readonly data: readonly T[];

  /** Render function for each item */
  readonly renderItem: (info: { item: T; index: number }) => React.ReactElement;

  /** Function to estimate item height before measurement */
  readonly estimatedItemHeight: number | ((index: number) => number);

  /** Function to extract a unique key for each item */
  readonly keyExtractor: (item: T, index: number) => string;

  /** Initial scroll index (use SCROLL_TO_ITEM_END for bottom) */
  readonly initialScrollIndex?: number;

  /** Initial offset within the scroll index */
  readonly initialScrollOffsetInIndex?: number;

  /** Color for the scrollbar thumb */
  readonly scrollbarThumbColor?: string;

  /** Callback when scroll position changes */
  readonly onScrollTopChange?: (scrollTop: number) => void;

  /** Callback when sticking to bottom state changes */
  readonly onStickingToBottomChange?: (isSticking: boolean) => void;

  /**
   * Callback when follow mode changes (auto | off | locked).
   * Use this for advanced scroll behavior handling.
   */
  readonly onFollowModeChange?: (mode: FollowMode) => void;

  /** Whether to align items to the bottom when content is shorter than the viewport */
  readonly alignToBottom?: boolean;

  /**
   * Whether there is active streaming content.
   * When true, height measurement interval is reduced for more responsive scroll updates.
   * @default false
   */
  readonly isStreaming?: boolean;

  /**
   * Enable smooth scroll animations.
   * When true, scroll operations use eased animation instead of instant jumps.
   * @default true
   */
  readonly enableSmoothScroll?: boolean;

  /**
   * Enable scroll past end (overscroll) with rubberband effect.
   * When true, allows scrolling past the bottom with a bounce-back animation.
   * @default false
   */
  readonly enableScrollPastEnd?: boolean;
}

/**
 * Scroll anchor state - tracks position by index + offset
 * for stability during content changes.
 */
export interface ScrollAnchor {
  /** Index of the anchor item */
  readonly index: number;
  /** Pixel offset within the anchor item (or SCROLL_TO_ITEM_END) */
  readonly offset: number;
}

/**
 * Ref handle for controlling the VirtualizedList programmatically.
 */
export interface VirtualizedListRef<T> {
  /** Scroll by a delta amount (positive = down, negative = up) */
  scrollBy: (delta: number) => void;

  /** Scroll to an absolute pixel offset */
  scrollTo: (offset: number) => void;

  /** Scroll to the end of the list */
  scrollToEnd: () => void;

  /** Scroll to a specific index with optional offset and position */
  scrollToIndex: (params: { index: number; viewOffset?: number; viewPosition?: number }) => void;

  /** Scroll to a specific item */
  scrollToItem: (params: { item: T; viewOffset?: number; viewPosition?: number }) => void;

  /** Get the current scroll anchor index */
  getScrollIndex: () => number;

  /** Get the current scroll state */
  getScrollState: () => {
    scrollTop: number;
    scrollHeight: number;
    innerHeight: number;
  };

  /** Check if currently sticking to bottom */
  isAtBottom: () => boolean;

  /**
   * Force immediate re-measurement of visible item heights.
   * Call this when you know heights have changed (e.g., ThinkingBlock expand/collapse).
   */
  forceRemeasure: () => void;

  // =========================================================================
  // New APIs (v2.0) - Sticky Bottom FSM
  // =========================================================================

  /**
   * Get current follow mode state.
   * - 'auto': Automatically follows new content
   * - 'off': User scrolled away, no auto-follow
   * - 'locked': User explicitly requested bottom (End key)
   */
  getFollowMode: () => FollowMode;

  /** Get new message count accumulated while follow is off */
  getNewMessageCount: () => number;

  /** Clear new message count (e.g., when banner is dismissed) */
  clearNewMessageCount: () => void;

  /** Handle wheel scroll event (updates follow mode FSM) */
  handleWheel: (delta: number) => void;

  /** Handle keyboard scroll event (updates follow mode FSM) */
  handleKeyboardScroll: (delta: number) => void;

  // =========================================================================
  // New APIs (v2.0) - Anchor Manager
  // =========================================================================

  /** Get anchor manager for external anchor control */
  getAnchorManager: () => AnchorManager;

  // =========================================================================
  // New APIs (v2.0) - Scroll Past End
  // =========================================================================

  /** Current overscroll amount in pixels */
  getOverscrollAmount: () => number;

  /** Start bounce-back animation (call when scroll release detected) */
  startBounce: () => void;

  // =========================================================================
  // New APIs (v2.0) - Smooth Scroll
  // =========================================================================

  /** Check if smooth scroll animation is in progress */
  isAnimating: () => boolean;

  /** Stop smooth scroll animation at current position */
  stopAnimation: () => void;
}

/**
 * Internal state for height calculations.
 */
export interface HeightCache {
  /** Cached heights indexed by item index */
  readonly heights: readonly number[];
  /** Cumulative offsets (offsets[i] = sum of heights[0..i-1]) */
  readonly offsets: readonly number[];
  /** Total height of all items */
  readonly totalHeight: number;
}
