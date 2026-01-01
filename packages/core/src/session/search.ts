// ============================================
// Search Service
// ============================================

/**
 * Full-text search service for session discovery.
 *
 * Uses MiniSearch for efficient full-text indexing and search
 * across session titles, summaries, tags, and message content.
 *
 * @module @vellum/core/session/search
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import MiniSearch, { type SearchResult as MiniSearchResult } from "minisearch";
import type { StorageManager } from "./storage.js";
import type { Session, SessionMetadata } from "./types.js";

// =============================================================================
// Constants
// =============================================================================

/** Default name for the search index file */
const DEFAULT_INDEX_FILE = "search-index.json";

/** Maximum content length to index per session (characters) */
const MAX_CONTENT_LENGTH = 50000;

/** Maximum tool output length to include (characters) */
const MAX_TOOL_OUTPUT_LENGTH = 500;

/** Default search result limit */
const DEFAULT_SEARCH_LIMIT = 10;

/** Maximum search results to prevent memory issues */
const MAX_SEARCH_RESULTS = 100;

/** Snippet context length (characters before/after match) */
const SNIPPET_CONTEXT_LENGTH = 50;

/** Recency boost factor (applied to sessions from last 7 days) */
const RECENCY_BOOST_FACTOR = 1.1;

// =============================================================================
// Search Document Type
// =============================================================================

/**
 * Document structure for MiniSearch indexing.
 *
 * Contains all searchable fields extracted from a session.
 */
export interface SearchDocument {
  /** Session ID (unique identifier) */
  id: string;
  /** Session title */
  title: string;
  /** Session summary (AI-generated) */
  summary: string;
  /** Tags as space-separated string for tokenization */
  tags: string;
  /** Extracted message content */
  content: string;
  /** Session creation timestamp */
  createdAt: number;
}

// =============================================================================
// Search Result Type
// =============================================================================

/**
 * Search result with session metadata.
 *
 * @remarks
 * Represents a session that matched a search query, including
 * relevance scoring and matched term information.
 */
export interface SessionSearchHit {
  /** Session ID */
  sessionId: string;
  /** Session title */
  title: string;
  /** Search relevance score */
  score: number;
  /** Matched terms from the query */
  matches: string[];
  /** Context snippet around the match (when available) */
  snippet?: string;
}

/**
 * Extended search result with additional metadata.
 *
 * @remarks
 * Provides more detailed information including field-level
 * match information for advanced use cases.
 */
export interface SessionSearchResult {
  /** Session ID */
  id: string;
  /** Session title */
  title: string;
  /** Creation timestamp */
  createdAt: Date;
  /** Search relevance score */
  score: number;
  /** Matched terms */
  terms: string[];
  /** Match information by field */
  match: { [term: string]: string[] };
}

/**
 * Search options for customizing search behavior.
 */
export interface SearchOptions {
  /** Maximum number of results (default: 10, max: 100) */
  limit?: number;
  /** Enable fuzzy matching for typo tolerance (default: true) */
  fuzzy?: boolean;
  /** Enable prefix matching for partial terms (default: true) */
  prefix?: boolean;
  /** Fields to search (defaults to all) */
  fields?: string[];
}

// =============================================================================
// MiniSearch Configuration
// =============================================================================

/**
 * MiniSearch options for session indexing.
 *
 * Configured for:
 * - Full-text search on title, summary, tags, content
 * - Stored fields for result display
 * - Prefix search for partial matching
 * - Fuzzy search for typo tolerance
 */
const MINISEARCH_OPTIONS = {
  fields: ["title", "summary", "tags", "content"] as string[],
  storeFields: ["id", "title", "createdAt"] as string[],
  idField: "id" as const,
  searchOptions: {
    prefix: true,
    fuzzy: 0.2,
    boost: {
      title: 3,
      summary: 2,
      tags: 2,
      content: 1,
    },
  },
};

