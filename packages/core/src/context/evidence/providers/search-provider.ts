/**
 * SearchProvider - Code Search Evidence Provider
 *
 * Provides evidence from code search by wrapping the high-performance
 * SearchFacade (ripgrep, git-grep, or JavaScript fallback).
 *
 * @packageDocumentation
 * @module context/evidence/providers
 */

import { createId } from "@vellum/shared";
import {
  getSearchFacade,
  type SearchFacade,
  type SearchMatch,
  type SearchOptions,
  type SearchResult,
} from "../../../builtin/search/index.js";
import type {
  Evidence,
  EvidenceMetadata,
  EvidenceProvider,
  ProviderQueryOptions,
  Signal,
} from "../types.js";

// =============================================================================
// Configuration
// =============================================================================

/**
 * Configuration for the SearchProvider.
 */
export interface SearchProviderConfig {
  /** Workspace root path */
  readonly workspaceRoot: string;
  /** File patterns to include (e.g., ['*.ts', '*.tsx']) */
  readonly includePatterns?: readonly string[];
  /** File patterns to exclude (e.g., ['node_modules/']) */
  readonly excludePatterns?: readonly string[];
  /** Maximum results per signal (default: 10) */
  readonly maxResultsPerSignal?: number;
  /** Context lines around matches (default: 3) */
  readonly contextLines?: number;
  /** Optional custom SearchFacade instance (for testing) */
  readonly searchFacade?: SearchFacade;
}

// =============================================================================
// Constants
// =============================================================================

/** Default maximum results per signal */
const DEFAULT_MAX_RESULTS_PER_SIGNAL = 10;

/** Default context lines around matches */
const DEFAULT_CONTEXT_LINES = 3;

/** Approximate tokens per character (conservative estimate) */
const TOKENS_PER_CHAR = 0.25;

// =============================================================================
// SearchProvider Implementation
// =============================================================================

/**
 * Evidence provider that extracts relevant code via search queries.
 *
 * Integrates with the SearchFacade to provide evidence from:
 * - Symbol searches (function/class names)
 * - Error token searches (keywords from error messages)
 * - Path-related keyword searches
 *
 * Uses ripgrep (preferred) or falls back to git-grep or JavaScript search.
 *
 * @example
 * ```typescript
 * const provider = new SearchProvider({
 *   workspaceRoot: '/path/to/project',
 *   includePatterns: ['*.ts'],
 *   excludePatterns: ['node_modules/'],
 * });
 *
 * const evidence = await provider.query(signals, { maxResults: 20 });
 * ```
 */
export class SearchProvider implements EvidenceProvider {
  readonly type = "search" as const;
  readonly name = "Code Search";
  readonly baseWeight = 10; // Keyword match weight

  private readonly workspaceRoot: string;
  private readonly includePatterns: readonly string[];
  private readonly excludePatterns: readonly string[];
  private readonly maxResultsPerSignal: number;
  private readonly contextLines: number;
  private readonly searchFacade: SearchFacade;

  /**
   * Creates a new SearchProvider instance.
   *
   * @param config - Provider configuration
   */
  constructor(config: SearchProviderConfig) {
    this.workspaceRoot = config.workspaceRoot;
    this.includePatterns = config.includePatterns ?? [];
    this.excludePatterns = config.excludePatterns ?? [];
    this.maxResultsPerSignal = config.maxResultsPerSignal ?? DEFAULT_MAX_RESULTS_PER_SIGNAL;
    this.contextLines = config.contextLines ?? DEFAULT_CONTEXT_LINES;
    this.searchFacade = config.searchFacade ?? getSearchFacade();
  }

