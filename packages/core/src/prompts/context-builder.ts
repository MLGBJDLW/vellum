// ============================================
// Context Builder
// ============================================

/**
 * Builder for constructing formatted session context strings.
 *
 * Converts structured session context data into human-readable
 * markdown-formatted strings for inclusion in agent prompts.
 *
 * @module @vellum/core/prompts/context-builder
 */

import type { ActiveFile, GitStatus, SessionContext, Task } from "./types.js";

// =============================================================================
// Constants
// =============================================================================

/**
 * Maximum length for selection content before truncation.
 */
const MAX_SELECTION_LENGTH = 500;

/**
 * Suffix added to truncated content.
 */
const TRUNCATION_SUFFIX = " [truncated]";

// =============================================================================
// ContextBuilder Class
// =============================================================================

/**
 * Builder for formatting session context into prompt-friendly strings.
 *
 * Converts structured context data (active file, git status, tasks, errors)
 * into a consistent markdown format suitable for inclusion in agent prompts.
 *
 * @example
 * ```typescript
 * const builder = new ContextBuilder();
 * const context = builder.buildContext({
 *   activeFile: { path: "src/index.ts", language: "typescript" },
 *   currentTask: { id: "T001", description: "Fix bug", status: "in-progress" }
 * });
 * ```
 */
export class ContextBuilder {
  /**
   * Builds a complete context string from session context.
   *
   * Combines all available context sections (file, task, git, errors)
   * into a formatted markdown document.
   *
   * @param session - The session context to format
   * @returns Formatted context string, or empty string if no context
   *
   * @example
   * ```typescript
   * const context = builder.buildContext({
   *   activeFile: { path: "src/app.ts", language: "typescript" },
   *   gitStatus: { branch: "main", modified: ["file1.ts"], staged: [] }
   * });
   * ```
   */
  buildContext(session: SessionContext): string {
    const sections: string[] = [];

    // Active file section
    if (session.activeFile) {
      const fileContext = this.buildFileContext(session.activeFile);
      if (fileContext) {
        sections.push(fileContext);
      }
    }

    // Current task section
    if (session.currentTask) {
      const taskContext = this.buildTaskContext(session.currentTask);
      if (taskContext) {
        sections.push(taskContext);
      }
    }

    // Git status section
    if (session.gitStatus) {
      const gitContext = this.buildGitContext(session.gitStatus);
      if (gitContext) {
        sections.push(gitContext);
      }
    }

    // Errors section
    if (session.errors && session.errors.length > 0) {
      const errorContext = this.buildErrorContext(session.errors);
      if (errorContext) {
        sections.push(errorContext);
      }
    }

    // Return empty string if no sections
    if (sections.length === 0) {
      return "";
    }

    // Combine with header
    return `## Current Session\n\n${sections.join("\n\n")}`;
  }

  /**
   * Builds formatted context for an active file.
   *
   * Includes path, language, and optionally selected text.
   * Selection content is truncated if it exceeds 500 characters.
   *
   * @param file - The active file information
   * @returns Formatted file context string
   *
   * @example
   * ```typescript
   * const context = builder.buildFileContext({
   *   path: "src/utils.ts",
   *   language: "typescript",
   *   selection: "function helper() { ... }"
   * });
   * ```
   */
  buildFileContext(file: ActiveFile): string {
    const lines: string[] = [
      "### Active File",
      `- Path: ${file.path}`,
      `- Language: ${file.language}`,
    ];

    // Add selection if present
    if (file.selection) {
      const truncatedSelection = this.#truncateContent(file.selection, MAX_SELECTION_LENGTH);
      lines.push(`- Selection: ${truncatedSelection}`);
    }

    return lines.join("\n");
  }

  /**
   * Builds formatted context for a task.
   *
   * Includes task ID, description, and current status.
   *
   * @param task - The task information
   * @returns Formatted task context string
   *
   * @example
   * ```typescript
   * const context = builder.buildTaskContext({
   *   id: "T001",
   *   description: "Implement authentication",
   *   status: "in-progress"
   * });
   * ```
   */
  buildTaskContext(task: Task): string {
    const lines: string[] = [
      "### Current Task",
      `- ID: ${task.id}`,
      `- Description: ${task.description}`,
      `- Status: ${task.status}`,
    ];

    return lines.join("\n");
  }

  /**
   * Builds formatted context for errors.
   *
   * Lists all current errors as bullet points.
   *
   * @param errors - Array of error messages
   * @returns Formatted error context string, or empty string if no errors
   *
   * @example
   * ```typescript
   * const context = builder.buildErrorContext([
   *   "Type error in line 42",
   *   "Missing import for 'useState'"
   * ]);
   * ```
   */
  buildErrorContext(errors: string[]): string {
    if (!errors || errors.length === 0) {
      return "";
    }

    const lines: string[] = ["### Errors"];

    for (const error of errors) {
      lines.push(`- ${error}`);
    }

    return lines.join("\n");
  }

  /**
   * Builds formatted context for git status.
   *
   * Includes branch name and counts of modified/staged files.
   *
   * @param git - The git status information
   * @returns Formatted git context string
   *
   * @example
   * ```typescript
   * const context = builder.buildGitContext({
   *   branch: "feature/auth",
   *   modified: ["src/login.ts", "src/auth.ts"],
   *   staged: ["src/types.ts"]
   * });
   * ```
   */
  buildGitContext(git: GitStatus): string {
    const lines: string[] = [
      "### Git Status",
      `- Branch: ${git.branch}`,
      `- Modified: ${git.modified.length} files`,
      `- Staged: ${git.staged.length} files`,
    ];

    return lines.join("\n");
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Truncates content if it exceeds the maximum length.
   *
   * @param content - The content to truncate
   * @param maxLength - Maximum allowed length
   * @returns Truncated content with suffix, or original if within limit
   */
  #truncateContent(content: string, maxLength: number): string {
    if (content.length <= maxLength) {
      return content;
    }

    const truncateLength = maxLength - TRUNCATION_SUFFIX.length;
    return content.slice(0, truncateLength) + TRUNCATION_SUFFIX;
  }
}
