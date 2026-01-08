// ============================================
// Watch Module Barrel Export
// ============================================
// General file watching system for Vellum.
// @see REQ-036: General file watching system

// Presets
export {
  agentsWatcherPreset,
  configWatcherPreset,
  docsWatcherPreset,
  getWatcherPreset,
  getWatcherPresetIds,
  skillsWatcherPreset,
  sourceWatcherPreset,
  testWatcherPreset,
  WATCHER_PRESETS,
} from "./presets.js";
// Registry
export { createWatcherRegistry, WatcherRegistry } from "./registry.js";
// Types
export type {
  FileWatcherEvents,
  WatchEvent,
  WatchEventType,
  WatcherPreset,
  WatcherRegistryEvents,
  WatcherState,
  WatchOptions,
} from "./types.js";
export { DEFAULT_WATCH_IGNORE_PATTERNS } from "./types.js";
// Watcher
export { createWatcher, FileWatcher } from "./watcher.js";
