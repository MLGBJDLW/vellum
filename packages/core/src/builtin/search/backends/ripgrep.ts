/**
 * Ripgrep Search Backend
 *
 * High-performance search using ripgrep binary.
 * Supports streaming JSON output parsing, context lines, and glob filtering.
 *
 * @module builtin/search/backends/ripgrep
 */

import { type ChildProcess, spawn } from "node:child_process";
import * as path from "node:path";
import { createInterface } from "node:readline";
import { type BinaryManager, getDefaultBinaryManager } from "../binary-manager.js";
import type {
  BackendType,
  SearchBackend,
  SearchMatch,
  SearchOptions,
  SearchResult,
  SearchStats,
} from "../types.js";

// =============================================================================
// Types: Ripgrep JSON Output
// =============================================================================

/**
 * Ripgrep JSON message for file begin.
 */
interface RgBegin {
  type: "begin";
  data: {
    path: { text: string };
  };
}

/**
 * Submatch location within a line.
 */
interface RgSubmatch {
  match: { text: string };
  start: number;
  end: number;
}

/**
 * Ripgrep JSON message for a match line.
 */
interface RgMatch {
  type: "match";
  data: {
    path: { text: string };
    lines: { text: string };
    line_number: number;
    absolute_offset: number;
    submatches: RgSubmatch[];
  };
}

/**
 * Ripgrep JSON message for a context line.
 */
interface RgContext {
  type: "context";
  data: {
    path: { text: string };
    lines: { text: string };
    line_number: number;
    absolute_offset: number;
    submatches: RgSubmatch[];
  };
}

/**
 * Ripgrep JSON message for file end.
 */
interface RgEnd {
  type: "end";
  data: {
    path: { text: string };
    binary_offset: number | null;
    stats: {
      elapsed: { secs: number; nanos: number };
      searches: number;
      searches_with_match: number;
      bytes_searched: number;
      bytes_printed: number;
      matched_lines: number;
      matches: number;
    };
  };
}

/**
 * Ripgrep JSON message for search summary.
 */
interface RgSummary {
  type: "summary";
  data: {
    elapsed_total: { secs: number; nanos: number };
    stats: {
      elapsed: { secs: number; nanos: number };
      searches: number;
      searches_with_match: number;
      bytes_searched: number;
      bytes_printed: number;
      matched_lines: number;
      matches: number;
    };
  };
}

/**
 * Union type for all ripgrep JSON messages.
 */
type RgMessage = RgBegin | RgMatch | RgContext | RgEnd | RgSummary;

// =============================================================================
// Constants
// =============================================================================

/**
 * Default patterns to exclude from search.
 */
const DEFAULT_EXCLUDES = [
  ".git",
  "node_modules",
  ".pnpm",
  ".pnpm-store",
  "__pycache__",
  ".venv",
  "venv",
  ".idea",
  ".vscode",
  "dist",
  "build",
  "coverage",
  ".next",
  ".nuxt",
  ".cache",
  "*.lock",
];

/**
 * Default timeout for ripgrep process (30 seconds).
 */
const DEFAULT_TIMEOUT = 30_000;

// =============================================================================
// Parser
// =============================================================================

/**
 * Parse a single line of ripgrep JSON output.
 *
 * @param line - JSON string from ripgrep --json output
 * @returns Parsed message or null if parse failed
 */
function parseRgLine(line: string): RgMessage | null {
  if (!line.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(line) as RgMessage;

    // Validate that it has a type field
    if (typeof parsed !== "object" || parsed === null || !("type" in parsed)) {
      return null;
    }

    return parsed;
  } catch {
    // Invalid JSON - skip this line
    return null;
  }
}

// =============================================================================
// Search State Tracker
// =============================================================================

/**
 * Tracks state while parsing ripgrep output.
 * Handles context line accumulation for before/after context.
 */
class SearchStateTracker {
  /** Accumulated matches */
  private matches: SearchMatch[] = [];

