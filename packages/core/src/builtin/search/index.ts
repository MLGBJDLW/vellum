/**
 * Search Module
 *
 * High-performance search architecture with pluggable backends.
 * Supports ripgrep (preferred), git-grep, and JavaScript fallback.
 *
 * @module builtin/search
 */

export {
  createGitGrepBackend,
  GitGrepBackend,
  type GitGrepBackendOptions,
  GitGrepError,
} from "./backends/git-grep.js";
export {
  createJavaScriptBackend,
  JavaScriptBackend,
} from "./backends/javascript.js";
// Backends
export {
  createRipgrepBackend,
  RipgrepBackend,
  type RipgrepBackendOptions,
  RipgrepError,
} from "./backends/ripgrep.js";
// Binary manager
export {
  BinaryManager,
  type BinaryManagerOptions,
  detectCachedRipgrep,
  detectSystemRipgrep,
  downloadRipgrep,
  getDefaultBinaryManager,
  resetDefaultBinaryManager,
} from "./binary-manager.js";
// Search Facade
export {
  getSearchFacade,
  resetSearchFacade,
  SearchFacade,
} from "./facade.js";
// Platform utilities
export {
  type Architecture,
  getBinaryCacheDir,
  getCacheDir,
  getCachedBinaryPath,
  getPlatform,
  getRipgrepArchiveDir,
  getRipgrepArchiveFilename,
  getRipgrepBinaryName,
  getRipgrepDownloadUrl,
  getRipgrepTarget,
  type OperatingSystem,
  type PlatformInfo,
  RIPGREP_VERSION,
  type RipgrepTarget,
} from "./platform.js";

// Strategy Selector
export {
  getDefaultStrategySelector,
  resetDefaultStrategySelector,
  StrategySelector,
} from "./strategy-selector.js";
// Type exports
export type {
  BackendType,
  BinaryInfo,
  BinarySource,
  MatchContext,
  SearchBackend,
  SearchMatch,
  SearchMode,
  SearchOptions,
  SearchResult,
  SearchStats,
} from "./types.js";
