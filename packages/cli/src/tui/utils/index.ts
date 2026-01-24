/**
 * TUI Utilities
 *
 * Utility functions for the Vellum CLI terminal UI.
 *
 * @module tui/utils
 */

export {
  disableBracketedPaste,
  enableBracketedPaste,
  extractPasteContent,
  hasPasteEnd,
  hasPasteStart,
  PASTE_END,
  PASTE_START,
} from "./bracketedPaste.js";
// Circular Buffer (efficient fixed-size buffer)
export {
  type CircularBuffer,
  type CircularBufferActions,
  type CircularBufferConfig,
  createCircularBuffer,
  createMessageBuffer,
  MESSAGE_BUFFER_DEFAULTS,
  useCircularBuffer,
} from "./circularBuffer.js";
export { CursorManager, type CursorManagerImpl } from "./cursor-manager.js";
export {
  clearTerminalCapabilitiesCache,
  createHyperlink,
  type DetectTerminalOptions,
  degradeColor,
  detectTerminal,
  getSymbol,
  getTerminalCapabilities,
  getTerminalName,
  type TerminalCapabilities,
  type TerminalType,
} from "./detectTerminal.js";
export { findLastSafeSplitPoint } from "./findLastSafeSplitPoint.js";
// Height estimation utilities (T002)
export {
  // Constants for upper-bound estimation
  DEFAULT_ESTIMATED_ITEM_HEIGHT,
  // Functions
  estimateMessageHeight,
  estimateWrappedLineCount,
  HEIGHT_SAFETY_MARGIN,
  type HeightEstimatorOptions,
  MIN_MESSAGE_HEIGHT,
  THINKING_HEADER_UPPER_BOUND,
  TOOL_CALL_UPPER_BOUND,
} from "./heightEstimator.js";
// Narrow width detection
export { getNarrowBreakpoint, isNarrowWidth } from "./isNarrowWidth.js";
// Kitty keyboard protocol (enhanced key reporting)
export {
  detectAndEnableKittyProtocol,
  detectKittyKeyboardProtocol,
  disableKittyKeyboardProtocol,
  type EnhancedKeyEvent,
  enableKittyKeyboardProtocol,
  isKittyKeyboardEnabled,
  isKittyKeyboardSupported,
  isKittySequence,
  KittyFlags,
  KittyModifiers,
  parseEnhancedKey,
  reEnableKittyProtocol,
} from "./kitty-keyboard-protocol.js";
// Stdout guard for debugging (T002 Hardening)
export {
  disableStdoutGuard,
  enableStdoutGuard,
  isStdoutGuardActive,
} from "./stdoutGuard.js";
export { isSyncUpdateSupported, syncUpdate } from "./synchronized-update.js";
// Terminal scroll utilities
export {
  createScrollNormalizer,
  createScrollNormalizerWithReset,
  createSensitiveScrollNormalizer,
  detectTerminal as detectScrollTerminal,
  getScrollConfig,
  getScrollSensitivity,
  type ScrollNormalizerWithReset,
  TERMINAL_SCROLL_CONFIGS,
  type TerminalScrollConfig,
  useScrollNormalizer,
  useSensitiveScrollNormalizer,
} from "./terminal-scroll.js";
// Text width utilities (CJK/emoji aware)
export {
  countLines,
  getVisualWidth,
  padToWidth,
  splitLines,
  type TextAlign,
  truncateToWidth,
  wrapToWidth,
} from "./text-width.js";
// Text sanitization utilities (Phase 1 - World-Class TUI)
export {
  type SanitizeOptions,
  sanitize,
  sanitizeAnsi,
  sanitizeText,
} from "./textSanitizer.js";
// Text utilities (T002 Hardening)
export { hardWrap, truncateToDisplayWidth } from "./textUtils.js";
// Terminal UI sizing utilities
export {
  clamp,
  DEFAULT_TERMINAL_HEIGHT,
  DEFAULT_TERMINAL_WIDTH,
  getContentPadding,
  getMaxContentWidth,
  getTerminalHeight,
  getTerminalSize,
  getTerminalWidth,
  lerp,
  NARROW_CONTENT_RATIO,
  NARROW_WIDTH_BREAKPOINT,
  WIDE_CONTENT_RATIO,
  WIDE_WIDTH_BREAKPOINT,
} from "./ui-sizing.js";
