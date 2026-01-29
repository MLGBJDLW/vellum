/**
 * SignalExtractor - Extract actionable signals from user input and error context.
 *
 * This module separates signal extraction from evidence retrieval, enabling:
 * - Caching of extracted signals across provider queries
 * - Testable signal parsing independent of providers
 * - Future ML-based signal enhancement
 *
 * @packageDocumentation
 * @module context/evidence/signal-extractor
 */

import type { Signal, SignalSource, SignalType } from "./types.js";

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Configuration options for SignalExtractor.
 */
export interface SignalExtractorConfig {
  /** Minimum confidence threshold (default: 0.3) */
  minConfidence?: number;
  /** Maximum signals per type (default: 10) */
  maxSignalsPerType?: number;
  /** Custom token patterns for additional signal extraction */
  customPatterns?: RegExp[];
}

// =============================================================================
// Input Types
// =============================================================================

/**
 * Error context information for signal extraction.
 */
export interface ErrorContext {
  /** Error message text */
  readonly message: string;
  /** Optional stack trace */
  readonly stack?: string;
  /** Optional error code */
  readonly code?: string;
}

/**
 * Git diff information for signal extraction.
 */
export interface GitDiffInfo {
  /** List of changed files */
  readonly files: ReadonlyArray<{
    readonly path: string;
    readonly type: "added" | "modified" | "deleted";
  }>;
}

/**
 * Input for signal extraction.
 */
export interface SignalInput {
  /** User message text */
  userMessage?: string;
  /** Error context array */
  errors?: ErrorContext[];
  /** Working set file paths */
  workingSet?: string[];
  /** Git diff information */
  gitDiff?: GitDiffInfo;
}

// =============================================================================
// Internal Types
// =============================================================================

/**
 * Parsed stack frame information.
 */
interface StackFrame {
  readonly file: string;
  readonly line: number;
  readonly column?: number;
  readonly function?: string;
  readonly depth: number;
}

// =============================================================================
// Constants
// =============================================================================

/** Default minimum confidence threshold */
const DEFAULT_MIN_CONFIDENCE = 0.3;

/** Default maximum signals per type */
const DEFAULT_MAX_SIGNALS_PER_TYPE = 10;

/** Number of signal types (error_token, symbol, path, stack_frame) */
const SIGNAL_TYPE_COUNT = 4;

/** Symbol pattern for camelCase, PascalCase, and snake_case identifiers */
const SYMBOL_PATTERN =
  /\b([A-Z][a-z]+[A-Za-z]*|[a-z]+(?:_[a-z]+)+|[a-z][a-zA-Z]*[A-Z][a-zA-Z]*)\b/g;

