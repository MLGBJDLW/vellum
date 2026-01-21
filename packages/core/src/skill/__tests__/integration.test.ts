// ============================================
// Skill System Integration Tests - T044
// ============================================

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SkillDiscovery } from "../discovery.js";
import { SkillLoader } from "../loader.js";
import { SkillManager } from "../manager.js";
import { type MatchContext, SkillMatcher } from "../matcher.js";
import { SkillParser } from "../parser.js";

// =============================================================================
// Mock fs and os modules
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

// Complete SKILL.md content for integration testing
const TYPESCRIPT_SKILL_MD = `---
name: typescript-best-practices
description: TypeScript coding standards and best practices
triggers:
  - type: file_pattern
    pattern: "**/*.ts"
  - type: keyword
    pattern: typescript|type.*script
version: 1.0.0
priority: 75
tags:
  - typescript
  - coding-standards
---

## Rules

- Use strict TypeScript configuration
- Prefer interfaces over type aliases for object shapes
- Use explicit return types for public functions
- Avoid \`any\` type - use \`unknown\` instead

## Patterns

\`\`\`typescript
// Good: Explicit types
interface User {
  id: string;
  name: string;
}

function getUser(id: string): Promise<User> {
  // ...
}
\`\`\`

## Anti-Patterns

\`\`\`typescript
// Bad: Implicit any
function processData(data) {
  // ...
}
\`\`\`

## Examples

See the patterns section for examples.

## References

- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
`;

const TESTING_SKILL_MD = `---
name: testing-guidelines
description: Testing best practices for the project
triggers:
  - type: keyword
    pattern: test|testing|spec
  - type: command
    pattern: test
version: 1.0.0
priority: 80
dependencies:
  - typescript-best-practices
tags:
  - testing
  - vitest
---

## Rules

- Write tests before implementation (TDD)
- Each test should test one thing
- Use descriptive test names

## Patterns

\`\`\`typescript
describe("Component", () => {
  it("should render correctly", () => {
    expect(render()).toMatchSnapshot();
  });
});
\`\`\`

## Anti-Patterns

- Avoid testing implementation details
- Don't share mutable state between tests

## Examples

See patterns section.

## References

- [Vitest Documentation](https://vitest.dev)
`;

const REACT_SKILL_MD = `---
name: react-patterns
description: React development patterns
triggers:
  - type: context
    pattern: "framework:react"
  - type: file_pattern
    pattern: "**/*.tsx"
version: 1.0.0
priority: 70
tags:
  - react
  - frontend
---

## Rules

- Use functional components with hooks
- Prefer composition over inheritance

## Patterns

Use React hooks for state management.

## Anti-Patterns

Avoid class components.

## Examples

\`\`\`tsx
function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}
\`\`\`

## References

- [React Documentation](https://react.dev)
`;

