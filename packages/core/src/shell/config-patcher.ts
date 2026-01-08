/**
 * Shell Config Patcher
 *
 * Safely patches shell RC files with Vellum configuration.
 * Uses markers to identify and manage Vellum-specific blocks.
 *
 * @module shell/config-patcher
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { copyFile } from "node:fs/promises";
import { dirname } from "node:path";

import { detectShell, getPrimaryRcFile, getShellConfig } from "./detector.js";
import { createEnvironmentManager, type EnvironmentManager } from "./env-manager.js";
import {
  CONFIG_MARKERS,
  type ConfigPatchOperation,
  type PatchResult,
  POWERSHELL_MARKERS,
  type ShellConfigPatch,
  type ShellType,
} from "./types.js";

// =============================================================================
// Shell Config Patcher
// =============================================================================

/**
 * Manages shell configuration file patching
 */
export class ShellConfigPatcher {
  private envManager: EnvironmentManager;

  /**
   * Create a new ShellConfigPatcher
   *
   * @param vellumBinPath - Path to Vellum binary
   */
  constructor(vellumBinPath?: string) {
    this.envManager = createEnvironmentManager(vellumBinPath);
  }

  /**
   * Get markers for a specific shell
   *
   * @param shell - Shell type
   * @returns Marker strings
   */
  private getMarkers(shell: ShellType): typeof CONFIG_MARKERS {
    // PowerShell uses same markers but could be different in future
    if (shell === "powershell" || shell === "pwsh") {
      return POWERSHELL_MARKERS;
    }
    return CONFIG_MARKERS;
  }

  /**
   * Generate Vellum config block content for a shell
   *
   * @param shell - Target shell type
   * @param includeCompletions - Whether to include completion setup
   * @returns Config block content
   */
  generateConfigBlock(shell: ShellType, includeCompletions: boolean = true): string {
    const markers = this.getMarkers(shell);
    const envScript = this.envManager.generateScript(shell);
    const lines: string[] = [];

    lines.push(markers.START);
    lines.push(markers.WARNING);
    lines.push("");

    // Add environment setup
    if (envScript) {
      lines.push(envScript);
      lines.push("");
    }

    // Add completion setup
    if (includeCompletions) {
      const completionSetup = this.generateCompletionSetup(shell);
      if (completionSetup) {
        lines.push(completionSetup);
        lines.push("");
      }
    }

    lines.push(markers.END);

    return lines.join("\n");
  }

  /**
   * Generate shell-specific completion setup
   *
   * @param shell - Target shell type
   * @returns Completion setup script or undefined
   */
  private generateCompletionSetup(shell: ShellType): string | undefined {
    const config = getShellConfig(shell);

    switch (shell) {
      case "bash":
        return `${config.commentPrefix} Enable Vellum completions
if command -v vellum &> /dev/null; then
  eval "$(vellum completion bash)"
fi`;

      case "zsh":
        return `${config.commentPrefix} Enable Vellum completions
if command -v vellum &> /dev/null; then
  eval "$(vellum completion zsh)"
fi`;

      case "fish":
        return `${config.commentPrefix} Enable Vellum completions
if command -v vellum &> /dev/null
  vellum completion fish | source
end`;

      case "powershell":
      case "pwsh":
        return `${config.commentPrefix} Enable Vellum completions
if (Get-Command vellum -ErrorAction SilentlyContinue) {
  Invoke-Expression (& vellum completion powershell | Out-String)
}`;

      case "cmd":
        // CMD doesn't support dynamic completions
        return undefined;

      default:
        return undefined;
    }
  }

  /**
   * Check if a file contains Vellum config block
   *
   * @param content - File content
   * @param shell - Shell type
   * @returns Whether Vellum block exists
   */
  hasVellumBlock(content: string, shell: ShellType): boolean {
    const markers = this.getMarkers(shell);
    return content.includes(markers.START) && content.includes(markers.END);
  }

