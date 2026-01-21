// ============================================
// AGENTS.md Resolver Tests
// ============================================

import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { AgentsMdResolver, findApplicableFiles, mergeInstructions } from "../resolver.js";
import type { AgentsMdFile, AgentsMdTree } from "../types.js";

// =============================================================================
// Test Helpers
// =============================================================================

function createFile(
  scope: string,
  instructions: string,
  marker: "PREPEND" | "APPEND" | "REPLACE" = "APPEND",
  priority = 0
): AgentsMdFile {
  return {
    path: path.join(scope, "AGENTS.md"),
    scope,
    content: instructions,
    priority,
    mergeMarker: marker,
    instructions,
  };
}

function createTree(projectRoot: string, files: AgentsMdFile[]): AgentsMdTree {
  return {
    root: {
      path: projectRoot,
      file: files.find((f) => f.scope === projectRoot) ?? null,
      children: [],
      depth: 0,
    },
    files,
    projectRoot,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe("findApplicableFiles", () => {
  const projectRoot = "/project";

  it("should find files along path to target", () => {
    const files = [
      createFile(projectRoot, "Root", "APPEND", 0),
      createFile(path.join(projectRoot, "src"), "Src", "APPEND", 1),
      createFile(path.join(projectRoot, "src", "utils"), "Utils", "APPEND", 2),
    ];
    const tree = createTree(projectRoot, files);

    const target = path.join(projectRoot, "src", "utils", "helper.ts");
    const applicable = findApplicableFiles(target, tree);

    expect(applicable).toHaveLength(3);
    expect(applicable[0]?.instructions).toBe("Root");
    expect(applicable[1]?.instructions).toBe("Src");
    expect(applicable[2]?.instructions).toBe("Utils");
  });

  it("should only include files on path to target", () => {
    const files = [
      createFile(projectRoot, "Root", "APPEND", 0),
      createFile(path.join(projectRoot, "src"), "Src", "APPEND", 1),
      createFile(path.join(projectRoot, "tests"), "Tests", "APPEND", 1), // Not on path
    ];
    const tree = createTree(projectRoot, files);

    const target = path.join(projectRoot, "src", "file.ts");
    const applicable = findApplicableFiles(target, tree);

    expect(applicable).toHaveLength(2);
    expect(applicable.map((f) => f.instructions)).toEqual(["Root", "Src"]);
  });

  it("should handle target at project root", () => {
    const files = [createFile(projectRoot, "Root", "APPEND", 0)];
    const tree = createTree(projectRoot, files);

    const target = path.join(projectRoot, "file.ts");
    const applicable = findApplicableFiles(target, tree);

    expect(applicable).toHaveLength(1);
    expect(applicable[0]?.instructions).toBe("Root");
  });

  it("should return root file for paths under project", () => {
    const files = [createFile(projectRoot, "Root", "APPEND", 0)];
    const tree = createTree(projectRoot, files);

    // Any target under project root should get root file
    const target = path.join(projectRoot, "deep", "nested", "file.ts");
    const applicable = findApplicableFiles(target, tree);

    expect(applicable).toHaveLength(1);
    expect(applicable[0]?.instructions).toBe("Root");
  });

  it("should handle gaps in directory tree", () => {
    // Only root and deep have files, intermediate directories don't
    const files = [
      createFile(projectRoot, "Root", "APPEND", 0),
      createFile(path.join(projectRoot, "a", "b", "c"), "Deep", "APPEND", 3),
    ];
    const tree = createTree(projectRoot, files);

    const target = path.join(projectRoot, "a", "b", "c", "file.ts");
    const applicable = findApplicableFiles(target, tree);

    expect(applicable).toHaveLength(2);
    expect(applicable[0]?.instructions).toBe("Root");
    expect(applicable[1]?.instructions).toBe("Deep");
  });
});

describe("mergeInstructions", () => {
  const projectRoot = "/project";

  it("should append instructions by default", () => {
    const files = [
      createFile(projectRoot, "First", "APPEND"),
      createFile(path.join(projectRoot, "src"), "Second", "APPEND"),
    ];

    const result = mergeInstructions(files);

    expect(result).toBe("First\n\nSecond");
  });

  it("should prepend instructions with PREPEND marker", () => {
    const files = [
      createFile(projectRoot, "Original", "APPEND"),
      createFile(path.join(projectRoot, "src"), "Prepended", "PREPEND"),
    ];

    const result = mergeInstructions(files);

    expect(result).toBe("Prepended\n\nOriginal");
  });

  it("should replace all with REPLACE marker", () => {
    const files = [
      createFile(projectRoot, "Original", "APPEND"),
      createFile(path.join(projectRoot, "src"), "Replaced", "REPLACE"),
    ];

    const result = mergeInstructions(files);

    expect(result).toBe("Replaced");
  });

  it("should handle complex merge chain", () => {
    // Root -> Append -> Replace -> Append -> Prepend
    const files = [
      createFile(projectRoot, "Root", "APPEND"),
      createFile(path.join(projectRoot, "a"), "A-Append", "APPEND"),
      createFile(path.join(projectRoot, "a", "b"), "B-Replace", "REPLACE"),
      createFile(path.join(projectRoot, "a", "b", "c"), "C-Append", "APPEND"),
      createFile(path.join(projectRoot, "a", "b", "c", "d"), "D-Prepend", "PREPEND"),
    ];

    const result = mergeInstructions(files);

    // B-Replace clears everything, C-Append adds after, D-Prepend adds before
    expect(result).toBe("D-Prepend\n\nB-Replace\n\nC-Append");
  });

  it("should handle empty files array", () => {
    const result = mergeInstructions([]);
    expect(result).toBe("");
  });

  it("should skip files with empty instructions", () => {
    const files = [
      createFile(projectRoot, "Root", "APPEND"),
      createFile(path.join(projectRoot, "src"), "", "APPEND"),
      createFile(path.join(projectRoot, "src", "utils"), "Utils", "APPEND"),
    ];

    const result = mergeInstructions(files);

    expect(result).toBe("Root\n\nUtils");
  });

  it("should handle whitespace-only instructions", () => {
    const files = [
      createFile(projectRoot, "Root", "APPEND"),
      createFile(path.join(projectRoot, "src"), "   \n\n   ", "APPEND"),
    ];

    const result = mergeInstructions(files);

    expect(result).toBe("Root");
  });
});

describe("AgentsMdResolver", () => {
  const projectRoot = "/project";

  describe("resolve", () => {
    it("should resolve scope for target file", () => {
      const files = [
        createFile(projectRoot, "Root instructions", "APPEND", 0),
        createFile(path.join(projectRoot, "src"), "Src instructions", "APPEND", 1),
      ];
      const tree = createTree(projectRoot, files);
      const resolver = new AgentsMdResolver(tree);

      const scope = resolver.resolve(path.join(projectRoot, "src", "file.ts"));

      expect(scope.instructions).toBe("Root instructions\n\nSrc instructions");
      expect(scope.sources).toHaveLength(2);
      expect(scope.targetPath).toContain("file.ts");
    });

    it("should return empty instructions when no files apply", () => {
      const tree = createTree(projectRoot, []);
      const resolver = new AgentsMdResolver(tree);

      const scope = resolver.resolve(path.join(projectRoot, "file.ts"));

      expect(scope.instructions).toBe("");
      expect(scope.sources).toHaveLength(0);
    });
  });

  describe("getInstructionsFor", () => {
    it("should return instructions with source attribution", () => {
      const files = [createFile(projectRoot, "Instructions", "APPEND", 0)];
      const tree = createTree(projectRoot, files);
      const resolver = new AgentsMdResolver(tree);

      const result = resolver.getInstructionsFor(path.join(projectRoot, "file.ts"));

      expect(result).toContain("AGENTS.md Sources:");
      expect(result).toContain("Instructions");
    });

    it("should return empty string when no files apply", () => {
      const tree = createTree(projectRoot, []);
      const resolver = new AgentsMdResolver(tree);

      const result = resolver.getInstructionsFor(path.join(projectRoot, "file.ts"));

      expect(result).toBe("");
    });
  });

  describe("hasScope", () => {
    it("should return true when files apply", () => {
      const files = [createFile(projectRoot, "Root", "APPEND", 0)];
      const tree = createTree(projectRoot, files);
      const resolver = new AgentsMdResolver(tree);

      expect(resolver.hasScope(path.join(projectRoot, "file.ts"))).toBe(true);
    });

    it("should return false when no files apply", () => {
      const tree = createTree(projectRoot, []);
      const resolver = new AgentsMdResolver(tree);

      expect(resolver.hasScope(path.join(projectRoot, "file.ts"))).toBe(false);
    });
  });

  describe("getApplicableFiles", () => {
    it("should return all applicable files", () => {
      const files = [
        createFile(projectRoot, "Root", "APPEND", 0),
        createFile(path.join(projectRoot, "src"), "Src", "APPEND", 1),
      ];
      const tree = createTree(projectRoot, files);
      const resolver = new AgentsMdResolver(tree);

      const applicable = resolver.getApplicableFiles(path.join(projectRoot, "src", "file.ts"));

      expect(applicable).toHaveLength(2);
    });
  });
});