  /** Pending context lines (before context for next match) */
  private pendingContext: Array<{ line: number; text: string }> = [];

  /** Map of match indices to their pending after-context */
  private matchAfterContext: Map<number, { line: number; text: string }[]> = new Map();

  /** Number of context lines requested */
  private readonly contextLines: number;

  /** Maximum results (0 = unlimited) */
  private readonly maxResults: number;

  /** Whether we've hit the max results limit */
  private truncated = false;

  /** Base path for relative file resolution */
  private readonly basePath: string;

  constructor(contextLines: number, maxResults: number, basePath: string) {
    this.contextLines = contextLines;
    this.maxResults = maxResults;
    this.basePath = basePath;
  }

  /**
   * Process a begin message (new file).
   */
  handleBegin(_msg: RgBegin): void {
    // Finalize any pending after-context for previous file
    this.finalizePendingContexts();
    this.pendingContext = [];
  }

  /**
   * Process a match message.
   */
  handleMatch(msg: RgMatch): boolean {
    if (this.maxResults > 0 && this.matches.length >= this.maxResults) {
      this.truncated = true;
      return false; // Signal to stop processing
    }

    const filePath = this.resolveRelativePath(msg.data.path.text);
    const lineText = msg.data.lines.text.replace(/\r?\n$/, "");

    // Get column from first submatch (1-indexed)
    const column = msg.data.submatches[0]?.start ? msg.data.submatches[0].start + 1 : 1;

    const match: SearchMatch = {
      file: filePath,
      line: msg.data.line_number,
      column,
      content: lineText,
    };

    // Add before-context if available
    if (this.contextLines > 0 && this.pendingContext.length > 0) {
      match.context = {
        before: this.pendingContext.map((c) => c.text),
        after: [],
      };
    }

    const matchIndex = this.matches.length;
    this.matches.push(match);

    // Clear pending context (it's been consumed)
    this.pendingContext = [];

    // Initialize after-context collection for this match
    if (this.contextLines > 0) {
      this.matchAfterContext.set(matchIndex, []);
    }

    return true;
  }

  /**
   * Process a context message.
   */
  handleContext(msg: RgContext): void {
    const lineText = msg.data.lines.text.replace(/\r?\n$/, "");
    const contextEntry = { line: msg.data.line_number, text: lineText };

    // Distribute to matches that need after-context
    let usedAsAfterContext = false;
    for (const [matchIndex, afterContext] of this.matchAfterContext) {
      const match = this.matches[matchIndex];
      if (!match) continue;

      // Only add if this context line is after the match
      if (msg.data.line_number > match.line) {
        if (afterContext.length < this.contextLines) {
          afterContext.push(contextEntry);
          usedAsAfterContext = true;
        }
      }
    }

    // If not used as after-context, it's before-context for next match
    if (!usedAsAfterContext) {
      this.pendingContext.push(contextEntry);
      // Keep only the last N context lines
      if (this.pendingContext.length > this.contextLines) {
        this.pendingContext.shift();
      }
    }
  }

  /**
   * Process an end message (file complete).
   */
  handleEnd(_msg: RgEnd): void {
    this.finalizePendingContexts();
    this.pendingContext = [];
  }

  /**
   * Finalize any pending after-context by applying to matches.
   */
  private finalizePendingContexts(): void {
    for (const [matchIndex, afterContext] of this.matchAfterContext) {
      const match = this.matches[matchIndex];
      if (!match) continue;

      if (!match.context) {
        match.context = { before: [], after: [] };
      }
      match.context.after = afterContext.map((c) => c.text);
    }
    this.matchAfterContext.clear();
  }