// =============================================================================
// SearchService Class
// =============================================================================

/**
 * Service for full-text search across sessions.
 *
 * Provides efficient session discovery through MiniSearch-powered
 * full-text indexing. Indexes session titles, summaries, tags, and
 * message content for comprehensive search.
 *
 * @example
 * ```typescript
 * const search = new SearchService(storage);
 * await search.initialize();
 *
 * // Index a session
 * await search.indexSession(session);
 *
 * // Search for sessions
 * const results = search.search('typescript refactoring');
 * ```
 */
export class SearchService {
  /** Storage manager for session access */
  private readonly storage: StorageManager;

  /** Path to the search index file */
  private readonly indexPath: string;

  /** MiniSearch instance */
  private index: MiniSearch<SearchDocument>;

  /** Whether the service has been initialized */
  private initialized = false;

  /**
   * Creates a new SearchService.
   *
   * @param storage - Storage manager for session access
   * @param indexPath - Optional custom path for the search index file
   */
  constructor(storage: StorageManager, indexPath?: string) {
    this.storage = storage;
    this.indexPath = indexPath ?? path.join(storage.getConfig().basePath, DEFAULT_INDEX_FILE);
    this.index = new MiniSearch<SearchDocument>(MINISEARCH_OPTIONS);
  }

  // ===========================================================================
  // Initialization
  // ===========================================================================

  /**
   * Initializes the search service.
   *
   * Loads the existing index from disk if available, or creates
   * a new empty index. Should be called before any search operations.
   *
   * @example
   * ```typescript
   * const search = new SearchService(storage);
   * await search.initialize();
   * // Service is now ready for use
   * ```
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.loadIndex();
    this.initialized = true;
  }

  /**
   * Checks if the service has been initialized.
   *
   * @returns True if initialized, false otherwise
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  // ===========================================================================
  // Index Operations
  // ===========================================================================

  /**
   * Indexes a session for search.
   *
   * Extracts searchable content from the session and adds/updates
   * it in the search index. Automatically persists the index to disk.
   *
   * @param session - Session to index
   *
   * @example
   * ```typescript
   * await search.indexSession(session);
   * ```
   */
  async indexSession(session: Session): Promise<void> {
    this.ensureInitialized();

    const document = this.extractSearchDocument(session);

    // Remove existing entry if present (update case)
    if (this.index.has(session.metadata.id)) {
      this.index.discard(session.metadata.id);
    }

    this.index.add(document);
    await this.saveIndex();
  }

  /**
   * Removes a session from the search index.
   *
   * @param sessionId - ID of the session to remove
   *
   * @example
   * ```typescript
   * await search.removeFromIndex('session-123');
   * ```
   */
  async removeFromIndex(sessionId: string): Promise<void> {
    this.ensureInitialized();

    if (this.index.has(sessionId)) {
      this.index.discard(sessionId);
      await this.saveIndex();
    }
  }

  /**
   * Rebuilds the entire search index from storage.
   *
   * Clears the existing index and re-indexes all sessions.
   * Useful for recovering from index corruption or after
   * significant schema changes.
   *
   * @example
   * ```typescript
   * await search.rebuildIndex();
   * ```
   */
  async rebuildIndex(): Promise<void> {
    this.ensureInitialized();

    // Clear existing index
    this.index = new MiniSearch<SearchDocument>(MINISEARCH_OPTIONS);

    // Get all session metadata
    const index = await this.storage.getIndex();
    const documents: SearchDocument[] = [];

    // Load and extract documents for all sessions
    for (const [sessionId] of index) {
      try {
        const session = await this.storage.load(sessionId);
        if (session) {
          documents.push(this.extractSearchDocument(session));
        }
      } catch {
        // Skip sessions that fail to load
        console.warn(`Failed to load session ${sessionId} during rebuild`);
      }
    }

    // Bulk add all documents
    this.index.addAll(documents);
    await this.saveIndex();
  }

