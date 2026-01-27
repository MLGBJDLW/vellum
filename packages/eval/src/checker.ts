/**
 * ResultChecker with V3 bug fixes
 * @module @vellum/eval
 */

import { readFile } from "fs/promises";
import { glob } from "glob";
import { diff } from "jest-diff";
import { join } from "path";
import type {
  CheckDetail,
  CheckResult,
  EvalEnvironment,
  EvalTask,
  ExpectedOutput,
  LLMJudgeConfig,
} from "./types.js";

/** Provider interface for LLM Judge */
export interface LLMJudgeProvider {
  complete(options: {
    messages: Array<{ role: string; content: string }>;
  }): Promise<{ text: string }>;
}

export interface ResultCheckerOptions {
  /** LLM provider for judge evaluation */
  judgeProvider?: LLMJudgeProvider;
}

/**
 * ResultChecker validates agent outputs
 * V3 Fixes:
 * 1. Correct weighted score calculation
 * 2. LLM Judge includes task.prompt
 * 3. Real getWorkspaceSnapshot implementation
 */
export class ResultChecker {
  private judgeProvider?: LLMJudgeProvider;

  constructor(options: ResultCheckerOptions = {}) {
    this.judgeProvider = options.judgeProvider;
  }

  /**
   * Validate agent output against expected results
   */
  async validate(
    env: EvalEnvironment,
    expected: ExpectedOutput,
    task: EvalTask
  ): Promise<CheckResult> {
    const details: CheckDetail[] = [];
    const errors: string[] = [];

    // Check expected files with weight tracking
    if (expected.files) {
      for (const exp of expected.files) {
        const fullPath = join(env.workingDir, exp.path);
        const weight = exp.weight ?? 1.0;

        if (!(await this.fileExists(fullPath))) {
          details.push({
            type: "file",
            name: exp.path,
            rawScore: 0,
            weight,
            pass: false,
            message: "Missing file",
          });
          errors.push(`Missing file: ${exp.path}`);
          continue;
        }

        const actual = await readFile(fullPath, "utf-8");
        let rawScore = 0;
        let pass = false;
        let message: string | undefined;

        switch (exp.match) {
          case "exact":
            pass = actual === exp.content;
            rawScore = pass ? 1.0 : 0.0;
            if (!pass) {
              const diffOutput = diff(exp.content, actual);
              message = `File mismatch`;
              errors.push(`File mismatch: ${exp.path}\n${diffOutput}`);
            }
            break;

          case "contains":
            pass = actual.includes(exp.content);
            rawScore = pass ? 1.0 : 0.0;
            if (!pass) {
              message = `File does not contain expected content`;
              errors.push(`File does not contain expected: ${exp.path}`);
            }
            break;

          case "regex":
            try {
              pass = new RegExp(exp.content).test(actual);
              rawScore = pass ? 1.0 : 0.0;
              if (!pass) {
                message = `File does not match regex pattern`;
                errors.push(`File does not match regex: ${exp.path}`);
              }
            } catch (e) {
              message = `Invalid regex: ${e}`;
              errors.push(`Invalid regex for ${exp.path}: ${e}`);
            }
            break;
        }

        details.push({ type: "file", name: exp.path, rawScore, weight, pass, message });
      }
    }

    // Check stdout (if provided)
    if (expected.stdout && expected.stdout.length > 0) {
      // Note: stdout checking requires captured output from agent run
      // This would be passed in separately - for now, mark as unimplemented
      details.push({
        type: "stdout",
        name: "stdout check",
        rawScore: 0,
        weight: 1.0,
        pass: false,
        message: "Stdout checking not yet implemented in harness",
      });
    }

    // Run test command
    if (expected.testCommand) {
      const testResult = await this.runTestCommand(expected.testCommand, env.workingDir);
      details.push({
        type: "test",
        name: expected.testCommand,
        rawScore: testResult.pass ? 1.0 : 0.0,
        weight: 1.0,
        pass: testResult.pass,
        message: testResult.message,
      });
      if (!testResult.pass) {
        errors.push(`Test command failed: ${testResult.message}`);
      }
    }

    // LLM-as-Judge evaluation (V3: includes task.prompt)
    if (expected.llmJudge && this.judgeProvider) {
      const judgeResult = await this.runLLMJudge(env, expected.llmJudge, task);
      details.push(judgeResult);
      if (!judgeResult.pass) {
        errors.push(`LLM Judge: ${judgeResult.message}`);
      }
    }

    // ============================================
    // V3 FIX: Correct weighted score calculation
    // ============================================
    const totalWeight = details.reduce((sum, d) => sum + d.weight, 0);
    const totalScore = details.reduce((sum, d) => sum + d.rawScore * d.weight, 0);
    const score = totalWeight > 0 ? totalScore / totalWeight : 0;

    const threshold = task.passingThreshold ?? 1.0;

    return {
      score,
      pass: score >= threshold,
      details,
      errors,
      filesChecked: expected.files?.length ?? 0,
    };
  }

