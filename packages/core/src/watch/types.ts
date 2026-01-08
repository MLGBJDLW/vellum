// ============================================
// File Watcher Types
// ============================================
// Core type definitions for the general file watching system.
// Provides flexible watching with debouncing, filtering, and event coalescing.
// @see REQ-036: General file watching system

// ============================================
// Event Types
// ============================================

/**
 * Type of file system event.
 */
export type WatchEventType = "add" | "change" | "unlink" | "addDir" | "unlinkDir";

/**
 * A file system watch event.
 */
export interface WatchEvent {
  /** Type of change detected */
  type: WatchEventType;
  /** Absolute path to the changed file or directory */
  path: string;
  /** Relative path from the watched root */
  relativePath: string;
  /** Timestamp when the event was detected */
  timestamp: number;
  /** Whether this is a directory event */
  isDirectory: boolean;
}

// ============================================
// Configuration Types
// ============================================

/**
 * Options for creating a FileWatcher.
 */
export interface WatchOptions {
  /** Root path to watch */
  path: string;
  /** Whether to watch subdirectories recursively (default: true) */
  recursive?: boolean;
  /** Debounce delay in milliseconds (default: 300) */
  debounceMs?: number;
  /** Glob patterns to include (default: all files) */
  include?: string[];
  /** Glob patterns to ignore (default: common ignores) */
  ignore?: string[];
  /** Whether to emit events on initial scan (default: false) */
  ignoreInitial?: boolean;
  /** Wait for file write to stabilize (default: true) */
  awaitWriteFinish?: boolean;
  /** Stability threshold in ms for awaitWriteFinish (default: 100) */
  stabilityThreshold?: number;
  /** Unique identifier for this watcher */
  id?: string;
  /** Human-readable name for this watcher */
  name?: string;
}

/**
 * Default ignore patterns for common non-essential directories.
 */
export const DEFAULT_WATCH_IGNORE_PATTERNS: readonly string[] = [
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/build/**",
  "**/.cache/**",
  "**/.turbo/**",
  "**/coverage/**",
  "**/*.log",
  "**/.DS_Store",
  "**/Thumbs.db",
];

/**
 * Configuration for a watcher preset.
 */
export interface WatcherPreset {
  /** Unique identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of what this preset watches */
  description: string;
  /** Glob patterns to include */
  include: string[];
  /** Additional ignore patterns (merged with defaults) */
  ignore?: string[];
  /** Recommended debounce delay */
  debounceMs?: number;
  /** Whether to watch recursively */
  recursive?: boolean;
}

// ============================================
// Events Interface
// ============================================

/**
 * Events emitted by FileWatcher.
 */
export interface FileWatcherEvents {
  /** Emitted when file changes are detected (after debounce) */
  change: [events: WatchEvent[]];
  /** Emitted when a single file is added */
  add: [event: WatchEvent];
  /** Emitted when a single file changes */
  update: [event: WatchEvent];
  /** Emitted when a single file is deleted */
  remove: [event: WatchEvent];
  /** Emitted when watching is ready */
  ready: [];
  /** Emitted on watcher errors */
  error: [error: Error];
}

/**
 * Events emitted by WatcherRegistry.
 */
export interface WatcherRegistryEvents {
  /** Emitted when any watcher detects changes */
  change: [watcherId: string, events: WatchEvent[]];
  /** Emitted when a watcher is registered */
  register: [watcherId: string];
  /** Emitted when a watcher is unregistered */
  unregister: [watcherId: string];
  /** Emitted on watcher errors */
  error: [watcherId: string, error: Error];
}

// ============================================
// State Types
// ============================================

/**
 * Watcher state information.
 */
export interface WatcherState {
  /** Whether the watcher is currently running */
  running: boolean;
  /** Number of pending events in the debounce queue */
  pendingEvents: number;
  /** Timestamp when the watcher was started */
  startedAt?: number;
  /** Number of change events emitted */
  eventCount: number;
  /** Last error if any */
  lastError?: Error;
}
