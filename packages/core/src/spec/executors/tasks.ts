// ============================================
// Tasks Phase Executor
// ============================================

/**
 * Executor for the tasks phase of the spec workflow.
 *
 * Spawns the `spec-tasks` agent to break down the design
 * into actionable implementation tasks.
 *
 * @module @vellum/core/spec/executors/tasks
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { PhaseResult } from "../types.js";
import type { PhaseContext, PhaseExecutor } from "./base.js";
import type { AgentSpawner } from "./research.js";

// =============================================================================
// Constants
// =============================================================================

const OUTPUT_FILE = "tasks.md";
const AGENT_NAME = "spec-tasks";

// =============================================================================
// Tasks Executor Class
// =============================================================================

/**
 * Executor for the tasks phase.
 *
 * The tasks phase is the fourth phase in the spec workflow.
 * It breaks down the design into implementable tasks with
 * clear acceptance criteria and dependencies.
 *
 * @example
 * ```typescript
 * const executor = new TasksExecutor(async (agent, prompt) => {
 *   return { success: true, output: "# Tasks\n## T001 - Setup...\n..." };
 * });
 *
 * const result = await executor.execute(context);
 * console.log(result.outputFile); // '/path/to/spec/tasks.md'
 * ```
 */
export class TasksExecutor implements PhaseExecutor {
  readonly phase = "tasks" as const;

  /**
   * Creates a new TasksExecutor.
   *
   * @param spawnAgent - Function to spawn spec agents
   */
  constructor(private readonly spawnAgent: AgentSpawner) {}

  /**
   * Executes the tasks phase.
   *
   * Builds a prompt with design context for the tasks agent,
   * spawns the agent, and writes the output to tasks.md.
   *
   * @param context - Phase execution context
   * @returns Result of the phase execution
   */
  async execute(context: PhaseContext): Promise<PhaseResult> {
    const startTime = Date.now();
    const outputPath = join(context.specDir, OUTPUT_FILE);

    try {
      // Get context from previous phases
      const previousContent = await this.getPreviousPhaseContent(context);

      // Build prompt for the tasks agent
      const prompt = this.buildPrompt(context, previousContent);

      // Spawn the tasks agent
      const result = await this.spawnAgent(AGENT_NAME, prompt);

      if (!result.success) {
        return {
          phase: this.phase,
          success: false,
          error: result.error ?? "Tasks agent failed without error message",
          duration: Date.now() - startTime,
        };
      }

      if (!result.output) {
        return {
          phase: this.phase,
          success: false,
          error: "Tasks agent returned no output",
          duration: Date.now() - startTime,
        };
      }

      // Ensure directory exists and write output
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, result.output, "utf-8");

      return {
        phase: this.phase,
        success: true,
        outputFile: outputPath,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        phase: this.phase,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Gets content from previous phases.
   *
   * @param context - Phase execution context
   * @returns Combined content from previous phases
   */
  private async getPreviousPhaseContent(context: PhaseContext): Promise<string> {
    const sections: string[] = [];

    // Try to get requirements content (for traceability)
    try {
      const requirementsPath = join(context.specDir, "requirements.md");
      const requirements = await readFile(requirementsPath, "utf-8");
      sections.push("## Requirements", "", requirements, "");
    } catch {
      // Requirements not available
    }

    // Get design content (or use previousPhaseOutput)
    if (context.previousPhaseOutput) {
      sections.push("## Design", "", context.previousPhaseOutput, "");
    } else {
      try {
        const designPath = join(context.specDir, "design.md");
        const design = await readFile(designPath, "utf-8");
        sections.push("## Design", "", design, "");
      } catch {
        // Design not available
      }
    }

    return sections.join("\n");
  }

  /**
   * Builds the prompt for the tasks agent.
   *
   * @param context - Phase execution context
   * @param previousContent - Content from previous phases
   * @returns Formatted prompt string
   */
  private buildPrompt(context: PhaseContext, previousContent: string): string {
    const { workflowState, templateContent } = context;

    const sections: string[] = [
      "# Tasks Phase",
      "",
      "## Workflow Context",
      `- **Workflow ID**: ${workflowState.id}`,
      `- **Name**: ${workflowState.name}`,
      `- **Description**: ${workflowState.description}`,
      "",
      "## Task",
      "Break down the design into actionable implementation tasks.",
      "",
      "### Task Format",
      "Each task should include:",
      "- **ID**: Unique identifier (e.g., T001, T002)",
      "- **Title**: Brief description",
      "- **Description**: Detailed requirements",
      "- **Acceptance Criteria**: Testable conditions for completion",
      "- **Dependencies**: Other task IDs this depends on",
      "- **Estimate**: Complexity estimate (S/M/L/XL)",
      "- **Requirements Trace**: Related requirement IDs (REQ-xxx)",
      "",
      "### Task Grouping",
      "Group tasks by:",
      "1. **Setup/Infrastructure** - Initial setup and scaffolding",
      "2. **Core Implementation** - Main feature logic",
      "3. **Testing** - Unit, integration, and e2e tests",
      "4. **Documentation** - API docs, guides, examples",
      "5. **Polish** - Error handling, edge cases, optimization",
      "",
      "### Example Task",
      "```markdown",
      "## T001 - Create base interface",
      "",
      "**Description**: Define the TypeScript interface for...",
      "",
      "**Acceptance Criteria**:",
      "- [ ] Interface exported from module",
      "- [ ] JSDoc comments on all properties",
      "- [ ] Unit tests for type validation",
      "",
      "**Dependencies**: None",
      "**Estimate**: S",
      "**Traces**: REQ-001, REQ-002",
      "```",
      "",
    ];

    if (previousContent) {
      sections.push("## Previous Phase Content", "", previousContent, "");
    }

    if (templateContent) {
      sections.push("## Template", "", templateContent, "");
    }

    sections.push(
      "## Output",
      `Write the tasks document to: ${OUTPUT_FILE}`,
      "",
      "Order tasks by dependency (no task depends on a later task).",
      "Include a summary table at the top with all tasks, estimates, and status."
    );

    return sections.join("\n");
  }
}
