// ============================================
// Agents Merge Tests
// ============================================
// Unit tests for AGENTS.md config merging functionality.
// Covers T025, T026, T027.

import type { AgentsFrontmatter } from "@vellum/shared";
import { describe, expect, it } from "vitest";
import {
  createConfigFromResult,
  filterByScope,
  matchesScope,
  mergeConfigs,
  mergeSingleConfig,
} from "../merge.js";
import type { AgentsParseResult } from "../parser.js";
import type { AgentsConfig, AgentsScopeConfig } from "../types.js";

// ============================================
// Test Helpers
// ============================================

/**
 * Creates a minimal AgentsParseResult for testing.
 * Uses Partial for frontmatter to allow omitting defaults.
 */
function createParseResult(
  overrides: Omit<Partial<AgentsParseResult>, "frontmatter"> & {
    filePath: string;
    frontmatter?: Partial<AgentsFrontmatter> | null;
  }
): AgentsParseResult {
  const { frontmatter, ...rest } = overrides;
  return {
    frontmatter: frontmatter
      ? ({
          version: "1.0.0",
          priority: 0,
          ...frontmatter,
        } as AgentsFrontmatter)
      : null,
    instructions: "",
    allowedTools: [],
    sections: [],
    warnings: [],
    errors: [],
    ...rest,
  };
}

// ============================================
// T027: Scope Filtering Tests
// ============================================

describe("matchesScope", () => {
  it("should match when no file is specified", () => {
    const scope: AgentsScopeConfig = {
      include: ["src/**/*.ts"],
      exclude: [],
    };
    expect(matchesScope(undefined, scope)).toBe(true);
  });

  it("should match when no include patterns (match all)", () => {
    const scope: AgentsScopeConfig = {
      include: [],
      exclude: [],
    };
    expect(matchesScope("any/file.ts", scope)).toBe(true);
  });

  it("should match file against include pattern", () => {
    const scope: AgentsScopeConfig = {
      include: ["src/**/*.ts"],
      exclude: [],
    };
    expect(matchesScope("src/utils/helper.ts", scope)).toBe(true);
    expect(matchesScope("tests/helper.ts", scope)).toBe(false);
  });

  it("should exclude files matching exclude patterns", () => {
    const scope: AgentsScopeConfig = {
      include: ["src/**/*.ts"],
      exclude: ["**/*.test.ts"],
    };
    expect(matchesScope("src/utils/helper.ts", scope)).toBe(true);
    expect(matchesScope("src/utils/helper.test.ts", scope)).toBe(false);
  });

  it("should normalize Windows-style paths", () => {
    const scope: AgentsScopeConfig = {
      include: ["src/**/*.ts"],
      exclude: [],
    };
    expect(matchesScope("src\\utils\\helper.ts", scope)).toBe(true);
  });

  it("should handle multiple include patterns", () => {
    const scope: AgentsScopeConfig = {
      include: ["src/**/*.ts", "lib/**/*.ts"],
      exclude: [],
    };
    expect(matchesScope("src/index.ts", scope)).toBe(true);
    expect(matchesScope("lib/utils.ts", scope)).toBe(true);
    expect(matchesScope("tests/index.ts", scope)).toBe(false);
  });

  it("should give exclusions precedence over inclusions", () => {
    const scope: AgentsScopeConfig = {
      include: ["**/*.ts"],
      exclude: ["**/generated/**"],
    };
    expect(matchesScope("src/index.ts", scope)).toBe(true);
    expect(matchesScope("src/generated/types.ts", scope)).toBe(false);
  });

  it("should handle dot files when dot option is enabled", () => {
    const scope: AgentsScopeConfig = {
      include: ["**/*"],
      exclude: [],
    };
    expect(matchesScope(".eslintrc.js", scope)).toBe(true);
  });
});

describe("filterByScope", () => {
  it("should return empty array for empty configs", () => {
    const result = filterByScope([], "src/index.ts");
    expect(result).toEqual([]);
  });

  it("should filter configs by scope", () => {
    const configs = [
      createParseResult({
        filePath: "/project/AGENTS.md",
        frontmatter: {
          version: "1.0.0",
          scope: { include: ["src/**/*.ts"] },
        },
      }),
      createParseResult({
        filePath: "/project/tests/AGENTS.md",
        frontmatter: {
          version: "1.0.0",
          scope: { include: ["tests/**/*.ts"] },
        },
      }),
    ];

    const result = filterByScope(configs, "src/index.ts");
    expect(result).toHaveLength(1);
    expect(result[0]?.config.filePath).toBe("/project/AGENTS.md");
  });

  it("should track matched patterns", () => {
    const configs = [
      createParseResult({
        filePath: "/project/AGENTS.md",
        frontmatter: {
          version: "1.0.0",
          scope: { include: ["src/**/*.ts", "lib/**/*.ts"] },
        },
      }),
    ];

    const result = filterByScope(configs, "src/index.ts");
    expect(result[0]?.matchedPatterns).toContain("src/**/*.ts");
  });

  it("should use wildcard for configs with no include patterns", () => {
    const configs = [
      createParseResult({
        filePath: "/project/AGENTS.md",
        frontmatter: { version: "1.0.0" },
      }),
    ];

    const result = filterByScope(configs, "any/file.ts");
    expect(result).toHaveLength(1);
    expect(result[0]?.matchedPatterns).toContain("*");
  });
});

