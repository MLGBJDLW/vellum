// ============================================
// Workflow Loader
// ============================================

/**
 * Loads workflow definitions from `.vellum/workflows/*.md` files.
 *
 * Workflows are multi-step instructions that guide the agent through
 * complex tasks with sequential prompts.
 *
 * @module @vellum/core/workflows/workflow-loader
 * @see REQ-011
 */

import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, join } from "node:path";
import {
  FrontmatterParser,
  type WorkflowFrontmatter,
  workflowFrontmatterSchema,
} from "@vellum/shared";

import { createLogger } from "../logger/index.js";

// =============================================================================
// Constants
// =============================================================================

/**
 * Logger instance for WorkflowLoader.
 */
const logger = createLogger({ name: "workflow-loader" });

/**
 * Standard workflow directories.
 */
const PROJECT_WORKFLOWS_DIR = ".vellum/workflows";
const USER_WORKFLOWS_DIR = ".vellum/workflows";

// =============================================================================
// Types
// =============================================================================

/**
 * Source of a workflow file.
 */
export type WorkflowSource = "project" | "user";

/**
 * Validation configuration for workflow steps.
 */
export interface StepValidation {
  /** Type of validation to perform. */
  type: "output_contains" | "output_matches" | "exit_code" | "manual";
  /** Pattern or value to match. */
  pattern?: string;
  /** Message to display on validation failure. */
  message?: string;
}

/**
 * A single step in a workflow.
 */
export interface WorkflowStep {
  /** Unique step identifier. */
  id: string;
  /** Prompt text for this step. */
  prompt: string;
  /** Validation rules for step completion. */
  validation?: StepValidation;
  /** Whether to continue on error. */
  continueOnError: boolean;
  /** Timeout in seconds. */
  timeout?: number;
}

/**
 * A loaded workflow definition.
 */
export interface Workflow {
  /** Unique workflow identifier. */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Description of the workflow. */
  description?: string;
  /** Ordered list of workflow steps. */
  steps: WorkflowStep[];
  /** Variable definitions. */
  variables?: Record<string, string>;
  /** Version string. */
  version: string;
  /** Source of the workflow. */
  source: WorkflowSource;
  /** Absolute path to the source file. */
  path: string;
  /** Raw body content (instructions before steps). */
  preamble: string;
}

/**
 * Options for WorkflowLoader.
 */
export interface WorkflowLoaderOptions {
  /** Current working directory (workspace root). */
  cwd: string;
  /** Whether to load user workflows from ~/.vellum/workflows/. @default true */
  loadUserWorkflows?: boolean;
}

/**
 * Result from executing a workflow step.
 */
export interface StepResult {
  /** Whether the step succeeded. */
  success: boolean;
  /** Step identifier. */
  stepId: string;
  /** Prompt that was injected. */
  prompt: string;
  /** Error message if failed. */
  error?: string;
  /** Whether validation passed. */
  validationPassed?: boolean;
}

// =============================================================================
// WorkflowLoader Class
// =============================================================================

/**
 * Loads workflow definitions from markdown files.
 *
 * Scans `.vellum/workflows/` directories for markdown files with
 * YAML frontmatter, parses them, and returns Workflow objects.
 *
 * @example
 * ```typescript
 * const loader = new WorkflowLoader({ cwd: '/path/to/project' });
 *
 * // Load all workflows
 * const workflows = await loader.loadAll();
 *
 * // Load a specific workflow
 * const deployWorkflow = await loader.load('deploy');
 *
 * // Execute a step
 * const result = await loader.executeStep(deployWorkflow, 0);
 * ```
 */
export class WorkflowLoader {
  private readonly cwd: string;
  private readonly loadUserWorkflows: boolean;
  private readonly frontmatterParser: FrontmatterParser<typeof workflowFrontmatterSchema>;
  private loaded: Map<string, Workflow> = new Map();

  /**
   * Creates a new WorkflowLoader instance.
   *
   * @param options - Loader configuration options
   */
  constructor(options: WorkflowLoaderOptions) {
    this.cwd = options.cwd;
    this.loadUserWorkflows = options.loadUserWorkflows ?? true;
    this.frontmatterParser = new FrontmatterParser(workflowFrontmatterSchema);
  }

  // ===========================================================================
  // Public Methods
  // ===========================================================================

  /**
   * Loads all workflows from all sources.
   *
   * Scans project and user workflow directories, parses markdown files,
   * and returns deduplicated workflows (project takes precedence).
   *
   * @returns Array of loaded workflows
   */
  async loadAll(): Promise<Workflow[]> {
    this.loaded.clear();
    const workflows: Workflow[] = [];

    // Load from project directory (higher priority)
    const projectDir = join(this.cwd, PROJECT_WORKFLOWS_DIR);
    await this.loadFromDirectory(projectDir, "project", workflows);

    // Load from user directory (lower priority)
    if (this.loadUserWorkflows) {
      const userDir = join(homedir(), USER_WORKFLOWS_DIR);
      await this.loadFromDirectory(userDir, "user", workflows);
    }

    return workflows;
  }

  /**
   * Loads a specific workflow by name/id.
   *
   * Searches project directory first, then user directory.
   *
   * @param name - Workflow name/id to load
   * @returns The loaded workflow, or null if not found
   */
  async load(name: string): Promise<Workflow | null> {
    // Check cache first
    const cached = this.loaded.get(name);
    if (cached) {
      return cached;
    }

    // Try project directory first
    const projectPath = join(this.cwd, PROJECT_WORKFLOWS_DIR, `${name}.md`);
    if (existsSync(projectPath)) {
      const wf = await this.loadFile(projectPath, "project");
      if (wf) {
        this.loaded.set(name, wf);
        return wf;
      }
    }

    // Try user directory
    if (this.loadUserWorkflows) {
      const userPath = join(homedir(), USER_WORKFLOWS_DIR, `${name}.md`);
      if (existsSync(userPath)) {
        const wf = await this.loadFile(userPath, "user");
        if (wf) {
          this.loaded.set(name, wf);
          return wf;
        }
      }
    }

    return null;
  }

