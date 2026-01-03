// ============================================
// Skill Discovery Tests - T040
// ============================================

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SkillDiscovery } from "../discovery.js";
import { SKILL_SOURCE_PRIORITY, type SkillLocation } from "../types.js";

// =============================================================================
// Mock modules
// =============================================================================

vi.mock("node:fs/promises");
vi.mock("node:os");

// =============================================================================
// Test Fixtures
// =============================================================================

// Use cross-platform compatible paths
const WORKSPACE_PATH =
  process.platform === "win32" ? "C:\\workspace\\project" : "/workspace/project";
const HOME_DIR = process.platform === "win32" ? "C:\\Users\\user" : "/home/user";

// biome-ignore lint/suspicious/noExplicitAny: Mock fs.Dirent for testing
function createDirent(name: string, type: "dir" | "file" | "symlink"): any {
  return {
    name,
    isDirectory: () => type === "dir",
    isFile: () => type === "file",
    isSymbolicLink: () => type === "symlink",
  };
}

// biome-ignore lint/suspicious/noExplicitAny: Mock fs.Stats for testing
function createMockStat(isDir: boolean = true, isFile: boolean = false): any {
  return {
    isDirectory: () => isDir,
    isFile: () => isFile,
    size: 1000,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe("SkillDiscovery", () => {
  let discovery: SkillDiscovery;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(os.homedir).mockReturnValue(HOME_DIR);
  });

  // ===========================================================================
  // Constructor Tests
  // ===========================================================================

  describe("constructor", () => {
    it("should create discovery with default options", () => {
      discovery = new SkillDiscovery();

      expect(discovery).toBeDefined();
    });

    it("should accept workspace path", () => {
      discovery = new SkillDiscovery({ workspacePath: WORKSPACE_PATH });

      expect(discovery).toBeDefined();
    });

    it("should accept custom paths", () => {
      discovery = new SkillDiscovery({
        workspacePath: WORKSPACE_PATH,
        customPaths: {
          workspace: "/custom/workspace/skills",
          user: "/custom/user/skills",
        },
      });

      expect(discovery).toBeDefined();
    });
  });

  // ===========================================================================
  // setWorkspacePath Tests
  // ===========================================================================

  describe("setWorkspacePath", () => {
    it("should update workspace path", () => {
      discovery = new SkillDiscovery();
      discovery.setWorkspacePath(WORKSPACE_PATH);

      // Path is used internally, we verify through discovery
      expect(discovery).toBeDefined();
    });
  });

  // ===========================================================================
  // discoverAll Tests
  // ===========================================================================

  describe("discoverAll", () => {
    it("should discover skills from multiple sources", async () => {
      discovery = new SkillDiscovery({ workspacePath: WORKSPACE_PATH });

      // Use path.normalize for cross-platform compatibility
      const workspaceSkillsPath = path.normalize(path.join(WORKSPACE_PATH, ".vellum", "skills"));
      const userSkillsPath = path.normalize(path.join(HOME_DIR, ".vellum", "skills"));
      const globalSkillsPath = path.normalize(path.join(WORKSPACE_PATH, ".github", "skills"));

      // Mock directory existence checks - normalize paths for comparison
      // IMPORTANT: Check SKILL.md files FIRST, before skill directory checks
      vi.mocked(fs.stat).mockImplementation(async (p) => {
        const pathStr = path.normalize(p.toString());

        // Check for SKILL.md files first (must be before skill-a/b/c directory checks)
        if (pathStr.endsWith("SKILL.md")) {
          return createMockStat(false, true); // isDir=false, isFile=true
        }

        // Then check base directories and skill directories
        if (
          pathStr === workspaceSkillsPath ||
          pathStr === userSkillsPath ||
          pathStr === globalSkillsPath ||
          pathStr.includes("skill-a") ||
          pathStr.includes("skill-b") ||
          pathStr.includes("skill-c")
        ) {
          return createMockStat(true, false); // isDir=true, isFile=false
        }

        throw new Error("ENOENT");
      });

      // Mock directory reads - normalize paths for comparison
      vi.mocked(fs.readdir).mockImplementation(async (p) => {
        const pathStr = path.normalize(p.toString());
        if (pathStr === workspaceSkillsPath) {
          return [createDirent("skill-a", "dir")];
        }
        if (pathStr === userSkillsPath) {
          return [createDirent("skill-b", "dir")];
        }
        if (pathStr === globalSkillsPath) {
          return [createDirent("skill-c", "dir")];
        }
        return [];
      });

      const result = await discovery.discoverAll();

      expect(result.locations.length).toBe(3);
      expect(result.deduplicated.length).toBe(3);
      expect(result.errors.length).toBe(0);

      // Check sources
      const sources = result.locations.map((l) => l.source);
      expect(sources).toContain("workspace");
      expect(sources).toContain("user");
      expect(sources).toContain("global");
    });

    it("should handle missing directories gracefully", async () => {
      discovery = new SkillDiscovery({ workspacePath: WORKSPACE_PATH });

      // Mock all directories as non-existent
      vi.mocked(fs.stat).mockRejectedValue(new Error("ENOENT"));

      const result = await discovery.discoverAll();

      expect(result.locations).toHaveLength(0);
      expect(result.deduplicated).toHaveLength(0);
      expect(result.errors).toHaveLength(0); // Missing dirs are not errors
    });

    it("should handle discovery errors gracefully", async () => {
      discovery = new SkillDiscovery({ workspacePath: WORKSPACE_PATH });

      const workspaceSkillsPath = path.normalize(path.join(WORKSPACE_PATH, ".vellum", "skills"));

      // Mock directory exists but reading fails
      vi.mocked(fs.stat).mockImplementation(async (p) => {
        const pathStr = path.normalize(p.toString());
        if (pathStr === workspaceSkillsPath) {
          return createMockStat(true, false); // isDir=true
        }
        throw new Error("ENOENT");
      });

      vi.mocked(fs.readdir).mockRejectedValue(new Error("Permission denied"));

      const result = await discovery.discoverAll();

      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // discoverSource Tests
  // ===========================================================================

  describe("discoverSource", () => {
    it("should discover workspace skills", async () => {
      discovery = new SkillDiscovery({ workspacePath: WORKSPACE_PATH });

      const skillsPath = path.normalize(path.join(WORKSPACE_PATH, ".vellum", "skills"));
      const skillPath = path.normalize(path.join(skillsPath, "my-skill"));

      vi.mocked(fs.stat).mockImplementation(async (p) => {
        const pathStr = path.normalize(p.toString());
        if (pathStr === skillsPath || pathStr === skillPath) {
          return createMockStat(true, false); // isDir=true
        }
        if (pathStr.endsWith("SKILL.md")) {
          return createMockStat(false, true); // isFile=true
        }
        throw new Error("ENOENT");
      });

      vi.mocked(fs.readdir).mockResolvedValue([createDirent("my-skill", "dir")]);

      const locations = await discovery.discoverSource("workspace");

      expect(locations).toHaveLength(1);
      expect(locations[0]?.source).toBe("workspace");
      expect(locations[0]?.priority).toBe(SKILL_SOURCE_PRIORITY.workspace);
      expect(locations[0]?.path).toContain("my-skill");
      expect(locations[0]?.manifestPath).toContain("SKILL.md");
    });

    it("should discover user skills", async () => {
      discovery = new SkillDiscovery({ workspacePath: WORKSPACE_PATH });

      const skillsPath = path.normalize(path.join(HOME_DIR, ".vellum", "skills"));
      const skillPath = path.normalize(path.join(skillsPath, "user-skill"));

      vi.mocked(fs.stat).mockImplementation(async (p) => {
        const pathStr = path.normalize(p.toString());
        if (pathStr === skillsPath || pathStr === skillPath) {
          return createMockStat(true, false); // isDir=true
        }
        if (pathStr.endsWith("SKILL.md")) {
          return createMockStat(false, true); // isFile=true
        }
        throw new Error("ENOENT");
      });

      vi.mocked(fs.readdir).mockResolvedValue([createDirent("user-skill", "dir")]);

      const locations = await discovery.discoverSource("user");

      expect(locations).toHaveLength(1);
      expect(locations[0]?.source).toBe("user");
      expect(locations[0]?.priority).toBe(SKILL_SOURCE_PRIORITY.user);
    });

    it("should discover global skills (.github/skills)", async () => {
      discovery = new SkillDiscovery({ workspacePath: WORKSPACE_PATH });

      const skillsPath = path.normalize(path.join(WORKSPACE_PATH, ".github", "skills"));
      const skillPath = path.normalize(path.join(skillsPath, "global-skill"));

      vi.mocked(fs.stat).mockImplementation(async (p) => {
        const pathStr = path.normalize(p.toString());
        if (pathStr === skillsPath || pathStr === skillPath) {
          return createMockStat(true, false); // isDir=true
        }
        if (pathStr.endsWith("SKILL.md")) {
          return createMockStat(false, true); // isFile=true
        }
        throw new Error("ENOENT");
      });

      vi.mocked(fs.readdir).mockResolvedValue([createDirent("global-skill", "dir")]);

      const locations = await discovery.discoverSource("global");

      expect(locations).toHaveLength(1);
      expect(locations[0]?.source).toBe("global");
      expect(locations[0]?.priority).toBe(SKILL_SOURCE_PRIORITY.global);
    });

    it("should return empty array for builtin source", async () => {
      discovery = new SkillDiscovery({ workspacePath: WORKSPACE_PATH });

      const locations = await discovery.discoverSource("builtin");

      // Builtin skills are not discovered from filesystem
      expect(locations).toHaveLength(0);
    });

    it("should return empty array when workspace path not set", async () => {
      discovery = new SkillDiscovery(); // No workspace path

      const locations = await discovery.discoverSource("workspace");

      expect(locations).toHaveLength(0);
    });

    it("should skip hidden directories", async () => {
      discovery = new SkillDiscovery({ workspacePath: WORKSPACE_PATH });

      const skillsPath = path.normalize(path.join(WORKSPACE_PATH, ".vellum", "skills"));
      const visibleSkillPath = path.normalize(path.join(skillsPath, "visible-skill"));

      vi.mocked(fs.stat).mockImplementation(async (p) => {
        const pathStr = path.normalize(p.toString());
        if (pathStr === skillsPath || pathStr === visibleSkillPath) {
          return createMockStat(true, false); // isDir=true
        }
        if (pathStr.endsWith("SKILL.md")) {
          return createMockStat(false, true); // isFile=true
        }
        throw new Error("ENOENT");
      });

      vi.mocked(fs.readdir).mockResolvedValue([
        createDirent(".hidden-skill", "dir"),
        createDirent("_private-skill", "dir"),
        createDirent("visible-skill", "dir"),
        // biome-ignore lint/suspicious/noExplicitAny: Mock fs.Dirent[] for testing
      ] as any);

      const locations = await discovery.discoverSource("workspace");

      expect(locations).toHaveLength(1);
      expect(locations[0]?.path).toContain("visible-skill");
    });

    it("should skip directories without SKILL.md", async () => {
      discovery = new SkillDiscovery({ workspacePath: WORKSPACE_PATH });

      const skillsPath = path.normalize(path.join(WORKSPACE_PATH, ".vellum", "skills"));
      const skillPath = path.normalize(path.join(skillsPath, "no-manifest"));

      vi.mocked(fs.stat).mockImplementation(async (p) => {
        const pathStr = path.normalize(p.toString());
        if (pathStr === skillsPath || pathStr === skillPath) {
          return createMockStat(true, false); // isDir=true
        }
        // No SKILL.md file
        throw new Error("ENOENT");
      });

      vi.mocked(fs.readdir).mockResolvedValue([createDirent("no-manifest", "dir")]);

      const locations = await discovery.discoverSource("workspace");

      expect(locations).toHaveLength(0);
    });

    it("should follow symbolic links when enabled", async () => {
      discovery = new SkillDiscovery({
        workspacePath: WORKSPACE_PATH,
        followSymlinks: true,
      });

      const skillsPath = path.normalize(path.join(WORKSPACE_PATH, ".vellum", "skills"));
      const symlinkPath = path.normalize(path.join(skillsPath, "symlink-skill"));

      vi.mocked(fs.stat).mockImplementation(async (p) => {
        const pathStr = path.normalize(p.toString());
        if (pathStr === skillsPath || pathStr === symlinkPath) {
          return createMockStat(true, false); // isDir=true
        }
        if (pathStr.endsWith("SKILL.md")) {
          return createMockStat(false, true); // isFile=true
        }
        throw new Error("ENOENT");
      });

      vi.mocked(fs.readdir).mockResolvedValue([createDirent("symlink-skill", "symlink")]);

      const locations = await discovery.discoverSource("workspace");

      expect(locations).toHaveLength(1);
    });
  });

  // ===========================================================================
  // deduplicateByName Tests
  // ===========================================================================

  describe("deduplicateByName", () => {
    it("should keep highest priority skill when names conflict", () => {
      discovery = new SkillDiscovery();

      const locations: SkillLocation[] = [
        {
          path: "/workspace/.vellum/skills/common-skill",
          manifestPath: "/workspace/.vellum/skills/common-skill/SKILL.md",
          source: "workspace",
          priority: SKILL_SOURCE_PRIORITY.workspace,
        },
        {
          path: "/home/user/.vellum/skills/common-skill",
          manifestPath: "/home/user/.vellum/skills/common-skill/SKILL.md",
          source: "user",
          priority: SKILL_SOURCE_PRIORITY.user,
        },
        {
          path: "/workspace/.github/skills/common-skill",
          manifestPath: "/workspace/.github/skills/common-skill/SKILL.md",
          source: "global",
          priority: SKILL_SOURCE_PRIORITY.global,
        },
      ];

      const deduplicated = discovery.deduplicateByName(locations);

      expect(deduplicated).toHaveLength(1);
      expect(deduplicated[0]?.source).toBe("workspace"); // Highest priority
    });

    it("should keep unique skills from different sources", () => {
      discovery = new SkillDiscovery();

      const locations: SkillLocation[] = [
        {
          path: "/workspace/.vellum/skills/workspace-skill",
          manifestPath: "/workspace/.vellum/skills/workspace-skill/SKILL.md",
          source: "workspace",
          priority: SKILL_SOURCE_PRIORITY.workspace,
        },
        {
          path: "/home/user/.vellum/skills/user-skill",
          manifestPath: "/home/user/.vellum/skills/user-skill/SKILL.md",
          source: "user",
          priority: SKILL_SOURCE_PRIORITY.user,
        },
        {
          path: "/workspace/.github/skills/global-skill",
          manifestPath: "/workspace/.github/skills/global-skill/SKILL.md",
          source: "global",
          priority: SKILL_SOURCE_PRIORITY.global,
        },
      ];

      const deduplicated = discovery.deduplicateByName(locations);

      expect(deduplicated).toHaveLength(3);
    });

    it("should handle empty locations array", () => {
      discovery = new SkillDiscovery();

      const deduplicated = discovery.deduplicateByName([]);

      expect(deduplicated).toHaveLength(0);
    });

    it("should use directory name for skill identification", () => {
      discovery = new SkillDiscovery();

      const locations: SkillLocation[] = [
        {
          path: "/path/a/skills/my-skill",
          manifestPath: "/path/a/skills/my-skill/SKILL.md",
          source: "workspace",
          priority: 100,
        },
        {
          path: "/path/b/skills/my-skill",
          manifestPath: "/path/b/skills/my-skill/SKILL.md",
          source: "user",
          priority: 75,
        },
      ];

      const deduplicated = discovery.deduplicateByName(locations);

      expect(deduplicated).toHaveLength(1);
      // Should keep the one with higher priority
      expect(deduplicated[0]?.priority).toBe(100);
    });
  });

  // ===========================================================================
  // Custom Paths Tests
  // ===========================================================================

  describe("custom paths", () => {
    it("should use custom workspace path when provided", async () => {
      const customPath = path.normalize("/custom/workspace/skills");
      discovery = new SkillDiscovery({
        workspacePath: WORKSPACE_PATH,
        customPaths: { workspace: customPath },
      });

      const skillPath = path.normalize(path.join(customPath, "custom-skill"));

      vi.mocked(fs.stat).mockImplementation(async (p) => {
        const pathStr = path.normalize(p.toString());
        if (pathStr === customPath || pathStr === skillPath) {
          return createMockStat(true, false); // isDir=true
        }
        if (pathStr.endsWith("SKILL.md")) {
          return createMockStat(false, true); // isFile=true
        }
        throw new Error("ENOENT");
      });

      vi.mocked(fs.readdir).mockResolvedValue([createDirent("custom-skill", "dir")]);

      const locations = await discovery.discoverSource("workspace");

      expect(locations).toHaveLength(1);
      expect(locations[0]?.path).toContain("custom-skill");
    });
  });

  // ===========================================================================
  // Priority Ordering Tests
  // ===========================================================================

  describe("priority ordering", () => {
    it("should assign correct priorities to sources", () => {
      expect(SKILL_SOURCE_PRIORITY.workspace).toBe(100);
      expect(SKILL_SOURCE_PRIORITY.user).toBe(75);
      expect(SKILL_SOURCE_PRIORITY.global).toBe(50);
      expect(SKILL_SOURCE_PRIORITY.builtin).toBe(25);

      // Ensure workspace > user > global > builtin
      expect(SKILL_SOURCE_PRIORITY.workspace).toBeGreaterThan(SKILL_SOURCE_PRIORITY.user);
      expect(SKILL_SOURCE_PRIORITY.user).toBeGreaterThan(SKILL_SOURCE_PRIORITY.global);
      expect(SKILL_SOURCE_PRIORITY.global).toBeGreaterThan(SKILL_SOURCE_PRIORITY.builtin);
    });
  });
});
