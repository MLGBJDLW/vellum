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
  estimateMessageHeight,
  estimateWrappedLineCount,
  type HeightEstimatorOptions,
} from "./heightEstimator.js";
export { isSyncUpdateSupported, syncUpdate } from "./synchronized-update.js";
