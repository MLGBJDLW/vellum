// ============================================
// Permission Inheritance Tests
// ============================================

import { describe, expect, it } from "vitest";
import { createPermissionInheritance, type PermissionSet } from "../permission-inheritance.js";

describe("PermissionInheritance", () => {
  const createTestPermissions = (overrides: Partial<PermissionSet> = {}): PermissionSet => ({
    filePatterns: [
      { pattern: "src/**/*.ts", access: "write" },
      { pattern: "*.config.js", access: "read" },
    ],
    toolGroups: [
      { group: "filesystem", enabled: true },
      { group: "shell", enabled: true, tools: ["run", "exec"] },
    ],
    canApproveSubagent: true,
    maxSubagentDepth: 3,
    ...overrides,
  });

  describe("derive()", () => {
    it("should return intersection of file patterns", () => {
      const inheritance = createPermissionInheritance();
      const parent = createTestPermissions();

      const child = inheritance.derive(parent, {
        filePatterns: [
          { pattern: "src/**/*.ts", access: "read" }, // Restricting from write to read
        ],
      });

      const srcPattern = child.filePatterns.find((p) => p.pattern === "src/**/*.ts");
      expect(srcPattern?.access).toBe("read"); // More restrictive wins
    });

    it("should inherit parent patterns not specified in child", () => {
      const inheritance = createPermissionInheritance();
      const parent = createTestPermissions();

      const child = inheritance.derive(parent, {
        filePatterns: [],
      });

      // Should inherit all parent patterns
      expect(child.filePatterns).toHaveLength(2);
      expect(child.filePatterns).toContainEqual({
        pattern: "src/**/*.ts",
        access: "write",
      });
      expect(child.filePatterns).toContainEqual({
        pattern: "*.config.js",
        access: "read",
      });
    });

    it("should return intersection of tool groups", () => {
      const inheritance = createPermissionInheritance();
      const parent = createTestPermissions();

      const child = inheritance.derive(parent, {
        toolGroups: [
          { group: "filesystem", enabled: true },
          { group: "shell", enabled: false }, // Disabling
        ],
      });

      const shellGroup = child.toolGroups.find((g) => g.group === "shell");
      expect(shellGroup?.enabled).toBe(false);
    });

    it("should compute intersection of tool lists", () => {
      const inheritance = createPermissionInheritance();
      const parent = createTestPermissions({
        toolGroups: [{ group: "shell", enabled: true, tools: ["run", "exec", "spawn"] }],
      });

      const child = inheritance.derive(parent, {
        toolGroups: [{ group: "shell", enabled: true, tools: ["run", "spawn", "extra"] }],
      });

      const shellGroup = child.toolGroups.find((g) => g.group === "shell");
      expect(shellGroup?.tools).toContain("run");
      expect(shellGroup?.tools).toContain("spawn");
      expect(shellGroup?.tools).not.toContain("exec"); // Only in parent
      expect(shellGroup?.tools).not.toContain("extra"); // Only in child
    });

    it("should disable groups not in parent", () => {
      const inheritance = createPermissionInheritance();
      const parent = createTestPermissions({
        toolGroups: [{ group: "filesystem", enabled: true }],
      });

      const child = inheritance.derive(parent, {
        toolGroups: [{ group: "network", enabled: true }], // Not in parent
      });

      const networkGroup = child.toolGroups.find((g) => g.group === "network");
      expect(networkGroup?.enabled).toBe(false);
    });

    it("should take minimum of maxSubagentDepth", () => {
      const inheritance = createPermissionInheritance();
      const parent = createTestPermissions({ maxSubagentDepth: 5 });

      const child = inheritance.derive(parent, { maxSubagentDepth: 3 });
      expect(child.maxSubagentDepth).toBe(3);

      const child2 = inheritance.derive(parent, { maxSubagentDepth: 10 });
      expect(child2.maxSubagentDepth).toBe(5); // Capped at parent
    });

    it("should only allow canApproveSubagent if parent allows", () => {
      const inheritance = createPermissionInheritance();

      const parentAllows = createTestPermissions({ canApproveSubagent: true });
      const child1 = inheritance.derive(parentAllows, {
        canApproveSubagent: true,
      });
      expect(child1.canApproveSubagent).toBe(true);

      const child2 = inheritance.derive(parentAllows, {
        canApproveSubagent: false,
      });
      expect(child2.canApproveSubagent).toBe(false);

      const parentDenies = createTestPermissions({ canApproveSubagent: false });
      const child3 = inheritance.derive(parentDenies, {
        canApproveSubagent: true,
      });
      expect(child3.canApproveSubagent).toBe(false); // Parent overrides
    });
  });

  describe("validate()", () => {
    it("should return valid for subset permissions", () => {
      const inheritance = createPermissionInheritance();
      const parent = createTestPermissions();
      const child = createTestPermissions({
        filePatterns: [{ pattern: "src/**/*.ts", access: "read" }], // More restrictive
        maxSubagentDepth: 2, // Lower
      });

      const result = inheritance.validate(parent, child);
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it("should detect file access violations", () => {
      const inheritance = createPermissionInheritance();
      const parent = createTestPermissions({
        filePatterns: [{ pattern: "src/**/*.ts", access: "read" }],
      });
      const child = createTestPermissions({
        filePatterns: [{ pattern: "src/**/*.ts", access: "write" }], // Exceeds parent
      });

      const result = inheritance.validate(parent, child);
      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.includes("src/**/*.ts"))).toBe(true);
    });

    it("should detect file pattern not in parent", () => {
      const inheritance = createPermissionInheritance();
      const parent = createTestPermissions({
        filePatterns: [{ pattern: "src/**/*.ts", access: "write" }],
      });
      const child = createTestPermissions({
        filePatterns: [
          { pattern: "src/**/*.ts", access: "write" },
          { pattern: "secret/**", access: "read" }, // Not in parent
        ],
      });

      const result = inheritance.validate(parent, child);
      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.includes("secret/**"))).toBe(true);
    });

    it("should allow file pattern with access none even if not in parent", () => {
      const inheritance = createPermissionInheritance();
      const parent = createTestPermissions({
        filePatterns: [{ pattern: "src/**/*.ts", access: "write" }],
      });
      const child = createTestPermissions({
        filePatterns: [
          { pattern: "src/**/*.ts", access: "write" },
          { pattern: "secret/**", access: "none" }, // Not in parent but no access
        ],
      });

      const result = inheritance.validate(parent, child);
      expect(result.valid).toBe(true);
    });

    it("should detect tool group violations", () => {
      const inheritance = createPermissionInheritance();
      const parent = createTestPermissions({
        toolGroups: [{ group: "filesystem", enabled: false }],
      });
      const child = createTestPermissions({
        toolGroups: [{ group: "filesystem", enabled: true }], // Exceeds parent
      });

      const result = inheritance.validate(parent, child);
      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.includes("filesystem"))).toBe(true);
    });

    it("should detect tool group not in parent", () => {
      const inheritance = createPermissionInheritance();
      const parent = createTestPermissions({
        toolGroups: [{ group: "filesystem", enabled: true }],
      });
      const child = createTestPermissions({
        toolGroups: [
          { group: "filesystem", enabled: true },
          { group: "network", enabled: true }, // Not in parent
        ],
      });

      const result = inheritance.validate(parent, child);
      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.includes("network"))).toBe(true);
    });

    it("should detect tool list violations", () => {
      const inheritance = createPermissionInheritance();
      const parent = createTestPermissions({
        toolGroups: [{ group: "shell", enabled: true, tools: ["run"] }],
      });
      const child = createTestPermissions({
        toolGroups: [{ group: "shell", enabled: true, tools: ["run", "exec"] }], // exec not in parent
      });

      const result = inheritance.validate(parent, child);
      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.includes("exec"))).toBe(true);
    });

    it("should detect canApproveSubagent violations", () => {
      const inheritance = createPermissionInheritance();
      const parent = createTestPermissions({ canApproveSubagent: false });
      const child = createTestPermissions({ canApproveSubagent: true });

      const result = inheritance.validate(parent, child);
      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.includes("canApproveSubagent"))).toBe(true);
    });

    it("should detect maxSubagentDepth violations", () => {
      const inheritance = createPermissionInheritance();
      const parent = createTestPermissions({ maxSubagentDepth: 2 });
      const child = createTestPermissions({ maxSubagentDepth: 5 });

      const result = inheritance.validate(parent, child);
      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.includes("maxSubagentDepth"))).toBe(true);
    });
  });

  describe("escalate()", () => {
    it("should return null by default (deny escalation)", async () => {
      const inheritance = createPermissionInheritance();
      const current = createTestPermissions({ maxSubagentDepth: 2 });

      const result = await inheritance.escalate(current, {
        maxSubagentDepth: 5,
      });
      expect(result).toBeNull();
    });
  });

  describe("getEffective()", () => {
    it("should return empty permissions for empty chain", () => {
      const inheritance = createPermissionInheritance();
      const result = inheritance.getEffective([]);

      expect(result.filePatterns).toHaveLength(0);
      expect(result.toolGroups).toHaveLength(0);
      expect(result.canApproveSubagent).toBe(false);
      expect(result.maxSubagentDepth).toBe(0);
    });

    it("should return single element for single-element chain", () => {
      const inheritance = createPermissionInheritance();
      const permissions = createTestPermissions();

      const result = inheritance.getEffective([permissions]);
      expect(result).toEqual(permissions);
    });

    it("should compute intersection of permission chain", () => {
      const inheritance = createPermissionInheritance();

      const root = createTestPermissions({
        filePatterns: [
          { pattern: "src/**/*.ts", access: "write" },
          { pattern: "test/**/*.ts", access: "write" },
        ],
        toolGroups: [
          { group: "filesystem", enabled: true },
          { group: "shell", enabled: true },
        ],
        maxSubagentDepth: 5,
        canApproveSubagent: true,
      });

      const level1 = createTestPermissions({
        filePatterns: [
          { pattern: "src/**/*.ts", access: "read" }, // More restrictive
          { pattern: "test/**/*.ts", access: "write" },
        ],
        toolGroups: [
          { group: "filesystem", enabled: true },
          { group: "shell", enabled: false }, // Disabled
        ],
        maxSubagentDepth: 3,
        canApproveSubagent: true,
      });

      const level2 = createTestPermissions({
        filePatterns: [{ pattern: "src/**/*.ts", access: "read" }],
        toolGroups: [{ group: "filesystem", enabled: true }],
        maxSubagentDepth: 2,
        canApproveSubagent: false,
      });

      const result = inheritance.getEffective([root, level1, level2]);

      // File patterns should be most restrictive
      const srcPattern = result.filePatterns.find((p) => p.pattern === "src/**/*.ts");
      expect(srcPattern?.access).toBe("read");

      // Shell should be disabled (from level1)
      const shellGroup = result.toolGroups.find((g) => g.group === "shell");
      expect(shellGroup?.enabled).toBe(false);

      // maxSubagentDepth should be minimum
      expect(result.maxSubagentDepth).toBe(2);

      // canApproveSubagent should be false (from level2)
      expect(result.canApproveSubagent).toBe(false);
    });

    it("should handle long chains correctly", () => {
      const inheritance = createPermissionInheritance();

      const chain: PermissionSet[] = [];
      for (let i = 5; i >= 1; i--) {
        chain.push(
          createTestPermissions({
            maxSubagentDepth: i,
          })
        );
      }

      const result = inheritance.getEffective(chain);
      expect(result.maxSubagentDepth).toBe(1); // Minimum of 5,4,3,2,1
    });
  });
});
