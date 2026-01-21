/**
 * TUI Services
 *
 * Shared services for the Vellum CLI terminal UI.
 *
 * @module tui/services
 */

export {
  type ClipboardHistoryEntry,
  type ClipboardResult,
  clearHistory as clearClipboardHistory,
  clipboardService,
  copy,
  copySync,
  copyWithMessage,
  getHistory as getClipboardHistory,
  getHistorySize as getClipboardHistorySize,
  getLastEntry as getLastClipboardEntry,
  isSupported as isClipboardSupported,
  paste,
  pasteSync,
  resetSupportCache as resetClipboardSupportCache,
} from "./clipboard.js";
export {
  createPreparedSearch,
  type FuzzyHighlightSegment,
  type FuzzyMatchResult,
  type FuzzyResult,
  type FuzzySearchOptions,
  fuzzyMatch,
  fuzzySearch,
  fuzzySearchMulti,
  fuzzyTest,
  getHighlightSegments,
  type HighlightRange,
  type MultiFieldSearchOptions,
} from "./fuzzy-search.js";
export {
  containsMarkdown,
  type MarkdownColors,
  type MarkdownRenderOptions,
  renderMarkdown,
  renderMarkdownPlain,
  renderMarkdownSync,
  stripMarkdown,
} from "./markdown-renderer.js";

export {
  isValidUrl,
  type OpenInEditorOptions,
  type OpenResult,
  openDirectory,
  openExternalService,
  openFile,
  openInEditor,
  openUrl,
} from "./open-external.js";
export {
  detectLanguage,
  getSupportedLanguages,
  type HighlightOptions,
  highlightCode,
  highlightCodeSync,
  initializeHighlighter,
  isHighlighterReady,
  isLanguageSupported,
  preloadHighlighter,
  resolveLanguage,
  type SupportedLanguage,
  type SyntaxHighlightResult,
} from "./syntax-highlighter.js";