  /**
   * Checks if the provider is available.
   * Provider is available if any search backend is available.
   *
   * @returns True if at least one search backend is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const backends = await this.searchFacade.getAvailableBackends();
      return backends.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Queries for evidence matching the given signals.
   *
   * @param signals - Signals to search for in codebase
   * @param options - Query options (limits, filters)
   * @returns Array of evidence items from code search
   */
  async query(signals: readonly Signal[], options?: ProviderQueryOptions): Promise<Evidence[]> {
    // Extract searchable signals
    const searchableSignals = this.extractSearchableSignals(signals);
    if (searchableSignals.length === 0) {
      return [];
    }

    // Build include/exclude patterns
    const includePatterns = this.mergePatterns(this.includePatterns, options?.includePatterns);
    const excludePatterns = this.mergePatterns(this.excludePatterns, options?.excludePatterns);

    // Perform searches for each signal
    const evidenceMap = new Map<string, Evidence>();
    const contextLines = options?.contextLines ?? this.contextLines;

    for (const signal of searchableSignals) {
      try {
        const searchOptions = this.buildSearchOptions(
          signal,
          includePatterns,
          excludePatterns,
          contextLines
        );

        const result = await this.searchFacade.search(searchOptions);
        const evidenceItems = this.convertToEvidence(result, signal, contextLines);

        // Deduplicate by path:range key, keeping higher-scored items
        for (const item of evidenceItems) {
          const key = `${item.path}:${item.range[0]}-${item.range[1]}`;
          const existing = evidenceMap.get(key);

          if (!existing) {
            evidenceMap.set(key, item);
          } else {
            // Merge matched signals and keep higher score
            const mergedSignals = [...existing.matchedSignals];
            for (const s of item.matchedSignals) {
              if (!mergedSignals.some((ms) => ms.value === s.value && ms.type === s.type)) {
                mergedSignals.push(s);
              }
            }

            evidenceMap.set(key, {
              ...existing,
              baseScore: Math.max(existing.baseScore, item.baseScore),
              matchedSignals: mergedSignals,
              metadata: {
                ...existing.metadata,
                matchCount: (existing.metadata?.matchCount ?? 1) + (item.metadata?.matchCount ?? 1),
              },
            });
          }
        }
      } catch {}
    }

    // Convert to array and sort by score (descending)
    let evidence = Array.from(evidenceMap.values()).sort((a, b) => b.baseScore - a.baseScore);

    // Apply result limit
    const maxResults = options?.maxResults ?? evidence.length;
    evidence = evidence.slice(0, maxResults);

    // Apply token budget if specified
    if (options?.maxTokens) {
      evidence = this.applyTokenBudget(evidence, options.maxTokens);
    }

    return evidence;
  }

  /**
   * Extracts signals suitable for code search.
   */
  private extractSearchableSignals(signals: readonly Signal[]): Signal[] {
    return signals.filter((signal) => {
      // Search for symbols (function/class names)
      if (signal.type === "symbol") {
        return signal.value.length >= 2; // Skip very short symbols
      }

      // Search for error tokens (keywords)
      if (signal.type === "error_token") {
        return signal.value.length >= 3; // Skip very short tokens
      }

      // Path signals are handled differently (exact file lookup)
      // Stack frames are handled by the path extraction
      return false;
    });
  }

  /**
   * Builds SearchOptions for a given signal.
   */
  private buildSearchOptions(
    signal: Signal,
    includePatterns: readonly string[],
    excludePatterns: readonly string[],
    contextLines: number
  ): SearchOptions {
    // For symbols, use word-boundary matching
    const isSymbol = signal.type === "symbol";
    const query = isSymbol
      ? `\\b${this.escapeRegex(signal.value)}\\b`
      : this.escapeRegex(signal.value);

    return {
      query,
      mode: "regex",
      paths: [this.workspaceRoot],
      globs: includePatterns.length > 0 ? [...includePatterns] : undefined,
      excludes: excludePatterns.length > 0 ? [...excludePatterns] : undefined,
      contextLines,
      maxResults: this.maxResultsPerSignal,
      caseSensitive: isSymbol, // Symbols are case-sensitive, keywords aren't
    };
  }

  /**
   * Escapes special regex characters in a string.
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * Converts search results to Evidence items.
   */
  private convertToEvidence(
    result: SearchResult,
    signal: Signal,
    contextLines: number
  ): Evidence[] {
    const evidence: Evidence[] = [];

    // Group matches by file
    const matchesByFile = new Map<string, SearchMatch[]>();
    for (const match of result.matches) {
      const existing = matchesByFile.get(match.file) ?? [];
      existing.push(match);
      matchesByFile.set(match.file, existing);
    }

    // Create evidence for each file
    for (const [file, matches] of matchesByFile) {
      // Merge overlapping or adjacent matches into ranges
      const ranges = this.mergeMatchRanges(matches, contextLines);

      for (const range of ranges) {
        // Build content from matches in this range
        const content = this.buildRangeContent(matches, range, contextLines);

        // Calculate score: base weight × number of matches
        const matchCount = range.matches.length;
        const score = this.baseWeight * Math.log2(matchCount + 1);

        // Estimate token count
        const tokens = Math.ceil(content.length * TOKENS_PER_CHAR);

        evidence.push({
          id: createId(),
          provider: "search",
          path: file,
          range: [range.startLine, range.endLine] as const,
          content,
          tokens,
          baseScore: score,
          matchedSignals: [signal],
          metadata: {
            matchCount,
          } satisfies EvidenceMetadata,
        });
      }
    }

    return evidence;
  }