  /**
   * Extract Vellum config block from file content
   *
   * @param content - File content
   * @param shell - Shell type
   * @returns Extracted block or undefined
   */
  extractVellumBlock(content: string, shell: ShellType): string | undefined {
    const markers = this.getMarkers(shell);
    const startIdx = content.indexOf(markers.START);
    const endIdx = content.indexOf(markers.END);

    if (startIdx === -1 || endIdx === -1 || startIdx >= endIdx) {
      return undefined;
    }

    return content.substring(startIdx, endIdx + markers.END.length);
  }

  /**
   * Remove Vellum config block from file content
   *
   * @param content - File content
   * @param shell - Shell type
   * @returns Content with Vellum block removed
   */
  removeVellumBlock(content: string, shell: ShellType): string {
    const markers = this.getMarkers(shell);
    const startIdx = content.indexOf(markers.START);
    const endIdx = content.indexOf(markers.END);

    if (startIdx === -1 || endIdx === -1 || startIdx >= endIdx) {
      return content;
    }

    // Find the line start and end to remove entire lines
    let lineStart = startIdx;
    while (lineStart > 0 && content[lineStart - 1] !== "\n") {
      lineStart--;
    }

    let lineEnd = endIdx + markers.END.length;
    while (lineEnd < content.length && content[lineEnd] !== "\n") {
      lineEnd++;
    }
    // Include the newline after the block
    if (lineEnd < content.length && content[lineEnd] === "\n") {
      lineEnd++;
    }

    return content.substring(0, lineStart) + content.substring(lineEnd);
  }

  /**
   * Apply a patch to a shell config file
   *
   * @param patch - Patch to apply
   * @returns Patch result
   */
  async applyPatch(patch: ShellConfigPatch): Promise<PatchResult> {
    const { shell, filePath, operation, createBackup } = patch;

    try {
      // Handle different operations
      switch (operation) {
        case "add":
          return await this.addConfig(shell, filePath, createBackup);
        case "remove":
          return await this.removeConfig(shell, filePath, createBackup);
        case "update":
          return await this.updateConfig(shell, filePath, createBackup);
        default:
          return {
            success: false,
            filePath,
            operation,
            error: `Unknown operation: ${operation}`,
            fileCreated: false,
          };
      }
    } catch (error) {
      return {
        success: false,
        filePath,
        operation,
        error: error instanceof Error ? error.message : String(error),
        fileCreated: false,
      };
    }
  }

