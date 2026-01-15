/**
 * Common TUI Components
 *
 * Shared utility components for the Vellum CLI terminal UI.
 *
 * @module tui/components/common
 */

// ErrorBoundary (Chain 20)
export { ErrorBoundary, type ErrorBoundaryProps } from "./ErrorBoundary.js";

// HotkeyHelpModal (Chain 24)
export {
  DEFAULT_HOTKEYS,
  type HotkeyBinding,
  HotkeyHelpModal,
  type HotkeyHelpModalProps,
} from "./HotkeyHelpModal.js";

// HotkeyHints (sidebar footer hints)
export { type HotkeyHint, HotkeyHints, type HotkeyHintsProps } from "./HotkeyHints.js";
// MaxSizedBox (Ported from Gemini CLI)
export {
  MaxSizedBox,
  type MaxSizedBoxProps,
  type MaxSizedBoxState,
  useMaxSizedBox,
} from "./MaxSizedBox.js";
// Spinner (Chain 21)
export {
  LoadingIndicator,
  type LoadingIndicatorProps,
  SPINNER_FRAMES,
  SPINNER_STYLES,
  Spinner,
  type SpinnerProps,
} from "./Spinner.js";

// VirtualizedList (Ported from Gemini CLI)
export {
  type HeightCache,
  SCROLL_TO_ITEM_END,
  type ScrollAnchor,
  type UseBatchedScrollReturn,
  type UseScrollAnchorProps,
  type UseScrollAnchorReturn,
  type UseVirtualizationProps,
  type UseVirtualizationReturn,
  useBatchedScroll,
  useScrollAnchor,
  useVirtualization,
  VirtualizedList,
  type VirtualizedListProps,
  type VirtualizedListRef,
} from "./VirtualizedList/index.js";
