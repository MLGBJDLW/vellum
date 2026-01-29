/**
 * PackBuilder Module - Evidence Pack Assembly
 *
 * Assembles final EvidencePack with all components:
 * ProjectSummary + WorkingSet + EvidenceItems.
 *
 * Handles fallback to summary+reference mode when budget insufficient.
 * Per ADR-003: When evidence < minEvidenceItems, switch to reference-only format.
 *
 * @packageDocumentation
 * @module context/evidence/pack-builder
 */

import type { BudgetAllocation, BudgetAllocator } from "./budget-allocator.js";
import type { Reranker } from "./reranker.js";
import type {
  Evidence,
  EvidencePack,
  EvidenceTelemetry,
  ProjectSummary,
  ProviderType,
  WorkingSetEntry,
} from "./types.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Configuration for the PackBuilder.
 */
export interface PackBuilderConfig {
  /** Reranker instance for scoring evidence */
  readonly reranker: Reranker;
  /** BudgetAllocator instance for budget management */
  readonly budgetAllocator: BudgetAllocator;
  /** Minimum evidence items before fallback (default: 3) */
  readonly minEvidenceItems?: number;
  /** Enable fallback to summary-only mode (default: true) */
  readonly enableFallback?: boolean;
}

/**
 * Input for building an evidence pack.
 */
export interface PackBuilderInput {
  /** Raw evidence items from providers */
  readonly evidence: readonly Evidence[];
  /** Project summary (optional, will use default if not provided) */
  readonly summary?: ProjectSummary;
  /** Working set entries (optional) */
  readonly workingSet?: WorkingSetEntry[];
}

// =============================================================================
// Constants
// =============================================================================

/** Default minimum evidence items before triggering fallback */
const DEFAULT_MIN_EVIDENCE_ITEMS = 3;

/** Token estimate for reference-only evidence format */
const REFERENCE_ONLY_TOKENS = 10;

/** Default tokens for empty summary */
const DEFAULT_SUMMARY_TOKENS = 50;

// =============================================================================
// Implementation
// =============================================================================

/**
 * Assembles final EvidencePack from evidence, summary, and working set.
 *
 * Build Flow:
 * 1. Allocate budget via BudgetAllocator
 * 2. Rank evidence via Reranker
 * 3. Fit evidence to budget
 * 4. Check fallback condition (evidence < minEvidenceItems)
 * 5. Assemble final pack with telemetry
 *
 * Fallback Mode (ADR-003):
 * When budgeted evidence count < minEvidenceItems:
 * - Keep full ProjectSummary
 * - Convert evidence to reference-only format: `// See ${path}:${line}`
 * - Each reference costs ~10 tokens
 *
 * @example
 * ```typescript
 * const reranker = new Reranker();
 * const allocator = new BudgetAllocator({ contextWindow: 100000 });
 * const builder = new PackBuilder({ reranker, budgetAllocator: allocator });
 *
 * const pack = builder.build({
 *   evidence: collectedEvidence,
 *   summary: projectSummary,
 *   workingSet: activeFiles,
 * });
 * ```
 */
export class PackBuilder {
  private readonly reranker: Reranker;
  private readonly budgetAllocator: BudgetAllocator;
  private readonly minEvidenceItems: number;
  private readonly enableFallback: boolean;

  /**
   * Create a new PackBuilder instance.
   * @param config - Configuration options
   */
  constructor(config: PackBuilderConfig) {
    this.reranker = config.reranker;
    this.budgetAllocator = config.budgetAllocator;
    this.minEvidenceItems = config.minEvidenceItems ?? DEFAULT_MIN_EVIDENCE_ITEMS;
    this.enableFallback = config.enableFallback ?? true;
  }

  /**
   * Build evidence pack from raw evidence and context.
   *
   * @param input - Input containing evidence, optional summary, and working set
   * @returns Complete evidence pack ready for context injection
   */
  build(input: PackBuilderInput): EvidencePack {
    const startTime = performance.now();

    // Step 1: Allocate budget
    const allocation = this.budgetAllocator.allocate();

    // Step 2: Rank evidence by multi-feature score
    const ranked = this.reranker.rank(input.evidence);

    // Step 3: Fit to budget with per-provider limits
    const budgeted = this.budgetAllocator.fitToBudget(ranked, allocation);

    // Step 4: Check fallback condition
    if (budgeted.length < this.minEvidenceItems && this.enableFallback) {
      return this.buildFallbackPack(input, ranked, allocation, startTime);
    }

    // Step 5: Build normal pack
    return this.buildNormalPack(input, budgeted, ranked.length, allocation, startTime);
  }