  /**
   * Prepares a step for execution by interpolating variables.
   *
   * @param workflow - The workflow containing the step
   * @param stepIndex - Index of the step to execute
   * @param variables - Variable values to interpolate
   * @returns Step result with the prepared prompt
   */
  executeStep(
    workflow: Workflow,
    stepIndex: number,
    variables?: Record<string, string>
  ): StepResult {
    if (stepIndex < 0 || stepIndex >= workflow.steps.length) {
      return {
        success: false,
        stepId: `step-${stepIndex}`,
        prompt: "",
        error: `Invalid step index: ${stepIndex}`,
      };
    }

    const step = workflow.steps[stepIndex];
    if (!step) {
      return {
        success: false,
        stepId: "",
        prompt: "",
        error: `Step at index ${stepIndex} not found`,
      };
    }
    const mergedVars = { ...workflow.variables, ...variables };
    const interpolatedPrompt = this.interpolateVariables(step.prompt, mergedVars);

    return {
      success: true,
      stepId: step.id,
      prompt: interpolatedPrompt,
    };
  }

  /**
   * Gets the full workflow instructions for injection.
   *
   * Combines preamble and all step prompts into a single string.
   *
   * @param workflow - The workflow to format
   * @param variables - Variable values to interpolate
   * @returns Formatted workflow instructions
   */
  getWorkflowInstructions(workflow: Workflow, variables?: Record<string, string>): string {
    const mergedVars = { ...workflow.variables, ...variables };
    const parts: string[] = [];

    // Add preamble if present
    if (workflow.preamble) {
      parts.push(this.interpolateVariables(workflow.preamble, mergedVars));
    }

    // Add step instructions
    if (workflow.steps.length > 0) {
      parts.push("\n## Workflow Steps\n");
      for (let i = 0; i < workflow.steps.length; i++) {
        const step = workflow.steps[i];
        if (step) {
          const prompt = this.interpolateVariables(step.prompt, mergedVars);
          parts.push(`### Step ${i + 1}: ${step.id}\n${prompt}\n`);
        }
      }
    }

    return parts.join("\n");
  }

  /**
   * Clears the loaded workflow cache.
   */
  clearCache(): void {
    this.loaded.clear();
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Loads workflows from a directory.
   */
  private async loadFromDirectory(
    dirPath: string,
    source: WorkflowSource,
    workflows: Workflow[]
  ): Promise<void> {
    if (!existsSync(dirPath)) {
      return;
    }

    try {
      const entries = await readdir(dirPath, { withFileTypes: true });
      const mdFiles = entries
        .filter((e) => e.isFile() && extname(e.name) === ".md")
        .map((e) => join(dirPath, e.name));

      for (const filePath of mdFiles) {
        const workflow = await this.loadFile(filePath, source);
        if (workflow) {
          // Check for duplicates (project overrides user)
          const existingIdx = workflows.findIndex((w) => w.id === workflow.id);
          if (existingIdx >= 0) {
            if (source === "project") {
              workflows[existingIdx] = workflow;
            }
            // else: user workflow ignored, project already loaded
          } else {
            workflows.push(workflow);
            this.loaded.set(workflow.id, workflow);
          }
        }
      }
    } catch (err) {
      logger.warn(`Failed to scan workflow directory ${dirPath}: ${err}`);
    }
  }

  /**
   * Loads a single workflow file.
   */
  private async loadFile(filePath: string, source: WorkflowSource): Promise<Workflow | null> {
    try {
      const content = await readFile(filePath, "utf-8");
      const parseResult = this.frontmatterParser.parse(content);

      if (!parseResult.success) {
        logger.warn(`Failed to parse workflow file ${filePath}: Invalid frontmatter`);
        return null;
      }

      const fm = parseResult.data as WorkflowFrontmatter;

      // Convert frontmatter steps to WorkflowStep[]
      const steps: WorkflowStep[] = fm.steps.map((s) => ({
        id: s.id,
        prompt: s.prompt,
        validation: s.validation
          ? {
              type: s.validation.type,
              pattern: s.validation.pattern,
              message: s.validation.message,
            }
          : undefined,
        continueOnError: s.continueOnError ?? false,
        timeout: s.timeout,
      }));

      // Convert variables array to Record
      const variables: Record<string, string> = {};
      if (fm.variables) {
        for (const v of fm.variables) {
          if (v.default) {
            variables[v.name] = v.default;
          }
        }
      }

      return {
        id: fm.id,
        name: fm.name,
        description: fm.description,
        steps,
        variables,
        version: fm.version ?? "1.0",
        source,
        path: filePath,
        preamble: parseResult.body.trim(),
      };
    } catch (err) {
      logger.warn(`Failed to read workflow file ${filePath}: ${err}`);
      return null;
    }
  }

  /**
   * Interpolates variables in a string.
   */
  private interpolateVariables(text: string, variables?: Record<string, string>): string {
    if (!variables || Object.keys(variables).length === 0) {
      return text;
    }

    return text.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
      return variables[varName] ?? match;
    });
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Creates a WorkflowLoader instance.
 *
 * @param options - Loader configuration options
 * @returns A new WorkflowLoader instance
 */
export function createWorkflowLoader(options: WorkflowLoaderOptions): WorkflowLoader {
  return new WorkflowLoader(options);
}
