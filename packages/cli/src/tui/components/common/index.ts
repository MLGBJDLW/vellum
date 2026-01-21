/**
 * Common TUI Components
 *
 * Shared utility components for the Vellum CLI terminal UI.
 *
 * @module tui/components/common
 */

// AutoApprovalStatus (Phase 35+ - Auto-Approval Limits)
export {
  type AutoApprovalSeverity,
  AutoApprovalStatus,
  type AutoApprovalStatusProps,
} from "./AutoApprovalStatus.js";
// CostWarning (Phase 35+ - Cost Limits)
export {
  CompactCostDisplay,
  type CompactCostDisplayProps,
  CostWarning,
  type CostWarningProps,
  type CostWarningSeverity,
} from "./CostWarning.js";
// DynamicShortcutHints (UX improvement - context-aware shortcuts)
export {
  DynamicShortcutHints,
  type DynamicShortcutHintsProps,
  type UIState,
} from "./DynamicShortcutHints.js";
// EnhancedLoadingIndicator (Enhanced loading with elapsed time & cancel hints)
export {
  EnhancedLoadingIndicator,
  type EnhancedLoadingIndicatorProps,
  formatDuration,
  useDelayedVisibility,
  useElapsedTime,
} from "./EnhancedLoadingIndicator.js";
// ErrorBoundary (Chain 20)
export { ErrorBoundary, type ErrorBoundaryProps } from "./ErrorBoundary.js";
// GradientText (Terminal gradient text component)
export {
  GRADIENT_PRESETS,
  type GradientDirection,
  type GradientPreset,
  GradientText,
  type GradientTextProps,
} from "./GradientText.js";
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
// NewMessagesBadge (Phase 3 - World-Class TUI)
export { NewMessagesBadge, type NewMessagesBadgeProps } from "./NewMessagesBadge.js";
// ProtectedFileLegend (Protected file indicator in listings)
export {
  formatProtectedFileName,
  PROTECTED_INDICATOR,
  ProtectedFileLegend,
  type ProtectedFileLegendProps,
} from "./ProtectedFileLegend.js";
// ScrollIndicator (Phase 3 - World-Class TUI)
export { ScrollIndicator, type ScrollIndicatorProps } from "./ScrollIndicator.js";
// Spinner (Chain 21)
export {
  LoadingIndicator,
  type LoadingIndicatorProps,
  SPINNER_FRAMES,
  SPINNER_STYLES,
  Spinner,
  type SpinnerProps,
  type SpinnerType,
} from "./Spinner.js";
// StreamingIndicator (Context-aware streaming phase indicator)
export {
  PHASE_ICONS,
  PHASE_LABELS,
  PHASE_SPINNER_STYLES,
  StreamingIndicator,
  type StreamingIndicatorProps,
  type StreamingPhase,
  useStreamingPhase,
} from "./StreamingIndicator.js";
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
