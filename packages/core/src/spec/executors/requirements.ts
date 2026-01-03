// ============================================
// Requirements Phase Executor
// ============================================

/**
 * Executor for the requirements phase of the spec workflow.
 *
 * Spawns the `spec-requirements` agent to define EARS requirements
 * and produce requirements.md with structured requirements.
 *
 * @module @vellum/core/spec/executors/requirements
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { PhaseResult } from "../types.js";
import type { PhaseContext, PhaseExecutor } from "./base.js";
import type { AgentSpawner } from "./research.js";

// =============================================================================
// Constants
// =============================================================================

const OUTPUT_FILE = "requirements.md";
const AGENT_NAME = "spec-requirements";
const PREVIOUS_PHASE_FILE = "research.md";

// =============================================================================
// Requirements Executor Class
// =============================================================================

/**
 * Executor for the requirements phase.
 *
 * The requirements phase is the second phase in the spec workflow.
 * It uses EARS (Easy Approach to Requirements Syntax) methodology
 * to define clear, testable requirements based on the research findings.
 *
 * @example
 * ```typescript
 * const executor = new RequirementsExecutor(async (agent, prompt) => {
 *   return { success: true, output: "# Requirements\n..." };
 * });
 *
 * const result = await executor.execute(context);
 * console.log(result.outputFile); // '/path/to/spec/requirements.md'
 * ```
 */
export class RequirementsExecutor implements PhaseExecutor {
  readonly phase = "requirements" as const;

  /**
   * Creates a new RequirementsExecutor.
   *
   * @param spawnAgent - Function to spawn spec agents
   */
  constructor(private readonly spawnAgent: AgentSpawner) {}

  /**
   * Optional pre-execution hook.
   *
   * Validates that the research phase has completed and output exists.
   *
   * @param context - Phase execution context
   */
  async beforeExecute(context: PhaseContext): Promise<void> {
    const researchPath = join(context.specDir, PREVIOUS_PHASE_FILE);
    try {
      await readFile(researchPath, "utf-8");
    } catch {
      // Research file not found, but we'll continue and use previousPhaseOutput if available
    }
  }

  /**
   * Executes the requirements phase.
   *
   * Builds a prompt with research context for the requirements agent,
   * spawns the agent, and writes the output to requirements.md.
   *
   * @param context - Phase execution context
   * @returns Result of the phase execution
   */
  async execute(context: PhaseContext): Promise<PhaseResult> {
    const startTime = Date.now();
    const outputPath = join(context.specDir, OUTPUT_FILE);

    try {
      // Get research content from previous phase
      const researchContent = await this.getResearchContent(context);

      // Build prompt for the requirements agent
      const prompt = this.buildPrompt(context, researchContent);

      // Spawn the requirements agent
      const result = await this.spawnAgent(AGENT_NAME, prompt);

      if (!result.success) {
        return {
          phase: this.phase,
          success: false,
          error: result.error ?? "Requirements agent failed without error message",
          duration: Date.now() - startTime,
        };
      }

      if (!result.output) {
        return {
          phase: this.phase,
          success: false,
          error: "Requirements agent returned no output",
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
   * Gets the research content from the previous phase.
   *
   * @param context - Phase execution context
   * @returns Research content or empty string if not available
   */
  private async getResearchContent(context: PhaseContext): Promise<string> {
    // First check if passed via context
    if (context.previousPhaseOutput) {
      return context.previousPhaseOutput;
    }

    // Try to read from file
    try {
      const researchPath = join(context.specDir, PREVIOUS_PHASE_FILE);
      return await readFile(researchPath, "utf-8");
    } catch {
      return "";
    }
  }

  /**
   * Builds the prompt for the requirements agent.
   *
   * @param context - Phase execution context
   * @param researchContent - Content from the research phase
   * @returns Formatted prompt string
   */
  private buildPrompt(context: PhaseContext, researchContent: string): string {
    const { workflowState, templateContent } = context;

    const sections: string[] = [
      "# Requirements Phase",
      "",
      "## Workflow Context",
      `- **Workflow ID**: ${workflowState.id}`,
      `- **Name**: ${workflowState.name}`,
      `- **Description**: ${workflowState.description}`,
      "",
      "## Task",
      "Define requirements using EARS (Easy Approach to Requirements Syntax) methodology.",
      "",
      "### EARS Patterns",
      "Use these patterns for clear, testable requirements:",
      "",
      "1. **Ubiquitous**: `The <system> shall <action>`",
      "2. **Event-driven**: `When <event>, the <system> shall <action>`",
      "3. **State-driven**: `While <state>, the <system> shall <action>`",
      "4. **Optional**: `Where <condition>, the <system> shall <action>`",
      "5. **Unwanted**: `If <condition>, the <system> shall <action>`",
      "",
      "### Required Sections",
      "1. Functional Requirements",
      "2. Non-Functional Requirements",
      "3. Constraints",
      "4. Acceptance Criteria",
      "",
    ];

    if (researchContent) {
      sections.push("## Research Context", "", researchContent, "");
    }

    if (templateContent) {
      sections.push("## Template", "", templateContent, "");
    }

    sections.push(
      "## Output",
      `Write the requirements document to: ${OUTPUT_FILE}`,
      "",
      "Format as Markdown with numbered requirements and traceability IDs (e.g., REQ-001)."
    );

    return sections.join("\n");
  }
}
