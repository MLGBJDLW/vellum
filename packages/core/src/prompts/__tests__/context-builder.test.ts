// ============================================
// ContextBuilder Tests
// ============================================

import { describe, expect, it } from "vitest";
import { ContextBuilder } from "../context-builder.js";
import type { ActiveFile, GitStatus, SessionContext, Task } from "../types.js";

// =============================================================================
// buildContext Tests
// =============================================================================

describe("ContextBuilder - buildContext", () => {
  it("returns empty string for empty session context", () => {
    const builder = new ContextBuilder();
    const result = builder.buildContext({});

    expect(result).toBe("");
  });

  it("includes Current Session header when context is present", () => {
    const builder = new ContextBuilder();
    const result = builder.buildContext({
      activeFile: { path: "test.ts", language: "typescript" },
    });

    expect(result).toContain("## Current Session");
  });

  it("combines all context sections", () => {
    const builder = new ContextBuilder();
    const result = builder.buildContext({
      activeFile: { path: "app.ts", language: "typescript" },
      currentTask: { id: "T001", description: "Fix bug", status: "in-progress" },
      gitStatus: { branch: "main", modified: ["a.ts"], staged: [] },
      errors: ["Error 1"],
    });

    expect(result).toContain("### Active File");
    expect(result).toContain("### Current Task");
    expect(result).toContain("### Git Status");
    expect(result).toContain("### Errors");
  });

  it("orders sections: file, task, git, errors", () => {
    const builder = new ContextBuilder();
    const result = builder.buildContext({
      errors: ["Error"],
      gitStatus: { branch: "main", modified: [], staged: [] },
      currentTask: { id: "T1", description: "Task", status: "pending" },
      activeFile: { path: "x.ts", language: "typescript" },
    });

    const fileIndex = result.indexOf("### Active File");
    const taskIndex = result.indexOf("### Current Task");
    const gitIndex = result.indexOf("### Git Status");
    const errorsIndex = result.indexOf("### Errors");

    expect(fileIndex).toBeLessThan(taskIndex);
    expect(taskIndex).toBeLessThan(gitIndex);
    expect(gitIndex).toBeLessThan(errorsIndex);
  });
});

// =============================================================================
// buildFileContext Tests
// =============================================================================

describe("ContextBuilder - buildFileContext", () => {
  it("formats file with path and language", () => {
    const builder = new ContextBuilder();
    const file: ActiveFile = {
      path: "src/index.ts",
      language: "typescript",
    };

    const result = builder.buildFileContext(file);

    expect(result).toContain("### Active File");
    expect(result).toContain("- Path: src/index.ts");
    expect(result).toContain("- Language: typescript");
  });

  it("includes selection when present", () => {
    const builder = new ContextBuilder();
    const file: ActiveFile = {
      path: "test.ts",
      language: "typescript",
      selection: "const x = 1;",
    };

    const result = builder.buildFileContext(file);

    expect(result).toContain("- Selection: const x = 1;");
  });

  it("omits selection when not present", () => {
    const builder = new ContextBuilder();
    const file: ActiveFile = {
      path: "test.ts",
      language: "typescript",
    };

    const result = builder.buildFileContext(file);

    expect(result).not.toContain("Selection");
  });

  it("truncates selection longer than 500 chars", () => {
    const builder = new ContextBuilder();
    const longSelection = "x".repeat(600);
    const file: ActiveFile = {
      path: "test.ts",
      language: "typescript",
      selection: longSelection,
    };

    const result = builder.buildFileContext(file);

    expect(result).toContain("[truncated]");
    expect(result.length).toBeLessThan(600);
  });

  it("does not truncate selection at exactly 500 chars", () => {
    const builder = new ContextBuilder();
    const exactSelection = "x".repeat(500);
    const file: ActiveFile = {
      path: "test.ts",
      language: "typescript",
      selection: exactSelection,
    };

    const result = builder.buildFileContext(file);

    expect(result).not.toContain("[truncated]");
    expect(result).toContain(exactSelection);
  });

  it("truncates selection at 501 chars", () => {
    const builder = new ContextBuilder();
    const overSelection = "x".repeat(501);
    const file: ActiveFile = {
      path: "test.ts",
      language: "typescript",
      selection: overSelection,
    };

    const result = builder.buildFileContext(file);

    expect(result).toContain("[truncated]");
  });
});

// =============================================================================
// buildTaskContext Tests
// =============================================================================

describe("ContextBuilder - buildTaskContext", () => {
  it("formats task with all fields", () => {
    const builder = new ContextBuilder();
    const task: Task = {
      id: "T001",
      description: "Implement feature",
      status: "in-progress",
    };

    const result = builder.buildTaskContext(task);

    expect(result).toContain("### Current Task");
    expect(result).toContain("- ID: T001");
    expect(result).toContain("- Description: Implement feature");
    expect(result).toContain("- Status: in-progress");
  });

  it("handles pending status", () => {
    const builder = new ContextBuilder();
    const task: Task = {
      id: "T002",
      description: "Fix bug",
      status: "pending",
    };

    const result = builder.buildTaskContext(task);

    expect(result).toContain("- Status: pending");
  });

  it("handles complete status", () => {
    const builder = new ContextBuilder();
    const task: Task = {
      id: "T003",
      description: "Review code",
      status: "complete",
    };

    const result = builder.buildTaskContext(task);

    expect(result).toContain("- Status: complete");
  });
});