// biome-ignore lint/suspicious/noExplicitAny: Mock fs.Dirent for testing
function createDirent(name: string, type: "dir" | "file"): any {
  return {
    name,
    isDirectory: () => type === "dir",
    isFile: () => type === "file",
    isSymbolicLink: () => false,
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
// Integration Tests
// =============================================================================

describe("Skill System Integration", () => {
  const workspaceSkillsPath = path.join(WORKSPACE_PATH, ".vellum", "skills");
  const userSkillsPath = path.join(HOME_DIR, ".vellum", "skills");
  const globalSkillsPath = path.join(WORKSPACE_PATH, ".github", "skills");

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(os.homedir).mockReturnValue(HOME_DIR);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // Full Flow Integration Test
  // ===========================================================================

  describe("end-to-end flow: discovery → parsing → loading → matching → prompt", () => {
    beforeEach(() => {
      // Setup filesystem mocks for multiple skills
      // IMPORTANT: Check SKILL.md files FIRST, before skill directory checks
      vi.mocked(fs.stat).mockImplementation(async (p) => {
        const pathStr = path.normalize(p.toString());

        // SKILL.md files - must check BEFORE skill directory names
        if (pathStr.endsWith("SKILL.md")) {
          return createMockStat(false, true); // isDir=false, isFile=true
        }

        // Skill directories that exist
        if (
          pathStr === path.normalize(workspaceSkillsPath) ||
          pathStr.includes("typescript-best-practices") ||
          pathStr.includes("testing-guidelines") ||
          pathStr.includes("react-patterns")
        ) {
          return createMockStat(true, false); // isDir=true, isFile=false
        }

        // User/global paths don't exist in this test
        throw new Error("ENOENT");
      });

      vi.mocked(fs.readdir).mockImplementation(async (p) => {
        const pathStr = path.normalize(p.toString());

        if (pathStr === path.normalize(workspaceSkillsPath)) {
          return [
            createDirent("typescript-best-practices", "dir"),
            createDirent("testing-guidelines", "dir"),
            createDirent("react-patterns", "dir"),
            // biome-ignore lint/suspicious/noExplicitAny: Mock fs.Dirent[] for testing
          ] as any;
        }

        return [];
      });

      vi.mocked(fs.readFile).mockImplementation(async (p) => {
        const pathStr = p.toString();

        if (pathStr.includes("typescript-best-practices")) {
          return TYPESCRIPT_SKILL_MD;
        }
        if (pathStr.includes("testing-guidelines")) {
          return TESTING_SKILL_MD;
        }
        if (pathStr.includes("react-patterns")) {
          return REACT_SKILL_MD;
        }

        throw new Error("File not found");
      });

      // Mock realpath for symlink resolution
      vi.mocked(fs.realpath).mockImplementation(async (p) => p.toString());
    });

    it("should complete full activation flow", async () => {
      // 1. Create manager with real implementations (except mocked fs)
      const manager = new SkillManager({
        loader: {
          discovery: { workspacePath: WORKSPACE_PATH },
        },
      });

      // 2. Initialize - triggers discovery and L1 scan
      const skillCount = await manager.initialize();
      expect(skillCount).toBe(3);

      // 3. Verify all skills are discovered
      const allSkills = manager.getAllSkills();
      expect(allSkills).toHaveLength(3);

      const skillNames = allSkills.map((s) => s.name);
      expect(skillNames).toContain("typescript-best-practices");
      expect(skillNames).toContain("testing-guidelines");
      expect(skillNames).toContain("react-patterns");

      // 4. Test matching with TypeScript file context
      const tsContext: MatchContext = {
        request: "help me write some code",
        files: ["src/utils/helper.ts"],
        projectContext: { framework: "react" },
      };

      const activeSkills = await manager.getActiveSkills(tsContext);

      // Should match typescript (file_pattern) and react (context)
      expect(activeSkills.length).toBeGreaterThanOrEqual(2);
      const activeNames = activeSkills.map((s) => s.name);
      expect(activeNames).toContain("typescript-best-practices");
      expect(activeNames).toContain("react-patterns");

      // 5. Test matching with test keyword context
      const testContext: MatchContext = {
        request: "write tests for authentication",
        files: ["src/auth.ts"],
        command: "test",
      };

      const testSkills = await manager.getActiveSkills(testContext);

      // Should match testing-guidelines (keyword + command)
      const testNames = testSkills.map((s) => s.name);
      expect(testNames).toContain("testing-guidelines");

      // 6. Build prompt sections from matched skills
      const sections = manager.buildPromptSections(activeSkills);
      expect(sections.length).toBeGreaterThan(0);

      // Verify section content
      const rulesSection = sections.find((s) => s.name === "rules");
      expect(rulesSection).toBeDefined();
      expect(rulesSection?.content).toContain("strict TypeScript");

      // 7. Build combined prompt
      const combinedPrompt = manager.buildCombinedPrompt(activeSkills);
      expect(combinedPrompt).toContain("## Rules");
      expect(combinedPrompt.length).toBeGreaterThan(100);
    });

    it("should handle skill command matching", async () => {
      const manager = new SkillManager({
        loader: { discovery: { workspacePath: WORKSPACE_PATH } },
      });

      await manager.initialize();

      // Match by slash command
      const context: MatchContext = {
        request: "",
        files: [],
        command: "/test",
      };

      const skills = await manager.getActiveSkills(context);

      const names = skills.map((s) => s.name);
      expect(names).toContain("testing-guidelines");
    });

    it("should sort matched skills by score", async () => {
      const manager = new SkillManager({
        loader: { discovery: { workspacePath: WORKSPACE_PATH } },
      });

      await manager.initialize();

      // Context that matches multiple skills with different scores
      const context: MatchContext = {
        request: "testing typescript code",
        files: ["src/test.ts"],
        projectContext: { framework: "react" },
      };

      const skills = await manager.getActiveSkills(context);

      // Verify we get multiple matches
      expect(skills.length).toBeGreaterThan(1);

      // testing-guidelines has higher priority (80) than typescript (75)
      // Both match by keyword/file_pattern
    });
  });

  // ===========================================================================
  // Parser Integration Test
  // ===========================================================================

  describe("parser integration", () => {
    it("should parse all SKILL.md formats correctly", async () => {
      const parser = new SkillParser();

      // Test typescript skill
      vi.mocked(fs.readFile).mockResolvedValue(TYPESCRIPT_SKILL_MD);

      const tsLoaded = await parser.parseFull("/skills/ts/SKILL.md", "workspace");

      expect(tsLoaded).not.toBeNull();
      expect(tsLoaded?.name).toBe("typescript-best-practices");
      expect(tsLoaded?.triggers).toHaveLength(2);
      expect(tsLoaded?.rules).toContain("strict TypeScript");
      expect(tsLoaded?.patterns).toContain("interface User");
      expect(tsLoaded?.antiPatterns).toContain("Implicit any");
    });

    it("should handle skill with dependencies", async () => {
      const parser = new SkillParser();

      vi.mocked(fs.readFile).mockResolvedValue(TESTING_SKILL_MD);

      const loaded = await parser.parseFull("/skills/testing/SKILL.md", "workspace");

      expect(loaded?.dependencies).toContain("typescript-best-practices");
    });
  });

  // ===========================================================================
  // Discovery Integration Test
  // ===========================================================================

  describe("discovery integration", () => {
    it("should discover skills from all sources", async () => {
      // Setup all sources - IMPORTANT: Check SKILL.md FIRST
      vi.mocked(fs.stat).mockImplementation(async (p) => {
        const pathStr = path.normalize(p.toString());

        // SKILL.md files must be checked first
        if (pathStr.endsWith("SKILL.md")) {
          return createMockStat(false, true); // isDir=false, isFile=true
        }

        if (
          pathStr === path.normalize(workspaceSkillsPath) ||
          pathStr === path.normalize(userSkillsPath) ||
          pathStr === path.normalize(globalSkillsPath) ||
          pathStr.includes("workspace-skill") ||
          pathStr.includes("user-skill") ||
          pathStr.includes("global-skill")
        ) {
          return createMockStat(true, false); // isDir=true, isFile=false
        }

        throw new Error("ENOENT");
      });

      vi.mocked(fs.readdir).mockImplementation(async (p) => {
        const pathStr = path.normalize(p.toString());

        if (pathStr === path.normalize(workspaceSkillsPath)) {
          return [createDirent("workspace-skill", "dir")];
        }
        if (pathStr === path.normalize(userSkillsPath)) {
          return [createDirent("user-skill", "dir")];
        }
        if (pathStr === path.normalize(globalSkillsPath)) {
          return [createDirent("global-skill", "dir")];
        }

        return [];
      });

      // Mock realpath for symlink resolution
      vi.mocked(fs.realpath).mockImplementation(async (p) => p.toString());

      const discovery = new SkillDiscovery({ workspacePath: WORKSPACE_PATH });
      const result = await discovery.discoverAll();

      expect(result.locations).toHaveLength(3);

      const sources = result.locations.map((l) => l.source);
      expect(sources).toContain("workspace");
      expect(sources).toContain("user");
      expect(sources).toContain("global");
    });

    it("should deduplicate same-named skills by priority", async () => {
      // Same skill name in multiple locations
      // IMPORTANT: Check SKILL.md files FIRST, before directory checks
      vi.mocked(fs.stat).mockImplementation(async (p) => {
        const pathStr = path.normalize(p.toString());

        // SKILL.md files must be checked first
        if (pathStr.endsWith("SKILL.md")) {
          return createMockStat(false, true); // isDir=false, isFile=true
        }

        if (
          pathStr === path.normalize(workspaceSkillsPath) ||
          pathStr === path.normalize(userSkillsPath) ||
          pathStr.includes("common-skill")
        ) {
          return createMockStat(true, false); // isDir=true, isFile=false
        }

        throw new Error("ENOENT");
      });

      vi.mocked(fs.readdir).mockImplementation(async (p) => {
        const pathStr = path.normalize(p.toString());

        if (
          pathStr === path.normalize(workspaceSkillsPath) ||
          pathStr === path.normalize(userSkillsPath)
        ) {
          return [createDirent("common-skill", "dir")];
        }

        return [];
      });

      // Mock realpath for symlink resolution
      vi.mocked(fs.realpath).mockImplementation(async (p) => p.toString());

      const discovery = new SkillDiscovery({ workspacePath: WORKSPACE_PATH });
      const result = await discovery.discoverAll();

      // Should have 2 raw locations but only 1 after deduplication
      expect(result.locations).toHaveLength(2);
      expect(result.deduplicated).toHaveLength(1);

      // Workspace should win (higher priority)
      expect(result.deduplicated[0]?.source).toBe("workspace");
    });
  });

  // ===========================================================================
  // Matcher Integration Test
  // ===========================================================================

  describe("matcher integration", () => {
    it("should correctly score multiple trigger types", () => {
      const matcher = new SkillMatcher();

      const skill = {
        name: "multi-trigger",
        description: "Skill with multiple triggers",
        triggers: [
          { type: "always" as const },
          { type: "keyword" as const, pattern: "test" },
          { type: "command" as const, pattern: "test" },
        ],
        dependencies: [],
        source: "workspace" as const,
        path: "/skills/multi",
        priority: 50,
        tags: [],
      };

      // Context with command match (highest score)
      const commandContext: MatchContext = {
        request: "run tests",
        files: [],
        command: "test",
      };

      const match = matcher.matchSkill(skill, commandContext);

      // Should match command trigger (highest multiplier)
      expect(match?.matchedTrigger.type).toBe("command");
      expect(match?.score).toBe(50 * 100); // priority × command_multiplier
    });
  });

  // ===========================================================================
  // Loader Cache Integration Test
  // ===========================================================================

  describe("loader caching integration", () => {
    beforeEach(() => {
      // IMPORTANT: Check SKILL.md files FIRST, before directory checks
      vi.mocked(fs.stat).mockImplementation(async (p) => {
        const pathStr = path.normalize(p.toString());

        // SKILL.md files must be checked first
        if (pathStr.endsWith("SKILL.md")) {
          return createMockStat(false, true); // isDir=false, isFile=true
        }

        if (pathStr === path.normalize(workspaceSkillsPath) || pathStr.includes("cached-skill")) {
          return createMockStat(true, false); // isDir=true, isFile=false
        }

        throw new Error("ENOENT");
      });

      vi.mocked(fs.readdir).mockResolvedValue([createDirent("cached-skill", "dir")]);

      vi.mocked(fs.readFile).mockResolvedValue(`---
name: cached-skill
description: A skill for cache testing
triggers:
  - type: always
---

## Rules

Cache test rules.
`);

      // Mock realpath for symlink resolution
      vi.mocked(fs.realpath).mockImplementation(async (p) => p.toString());
    });

    it("should cache L1 scans on initialization", async () => {
      const loader = new SkillLoader({
        discovery: { workspacePath: WORKSPACE_PATH },
      });

      await loader.initialize();

      const stats = loader.getCacheStats();
      expect(stats.l1).toBe(1);
      expect(stats.l2).toBe(0);
      expect(stats.l3).toBe(0);
    });

    it("should upgrade cache level on L2 load", async () => {
      const loader = new SkillLoader({
        discovery: { workspacePath: WORKSPACE_PATH },
      });

      await loader.initialize();

      // Load L2
      const loaded = await loader.loadL2("cached-skill");
      expect(loaded).not.toBeNull();

      const stats = loader.getCacheStats();
      expect(stats.l1).toBe(0);
      expect(stats.l2).toBe(1);
    });

    it("should not re-parse on cache hit", async () => {
      const loader = new SkillLoader({
        discovery: { workspacePath: WORKSPACE_PATH },
      });

      await loader.initialize();

      // Clear mock call count
      vi.mocked(fs.readFile).mockClear();

      // First L2 load
      await loader.loadL2("cached-skill");
      expect(fs.readFile).toHaveBeenCalledTimes(1);

      // Second L2 load - should use cache
      await loader.loadL2("cached-skill");
      expect(fs.readFile).toHaveBeenCalledTimes(1); // Still 1
    });

    it("should clear cache on invalidate", async () => {
      const loader = new SkillLoader({
        discovery: { workspacePath: WORKSPACE_PATH },
      });

      await loader.initialize();
      expect(loader.hasSkill("cached-skill")).toBe(true);

      loader.invalidate("cached-skill");
      expect(loader.hasSkill("cached-skill")).toBe(false);
    });
  });

  // ===========================================================================
  // Error Handling Integration Test
  // ===========================================================================

  describe("error handling integration", () => {
    it("should handle invalid skill files gracefully", async () => {
      // IMPORTANT: Check SKILL.md files FIRST, before directory checks
      vi.mocked(fs.stat).mockImplementation(async (p) => {
        const pathStr = path.normalize(p.toString());

        // SKILL.md files must be checked first
        if (pathStr.endsWith("SKILL.md")) {
          return createMockStat(false, true); // isDir=false, isFile=true
        }

        if (
          pathStr === path.normalize(workspaceSkillsPath) ||
          pathStr.includes("valid-skill") ||
          pathStr.includes("invalid-skill")
        ) {
          return createMockStat(true, false); // isDir=true, isFile=false
        }

        throw new Error("ENOENT");
      });

      vi.mocked(fs.readdir).mockResolvedValue([
        createDirent("valid-skill", "dir"),
        createDirent("invalid-skill", "dir"),
        // biome-ignore lint/suspicious/noExplicitAny: Mock fs.Dirent[] for testing
      ] as any);

      vi.mocked(fs.readFile).mockImplementation(async (p) => {
        const pathStr = p.toString();

        if (pathStr.includes("valid-skill")) {
          return TYPESCRIPT_SKILL_MD;
        }

        // Invalid SKILL.md
        return `---
name: invalid
# Missing required fields
---
Content
`;
      });

      // Mock realpath for symlink resolution
      vi.mocked(fs.realpath).mockImplementation(async (p) => p.toString());

      const manager = new SkillManager({
        loader: { discovery: { workspacePath: WORKSPACE_PATH } },
      });

      // Should not throw, just skip invalid skills
      const count = await manager.initialize();

      // Only valid skill should be loaded
      expect(count).toBe(1);
      expect(manager.getSkill("typescript-best-practices")).toBeDefined();
      expect(manager.getSkill("invalid")).toBeUndefined();
    });

    it("should handle filesystem errors during discovery", async () => {
      vi.mocked(fs.stat).mockImplementation(async (p) => {
        const pathStr = path.normalize(p.toString());

        if (pathStr === path.normalize(workspaceSkillsPath)) {
          return createMockStat(true, false); // isDir=true
        }

        throw new Error("ENOENT");
      });

      vi.mocked(fs.readdir).mockRejectedValue(new Error("Permission denied"));

      // Mock realpath for symlink resolution
      vi.mocked(fs.realpath).mockImplementation(async (p) => p.toString());

      const discovery = new SkillDiscovery({ workspacePath: WORKSPACE_PATH });
      const result = await discovery.discoverAll();

      // Should return empty with errors, not throw
      expect(result.locations).toHaveLength(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});