  /**
   * Resolve a file path to be relative to base path.
   */
  private resolveRelativePath(filePath: string): string {
    // Ripgrep returns paths relative to search root, but may include ./
    const normalized = filePath.replace(/^\.\//, "");

    // If it's already relative, return as-is
    if (!path.isAbsolute(normalized)) {
      return normalized;
    }

    // Make relative to base path
    return path.relative(this.basePath, normalized);
  }

  /**
   * Check if max results was reached.
   */
  isTruncated(): boolean {
    return this.truncated;
  }

  /**
   * Get all accumulated matches.
   */
  getMatches(): SearchMatch[] {
    // Finalize any remaining context
    this.finalizePendingContexts();
    return this.matches;
  }
}

// =============================================================================
// Ripgrep Backend
// =============================================================================

/**
 * Search backend using ripgrep.
 *
 * Features:
 * - High-performance parallel file search
 * - Streaming JSON output parsing
 * - Context lines support
 * - Glob pattern filtering
 * - Automatic exclusion of common non-text files
 *
 * @example
 * ```typescript
 * const backend = new RipgrepBackend();
 * if (await backend.isAvailable()) {
 *   const result = await backend.search({
 *     query: "TODO",
 *     mode: "literal",
 *     paths: ["./src"],
 *     globs: ["*.ts"],
 *     contextLines: 2,
 *     maxResults: 100,
 *   });
 *   console.log(result.matches);
 * }
 * ```
 */
export class RipgrepBackend implements SearchBackend {
  readonly name = "ripgrep";

  private readonly binaryManager: BinaryManager;
  private readonly timeout: number;

  /**
   * Create a new ripgrep backend.
   *
   * @param options - Configuration options
   */
  constructor(options: RipgrepBackendOptions = {}) {
    this.binaryManager = options.binaryManager ?? getDefaultBinaryManager();
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT;
  }

  /**
   * Check if ripgrep is available.
   *
   * @returns true if ripgrep binary can be found
   */
  async isAvailable(): Promise<boolean> {
    const binary = await this.binaryManager.getBinary();
    return binary !== null;
  }

  /**
   * Execute a search using ripgrep.
   *
   * @param options - Search options
   * @returns Search results
   */
  async search(options: SearchOptions): Promise<SearchResult> {
    const startTime = performance.now();

    // Ensure we have a binary
    const binary = await this.binaryManager.ensureBinary();

    // Determine search paths
    const searchPaths = options.paths?.length ? options.paths : ["."];
    const basePath = searchPaths[0] ?? ".";

    // Build arguments
    const args = this.buildArguments(options);

    // Add search paths
    args.push(...searchPaths);

    // Execute search
    const tracker = new SearchStateTracker(
      options.contextLines ?? 0,
      options.maxResults ?? 0,
      basePath
    );

    let filesSearched = 0;
    let _totalMatches = 0;

    try {
      await this.executeSearch(binary.path, args, tracker, (msg) => {
        if (msg.type === "end") {
          filesSearched++;
          _totalMatches += msg.data.stats.matches;
        }
      });
    } catch (error) {
      // Handle specific error cases
      if (error instanceof RipgrepError) {
        // If it's a "no matches" exit code, return empty result
        if (error.exitCode === 1) {
          return this.createEmptyResult(startTime);
        }
        throw error;
      }
      throw error;
    }

    const matches = tracker.getMatches();
    const duration = performance.now() - startTime;

    const stats: SearchStats = {
      filesSearched,
      matchCount: matches.length,
      duration,
      backend: "ripgrep" as BackendType,
    };

    return {
      matches,
      truncated: tracker.isTruncated(),
      stats,
    };
  }

