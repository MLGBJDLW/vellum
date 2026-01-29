/**
 * SearchProvider Unit Tests
 *
 * Tests for the Code Search Evidence Provider.
 *
 * @module context/evidence/providers/__tests__/search-provider.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  SearchFacade,
  SearchMatch,
  SearchOptions,
  SearchResult,
  SearchStats,
} from "../../../../builtin/search/index.js";
import type { Signal } from "../../types.js";
import { SearchProvider, type SearchProviderConfig } from "../search-provider.js";

// =============================================================================
// Mock Helpers
// =============================================================================

/**
 * Creates a mock SearchFacade with configurable behavior.
 */
function createMockSearchFacade(overrides: Partial<SearchFacade> = {}): SearchFacade {
  return {
    search: vi.fn().mockResolvedValue({
      matches: [],
      truncated: false,
      stats: {
        filesSearched: 0,
        matchCount: 0,
        duration: 10,
        backend: "ripgrep",
      },
    } as SearchResult),
    searchWithBackend: vi.fn().mockResolvedValue({
      matches: [],
      truncated: false,
      stats: {
        filesSearched: 0,
        matchCount: 0,
        duration: 10,
        backend: "ripgrep",
      },
    } as SearchResult),
    getAvailableBackends: vi.fn().mockResolvedValue(["ripgrep", "git-grep"]),
    getAllBackends: vi.fn().mockReturnValue(["ripgrep", "git-grep", "javascript"]),
    isBackendAvailable: vi.fn().mockResolvedValue(true),
    getBestBackendName: vi.fn().mockResolvedValue("ripgrep"),
    clearCache: vi.fn(),
    ...overrides,
  } as unknown as SearchFacade;
}

/**
 * Creates a mock SearchMatch for testing.
 */
function createMockSearchMatch(
  file: string,
  line: number,
  content: string,
  options: {
    column?: number;
    context?: { before: string[]; after: string[] };
  } = {}
): SearchMatch {
  return {
    file,
    line,
    column: options.column ?? 1,
    content,
    context: options.context,
  };
}

/**
 * Creates a mock SearchResult for testing.
 */
function createMockSearchResult(
  matches: SearchMatch[],
  options: {
    truncated?: boolean;
    stats?: Partial<SearchStats>;
  } = {}
): SearchResult {
  return {
    matches,
    truncated: options.truncated ?? false,
    stats: {
      filesSearched: matches.length,
      matchCount: matches.length,
      duration: 10,
      backend: "ripgrep",
      ...options.stats,
    },
  };
}

/**
 * Creates a mock Signal for testing.
 */
