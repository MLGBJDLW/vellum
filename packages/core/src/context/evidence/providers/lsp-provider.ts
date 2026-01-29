/**
 * LspProvider - LSP Analysis Evidence Provider
 *
 * Provides evidence from LSP by wrapping the LspHub service.
 * Supports definitions (baseWeight=60) and references (weight=30).
 *
 * @packageDocumentation
 * @module context/evidence/providers
 */

import { createId } from "@vellum/shared";
import type {
  Evidence,
  EvidenceMetadata,
  EvidenceProvider,
  ProviderQueryOptions,
  Signal,
} from "../types.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Minimal interface for LSP Location objects.
 * Based on vscode-languageserver-protocol Location type.
 */
interface LspLocation {
  uri: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

/**
 * Interface for LspHub-like objects.
 * Allows runtime injection of the actual LspHub instance.
 */
interface LspHubLike {
  /** Check if LSP is initialized */
  isInitialized?(): boolean;
  /** Find symbol definitions */
  definition(filePath: string, line: number, character: number): Promise<unknown[]>;
  /** Find symbol references */
  references(
    filePath: string,
    line: number,
    character: number,
    includeDeclaration?: boolean
  ): Promise<unknown[]>;
  /** Get document symbols */
  documentSymbols?(filePath: string): Promise<unknown[]>;
}

// =============================================================================
// Configuration
// =============================================================================

/**
 * Configuration for the LspProvider.
 */
export interface LspProviderConfig {
  /** LSP hub or client instance (optional, allows runtime injection) */
  readonly lspHub?: LspHubLike;
  /** Workspace root path */
  readonly workspaceRoot: string;
  /** Definition query timeout in ms (default: 5000) */
  readonly definitionTimeout?: number;
  /** Reference query timeout in ms (default: 10000) */
  readonly referenceTimeout?: number;
}

// =============================================================================
// Constants
// =============================================================================

/** Base weight for definition evidence */
const DEFINITION_WEIGHT = 60;

/** Weight for reference evidence */
const REFERENCE_WEIGHT = 30;

/** Default definition query timeout */
const DEFAULT_DEFINITION_TIMEOUT = 5000;

/** Default reference query timeout */
const DEFAULT_REFERENCE_TIMEOUT = 10000;

/** Approximate tokens per character (conservative estimate) */
const TOKENS_PER_CHAR = 0.25;

/** Context lines to extract around LSP results */
const DEFAULT_CONTEXT_LINES = 5;

// =============================================================================
// LspProvider Implementation
// =============================================================================

/**
 * Evidence provider that extracts relevant code via LSP queries.
 *
 * Integrates with LspHub to provide evidence from:
 * - Definitions: High confidence, where symbols are defined (weight=60)
 * - References: Medium confidence, where symbols are used (weight=30)
 *
 * Gracefully degrades when LSP is unavailable.
 *
 * @example
 * ```typescript
 * const provider = new LspProvider({
 *   workspaceRoot: '/path/to/project',
 *   lspHub: myLspHubInstance,
 * });
 *
 * const evidence = await provider.query(signals, { maxResults: 10 });
 * ```
 */
export class LspProvider implements EvidenceProvider {
  readonly type = "lsp" as const;
  readonly name = "LSP Analysis";
  readonly baseWeight = DEFINITION_WEIGHT; // Definition weight (reference = 30)

  // Reserved for future path resolution
  // @ts-expect-error Reserved for future use
  private readonly workspaceRoot: string;
  private readonly definitionTimeout: number;
  private readonly referenceTimeout: number;
  private lspHub: LspHubLike | undefined;

  /**
   * Creates a new LspProvider instance.
   *
   * @param config - Provider configuration
   */
  constructor(config: LspProviderConfig) {
    this.workspaceRoot = config.workspaceRoot;
    this.definitionTimeout = config.definitionTimeout ?? DEFAULT_DEFINITION_TIMEOUT;
    this.referenceTimeout = config.referenceTimeout ?? DEFAULT_REFERENCE_TIMEOUT;
    this.lspHub = config.lspHub;
  }

  /**
   * Sets the LSP hub instance at runtime.
   * Allows late binding when LSP becomes available.
   *
   * @param hub - The LspHub instance
   */
  setLspHub(hub: LspHubLike): void {
    this.lspHub = hub;
  }

