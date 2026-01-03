// ============================================
// Skill Loader Tests - T041
// ============================================

import * as fs from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SkillLoader } from "../loader.js";
import { SkillParser } from "../parser.js";
import type { SkillLoaded, SkillLocation, SkillScan, SkillSource } from "../types.js";

// =============================================================================
// Mock modules
// =============================================================================

vi.mock("node:fs/promises");

// =============================================================================
// Test Fixtures
// =============================================================================

function createMockLocation(
  name: string,
  source: SkillSource = "workspace",
  priority: number = 100
): SkillLocation {
  return {
    path: `/skills/${name}`,
    manifestPath: `/skills/${name}/SKILL.md`,
    source,
    priority,
  };
}

function createMockScan(name: string, source: SkillSource = "workspace"): SkillScan {
  return {
    name,
    description: `Description for ${name}`,
    triggers: [{ type: "keyword", pattern: name }],
    dependencies: [],
    source,
    path: `/skills/${name}`,
    version: "1.0.0",
    priority: 50,
    tags: ["test"],
  };
}

function createMockLoaded(name: string, source: SkillSource = "workspace"): SkillLoaded {
  return {
    ...createMockScan(name, source),
    frontmatter: {
      name,
      description: `Description for ${name}`,
      triggers: [{ type: "keyword", pattern: name }],
      dependencies: [],
      priority: 50,
      tags: ["test"],
    },
    rules: `Rules for ${name}`,
    patterns: `Patterns for ${name}`,
    antiPatterns: `Anti-patterns for ${name}`,
    examples: `Examples for ${name}`,
    referencesSection: `References for ${name}`,
    raw: `Raw content for ${name}`,
    loadedAt: new Date(),
  };
}

// Helper to setup a loader with mocked internal methods
function createMockedLoader(): {
  loader: SkillLoader;
  mockParser: {
    parseMetadata: ReturnType<typeof vi.fn>;
    parseFull: ReturnType<typeof vi.fn>;
  };
  mockDiscovery: {
    discoverAll: ReturnType<typeof vi.fn>;
    setWorkspacePath: ReturnType<typeof vi.fn>;
  };
} {
  const loader = new SkillLoader();

  // Create mock functions
  const mockParseMetadata = vi.fn();
  const mockParseFull = vi.fn();
  const mockDiscoverAll = vi.fn();
  const mockSetWorkspacePath = vi.fn();

  // Access private members and replace them with mocks
  // biome-ignore lint/suspicious/noExplicitAny: Accessing private members for testing
  const loaderAny = loader as any;
  loaderAny.parser = {
    parseMetadata: mockParseMetadata,
    parseFull: mockParseFull,
    parseMetadataFromContent: vi.fn(),
    parseFullFromContent: vi.fn(),
    parseWithDiagnostics: vi.fn(),
    validate: vi.fn(),
    findSection: vi.fn(),
  };
  loaderAny.discovery = {
    discoverAll: mockDiscoverAll,
    discoverSource: vi.fn(),
    deduplicateByName: vi.fn(),
    setWorkspacePath: mockSetWorkspacePath,
  };

  return {
    loader,
    mockParser: {
      parseMetadata: mockParseMetadata,
      parseFull: mockParseFull,
    },
    mockDiscovery: {
      discoverAll: mockDiscoverAll,
      setWorkspacePath: mockSetWorkspacePath,
    },
  };
}

// =============================================================================
// Tests
// =============================================================================

