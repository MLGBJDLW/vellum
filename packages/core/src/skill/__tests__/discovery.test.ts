// ============================================
// Skill Discovery Tests - T040
// ============================================

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  SKILL_NAME_MAX_LENGTH,
  SKILL_NAME_MIN_LENGTH,
  SKILL_NAME_PATTERN,
  SkillDiscovery,
  validateSkillName,
} from "../discovery.js";
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

// =============================================================================
// Skill Name Validation Tests
// =============================================================================

describe("validateSkillName", () => {
  describe("valid names", () => {
    it("should accept lowercase letters", () => {
      expect(validateSkillName("myskill")).toEqual({ valid: true });
    });

    it("should accept lowercase letters with hyphens", () => {
      expect(validateSkillName("my-skill")).toEqual({ valid: true });
    });

    it("should accept numbers", () => {
      expect(validateSkillName("skill123")).toEqual({ valid: true });
    });

    it("should accept numbers with hyphens", () => {
      expect(validateSkillName("skill-123-test")).toEqual({ valid: true });
    });

    it("should accept single character", () => {
      expect(validateSkillName("a")).toEqual({ valid: true });
    });

    it("should accept 64 character name", () => {
      const name = "a".repeat(64);
      expect(validateSkillName(name)).toEqual({ valid: true });
    });

    it("should accept complex valid names", () => {
      expect(validateSkillName("typescript-best-practices")).toEqual({ valid: true });
      expect(validateSkillName("react-hooks-guide")).toEqual({ valid: true });
      expect(validateSkillName("code-review-v2")).toEqual({ valid: true });
    });
  });

  describe("invalid names", () => {
    it("should reject empty string", () => {
      const result = validateSkillName("");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("required");
    });

    it("should reject names over 64 characters", () => {
      const name = "a".repeat(65);
      const result = validateSkillName(name);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("at most 64");
    });

    it("should reject uppercase letters", () => {
      const result = validateSkillName("MySkill");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("lowercase");
    });

    it("should reject names starting with hyphen", () => {
      const result = validateSkillName("-myskill");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("start or end with hyphen");
    });

    it("should reject names ending with hyphen", () => {
      const result = validateSkillName("myskill-");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("start or end with hyphen");
    });

    it("should reject consecutive hyphens", () => {
      const result = validateSkillName("my--skill");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("consecutive hyphens");
    });

    it("should reject underscores", () => {
      const result = validateSkillName("my_skill");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("only lowercase");
    });

    it("should reject spaces", () => {
      const result = validateSkillName("my skill");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("only lowercase");
    });

    it("should reject special characters", () => {
      const result = validateSkillName("my@skill");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("only lowercase");
    });
  });
});

describe("Skill Name Constants", () => {
  it("should have correct min length", () => {
    expect(SKILL_NAME_MIN_LENGTH).toBe(1);
  });

  it("should have correct max length", () => {
    expect(SKILL_NAME_MAX_LENGTH).toBe(64);
  });

  it("should have correct pattern", () => {
    expect(SKILL_NAME_PATTERN.test("valid-name")).toBe(true);
    expect(SKILL_NAME_PATTERN.test("INVALID")).toBe(false);
  });
});

