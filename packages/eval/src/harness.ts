/**
 * EvalHarness - Create isolated evaluation environments
 * @module @vellum/eval
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { ModeConfig, TerminationLimits } from "@vellum/core";

import type { EvalEnvironment, EvalTask, HarnessOptions } from "./types.js";

/**
 * EvalHarness creates isolated environments for evaluation
 * - Temp directory per task
 * - Auto-approve permissions (for eval)
 * - Configured AgentLoop config (caller creates actual instance)
 */
export class EvalHarness {
  private tempDir: string | null = null;
  private readonly options: HarnessOptions;

  constructor(options: HarnessOptions = {}) {
    this.options = {
      autoApproveAll: options.autoApproveAll ?? true,
      ...options,
    };
  }

  /**
   * Setup task environment
   * Creates temp directory and writes initial files
   */
  async setup(task: EvalTask): Promise<EvalEnvironment> {
    // Create isolated temp directory
    this.tempDir = await mkdtemp(join(tmpdir(), `vellum-eval-${task.id}-`));

    // Write initial files
    for (const file of task.files) {
      const fullPath = join(this.tempDir, file.path);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, file.content, "utf-8");
    }

    return {
      taskId: task.id,
      workingDir: this.tempDir,
      initialFiles: task.files.map((f) => f.path),
    };
  }

  /**
   * Get the working directory
   */
  getWorkingDir(): string | null {
    return this.tempDir;
  }

  /**
   * Create AgentLoop configuration for evaluation
   * Returns config object. Actual AgentLoop creation should be done
   * by the caller with proper imports.
   */
  createAgentConfig(task: EvalTask, env: EvalEnvironment): EvalAgentConfig {
    // Mode configuration for eval
    const mode: ModeConfig = {
      name: "code",
      description: "Evaluation mode - complete tasks accurately",
      tools: {
        edit: true,
        bash: true,
        web: false,
        mcp: false,
      },
      prompt: "Complete the task accurately and efficiently.",
    };

    // Termination limits for eval
    const terminationLimits: TerminationLimits = {
      maxSteps: 50,
      maxTokens: 50000,
      maxTimeMs: 5 * 60 * 1000, // 5 minutes for eval tasks
      terminateOnTextOnly: true,
    };

    // Build the config matching AgentLoopConfig interface
    const config: EvalAgentConfig = {
      sessionId: `eval-${task.id}-${Date.now()}`,
      mode,
      providerType: this.options.providerType ?? "anthropic",
      model: this.options.model ?? "claude-sonnet-4-20250514",
      cwd: env.workingDir,
      projectRoot: env.workingDir,
      maxIterations: 20,
      terminationLimits,
      // Eval-specific: auto-approve to avoid user interaction
      // The runner will need to set up appropriate permission checker
      interactive: false,
    };

    return config;
  }

  /**
   * Cleanup environment
   * Removes temp directory and all contents
   */
  async cleanup(): Promise<void> {
    if (this.tempDir) {
      try {
        await rm(this.tempDir, { recursive: true, force: true });
      } catch (error) {
        // Log but don't throw - cleanup is best effort
        console.warn(`Failed to cleanup temp dir ${this.tempDir}:`, error);
      }
      this.tempDir = null;
    }
  }

  /**
   * Get harness options
   */
  getOptions(): HarnessOptions {
    return { ...this.options };
  }
}

/**
 * Subset of AgentLoopConfig needed for evaluation
 * This matches the actual AgentLoopConfig from @vellum/core
 * but only includes fields relevant for eval setup.
 */
export interface EvalAgentConfig {
  /** Session identifier */
  sessionId: string;
  /** Mode configuration */
  mode: ModeConfig;
  /** Provider type (e.g., 'anthropic', 'openai') */
  providerType: string;
  /** Model identifier */
  model: string;
  /** Current working directory */
  cwd: string;
  /** Project root directory */
  projectRoot: string;
  /** Maximum iterations for the agentic loop */
  maxIterations: number;
  /** Termination limits */
  terminationLimits: TerminationLimits;
  /** Whether the session is interactive */
  interactive: boolean;
}
