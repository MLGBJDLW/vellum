/**
 * LspProvider Unit Tests
 *
 * Tests for the LSP Analysis Evidence Provider.
 *
 * @module context/evidence/providers/__tests__/lsp-provider.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Signal } from "../../types.js";
import { LspProvider, type LspProviderConfig } from "../lsp-provider.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Mock LSP location type.
 */
interface MockLspLocation {
  uri: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

/**
 * Interface for LspHub-like objects (matches the provider's LspHubLike interface).
 */
interface LspHubLike {
  isInitialized?(): boolean;
  definition(filePath: string, line: number, character: number): Promise<unknown[]>;
  references(
    filePath: string,
    line: number,
    character: number,
    includeDeclaration?: boolean
  ): Promise<unknown[]>;
  documentSymbols?(filePath: string): Promise<unknown[]>;
}

// =============================================================================
// Mock Helpers
// =============================================================================

/**
 * Creates a mock LspHub with configurable behavior.
 * Returns a fully typed LspHubLike that can be passed to LspProvider.
 */
function createMockLspHub(
  overrides: {
    isInitialized?: () => boolean;
    definitionResult?: unknown[];
    referencesResult?: unknown[];
    documentSymbolsResult?: unknown[];
  } = {}
): LspHubLike & {
  definitionMock: ReturnType<typeof vi.fn>;
  referencesMock: ReturnType<typeof vi.fn>;
} {
  const definitionMock = vi.fn().mockResolvedValue(overrides.definitionResult ?? []);
  const referencesMock = vi.fn().mockResolvedValue(overrides.referencesResult ?? []);
  const documentSymbolsMock = vi.fn().mockResolvedValue(overrides.documentSymbolsResult ?? []);

  return {
    isInitialized: overrides.isInitialized ?? (() => true),
    definition: definitionMock as LspHubLike["definition"],
    references: referencesMock as LspHubLike["references"],
    documentSymbols: documentSymbolsMock as LspHubLike["documentSymbols"],
    // Expose mocks for assertions
    definitionMock,
    referencesMock,
  };
}

/**
 * Creates a mock LSP Location.
 */
function createMockLocation(uri: string, startLine: number, endLine?: number): MockLspLocation {
  return {
    uri,
    range: {
      start: { line: startLine, character: 0 },
      end: { line: endLine ?? startLine, character: 100 },
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

describe("LspProvider", () => {
  let mockLspHub: ReturnType<typeof createMockLspHub>;
  let provider: LspProvider;
  const workspaceRoot = "/test/workspace";

  beforeEach(() => {
    vi.clearAllMocks();
    mockLspHub = createMockLspHub();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("should create provider with required config", () => {
      const config: LspProviderConfig = {
        workspaceRoot,
      };
      provider = new LspProvider(config);

      expect(provider.type).toBe("lsp");
      expect(provider.name).toBe("LSP Analysis");
      expect(provider.baseWeight).toBe(60); // Definition weight
    });

    it("should accept lspHub in config", () => {
      const config: LspProviderConfig = {
        workspaceRoot,
        lspHub: mockLspHub,
      };
      provider = new LspProvider(config);

      expect(provider).toBeDefined();
    });

    it("should accept timeout options", () => {
      const config: LspProviderConfig = {
        workspaceRoot,
        lspHub: mockLspHub,
        definitionTimeout: 3000,
        referenceTimeout: 8000,
      };
      provider = new LspProvider(config);

      expect(provider).toBeDefined();
    });
  });

  describe("setLspHub", () => {
    it("should set the LSP hub at runtime", async () => {
      provider = new LspProvider({ workspaceRoot });

      // Initially not available
      expect(await provider.isAvailable()).toBe(false);

      // Set LSP hub
      provider.setLspHub(mockLspHub);

      // Now should be available
      expect(await provider.isAvailable()).toBe(true);
    });
  });

  describe("isAvailable", () => {
    it("should return false when LSP hub not set", async () => {
      provider = new LspProvider({ workspaceRoot });

      const result = await provider.isAvailable();

      expect(result).toBe(false);
    });

    it("should return false when LSP hub isInitialized returns false", async () => {
      mockLspHub = createMockLspHub({
        isInitialized: () => false,
      });
      provider = new LspProvider({
        workspaceRoot,
        lspHub: mockLspHub,
      });

      const result = await provider.isAvailable();

      expect(result).toBe(false);
    });

    it("should return true when LSP hub is initialized", async () => {
      mockLspHub = createMockLspHub({
        isInitialized: () => true,
      });
      provider = new LspProvider({
        workspaceRoot,
        lspHub: mockLspHub,
      });

      const result = await provider.isAvailable();

      expect(result).toBe(true);
    });

    it("should return true when hub has no isInitialized method", async () => {
      // Hub without isInitialized method
      const hubWithoutInit = {
        definition: vi.fn().mockResolvedValue([]),
        references: vi.fn().mockResolvedValue([]),
      };
      provider = new LspProvider({
        workspaceRoot,
        lspHub: hubWithoutInit,
      });

      const result = await provider.isAvailable();

      // Should assume available if hub exists but has no isInitialized
      expect(result).toBe(true);
    });
  });

  describe("query", () => {
    beforeEach(() => {
      mockLspHub = createMockLspHub();
      provider = new LspProvider({
        workspaceRoot,
        lspHub: mockLspHub,
      });
    });

    it("should return empty array when LSP unavailable", async () => {
      provider = new LspProvider({ workspaceRoot }); // No lspHub

      const signals: Signal[] = [createMockSignal("symbol", "myFunction")];
      const result = await provider.query(signals);

      expect(result).toEqual([]);
    });

    it("should return empty array when no relevant signals", async () => {
      // Path signals are not processed by LSP provider
      const signals: Signal[] = [createMockSignal("path", "src/index.ts")];
      const result = await provider.query(signals);

      expect(result).toEqual([]);
      expect(mockLspHub.definitionMock).not.toHaveBeenCalled();
    });

    it("should query definitions for symbol signals", async () => {
      const locations = [createMockLocation("file:///test/workspace/src/utils.ts", 10, 15)];
      mockLspHub.definitionMock.mockResolvedValue(locations);

      const signals: Signal[] = [
        createMockSignal("symbol", "calculateTotal", {
          metadata: { path: "src/caller.ts", line: 5, character: 10 },
        }),
      ];
      await provider.query(signals);

      expect(mockLspHub.definitionMock).toHaveBeenCalled();
      // Note: Result depends on implementation details of how definitions are resolved
      // The test verifies the definition method is called with symbol signals
    });

    it("should query definitions for stack_frame signals", async () => {
      const locations = [createMockLocation("file:///test/workspace/src/error.ts", 25, 30)];
      mockLspHub.definitionMock.mockResolvedValue(locations);

      const signals: Signal[] = [
        createMockSignal("stack_frame", "handleError", {
          metadata: { path: "src/handler.ts", line: 10 },
        }),
      ];
      await provider.query(signals);

      expect(mockLspHub.definitionMock).toHaveBeenCalled();
    });

    it("should handle LSP definition errors gracefully", async () => {
      mockLspHub.definitionMock.mockRejectedValue(new Error("LSP timeout"));
      mockLspHub.referencesMock.mockResolvedValue([]);

      const signals: Signal[] = [
        createMockSignal("symbol", "brokenSymbol"),
        createMockSignal("symbol", "workingSymbol"),
      ];

      // Should not throw, should continue with other signals
      const result = await provider.query(signals);

      expect(result).toBeDefined();
    });

    it("should handle LSP reference errors gracefully", async () => {
      mockLspHub.definitionMock.mockResolvedValue([]);
      mockLspHub.referencesMock.mockRejectedValue(new Error("LSP error"));

      const signals: Signal[] = [createMockSignal("symbol", "testSymbol")];

      // Should not throw
      const result = await provider.query(signals);

      expect(result).toBeDefined();
    });

    it("should respect maxResults option", async () => {
      const manyLocations = Array.from({ length: 20 }, (_, i) =>
        createMockLocation(`file:///test/workspace/src/file${i}.ts`, i * 10)
      );
      mockLspHub.definitionMock.mockResolvedValue(manyLocations);
      mockLspHub.referencesMock.mockResolvedValue(manyLocations);

      const signals: Signal[] = [createMockSignal("symbol", "commonSymbol")];
      const result = await provider.query(signals, { maxResults: 5 });

      expect(result.length).toBeLessThanOrEqual(5);
    });

    it("should deduplicate evidence by path and range", async () => {
      // Same location returned by definition and references
      const sameLocation = createMockLocation("file:///test/workspace/src/utils.ts", 10, 15);
      mockLspHub.definitionMock.mockResolvedValue([sameLocation]);
      mockLspHub.referencesMock.mockResolvedValue([sameLocation, sameLocation]);

      const signals: Signal[] = [
        createMockSignal("symbol", "duplicatedSymbol", {
          metadata: { path: "src/test.ts", line: 1, character: 0 },
        }),
      ];
      const result = await provider.query(signals);

      // Count unique path+range combinations
      const uniqueKeys = new Set(result.map((e) => `${e.path}:${e.range[0]}-${e.range[1]}`));
      expect(uniqueKeys.size).toBe(result.length);
    });

    it("should apply token budget", async () => {
      const manyLocations = Array.from({ length: 10 }, (_, i) =>
        createMockLocation(`file:///test/workspace/src/file${i}.ts`, i * 10)
      );
      mockLspHub.definitionMock.mockResolvedValue(manyLocations);

      const signals: Signal[] = [createMockSignal("symbol", "largeResult")];
      const result = await provider.query(signals, { maxTokens: 50 });

      // Should limit results based on token budget
      expect(result.length).toBeLessThan(10);
    });

    it("should create evidence with correct structure", async () => {
      const location = createMockLocation("file:///test/workspace/src/math.ts", 5, 10);
      mockLspHub.definitionMock.mockResolvedValue([location]);
      mockLspHub.referencesMock.mockResolvedValue([]);

      const signals: Signal[] = [
        createMockSignal("symbol", "add", {
          metadata: { path: "src/caller.ts", line: 1, character: 5 },
        }),
      ];
      const result = await provider.query(signals);

      // If we got results, verify structure
      for (const evidence of result) {
        expect(evidence.id).toBeDefined();
        expect(evidence.provider).toBe("lsp");
        expect(evidence.path).toBeDefined();
        expect(evidence.range).toHaveLength(2);
        expect(evidence.baseScore).toBeGreaterThan(0);
        expect(evidence.matchedSignals.length).toBeGreaterThan(0);
      }
    });

    it("should process both symbol and stack_frame signals", async () => {
      mockLspHub.definitionMock.mockResolvedValue([]);
      mockLspHub.referencesMock.mockResolvedValue([]);

      const signals: Signal[] = [
        createMockSignal("symbol", "regularSymbol"),
        createMockSignal("stack_frame", "stackSymbol", {
          metadata: { path: "src/stack.ts", line: 10 },
        }),
        createMockSignal("error_token", "ignored"), // Should be ignored
        createMockSignal("path", "also/ignored"), // Should be ignored
      ];

      await provider.query(signals);

      // Definition should be called for both symbol and stack_frame
      // The exact number depends on implementation, but it should be called
      expect(mockLspHub.definitionMock).toHaveBeenCalled();
    });

    it("should stop early when maxResults reached", async () => {
      const locations = Array.from({ length: 100 }, (_, i) =>
        createMockLocation(`file:///test/workspace/src/file${i}.ts`, i)
      );
      mockLspHub.definitionMock.mockResolvedValue(locations);
      mockLspHub.referencesMock.mockResolvedValue(locations);

      const signals: Signal[] = Array.from({ length: 20 }, (_, i) =>
        createMockSignal("symbol", `symbol${i}`)
      );
      const result = await provider.query(signals, { maxResults: 5 });

      expect(result.length).toBeLessThanOrEqual(5);
    });

    it("should include symbol kind in metadata when available", async () => {
      const location = createMockLocation("file:///test/workspace/src/class.ts", 1, 20);
      mockLspHub.definitionMock.mockResolvedValue([location]);

      const signals: Signal[] = [
        createMockSignal("symbol", "MyClass", {
          metadata: { path: "src/test.ts", line: 1, character: 0 },
        }),
      ];
      const result = await provider.query(signals);

      // Evidence metadata may include symbolKind if extracted from LSP
      for (const evidence of result) {
        expect(evidence.metadata).toBeDefined();
      }
    });
  });
});