  /**
   * Merges overlapping or adjacent match ranges.
   */
  private mergeMatchRanges(
    matches: SearchMatch[],
    contextLines: number
  ): Array<{ startLine: number; endLine: number; matches: SearchMatch[] }> {
    if (matches.length === 0) {
      return [];
    }

    // Sort by line number
    const sorted = [...matches].sort((a, b) => a.line - b.line);

    // Early return if no matches (shouldn't happen due to caller check, but be defensive)
    const firstMatch = sorted[0];
    if (!firstMatch) {
      return [];
    }

    const ranges: Array<{ startLine: number; endLine: number; matches: SearchMatch[] }> = [];
    let currentRange = {
      startLine: Math.max(1, firstMatch.line - contextLines),
      endLine: firstMatch.line + contextLines,
      matches: [firstMatch],
    };

    for (let i = 1; i < sorted.length; i++) {
      const match = sorted[i];
      if (!match) continue;
      const matchStart = Math.max(1, match.line - contextLines);
      const matchEnd = match.line + contextLines;

      // Check if ranges overlap or are adjacent
      if (matchStart <= currentRange.endLine + 1) {
        // Merge ranges
        currentRange.endLine = Math.max(currentRange.endLine, matchEnd);
        currentRange.matches.push(match);
      } else {
        // Start new range
        ranges.push(currentRange);
        currentRange = {
          startLine: matchStart,
          endLine: matchEnd,
          matches: [match],
        };
      }
    }

    // Don't forget the last range
    ranges.push(currentRange);

    return ranges;
  }

  /**
   * Builds content string for a range of matches.
   */
  private buildRangeContent(
    matches: SearchMatch[],
    range: { startLine: number; endLine: number; matches: SearchMatch[] },
    _contextLines: number
  ): string {
    // Use the first match's context if available, otherwise construct from matches
    const rangeMatches = matches.filter(
      (m) => m.line >= range.startLine && m.line <= range.endLine
    );

    if (rangeMatches.length === 0) {
      return "";
    }

    // If context is available, reconstruct the content
    const firstMatch = rangeMatches[0];
    if (firstMatch?.context) {
      const lines: string[] = [];

      // Add before context
      if (firstMatch.context.before) {
        lines.push(...firstMatch.context.before);
      }

      // Add all match lines
      for (const match of rangeMatches) {
        if (!lines.includes(match.content)) {
          lines.push(match.content);
        }
        // Add after context from this match if not already included
        if (match.context?.after) {
          for (const afterLine of match.context.after) {
            if (!lines.includes(afterLine)) {
              lines.push(afterLine);
            }
          }
        }
      }

      return lines.join("\n");
    }

    // Fallback: just concatenate match contents
    return rangeMatches.map((m) => m.content).join("\n");
  }

  /**
   * Merges pattern arrays, handling undefined and deduplication.
   */
  private mergePatterns(base: readonly string[], override?: readonly string[]): readonly string[] {
    if (!override || override.length === 0) {
      return base;
    }

    const merged = new Set([...base, ...override]);
    return Array.from(merged);
  }

  /**
   * Applies token budget to evidence list.
   */
  private applyTokenBudget(evidence: Evidence[], maxTokens: number): Evidence[] {
    const result: Evidence[] = [];
    let totalTokens = 0;

    for (const item of evidence) {
      if (totalTokens + item.tokens <= maxTokens) {
        result.push(item);
        totalTokens += item.tokens;
      } else if (result.length === 0) {
        // Always include at least one item, even if over budget
        result.push(item);
        break;
      }
    }

    return result;
  }
}