function createMockSignal(
  type: Signal["type"],
  value: string,
  options: Partial<Signal> = {}
): Signal {
  return {
    type,
    value,
    source: options.source ?? "user_message",
    confidence: options.confidence ?? 1.0,
    metadata: options.metadata,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe("SearchProvider", () => {
  let mockSearchFacade: SearchFacade;
  let provider: SearchProvider;
  const workspaceRoot = "/test/workspace";

  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchFacade = createMockSearchFacade();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("should create provider with required config", () => {
      const config: SearchProviderConfig = {
        workspaceRoot,
        searchFacade: mockSearchFacade,
      };
      provider = new SearchProvider(config);

      expect(provider.type).toBe("search");
      expect(provider.name).toBe("Code Search");
      expect(provider.baseWeight).toBe(10);
    });

    it("should accept include/exclude patterns", () => {
      const config: SearchProviderConfig = {
        workspaceRoot,
        searchFacade: mockSearchFacade,
        includePatterns: ["*.ts", "*.tsx"],
        excludePatterns: ["node_modules/"],
      };
      provider = new SearchProvider(config);

      expect(provider).toBeDefined();
    });
  });

  describe("isAvailable", () => {
    it("should return true when search backend available", async () => {
      mockSearchFacade = createMockSearchFacade({
        getAvailableBackends: vi.fn().mockResolvedValue(["ripgrep"]),
      });
      provider = new SearchProvider({
        workspaceRoot,
        searchFacade: mockSearchFacade,
      });

      const result = await provider.isAvailable();

      expect(result).toBe(true);
      expect(mockSearchFacade.getAvailableBackends).toHaveBeenCalled();
    });

    it("should return false when no backends available", async () => {
      mockSearchFacade = createMockSearchFacade({
        getAvailableBackends: vi.fn().mockResolvedValue([]),
      });
      provider = new SearchProvider({
        workspaceRoot,
        searchFacade: mockSearchFacade,
      });

      const result = await provider.isAvailable();

      expect(result).toBe(false);
    });

    it("should return false when getAvailableBackends throws", async () => {
      mockSearchFacade = createMockSearchFacade({
        getAvailableBackends: vi.fn().mockRejectedValue(new Error("Failed")),
      });
      provider = new SearchProvider({
        workspaceRoot,
        searchFacade: mockSearchFacade,
      });

      const result = await provider.isAvailable();

      expect(result).toBe(false);
    });
  });

  describe("query", () => {
    beforeEach(() => {
      mockSearchFacade = createMockSearchFacade();
      provider = new SearchProvider({
        workspaceRoot,
        searchFacade: mockSearchFacade,
      });
    });

    it("should return empty array when no searchable signals", async () => {
      // Path signals are not directly searchable by SearchProvider
      const signals: Signal[] = [createMockSignal("path", "src/index.ts")];

      const result = await provider.query(signals);

      expect(result).toEqual([]);
      expect(mockSearchFacade.search).not.toHaveBeenCalled();
    });

    it("should search for symbol signals", async () => {
      const matches = [
        createMockSearchMatch("src/utils.ts", 10, "function calculateSum(a, b) {"),
        createMockSearchMatch("src/math.ts", 5, "export { calculateSum }"),
      ];
      mockSearchFacade.search = vi.fn().mockResolvedValue(createMockSearchResult(matches));

      const signals: Signal[] = [createMockSignal("symbol", "calculateSum")];
      const result = await provider.query(signals);

      expect(mockSearchFacade.search).toHaveBeenCalled();
      const searchCall = vi.mocked(mockSearchFacade.search).mock.calls[0];
      const searchOptions = searchCall?.[0] as SearchOptions | undefined;

      // Should use word-boundary regex for symbols
      expect(searchOptions?.query).toContain("calculateSum");
      expect(searchOptions?.mode).toBe("regex");
      expect(searchOptions?.caseSensitive).toBe(true);

      // Should return evidence items
      expect(result.length).toBeGreaterThan(0);
    });

    it("should search for error tokens", async () => {
      const matches = [
        createMockSearchMatch("src/api.ts", 25, 'throw new Error("connection timeout")'),
      ];
      mockSearchFacade.search = vi.fn().mockResolvedValue(createMockSearchResult(matches));

      const signals: Signal[] = [createMockSignal("error_token", "timeout")];
      const result = await provider.query(signals);

      expect(mockSearchFacade.search).toHaveBeenCalled();
      const searchCall = vi.mocked(mockSearchFacade.search).mock.calls[0];
      const searchOptions = searchCall?.[0] as SearchOptions | undefined;

      // Error tokens are case-insensitive
      expect(searchOptions?.caseSensitive).toBe(false);

      expect(result.length).toBe(1);
    });

    it("should skip very short symbols", async () => {
      const signals: Signal[] = [createMockSignal("symbol", "x")]; // Too short

      const result = await provider.query(signals);

      expect(result).toEqual([]);
      expect(mockSearchFacade.search).not.toHaveBeenCalled();
    });

    it("should skip very short error tokens", async () => {
      const signals: Signal[] = [createMockSignal("error_token", "ab")]; // Too short

      const result = await provider.query(signals);

      expect(result).toEqual([]);
      expect(mockSearchFacade.search).not.toHaveBeenCalled();
    });

    it("should respect token budget", async () => {
      // Create matches with substantial content
      const longContent = "x".repeat(500);
      const matches = Array.from({ length: 10 }, (_, i) =>
        createMockSearchMatch(`src/file${i}.ts`, i + 1, longContent)
      );
      mockSearchFacade.search = vi.fn().mockResolvedValue(createMockSearchResult(matches));

      const signals: Signal[] = [createMockSignal("symbol", "someFunction")];
      const result = await provider.query(signals, { maxTokens: 50 });

      // Should limit results based on token budget
      expect(result.length).toBeLessThan(10);
    });

    it("should respect maxResults option", async () => {
      const matches = Array.from({ length: 10 }, (_, i) =>
        createMockSearchMatch(`src/file${i}.ts`, i + 1, `match ${i}`)
      );
      mockSearchFacade.search = vi.fn().mockResolvedValue(createMockSearchResult(matches));

      const signals: Signal[] = [createMockSignal("symbol", "match")];
      const result = await provider.query(signals, { maxResults: 3 });

      expect(result.length).toBeLessThanOrEqual(3);
    });

    it("should deduplicate matches by path:range", async () => {
      // Same file and line from two different signal searches
      const matches = [
        createMockSearchMatch("src/utils.ts", 10, "function foo() {}"),
        createMockSearchMatch("src/utils.ts", 10, "function foo() {}"),
      ];
      mockSearchFacade.search = vi.fn().mockResolvedValue(createMockSearchResult(matches));

      const signals: Signal[] = [
        createMockSignal("symbol", "foo"),
        createMockSignal("symbol", "function"),
      ];
      const result = await provider.query(signals);

      // Should deduplicate
      const uniquePaths = new Set(result.map((e) => `${e.path}:${e.range[0]}`));
      expect(uniquePaths.size).toBe(result.length);
    });

    it("should handle search errors gracefully", async () => {
      mockSearchFacade.search = vi
        .fn()
        .mockRejectedValueOnce(new Error("Search failed"))
        .mockResolvedValueOnce(
          createMockSearchResult([createMockSearchMatch("src/valid.ts", 1, "valid result")])
        );

      const signals: Signal[] = [
        createMockSignal("symbol", "failingSearch"),
        createMockSignal("symbol", "validSearch"),
      ];
      const result = await provider.query(signals);

      // Should continue with other signals after error
      expect(result.length).toBeGreaterThan(0);
    });

    it("should create evidence with correct structure", async () => {
      const matches = [
        createMockSearchMatch("src/index.ts", 42, "export const value = 123;", {
          context: {
            before: ["// comment"],
            after: ["// another comment"],
          },
        }),
      ];
      mockSearchFacade.search = vi.fn().mockResolvedValue(createMockSearchResult(matches));

      const signals: Signal[] = [createMockSignal("symbol", "value")];
      const result = await provider.query(signals);

      expect(result.length).toBe(1);
      const evidence = result[0];
      expect(evidence?.id).toBeDefined();
      expect(evidence?.provider).toBe("search");
      expect(evidence?.path).toBe("src/index.ts");
      expect(evidence?.content).toContain("export const value = 123;");
      expect(evidence?.matchedSignals).toContainEqual(
        expect.objectContaining({ type: "symbol", value: "value" })
      );
    });

    it("should apply include patterns to search", async () => {
      provider = new SearchProvider({
        workspaceRoot,
        searchFacade: mockSearchFacade,
        includePatterns: ["*.ts"],
      });
      mockSearchFacade.search = vi.fn().mockResolvedValue(createMockSearchResult([]));

      const signals: Signal[] = [createMockSignal("symbol", "test")];
      await provider.query(signals);

      expect(mockSearchFacade.search).toHaveBeenCalled();
      const searchCall = vi.mocked(mockSearchFacade.search).mock.calls[0];
      const searchOptions = searchCall?.[0] as SearchOptions | undefined;
      expect(searchOptions?.globs).toContain("*.ts");
    });

    it("should apply exclude patterns to search", async () => {
      provider = new SearchProvider({
        workspaceRoot,
        searchFacade: mockSearchFacade,
        excludePatterns: ["node_modules/**"],
      });
      mockSearchFacade.search = vi.fn().mockResolvedValue(createMockSearchResult([]));

      const signals: Signal[] = [createMockSignal("symbol", "test")];
      await provider.query(signals);

      expect(mockSearchFacade.search).toHaveBeenCalled();
      const searchCall = vi.mocked(mockSearchFacade.search).mock.calls[0];
      const searchOptions = searchCall?.[0] as SearchOptions | undefined;
      expect(searchOptions?.excludes).toContain("node_modules/**");
    });

    it("should escape regex special characters in search", async () => {
      mockSearchFacade.search = vi.fn().mockResolvedValue(createMockSearchResult([]));

      // Symbol with regex special characters
      const signals: Signal[] = [createMockSignal("symbol", "Array.from")];
      await provider.query(signals);

      expect(mockSearchFacade.search).toHaveBeenCalled();
      const searchCall = vi.mocked(mockSearchFacade.search).mock.calls[0];
      const searchOptions = searchCall?.[0] as SearchOptions | undefined;
      // Should escape the dot
      expect(searchOptions?.query).toContain("Array\\.from");
    });

    it("should sort results by score descending", async () => {
      const matches = [
        createMockSearchMatch("src/low.ts", 1, "low priority"),
        createMockSearchMatch("src/high.ts", 1, "high priority match match match"),
      ];
      mockSearchFacade.search = vi.fn().mockResolvedValue(createMockSearchResult(matches));

      const signals: Signal[] = [createMockSignal("symbol", "priority")];
      const result = await provider.query(signals);

      // Results should be sorted by score
      if (result.length >= 2) {
        const r0 = result[0];
        const r1 = result[1];
        if (r0 && r1) {
          expect(r0.baseScore).toBeGreaterThanOrEqual(r1.baseScore);
        }
      }
    });
  });
});