  /**
   * Build fallback pack when evidence insufficient.
   * Uses summary + references only (no full code content).
   *
   * @param input - Original input
   * @param rankedEvidence - Evidence after ranking (before budget filtering)
   * @param allocation - Budget allocation
   * @param startTime - Start timestamp for telemetry
   * @returns Fallback evidence pack
   */
  private buildFallbackPack(
    input: PackBuilderInput,
    rankedEvidence: Evidence[],
    allocation: BudgetAllocation,
    startTime: number
  ): EvidencePack {
    // Keep full summary
    const summary = input.summary ?? this.buildDefaultSummary();

    // Create reference-only evidence (paths + line hints)
    // Take top 10 ranked items and convert to reference format
    const references: Evidence[] = rankedEvidence.slice(0, 10).map((e) => ({
      ...e,
      content: `// See ${e.path}:${e.range[0]}`,
      tokens: REFERENCE_ONLY_TOKENS,
    }));

    // Calculate totals (no working set in fallback mode)
    const totalTokens = summary.tokens + references.reduce((sum, e) => sum + e.tokens, 0);

    // Build telemetry
    const telemetry = this.buildTelemetry(
      references,
      input.evidence.length,
      allocation,
      startTime,
      true // fallbackUsed
    );

    return {
      summary,
      workingSet: [],
      evidence: references,
      totalTokens,
      budgetUsed: allocation.total > 0 ? totalTokens / allocation.total : 0,
      telemetry,
    };
  }

  /**
   * Build normal pack with full evidence content.
   *
   * @param input - Original input
   * @param budgetedEvidence - Evidence after budget filtering
   * @param totalCandidates - Total candidates before filtering
   * @param allocation - Budget allocation
   * @param startTime - Start timestamp for telemetry
   * @returns Normal evidence pack
   */
  private buildNormalPack(
    input: PackBuilderInput,
    budgetedEvidence: Evidence[],
    totalCandidates: number,
    allocation: BudgetAllocation,
    startTime: number
  ): EvidencePack {
    // Build or use provided summary
    const summary = input.summary ?? this.buildDefaultSummary();

    // Fit working set to allocated budget
    const workingSet = this.fitWorkingSet(input.workingSet ?? [], allocation.workingSet);

    // Calculate totals
    const totalTokens =
      summary.tokens +
      workingSet.reduce((sum, w) => sum + w.tokens, 0) +
      budgetedEvidence.reduce((sum, e) => sum + e.tokens, 0);

    // Build telemetry
    const telemetry = this.buildTelemetry(
      budgetedEvidence,
      totalCandidates,
      allocation,
      startTime,
      false // fallbackUsed
    );

    return {
      summary,
      workingSet,
      evidence: budgetedEvidence,
      totalTokens,
      budgetUsed: allocation.total > 0 ? totalTokens / allocation.total : 0,
      telemetry,
    };
  }

  /**
   * Build default summary when none provided.
   * Returns empty summary with minimal token cost.
   */
  private buildDefaultSummary(): ProjectSummary {
    return {
      goal: undefined,
      constraints: [],
      facts: [],
      decisions: [],
      questions: [],
      nextActions: [],
      tokens: DEFAULT_SUMMARY_TOKENS,
    };
  }

  /**
   * Fit working set entries to allocated budget.
   * Prioritizes most recently modified files.
   *
   * @param entries - Working set entries to fit
   * @param budget - Available token budget for working set
   * @returns Working set entries that fit within budget
   */
  private fitWorkingSet(entries: WorkingSetEntry[], budget: number): WorkingSetEntry[] {
    if (entries.length === 0 || budget <= 0) {
      return [];
    }

    const result: WorkingSetEntry[] = [];
    let used = 0;

    // Sort by last modified (most recent first)
    const sorted = [...entries].sort((a, b) => b.lastModified - a.lastModified);

    for (const entry of sorted) {
      // Skip entries with zero or negative tokens
      if (entry.tokens <= 0) {
        continue;
      }

      if (used + entry.tokens > budget) {
        // No more room
        break;
      }

      result.push(entry);
      used += entry.tokens;
    }

    return result;
  }

  /**
   * Build telemetry data for the evidence pack.
   *
   * @param evidence - Final evidence items in pack
   * @param totalCandidates - Total candidates before filtering
   * @param allocation - Budget allocation used
   * @param startTime - Build start timestamp
   * @param _fallbackUsed - Whether fallback mode was used (reserved for future telemetry extension)
   * @returns Telemetry data
   */
  private buildTelemetry(
    evidence: readonly Evidence[],
    totalCandidates: number,
    allocation: BudgetAllocation,
    startTime: number,
    _fallbackUsed: boolean
  ): EvidenceTelemetry {
    const endTime = performance.now();
    const totalMs = endTime - startTime;

    // Count by provider
    const byProvider: Record<ProviderType, number> = {
      diff: 0,
      lsp: 0,
      search: 0,
    };

    for (const e of evidence) {
      byProvider[e.provider] = (byProvider[e.provider] ?? 0) + 1;
    }

    // Calculate tokens saved
    const evidenceTokens = evidence.reduce((sum, e) => sum + e.tokens, 0);
    const evidenceBudget = Math.max(
      0,
      allocation.total - allocation.summary - allocation.workingSet
    );
    const tokensSaved = Math.max(0, evidenceBudget - evidenceTokens);

    return {
      // Signal extraction timing not available at pack-builder level
      // These would be populated by the orchestrator if needed
      signalExtractionMs: 0,
      providerTimings: {
        diff: 0,
        lsp: 0,
        search: 0,
      },
      rerankMs: 0,
      totalMs,
      signalCount: 0, // Not available at pack-builder level
      evidenceCountBeforeBudget: totalCandidates,
      evidenceCountAfterBudget: evidence.length,
      tokensSaved,
    };
  }
}