  // ===========================================================================
  // Search Operations
  // ===========================================================================

  /**
   * Searches for sessions matching the query.
   *
   * Performs full-text search across session titles, summaries,
   * tags, and message content. Supports prefix matching and
   * fuzzy search for typo tolerance.
   *
   * @param query - Search query string
   * @param options - Optional search options
   * @returns Array of search results sorted by relevance (score descending)
   *
   * @example
   * ```typescript
   * // Basic search
   * const results = search.search('typescript');
   *
   * // With options
   * const results = search.search('typescript', {
   *   limit: 10,
   *   fuzzy: true,
   *   prefix: true
   * });
   * ```
   */
  search(query: string, options?: SearchOptions): SessionSearchHit[] {
    this.ensureInitialized();

    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return [];
    }

    // Apply defaults and constraints
    const limit = Math.min(options?.limit ?? DEFAULT_SEARCH_LIMIT, MAX_SEARCH_RESULTS);
    const fuzzy = options?.fuzzy ?? true;
    const prefix = options?.prefix ?? true;

    const searchOptions: Parameters<typeof this.index.search>[1] = {
      prefix,
      fuzzy: fuzzy ? 0.2 : false,
      boost: {
        title: 3,
        summary: 2,
        tags: 2,
        content: 1,
      },
    };

    if (options?.fields) {
      searchOptions.fields = options.fields;
    }

    let results = this.index.search(trimmedQuery, searchOptions);

    // Apply recency boost to results from last 7 days
    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    results = results.map((result) => {
      const createdAt = result.createdAt as number;
      if (now - createdAt < sevenDaysMs) {
        return { ...result, score: result.score * RECENCY_BOOST_FACTOR };
      }
      return result;
    });

    // Re-sort by score after recency boost
    results.sort((a, b) => b.score - a.score);

    // Apply limit
    results = results.slice(0, limit);

