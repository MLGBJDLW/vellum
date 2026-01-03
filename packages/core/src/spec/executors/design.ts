// ============================================
// Design Phase Executor
// ============================================

/**
 * Executor for the design phase of the spec workflow.
 *
 * Spawns the `spec-architect` agent to create architecture
 * and design decisions, producing design.md and optional ADRs.
 *
 * @module @vellum/core/spec/executors/design
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { PhaseResult } from "../types.js";
import type { PhaseContext, PhaseExecutor } from "./base.js";
import type { AgentSpawner } from "./research.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Extended result from design agent with ADR support.
 */
export interface DesignAgentOutput {
  /** Main design document content */
  designContent: string;
  /** Optional Architecture Decision Records */
  adrs?: Array<{
    /** ADR filename (e.g., "ADR-001-use-typescript.md") */
    filename: string;
    /** ADR content */
    content: string;
  }>;
}

// =============================================================================
// Constants
// =============================================================================

const OUTPUT_FILE = "design.md";
const AGENT_NAME = "spec-architect";
const ADR_DIR = "adr";

// =============================================================================
// Design Executor Class
// =============================================================================

/**
 * Executor for the design phase.
 *
 * The design phase is the third phase in the spec workflow.
 * It creates architecture diagrams, component designs, and
 * Architecture Decision Records (ADRs) based on requirements.
 *
 * @example
 * ```typescript
 * const executor = new DesignExecutor(async (agent, prompt) => {
 *   return {
 *     success: true,
 *     output: JSON.stringify({
 *       designContent: "# Design\n...",
 *       adrs: [{ filename: "ADR-001.md", content: "..." }]
 *     })
 *   };
 * });
 *
 * const result = await executor.execute(context);
 * console.log(result.outputFile); // '/path/to/spec/design.md'
 * ```
 */
export class DesignExecutor implements PhaseExecutor {
  readonly phase = "design" as const;

  /**
   * Creates a new DesignExecutor.
   *
   * @param spawnAgent - Function to spawn spec agents
   */
  constructor(private readonly spawnAgent: AgentSpawner) {}

  /**
   * Executes the design phase.
   *
   * Builds a prompt with requirements context for the architect agent,
   * spawns the agent, and writes design.md and any ADRs.
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

      // Build prompt for the architect agent
      const prompt = this.buildPrompt(context, previousContent);

      // Spawn the architect agent
      const result = await this.spawnAgent(AGENT_NAME, prompt);

      if (!result.success) {
        return {
          phase: this.phase,
          success: false,
          error: result.error ?? "Design agent failed without error message",
          duration: Date.now() - startTime,
        };
      }

      if (!result.output) {
        return {
          phase: this.phase,
          success: false,
          error: "Design agent returned no output",
          duration: Date.now() - startTime,
        };
      }

      // Parse and write output
      await this.writeOutput(context.specDir, result.output);

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
   * Gets content from previous phases (research and requirements).
   *
   * @param context - Phase execution context
   * @returns Combined content from previous phases
   */
  private async getPreviousPhaseContent(context: PhaseContext): Promise<string> {
    const sections: string[] = [];

    // Try to get research content
    try {
      const researchPath = join(context.specDir, "research.md");
      const research = await readFile(researchPath, "utf-8");
      sections.push("## Research Summary", "", research, "");
    } catch {
      // Research not available
    }

    // Try to get requirements content (or use previousPhaseOutput)
    if (context.previousPhaseOutput) {
      sections.push("## Requirements", "", context.previousPhaseOutput, "");
    } else {
      try {
        const requirementsPath = join(context.specDir, "requirements.md");
        const requirements = await readFile(requirementsPath, "utf-8");
        sections.push("## Requirements", "", requirements, "");
      } catch {
        // Requirements not available
      }
    }

    return sections.join("\n");
  }

  /**
   * Writes design output and any ADRs.
   *
   * @param specDir - Spec directory path
   * @param output - Raw output from the agent
   */
  private async writeOutput(specDir: string, output: string): Promise<void> {
    const outputPath = join(specDir, OUTPUT_FILE);

    // Try to parse as JSON with ADRs, fall back to plain markdown
    let designContent: string;
    let adrs: DesignAgentOutput["adrs"];

    try {
      const parsed = JSON.parse(output) as DesignAgentOutput;
      designContent = parsed.designContent;
      adrs = parsed.adrs;
    } catch {
      // Output is plain markdown
      designContent = output;
    }

    // Write main design document
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, designContent, "utf-8");

    // Write ADRs if present
    if (adrs && adrs.length > 0) {
      const adrDir = join(specDir, ADR_DIR);
      await mkdir(adrDir, { recursive: true });

      for (const adr of adrs) {
        const adrPath = join(adrDir, adr.filename);
        await writeFile(adrPath, adr.content, "utf-8");
      }
    }
  }

  /**
   * Builds the prompt for the architect agent.
   *
   * @param context - Phase execution context
   * @param previousContent - Content from previous phases
   * @returns Formatted prompt string
   */
  private buildPrompt(context: PhaseContext, previousContent: string): string {
    const { workflowState, templateContent } = context;

    const sections: string[] = [
      "# Design Phase",
      "",
      "## Workflow Context",
      `- **Workflow ID**: ${workflowState.id}`,
      `- **Name**: ${workflowState.name}`,
      `- **Description**: ${workflowState.description}`,
      "",
      "## Task",
      "Create the architecture and design for this feature/project.",
      "",
      "### Required Deliverables",
      "1. **Design Document** (`design.md`)",
      "   - System architecture overview",
      "   - Component diagrams (Mermaid syntax)",
      "   - Data flow descriptions",
      "   - Interface definitions",
      "   - Error handling strategy",
      "",
      "2. **Architecture Decision Records** (optional)",
      "   - For significant technical decisions",
      "   - Follow ADR template format",
      "   - Name as `ADR-NNN-title.md`",
      "",
      "### ADR Format",
      "```markdown",
      "# ADR-NNN: Title",
      "",
      "## Status",
      "Proposed | Accepted | Deprecated | Superseded",
      "",
      "## Context",
      "What is the issue?",
      "",
      "## Decision",
      "What was decided?",
      "",
      "## Consequences",
      "What are the results?",
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
      "## Output Format",
      "Return your response as JSON with this structure:",
      "```json",
      "{",
      '  "designContent": "# Design\\n...",',
      '  "adrs": [',
      '    { "filename": "ADR-001-example.md", "content": "..." }',
      "  ]",
      "}",
      "```",
      "",
      "If no ADRs are needed, you may return plain Markdown instead of JSON."
    );

    return sections.join("\n");
  }
}