// ============================================
// T025: Basic Merging Tests
// ============================================

describe("mergeConfigs", () => {
  it("should return default config for empty array", () => {
    const result = mergeConfigs([]);

    expect(result.config.instructions).toBe("");
    expect(result.config.allowedTools).toEqual([]);
    expect(result.sources).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("should create config from single parse result", () => {
    const configs = [
      createParseResult({
        filePath: "/project/AGENTS.md",
        frontmatter: {
          version: "1.0.0",
          name: "Test Config",
          description: "Test description",
          priority: 10,
        },
        instructions: "Follow these rules.",
        allowedTools: [{ pattern: "read_file", negated: false }],
      }),
    ];

    const result = mergeConfigs(configs);

    expect(result.config.name).toBe("Test Config");
    expect(result.config.description).toBe("Test description");
    expect(result.config.version).toBe("1.0.0");
    expect(result.config.priority).toBe(10);
    expect(result.config.instructions).toBe("Follow these rules.");
    expect(result.config.allowedTools).toHaveLength(1);
    expect(result.sources).toEqual(["/project/AGENTS.md"]);
  });

  it("should merge multiple configs (child overrides parent scalars)", () => {
    const configs = [
      createParseResult({
        filePath: "/project/AGENTS.md",
        frontmatter: {
          version: "1.0.0",
          name: "Root Config",
          priority: 1,
        },
        instructions: "Root instructions.",
      }),
      createParseResult({
        filePath: "/project/src/AGENTS.md",
        frontmatter: {
          version: "1.0.0",
          name: "Src Config",
          priority: 5,
        },
        instructions: "Src instructions.",
      }),
    ];

    const result = mergeConfigs(configs);

    // Scalar values: last wins
    expect(result.config.name).toBe("Src Config");
    expect(result.config.priority).toBe(5);
    // Instructions: appended
    expect(result.config.instructions).toContain("Root instructions.");
    expect(result.config.instructions).toContain("Src instructions.");
    // Sources tracked
    expect(result.sources).toEqual(["/project/AGENTS.md", "/project/src/AGENTS.md"]);
  });

  it("should append allowed tools by default", () => {
    const configs = [
      createParseResult({
        filePath: "/project/AGENTS.md",
        allowedTools: [{ pattern: "read_file", negated: false }],
      }),
      createParseResult({
        filePath: "/project/src/AGENTS.md",
        allowedTools: [{ pattern: "write_file", negated: false }],
      }),
    ];

    const result = mergeConfigs(configs);

    expect(result.config.allowedTools).toHaveLength(2);
    expect(result.config.allowedTools[0]?.pattern).toBe("read_file");
    expect(result.config.allowedTools[1]?.pattern).toBe("write_file");
  });

  it("should filter by scope when currentFile is provided", () => {
    const configs = [
      createParseResult({
        filePath: "/project/AGENTS.md",
        frontmatter: {
          version: "1.0.0",
          scope: { include: ["src/**/*.ts"] },
        },
        instructions: "Src config.",
      }),
      createParseResult({
        filePath: "/project/tests/AGENTS.md",
        frontmatter: {
          version: "1.0.0",
          scope: { include: ["tests/**/*.ts"] },
        },
        instructions: "Tests config.",
      }),
    ];

    const result = mergeConfigs(configs, { currentFile: "src/index.ts" });

    expect(result.config.instructions).toBe("Src config.");
    expect(result.sources).toEqual(["/project/AGENTS.md"]);
    expect(result.appliedScopes).toContain("src/**/*.ts");
  });

  it("should return warning when no configs match scope", () => {
    const configs = [
      createParseResult({
        filePath: "/project/AGENTS.md",
        frontmatter: {
          version: "1.0.0",
          scope: { include: ["src/**/*.ts"] },
        },
      }),
    ];

    const result = mergeConfigs(configs, { currentFile: "other/file.js" });

    expect(result.sources).toEqual([]);
    expect(result.warnings.some((w) => w.message.includes("No configurations matched"))).toBe(true);
  });
});

// ============================================
// T026: Merge Strategy Tests
// ============================================

describe("mergeConfigs with strategies", () => {
  describe("strategy: extend (default)", () => {
    it("should extend parent with child values", () => {
      const configs = [
        createParseResult({
          filePath: "/project/AGENTS.md",
          frontmatter: { version: "1.0.0" },
          instructions: "Parent rules.",
          allowedTools: [{ pattern: "read_file", negated: false }],
        }),
        createParseResult({
          filePath: "/project/src/AGENTS.md",
          frontmatter: {
            version: "1.0.0",
            merge: { strategy: "extend", arrays: "append" },
          },
          instructions: "Child rules.",
          allowedTools: [{ pattern: "write_file", negated: false }],
        }),
      ];

      const result = mergeConfigs(configs);

      expect(result.config.instructions).toContain("Parent rules.");
      expect(result.config.instructions).toContain("Child rules.");
      expect(result.config.allowedTools).toHaveLength(2);
    });
  });

  describe("strategy: replace", () => {
    it("should completely replace parent config", () => {
      const configs = [
        createParseResult({
          filePath: "/project/AGENTS.md",
          frontmatter: {
            version: "1.0.0",
            name: "Parent",
          },
          instructions: "Parent rules.",
          allowedTools: [{ pattern: "read_file", negated: false }],
        }),
        createParseResult({
          filePath: "/project/src/AGENTS.md",
          frontmatter: {
            version: "2.0.0",
            name: "Child",
            merge: { strategy: "replace", arrays: "replace" },
          },
          instructions: "Child rules only.",
          allowedTools: [{ pattern: "write_file", negated: false }],
        }),
      ];

      const result = mergeConfigs(configs);

      expect(result.config.name).toBe("Child");
      expect(result.config.version).toBe("2.0.0");
      expect(result.config.instructions).toBe("Child rules only.");
      expect(result.config.instructions).not.toContain("Parent");
      expect(result.config.allowedTools).toHaveLength(1);
      expect(result.config.allowedTools[0]?.pattern).toBe("write_file");
      // Sources still tracked
      expect(result.sources).toContain("/project/AGENTS.md");
    });
  });

  describe("strategy: strict", () => {
    it("should merge but generate warnings on type mismatch", () => {
      const configs = [
        createParseResult({
          filePath: "/project/AGENTS.md",
          frontmatter: {
            version: "1.0.0",
          },
          instructions: "Parent rules.",
        }),
        createParseResult({
          filePath: "/project/src/AGENTS.md",
          frontmatter: {
            version: "1.0",
            merge: { strategy: "strict", arrays: "append" },
          },
          instructions: "Child rules.",
        }),
      ];

      const result = mergeConfigs(configs, { strict: true });

      // Still merges
      expect(result.config.instructions).toContain("Parent");
      // Generates warning about version format
      expect(result.warnings.some((w) => w.message.includes("Version format"))).toBe(true);
    });
  });

  describe("arrays: replace", () => {
    it("should replace parent array with child array", () => {
      const configs = [
        createParseResult({
          filePath: "/project/AGENTS.md",
          allowedTools: [
            { pattern: "read_file", negated: false },
            { pattern: "list_dir", negated: false },
          ],
        }),
        createParseResult({
          filePath: "/project/src/AGENTS.md",
          frontmatter: {
            version: "1.0.0",
            merge: { strategy: "extend", arrays: "replace" },
          },
          allowedTools: [{ pattern: "write_file", negated: false }],
        }),
      ];

      const result = mergeConfigs(configs);

      expect(result.config.allowedTools).toHaveLength(1);
      expect(result.config.allowedTools[0]?.pattern).toBe("write_file");
    });
  });
});

// ============================================
// mergeSingleConfig Tests
// ============================================

describe("mergeSingleConfig", () => {
  it("should merge child into parent config", () => {
    const parent: AgentsConfig = {
      name: "Parent",
      priority: 1,
      instructions: "Parent instructions.",
      allowedTools: [{ pattern: "read_file", negated: false }],
      merge: { strategy: "extend", arrays: "append" },
      scope: { include: [], exclude: [] },
      sources: ["/project/AGENTS.md"],
    };

    const child = createParseResult({
      filePath: "/project/src/AGENTS.md",
      frontmatter: {
        version: "1.0.0",
        name: "Child",
        priority: 5,
      },
      instructions: "Child instructions.",
      allowedTools: [{ pattern: "write_file", negated: false }],
    });

    const result = mergeSingleConfig(parent, child);

    expect(result.name).toBe("Child");
    expect(result.priority).toBe(5);
    expect(result.instructions).toContain("Parent instructions.");
    expect(result.instructions).toContain("Child instructions.");
    expect(result.allowedTools).toHaveLength(2);
    expect(result.sources).toEqual(["/project/AGENTS.md", "/project/src/AGENTS.md"]);
  });
});

// ============================================
// createConfigFromResult Tests
// ============================================

describe("createConfigFromResult", () => {
  it("should create config from single parse result", () => {
    const parseResult = createParseResult({
      filePath: "/project/AGENTS.md",
      frontmatter: {
        version: "1.0.0",
        name: "Test",
        description: "Description",
        priority: 10,
        scope: {
          include: ["src/**"],
          exclude: ["**/*.test.ts"],
        },
        merge: {
          strategy: "replace",
          arrays: "replace",
        },
      },
      instructions: "Test instructions.",
      allowedTools: [
        { pattern: "read_file", negated: false },
        { pattern: "bash", negated: true },
      ],
    });

    const config = createConfigFromResult(parseResult);

    expect(config.name).toBe("Test");
    expect(config.description).toBe("Description");
    expect(config.version).toBe("1.0.0");
    expect(config.priority).toBe(10);
    expect(config.instructions).toBe("Test instructions.");
    expect(config.allowedTools).toHaveLength(2);
    expect(config.merge.strategy).toBe("replace");
    expect(config.merge.arrays).toBe("replace");
    expect(config.scope.include).toEqual(["src/**"]);
    expect(config.scope.exclude).toEqual(["**/*.test.ts"]);
    expect(config.sources).toEqual(["/project/AGENTS.md"]);
  });

  it("should use defaults for missing frontmatter values", () => {
    const parseResult = createParseResult({
      filePath: "/project/AGENTS.md",
      instructions: "Instructions only.",
    });

    const config = createConfigFromResult(parseResult);

    expect(config.name).toBeUndefined();
    expect(config.description).toBeUndefined();
    expect(config.version).toBeUndefined();
    expect(config.priority).toBe(0);
    expect(config.merge.strategy).toBe("extend");
    expect(config.merge.arrays).toBe("append");
    expect(config.scope.include).toEqual([]);
    expect(config.scope.exclude).toEqual([]);
  });
});

// ============================================
// Edge Cases
// ============================================

describe("edge cases", () => {
  it("should handle null frontmatter gracefully", () => {
    const configs = [
      createParseResult({
        filePath: "/project/AGENTS.md",
        frontmatter: null,
        instructions: "Some instructions.",
      }),
    ];

    const result = mergeConfigs(configs);

    expect(result.config.instructions).toBe("Some instructions.");
    expect(result.config.name).toBeUndefined();
  });

  it("should handle empty instructions", () => {
    const configs = [
      createParseResult({
        filePath: "/project/AGENTS.md",
        instructions: "",
      }),
      createParseResult({
        filePath: "/project/src/AGENTS.md",
        instructions: "Child only.",
      }),
    ];

    const result = mergeConfigs(configs);

    expect(result.config.instructions).toBe("Child only.");
  });

  it("should deduplicate applied scopes", () => {
    const configs = [
      createParseResult({
        filePath: "/project/AGENTS.md",
        frontmatter: {
          version: "1.0.0",
          scope: { include: ["src/**/*.ts"] },
        },
      }),
      createParseResult({
        filePath: "/project/src/AGENTS.md",
        frontmatter: {
          version: "1.0.0",
          scope: { include: ["src/**/*.ts"] },
        },
      }),
    ];

    const result = mergeConfigs(configs, { currentFile: "src/index.ts" });

    // Should deduplicate the scope patterns
    const unique = [...new Set(result.appliedScopes)];
    expect(result.appliedScopes).toEqual(unique);
  });

  it("should collect warnings from all parse results", () => {
    const configs = [
      createParseResult({
        filePath: "/project/AGENTS.md",
        warnings: [{ file: "/project/AGENTS.md", message: "Warning 1", severity: "warn" }],
      }),
      createParseResult({
        filePath: "/project/src/AGENTS.md",
        warnings: [{ file: "/project/src/AGENTS.md", message: "Warning 2", severity: "warn" }],
      }),
    ];

    const result = mergeConfigs(configs);

    expect(result.warnings).toHaveLength(2);
    expect(result.warnings.some((w) => w.message === "Warning 1")).toBe(true);
    expect(result.warnings.some((w) => w.message === "Warning 2")).toBe(true);
  });
});
