// ============================================
// Validation Phase Executor
// ============================================

/**
 * Executor for the validation phase of the spec workflow.
 *
 * Spawns the `spec-validator` agent to verify all deliverables
 * and produce a validation report. Can execute shell commands
 * for test verification.
 *
 * @module @vellum/core/spec/executors/validation
 */

import { exec } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import type { PhaseResult } from "../types.js";
import type { PhaseContext, PhaseExecutor } from "./base.js";
import type { AgentSpawner } from "./research.js";

const execAsync = promisify(exec);

// =============================================================================
// Types
// =============================================================================

/**
 * Result from executing a shell command for verification.
 */
export interface CommandResult {
  /** Command that was executed */
  command: string;
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
  /** Exit code (0 = success) */
  exitCode: number;
}

/**
 * Options for command execution.
 */
export interface CommandOptions {
  /** Working directory for the command */
  cwd?: string;
  /** Timeout in milliseconds */
  timeout?: number;
}

/**
 * Function type for executing shell commands.
 */
export type CommandExecutor = (command: string, options?: CommandOptions) => Promise<CommandResult>;

// =============================================================================
// Constants
// =============================================================================

const OUTPUT_FILE = "validation-report.md";
const AGENT_NAME = "spec-validator";
const DEFAULT_TIMEOUT = 60000; // 60 seconds

// =============================================================================
// Validation Executor Class
// =============================================================================

/**
 * Executor for the validation phase.
 *
 * The validation phase is the final phase in the spec workflow.
 * It verifies all deliverables, runs tests if available, and
 * produces a comprehensive validation report.
 *
 * @example
 * ```typescript
 * const executor = new ValidationExecutor(
 *   async (agent, prompt) => {
 *     return { success: true, output: "# Validation Report\n..." };
 *   },
 *   async (cmd, opts) => {
 *     // Execute command and return result
 *     return { command: cmd, stdout: "", stderr: "", exitCode: 0 };
 *   }
 * );
 *
 * const result = await executor.execute(context);
 * console.log(result.outputFile); // '/path/to/spec/validation-report.md'
 * ```
 */
export class ValidationExecutor implements PhaseExecutor {
  readonly phase = "validation" as const;
  private readonly executeCommand: CommandExecutor;

  /**
   * Creates a new ValidationExecutor.
   *
   * @param spawnAgent - Function to spawn spec agents
   * @param commandExecutor - Optional custom command executor
   */
  constructor(
    private readonly spawnAgent: AgentSpawner,
    commandExecutor?: CommandExecutor
  ) {
    this.executeCommand = commandExecutor ?? this.defaultCommandExecutor.bind(this);
  }