  /**
   * Build ripgrep command-line arguments.
   */
  private buildArguments(options: SearchOptions): string[] {
    const args: string[] = [
      "--json", // JSON output for structured parsing
      "--line-number", // Include line numbers
      "--with-filename", // Always include filename
      "--no-heading", // Don't group by file
      "--hidden", // Search hidden files
    ];

    // Search mode: literal vs regex
    if (options.mode === "literal") {
      args.push("--fixed-strings");
    }

    // Case sensitivity
    if (!options.caseSensitive) {
      args.push("--ignore-case");
    } else {
      args.push("--case-sensitive");
    }

    // Context lines
    if (options.contextLines && options.contextLines > 0) {
      args.push("-C", String(options.contextLines));
    }

    // Include globs
    if (options.globs?.length) {
      for (const glob of options.globs) {
        args.push("--glob", glob);
      }
    }

    // Exclude patterns (user-provided + defaults)
    const excludes = [...DEFAULT_EXCLUDES, ...(options.excludes ?? [])];
    for (const exclude of excludes) {
      // Prefix with ! for exclusion
      args.push("--glob", `!${exclude}`);
    }

    // Add the search query
    args.push("--", options.query);

    return args;
  }

  /**
   * Execute ripgrep and stream parse output.
   */
  private executeSearch(
    binaryPath: string,
    args: string[],
    tracker: SearchStateTracker,
    onMessage?: (msg: RgMessage) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const child: ChildProcess = spawn(binaryPath, args, {
        stdio: ["pipe", "pipe", "pipe"],
      });

      // Set timeout
      const timeoutId = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new RipgrepError("Search timed out", -1));
      }, this.timeout);

      // Track if we should stop early
      let shouldStop = false;

      // Parse stdout line by line
      if (child.stdout) {
        const rl = createInterface({
          input: child.stdout,
          crlfDelay: Infinity,
        });

        rl.on("line", (line) => {
          if (shouldStop) return;

          const msg = parseRgLine(line);
          if (!msg) return;

          // Process message
          switch (msg.type) {
            case "begin":
              tracker.handleBegin(msg);
              break;
            case "match": {
              const shouldContinue = tracker.handleMatch(msg);
              if (!shouldContinue) {
                shouldStop = true;
                child.kill("SIGTERM");
              }
              break;
            }
            case "context":
              tracker.handleContext(msg);
              break;
            case "end":
              tracker.handleEnd(msg);
              break;
          }

          onMessage?.(msg);
        });

        rl.on("close", () => {
          // Readline closed
        });
      }

      // Collect stderr for error messages
      let stderr = "";
      if (child.stderr) {
        child.stderr.on("data", (data: Buffer) => {
          stderr += data.toString();
        });
      }

      // Handle spawn errors
      child.on("error", (err) => {
        clearTimeout(timeoutId);
        reject(new RipgrepError(`Failed to spawn ripgrep: ${err.message}`, -1));
      });

      // Handle process exit
      child.on("close", (code) => {
        clearTimeout(timeoutId);

        // Exit code 0 = matches found
        // Exit code 1 = no matches (not an error)
        // Exit code 2+ = actual error
        if (code === 0 || code === 1 || shouldStop) {
          resolve();
        } else {
          reject(
            new RipgrepError(`Ripgrep exited with code ${code}: ${stderr.trim()}`, code ?? -1)
          );
        }
      });
    });
  }

  /**
   * Create an empty result (for no matches case).
   */
  private createEmptyResult(startTime: number): SearchResult {
    return {
      matches: [],
      truncated: false,
      stats: {
        filesSearched: 0,
        matchCount: 0,
        duration: performance.now() - startTime,
        backend: "ripgrep" as BackendType,
      },
    };
  }
}

// =============================================================================
// Types
// =============================================================================

/**
 * Options for RipgrepBackend constructor.
 */
export interface RipgrepBackendOptions {
  /** Custom BinaryManager instance */
  binaryManager?: BinaryManager;
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;
}

// =============================================================================
// Errors
// =============================================================================

/**
 * Error thrown by ripgrep backend.
 */
export class RipgrepError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode: number) {
    super(message);
    this.name = "RipgrepError";
    this.exitCode = exitCode;
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a new ripgrep backend with default settings.
 *
 * @returns Configured RipgrepBackend instance
 */
export function createRipgrepBackend(options?: RipgrepBackendOptions): RipgrepBackend {
  return new RipgrepBackend(options);
}
