// ============================================
// Tool Allowlist Filter Tests
// ============================================
// Unit tests for tool permission filtering.
// Covers T028, T029, T030.

import { describe, expect, it } from "vitest";
import {
  createAllowAllFilter,
  createDenyAllFilter,
  createFilterFromTools,
  getToolGroupNames,
  isToolGroup,
  TOOL_GROUPS,
  ToolAllowlistFilter,
} from "../tool-allowlist-filter.js";
import type { ToolPermission } from "../types.js";

// ============================================
// T028: TOOL_GROUPS Tests
// ============================================

describe("TOOL_GROUPS", () => {
  it("should define @readonly group with read operations", () => {
    expect(TOOL_GROUPS["@readonly"]).toBeDefined();
    expect(TOOL_GROUPS["@readonly"]).toContain("Read");
    expect(TOOL_GROUPS["@readonly"]).toContain("ReadFile");
    expect(TOOL_GROUPS["@readonly"]).toContain("read_file");
    expect(TOOL_GROUPS["@readonly"]).toContain("Glob");
    expect(TOOL_GROUPS["@readonly"]).toContain("Grep");
    expect(TOOL_GROUPS["@readonly"]).toContain("list_files");
    expect(TOOL_GROUPS["@readonly"]).toContain("semantic_search");
  });

  it("should define @edit group with write operations", () => {
    expect(TOOL_GROUPS["@edit"]).toBeDefined();
    expect(TOOL_GROUPS["@edit"]).toContain("Edit");
    expect(TOOL_GROUPS["@edit"]).toContain("Write");
    expect(TOOL_GROUPS["@edit"]).toContain("edit_file");
    expect(TOOL_GROUPS["@edit"]).toContain("create_file");
    expect(TOOL_GROUPS["@edit"]).toContain("delete_file");
    expect(TOOL_GROUPS["@edit"]).toContain("replace_string_in_file");
  });

  it("should define @bash group with command execution tools", () => {
    expect(TOOL_GROUPS["@bash"]).toBeDefined();
    expect(TOOL_GROUPS["@bash"]).toContain("Bash");
    expect(TOOL_GROUPS["@bash"]).toContain("bash");
    expect(TOOL_GROUPS["@bash"]).toContain("run_in_terminal");
    expect(TOOL_GROUPS["@bash"]).toContain("Shell");
    expect(TOOL_GROUPS["@bash"]).toContain("execute_bash");
  });

  it("should define @safe group with nested @readonly reference", () => {
    expect(TOOL_GROUPS["@safe"]).toBeDefined();
    expect(TOOL_GROUPS["@safe"]).toContain("@readonly");
    // Should also have safe bash patterns
    expect(TOOL_GROUPS["@safe"]).toContain("Bash(npm run *)");
    expect(TOOL_GROUPS["@safe"]).toContain("Bash(pnpm *)");
  });

  it("should define @all group with wildcard", () => {
    expect(TOOL_GROUPS["@all"]).toBeDefined();
    expect(TOOL_GROUPS["@all"]).toContain("*");
    expect(TOOL_GROUPS["@all"]).toHaveLength(1);
  });

  it("should be frozen/immutable", () => {
    expect(Object.isFrozen(TOOL_GROUPS)).toBe(true);
  });
});

describe("getToolGroupNames", () => {
  it("should return all group names", () => {
    const names = getToolGroupNames();
    expect(names).toContain("@readonly");
    expect(names).toContain("@edit");
    expect(names).toContain("@bash");
    expect(names).toContain("@safe");
    expect(names).toContain("@all");
    expect(names).toHaveLength(5);
  });
});

describe("isToolGroup", () => {
  it("should return true for valid groups", () => {
    expect(isToolGroup("@readonly")).toBe(true);
    expect(isToolGroup("@edit")).toBe(true);
    expect(isToolGroup("@bash")).toBe(true);
    expect(isToolGroup("@safe")).toBe(true);
    expect(isToolGroup("@all")).toBe(true);
  });

  it("should return false for non-groups", () => {
    expect(isToolGroup("ReadFile")).toBe(false);
    expect(isToolGroup("@unknown")).toBe(false);
    expect(isToolGroup("readonly")).toBe(false);
    expect(isToolGroup("")).toBe(false);
  });
});

// ============================================
// T029 & T030: ToolAllowlistFilter Tests
// ============================================