  /**
   * Executes the validation phase.
   *
   * Gathers all spec artifacts, runs verification tests if available,
   * and spawns the validator agent to produce the final report.
   *
   * @param context - Phase execution context
   * @returns Result of the phase execution
   */
  async execute(context: PhaseContext): Promise<PhaseResult> {
    const startTime = Date.now();
    const outputPath = join(context.specDir, OUTPUT_FILE);

    try {
      // Gather all spec artifacts
      const artifacts = await this.gatherArtifacts(context.specDir);

      // Run verification tests if available
      const testResults = await this.runVerificationTests(context);

      // Build prompt for the validator agent
      const prompt = this.buildPrompt(context, artifacts, testResults);

      // Spawn the validator agent
      const result = await this.spawnAgent(AGENT_NAME, prompt);

      if (!result.success) {
        return {
          phase: this.phase,
          success: false,
          error: result.error ?? "Validation agent failed without error message",
          duration: Date.now() - startTime,
        };
      }

      if (!result.output) {
        return {
          phase: this.phase,
          success: false,
          error: "Validation agent returned no output",
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
   * Default command executor using Node.js child_process.
   *
   * @param command - Shell command to execute
   * @param options - Execution options
   * @returns Command execution result
   */
  private async defaultCommandExecutor(
    command: string,
    options?: CommandOptions
  ): Promise<CommandResult> {
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: options?.cwd,
        timeout: options?.timeout ?? DEFAULT_TIMEOUT,
      });
      return {
        command,
        stdout,
        stderr,
        exitCode: 0,
      };
    } catch (error) {
      const execError = error as {
        stdout?: string;
        stderr?: string;
        code?: number;
      };
      return {
        command,
        stdout: execError.stdout ?? "",
        stderr: execError.stderr ?? String(error),
        exitCode: execError.code ?? 1,
      };
    }
  }

  /**
   * Gathers all artifacts from the spec directory.
   *
   * @param specDir - Spec directory path
   * @returns Map of filename to content
   */
  private async gatherArtifacts(specDir: string): Promise<Map<string, string>> {
    const artifacts = new Map<string, string>();
    const specFiles = ["research.md", "requirements.md", "design.md", "tasks.md"];

    for (const file of specFiles) {
      try {
        const filePath = join(specDir, file);
        const content = await readFile(filePath, "utf-8");
        artifacts.set(file, content);
      } catch {
        // File not found, skip
      }
    }

    // Also check for ADRs
    try {
      const adrDir = join(specDir, "adr");
      const adrFiles = await readdir(adrDir);
      for (const file of adrFiles) {
        if (file.endsWith(".md")) {
          const content = await readFile(join(adrDir, file), "utf-8");
          artifacts.set(`adr/${file}`, content);
        }
      }
    } catch {
      // No ADR directory
    }

    return artifacts;
  }

  /**
   * Runs verification tests if a test command is available.
   *
   * @param context - Phase execution context
   * @returns Array of test results
   */
  private async runVerificationTests(context: PhaseContext): Promise<CommandResult[]> {
    const results: CommandResult[] = [];
    const { specDir } = context;

    // Try to detect package manager and run appropriate test
    try {
      const packageJsonPath = join(specDir, "..", "package.json");
      const packageJson = JSON.parse(await readFile(packageJsonPath, "utf-8"));

      if (packageJson.scripts?.test) {
        // Has a test script, try to run it
        const result = await this.executeCommand("npm test --if-present", {
          cwd: dirname(packageJsonPath),
          timeout: DEFAULT_TIMEOUT * 2,
        });
        results.push(result);
      }
    } catch {
      // No package.json or test script, skip tests
    }

    return results;
  }

  /**
   * Builds the prompt for the validator agent.
   *
   * @param context - Phase execution context
   * @param artifacts - Gathered spec artifacts
   * @param testResults - Results from verification tests
   * @returns Formatted prompt string
   */
  private buildPrompt(
    context: PhaseContext,
    artifacts: Map<string, string>,
    testResults: CommandResult[]
  ): string {
    const { workflowState, templateContent } = context;

    const sections: string[] = [
      "# Validation Phase",
      "",
      "## Workflow Context",
      `- **Workflow ID**: ${workflowState.id}`,
      `- **Name**: ${workflowState.name}`,
      `- **Description**: ${workflowState.description}`,
      "",
      "## Task",
      "Validate all spec deliverables and produce a comprehensive validation report.",
      "",
      "### Validation Criteria",
      "1. **Completeness**: All required deliverables exist",
      "2. **Consistency**: No contradictions between documents",
      "3. **Traceability**: Requirements traced through design to tasks",
      "4. **Testability**: Acceptance criteria are verifiable",
      "5. **Feasibility**: Tasks are implementable as specified",
      "",
      "### Required Report Sections",
      "1. **Summary**: Overall validation status (PASS/FAIL)",
      "2. **Deliverables Checklist**: List of all artifacts and status",
      "3. **Requirements Coverage**: Matrix of requirements to tasks",
      "4. **Issues Found**: Any problems or inconsistencies",
      "5. **Recommendations**: Suggested improvements",
      "",
    ];

    // Add artifacts
    sections.push("## Spec Artifacts", "");
    for (const [filename, content] of artifacts) {
      sections.push(`### ${filename}`, "", "```markdown", content, "```", "");
    }

    // Add test results if any
    if (testResults.length > 0) {
      sections.push("## Test Results", "");
      for (const result of testResults) {
        const status = result.exitCode === 0 ? "✅ PASS" : "❌ FAIL";
        sections.push(
          `### Command: \`${result.command}\` - ${status}`,
          "",
          "**stdout:**",
          "```",
          result.stdout || "(no output)",
          "```",
          "",
          "**stderr:**",
          "```",
          result.stderr || "(no output)",
          "```",
          ""
        );
      }
    }

    if (templateContent) {
      sections.push("## Template", "", templateContent, "");
    }

    sections.push(
      "## Output",
      `Write the validation report to: ${OUTPUT_FILE}`,
      "",
      "Use clear status indicators:",
      "- ✅ PASS - Requirement met",
      "- ⚠️ WARN - Minor issues",
      "- ❌ FAIL - Critical issues",
      "",
      "The report should be actionable - if issues are found, explain how to fix them."
    );

    return sections.join("\n");
  }
}
