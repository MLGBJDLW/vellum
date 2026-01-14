/**
 * VirtualizedList Types
 *
 * Type definitions for the virtualized list component.
 * Ported from Gemini CLI with Vellum adaptations.
 *
 * @module tui/components/common/VirtualizedList/types
 */

import type React from "react";

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