// =============================================================================
// SkillDiscovery Tests
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

      vi.mocked(fs.realpath).mockImplementation(async (p) => p.toString());

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

      vi.mocked(fs.realpath).mockImplementation(async (p) => p.toString());

      const result = await discovery.discoverSource("workspace");

      expect(result.locations).toHaveLength(1);
      expect(result.locations[0]?.source).toBe("workspace");
      expect(result.locations[0]?.priority).toBe(SKILL_SOURCE_PRIORITY.workspace);
      expect(result.locations[0]?.path).toContain("my-skill");
      expect(result.locations[0]?.manifestPath).toContain("SKILL.md");
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

      vi.mocked(fs.realpath).mockImplementation(async (p) => p.toString());

      const result = await discovery.discoverSource("user");

      expect(result.locations).toHaveLength(1);
      expect(result.locations[0]?.source).toBe("user");
      expect(result.locations[0]?.priority).toBe(SKILL_SOURCE_PRIORITY.user);
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

      vi.mocked(fs.realpath).mockImplementation(async (p) => p.toString());

      const result = await discovery.discoverSource("global");

      expect(result.locations).toHaveLength(1);
      expect(result.locations[0]?.source).toBe("global");
      expect(result.locations[0]?.priority).toBe(SKILL_SOURCE_PRIORITY.global);
    });

    it("should return empty array for builtin source", async () => {
      discovery = new SkillDiscovery({ workspacePath: WORKSPACE_PATH });

      const result = await discovery.discoverSource("builtin");

      // Builtin skills are not discovered from filesystem
      expect(result.locations).toHaveLength(0);
    });

    it("should return empty array when workspace path not set", async () => {
      discovery = new SkillDiscovery(); // No workspace path

      const result = await discovery.discoverSource("workspace");

      expect(result.locations).toHaveLength(0);
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

      vi.mocked(fs.realpath).mockImplementation(async (p) => p.toString());

      const result = await discovery.discoverSource("workspace");

      expect(result.locations).toHaveLength(1);
      expect(result.locations[0]?.path).toContain("visible-skill");
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

      vi.mocked(fs.realpath).mockImplementation(async (p) => p.toString());

      const result = await discovery.discoverSource("workspace");

      expect(result.locations).toHaveLength(0);
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

      vi.mocked(fs.realpath).mockImplementation(async (p) => p.toString());

      const result = await discovery.discoverSource("workspace");

      expect(result.locations).toHaveLength(1);
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

      vi.mocked(fs.realpath).mockImplementation(async (p) => p.toString());

      const result = await discovery.discoverSource("workspace");

      expect(result.locations).toHaveLength(1);
      expect(result.locations[0]?.path).toContain("custom-skill");
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

  // ===========================================================================
  // Name Validation in Discovery Tests
  // ===========================================================================

  describe("name validation in discovery", () => {
    it("should reject skills with invalid names", async () => {
      discovery = new SkillDiscovery({ workspacePath: WORKSPACE_PATH });

      const skillsPath = path.normalize(path.join(WORKSPACE_PATH, ".vellum", "skills"));
      const validSkillPath = path.normalize(path.join(skillsPath, "valid-skill"));
      const invalidSkillPath = path.normalize(path.join(skillsPath, "Invalid-Skill"));

      vi.mocked(fs.stat).mockImplementation(async (p) => {
        const pathStr = path.normalize(p.toString());
        if (pathStr.endsWith("SKILL.md")) {
          return createMockStat(false, true);
        }
        if (pathStr === skillsPath || pathStr === validSkillPath || pathStr === invalidSkillPath) {
          return createMockStat(true, false);
        }
        throw new Error("ENOENT");
      });

      vi.mocked(fs.readdir).mockResolvedValue([
        createDirent("valid-skill", "dir"),
        createDirent("Invalid-Skill", "dir"), // uppercase - invalid
      ]);

      vi.mocked(fs.realpath).mockImplementation(async (p) => p.toString());

      const result = await discovery.discoverAll();

      expect(result.locations).toHaveLength(1);
      expect(result.locations[0]?.path).toContain("valid-skill");
      expect(result.validationErrors).toHaveLength(1);
      expect(result.validationErrors[0]?.name).toBe("Invalid-Skill");
      expect(result.validationErrors[0]?.error).toContain("lowercase");
    });

    it("should skip validation when validateNames is false", async () => {
      discovery = new SkillDiscovery({
        workspacePath: WORKSPACE_PATH,
        validateNames: false,
      });

      const skillsPath = path.normalize(path.join(WORKSPACE_PATH, ".vellum", "skills"));
      const invalidSkillPath = path.normalize(path.join(skillsPath, "Invalid-Skill"));

      vi.mocked(fs.stat).mockImplementation(async (p) => {
        const pathStr = path.normalize(p.toString());
        if (pathStr.endsWith("SKILL.md")) {
          return createMockStat(false, true);
        }
        if (pathStr === skillsPath || pathStr === invalidSkillPath) {
          return createMockStat(true, false);
        }
        throw new Error("ENOENT");
      });

      vi.mocked(fs.readdir).mockResolvedValue([createDirent("Invalid-Skill", "dir")]);

      vi.mocked(fs.realpath).mockImplementation(async (p) => p.toString());

      const result = await discovery.discoverAll();

      expect(result.locations).toHaveLength(1);
      expect(result.validationErrors).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Mode-Specific Discovery Tests
  // ===========================================================================

  describe("discoverForMode", () => {
    it("should discover mode-specific and general skills", async () => {
      discovery = new SkillDiscovery({ workspacePath: WORKSPACE_PATH });

      const generalSkillsPath = path.normalize(path.join(WORKSPACE_PATH, ".vellum", "skills"));
      const modeSkillsPath = path.normalize(path.join(WORKSPACE_PATH, ".vellum", "skills-code"));
      const generalSkillPath = path.normalize(path.join(generalSkillsPath, "general-skill"));
      const modeSkillPath = path.normalize(path.join(modeSkillsPath, "code-specific"));

      vi.mocked(fs.stat).mockImplementation(async (p) => {
        const pathStr = path.normalize(p.toString());
        if (pathStr.endsWith("SKILL.md")) {
          return createMockStat(false, true);
        }
        if (
          pathStr === generalSkillsPath ||
          pathStr === modeSkillsPath ||
          pathStr === generalSkillPath ||
          pathStr === modeSkillPath
        ) {
          return createMockStat(true, false);
        }
        throw new Error("ENOENT");
      });

      vi.mocked(fs.readdir).mockImplementation(async (p) => {
        const pathStr = path.normalize(p.toString());
        if (pathStr === modeSkillsPath) {
          return [createDirent("code-specific", "dir")];
        }
        if (pathStr === generalSkillsPath) {
          return [createDirent("general-skill", "dir")];
        }
        return [];
      });

      vi.mocked(fs.realpath).mockImplementation(async (p) => p.toString());

      const result = await discovery.discoverForMode("code");

      expect(result.locations.length).toBe(2);
      expect(result.deduplicated.length).toBe(2);

      // Mode-specific skill should have mode set
      const modeSkill = result.locations.find((l) => l.path.includes("code-specific"));
      expect(modeSkill?.mode).toBe("code");

      // General skill should not have mode set
      const generalSkill = result.locations.find((l) => l.path.includes("general-skill"));
      expect(generalSkill?.mode).toBeUndefined();
    });

    it("should override general skill with mode-specific skill of same name", async () => {
      discovery = new SkillDiscovery({ workspacePath: WORKSPACE_PATH });

      const generalSkillsPath = path.normalize(path.join(WORKSPACE_PATH, ".vellum", "skills"));
      const modeSkillsPath = path.normalize(path.join(WORKSPACE_PATH, ".vellum", "skills-code"));
      const generalSharedPath = path.normalize(path.join(generalSkillsPath, "shared-skill"));
      const modeSharedPath = path.normalize(path.join(modeSkillsPath, "shared-skill"));

      vi.mocked(fs.stat).mockImplementation(async (p) => {
        const pathStr = path.normalize(p.toString());
        if (pathStr.endsWith("SKILL.md")) {
          return createMockStat(false, true);
        }
        if (
          pathStr === generalSkillsPath ||
          pathStr === modeSkillsPath ||
          pathStr === generalSharedPath ||
          pathStr === modeSharedPath
        ) {
          return createMockStat(true, false);
        }
        throw new Error("ENOENT");
      });

      vi.mocked(fs.readdir).mockImplementation(async (p) => {
        const pathStr = path.normalize(p.toString());
        if (pathStr === modeSkillsPath) {
          return [createDirent("shared-skill", "dir")];
        }
        if (pathStr === generalSkillsPath) {
          return [createDirent("shared-skill", "dir")];
        }
        return [];
      });

      vi.mocked(fs.realpath).mockImplementation(async (p) => p.toString());

      const result = await discovery.discoverForMode("code");

      // Should find in both locations
      expect(result.locations.length).toBe(2);

      // But only 1 deduplicated (mode-specific wins due to priority boost)
      expect(result.deduplicated.length).toBe(1);
      expect(result.deduplicated[0]?.mode).toBe("code");
    });

    it("should prioritize workspace over user skills", async () => {
      discovery = new SkillDiscovery({ workspacePath: WORKSPACE_PATH });

      const workspaceModeSkillsPath = path.normalize(
        path.join(WORKSPACE_PATH, ".vellum", "skills-code")
      );
      const userModeSkillsPath = path.normalize(path.join(HOME_DIR, ".vellum", "skills-code"));
      const workspaceSkillPath = path.normalize(path.join(workspaceModeSkillsPath, "my-skill"));
      const userSkillPath = path.normalize(path.join(userModeSkillsPath, "my-skill"));

      vi.mocked(fs.stat).mockImplementation(async (p) => {
        const pathStr = path.normalize(p.toString());
        if (pathStr.endsWith("SKILL.md")) {
          return createMockStat(false, true);
        }
        if (
          pathStr === workspaceModeSkillsPath ||
          pathStr === userModeSkillsPath ||
          pathStr === workspaceSkillPath ||
          pathStr === userSkillPath
        ) {
          return createMockStat(true, false);
        }
        throw new Error("ENOENT");
      });

      vi.mocked(fs.readdir).mockImplementation(async (p) => {
        const pathStr = path.normalize(p.toString());
        if (pathStr === workspaceModeSkillsPath || pathStr === userModeSkillsPath) {
          return [createDirent("my-skill", "dir")];
        }
        return [];
      });

      vi.mocked(fs.realpath).mockImplementation(async (p) => p.toString());

      const result = await discovery.discoverForMode("code");

      // Should find in both locations
      expect(result.locations.length).toBe(2);

      // But deduplicated to workspace (higher priority)
      expect(result.deduplicated.length).toBe(1);
      expect(result.deduplicated[0]?.source).toBe("workspace");
    });
  });
});
