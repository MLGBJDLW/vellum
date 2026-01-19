/**
 * Hooks index for VirtualizedList
 *
 * @module tui/components/common/VirtualizedList/hooks
 */

export { type UseBatchedScrollReturn, useBatchedScroll } from "./useBatchedScroll.js";
export {
  type UseScrollAnchorProps,
  type UseScrollAnchorReturn,
  useScrollAnchor,
} from "./useScrollAnchor.js";
export {
  MIN_VIEWPORT_HEIGHT,
  MIN_VIEWPORT_WIDTH,
  type UseVirtualizationProps,
  type UseVirtualizationReturn,
  useVirtualization,
} from "./useVirtualization.js";