/** File path pattern for common source file extensions */
const PATH_PATTERN =
  /(?:^|[\s'"(])([./\w-]+\.(?:ts|js|tsx|jsx|py|rs|go|java|cpp|c|h|rb|swift|kt|scala|vue|svelte))/g;

/** Standalone path pattern for extractPaths */
const STANDALONE_PATH_PATTERN =
  /[./\w-]+\.(?:ts|js|tsx|jsx|py|rs|go|java|cpp|c|h|rb|swift|kt|scala|vue|svelte)(?::\d+)?/g;

/** Common noise words to filter from error tokens */
const NOISE_WORDS = new Set([
  "error",
  "at",
  "in",
  "on",
  "the",
  "is",
  "was",
  "not",
  "cannot",
  "could",
  "should",
  "would",
  "from",
  "with",
  "for",
  "and",
  "but",
  "or",
]);

// =============================================================================
// SignalExtractor Implementation
// =============================================================================

/**
 * Extracts actionable signals from user input, errors, working set, and git diff.
 *
 * Signals are used to query evidence providers for relevant code context.
 *
 * @example
 * ```typescript
 * const extractor = new SignalExtractor({ minConfidence: 0.5 });
 * const signals = extractor.extract({
 *   userMessage: 'Fix the handleClick function in Button.tsx',
 *   errors: [{ message: 'TypeError: undefined is not a function' }],
 * });
 * ```
 */
export class SignalExtractor {
  private readonly config: Readonly<Required<SignalExtractorConfig>>;

  /**
   * Create a new SignalExtractor instance.
   * @param config - Configuration options
   */
  constructor(config: SignalExtractorConfig = {}) {
    this.config = Object.freeze({
      minConfidence: config.minConfidence ?? DEFAULT_MIN_CONFIDENCE,
      maxSignalsPerType: config.maxSignalsPerType ?? DEFAULT_MAX_SIGNALS_PER_TYPE,
      customPatterns: config.customPatterns ?? [],
    });
  }

  /**
   * Extract signals from the given input sources.
   *
   * @param input - Input containing user message, errors, working set, and/or git diff
   * @returns Array of extracted signals, filtered by confidence and deduplicated
   */
  extract(input: SignalInput): Signal[] {
    const signals: Signal[] = [];

    // Extract from user message
    if (input.userMessage) {
      signals.push(...this.extractFromText(input.userMessage, "user_message"));
    }

    // Extract from errors
    if (input.errors?.length) {
      signals.push(...this.extractFromErrors(input.errors));
    }

    // Extract from working set
    if (input.workingSet?.length) {
      signals.push(...this.extractFromWorkingSet(input.workingSet));
    }

    // Extract from git diff
    if (input.gitDiff) {
      signals.push(...this.extractFromDiff(input.gitDiff));
    }

    // Deduplicate, filter by confidence, and limit total count
    return this.deduplicate(signals)
      .filter((s) => s.confidence >= this.config.minConfidence)
      .slice(0, this.config.maxSignalsPerType * SIGNAL_TYPE_COUNT);
  }

  /**
   * Extract symbols and paths from text content.
   *
   * @param text - Text to extract signals from
   * @param source - Source identifier for the signals
   * @returns Array of extracted signals
   */
  private extractFromText(text: string, source: SignalSource): Signal[] {
    const signals: Signal[] = [];

    // Extract symbols (camelCase, PascalCase, snake_case)
    const symbolMatches = text.matchAll(SYMBOL_PATTERN);
    for (const match of symbolMatches) {
      const value = match[1];
      if (value) {
        signals.push({
          type: "symbol",
          value,
          source,
          confidence: 0.6,
        });
      }
    }

    // Extract file paths
    const pathMatches = text.matchAll(PATH_PATTERN);
    for (const match of pathMatches) {
      const value = match[1];
      if (value) {
        signals.push({
          type: "path",
          value,
          source,
          confidence: 0.8,
        });
      }
    }

    // Apply custom patterns
    for (const pattern of this.config.customPatterns) {
      const customMatches = text.matchAll(new RegExp(pattern, "g"));
      for (const match of customMatches) {
        signals.push({
          type: "symbol",
          value: match[0],
          source,
          confidence: 0.5,
        });
      }
    }

    return signals;
  }

  /**
   * Extract file paths from text.
   *
   * @param text - Text to extract paths from
   * @returns Array of extracted file paths
   */
  private extractPaths(text: string): string[] {
    const matches = text.matchAll(STANDALONE_PATH_PATTERN);
    return [...matches].map((m) => m[0]);
  }

  /**
   * Extract signals from error context.
   *
   * @param errors - Array of error contexts
   * @returns Array of extracted signals
   */
  private extractFromErrors(errors: ErrorContext[]): Signal[] {
    const signals: Signal[] = [];

    for (const error of errors) {
      // Extract stack frames
      const frames = this.parseStackTrace(error.stack);
      for (const frame of frames) {
        signals.push({
          type: "stack_frame",
          value: `${frame.file}:${frame.line}`,
          source: "error_output",
          confidence: Math.max(0.1, 1.0 - frame.depth * 0.1), // Decay by depth, min 0.1
          metadata: { stackDepth: frame.depth, column: frame.column },
        });
      }

      // Extract error tokens (keywords)
      const tokens = this.extractErrorTokens(error.message);
      for (const token of tokens) {
        signals.push({
          type: "error_token",
          value: token,
          source: "error_output",
          confidence: 0.7,
        });
      }

      // Extract file paths mentioned in error
      const paths = this.extractPaths(error.message);
      for (const path of paths) {
        signals.push({
          type: "path",
          value: path,
          source: "error_output",
          confidence: 0.9,
        });
      }

      // Also extract paths from stack trace
      if (error.stack) {
        const stackPaths = this.extractPaths(error.stack);
        for (const path of stackPaths) {
          signals.push({
            type: "path",
            value: path,
            source: "error_output",
            confidence: 0.85,
          });
        }
      }
    }

    return signals;
  }

  /**
   * Parse stack trace into structured frames.
   *
   * @param stack - Stack trace string
   * @returns Array of parsed stack frames
   */
  private parseStackTrace(stack?: string): StackFrame[] {
    if (!stack) return [];

    const frames: StackFrame[] = [];

    // Common stack trace patterns
    const patterns = [
      // Node.js/V8: at functionName (file:line:column) or at file:line:column
      /at (?:(?<func>\S+) )?\(?(?<file>[^:()]+):(?<line>\d+):(?<col>\d+)\)?/g,
      // Python: File "path", line N
      /File "(?<file>[^"]+)", line (?<line>\d+)/g,
      // Rust/Go: file:line
      /^\s+(?<file>[^\s:]+):(?<line>\d+)/gm,
    ];

    for (const pattern of patterns) {
      let depth = 0;

      // Reset pattern lastIndex for each pattern
      pattern.lastIndex = 0;

      let match = pattern.exec(stack);
      while (match !== null) {
        const file = match.groups?.file;
        const lineStr = match.groups?.line;

        // Skip invalid entries
        if (!file || !lineStr) {
          match = pattern.exec(stack);
          continue;
        }

        const line = parseInt(lineStr, 10);
        if (line === 0) {
          match = pattern.exec(stack);
          continue;
        }

        frames.push({
          file,
          line,
          column: match.groups?.col ? parseInt(match.groups.col, 10) : undefined,
          function: match.groups?.func,
          depth: depth++,
        });

        match = pattern.exec(stack);
      }

      // If we found frames with this pattern, don't try other patterns
      if (frames.length > 0) break;
    }

    return frames;
  }

  /**
   * Extract meaningful tokens from error messages.
   *
   * @param message - Error message text
   * @returns Array of extracted tokens
   */
  private extractErrorTokens(message: string): string[] {
    return message
      .split(/\s+/)
      .filter((word) => word.length > 2)
      .filter((word) => !NOISE_WORDS.has(word.toLowerCase()))
      .filter((word) => /^[a-zA-Z_]\w*$/.test(word))
      .slice(0, 10);
  }

  /**
   * Extract signals from working set files.
   *
   * @param files - Array of file paths
   * @returns Array of path signals
   */
  private extractFromWorkingSet(files: string[]): Signal[] {
    return files.map((path) => ({
      type: "path" as SignalType,
      value: path,
      source: "working_set" as SignalSource,
      confidence: 1.0,
    }));
  }

  /**
   * Extract signals from git diff information.
   *
   * @param diff - Git diff information
   * @returns Array of path signals with change metadata
   */
  private extractFromDiff(diff: GitDiffInfo): Signal[] {
    return diff.files.map((file) => ({
      type: "path" as SignalType,
      value: file.path,
      source: "git_diff" as SignalSource,
      confidence: 1.0,
      metadata: { changeType: file.type },
    }));
  }

  /**
   * Deduplicate signals by type:value key, keeping highest confidence.
   *
   * @param signals - Array of signals to deduplicate
   * @returns Deduplicated array of signals
   */
  private deduplicate(signals: Signal[]): Signal[] {
    const seen = new Map<string, Signal>();

    for (const signal of signals) {
      const key = `${signal.type}:${signal.value}`;
      const existing = seen.get(key);

      if (!existing || signal.confidence > existing.confidence) {
        seen.set(key, signal);
      }
    }

    return [...seen.values()];
  }
}
