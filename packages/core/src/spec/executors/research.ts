// ============================================
// Research Phase Executor
// ============================================

/**
 * Executor for the research phase of the spec workflow.
 *
 * Spawns the `spec-researcher` agent to analyze the project
 * and produce research.md with project context and dependencies.
 *
 * @module @vellum/core/spec/executors/research
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { PhaseResult } from "../types.js";
import type { PhaseContext, PhaseExecutor } from "./base.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Result from spawning a spec agent.
 */
export interface AgentSpawnResult {
  /** Whether the agent completed successfully */
  success: boolean;
  /** Output content from the agent */
  output?: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Function type for spawning spec agents.
 *
 * @param agentName - Name of the agent to spawn (e.g., "spec-researcher")
 * @param prompt - Prompt/context to send to the agent
 * @returns Result of the agent execution
 */
export type AgentSpawner = (agentName: string, prompt: string) => Promise<AgentSpawnResult>;

// =============================================================================
// Constants
// =============================================================================

const OUTPUT_FILE = "research.md";
const AGENT_NAME = "spec-researcher";

// =============================================================================
// Research Executor Class
// =============================================================================

/**
 * Executor for the research phase.
 *
 * The research phase is the first phase in the spec workflow.
 * It gathers project context, identifies dependencies, and analyzes
 * the codebase to inform subsequent phases.
 *
 * @example
 * ```typescript
 * const executor = new ResearchExecutor(async (agent, prompt) => {
 *   // Spawn agent and return result
 *   return { success: true, output: "# Research Results\n..." };
 * });
 *
 * const result = await executor.execute(context);
 * console.log(result.outputFile); // '/path/to/spec/research.md'
 * ```
 */
export class ResearchExecutor implements PhaseExecutor {
  readonly phase = "research" as const;

  /**
   * Creates a new ResearchExecutor.
   *
   * @param spawnAgent - Function to spawn spec agents
   */
  constructor(private readonly spawnAgent: AgentSpawner) {}

  /**
   * Executes the research phase.
   *
   * Builds a prompt for the researcher agent with workflow context,
   * spawns the agent, and writes the output to research.md.
   *
   * @param context - Phase execution context
   * @returns Result of the phase execution
   */
  async execute(context: PhaseContext): Promise<PhaseResult> {
    const startTime = Date.now();
    const outputPath = join(context.specDir, OUTPUT_FILE);

    try {
      // Build prompt for the researcher agent
      const prompt = this.buildPrompt(context);

      // Spawn the researcher agent
      const result = await this.spawnAgent(AGENT_NAME, prompt);

      if (!result.success) {
        return {
          phase: this.phase,
          success: false,
          error: result.error ?? "Research agent failed without error message",
          duration: Date.now() - startTime,
        };
      }

      if (!result.output) {
        return {
          phase: this.phase,
          success: false,
          error: "Research agent returned no output",
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
   * Builds the prompt for the researcher agent.
   *
   * @param context - Phase execution context
   * @returns Formatted prompt string
   */
  private buildPrompt(context: PhaseContext): string {
    const { workflowState, templateContent } = context;

    const sections: string[] = [
      "# Research Phase",
      "",
      "## Workflow Context",
      `- **Workflow ID**: ${workflowState.id}`,
      `- **Name**: ${workflowState.name}`,
      `- **Description**: ${workflowState.description}`,
      `- **Spec Directory**: ${workflowState.specDir}`,
      "",
      "## Task",
      "Analyze the project and produce a comprehensive research document.",
      "",
      "### Required Deliverables",
      "1. Project structure analysis",
      "2. Dependency inventory",
      "3. Technology stack identification",
      "4. Architecture overview",
      "5. Key patterns and conventions",
      "",
    ];

    if (templateContent) {
      sections.push("## Template", "", templateContent, "");
    }

    sections.push(
      "## Output",
      `Write the research document to: ${OUTPUT_FILE}`,
      "",
      "Format the output as Markdown with clear sections and code examples where relevant."
    );

    return sections.join("\n");
  }
}