  /**
   * Checks if the provider is available.
   * Provider is available only if lspHub is injected.
   *
   * @returns True if LSP hub is available
   */
  async isAvailable(): Promise<boolean> {
    if (!this.lspHub) {
      return false;
    }

    // If the hub has an isInitialized method, use it
    if (typeof this.lspHub.isInitialized === "function") {
      return this.lspHub.isInitialized();
    }

    // Otherwise assume it's available if it exists
    return true;
  }

  /**
   * Queries for evidence matching the given signals.
   *
   * @param signals - Signals to search for via LSP
   * @param options - Query options (limits, filters)
   * @returns Array of evidence items from LSP analysis
   */
  async query(signals: readonly Signal[], options?: ProviderQueryOptions): Promise<Evidence[]> {
    // No LSP hub means no evidence
    if (!this.lspHub) {
      return [];
    }

    // Extract symbol signals (LSP works best with symbols)
    const symbolSignals = signals.filter((s) => s.type === "symbol");
    const stackFrameSignals = signals.filter((s) => s.type === "stack_frame");

    // Combine symbol-like signals
    const relevantSignals = [...symbolSignals, ...stackFrameSignals];
    if (relevantSignals.length === 0) {
      return [];
    }

    const evidence: Evidence[] = [];
    const maxResults = options?.maxResults ?? 50;

    // Process each symbol signal
    for (const signal of relevantSignals) {
      if (evidence.length >= maxResults) {
        break;
      }

      try {
        // Get definitions for this symbol
        const definitionEvidence = await this.queryDefinitions(signal, options);
        evidence.push(...definitionEvidence);

        // Get references for this symbol
        const referenceEvidence = await this.queryReferences(signal, options);
        evidence.push(...referenceEvidence);
      } catch {}
    }

    // Deduplicate by path+range
    const deduped = this.deduplicateEvidence(evidence);

    // Apply limits
    const limited = deduped.slice(0, maxResults);

    // Apply token budget if specified
    if (options?.maxTokens) {
      return this.applyTokenBudget(limited, options.maxTokens);
    }

    return limited;
  }

  /**
   * Query definitions for a symbol signal.
   */
  private async queryDefinitions(
    signal: Signal,
    options?: ProviderQueryOptions
  ): Promise<Evidence[]> {
    if (!this.lspHub) {
      return [];
    }

    // Symbol signals may have metadata with location info
    const metadata = signal.metadata as
      | { path?: string; line?: number; character?: number }
      | undefined;

    // If we have position info, use it directly
    if (metadata?.path && typeof metadata?.line === "number") {
      return this.queryDefinitionAtPosition(
        signal,
        metadata.path,
        metadata.line,
        metadata.character ?? 0,
        options
      );
    }

    // Otherwise, return empty (would need workspace symbol search which is expensive)
    return [];
  }

  /**
   * Query definition at a specific position.
   */
  private async queryDefinitionAtPosition(
    signal: Signal,
    filePath: string,
    line: number,
    character: number,
    options?: ProviderQueryOptions
  ): Promise<Evidence[]> {
    if (!this.lspHub) {
      return [];
    }

    try {
      const results = await this.withTimeout(
        this.lspHub.definition(filePath, line, character),
        this.definitionTimeout
      );

      const locations = results as LspLocation[];
      return this.locationsToEvidence(locations, signal, "definition", DEFINITION_WEIGHT, options);
    } catch {
      return [];
    }
  }

  /**
   * Query references for a symbol signal.
   */
  private async queryReferences(
    signal: Signal,
    options?: ProviderQueryOptions
  ): Promise<Evidence[]> {
    if (!this.lspHub) {
      return [];
    }

    // Symbol signals may have metadata with location info
    const metadata = signal.metadata as
      | { path?: string; line?: number; character?: number }
      | undefined;

    // If we have position info, use it directly
    if (metadata?.path && typeof metadata?.line === "number") {
      return this.queryReferencesAtPosition(
        signal,
        metadata.path,
        metadata.line,
        metadata.character ?? 0,
        options
      );
    }

    return [];
  }