    return results.map((result) => this.mapToSearchResult(result, trimmedQuery));
  }

  /**
   * Searches for sessions using the extended result format.
   *
   * Similar to `search()` but returns more detailed information
   * including field-level match data.
   *
   * @param query - Search query string
   * @param options - Optional search options
   * @returns Array of extended search results sorted by relevance
   *
   * @example
   * ```typescript
   * const results = search.searchExtended('typescript', { limit: 10 });
   * console.log(results[0].match); // { typescript: ['title', 'content'] }
   * ```
   */
  searchExtended(query: string, options?: SearchOptions): SessionSearchResult[] {
    this.ensureInitialized();

    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return [];
    }

    const limit = Math.min(options?.limit ?? DEFAULT_SEARCH_LIMIT, MAX_SEARCH_RESULTS);
    const fuzzy = options?.fuzzy ?? true;
    const prefix = options?.prefix ?? true;

    const searchOptions: Parameters<typeof this.index.search>[1] = {
      prefix,
      fuzzy: fuzzy ? 0.2 : false,
      boost: {
        title: 3,
        summary: 2,
        tags: 2,
        content: 1,
      },
    };

    if (options?.fields) {
      searchOptions.fields = options.fields;
    }

    let results = this.index.search(trimmedQuery, searchOptions);

    // Apply recency boost
    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    results = results.map((result) => {
      const createdAt = result.createdAt as number;
      if (now - createdAt < sevenDaysMs) {
        return { ...result, score: result.score * RECENCY_BOOST_FACTOR };
      }
      return result;
    });

    // Re-sort and limit
    results.sort((a, b) => b.score - a.score);
    results = results.slice(0, limit);

    return results.map((result) => this.mapSearchResult(result));
  }

  /**
   * Performs metadata-only search when full index is unavailable.
   *
   * Searches session titles and tags only using the storage index.
   * This is a fallback method for scenarios where the full-text
   * index cannot be loaded or built.
   *
   * @param query - Search query string
   * @param limit - Maximum number of results (default: 10)
   * @returns Array of matching session metadata sorted by relevance
   *
   * @example
   * ```typescript
   * // Use when full index is unavailable
   * const sessions = await search.simpleSearch('refactoring');
   * ```
   */
  async simpleSearch(query: string, limit = DEFAULT_SEARCH_LIMIT): Promise<SessionMetadata[]> {
    const trimmedQuery = query.trim().toLowerCase();
    if (!trimmedQuery) {
      return [];
    }

    const effectiveLimit = Math.min(limit, MAX_SEARCH_RESULTS);
    const terms = trimmedQuery.split(/\s+/).filter((t) => t.length > 0);

    // Get all session metadata from storage
    const index = await this.storage.getIndex();
    const results: Array<{ metadata: SessionMetadata; score: number }> = [];

    for (const [, metadata] of index) {
      const score = this.scoreMetadataMatch(metadata, terms);
      if (score > 0) {
        results.push({ metadata, score });
      }
    }

    // Sort by score descending, then by recency
    results.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return b.metadata.createdAt.getTime() - a.metadata.createdAt.getTime();
    });

    return results.slice(0, effectiveLimit).map((r) => r.metadata);
  }

  /**
   * Scores a metadata entry against search terms.
   *
   * @param metadata - Session metadata to score
   * @param terms - Search terms (lowercase)
   * @returns Score (0 if no match)
   */
  private scoreMetadataMatch(metadata: SessionMetadata, terms: string[]): number {
    const titleLower = metadata.title.toLowerCase();
    const tagsLower = metadata.tags.map((t) => t.toLowerCase());

    let score = 0;

    for (const term of terms) {
      score += this.scoreTitleMatch(titleLower, term);
      score += this.scoreTagsMatch(tagsLower, term);
    }

    if (score > 0) {
      score = this.applyRecencyBoost(score, metadata.createdAt);
    }

    return score;
  }

  /**
   * Scores a title match against a search term.
   *
   * @param titleLower - Lowercase title
   * @param term - Search term
   * @returns Score contribution
   */
  private scoreTitleMatch(titleLower: string, term: string): number {
    if (!titleLower.includes(term)) {
      return 0;
    }
    // Base score for title match + exact match bonus
    return titleLower === term ? 5 : 3;
  }

  /**
   * Scores tags match against a search term.
   *
   * @param tagsLower - Lowercase tags array
   * @param term - Search term
   * @returns Score contribution
   */
  private scoreTagsMatch(tagsLower: string[], term: string): number {
    let score = 0;
    for (const tag of tagsLower) {
      if (tag.includes(term)) {
        score += tag === term ? 3 : 2;
      }
    }
    return score;
  }

  /**
   * Applies recency boost if session is from last 7 days.
   *
   * @param score - Current score
   * @param createdAt - Session creation date
   * @returns Boosted score
   */
  private applyRecencyBoost(score: number, createdAt: Date): number {
    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    if (now - createdAt.getTime() < sevenDaysMs) {
      return score * RECENCY_BOOST_FACTOR;
    }
    return score;
  }

  /**
   * Searches within a specific field only.
   *
   * Useful for targeted searches like "search in titles only"
   * or "search in tags only".
   *
   * @param field - Field to search ('title', 'summary', 'tags', 'content')
   * @param query - Search query string
   * @param limit - Maximum number of results (default: 10)
   * @returns Array of search results
   *
   * @example
   * ```typescript
   * // Search only in titles
   * const results = search.searchByField('title', 'typescript');
   *
   * // Search only in tags
   * const results = search.searchByField('tags', 'refactoring');
   * ```
   */
  searchByField(field: string, query: string, limit = DEFAULT_SEARCH_LIMIT): SessionSearchHit[] {
    return this.search(query, {
      limit,
      fields: [field],
    });
  }

  /**
   * Gets auto-complete suggestions for a partial query.
   *
   * Useful for implementing search-as-you-type functionality
   * with term completion suggestions.
   *
   * @param partial - Partial query string to complete
   * @param limit - Maximum number of suggestions (default: 5)
   * @returns Array of suggested completion terms
   *
   * @example
   * ```typescript
   * const suggestions = search.suggestCompletions('type');
   * // => ['typescript', 'typings', 'type-check']
   * ```
   */
  suggestCompletions(partial: string, limit = 5): string[] {
    this.ensureInitialized();

    const trimmed = partial.trim();
    if (!trimmed) {
      return [];
    }

    const suggestions = this.index.autoSuggest(trimmed, {
      prefix: true,
      fuzzy: 0.2,
      boost: {
        title: 3,
        tags: 2,
      },
    });

    return suggestions.slice(0, limit).map((s) => s.suggestion);
  }

  /**
   * Gets auto-suggestions for a partial query.
   *
   * Useful for implementing search-as-you-type functionality.
   *
   * @param query - Partial query string
   * @param limit - Maximum number of suggestions (default: 5)
   * @returns Array of suggested search terms
   *
   * @example
   * ```typescript
   * const suggestions = search.suggest('type');
   * // => ['typescript', 'typings', 'type']
   * ```
   */
  suggest(query: string, limit = 5): string[] {
    this.ensureInitialized();

    if (!query.trim()) {
      return [];
    }

    const suggestions = this.index.autoSuggest(query, {
      prefix: true,
      fuzzy: 0.2,
    });

    return suggestions.slice(0, limit).map((s) => s.suggestion);
  }

  /**
   * Gets the number of indexed sessions.
   *
   * @returns Number of sessions in the index
   */
  get documentCount(): number {
    return this.index.documentCount;
  }

  // ===========================================================================
  // Index Persistence (Private)
  // ===========================================================================

  /**
   * Loads the search index from disk.
   *
   * Handles index corruption gracefully by starting with a fresh index.
   */
  private async loadIndex(): Promise<void> {
    try {
      const content = await fs.readFile(this.indexPath, "utf-8");
      const json = JSON.parse(content);

      // Validate basic structure
      if (typeof json !== "object" || json === null) {
        throw new Error("Invalid index format");
      }

      this.index = MiniSearch.loadJSON<SearchDocument>(content, MINISEARCH_OPTIONS);
    } catch (error) {
      // File doesn't exist or is corrupted - start fresh
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.warn(`Failed to load search index, starting fresh:`, error);
      }
      this.index = new MiniSearch<SearchDocument>(MINISEARCH_OPTIONS);
    }
  }

  /**
   * Saves the search index to disk.
   *
   * Uses atomic write pattern (write to temp, then rename).
   */
  private async saveIndex(): Promise<void> {
    const json = JSON.stringify(this.index);

    // Ensure directory exists
    const dir = path.dirname(this.indexPath);
    await fs.mkdir(dir, { recursive: true });

    // Write atomically
    const tempPath = `${this.indexPath}.tmp`;
    await fs.writeFile(tempPath, json, "utf-8");
    await fs.rename(tempPath, this.indexPath);
  }

  // ===========================================================================
  // Content Extraction (Private)
  // ===========================================================================

  /**
   * Extracts a searchable document from a session.
   *
   * @param session - Session to extract from
   * @returns Search document for indexing
   */
  private extractSearchDocument(session: Session): SearchDocument {
    return {
      id: session.metadata.id,
      title: session.metadata.title,
      summary: session.metadata.summary ?? "",
      tags: session.metadata.tags.join(" "),
      content: this.extractSessionContent(session),
      createdAt: session.metadata.createdAt.getTime(),
    };
  }

  /**
   * Extracts searchable text content from session messages.
   *
   * Includes user and assistant text, tool names, and summarized
   * tool outputs. Respects content length limits.
   *
   * @param session - Session to extract content from
   * @returns Concatenated searchable text
   */
  private extractSessionContent(session: Session): string {
    const parts: string[] = [];
    let totalLength = 0;

    for (const message of session.messages) {
      if (totalLength >= MAX_CONTENT_LENGTH) {
        break;
      }

      for (const part of message.parts) {
        if (totalLength >= MAX_CONTENT_LENGTH) {
          break;
        }

        let text = "";

        switch (part.type) {
          case "text":
            text = part.text;
            break;

          case "tool":
            // Include tool name for searchability
            text = part.name;
            break;

          case "tool_result": {
            // Summarize tool output
            const content =
              typeof part.content === "string" ? part.content : JSON.stringify(part.content);
            text = content.slice(0, MAX_TOOL_OUTPUT_LENGTH);
            break;
          }

          case "reasoning":
            // Include reasoning text
            text = part.text;
            break;

          // Skip images and files - not searchable as text
          case "image":
          case "file":
            break;
        }

        if (text) {
          const remaining = MAX_CONTENT_LENGTH - totalLength;
          const truncated = text.slice(0, remaining);
          parts.push(truncated);
          totalLength += truncated.length;
        }
      }
    }

    return parts.join(" ");
  }

  // ===========================================================================
  // Result Mapping (Private)
  // ===========================================================================

  /**
   * Maps a MiniSearch result to a SessionSearchHit.
   *
   * @param result - MiniSearch search result
   * @param query - Original search query (for snippet generation)
   * @returns Mapped search result
   */
  private mapToSearchResult(result: MiniSearchResult, query: string): SessionSearchHit {
    const title = (result.title as string) ?? "";

    return {
      sessionId: result.id as string,
      title,
      score: result.score,
      matches: result.terms,
      snippet: this.generateSnippet(title, query),
    };
  }

  /**
   * Maps a MiniSearch result to a SessionSearchResult.
   *
   * @param result - MiniSearch search result
   * @returns Mapped session search result
   */
  private mapSearchResult(result: MiniSearchResult): SessionSearchResult {
    return {
      id: result.id as string,
      title: (result.title as string) ?? "",
      createdAt: new Date((result.createdAt as number) ?? 0),
      score: result.score,
      terms: result.terms,
      match: result.match,
    };
  }

  /**
   * Generates a snippet with context around the matched term.
   *
   * @param text - Source text to extract snippet from
   * @param query - Search query containing terms to find
   * @returns Snippet with context around first match, or undefined if no match
   */
  private generateSnippet(text: string, query: string): string | undefined {
    if (!text || !query) {
      return undefined;
    }

    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 0);
    const textLower = text.toLowerCase();

    // Find first matching term position
    let matchIndex = -1;
    let matchedTerm = "";
    for (const term of terms) {
      const index = textLower.indexOf(term);
      if (index !== -1 && (matchIndex === -1 || index < matchIndex)) {
        matchIndex = index;
        matchedTerm = term;
      }
    }

    if (matchIndex === -1) {
      // No match found, return truncated text as fallback
      if (text.length > SNIPPET_CONTEXT_LENGTH * 2) {
        return `${text.slice(0, SNIPPET_CONTEXT_LENGTH * 2)}...`;
      }
      return text;
    }

    // Extract snippet with context
    const start = Math.max(0, matchIndex - SNIPPET_CONTEXT_LENGTH);
    const end = Math.min(text.length, matchIndex + matchedTerm.length + SNIPPET_CONTEXT_LENGTH);

    let snippet = text.slice(start, end);

    // Add ellipsis if truncated
    if (start > 0) {
      snippet = `...${snippet}`;
    }
    if (end < text.length) {
      snippet = `${snippet}...`;
    }

    return snippet;
  }

  // ===========================================================================
  // Validation (Private)
  // ===========================================================================

  /**
   * Ensures the service has been initialized.
   *
   * @throws Error if not initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error("SearchService not initialized. Call initialize() first.");
    }
  }
}