  /**
   * Add Vellum config to a shell RC file
   *
   * @param shell - Shell type
   * @param filePath - Target file path
   * @param createBackup - Whether to create backup
   * @returns Patch result
   */
  private async addConfig(
    shell: ShellType,
    filePath: string,
    createBackup: boolean
  ): Promise<PatchResult> {
    let content = "";
    let fileCreated = false;
    let backupPath: string | undefined;

    // Read existing content if file exists
    if (existsSync(filePath)) {
      content = readFileSync(filePath, "utf-8");

      // Check if already has Vellum block
      if (this.hasVellumBlock(content, shell)) {
        return {
          success: true,
          filePath,
          operation: "add",
          error: "Vellum configuration already exists",
          fileCreated: false,
        };
      }

      // Create backup if requested
      if (createBackup) {
        backupPath = await this.createBackup(filePath);
      }
    } else {
      fileCreated = true;
      // Ensure directory exists
      const dir = dirname(filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }

    // Generate and append config block
    const configBlock = this.generateConfigBlock(shell);
    const separator = content && !content.endsWith("\n") ? "\n\n" : content ? "\n" : "";
    const newContent = `${content + separator + configBlock}\n`;

    // Write updated content
    writeFileSync(filePath, newContent, "utf-8");

    return {
      success: true,
      filePath,
      backupPath,
      operation: "add",
      fileCreated,
    };
  }

  /**
   * Remove Vellum config from a shell RC file
   *
   * @param shell - Shell type
   * @param filePath - Target file path
   * @param createBackup - Whether to create backup
   * @returns Patch result
   */
  private async removeConfig(
    shell: ShellType,
    filePath: string,
    createBackup: boolean
  ): Promise<PatchResult> {
    // Check if file exists
    if (!existsSync(filePath)) {
      return {
        success: true,
        filePath,
        operation: "remove",
        error: "File does not exist",
        fileCreated: false,
      };
    }

    const content = readFileSync(filePath, "utf-8");

    // Check if has Vellum block
    if (!this.hasVellumBlock(content, shell)) {
      return {
        success: true,
        filePath,
        operation: "remove",
        error: "No Vellum configuration found",
        fileCreated: false,
      };
    }

    // Create backup if requested
    let backupPath: string | undefined;
    if (createBackup) {
      backupPath = await this.createBackup(filePath);
    }

    // Remove Vellum block
    const newContent = this.removeVellumBlock(content, shell);
    writeFileSync(filePath, newContent, "utf-8");

    return {
      success: true,
      filePath,
      backupPath,
      operation: "remove",
      fileCreated: false,
    };
  }

  /**
   * Update Vellum config in a shell RC file
   *
   * @param shell - Shell type
   * @param filePath - Target file path
   * @param createBackup - Whether to create backup
   * @returns Patch result
   */
  private async updateConfig(
    shell: ShellType,
    filePath: string,
    createBackup: boolean
  ): Promise<PatchResult> {
    // If file doesn't exist, just add
    if (!existsSync(filePath)) {
      return this.addConfig(shell, filePath, createBackup);
    }

    const content = readFileSync(filePath, "utf-8");

    // If no existing block, just add
    if (!this.hasVellumBlock(content, shell)) {
      return this.addConfig(shell, filePath, createBackup);
    }

    // Create backup if requested
    let backupPath: string | undefined;
    if (createBackup) {
      backupPath = await this.createBackup(filePath);
    }

    // Remove old block and add new one
    const withoutBlock = this.removeVellumBlock(content, shell);
    const configBlock = this.generateConfigBlock(shell);
    const separator =
      withoutBlock && !withoutBlock.endsWith("\n") ? "\n\n" : withoutBlock ? "\n" : "";
    const newContent = `${withoutBlock + separator + configBlock}\n`;

    writeFileSync(filePath, newContent, "utf-8");

    return {
      success: true,
      filePath,
      backupPath,
      operation: "update",
      fileCreated: false,
    };
  }

  /**
   * Create a backup of a file
   *
   * @param filePath - File to backup
   * @returns Backup file path
   */
  private async createBackup(filePath: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = `${filePath}.vellum-backup-${timestamp}`;
    await copyFile(filePath, backupPath);
    return backupPath;
  }
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Patch shell config for the current shell
 *
 * @param options - Patch options
 * @returns Patch result
 */
export async function patchShellConfig(options: {
  shell?: ShellType;
  operation?: ConfigPatchOperation;
  createBackup?: boolean;
  vellumBinPath?: string;
}): Promise<PatchResult> {
  const {
    shell = detectShell().shell,
    operation = "add",
    createBackup = true,
    vellumBinPath,
  } = options;

  // Skip CMD as it doesn't have an RC file
  if (shell === "cmd") {
    return {
      success: false,
      filePath: "",
      operation,
      error: "CMD does not support RC file configuration",
      fileCreated: false,
    };
  }

  const patcher = new ShellConfigPatcher(vellumBinPath);
  const filePath = getPrimaryRcFile(shell);

  return patcher.applyPatch({
    shell,
    filePath,
    operation,
    createBackup,
  });
}

/**
 * Remove Vellum config from shell
 *
 * @param shell - Target shell (auto-detect if not provided)
 * @returns Patch result
 */
export async function removeShellConfig(shell?: ShellType): Promise<PatchResult> {
  return patchShellConfig({
    shell,
    operation: "remove",
  });
}

/**
 * Check if shell is configured for Vellum
 *
 * @param shell - Target shell (auto-detect if not provided)
 * @returns Whether shell is configured
 */
export function isShellConfigured(shell?: ShellType): boolean {
  const targetShell = shell ?? detectShell().shell;

  if (targetShell === "cmd") {
    return false;
  }

  const filePath = getPrimaryRcFile(targetShell);

  if (!existsSync(filePath)) {
    return false;
  }

  const content = readFileSync(filePath, "utf-8");
  const patcher = new ShellConfigPatcher();
  return patcher.hasVellumBlock(content, targetShell);
}
