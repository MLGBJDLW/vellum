/**
 * DiffProvider - Git Diff Evidence Provider
 *
 * Provides evidence from git diffs by wrapping the GitSnapshotService.
 * Highest priority provider (baseWeight=100) as recent changes are most relevant.
 *
 * @packageDocumentation
 * @module context/evidence/providers
 */

import { createId } from "@vellum/shared";
import type { GitFileDiff, IGitSnapshotService } from "../../../git/types.js";
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
 * Configuration for the DiffProvider.
 */
export interface DiffProviderConfig {
  /** Git snapshot service instance */
  readonly gitService: IGitSnapshotService;
  /** Maximum diff age in milliseconds (default: 3600000 = 1hr) */
  readonly maxAge?: number;
  /** Context lines around changes (default: 3) */
  readonly contextLines?: number;
  /** Last tracked snapshot hash (required to generate diffs) */
  readonly snapshotHash?: string;
}

// =============================================================================
// Constants
// =============================================================================

/** Default context lines around changes */
const DEFAULT_CONTEXT_LINES = 3;

/** Approximate tokens per character (conservative estimate) */
const TOKENS_PER_CHAR = 0.25;

// =============================================================================
// DiffProvider Implementation
// =============================================================================

/**
 * Evidence provider that extracts relevant code from git diffs.
 *
 * Integrates with GitSnapshotService to provide evidence from:
 * - Modified files matching path signals
 * - Changes containing symbol signals
 * - Recent changes within the configured time window
 *
 * @example
 * ```typescript
 * const provider = new DiffProvider({
 *   gitService: snapshotService,
 *   snapshotHash: lastSnapshot,
 * });
 *
 * const evidence = await provider.query(signals, { maxResults: 10 });
 * ```
 */
export class DiffProvider implements EvidenceProvider {
  readonly type = "diff" as const;
  readonly name = "Git Diff";
  readonly baseWeight = 100; // Highest priority

  private readonly gitService: IGitSnapshotService;
  private readonly contextLines: number;
  private snapshotHash: string | undefined;

  /**
   * Creates a new DiffProvider instance.
   *
   * @param config - Provider configuration
   */
  constructor(config: DiffProviderConfig) {
    this.gitService = config.gitService;
    // Note: config.maxAge is reserved for future diff age filtering
    this.contextLines = config.contextLines ?? DEFAULT_CONTEXT_LINES;
    this.snapshotHash = config.snapshotHash;
  }

  /**
   * Sets the snapshot hash to diff against.
   *
   * @param hash - The 40-char git tree SHA hash
   */
  setSnapshotHash(hash: string): void {
    this.snapshotHash = hash;
  }

  /**
   * Checks if the provider is available.
   *
   * @returns True if git service is available and we have a snapshot hash
   */
  async isAvailable(): Promise<boolean> {
    // Provider requires a snapshot hash to generate diffs
    if (!this.snapshotHash) {
      return false;
    }

    // Try to get a patch to verify service is working
    try {
      const result = await this.gitService.patch(this.snapshotHash);
      return result.ok;
    } catch {
      return false;
    }
  }

  /**
   * Queries for evidence matching the given signals.
   *
   * @param signals - Signals to search for in diffs
   * @param options - Query options (limits, filters)
   * @returns Array of evidence items from git diffs
   */
  async query(signals: readonly Signal[], options?: ProviderQueryOptions): Promise<Evidence[]> {
    // No snapshot hash means no diffs available
    if (!this.snapshotHash) {
      return [];
    }

    // Get the full diff data
    const diffResult = await this.gitService.diffFull(this.snapshotHash);
    if (!diffResult.ok) {
      return [];
    }

    const fileDiffs = diffResult.value;
    if (fileDiffs.length === 0) {
      return [];
    }

    // Extract path and symbol signals for matching
    const pathSignals = signals.filter((s) => s.type === "path");
    const symbolSignals = signals.filter((s) => s.type === "symbol");
    const errorSignals = signals.filter((s) => s.type === "error_token");

    // Convert file diffs to evidence
    const evidence: Evidence[] = [];

    for (const fileDiff of fileDiffs) {
      // Skip files that don't match any include patterns
      if (
        options?.includePatterns &&
        !this.matchesPatterns(fileDiff.path, options.includePatterns)
      ) {
        continue;
      }

      // Skip files that match exclude patterns
      if (
        options?.excludePatterns &&
        this.matchesPatterns(fileDiff.path, options.excludePatterns)
      ) {
        continue;
      }

      // Check if this diff matches any signals
      const matchedSignals = this.findMatchingSignals(
        fileDiff,
        pathSignals,
        symbolSignals,
        errorSignals
      );

      // If no signals provided, include all diffs; otherwise filter by matches
      if (signals.length > 0 && matchedSignals.length === 0) {
        continue;
      }

      // Create evidence from the diff
      const evidenceItem = this.createEvidence(
        fileDiff,
        matchedSignals.length > 0 ? matchedSignals : [...signals],
        options?.contextLines ?? this.contextLines
      );

      if (evidenceItem) {
        evidence.push(evidenceItem);
      }
    }

    // Apply limits
    const maxResults = options?.maxResults ?? evidence.length;
    const limited = evidence.slice(0, maxResults);

    // Apply token budget if specified
    if (options?.maxTokens) {
      return this.applyTokenBudget(limited, options.maxTokens);
    }

    return limited;
  }