// =============================================================================
// buildErrorContext Tests
// =============================================================================

describe("ContextBuilder - buildErrorContext", () => {
  it("returns empty string for empty errors array", () => {
    const builder = new ContextBuilder();
    const result = builder.buildErrorContext([]);

    expect(result).toBe("");
  });

  it("returns empty string for undefined errors", () => {
    const builder = new ContextBuilder();
    // @ts-expect-error Testing undefined input
    const result = builder.buildErrorContext(undefined);

    expect(result).toBe("");
  });

  it("formats single error", () => {
    const builder = new ContextBuilder();
    const result = builder.buildErrorContext(["Type error on line 42"]);

    expect(result).toContain("### Errors");
    expect(result).toContain("- Type error on line 42");
  });

  it("formats multiple errors as bullet list", () => {
    const builder = new ContextBuilder();
    const result = builder.buildErrorContext([
      "Error 1: Missing import",
      "Error 2: Type mismatch",
      "Error 3: Undefined variable",
    ]);

    expect(result).toContain("### Errors");
    expect(result).toContain("- Error 1: Missing import");
    expect(result).toContain("- Error 2: Type mismatch");
    expect(result).toContain("- Error 3: Undefined variable");
  });
});

// =============================================================================
// buildGitContext Tests
// =============================================================================

describe("ContextBuilder - buildGitContext", () => {
  it("formats git status with all fields", () => {
    const builder = new ContextBuilder();
    const git: GitStatus = {
      branch: "feature/auth",
      modified: ["src/login.ts", "src/auth.ts"],
      staged: ["src/types.ts"],
    };

    const result = builder.buildGitContext(git);

    expect(result).toContain("### Git Status");
    expect(result).toContain("- Branch: feature/auth");
    expect(result).toContain("- Modified: 2 files");
    expect(result).toContain("- Staged: 1 files");
  });

  it("handles empty modified and staged arrays", () => {
    const builder = new ContextBuilder();
    const git: GitStatus = {
      branch: "main",
      modified: [],
      staged: [],
    };

    const result = builder.buildGitContext(git);

    expect(result).toContain("- Branch: main");
    expect(result).toContain("- Modified: 0 files");
    expect(result).toContain("- Staged: 0 files");
  });

  it("handles single file in modified", () => {
    const builder = new ContextBuilder();
    const git: GitStatus = {
      branch: "develop",
      modified: ["file.ts"],
      staged: [],
    };

    const result = builder.buildGitContext(git);

    expect(result).toContain("- Modified: 1 files");
  });

  it("handles many files", () => {
    const builder = new ContextBuilder();
    const git: GitStatus = {
      branch: "main",
      modified: ["a.ts", "b.ts", "c.ts", "d.ts", "e.ts"],
      staged: ["x.ts", "y.ts", "z.ts"],
    };

    const result = builder.buildGitContext(git);

    expect(result).toContain("- Modified: 5 files");
    expect(result).toContain("- Staged: 3 files");
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe("ContextBuilder - Integration", () => {
  it("produces valid markdown structure", () => {
    const builder = new ContextBuilder();
    const session: SessionContext = {
      activeFile: { path: "app.ts", language: "typescript", selection: "code" },
      currentTask: { id: "T1", description: "Task", status: "pending" },
      gitStatus: { branch: "main", modified: ["x.ts"], staged: [] },
      errors: ["Error 1"],
    };

    const result = builder.buildContext(session);

    // Check markdown structure
    expect(result.startsWith("## Current Session")).toBe(true);
    expect(result.split("###").length).toBe(5); // Header + 4 sections
  });

  it("handles partial context gracefully", () => {
    const builder = new ContextBuilder();

    // Only activeFile
    const result1 = builder.buildContext({
      activeFile: { path: "x.ts", language: "ts" },
    });
    expect(result1).toContain("### Active File");
    expect(result1).not.toContain("### Current Task");

    // Only currentTask
    const result2 = builder.buildContext({
      currentTask: { id: "T1", description: "Test", status: "complete" },
    });
    expect(result2).toContain("### Current Task");
    expect(result2).not.toContain("### Active File");

    // Only gitStatus
    const result3 = builder.buildContext({
      gitStatus: { branch: "main", modified: [], staged: [] },
    });
    expect(result3).toContain("### Git Status");
    expect(result3).not.toContain("### Active File");

    // Only errors
    const result4 = builder.buildContext({
      errors: ["Error"],
    });
    expect(result4).toContain("### Errors");
    expect(result4).not.toContain("### Active File");
  });
});