  /**
   * Query references at a specific position.
   */
  private async queryReferencesAtPosition(
    signal: Signal,
    filePath: string,
    line: number,
    character: number,
    options?: ProviderQueryOptions
  ): Promise<Evidence[]> {
    if (!this.lspHub) {
      return [];
    }

    try {
      const results = await this.withTimeout(
        this.lspHub.references(filePath, line, character, false),
        this.referenceTimeout
      );

      const locations = results as LspLocation[];
      return this.locationsToEvidence(locations, signal, "reference", REFERENCE_WEIGHT, options);
    } catch {
      return [];
    }
  }

  /**
   * Convert LSP locations to evidence items.
   */
  private locationsToEvidence(
    locations: LspLocation[],
    signal: Signal,
    kind: "definition" | "reference",
    weight: number,
    options?: ProviderQueryOptions
  ): Evidence[] {
    const evidence: Evidence[] = [];
    const contextLines = options?.contextLines ?? DEFAULT_CONTEXT_LINES;

    for (const location of locations) {
      // Extract file path from URI
      const path = this.uriToPath(location.uri);
      if (!path) {
        continue;
      }

      // Check include/exclude patterns
      if (options?.includePatterns && !this.matchesPatterns(path, options.includePatterns)) {
        continue;
      }

      if (options?.excludePatterns && this.matchesPatterns(path, options.excludePatterns)) {
        continue;
      }

      // Calculate line range (1-indexed)
      const startLine = Math.max(1, location.range.start.line + 1 - contextLines);
      const endLine = location.range.end.line + 1 + contextLines;

      // Create evidence item
      // Note: We don't have the actual content here - the evidence collector
      // will need to read the file to get content. We use a placeholder.
      const contentPlaceholder = `[LSP ${kind}: ${signal.value}]`;
      const tokens = Math.ceil(contentPlaceholder.length * TOKENS_PER_CHAR);

      const metadata: EvidenceMetadata = {
        symbolKind: kind,
      };

      evidence.push({
        id: createId(),
        provider: "lsp",
        path,
        range: [startLine, endLine],
        content: contentPlaceholder,
        tokens,
        baseScore: weight * signal.confidence,
        matchedSignals: [signal],
        metadata,
      });
    }

    return evidence;
  }

  /**
   * Convert URI to file path.
   */
  private uriToPath(uri: string): string | null {
    try {
      // Handle file:// URIs
      if (uri.startsWith("file://")) {
        const url = new URL(uri);
        return url.pathname;
      }
      // Handle plain paths
      return uri;
    } catch {
      return null;
    }
  }

  /**
   * Execute a promise with timeout.
   */
  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`LSP query timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  /**
   * Check if a path matches any of the given patterns.
   */
  private matchesPatterns(filePath: string, patterns: readonly string[]): boolean {
    const normalizedPath = filePath.replace(/\\/g, "/").toLowerCase();

    for (const pattern of patterns) {
      const normalizedPattern = pattern.replace(/\\/g, "/").toLowerCase();

      // Simple glob-like matching
      if (normalizedPattern.startsWith("*")) {
        const suffix = normalizedPattern.slice(1);
        if (normalizedPath.endsWith(suffix)) {
          return true;
        }
      } else if (normalizedPattern.endsWith("*")) {
        const prefix = normalizedPattern.slice(0, -1);
        if (normalizedPath.startsWith(prefix)) {
          return true;
        }
      } else if (normalizedPath.includes(normalizedPattern)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Deduplicate evidence by path and range.
   */
  private deduplicateEvidence(evidence: Evidence[]): Evidence[] {
    const seen = new Set<string>();
    const result: Evidence[] = [];

    for (const item of evidence) {
      const key = `${item.path}:${item.range[0]}-${item.range[1]}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(item);
      }
    }

    return result;
  }

  /**
   * Apply token budget to evidence array.
   */
  private applyTokenBudget(evidence: Evidence[], maxTokens: number): Evidence[] {
    const result: Evidence[] = [];
    let totalTokens = 0;

    for (const item of evidence) {
      if (totalTokens + item.tokens > maxTokens) {
        break;
      }
      result.push(item);
      totalTokens += item.tokens;
    }

    return result;
  }
}
