/**
 * Hooks index for VirtualizedList
 *
 * @module tui/components/common/VirtualizedList/hooks
 */

export {
  calculateBouncePosition,
  calculateMaxOverscroll,
  clampOverscroll,
  createInitialScrollPastEndState,
  DEFAULT_SCROLL_PAST_END_CONFIG,
  easeOutCubic,
  type ScrollPastEndAction,
  type ScrollPastEndConfig,
  type ScrollPastEndState,
  scrollPastEndReducer,
  type UseScrollPastEndResult,
  useScrollPastEnd,
} from "./scrollPastEnd.js";
export { type UseBatchedScrollReturn, useBatchedScroll } from "./useBatchedScroll.js";
export {
  type UseScrollAnchorProps,
  type UseScrollAnchorReturn,
  useScrollAnchor,
} from "./useScrollAnchor.js";
export {
  DEFAULT_CONFIG as SMOOTH_SCROLL_DEFAULTS,
  type SmoothScrollConfig,
  type UseSmoothScrollOptions,
  type UseSmoothScrollResult,
  useSmoothScroll,
} from "./useSmoothScroll.js";
export {
  type FollowMode,
  type ScrollSource,
  type UseStickyBottomOptions,
  type UseStickyBottomResult,
  useStickyBottom,
} from "./useStickyBottom.js";
export {
  MIN_VIEWPORT_HEIGHT,
  MIN_VIEWPORT_WIDTH,
  type UseVirtualizationProps,
  type UseVirtualizationReturn,
  useVirtualization,
} from "./useVirtualization.js";