describe("ToolAllowlistFilter", () => {
  // ----------------------------------------
  // Basic functionality
  // ----------------------------------------

  describe("deny-by-default", () => {
    it("should deny all tools with empty permissions", () => {
      const filter = new ToolAllowlistFilter([]);

      expect(filter.isAllowed("ReadFile")).toBe(false);
      expect(filter.isAllowed("WriteFile")).toBe(false);
      expect(filter.isAllowed("Bash")).toBe(false);
      expect(filter.isAllowed("anything")).toBe(false);
    });

    it("should deny unlisted tools", () => {
      const filter = new ToolAllowlistFilter([{ pattern: "ReadFile", negated: false }]);

      expect(filter.isAllowed("ReadFile")).toBe(true);
      expect(filter.isAllowed("WriteFile")).toBe(false);
      expect(filter.isAllowed("Bash")).toBe(false);
    });
  });

  // ----------------------------------------
  // Exact tool matching
  // ----------------------------------------

  describe("exact matching", () => {
    it("should allow explicitly listed tools", () => {
      const filter = new ToolAllowlistFilter([
        { pattern: "ReadFile", negated: false },
        { pattern: "WriteFile", negated: false },
      ]);

      expect(filter.isAllowed("ReadFile")).toBe(true);
      expect(filter.isAllowed("WriteFile")).toBe(true);
    });

    it("should be case-insensitive", () => {
      const filter = new ToolAllowlistFilter([{ pattern: "ReadFile", negated: false }]);

      expect(filter.isAllowed("readfile")).toBe(true);
      expect(filter.isAllowed("READFILE")).toBe(true);
      expect(filter.isAllowed("ReadFile")).toBe(true);
    });
  });

  // ----------------------------------------
  // Negation patterns
  // ----------------------------------------

  describe("negations", () => {
    it("should deny tools with negation pattern", () => {
      const filter = new ToolAllowlistFilter([
        { pattern: "*", negated: false }, // Allow all
        { pattern: "Bash", negated: true }, // Deny Bash
      ]);

      expect(filter.isAllowed("ReadFile")).toBe(true);
      expect(filter.isAllowed("WriteFile")).toBe(true);
      expect(filter.isAllowed("Bash")).toBe(false);
    });

    it("should check negations before allows", () => {
      const filter = new ToolAllowlistFilter([
        { pattern: "Bash", negated: false }, // Allow Bash
        { pattern: "Bash", negated: true }, // Deny Bash (checked first)
      ]);

      // Negation takes precedence
      expect(filter.isAllowed("Bash")).toBe(false);
    });

    it("should handle multiple negations", () => {
      const filter = new ToolAllowlistFilter([
        { pattern: "*", negated: false },
        { pattern: "Bash", negated: true },
        { pattern: "DeleteFile", negated: true },
        { pattern: "rm", negated: true },
      ]);

      expect(filter.isAllowed("ReadFile")).toBe(true);
      expect(filter.isAllowed("Bash")).toBe(false);
      expect(filter.isAllowed("DeleteFile")).toBe(false);
      expect(filter.isAllowed("rm")).toBe(false);
    });
  });

  // ----------------------------------------
  // Glob patterns
  // ----------------------------------------

  describe("glob patterns", () => {
    it("should match wildcard patterns", () => {
      const filter = new ToolAllowlistFilter([{ pattern: "*", negated: false }]);

      expect(filter.isAllowed("anything")).toBe(true);
      expect(filter.isAllowed("ReadFile")).toBe(true);
      expect(filter.isAllowed("some_tool")).toBe(true);
    });

    it("should match suffix patterns (*_file)", () => {
      const filter = new ToolAllowlistFilter([{ pattern: "*_file", negated: false }]);

      expect(filter.isAllowed("read_file")).toBe(true);
      expect(filter.isAllowed("write_file")).toBe(true);
      expect(filter.isAllowed("edit_file")).toBe(true);
      expect(filter.isAllowed("file")).toBe(false);
      expect(filter.isAllowed("Bash")).toBe(false);
    });

    it("should match prefix patterns (Read*)", () => {
      const filter = new ToolAllowlistFilter([{ pattern: "Read*", negated: false }]);

      expect(filter.isAllowed("ReadFile")).toBe(true);
      expect(filter.isAllowed("ReadDir")).toBe(true);
      expect(filter.isAllowed("Reading")).toBe(true);
      expect(filter.isAllowed("WriteFile")).toBe(false);
    });

    it("should match character class patterns", () => {
      const filter = new ToolAllowlistFilter([{ pattern: "[RW]ead*", negated: false }]);

      expect(filter.isAllowed("ReadFile")).toBe(true);
      expect(filter.isAllowed("WeadFile")).toBe(true);
      expect(filter.isAllowed("LeadFile")).toBe(false);
    });

    it("should match question mark patterns", () => {
      const filter = new ToolAllowlistFilter([{ pattern: "???", negated: false }]);

      expect(filter.isAllowed("cat")).toBe(true);
      expect(filter.isAllowed("Cat")).toBe(true);
      expect(filter.isAllowed("Read")).toBe(false);
    });
  });

  // ----------------------------------------
  // Group expansion
  // ----------------------------------------

  describe("group expansion", () => {
    it("should expand @readonly group", () => {
      const filter = new ToolAllowlistFilter([{ pattern: "@readonly", negated: false }]);

      expect(filter.isAllowed("Read")).toBe(true);
      expect(filter.isAllowed("ReadFile")).toBe(true);
      expect(filter.isAllowed("read_file")).toBe(true);
      expect(filter.isAllowed("Glob")).toBe(true);
      expect(filter.isAllowed("Grep")).toBe(true);
      expect(filter.isAllowed("list_files")).toBe(true);

      // Should not allow edit operations
      expect(filter.isAllowed("WriteFile")).toBe(false);
      expect(filter.isAllowed("Edit")).toBe(false);
    });

    it("should expand @edit group", () => {
      const filter = new ToolAllowlistFilter([{ pattern: "@edit", negated: false }]);

      expect(filter.isAllowed("Edit")).toBe(true);
      expect(filter.isAllowed("Write")).toBe(true);
      expect(filter.isAllowed("edit_file")).toBe(true);
      expect(filter.isAllowed("create_file")).toBe(true);
      expect(filter.isAllowed("delete_file")).toBe(true);

      // Should not allow read-only operations
      expect(filter.isAllowed("ReadFile")).toBe(false);
      expect(filter.isAllowed("Grep")).toBe(false);
    });

    it("should expand @bash group", () => {
      const filter = new ToolAllowlistFilter([{ pattern: "@bash", negated: false }]);

      expect(filter.isAllowed("Bash")).toBe(true);
      expect(filter.isAllowed("bash")).toBe(true);
      expect(filter.isAllowed("run_in_terminal")).toBe(true);
      expect(filter.isAllowed("Shell")).toBe(true);

      // Should not allow file operations
      expect(filter.isAllowed("ReadFile")).toBe(false);
    });

    it("should expand @safe group with nested @readonly", () => {
      const filter = new ToolAllowlistFilter([{ pattern: "@safe", negated: false }]);

      // Should include all @readonly tools
      expect(filter.isAllowed("Read")).toBe(true);
      expect(filter.isAllowed("ReadFile")).toBe(true);
      expect(filter.isAllowed("Glob")).toBe(true);
      expect(filter.isAllowed("Grep")).toBe(true);

      // Should not allow general Bash (only safe patterns)
      expect(filter.isAllowed("Edit")).toBe(false);
    });

    it("should expand @all group", () => {
      const filter = new ToolAllowlistFilter([{ pattern: "@all", negated: false }]);

      expect(filter.isAllowed("anything")).toBe(true);
      expect(filter.isAllowed("ReadFile")).toBe(true);
      expect(filter.isAllowed("WriteFile")).toBe(true);
      expect(filter.isAllowed("Bash")).toBe(true);
    });

    it("should negate expanded groups", () => {
      const filter = new ToolAllowlistFilter([
        { pattern: "*", negated: false },
        { pattern: "@bash", negated: true },
      ]);

      expect(filter.isAllowed("ReadFile")).toBe(true);
      expect(filter.isAllowed("WriteFile")).toBe(true);
      expect(filter.isAllowed("Bash")).toBe(false);
      expect(filter.isAllowed("Shell")).toBe(false);
      expect(filter.isAllowed("run_in_terminal")).toBe(false);
    });
  });

  // ----------------------------------------
  // Argument filtering
  // ----------------------------------------

  describe("argument filtering", () => {
    it("should allow tool with matching args", () => {
      const filter = new ToolAllowlistFilter([
        { pattern: "Bash", negated: false, args: ["npm run *"] },
      ]);

      expect(filter.isAllowed("Bash", ["npm run test"])).toBe(true);
      expect(filter.isAllowed("Bash", ["npm run build"])).toBe(true);
    });

    it("should deny tool with non-matching args", () => {
      const filter = new ToolAllowlistFilter([
        { pattern: "Bash", negated: false, args: ["npm run *"] },
      ]);

      expect(filter.isAllowed("Bash", ["rm -rf /"])).toBe(false);
      expect(filter.isAllowed("Bash", ["sudo something"])).toBe(false);
    });

    it("should deny tool with args when called without args", () => {
      const filter = new ToolAllowlistFilter([
        { pattern: "Bash", negated: false, args: ["npm run *"] },
      ]);

      expect(filter.isAllowed("Bash")).toBe(false);
      expect(filter.isAllowed("Bash", [])).toBe(false);
    });

    it("should allow multiple arg patterns", () => {
      const filter = new ToolAllowlistFilter([
        { pattern: "Bash", negated: false, args: ["npm *", "pnpm *", "yarn *"] },
      ]);

      expect(filter.isAllowed("Bash", ["npm test"])).toBe(true);
      expect(filter.isAllowed("Bash", ["pnpm build"])).toBe(true);
      expect(filter.isAllowed("Bash", ["yarn install"])).toBe(true);
      expect(filter.isAllowed("Bash", ["rm -rf /"])).toBe(false);
    });

    it("should work with @safe group embedded args", () => {
      const filter = new ToolAllowlistFilter([{ pattern: "@safe", negated: false }]);

      // Safe bash patterns from @safe group
      expect(filter.isAllowed("Bash", ["npm run test"])).toBe(true);
      expect(filter.isAllowed("Bash", ["pnpm build"])).toBe(true);
      expect(filter.isAllowed("Bash", ["git status"])).toBe(true);
    });
  });

  // ----------------------------------------
  // Mixed rules
  // ----------------------------------------

  describe("mixed rules", () => {
    it("should handle allow + deny combination", () => {
      const filter = new ToolAllowlistFilter([
        { pattern: "@readonly", negated: false },
        { pattern: "@edit", negated: false },
        { pattern: "delete_file", negated: true },
        { pattern: "rm", negated: true },
      ]);

      expect(filter.isAllowed("ReadFile")).toBe(true);
      expect(filter.isAllowed("edit_file")).toBe(true);
      expect(filter.isAllowed("create_file")).toBe(true);
      expect(filter.isAllowed("delete_file")).toBe(false);
      expect(filter.isAllowed("rm")).toBe(false);
    });

    it("should handle group + specific tool", () => {
      const filter = new ToolAllowlistFilter([
        { pattern: "@readonly", negated: false },
        { pattern: "Bash", negated: false, args: ["npm run *"] },
      ]);

      expect(filter.isAllowed("ReadFile")).toBe(true);
      expect(filter.isAllowed("Bash", ["npm run test"])).toBe(true);
      expect(filter.isAllowed("Bash", ["rm -rf /"])).toBe(false);
      expect(filter.isAllowed("WriteFile")).toBe(false);
    });

    it("should handle complex permission sets", () => {
      // Note: deny rules take absolute precedence over allow rules.
      // If @bash is denied, ALL bash tools are denied, even with safe args.
      // To allow specific bash commands, use @safe group or don't deny @bash.
      const filter = new ToolAllowlistFilter([
        { pattern: "@readonly", negated: false },
        { pattern: "@edit", negated: false },
        { pattern: "Bash", negated: false, args: ["npm *", "pnpm *"] },
      ]);

      // Read/edit allowed
      expect(filter.isAllowed("ReadFile")).toBe(true);
      expect(filter.isAllowed("edit_file")).toBe(true);

      // General bash (no args or wrong args) denied
      expect(filter.isAllowed("Bash")).toBe(false);
      expect(filter.isAllowed("Bash", ["rm -rf /"])).toBe(false);

      // Specific bash with safe args allowed
      expect(filter.isAllowed("Bash", ["npm test"])).toBe(true);
      expect(filter.isAllowed("Bash", ["pnpm install"])).toBe(true);

      // Other bash tools not allowed (not in permissions)
      expect(filter.isAllowed("Shell")).toBe(false);
      expect(filter.isAllowed("execute_bash")).toBe(false);
    });

    it("should demonstrate deny takes absolute precedence", () => {
      // This shows that if a tool is in deny list, no allow rule can override it
      const filter = new ToolAllowlistFilter([
        { pattern: "@bash", negated: true }, // Deny all bash tools
        { pattern: "Bash", negated: false, args: ["npm *"] }, // Try to allow Bash with npm
      ]);

      // Bash is denied even with safe args because @bash deny takes precedence
      expect(filter.isAllowed("Bash")).toBe(false);
      expect(filter.isAllowed("Bash", ["npm test"])).toBe(false);
      expect(filter.isAllowed("Shell")).toBe(false);
    });
  });

  // ----------------------------------------
  // Inspection methods
  // ----------------------------------------

  describe("getExpandedPermissions", () => {
    it("should return expanded permissions", () => {
      const filter = new ToolAllowlistFilter([{ pattern: "@readonly", negated: false }]);

      const expanded = filter.getExpandedPermissions();

      expect(expanded.length).toBeGreaterThan(1);
      expect(expanded.some((p) => p.pattern === "Read")).toBe(true);
      expect(expanded.some((p) => p.pattern === "Glob")).toBe(true);
    });

    it("should return copy of permissions", () => {
      const filter = new ToolAllowlistFilter([{ pattern: "ReadFile", negated: false }]);

      const expanded1 = filter.getExpandedPermissions();
      const expanded2 = filter.getExpandedPermissions();

      expect(expanded1).not.toBe(expanded2);
      expect(expanded1).toEqual(expanded2);
    });
  });

  describe("getOriginalPermissions", () => {
    it("should return original permissions", () => {
      const original: ToolPermission[] = [
        { pattern: "@readonly", negated: false },
        { pattern: "Bash", negated: true },
      ];

      const filter = new ToolAllowlistFilter(original);
      const returned = filter.getOriginalPermissions();

      expect(returned).toEqual(original);
      expect(returned).not.toBe(original); // Should be copy
    });
  });

  describe("matchesPermission", () => {
    it("should check if tool matches permission", () => {
      const filter = new ToolAllowlistFilter([]);

      expect(filter.matchesPermission("ReadFile", { pattern: "Read*", negated: false })).toBe(true);

      expect(filter.matchesPermission("WriteFile", { pattern: "Read*", negated: false })).toBe(
        false
      );
    });

    it("should expand groups when checking", () => {
      const filter = new ToolAllowlistFilter([]);

      expect(filter.matchesPermission("ReadFile", { pattern: "@readonly", negated: false })).toBe(
        true
      );

      expect(filter.matchesPermission("Bash", { pattern: "@readonly", negated: false })).toBe(
        false
      );
    });
  });
});