describe("SkillLoader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // Constructor Tests
  // ===========================================================================

  describe("constructor", () => {
    it("should create loader with default options", () => {
      const defaultLoader = new SkillLoader();
      expect(defaultLoader).toBeDefined();
      expect(defaultLoader.isInitialized()).toBe(false);
    });

    it("should accept custom parser", () => {
      const customParser = new SkillParser();
      const loaderWithParser = new SkillLoader({ parser: customParser });
      expect(loaderWithParser).toBeDefined();
    });
  });

  // ===========================================================================
  // initialize Tests
  // ===========================================================================

  describe("initialize", () => {
    it("should discover and scan all skills", async () => {
      const { loader, mockParser, mockDiscovery } = createMockedLoader();

      const locations: SkillLocation[] = [
        createMockLocation("skill-a"),
        createMockLocation("skill-b"),
      ];

      mockDiscovery.discoverAll.mockResolvedValue({
        locations,
        deduplicated: locations,
        errors: [],
      });
      mockParser.parseMetadata
        .mockResolvedValueOnce(createMockScan("skill-a"))
        .mockResolvedValueOnce(createMockScan("skill-b"));

      const count = await loader.initialize();

      expect(count).toBe(2);
      expect(loader.isInitialized()).toBe(true);
      expect(mockDiscovery.discoverAll).toHaveBeenCalledTimes(1);
      expect(mockParser.parseMetadata).toHaveBeenCalledTimes(2);
    });

    it("should handle skills that fail to parse", async () => {
      const { loader, mockParser, mockDiscovery } = createMockedLoader();

      const locations: SkillLocation[] = [
        createMockLocation("valid-skill"),
        createMockLocation("invalid-skill"),
      ];

      mockDiscovery.discoverAll.mockResolvedValue({
        locations,
        deduplicated: locations,
        errors: [],
      });
      mockParser.parseMetadata
        .mockResolvedValueOnce(createMockScan("valid-skill"))
        .mockResolvedValueOnce(null);

      const count = await loader.initialize();

      expect(count).toBe(1); // Only valid skill cached
    });

    it("should handle parser errors gracefully", async () => {
      const { loader, mockParser, mockDiscovery } = createMockedLoader();

      const locations: SkillLocation[] = [createMockLocation("error-skill")];

      mockDiscovery.discoverAll.mockResolvedValue({
        locations,
        deduplicated: locations,
        errors: [],
      });
      mockParser.parseMetadata.mockRejectedValue(new Error("Parse error"));

      const count = await loader.initialize();

      expect(count).toBe(0);
      expect(loader.isInitialized()).toBe(true);
    });
  });

  // ===========================================================================
  // reinitialize Tests
  // ===========================================================================

  describe("reinitialize", () => {
    it("should clear cache and rediscover", async () => {
      const { loader, mockParser, mockDiscovery } = createMockedLoader();

      // First init
      const locations: SkillLocation[] = [createMockLocation("skill-a")];
      mockDiscovery.discoverAll.mockResolvedValue({
        locations,
        deduplicated: locations,
        errors: [],
      });
      mockParser.parseMetadata.mockResolvedValue(createMockScan("skill-a"));

      await loader.initialize();
      expect(loader.getSkillNames()).toHaveLength(1);

      // Reinitialize with different skills
      const newLocations: SkillLocation[] = [
        createMockLocation("skill-b"),
        createMockLocation("skill-c"),
      ];

      mockDiscovery.discoverAll.mockResolvedValue({
        locations: newLocations,
        deduplicated: newLocations,
        errors: [],
      });
      mockParser.parseMetadata
        .mockResolvedValueOnce(createMockScan("skill-b"))
        .mockResolvedValueOnce(createMockScan("skill-c"));

      const count = await loader.reinitialize();

      expect(count).toBe(2);
      expect(loader.hasSkill("skill-a")).toBe(false);
      expect(loader.hasSkill("skill-b")).toBe(true);
      expect(loader.hasSkill("skill-c")).toBe(true);
    });
  });

  // ===========================================================================
  // L1 Scan Tests
  // ===========================================================================

  describe("scanL1", () => {
    it("should scan locations and cache L1 data", async () => {
      const { loader, mockParser } = createMockedLoader();

      const locations: SkillLocation[] = [
        createMockLocation("skill-a"),
        createMockLocation("skill-b"),
      ];

      mockParser.parseMetadata
        .mockResolvedValueOnce(createMockScan("skill-a"))
        .mockResolvedValueOnce(createMockScan("skill-b"));

      await loader.scanL1(locations);

      expect(loader.hasSkill("skill-a")).toBe(true);
      expect(loader.hasSkill("skill-b")).toBe(true);

      const entry = loader.getCacheEntry("skill-a");
      expect(entry?.level).toBe(1);
      expect(entry?.data.scan.name).toBe("skill-a");
    });

    it("should handle concurrent scans", async () => {
      const { loader, mockParser } = createMockedLoader();

      const locations: SkillLocation[] = Array.from({ length: 10 }, (_, i) =>
        createMockLocation(`skill-${i}`)
      );

      for (let i = 0; i < 10; i++) {
        mockParser.parseMetadata.mockResolvedValueOnce(createMockScan(`skill-${i}`));
      }

      await loader.scanL1(locations);

      expect(loader.getSkillNames()).toHaveLength(10);
    });
  });

  // ===========================================================================
  // L2 Load Tests
  // ===========================================================================

  describe("loadL2", () => {
    it("should upgrade from L1 to L2", async () => {
      const { loader, mockParser, mockDiscovery } = createMockedLoader();

      // Initialize with one skill
      const locations: SkillLocation[] = [createMockLocation("test-skill")];
      mockDiscovery.discoverAll.mockResolvedValue({
        locations,
        deduplicated: locations,
        errors: [],
      });
      mockParser.parseMetadata.mockResolvedValue(createMockScan("test-skill"));
      await loader.initialize();

      mockParser.parseFull.mockResolvedValue(createMockLoaded("test-skill"));

      const loaded = await loader.loadL2("test-skill");

      expect(loaded).not.toBeNull();
      expect(loaded?.name).toBe("test-skill");
      expect(loaded?.rules).toContain("Rules for test-skill");

      const entry = loader.getCacheEntry("test-skill");
      expect(entry?.level).toBe(2);
    });

    it("should return cached L2 data on subsequent calls", async () => {
      const { loader, mockParser, mockDiscovery } = createMockedLoader();

      const locations: SkillLocation[] = [createMockLocation("test-skill")];
      mockDiscovery.discoverAll.mockResolvedValue({
        locations,
        deduplicated: locations,
        errors: [],
      });
      mockParser.parseMetadata.mockResolvedValue(createMockScan("test-skill"));
      await loader.initialize();

      mockParser.parseFull.mockResolvedValue(createMockLoaded("test-skill"));

      // First call
      const loaded1 = await loader.loadL2("test-skill");
      expect(loaded1).not.toBeNull();

      // Second call - should not call parser again
      const loaded2 = await loader.loadL2("test-skill");
      expect(loaded2).not.toBeNull();

      // Parser should only be called once for full parse
      expect(mockParser.parseFull).toHaveBeenCalledTimes(1);
    });

    it("should return null for unknown skill", async () => {
      const { loader } = createMockedLoader();

      const loaded = await loader.loadL2("unknown-skill");

      expect(loaded).toBeNull();
    });

    it("should return null if L2 parsing fails", async () => {
      const { loader, mockParser, mockDiscovery } = createMockedLoader();

      const locations: SkillLocation[] = [createMockLocation("test-skill")];
      mockDiscovery.discoverAll.mockResolvedValue({
        locations,
        deduplicated: locations,
        errors: [],
      });
      mockParser.parseMetadata.mockResolvedValue(createMockScan("test-skill"));
      await loader.initialize();

      mockParser.parseFull.mockResolvedValue(null);

      const loaded = await loader.loadL2("test-skill");

      expect(loaded).toBeNull();
    });

    it("should handle parser errors gracefully", async () => {
      const { loader, mockParser, mockDiscovery } = createMockedLoader();

      const locations: SkillLocation[] = [createMockLocation("test-skill")];
      mockDiscovery.discoverAll.mockResolvedValue({
        locations,
        deduplicated: locations,
        errors: [],
      });
      mockParser.parseMetadata.mockResolvedValue(createMockScan("test-skill"));
      await loader.initialize();

      mockParser.parseFull.mockRejectedValue(new Error("Parse error"));

      const loaded = await loader.loadL2("test-skill");

      expect(loaded).toBeNull();
    });

    it("should update lastAccessedAt on cache hit", async () => {
      const { loader, mockParser, mockDiscovery } = createMockedLoader();

      const locations: SkillLocation[] = [createMockLocation("test-skill")];
      mockDiscovery.discoverAll.mockResolvedValue({
        locations,
        deduplicated: locations,
        errors: [],
      });
      mockParser.parseMetadata.mockResolvedValue(createMockScan("test-skill"));
      await loader.initialize();

      mockParser.parseFull.mockResolvedValue(createMockLoaded("test-skill"));

      await loader.loadL2("test-skill");
      const entry1 = loader.getCacheEntry("test-skill");
      const firstAccess = entry1?.lastAccessedAt;

      // Wait a bit
      await new Promise((r) => setTimeout(r, 10));

      await loader.loadL2("test-skill");
      const entry2 = loader.getCacheEntry("test-skill");
      const secondAccess = entry2?.lastAccessedAt;

      expect(secondAccess).toBeDefined();
      expect(firstAccess).toBeDefined();
      expect(secondAccess!.getTime()).toBeGreaterThanOrEqual(firstAccess!.getTime());
    });
  });

  // ===========================================================================
  // L3 Access Tests
  // ===========================================================================

  describe("accessL3", () => {
    it("should upgrade from L2 to L3 with resource metadata", async () => {
      const { loader, mockParser, mockDiscovery } = createMockedLoader();

      const locations: SkillLocation[] = [createMockLocation("test-skill")];
      mockDiscovery.discoverAll.mockResolvedValue({
        locations,
        deduplicated: locations,
        errors: [],
      });
      mockParser.parseMetadata.mockResolvedValue(createMockScan("test-skill"));
      await loader.initialize();

      mockParser.parseFull.mockResolvedValue(createMockLoaded("test-skill"));

      // Mock fs.stat for resource directories
      vi.mocked(fs.stat).mockImplementation(async (p) => {
        const pathStr = p.toString();
        if (
          pathStr.includes("scripts") ||
          pathStr.includes("references") ||
          pathStr.includes("assets")
        ) {
          // biome-ignore lint/suspicious/noExplicitAny: Mock fs.Stats for testing
          return { isDirectory: () => true } as any;
        }
        throw new Error("ENOENT");
      });

      // Mock fs.readdir for resource files
      vi.mocked(fs.readdir).mockImplementation(async (p) => {
        const pathStr = p.toString();
        if (pathStr.includes("scripts")) {
          // biome-ignore lint/suspicious/noExplicitAny: Mock fs.Dirent for testing
          return [{ name: "setup.sh", isFile: () => true, isDirectory: () => false }] as any;
        }
        return [];
      });

      const accessed = await loader.accessL3("test-skill");

      expect(accessed).not.toBeNull();
      expect(accessed?.scripts).toBeDefined();
      expect(accessed?.references).toBeDefined();
      expect(accessed?.assets).toBeDefined();

      const entry = loader.getCacheEntry("test-skill");
      expect(entry?.level).toBe(3);
    });

    it("should return null for unknown skill", async () => {
      const { loader } = createMockedLoader();

      const accessed = await loader.accessL3("unknown-skill");

      expect(accessed).toBeNull();
    });

    it("should auto-upgrade L1 to L2 then L3", async () => {
      const { loader, mockParser, mockDiscovery } = createMockedLoader();

      const locations: SkillLocation[] = [createMockLocation("test-skill")];
      mockDiscovery.discoverAll.mockResolvedValue({
        locations,
        deduplicated: locations,
        errors: [],
      });
      mockParser.parseMetadata.mockResolvedValue(createMockScan("test-skill"));
      await loader.initialize();

      mockParser.parseFull.mockResolvedValue(createMockLoaded("test-skill"));

      vi.mocked(fs.stat).mockRejectedValue(new Error("ENOENT"));

      // Start at L1, access should upgrade through L2 to L3
      const entry1 = loader.getCacheEntry("test-skill");
      expect(entry1?.level).toBe(1);

      const accessed = await loader.accessL3("test-skill");

      expect(accessed).not.toBeNull();
      const entry2 = loader.getCacheEntry("test-skill");
      expect(entry2?.level).toBe(3);
    });
  });

  // ===========================================================================
  // Cache Operations Tests
  // ===========================================================================

  describe("cache operations", () => {
    describe("getSkill", () => {
      it("should return skill data at current level", async () => {
        const { loader, mockParser, mockDiscovery } = createMockedLoader();

        const locations: SkillLocation[] = [createMockLocation("skill-a")];
        mockDiscovery.discoverAll.mockResolvedValue({
          locations,
          deduplicated: locations,
          errors: [],
        });
        mockParser.parseMetadata.mockResolvedValue(createMockScan("skill-a"));
        await loader.initialize();

        const skill = loader.getSkill("skill-a");

        expect(skill).not.toBeNull();
        expect(skill?.scan.name).toBe("skill-a");
      });

      it("should return null for unknown skill", async () => {
        const { loader } = createMockedLoader();

        const skill = loader.getSkill("unknown");

        expect(skill).toBeNull();
      });
    });

    describe("getAllScans", () => {
      it("should return all L1 scans", async () => {
        const { loader, mockParser, mockDiscovery } = createMockedLoader();

        const locations: SkillLocation[] = [
          createMockLocation("skill-a"),
          createMockLocation("skill-b"),
        ];
        mockDiscovery.discoverAll.mockResolvedValue({
          locations,
          deduplicated: locations,
          errors: [],
        });
        mockParser.parseMetadata
          .mockResolvedValueOnce(createMockScan("skill-a"))
          .mockResolvedValueOnce(createMockScan("skill-b"));
        await loader.initialize();

        const scans = loader.getAllScans();

        expect(scans).toHaveLength(2);
        expect(scans.map((s) => s.name)).toContain("skill-a");
        expect(scans.map((s) => s.name)).toContain("skill-b");
      });
    });

    describe("getSkillNames", () => {
      it("should return all skill names", async () => {
        const { loader, mockParser, mockDiscovery } = createMockedLoader();

        const locations: SkillLocation[] = [
          createMockLocation("skill-a"),
          createMockLocation("skill-b"),
        ];
        mockDiscovery.discoverAll.mockResolvedValue({
          locations,
          deduplicated: locations,
          errors: [],
        });
        mockParser.parseMetadata
          .mockResolvedValueOnce(createMockScan("skill-a"))
          .mockResolvedValueOnce(createMockScan("skill-b"));
        await loader.initialize();

        const names = loader.getSkillNames();

        expect(names).toHaveLength(2);
        expect(names).toContain("skill-a");
        expect(names).toContain("skill-b");
      });
    });

    describe("hasSkill", () => {
      it("should return true for existing skill", async () => {
        const { loader, mockParser, mockDiscovery } = createMockedLoader();

        const locations: SkillLocation[] = [createMockLocation("skill-a")];
        mockDiscovery.discoverAll.mockResolvedValue({
          locations,
          deduplicated: locations,
          errors: [],
        });
        mockParser.parseMetadata.mockResolvedValue(createMockScan("skill-a"));
        await loader.initialize();

        expect(loader.hasSkill("skill-a")).toBe(true);
      });

      it("should return false for non-existing skill", async () => {
        const { loader } = createMockedLoader();

        expect(loader.hasSkill("unknown")).toBe(false);
      });
    });

    describe("invalidate", () => {
      it("should remove skill from cache", async () => {
        const { loader, mockParser, mockDiscovery } = createMockedLoader();

        const locations: SkillLocation[] = [createMockLocation("skill-a")];
        mockDiscovery.discoverAll.mockResolvedValue({
          locations,
          deduplicated: locations,
          errors: [],
        });
        mockParser.parseMetadata.mockResolvedValue(createMockScan("skill-a"));
        await loader.initialize();

        expect(loader.hasSkill("skill-a")).toBe(true);

        const removed = loader.invalidate("skill-a");

        expect(removed).toBe(true);
        expect(loader.hasSkill("skill-a")).toBe(false);
      });

      it("should return false for non-existing skill", async () => {
        const { loader } = createMockedLoader();

        const removed = loader.invalidate("unknown");

        expect(removed).toBe(false);
      });
    });

    describe("invalidateAll", () => {
      it("should clear all cached skills", async () => {
        const { loader, mockParser, mockDiscovery } = createMockedLoader();

        const locations: SkillLocation[] = [
          createMockLocation("skill-a"),
          createMockLocation("skill-b"),
        ];
        mockDiscovery.discoverAll.mockResolvedValue({
          locations,
          deduplicated: locations,
          errors: [],
        });
        mockParser.parseMetadata
          .mockResolvedValueOnce(createMockScan("skill-a"))
          .mockResolvedValueOnce(createMockScan("skill-b"));
        await loader.initialize();

        expect(loader.getSkillNames()).toHaveLength(2);

        loader.invalidateAll();

        expect(loader.getSkillNames()).toHaveLength(0);
        expect(loader.isInitialized()).toBe(false);
      });
    });

    describe("getCacheStats", () => {
      it("should return cache statistics", async () => {
        const { loader, mockParser, mockDiscovery } = createMockedLoader();

        const locations: SkillLocation[] = [
          createMockLocation("skill-a"),
          createMockLocation("skill-b"),
        ];
        mockDiscovery.discoverAll.mockResolvedValue({
          locations,
          deduplicated: locations,
          errors: [],
        });
        mockParser.parseMetadata
          .mockResolvedValueOnce(createMockScan("skill-a"))
          .mockResolvedValueOnce(createMockScan("skill-b"));
        await loader.initialize();

        // All start at L1
        let stats = loader.getCacheStats();
        expect(stats.total).toBe(2);
        expect(stats.l1).toBe(2);
        expect(stats.l2).toBe(0);
        expect(stats.l3).toBe(0);

        // Upgrade one to L2
        mockParser.parseFull.mockResolvedValue(createMockLoaded("skill-a"));
        await loader.loadL2("skill-a");

        stats = loader.getCacheStats();
        expect(stats.l1).toBe(1);
        expect(stats.l2).toBe(1);
      });
    });
  });

  // ===========================================================================
  // Dependency Resolution Tests
  // ===========================================================================

  describe("resolveDependencies", () => {
    it("should resolve simple dependencies", async () => {
      const { loader, mockParser, mockDiscovery } = createMockedLoader();

      // Setup skills with dependencies: skill-a -> skill-b -> skill-c
      const scanA = createMockScan("skill-a");
      scanA.dependencies = ["skill-b"];

      const scanB = createMockScan("skill-b");
      scanB.dependencies = ["skill-c"];

      const scanC = createMockScan("skill-c");
      scanC.dependencies = [];

      const locations = [
        createMockLocation("skill-a"),
        createMockLocation("skill-b"),
        createMockLocation("skill-c"),
      ];

      mockDiscovery.discoverAll.mockResolvedValue({
        locations,
        deduplicated: locations,
        errors: [],
      });

      mockParser.parseMetadata
        .mockResolvedValueOnce(scanA)
        .mockResolvedValueOnce(scanB)
        .mockResolvedValueOnce(scanC);

      await loader.initialize();

      const deps = await loader.resolveDependencies("skill-a");

      // Should return dependencies in order: skill-c, skill-b (deepest first)
      expect(deps).toEqual(["skill-c", "skill-b"]);
    });

    it("should detect circular dependencies", async () => {
      const { loader, mockParser, mockDiscovery } = createMockedLoader();

      // Setup circular: skill-a -> skill-b -> skill-a
      const scanA = createMockScan("skill-a");
      scanA.dependencies = ["skill-b"];

      const scanB = createMockScan("skill-b");
      scanB.dependencies = ["skill-a"];

      const locations = [createMockLocation("skill-a"), createMockLocation("skill-b")];

      mockDiscovery.discoverAll.mockResolvedValue({
        locations,
        deduplicated: locations,
        errors: [],
      });

      mockParser.parseMetadata.mockResolvedValueOnce(scanA).mockResolvedValueOnce(scanB);

      await loader.initialize();

      await expect(loader.resolveDependencies("skill-a")).rejects.toThrow("Circular dependency");
    });

    it("should handle missing dependencies gracefully", async () => {
      const { loader, mockParser, mockDiscovery } = createMockedLoader();

      const scanA = createMockScan("skill-a");
      scanA.dependencies = ["missing-skill"];

      const locations = [createMockLocation("skill-a")];

      mockDiscovery.discoverAll.mockResolvedValue({
        locations,
        deduplicated: locations,
        errors: [],
      });

      mockParser.parseMetadata.mockResolvedValue(scanA);

      await loader.initialize();

      const deps = await loader.resolveDependencies("skill-a");

      // Missing dependencies are skipped
      expect(deps).toEqual([]);
    });
  });

  // ===========================================================================
  // loadWithDependencies Tests
  // ===========================================================================

  describe("loadWithDependencies", () => {
    it("should load skill and all dependencies", async () => {
      const { loader, mockParser, mockDiscovery } = createMockedLoader();

      const scanA = createMockScan("skill-a");
      scanA.dependencies = ["skill-b"];

      const scanB = createMockScan("skill-b");
      scanB.dependencies = [];

      const locations = [createMockLocation("skill-a"), createMockLocation("skill-b")];

      mockDiscovery.discoverAll.mockResolvedValue({
        locations,
        deduplicated: locations,
        errors: [],
      });

      mockParser.parseMetadata.mockResolvedValueOnce(scanA).mockResolvedValueOnce(scanB);

      await loader.initialize();

      mockParser.parseFull
        .mockResolvedValueOnce(createMockLoaded("skill-b"))
        .mockResolvedValueOnce(createMockLoaded("skill-a"));

      const loaded = await loader.loadWithDependencies("skill-a");

      expect(loaded).toHaveLength(2);
      // Dependencies come first
      expect(loaded[0]?.name).toBe("skill-b");
      expect(loaded[1]?.name).toBe("skill-a");
    });
  });

  // ===========================================================================
  // setWorkspacePath Tests
  // ===========================================================================

  describe("setWorkspacePath", () => {
    it("should update workspace path and reinitialize", async () => {
      const { loader, mockParser, mockDiscovery } = createMockedLoader();

      const locations: SkillLocation[] = [createMockLocation("new-skill")];

      mockDiscovery.discoverAll.mockResolvedValue({
        locations,
        deduplicated: locations,
        errors: [],
      });
      mockParser.parseMetadata.mockResolvedValue(createMockScan("new-skill"));

      const count = await loader.setWorkspacePath("/new/workspace");

      expect(mockDiscovery.setWorkspacePath).toHaveBeenCalledWith("/new/workspace");
      expect(count).toBe(1);
    });
  });
});
