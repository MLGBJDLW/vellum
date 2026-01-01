/**
 * Unit tests for AgentsFileDiscovery
 *
 * Tests file discovery for AGENTS.md and related agent instruction files.
 *
 * @module context/agents/__tests__/discovery
 * @see REQ-001: Multi-format file discovery with priority ordering
 * @see REQ-002: Directory tree walking with inheritance support
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  AGENTS_FILE_PATTERNS,
  AgentsFileDiscovery,
  DEFAULT_STOP_BOUNDARIES,
  findPatternByFilename,
  getPatternStrings,
  patternToLocation,
} from "../discovery.js";

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Create a temporary directory structure for testing.
 */
async function createTempDir(): Promise<string> {
  const tempDir = path.join(
    os.tmpdir(),
    `vellum-discovery-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  await fs.mkdir(tempDir, { recursive: true });
  return tempDir;
}

/**
 * Create a file with optional content.
 */
async function createFile(filePath: string, content = ""): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf-8");
}

/**
 * Clean up a directory recursively.
 */
async function cleanupDir(dirPath: string): Promise<void> {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Detect if filesystem is case-insensitive (e.g., Windows, macOS default).
 * On case-insensitive filesystems, AGENTS.md and agents.md are the same file.
 */
async function isFilesystemCaseInsensitive(dir: string): Promise<boolean> {
  const testFile = path.join(dir, `_CASE_TEST_${Date.now()}.tmp`);
  const testFileLower = testFile.toLowerCase();

  try {
    await fs.writeFile(testFile, "", "utf-8");
    try {
      // If we can access the lowercase version, filesystem is case-insensitive
      await fs.access(testFileLower);
      return true;
    } catch {
      return false;
    }
  } finally {
    try {
      await fs.unlink(testFile);
    } catch {
      // Ignore cleanup errors
    }
  }
}

// =============================================================================
// Pattern Constants Tests
// =============================================================================

describe("AGENTS_FILE_PATTERNS", () => {
  it("should contain AGENTS.md with highest priority", () => {
    const agentsPattern = AGENTS_FILE_PATTERNS.find((p) => p.pattern === "AGENTS.md");
    expect(agentsPattern).toBeDefined();
    expect(agentsPattern?.priority).toBe(100);
    expect(agentsPattern?.type).toBe("agents");
  });

  it("should have patterns sorted by priority (descending)", () => {
    const sorted = [...AGENTS_FILE_PATTERNS].sort((a, b) => b.priority - a.priority);
    expect(sorted[0]?.pattern).toBe("AGENTS.md");
    expect(sorted[sorted.length - 1]?.pattern).toBe(".github/copilot-instructions.md");
  });

  it("should include all expected file patterns", () => {
    const patterns = AGENTS_FILE_PATTERNS.map((p) => p.pattern);
    expect(patterns).toContain("AGENTS.md");
    expect(patterns).toContain("agents.md");
    expect(patterns).toContain(".agents.md");
    expect(patterns).toContain("CLAUDE.md");
    expect(patterns).toContain("GEMINI.md");
    expect(patterns).toContain(".cursorrules");
    expect(patterns).toContain(".clinerules");
    expect(patterns).toContain(".roorules");
    expect(patterns).toContain(".windsurfrules");
    expect(patterns).toContain(".github/copilot-instructions.md");
  });
});

describe("DEFAULT_STOP_BOUNDARIES", () => {
  it("should include common project markers", () => {
    expect(DEFAULT_STOP_BOUNDARIES).toContain(".git");
    expect(DEFAULT_STOP_BOUNDARIES).toContain("package.json");
    expect(DEFAULT_STOP_BOUNDARIES).toContain("pnpm-workspace.yaml");
    expect(DEFAULT_STOP_BOUNDARIES).toContain("Cargo.toml");
    expect(DEFAULT_STOP_BOUNDARIES).toContain("go.mod");
    expect(DEFAULT_STOP_BOUNDARIES).toContain("pyproject.toml");
  });
});

// =============================================================================
// Helper Function Tests
// =============================================================================

describe("patternToLocation", () => {
  it("should convert pattern to location with resolved path", () => {
    const pattern = AGENTS_FILE_PATTERNS[0];
    const location = patternToLocation(pattern, "/project/AGENTS.md");

    expect(location.path).toBe("/project/AGENTS.md");
    expect(location.priority).toBe(pattern.priority);
    expect(location.source).toBe(pattern.source);
  });
});

describe("getPatternStrings", () => {
  it("should return array of pattern strings", () => {
    const patterns = getPatternStrings();
    expect(patterns).toContain("AGENTS.md");
    expect(patterns).toContain(".cursorrules");
    expect(patterns.length).toBe(AGENTS_FILE_PATTERNS.length);
  });
});

describe("findPatternByFilename", () => {
  it("should find pattern by exact match", () => {
    const pattern = findPatternByFilename("AGENTS.md");
    expect(pattern?.pattern).toBe("AGENTS.md");
    expect(pattern?.priority).toBe(100);
  });

  it("should find pattern by path ending (forward slash)", () => {
    const pattern = findPatternByFilename("/project/AGENTS.md");
    expect(pattern?.pattern).toBe("AGENTS.md");
  });

  it("should find pattern by path ending (backslash)", () => {
    const pattern = findPatternByFilename("C:\\project\\AGENTS.md");
    expect(pattern?.pattern).toBe("AGENTS.md");
  });

  it("should return undefined for unknown filename", () => {
    const pattern = findPatternByFilename("UNKNOWN.md");
    expect(pattern).toBeUndefined();
  });

  it("should find .github/copilot-instructions.md pattern", () => {
    const pattern = findPatternByFilename(".github/copilot-instructions.md");
    expect(pattern?.type).toBe("copilot");
  });
});

// =============================================================================
// AgentsFileDiscovery.discoverInDirectory Tests
// =============================================================================

describe("AgentsFileDiscovery.discoverInDirectory", () => {
  let tempDir: string;
  let discovery: AgentsFileDiscovery;
  let caseInsensitive: boolean;

  beforeEach(async () => {
    tempDir = await createTempDir();
    discovery = new AgentsFileDiscovery();
    caseInsensitive = await isFilesystemCaseInsensitive(tempDir);
  });

  afterEach(async () => {
    await cleanupDir(tempDir);
  });

  it("should return empty array for empty directory", async () => {
    const files = await discovery.discoverInDirectory(tempDir);
    expect(files).toEqual([]);
  });

  it("should return empty array for non-existent directory", async () => {
    const files = await discovery.discoverInDirectory("/non/existent/path");
    expect(files).toEqual([]);
  });

  it("should return empty array when path is a file", async () => {
    const filePath = path.join(tempDir, "somefile.txt");
    await createFile(filePath, "content");
    const files = await discovery.discoverInDirectory(filePath);
    expect(files).toEqual([]);
  });

  it("should discover single AGENTS.md file", async () => {
    await createFile(path.join(tempDir, "AGENTS.md"), "# Instructions");

    const files = await discovery.discoverInDirectory(tempDir);

    // On case-insensitive filesystems, AGENTS.md matches both "AGENTS.md" and "agents.md" patterns
    const expectedCount = caseInsensitive ? 2 : 1;
    expect(files).toHaveLength(expectedCount);
    // First should be highest priority (AGENTS.md = 100)
    expect(files[0]?.priority).toBe(100);
    expect(files[0]?.source).toBe("project");
  });

  it("should discover multiple agent files with different types", async () => {
    // Use files that are case-distinct: AGENTS.md, .cursorrules, CLAUDE.md
    await createFile(path.join(tempDir, "AGENTS.md"), "# Agents");
    await createFile(path.join(tempDir, ".cursorrules"), "cursor rules");
    await createFile(path.join(tempDir, "CLAUDE.md"), "# Claude");

    const files = await discovery.discoverInDirectory(tempDir);

    // Should have at least 3 files (may have more on case-insensitive systems)
    expect(files.length).toBeGreaterThanOrEqual(3);
    // Check sorted by priority (highest first)
    for (let i = 0; i < files.length - 1; i++) {
      const current = files[i];
      const next = files[i + 1];
      if (current && next) {
        expect(current.priority).toBeGreaterThanOrEqual(next.priority);
      }
    }
  });

  it("should sort files by priority (highest first)", async () => {
    // Create files with different priorities and case-distinct names
    await createFile(path.join(tempDir, ".clinerules"), "");
    await createFile(path.join(tempDir, "AGENTS.md"), "");
    await createFile(path.join(tempDir, ".cursorrules"), "");

    const files = await discovery.discoverInDirectory(tempDir);

    // Verify they're sorted by priority descending
    for (let i = 0; i < files.length - 1; i++) {
      const current = files[i];
      const next = files[i + 1];
      if (current && next) {
        expect(current.priority).toBeGreaterThanOrEqual(next.priority);
      }
    }

    // First should be AGENTS.md (priority 100)
    expect(files[0]?.priority).toBe(100);
  });

  it("should discover .github/copilot-instructions.md", async () => {
    const githubDir = path.join(tempDir, ".github");
    await createFile(path.join(githubDir, "copilot-instructions.md"), "# Copilot");

    const files = await discovery.discoverInDirectory(tempDir);

    expect(files).toHaveLength(1);
    expect(files[0]?.path).toBe(path.join(tempDir, ".github", "copilot-instructions.md"));
    expect(files[0]?.priority).toBe(60);
  });

  it("should not discover files with completely wrong names", async () => {
    await createFile(path.join(tempDir, "AGENTS.txt"), "");
    await createFile(path.join(tempDir, "README.md"), "");
    await createFile(path.join(tempDir, "random.cursorrules"), "");

    const files = await discovery.discoverInDirectory(tempDir);

    expect(files).toEqual([]);
  });

  it("should discover hidden .agents.md", async () => {
    await createFile(path.join(tempDir, ".agents.md"), "# hidden");

    const files = await discovery.discoverInDirectory(tempDir);

    expect(files.length).toBeGreaterThanOrEqual(1);
    // Should include the hidden variant
    expect(files.some((f) => f.priority === 98)).toBe(true);
  });
});

// =============================================================================
// AgentsFileDiscovery.discoverWithInheritance Tests
// =============================================================================

describe("AgentsFileDiscovery.discoverWithInheritance", () => {
  let tempDir: string;
  let discovery: AgentsFileDiscovery;

  beforeEach(async () => {
    tempDir = await createTempDir();
    discovery = new AgentsFileDiscovery();
  });

  afterEach(async () => {
    await cleanupDir(tempDir);
  });

  it("should return empty array for empty directories", async () => {
    const subDir = path.join(tempDir, "sub");
    await fs.mkdir(subDir, { recursive: true });
    // Add boundary to stop walking up
    await createFile(path.join(tempDir, "package.json"), "{}");

    const files = await discovery.discoverWithInheritance(subDir);
    expect(files).toEqual([]);
  });

  it("should discover files in single directory", async () => {
    await createFile(path.join(tempDir, ".cursorrules"), "cursor");
    // Add a stop boundary so we don't walk up too far
    await createFile(path.join(tempDir, "package.json"), "{}");

    const files = await discovery.discoverWithInheritance(tempDir);

    expect(files).toHaveLength(1);
    expect(files[0]?.path).toBe(path.join(tempDir, ".cursorrules"));
  });

  it("should walk up directory tree and collect files", async () => {
    // Create directory structure:
    // tempDir/
    //   package.json (boundary)
    //   .cursorrules
    //   src/
    //     .clinerules
    //     module/
    //       .roorules
    const srcDir = path.join(tempDir, "src");
    const moduleDir = path.join(srcDir, "module");

    await createFile(path.join(tempDir, "package.json"), "{}");
    await createFile(path.join(tempDir, ".cursorrules"), "# Root");
    await fs.mkdir(moduleDir, { recursive: true });
    await createFile(path.join(srcDir, ".clinerules"), "# Src");
    await createFile(path.join(moduleDir, ".roorules"), "# Module");

    const files = await discovery.discoverWithInheritance(moduleDir);

    // Should return in inheritance order: root first, child last
    expect(files).toHaveLength(3);
    // Root (.cursorrules) should come first
    expect(files[0]?.path).toBe(path.join(tempDir, ".cursorrules"));
    // Src (.clinerules) should come second
    expect(files[1]?.path).toBe(path.join(srcDir, ".clinerules"));
    // Module (.roorules) should come last
    expect(files[2]?.path).toBe(path.join(moduleDir, ".roorules"));
  });

  it("should stop at .git boundary", async () => {
    // Create directory structure:
    // tempDir/
    //   .git/
    //   .cursorrules
    //   src/
    //     .clinerules
    const srcDir = path.join(tempDir, "src");

    await fs.mkdir(path.join(tempDir, ".git"), { recursive: true });
    await createFile(path.join(tempDir, ".cursorrules"), "# Root");
    await createFile(path.join(srcDir, ".clinerules"), "# Src");

    const files = await discovery.discoverWithInheritance(srcDir);

    // Should find both files, stopping at .git boundary
    expect(files.length).toBe(2);
    expect(files.some((f) => f.path === path.join(tempDir, ".cursorrules"))).toBe(true);
    expect(files.some((f) => f.path === path.join(srcDir, ".clinerules"))).toBe(true);
  });

  it("should stop at package.json boundary", async () => {
    const projectDir = path.join(tempDir, "project");
    const srcDir = path.join(projectDir, "src");

    await createFile(path.join(projectDir, "package.json"), "{}");
    await createFile(path.join(projectDir, ".cursorrules"), "# Project");
    await createFile(path.join(srcDir, ".clinerules"), "# Src");

    const files = await discovery.discoverWithInheritance(srcDir);

    // Should find src and project agent files
    expect(files).toHaveLength(2);
  });

  it("should respect custom stop boundaries", async () => {
    const customDiscovery = new AgentsFileDiscovery({
      stopBoundaries: ["STOP_HERE"],
    });

    const projectDir = path.join(tempDir, "project");
    const srcDir = path.join(projectDir, "src");

    // No default boundaries, only custom
    await createFile(path.join(projectDir, "STOP_HERE"), "");
    await createFile(path.join(projectDir, ".cursorrules"), "# Project");
    await createFile(path.join(srcDir, ".clinerules"), "# Src");

    const files = await customDiscovery.discoverWithInheritance(srcDir);

    // Should stop at STOP_HERE marker
    expect(files).toHaveLength(2);
  });

  it("should collect multiple file types in inheritance order", async () => {
    const projectDir = path.join(tempDir, "project");
    const srcDir = path.join(projectDir, "src");

    await createFile(path.join(projectDir, "package.json"), "{}");
    await createFile(path.join(projectDir, ".cursorrules"), "# Cursor");
    await createFile(path.join(projectDir, ".clinerules"), "# Cline");
    await createFile(path.join(srcDir, ".roorules"), "# Roo");

    const files = await discovery.discoverWithInheritance(srcDir);

    // Should have files from both directories
    expect(files.length).toBe(3);

    // Root files should come before child files
    const cursorIdx = files.findIndex((f) => f.path.endsWith(".cursorrules"));
    const rooIdx = files.findIndex((f) => f.path.endsWith(".roorules"));
    expect(cursorIdx).toBeLessThan(rooIdx);
  });

  it("should handle non-existent start directory", async () => {
    const files = await discovery.discoverWithInheritance("/non/existent/path");
    // Should return empty array without throwing
    expect(files).toEqual([]);
  });

  it("should not loop infinitely on circular structures", async () => {
    // This tests the visited set protection
    // Create a simple directory and start from it
    await createFile(path.join(tempDir, "package.json"), "{}");

    // Should complete without hanging
    const files = await discovery.discoverWithInheritance(tempDir);
    expect(Array.isArray(files)).toBe(true);
  });
});

// =============================================================================
// Edge Cases and Error Handling Tests
// =============================================================================

describe("AgentsFileDiscovery edge cases", () => {
  let tempDir: string;
  let discovery: AgentsFileDiscovery;

  beforeEach(async () => {
    tempDir = await createTempDir();
    discovery = new AgentsFileDiscovery();
  });

  afterEach(async () => {
    await cleanupDir(tempDir);
  });

  it("should handle path with special characters", async () => {
    const specialDir = path.join(tempDir, "project with spaces");
    await fs.mkdir(specialDir, { recursive: true });
    await createFile(path.join(specialDir, ".cursorrules"), "# Cursor");
    await createFile(path.join(specialDir, "package.json"), "{}");

    const files = await discovery.discoverInDirectory(specialDir);
    expect(files).toHaveLength(1);
    expect(files[0]?.priority).toBe(80);
  });

  it("should handle deeply nested directories", async () => {
    const deepPath = path.join(tempDir, "a", "b", "c", "d", "e");
    await fs.mkdir(deepPath, { recursive: true });
    await createFile(path.join(tempDir, "package.json"), "{}");
    await createFile(path.join(tempDir, ".cursorrules"), "# Root");
    await createFile(path.join(deepPath, ".clinerules"), "# Deep");

    const files = await discovery.discoverWithInheritance(deepPath);

    // Should find both root and deep agent files
    expect(files.length).toBe(2);
    expect(files.some((f) => f.path.endsWith(".cursorrules"))).toBe(true);
    expect(files.some((f) => f.path.endsWith(".clinerules"))).toBe(true);
  });

  it("should handle concurrent discovery calls", async () => {
    await createFile(path.join(tempDir, ".cursorrules"), "# Cursor");
    await createFile(path.join(tempDir, "package.json"), "{}");

    // Run multiple discoveries in parallel
    const results = await Promise.all([
      discovery.discoverInDirectory(tempDir),
      discovery.discoverInDirectory(tempDir),
      discovery.discoverInDirectory(tempDir),
    ]);

    // All should return same result
    expect(results[0]).toEqual(results[1]);
    expect(results[1]).toEqual(results[2]);
    expect(results[0]).toHaveLength(1);
  });

  it("should handle empty stop boundaries", async () => {
    const noStopDiscovery = new AgentsFileDiscovery({
      stopBoundaries: [],
    });

    await createFile(path.join(tempDir, ".cursorrules"), "# Cursor");

    const files = await noStopDiscovery.discoverWithInheritance(tempDir);
    // Should still work, just walk until filesystem root
    expect(Array.isArray(files)).toBe(true);
  });
});
