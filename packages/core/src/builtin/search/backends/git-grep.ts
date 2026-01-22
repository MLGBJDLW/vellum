/**
 * Git Grep Search Backend
 *
 * Search using git grep for fast searches within Git repositories.
 * Falls back gracefully when not in a Git repository.
 *
 * @module builtin/search/backends/git-grep
 */

import { type ChildProcess, spawn } from "node:child_process";
import { access, constants } from "node:fs/promises";
import * as path from "node:path";
import { createInterface } from "node:readline";
import type {
  BackendType,
  SearchBackend,
  SearchMatch,
  SearchOptions,
  SearchResult,
  SearchStats,
} from "../types.js";

// =============================================================================
// Constants
// =============================================================================

/**
 * Default timeout for git grep process (30 seconds).
 */
const DEFAULT_TIMEOUT = 30_000;

// =============================================================================
// Git Grep Backend
// =============================================================================

/**
 * Search backend using git grep.
 *
 * Features:
 * - Fast search within Git repositories
 * - Respects .gitignore automatically
 * - Context lines support
 * - Case-insensitive search support
 *
 * Limitations:
 * - Only works inside Git repositories
 * - Limited glob pattern support compared to ripgrep
 *
 * @example
 * ```typescript
 * const backend = new GitGrepBackend();
 * if (await backend.isAvailable()) {
 *   const result = await backend.search({
 *     query: "TODO",
 *     mode: "literal",
 *     paths: ["./src"],
 *   });
 *   console.log(result.matches);
 * }
 * ```
 */
export class GitGrepBackend implements SearchBackend {
  readonly name = "git-grep";

  private readonly timeout: number;

  /**
   * Create a new git grep backend.
   *
   * @param options - Configuration options
   */
  constructor(options: GitGrepBackendOptions = {}) {
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT;
  }

  /**
   * Check if git grep is available.
   * Must be in a Git repository AND have git command available.
   *
   * @returns true if git grep can be used
   */
  async isAvailable(): Promise<boolean> {
    // Check if git command exists
    const gitExists = await this.checkGitCommand();
    if (!gitExists) {
      return false;
    }

    // Check if we're in a git repository
    return this.checkGitRepository();
  }

  /**
   * Execute a search using git grep.
   *
   * @param options - Search options
   * @returns Search results
   */
  async search(options: SearchOptions): Promise<SearchResult> {
    const startTime = performance.now();

    // Determine search paths
    const searchPaths = options.paths?.length ? options.paths : [];
    const basePath = searchPaths[0] ?? ".";

    // Build arguments
    const args = this.buildArguments(options);

    // Execute search
    const tracker = new GitGrepStateTracker(
      options.contextLines ?? 0,
      options.maxResults ?? 0,
      basePath
    );

    try {
      await this.executeSearch(args, tracker, basePath);
    } catch (error) {
      // Handle specific error cases
      if (error instanceof GitGrepError) {
        // Exit code 1 means no matches found
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
      filesSearched: tracker.getFilesSearched(),
      matchCount: matches.length,
      duration,
      backend: "git-grep" as BackendType,
    };

    return {
      matches,
      truncated: tracker.isTruncated(),
      stats,
    };
  }

  /**
   * Check if git command is available.
   */
  private checkGitCommand(): Promise<boolean> {
    return new Promise((resolve) => {
      const child = spawn("git", ["--version"], {
        stdio: ["pipe", "pipe", "pipe"],
        shell: process.platform === "win32",
      });

      child.on("error", () => {
        resolve(false);
      });

      child.on("close", (code) => {
        resolve(code === 0);
      });
    });
  }

  /**
   * Check if current directory is inside a Git repository.
   */
  private async checkGitRepository(): Promise<boolean> {
    // Quick check: look for .git directory
    try {
      await access(path.join(process.cwd(), ".git"), constants.F_OK);
      return true;
    } catch {
      // Fall back to git rev-parse
    }

    return new Promise((resolve) => {
      const child = spawn("git", ["rev-parse", "--is-inside-work-tree"], {
        stdio: ["pipe", "pipe", "pipe"],
        shell: process.platform === "win32",
      });

      child.on("error", () => {
        resolve(false);
      });

      child.on("close", (code) => {
        resolve(code === 0);
      });
    });
  }

  /**
   * Build git grep command-line arguments.
   */
  private buildArguments(options: SearchOptions): string[] {
    const args: string[] = [
      "grep",
      "-n", // Line numbers
      "--no-color", // Plain output
      "--full-name", // Full path from repo root
    ];

    // Search mode: literal vs regex
    if (options.mode === "literal") {
      args.push("-F"); // Fixed strings
    } else {
      args.push("-E"); // Extended regex
    }

    // Case sensitivity
    if (!options.caseSensitive) {
      args.push("-i"); // Ignore case
    }

    // Context lines
    if (options.contextLines && options.contextLines > 0) {
      args.push(`-C${options.contextLines}`);
    }

    // Add the search pattern
    args.push("--", options.query);

    // Add search paths (if specified)
    if (options.paths?.length) {
      args.push(...options.paths);
    }

    // Add exclude pathspecs
    // Git uses pathspec patterns: ':!pattern' or ':(exclude)pattern'
    if (options.excludes?.length) {
      for (const exclude of options.excludes) {
        // Normalize the exclude pattern
        const pattern = exclude
          .replace(/^!?/, "") // Strip leading negation if present
          .replace(/^\*\*\//, "") // Strip leading **/
          .replace(/\/?\*\*\/?$/, "") // Strip trailing **
          .replace(/\/$/, ""); // Strip trailing slash
        if (pattern) {
          args.push(`:!${pattern}`);
        }
      }
    }

    return args;
  }

  /**
   * Execute git grep and stream parse output.
   */
  private executeSearch(args: string[], tracker: GitGrepStateTracker, cwd: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const child: ChildProcess = spawn("git", args, {
        cwd,
        stdio: ["pipe", "pipe", "pipe"],
        shell: process.platform === "win32",
      });

      // Set timeout
      const timeoutId = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new GitGrepError("Search timed out", -1));
      }, this.timeout);

