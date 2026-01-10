/**
 * Mention Expansion Types
 *
 * Internal types for the mention expansion system.
 *
 * @module core/mentions/types
 */

import type { Mention, MentionType } from "@vellum/shared";

// =============================================================================
// Expansion Types
// =============================================================================

/**
 * Result of expanding a single mention.
 */
export interface MentionExpansion {
  /** The original mention that was expanded */
  readonly mention: Mention;
  /** The expanded content (file contents, diff, etc.) */
  readonly content: string;
  /** Whether expansion was successful */
  readonly success: boolean;
  /** Error message if expansion failed */
  readonly error?: string;
  /** Metadata about the expansion (optional) */
  readonly metadata?: MentionExpansionMetadata;
}

/**
 * Optional metadata about an expansion.
 */
export interface MentionExpansionMetadata {
  /** File size in bytes (for file mentions) */
  readonly fileSize?: number;
  /** Line count (for file/diff mentions) */
  readonly lineCount?: number;
  /** File count (for folder mentions) */
  readonly fileCount?: number;
  /** URL title (for URL mentions) */
  readonly title?: string;
  /** Content type (for URL mentions) */
  readonly contentType?: string;
  /** Whether content was truncated */
  readonly truncated?: boolean;
  /** Original size before truncation */
  readonly originalSize?: number;
}

/**
 * Result of expanding all mentions in a text.
 */
export interface MentionExpansionResult {
  /** The text with mention placeholders intact */
  readonly originalText: string;
  /** The expanded text with mentions replaced by content */
  readonly expandedText: string;
  /** Individual expansion results */
  readonly expansions: readonly MentionExpansion[];
  /** Count of successful expansions */
  readonly successCount: number;
  /** Count of failed expansions */
  readonly failureCount: number;
}

// =============================================================================
// Expander Types
// =============================================================================

/**
 * Options for mention expansion.
 */
export interface MentionExpansionOptions {
  /** Maximum file size to read (bytes, default: 1MB) */
  readonly maxFileSize?: number;
  /** Maximum content length per mention (chars, default: 50000) */
  readonly maxContentLength?: number;
  /** Whether to include file metadata */
  readonly includeMetadata?: boolean;
  /** Timeout for URL fetches (ms, default: 10000) */
  readonly urlTimeout?: number;
  /** Whether to follow redirects for URLs */
  readonly followRedirects?: boolean;
  /** Maximum folder depth for recursive listing */
  readonly maxFolderDepth?: number;
  /** Maximum files to list in a folder */
  readonly maxFolderFiles?: number;
}

/**
 * Default expansion options.
 */
export const DEFAULT_EXPANSION_OPTIONS: Required<MentionExpansionOptions> = {
  maxFileSize: 1024 * 1024, // 1MB
  maxContentLength: 50000, // 50K chars
  includeMetadata: true,
  urlTimeout: 10000, // 10 seconds
  followRedirects: true,
  maxFolderDepth: 3,
  maxFolderFiles: 100,
} as const;

/**
 * Context for mention expansion (working directory, etc).
 */
export interface MentionExpansionContext {
  /** Current working directory for resolving relative paths */
  readonly cwd: string;
  /** Git repository root (if in a git repo) */
  readonly gitRoot?: string;
  /** Terminal output getter (for @terminal mentions) */
  readonly getTerminalOutput?: () => Promise<string>;
  /** LSP diagnostics getter (for @problems mentions) */
  readonly getProblems?: () => Promise<string>;
  /** Codebase search function (for @codebase mentions) */
  readonly searchCodebase?: (query: string) => Promise<string>;
}

// =============================================================================
// Handler Types
// =============================================================================

/**
 * Handler function for expanding a specific mention type.
 */
export type MentionHandler = (
  mention: Mention,
  context: MentionExpansionContext,
  options: Required<MentionExpansionOptions>
) => Promise<MentionExpansion>;

/**
 * Registry of mention handlers by type.
 */
export type MentionHandlerRegistry = Record<MentionType, MentionHandler>;

// =============================================================================
// Error Types
// =============================================================================

/**
 * Error codes specific to mention expansion.
 */
export enum MentionErrorCode {
  /** File not found */
  FILE_NOT_FOUND = "MENTION_FILE_NOT_FOUND",
  /** Folder not found */
  FOLDER_NOT_FOUND = "MENTION_FOLDER_NOT_FOUND",
  /** File too large */
  FILE_TOO_LARGE = "MENTION_FILE_TOO_LARGE",
  /** Invalid URL */
  INVALID_URL = "MENTION_INVALID_URL",
  /** URL fetch failed */
  URL_FETCH_FAILED = "MENTION_URL_FETCH_FAILED",
  /** URL timeout */
  URL_TIMEOUT = "MENTION_URL_TIMEOUT",
  /** Git not initialized */
  GIT_NOT_INITIALIZED = "MENTION_GIT_NOT_INITIALIZED",
  /** Git operation failed */
  GIT_OPERATION_FAILED = "MENTION_GIT_OPERATION_FAILED",
  /** Feature not implemented */
  NOT_IMPLEMENTED = "MENTION_NOT_IMPLEMENTED",
  /** Permission denied */
  PERMISSION_DENIED = "MENTION_PERMISSION_DENIED",
  /** Unknown error */
  UNKNOWN_ERROR = "MENTION_UNKNOWN_ERROR",
}
