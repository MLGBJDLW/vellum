/**
 * Search Module Type Definitions
 *
 * Core types for the high-performance search architecture.
 * Supports multiple backends (ripgrep, git-grep, JavaScript fallback).
 *
 * @module builtin/search/types
 */

/**
 * Search mode determining how the query is interpreted.
 */
export type SearchMode = "literal" | "regex";

/**
 * Source of a binary dependency.
 */
export type BinarySource = "system" | "cached" | "downloaded";

/**
 * Backend identifier for search implementation.
 */
export type BackendType = "ripgrep" | "git-grep" | "javascript";

/**
 * Options for configuring a search operation.
 */
export interface SearchOptions {
  /** The search query (literal string or regex pattern) */
  query: string;

  /** How to interpret the query */
  mode: SearchMode;

  /** Specific paths to search within (relative or absolute) */
  paths?: string[];

  /** Glob patterns to include (e.g., ['*.ts', '*.js']) */
  globs?: string[];

  /** Glob patterns to exclude (e.g., ['node_modules/**']) */
  excludes?: string[];

  /** Number of context lines to include before/after matches */
  contextLines?: number;

  /** Maximum number of results to return */
  maxResults?: number;

  /** Whether the search is case-sensitive (default: false) */
  caseSensitive?: boolean;
}

/**
 * Context lines surrounding a match.
 */
export interface MatchContext {
  /** Lines before the match */
  before: string[];

  /** Lines after the match */
  after: string[];
}

/**
 * A single search match within a file.
 */
export interface SearchMatch {
  /** File path (relative to search root) */
  file: string;

  /** Line number (1-indexed) */
  line: number;

  /** Column number (1-indexed) */
  column: number;

  /** The matched line content */
  content: string;

  /** Context lines around the match (if requested) */
  context?: MatchContext;
}

/**
 * Statistics about a search operation.
 */
export interface SearchStats {
  /** Number of files that were searched */
  filesSearched: number;

  /** Total number of matches found */
  matchCount: number;

  /** Search duration in milliseconds */
  duration: number;

  /** Which backend performed the search */
  backend: BackendType;
}

/**
 * Container for search results.
 */
export interface SearchResult {
  /** Array of matches found */
  matches: SearchMatch[];

  /** Whether results were truncated due to maxResults limit */
  truncated: boolean;

  /** Statistics about the search operation */
  stats: SearchStats;
}

/**
 * Interface that all search backends must implement.
 */
export interface SearchBackend {
  /** Human-readable name of the backend */
  readonly name: string;

  /**
   * Check if this backend is available for use.
   * @returns Promise resolving to true if backend can be used
   */
  isAvailable(): Promise<boolean>;

  /**
   * Execute a search with the given options.
   * @param options - Search configuration
   * @returns Promise resolving to search results
   */
  search(options: SearchOptions): Promise<SearchResult>;
}

/**
 * Information about a binary dependency (e.g., ripgrep).
 */
export interface BinaryInfo {
  /** Absolute path to the binary */
  path: string;

  /** Version string (e.g., "14.1.0") */
  version: string;

  /** How the binary was obtained */
  source: BinarySource;
}