      // Track if we should stop early
      let shouldStop = false;

      // Parse stdout line by line
      if (child.stdout) {
        const rl = createInterface({
          input: child.stdout,
          crlfDelay: Number.POSITIVE_INFINITY,
        });

        rl.on("line", (line) => {
          if (shouldStop) return;

          const shouldContinue = tracker.handleLine(line);
          if (!shouldContinue) {
            shouldStop = true;
            child.kill("SIGTERM");
          }
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
        reject(new GitGrepError(`Failed to spawn git: ${err.message}`, -1));
      });

      // Handle process exit
      child.on("close", (code) => {
        clearTimeout(timeoutId);

        // Exit code 0 = matches found
        // Exit code 1 = no matches (not an error)
        // Exit code 128+ = actual error
        if (code === 0 || code === 1 || shouldStop) {
          resolve();
        } else {
          reject(
            new GitGrepError(`Git grep exited with code ${code}: ${stderr.trim()}`, code ?? -1)
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
        backend: "git-grep" as BackendType,
      },
    };
  }
}

// =============================================================================
// State Tracker
// =============================================================================

/**
 * Tracks state while parsing git grep output.
 * Git grep output format: "file:line:content" or with context: "file-line-content"
 */
class GitGrepStateTracker {
  /** Accumulated matches */
  private matches: SearchMatch[] = [];

  /** Set of files searched */
  private filesSearched = new Set<string>();

  /** Number of context lines requested */
  private readonly contextLines: number;

  /** Maximum results (0 = unlimited) */
  private readonly maxResults: number;

  /** Whether we've hit the max results limit */
  private truncated = false;

  /** Current match being built (for context accumulation) */
  private currentMatch: SearchMatch | null = null;

  /** Pending before context */
  private pendingBeforeContext: string[] = [];

  /** Pending after context count */
  private pendingAfterCount = 0;

  constructor(contextLines: number, maxResults: number, _basePath: string) {
    this.contextLines = contextLines;
    this.maxResults = maxResults;
    // basePath reserved for future use (relative path resolution)
  }

  /**
   * Handle a line of git grep output.
   * @returns true to continue, false to stop
   */
  handleLine(line: string): boolean {
    // Skip empty lines
    if (!line.trim()) {
      return true;
    }

    // Skip separator lines (--) between file matches
    if (line === "--") {
      this.finalizeCurrentMatch();
      this.pendingBeforeContext = [];
      return true;
    }

    // Parse the line
    // Format: "file:line:content" for matches
    // Format: "file-line-content" for context (note: hyphen instead of colon)
    const matchResult = this.parseMatchLine(line);
    const contextResult = this.parseContextLine(line);

    if (matchResult) {
      // Finalize previous match
      this.finalizeCurrentMatch();

      // Check max results
      if (this.maxResults > 0 && this.matches.length >= this.maxResults) {
        this.truncated = true;
        return false;
      }

      this.filesSearched.add(matchResult.file);

      const match: SearchMatch = {
        file: matchResult.file,
        line: matchResult.line,
        column: 1, // Git grep doesn't provide column info
        content: matchResult.content,
      };

      // Add before context if we have any
      if (this.contextLines > 0 && this.pendingBeforeContext.length > 0) {
        match.context = {
          before: [...this.pendingBeforeContext],
          after: [],
        };
        this.pendingBeforeContext = [];
      }

      this.currentMatch = match;
      this.pendingAfterCount = 0;

      return true;
    }

    if (contextResult) {
      this.filesSearched.add(contextResult.file);

      // If we have a current match waiting for after-context
      if (this.currentMatch && this.pendingAfterCount < this.contextLines) {
        if (!this.currentMatch.context) {
          this.currentMatch.context = { before: [], after: [] };
        }
        this.currentMatch.context.after.push(contextResult.content);
        this.pendingAfterCount++;
      } else {
        // Otherwise it's before-context for next match
        this.pendingBeforeContext.push(contextResult.content);
        if (this.pendingBeforeContext.length > this.contextLines) {
          this.pendingBeforeContext.shift();
        }
      }

      return true;
    }

    // If we couldn't parse the line, try to treat it as a simple match
    // (for edge cases where content contains colons)
    const simpleMatch = this.parseSimpleLine(line);
    if (simpleMatch) {
      this.finalizeCurrentMatch();

      if (this.maxResults > 0 && this.matches.length >= this.maxResults) {
        this.truncated = true;
        return false;
      }

      this.filesSearched.add(simpleMatch.file);
      this.matches.push({
        file: simpleMatch.file,
        line: simpleMatch.line,
        column: 1,
        content: simpleMatch.content,
      });
    }

    return true;
  }

  /**
   * Parse a match line (file:line:content).
   */
  private parseMatchLine(line: string): { file: string; line: number; content: string } | null {
    // Match format: file:123:content
    const match = line.match(/^(.+?):(\d+):(.*)$/);
    if (!match) {
      return null;
    }

    const [, file, lineStr, content] = match;
    const lineNum = Number.parseInt(lineStr ?? "0", 10);

    if (!file || Number.isNaN(lineNum)) {
      return null;
    }

    return {
      file,
      line: lineNum,
      content: content ?? "",
    };
  }

  /**
   * Parse a context line (file-line-content).
   */
  private parseContextLine(line: string): { file: string; line: number; content: string } | null {
    // Context format: file-123-content
    const match = line.match(/^(.+?)-(\d+)-(.*)$/);
    if (!match) {
      return null;
    }

    const [, file, lineStr, content] = match;
    const lineNum = Number.parseInt(lineStr ?? "0", 10);

    if (!file || Number.isNaN(lineNum)) {
      return null;
    }

    return {
      file,
      line: lineNum,
      content: content ?? "",
    };
  }

  /**
   * Parse a simple line format as fallback.
   */
  private parseSimpleLine(line: string): { file: string; line: number; content: string } | null {
    // Fallback: try splitting by first two colons
    const firstColon = line.indexOf(":");
    if (firstColon === -1) return null;

    const secondColon = line.indexOf(":", firstColon + 1);
    if (secondColon === -1) return null;

    const file = line.slice(0, firstColon);
    const lineStr = line.slice(firstColon + 1, secondColon);
    const content = line.slice(secondColon + 1);

    const lineNum = Number.parseInt(lineStr, 10);
    if (Number.isNaN(lineNum)) {
      return null;
    }

    return { file, line: lineNum, content };
  }

  /**
   * Finalize the current match and add to results.
   */
  private finalizeCurrentMatch(): void {
    if (this.currentMatch) {
      this.matches.push(this.currentMatch);
      this.currentMatch = null;
    }
  }

  /**
   * Check if max results was reached.
   */
  isTruncated(): boolean {
    return this.truncated;
  }

  /**
   * Get number of files searched.
   */
  getFilesSearched(): number {
    return this.filesSearched.size;
  }

  /**
   * Get all accumulated matches.
   */
  getMatches(): SearchMatch[] {
    this.finalizeCurrentMatch();
    return this.matches;
  }
}

// =============================================================================
// Types
// =============================================================================

/**
 * Options for GitGrepBackend constructor.
 */
export interface GitGrepBackendOptions {
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;
}

// =============================================================================
// Errors
// =============================================================================

/**
 * Error thrown by git grep backend.
 */
export class GitGrepError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode: number) {
    super(message);
    this.name = "GitGrepError";
    this.exitCode = exitCode;
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a new git grep backend with default settings.
 *
 * @returns Configured GitGrepBackend instance
 */
export function createGitGrepBackend(options?: GitGrepBackendOptions): GitGrepBackend {
  return new GitGrepBackend(options);
}
