/**
 * VirtualizedList Component
 *
 * A high-performance virtualized list for terminal UIs that only
 * renders visible items. Ported from Gemini CLI.
 *
 * @module tui/components/common/VirtualizedList
 */

export {
  type UseBatchedScrollReturn,
  type UseScrollAnchorProps,
  type UseScrollAnchorReturn,
  type UseVirtualizationProps,
  type UseVirtualizationReturn,
  useBatchedScroll,
  useScrollAnchor,
  useVirtualization,
} from "./hooks/index.js";

export {
  type HeightCache,
  SCROLL_TO_ITEM_END,
  type ScrollAnchor,
} from "./types.js";
export {
  VirtualizedList,
  type VirtualizedListProps,
  type VirtualizedListRef,
} from "./VirtualizedList.js";
