// ============================================
// WorkflowLoader Unit Tests
// ============================================

/**
 * Unit tests for the WorkflowLoader class.
 *
 * Tests cover:
 * - Load all workflows from .vellum/workflows/
 * - Load single workflow by name
 * - Handle missing directory gracefully
 * - Parse steps array correctly
 * - Validate workflow schema
 *
 * @module @vellum/core/workflows/__tests__/workflow-loader
 * @see T040
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowLoader } from "../workflow-loader.js";

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Create a temporary test directory.
 */
function createTempDir(prefix: string): string {
  const dir = join(
    tmpdir(),
    `vellum-wf-test-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Create a valid workflow file with frontmatter.
 */
function createValidWorkflowFile(
  dir: string,
  id: string,
  options?: {
    name?: string;
    description?: string;
    steps?: Array<{ id: string; prompt: string }>;
    variables?: Array<{ name: string; default?: string }>;
  }
): string {
  const workflowsDir = join(dir, ".vellum", "workflows");
  mkdirSync(workflowsDir, { recursive: true });

  const steps = options?.steps ?? [
    { id: "step-1", prompt: "First step prompt" },
    { id: "step-2", prompt: "Second step prompt" },
  ];

  const stepsYaml = steps
    .map(
      (s) => `  - id: ${s.id}
    prompt: "${s.prompt}"`
    )
    .join("\n");

  const variablesYaml = options?.variables
    ? `variables:
${options.variables.map((v) => `  - name: ${v.name}${v.default ? `\n    default: "${v.default}"` : ""}`).join("\n")}`
    : "";

  const filePath = join(workflowsDir, `${id}.md`);
  const content = `---
id: ${id}
name: ${options?.name ?? `Workflow ${id}`}
${options?.description ? `description: ${options.description}` : ""}
steps:
${stepsYaml}
${variablesYaml}
---
This is the preamble for the ${id} workflow.

Instructions before steps begin.`;

  writeFileSync(filePath, content);
  return filePath;
}

/**
 * Create a workflow with validation rules.
 */
function createWorkflowWithValidation(dir: string, id: string): string {
  const workflowsDir = join(dir, ".vellum", "workflows");
  mkdirSync(workflowsDir, { recursive: true });

  const filePath = join(workflowsDir, `${id}.md`);
  const content = `---
id: ${id}
name: Validated Workflow
steps:
  - id: build
    prompt: "Build the project"
    validation:
      type: exit_code
      pattern: "0"
      message: "Build must succeed"
  - id: test
    prompt: "Run tests"
    timeout: 300
    continueOnError: true
---
Preamble with validation.`;

  writeFileSync(filePath, content);
  return filePath;
}

/**
 * Create a corrupt workflow file (invalid YAML).
 */
function createCorruptWorkflowFile(dir: string, id: string): string {
  const workflowsDir = join(dir, ".vellum", "workflows");
  mkdirSync(workflowsDir, { recursive: true });

  const filePath = join(workflowsDir, `${id}.md`);
  writeFileSync(
    filePath,
    `---
id: ${id}
name: [unclosed bracket
steps: invalid: yaml:
---
Content here.`
  );
  return filePath;
}

/**
 * Create a workflow with missing required fields.
 */
function createInvalidSchemaWorkflowFile(dir: string, id: string): string {
  const workflowsDir = join(dir, ".vellum", "workflows");
  mkdirSync(workflowsDir, { recursive: true });

  const filePath = join(workflowsDir, `${id}.md`);
  writeFileSync(
    filePath,
    `---
id: ${id}
name: Missing Steps
---
No steps defined.`
  );
  return filePath;
}

// =============================================================================
// WorkflowLoader Tests
// =============================================================================

describe("WorkflowLoader", () => {
  let tempWorkspace: string;
  let loader: WorkflowLoader;

  beforeEach(() => {
    tempWorkspace = createTempDir("loader");
    loader = new WorkflowLoader({
      cwd: tempWorkspace,
      loadUserWorkflows: false, // Disable user workflows for isolated tests
    });
  });

  afterEach(() => {
    try {
      rmSync(tempWorkspace, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    vi.clearAllMocks();
  });

  // ===========================================================================
  // T040.1: Load all workflows from .vellum/workflows/
  // ===========================================================================
  describe("loadAll", () => {
    it("loads all workflow files from .vellum/workflows/", async () => {
      createValidWorkflowFile(tempWorkspace, "code-review");
      createValidWorkflowFile(tempWorkspace, "deployment");
      createValidWorkflowFile(tempWorkspace, "testing");

      const workflows = await loader.loadAll();

      expect(workflows).toHaveLength(3);

      const ids = workflows.map((w) => w.id).sort();
      expect(ids).toEqual(["code-review", "deployment", "testing"]);
    });

    it("returns empty array when no workflows exist", async () => {
      const workflows = await loader.loadAll();
      expect(workflows).toHaveLength(0);
    });

    it("ignores non-markdown files", async () => {
      const workflowsDir = join(tempWorkspace, ".vellum", "workflows");
      mkdirSync(workflowsDir, { recursive: true });

      // Create a valid workflow
      createValidWorkflowFile(tempWorkspace, "valid");

      // Create non-markdown files that should be ignored
      writeFileSync(join(workflowsDir, "config.json"), "{}");
      writeFileSync(join(workflowsDir, "notes.txt"), "Some notes");
      writeFileSync(join(workflowsDir, "README"), "Read me");

      const workflows = await loader.loadAll();

      expect(workflows).toHaveLength(1);
      expect(workflows[0]?.id).toBe("valid");
    });

    it("sets correct source for project workflows", async () => {
      createValidWorkflowFile(tempWorkspace, "my-workflow");

      const workflows = await loader.loadAll();

      expect(workflows[0]?.source).toBe("project");
    });

    it("includes absolute path to source file", async () => {
      createValidWorkflowFile(tempWorkspace, "pathtest");

      const workflows = await loader.loadAll();

      expect(workflows[0]?.path).toContain(".vellum");
      expect(workflows[0]?.path).toContain("workflows");
      expect(workflows[0]?.path).toContain("pathtest.md");
    });
  });

  // ===========================================================================
  // T040.2: Load single workflow by name
  // ===========================================================================
  describe("load", () => {
    it("loads a specific workflow by id", async () => {
      createValidWorkflowFile(tempWorkspace, "code-review", {
        name: "Code Review",
        description: "Automated code review workflow",
      });
      createValidWorkflowFile(tempWorkspace, "deploy");

      const workflow = await loader.load("code-review");

      expect(workflow).not.toBeNull();
      expect(workflow?.id).toBe("code-review");
      expect(workflow?.name).toBe("Code Review");
    });

    it("returns null for non-existent workflow", async () => {
      const workflow = await loader.load("nonexistent");
      expect(workflow).toBeNull();
    });

    it("caches loaded workflows", async () => {
      createValidWorkflowFile(tempWorkspace, "cached");

      // First load
      const wf1 = await loader.load("cached");

      // Delete the file
      const workflowsDir = join(tempWorkspace, ".vellum", "workflows");
      rmSync(join(workflowsDir, "cached.md"));

      // Second load should return cached version
      const wf2 = await loader.load("cached");

      expect(wf1).toEqual(wf2);
    });
  });

  // ===========================================================================
  // T040.3: Handle missing directory gracefully
  // ===========================================================================
  describe("missing directory", () => {
    it("handles missing .vellum/workflows/ directory gracefully", async () => {
      // Don't create any directories
      const workflows = await loader.loadAll();
      expect(workflows).toHaveLength(0);
    });

    it("handles .vellum existing but workflows/ missing", async () => {
      mkdirSync(join(tempWorkspace, ".vellum"), { recursive: true });
      // Don't create workflows subdirectory

      const workflows = await loader.loadAll();
      expect(workflows).toHaveLength(0);
    });

    it("returns null when loading single workflow from missing directory", async () => {
      const workflow = await loader.load("any-name");
      expect(workflow).toBeNull();
    });
  });

  // ===========================================================================
  // T040.4: Parse steps array correctly
  // ===========================================================================
  describe("steps parsing", () => {
    it("parses steps array from frontmatter", async () => {
      createValidWorkflowFile(tempWorkspace, "multi-step", {
        steps: [
          { id: "analyze", prompt: "Analyze the code" },
          { id: "review", prompt: "Review changes" },
          { id: "report", prompt: "Generate report" },
        ],
      });

      const workflows = await loader.loadAll();
      const workflow = workflows[0]!;

      expect(workflow.steps).toHaveLength(3);
      expect(workflow.steps[0]).toMatchObject({
        id: "analyze",
        prompt: "Analyze the code",
      });
      expect(workflow.steps[1]).toMatchObject({
        id: "review",
        prompt: "Review changes",
      });
      expect(workflow.steps[2]).toMatchObject({
        id: "report",
        prompt: "Generate report",
      });
    });

    it("parses step validation configuration", async () => {
      createWorkflowWithValidation(tempWorkspace, "validated");

      const workflows = await loader.loadAll();
      const workflow = workflows[0]!;

      expect(workflow.steps[0]?.validation).toEqual({
        type: "exit_code",
        pattern: "0",
        message: "Build must succeed",
      });
    });

    it("parses step timeout", async () => {
      createWorkflowWithValidation(tempWorkspace, "with-timeout");

      const workflows = await loader.loadAll();
      const workflow = workflows[0]!;

      expect(workflow.steps[1]?.timeout).toBe(300);
    });

    it("parses step continueOnError flag", async () => {
      createWorkflowWithValidation(tempWorkspace, "continue-on-error");

      const workflows = await loader.loadAll();
      const workflow = workflows[0]!;

      expect(workflow.steps[0]?.continueOnError).toBe(false);
      expect(workflow.steps[1]?.continueOnError).toBe(true);
    });

    it("extracts preamble from markdown body", async () => {
      createValidWorkflowFile(tempWorkspace, "with-preamble");

      const workflows = await loader.loadAll();
      const workflow = workflows[0]!;

      expect(workflow.preamble).toContain("This is the preamble");
      expect(workflow.preamble).toContain("Instructions before steps begin");
    });
  });

  // ===========================================================================
  // T040.5: Validate workflow schema
  // ===========================================================================
  describe("schema validation", () => {
    it("skips workflows with invalid YAML syntax", async () => {
      createValidWorkflowFile(tempWorkspace, "valid");
      createCorruptWorkflowFile(tempWorkspace, "corrupt");

      const workflows = await loader.loadAll();

      expect(workflows).toHaveLength(1);
      expect(workflows[0]?.id).toBe("valid");
    });

    it("skips workflows missing required steps", async () => {
      createValidWorkflowFile(tempWorkspace, "valid");
      createInvalidSchemaWorkflowFile(tempWorkspace, "missing-steps");

      const workflows = await loader.loadAll();

      expect(workflows).toHaveLength(1);
      expect(workflows[0]?.id).toBe("valid");
    });

    it("uses default version when not specified", async () => {
      createValidWorkflowFile(tempWorkspace, "no-version");

      const workflows = await loader.loadAll();

      expect(workflows[0]?.version).toBe("1.0");
    });

    it("parses variables from frontmatter", async () => {
      createValidWorkflowFile(tempWorkspace, "with-vars", {
        variables: [
          { name: "target", default: "production" },
          { name: "verbose", default: "true" },
        ],
      });

      const workflows = await loader.loadAll();
      const workflow = workflows[0]!;

      expect(workflow.variables).toEqual({
        target: "production",
        verbose: "true",
      });
    });
  });

  // ===========================================================================
  // Variable Interpolation and Step Execution
  // ===========================================================================
  describe("executeStep", () => {
    it("returns step prompt for valid index", async () => {
      createValidWorkflowFile(tempWorkspace, "exec-test", {
        steps: [
          { id: "first", prompt: "First step" },
          { id: "second", prompt: "Second step" },
        ],
      });

      const workflow = (await loader.load("exec-test"))!;
      const result = loader.executeStep(workflow, 0);

      expect(result.success).toBe(true);
      expect(result.stepId).toBe("first");
      expect(result.prompt).toBe("First step");
    });

    it("returns error for invalid step index", async () => {
      createValidWorkflowFile(tempWorkspace, "exec-test");

      const workflow = (await loader.load("exec-test"))!;
      const result = loader.executeStep(workflow, 99);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid step index");
    });

    it("interpolates variables in step prompt", async () => {
      const workflowsDir = join(tempWorkspace, ".vellum", "workflows");
      mkdirSync(workflowsDir, { recursive: true });

      writeFileSync(
        join(workflowsDir, "interpolate.md"),
        `---
id: interpolate
name: Variable Test
steps:
  - id: deploy
    prompt: "Deploy to {{environment}} with {{mode}} mode"
variables:
  - name: environment
    default: "staging"
  - name: mode
    default: "safe"
---
Preamble.`
      );

      const workflow = (await loader.load("interpolate"))!;

      // Use defaults
      let result = loader.executeStep(workflow, 0);
      expect(result.prompt).toBe("Deploy to staging with safe mode");

      // Override variables
      result = loader.executeStep(workflow, 0, {
        environment: "production",
        mode: "fast",
      });
      expect(result.prompt).toBe("Deploy to production with fast mode");
    });

    it("returns error for negative step index", async () => {
      createValidWorkflowFile(tempWorkspace, "negative-test");

      const workflow = (await loader.load("negative-test"))!;
      const result = loader.executeStep(workflow, -1);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid step index");
    });
  });

  // ===========================================================================
  // getWorkflowInstructions
  // ===========================================================================
  describe("getWorkflowInstructions", () => {
    it("combines preamble and steps into formatted instructions", async () => {
      createValidWorkflowFile(tempWorkspace, "instructions-test", {
        steps: [
          { id: "step-one", prompt: "Do step one" },
          { id: "step-two", prompt: "Do step two" },
        ],
      });

      const workflow = (await loader.load("instructions-test"))!;
      const instructions = loader.getWorkflowInstructions(workflow);

      expect(instructions).toContain("This is the preamble");
      expect(instructions).toContain("## Workflow Steps");
      expect(instructions).toContain("### Step 1: step-one");
      expect(instructions).toContain("Do step one");
      expect(instructions).toContain("### Step 2: step-two");
      expect(instructions).toContain("Do step two");
    });

    it("interpolates variables in workflow instructions", async () => {
      const workflowsDir = join(tempWorkspace, ".vellum", "workflows");
      mkdirSync(workflowsDir, { recursive: true });

      writeFileSync(
        join(workflowsDir, "var-instructions.md"),
        `---
id: var-instructions
name: Variable Instructions
steps:
  - id: setup
    prompt: "Setup {{target}}"
variables:
  - name: target
    default: "dev"
---
Deploy to {{target}} environment.`
      );

      const workflow = (await loader.load("var-instructions"))!;
      const instructions = loader.getWorkflowInstructions(workflow, {
        target: "prod",
      });

      expect(instructions).toContain("Deploy to prod environment");
      expect(instructions).toContain("Setup prod");
    });
  });

  // ===========================================================================
  // Cache Management
  // ===========================================================================
  describe("clearCache", () => {
    it("clears the loaded workflow cache", async () => {
      createValidWorkflowFile(tempWorkspace, "cached-wf");

      // Load to populate cache
      await loader.load("cached-wf");

      // Clear cache
      loader.clearCache();

      // Delete the file
      const workflowsDir = join(tempWorkspace, ".vellum", "workflows");
      rmSync(join(workflowsDir, "cached-wf.md"));

      // Load again - should not find it since cache is cleared
      const workflow = await loader.load("cached-wf");

      expect(workflow).toBeNull();
    });

    it("allows reloading after cache clear", async () => {
      createValidWorkflowFile(tempWorkspace, "reloadable", {
        name: "First Version",
      });

      // Load first version
      let workflows = await loader.loadAll();
      expect(workflows[0]?.name).toBe("First Version");

      // Update the file
      const workflowsDir = join(tempWorkspace, ".vellum", "workflows");
      writeFileSync(
        join(workflowsDir, "reloadable.md"),
        `---
id: reloadable
name: Second Version
steps:
  - id: step
    prompt: "Updated"
---
Updated preamble.`
      );

      // Clear cache and reload
      loader.clearCache();
      workflows = await loader.loadAll();

      expect(workflows[0]?.name).toBe("Second Version");
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================
  describe("edge cases", () => {
    it("handles empty markdown files", async () => {
      const workflowsDir = join(tempWorkspace, ".vellum", "workflows");
      mkdirSync(workflowsDir, { recursive: true });

      writeFileSync(join(workflowsDir, "empty.md"), "");

      const workflows = await loader.loadAll();

      expect(workflows).toHaveLength(0);
    });

    it("handles file without frontmatter delimiters", async () => {
      const workflowsDir = join(tempWorkspace, ".vellum", "workflows");
      mkdirSync(workflowsDir, { recursive: true });

      writeFileSync(
        join(workflowsDir, "no-frontmatter.md"),
        "Just some content without any YAML frontmatter."
      );

      const workflows = await loader.loadAll();

      expect(workflows).toHaveLength(0);
    });

    it("handles workflow ids with hyphens", async () => {
      createValidWorkflowFile(tempWorkspace, "multi-word-workflow");

      const workflows = await loader.loadAll();

      expect(workflows[0]?.id).toBe("multi-word-workflow");
    });

    it("handles concurrent loadAll calls", async () => {
      createValidWorkflowFile(tempWorkspace, "wf1");
      createValidWorkflowFile(tempWorkspace, "wf2");

      // Call loadAll concurrently
      const [result1, result2] = await Promise.all([loader.loadAll(), loader.loadAll()]);

      // Both should return same results
      expect(result1.length).toBe(result2.length);
    });

    it("preserves unresolved variables in prompt", async () => {
      const workflowsDir = join(tempWorkspace, ".vellum", "workflows");
      mkdirSync(workflowsDir, { recursive: true });

      writeFileSync(
        join(workflowsDir, "partial-vars.md"),
        `---
id: partial-vars
name: Partial Variables
steps:
  - id: test
    prompt: "Use {{defined}} and {{undefined}}"
variables:
  - name: defined
    default: "known"
---
Preamble.`
      );

      const workflow = (await loader.load("partial-vars"))!;
      const result = loader.executeStep(workflow, 0);

      // defined should be interpolated, undefined should remain as placeholder
      expect(result.prompt).toBe("Use known and {{undefined}}");
    });
  });
});
