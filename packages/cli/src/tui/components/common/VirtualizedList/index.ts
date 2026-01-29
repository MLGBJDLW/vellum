/**
 * VirtualizedList Component
 *
 * A high-performance virtualized list for terminal UIs that only
 * renders visible items. Ported from Gemini CLI.
 *
 * @module tui/components/common/VirtualizedList
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
  SMOOTH_SCROLL_DEFAULTS,
  type SmoothScrollConfig,
  scrollPastEndReducer,
  type UseBatchedScrollReturn,
  type UseScrollAnchorProps,
  type UseScrollAnchorReturn,
  type UseScrollPastEndResult,
  type UseSmoothScrollOptions,
  type UseSmoothScrollResult,
  type UseVirtualizationProps,
  type UseVirtualizationReturn,
  useBatchedScroll,
  useScrollAnchor,
  useScrollPastEnd,
  useSmoothScroll,
  useVirtualization,
} from "./hooks/index.js";
// Incremental Markdown Parsing
export {
  DEFAULT_INCREMENTAL_MARKDOWN_CONFIG,
  generateBlockId,
  type IncrementalMarkdownConfig,
  identifyBlockType,
  type MarkdownBlock,
  type MarkdownBlockType,
  type ParsedContent,
  type ParseResult,
  parseBlock,
  parseMarkdownIncrementally,
  shouldRerenderBlock,
  splitIntoBlocks,
  type UseIncrementalMarkdownReturn,
  useIncrementalMarkdown,
} from "./incrementalMarkdown.js";

export {
  createMessageRenderer,
  DEFAULT_MESSAGE_SEPARATION_CONFIG,
  type MessageMeta,
  type MessageRendererFactory,
  type MessageSeparationConfig,
  type MessageStatus,
  type SeparableMessage,
  type SeparatedMessages,
  StableMessageItem,
  type StableMessageItemProps,
  StreamingMessageItem,
  type StreamingMessageItemProps,
  type UseMessageSeparationReturn,
  useMessageSeparation,
} from "./MessageSeparation.js";
// Measurement Scheduler (batched height measurements)
export {
  calculateAdaptiveInterval,
  createInitialSchedulerState,
  DEFAULT_SCHEDULER_CONFIG,
  getNextBatch,
  type MeasurementPriority,
  type MeasurementSchedulerConfig,
  type MeasurementTask,
  type SchedulerAction,
  type SchedulerState,
  type SchedulerStats,
  schedulerReducer,
  sortByPriority,
  type UseMeasurementSchedulerReturn,
  useMeasurementScheduler,
} from "./measurementScheduler.js";
export {
  DEFAULT_BANNER_CONFIG,
  formatUnreadCount,
  NewMessagesBanner,
  type NewMessagesBannerConfig,
  type NewMessagesBannerProps,
  shouldShowBanner,
  useNewMessagesBanner,
} from "./NewMessagesBanner.js";
export {
  createScrollFocusHandler,
  DEFAULT_SCROLL_FOCUS_CONFIG,
  ScrollFocusRegion,
  type ScrollFocusRegionConfig,
  type ScrollFocusRegionProps,
  type ScrollFocusState,
  type UseScrollFocusReturn,
  useScrollFocus,
} from "./ScrollFocusRegion.js";

// Scroll Anchor API (W2: Textual-style anchor() method)
export {
  type AnchorHandle,
  type AnchorManager,
  type AnchorOptions,
  createAnchorManager,
  type UseAnchoredScrollOptions,
  type UseAnchoredScrollReturn,
  type UseAnchorWithEffectOptions,
  useAnchoredScroll,
  useAnchorManager,
  useAnchorWithEffect,
} from "./scrollAnchorAPI.js";
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
