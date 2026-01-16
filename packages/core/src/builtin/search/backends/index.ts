/**
 * Search Backends
 *
 * Pluggable search backend implementations.
 *
 * @module builtin/search/backends
 */

export {
  createGitGrepBackend,
  GitGrepBackend,
  type GitGrepBackendOptions,
  GitGrepError,
} from "./git-grep.js";
export {
  createJavaScriptBackend,
  JavaScriptBackend,
} from "./javascript.js";
export {
  createRipgrepBackend,
  RipgrepBackend,
  type RipgrepBackendOptions,
  RipgrepError,
} from "./ripgrep.js";