  /**
   * V3 FIX: LLM Judge prompt now includes task.prompt for context
   */
  private async runLLMJudge(
    env: EvalEnvironment,
    config: LLMJudgeConfig,
    task: EvalTask
  ): Promise<CheckDetail> {
    if (!this.judgeProvider) {
      return {
        type: "llmJudge",
        name: "LLM-as-Judge",
        rawScore: 0,
        weight: 1.0,
        pass: false,
        message: "No judge provider configured",
      };
    }

    // V3: Include original task prompt for context
    const prompt = `You are evaluating code output quality.

## Original Task
${task.prompt}

## Rubric
${config.rubric}

## Files in workspace
${await this.getWorkspaceSnapshot(env)}

## Instructions
Score the output from 0.0 to 1.0 based on the rubric.
Respond in JSON: { "score": 0.X, "reasoning": "..." }`;

    try {
      const response = await this.judgeProvider.complete({
        messages: [{ role: "user", content: prompt }],
      });

      // V3: Strip markdown code blocks if present
      const parsed = this.parseJudgeResponse(response.text);
      const rawScore = Math.min(1, Math.max(0, parsed.score));
      const passingScore = config.passingScore ?? 0.7;

      return {
        type: "llmJudge",
        name: "LLM-as-Judge",
        rawScore,
        weight: 1.0,
        pass: rawScore >= passingScore,
        message: parsed.reasoning,
      };
    } catch (error) {
      return {
        type: "llmJudge",
        name: "LLM-as-Judge",
        rawScore: 0,
        weight: 1.0,
        pass: false,
        message: `Judge error: ${error}`,
      };
    }
  }

  /**
   * Parse LLM judge response, handling markdown code blocks
   */
  private parseJudgeResponse(text: string): { score: number; reasoning: string } {
    // Strip markdown code blocks if present
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const jsonText = codeBlockMatch?.[1]?.trim() ?? text.trim();

    try {
      const parsed = JSON.parse(jsonText);
      return {
        score: typeof parsed.score === "number" ? parsed.score : 0,
        reasoning:
          typeof parsed.reasoning === "string" ? parsed.reasoning : "No reasoning provided",
      };
    } catch {
      // Try to extract score from text
      const scoreMatch = text.match(/score["\s:]+([0-9.]+)/i);
      return {
        score: scoreMatch?.[1] ? parseFloat(scoreMatch[1]) : 0,
        reasoning: `Failed to parse JSON response: ${text.slice(0, 200)}`,
      };
    }
  }

  /**
   * V3 FIX: Real implementation of workspace snapshot
   * Reads actual files from workspace with reasonable limits
   */
  private async getWorkspaceSnapshot(env: EvalEnvironment): Promise<string> {
    const MAX_FILES = 20;
    const MAX_FILE_SIZE = 2000; // characters per file

    try {
      // Find all files in workspace (excluding common ignores)
      const files = await glob("**/*", {
        cwd: env.workingDir,
        nodir: true,
        ignore: [
          "**/node_modules/**",
          "**/.git/**",
          "**/dist/**",
          "**/coverage/**",
          "**/*.lock",
          "**/package-lock.json",
          "**/*.png",
          "**/*.jpg",
          "**/*.gif",
          "**/*.ico",
          "**/*.woff",
          "**/*.woff2",
        ],
      });

      const contents: string[] = [];

      // Read up to MAX_FILES files
      for (const file of files.slice(0, MAX_FILES)) {
        try {
          const fullPath = join(env.workingDir, file);
          const content = await readFile(fullPath, "utf-8");

          // Truncate large files
          const truncated =
            content.length > MAX_FILE_SIZE
              ? content.slice(0, MAX_FILE_SIZE) + "\n... (truncated)"
              : content;

          contents.push(`### ${file}\n\`\`\`\n${truncated}\n\`\`\``);
        } catch {}
      }

      if (files.length > MAX_FILES) {
        contents.push(`\n... and ${files.length - MAX_FILES} more files`);
      }

      return contents.length > 0 ? contents.join("\n\n") : "(empty workspace)";
    } catch (error) {
      return `(error reading workspace: ${error})`;
    }
  }

  /**
   * Run a test command in the workspace
   */
  private async runTestCommand(
    command: string,
    cwd: string
  ): Promise<{ pass: boolean; message?: string }> {
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(exec);

    try {
      const { stdout } = await execAsync(command, {
        cwd,
        timeout: 60000, // 60 second timeout
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer
      });
      return { pass: true, message: stdout || undefined };
    } catch (error: unknown) {
      const err = error as { code?: number; stderr?: string; message?: string };
      return {
        pass: false,
        message: err.stderr || err.message || "Unknown error",
      };
    }
  }

  /**
   * Check if a file exists
   */
  private async fileExists(path: string): Promise<boolean> {
    try {
      await readFile(path);
      return true;
    } catch {
      return false;
    }
  }
}