// ============================================
// Factory Functions Tests
// ============================================

describe("createAllowAllFilter", () => {
  it("should create filter that allows all tools", () => {
    const filter = createAllowAllFilter();

    expect(filter.isAllowed("anything")).toBe(true);
    expect(filter.isAllowed("ReadFile")).toBe(true);
    expect(filter.isAllowed("WriteFile")).toBe(true);
    expect(filter.isAllowed("Bash")).toBe(true);
  });
});

describe("createDenyAllFilter", () => {
  it("should create filter that denies all tools", () => {
    const filter = createDenyAllFilter();

    expect(filter.isAllowed("anything")).toBe(false);
    expect(filter.isAllowed("ReadFile")).toBe(false);
    expect(filter.isAllowed("WriteFile")).toBe(false);
    expect(filter.isAllowed("Bash")).toBe(false);
  });
});

describe("createFilterFromTools", () => {
  it("should create filter from tool list", () => {
    const filter = createFilterFromTools(["ReadFile", "WriteFile"]);

    expect(filter.isAllowed("ReadFile")).toBe(true);
    expect(filter.isAllowed("WriteFile")).toBe(true);
    expect(filter.isAllowed("Bash")).toBe(false);
  });

  it("should handle negations", () => {
    const filter = createFilterFromTools(["*", "!Bash", "!DeleteFile"]);

    expect(filter.isAllowed("ReadFile")).toBe(true);
    expect(filter.isAllowed("Bash")).toBe(false);
    expect(filter.isAllowed("DeleteFile")).toBe(false);
  });

  it("should handle groups", () => {
    const filter = createFilterFromTools(["@readonly"]);

    expect(filter.isAllowed("ReadFile")).toBe(true);
    expect(filter.isAllowed("Glob")).toBe(true);
    expect(filter.isAllowed("WriteFile")).toBe(false);
  });

  it("should handle args in parentheses", () => {
    const filter = createFilterFromTools(["Bash(npm run *)"]);

    expect(filter.isAllowed("Bash", ["npm run test"])).toBe(true);
    expect(filter.isAllowed("Bash", ["rm -rf /"])).toBe(false);
  });
});
