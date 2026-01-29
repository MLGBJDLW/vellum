/**
 * Evidence Pack System - Core Type Definitions
 *
 * This module defines the type system for Vellum's Evidence Pack context builder.
 * All types use readonly modifiers to ensure immutability.
 *
 * @packageDocumentation
 * @module context/evidence
 */

// =============================================================================
// Signal Types
// =============================================================================

/**
 * Classification of signal types for routing to appropriate providers.
 */
export type SignalType =
  | "error_token" // Error message keywords
  | "symbol" // Function/class names
  | "path" // File paths
  | "stack_frame"; // Stack trace entries

/**
 * Origin source of a signal.
 */
export type SignalSource =
  | "user_message" // Extracted from user input
  | "error_output" // From terminal/LSP errors
  | "working_set" // From active files
  | "git_diff"; // From recent changes

/**
 * Signal extracted from user input and error context.
 * Drives evidence provider queries.
 */
export interface Signal {
  /** Signal type for routing to providers */
  readonly type: SignalType;
  /** Raw value (path, symbol name, error message, etc.) */
  readonly value: string;
  /** Source of this signal */
  readonly source: SignalSource;
  /** Confidence score 0-1 */
  readonly confidence: number;
  /** Additional metadata */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

// =============================================================================
// Evidence Types
// =============================================================================

/**
 * Classification of evidence provider types.
 */
export type ProviderType = "diff" | "search" | "lsp";

/**
 * Provider-specific metadata attached to evidence items.
 */
export interface EvidenceMetadata {
  /** For diff: change type */
  readonly changeType?: "added" | "modified" | "deleted";
  /** For LSP: symbol kind */
  readonly symbolKind?: string;
  /** For search: match count */
  readonly matchCount?: number;
  /** Stack frame depth (0 = top) */
  readonly stackDepth?: number;
}

/**
 * A piece of evidence gathered by a provider.
 * Contains code context with scoring metadata.
 */
export interface Evidence {
  /** Unique identifier */
  readonly id: string;
  /** Source provider */
  readonly provider: ProviderType;
  /** File path */
  readonly path: string;
  /** Line range [start, end] (1-indexed) */
  readonly range: readonly [number, number];
  /** Code content */
  readonly content: string;
  /** Token count (cached) */
  readonly tokens: number;
  /** Base score from provider (before reranking) */
  readonly baseScore: number;
  /** Final score after reranking */
  readonly finalScore?: number;
  /** Signals that led to this evidence */
  readonly matchedSignals: readonly Signal[];
  /** Provider-specific metadata */
  readonly metadata?: EvidenceMetadata;
}

// =============================================================================
// Evidence Pack Types
// =============================================================================

/**
 * Project state summary for context injection.
 * Captures current goal, constraints, facts, decisions, questions, and next actions.
 */
export interface ProjectSummary {
  /** Current goal/objective */
  readonly goal?: string;
  /** Known constraints */
  readonly constraints: readonly string[];
  /** Established facts */
  readonly facts: readonly string[];
  /** Decisions made */
  readonly decisions: readonly string[];
  /** Open questions */
  readonly questions: readonly string[];
  /** Planned next actions */
  readonly nextActions: readonly string[];
  /** Token count */
  readonly tokens: number;
}

/**
 * Entry representing a file in the working set.
 */
export interface WorkingSetEntry {
  /** File path */
  readonly path: string;
  /** Whether file has unsaved changes */
  readonly isDirty: boolean;
  /** Last modified timestamp */
  readonly lastModified: number;
  /** Token count for this entry */
  readonly tokens: number;
  /** Optional content preview */
  readonly preview?: string;
}

/**
 * Telemetry data for tracking evidence pack generation.
 */
export interface EvidenceTelemetry {
  /** Time taken to extract signals (ms) */
  readonly signalExtractionMs: number;
  /** Time taken by each provider (ms) */
  readonly providerTimings: Readonly<Record<ProviderType, number>>;
  /** Time taken to rerank evidence (ms) */
  readonly rerankMs: number;
  /** Total build time (ms) */
  readonly totalMs: number;
  /** Number of signals extracted */
  readonly signalCount: number;
  /** Number of evidence items before budget filtering */
  readonly evidenceCountBeforeBudget: number;
  /** Number of evidence items after budget filtering */
  readonly evidenceCountAfterBudget: number;
  /** Tokens saved by budget filtering */
  readonly tokensSaved: number;
}

/**
 * Complete evidence pack ready for context injection.
 */
export interface EvidencePack {
  /** Project state summary */
  readonly summary: ProjectSummary;
  /** Currently active files */
  readonly workingSet: readonly WorkingSetEntry[];
  /** Ranked and budgeted evidence items */
  readonly evidence: readonly Evidence[];
  /** Total tokens in pack */
  readonly totalTokens: number;
  /** Budget utilization (0-1) */
  readonly budgetUsed: number;
  /** Telemetry data for tracking */
  readonly telemetry: EvidenceTelemetry;
}

// =============================================================================
// Provider Interface Types
// =============================================================================

/**
 * Options for querying evidence providers.
 */
export interface ProviderQueryOptions {
  /** Maximum evidence items to return */
  readonly maxResults?: number;
  /** Maximum tokens to return */
  readonly maxTokens?: number;
  /** File patterns to include */
  readonly includePatterns?: readonly string[];
  /** File patterns to exclude */
  readonly excludePatterns?: readonly string[];
  /** Context lines around matches */
  readonly contextLines?: number;
}

/**
 * Evidence provider interface.
 * Each provider queries a specific data source.
 */
export interface EvidenceProvider {
  /** Provider type identifier */
  readonly type: ProviderType;
  /** Human-readable name */
  readonly name: string;
  /** Base score weight for this provider */
  readonly baseWeight: number;

  /**
   * Query for evidence matching the given signals.
   * @param signals - Signals to search for
   * @param options - Query options (limits, filters)
   * @returns Array of evidence items
   */
  query(signals: readonly Signal[], options?: ProviderQueryOptions): Promise<Evidence[]>;

  /**
   * Check if provider is available (dependencies ready).
   * @returns True if provider can be used
   */
  isAvailable(): Promise<boolean>;
}
