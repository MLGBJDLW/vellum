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

// ShimmerText
export {
  InlineShimmer,
  ShimmerBlock,
  type ShimmerBlockProps,
  ShimmerDots,
  type ShimmerStyle,
  ShimmerText,
  type ShimmerTextProps,
} from "./ShimmerText.js";

// Spinner (Chain 21)
export {
  LoadingIndicator,
  type LoadingIndicatorProps,
  SPINNER_FRAMES,
  SPINNER_STYLES,
  Spinner,
  type SpinnerProps,
} from "./Spinner.js";
// SplashScreen (startup screen)
export { SplashScreen } from "./SplashScreen.js";
// TypeWriter (Chain 14)
export { TypeWriter, type TypeWriterProps } from "./TypeWriter.js";