  /**
   * Finds signals that match a file diff.
   */
  private findMatchingSignals(
    fileDiff: GitFileDiff,
    pathSignals: readonly Signal[],
    symbolSignals: readonly Signal[],
    errorSignals: readonly Signal[]
  ): Signal[] {
    const matched: Signal[] = [];

    // Check path matches
    for (const signal of pathSignals) {
      if (this.pathMatches(fileDiff.path, signal.value)) {
        matched.push(signal);
      }
      // Also check old path for renames
      if (fileDiff.oldPath && this.pathMatches(fileDiff.oldPath, signal.value)) {
        matched.push(signal);
      }
    }

    // Check symbol matches in diff content
    const content = fileDiff.afterContent ?? fileDiff.beforeContent ?? "";
    for (const signal of symbolSignals) {
      if (this.contentContainsSymbol(content, signal.value)) {
        matched.push(signal);
      }
    }

    // Check error token matches in diff content
    for (const signal of errorSignals) {
      if (content.toLowerCase().includes(signal.value.toLowerCase())) {
        matched.push(signal);
      }
    }

    return matched;
  }

  /**
   * Checks if a file path matches a signal path.
   */
  private pathMatches(filePath: string, signalPath: string): boolean {
    // Normalize paths
    const normalizedFile = filePath.replace(/\\/g, "/").toLowerCase();
    const normalizedSignal = signalPath.replace(/\\/g, "/").toLowerCase();

    // Exact match
    if (normalizedFile === normalizedSignal) {
      return true;
    }

    // File ends with signal (e.g., signal "foo.ts" matches "src/bar/foo.ts")
    if (normalizedFile.endsWith(`/${normalizedSignal}`)) {
      return true;
    }

    // Signal is contained in file path
    if (normalizedFile.includes(normalizedSignal)) {
      return true;
    }

    return false;
  }

  /**
   * Checks if content contains a symbol (word boundary aware).
   */
  private contentContainsSymbol(content: string, symbol: string): boolean {
    // Create a word-boundary aware regex
    const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escaped}\\b`, "i");
    return regex.test(content);
  }

  /**
   * Checks if a path matches any of the given patterns.
   */
  private matchesPatterns(filePath: string, patterns: readonly string[]): boolean {
    const normalized = filePath.replace(/\\/g, "/").toLowerCase();

    for (const pattern of patterns) {
      const normalizedPattern = pattern.replace(/\\/g, "/").toLowerCase();

      // Simple glob-like matching
      if (normalizedPattern.includes("*")) {
        const regex = new RegExp(`^${normalizedPattern.replace(/\*/g, ".*")}$`);
        if (regex.test(normalized)) {
          return true;
        }
      } else if (normalized.includes(normalizedPattern)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Creates an Evidence item from a file diff.
   */
  private createEvidence(
    fileDiff: GitFileDiff,
    matchedSignals: readonly Signal[],
    _contextLines: number
  ): Evidence | null {
    // Use afterContent for added/modified, beforeContent for deleted
    const content = fileDiff.type === "deleted" ? fileDiff.beforeContent : fileDiff.afterContent;

    if (!content) {
      return null;
    }

    // Calculate line range
    const lines = content.split("\n");
    const lineCount = lines.length;

    // Estimate token count
    const tokens = Math.ceil(content.length * TOKENS_PER_CHAR);

    // Map change type to metadata
    const changeType: EvidenceMetadata["changeType"] =
      fileDiff.type === "renamed" ? "modified" : fileDiff.type;

    return {
      id: createId(),
      provider: "diff",
      path: fileDiff.path,
      range: [1, lineCount] as const,
      content,
      tokens,
      baseScore: this.baseWeight,
      matchedSignals: [...matchedSignals],
      metadata: {
        changeType,
      },
    };
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
