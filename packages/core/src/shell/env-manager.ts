/**
 * Environment Manager
 *
 * Manages environment variables and PATH modifications for shell integration.
 * Provides methods to generate shell-specific environment setup commands.
 *
 * @module shell/env-manager
 */

import { dirname } from "node:path";

import { getShellConfig } from "./detector.js";
import type {
  EnvironmentPatch,
  EnvOperation,
  EnvPatchEntry,
  ShellConfig,
  ShellType,
} from "./types.js";

// =============================================================================
// Environment Manager
// =============================================================================

/**
 * Manages environment variables for shell integration
 */
export class EnvironmentManager {
  private patches: Map<string, EnvironmentPatch> = new Map();

  /**
   * Create a new EnvironmentManager
   *
   * @param vellumBinPath - Path to Vellum binary (for PATH modification)
   */
  constructor(private readonly vellumBinPath?: string) {}

  /**
   * Add an environment patch
   *
   * @param patch - Environment patch to add
   */
  addPatch(patch: EnvironmentPatch): void {
    this.patches.set(patch.id, patch);
  }

  /**
   * Remove an environment patch by ID
   *
   * @param id - Patch ID to remove
   * @returns Whether the patch was found and removed
   */
  removePatch(id: string): boolean {
    return this.patches.delete(id);
  }

  /**
   * Get all registered patches
   *
   * @returns Array of environment patches
   */
  getPatches(): EnvironmentPatch[] {
    return Array.from(this.patches.values());
  }

  /**
   * Get patches applicable to a specific shell
   *
   * @param shell - Target shell type
   * @returns Patches that apply to the shell
   */
  getPatchesForShell(shell: ShellType): EnvironmentPatch[] {
    return this.getPatches().filter(
      (patch) => patch.targetShells.length === 0 || patch.targetShells.includes(shell)
    );
  }

  /**
   * Create the default Vellum environment patch
   *
   * @returns Default environment patch for Vellum
   */
  createVellumPatch(): EnvironmentPatch {
    const entries: EnvPatchEntry[] = [];

    // Add Vellum bin directory to PATH if provided
    if (this.vellumBinPath) {
      entries.push({
        name: "PATH",
        operation: "prepend",
        value: dirname(this.vellumBinPath),
      });
    }

    return {
      id: "vellum-default",
      description: "Vellum CLI environment setup",
      entries,
      targetShells: [],
    };
  }

  /**
   * Generate shell script for environment setup
   *
   * @param shell - Target shell type
   * @returns Shell script content
   */
  generateScript(shell: ShellType): string {
    const config = getShellConfig(shell);
    const patches = this.getPatchesForShell(shell);
    const lines: string[] = [];

    for (const patch of patches) {
      if (patch.description) {
        lines.push(`${config.commentPrefix} ${patch.description}`);
      }

      for (const entry of patch.entries) {
        const statement = this.generateEnvStatement(entry, config);
        if (statement) {
          lines.push(statement);
        }
      }
    }

    return lines.join("\n");
  }

  /**
   * Generate a single environment variable statement
   *
   * @param entry - Environment patch entry
   * @param config - Shell configuration
   * @returns Shell statement or undefined
   */
  private generateEnvStatement(entry: EnvPatchEntry, config: ShellConfig): string | undefined {
    const { name, operation, value, separator } = entry;
    const sep = separator ?? (process.platform === "win32" ? ";" : ":");

    switch (config.shell) {
      case "bash":
      case "zsh":
        return this.generateBashStatement(name, operation, value, sep);

      case "fish":
        return this.generateFishStatement(name, operation, value, sep);

      case "powershell":
      case "pwsh":
        return this.generatePowerShellStatement(name, operation, value, sep);

      case "cmd":
        return this.generateCmdStatement(name, operation, value, sep);

      default:
        return undefined;
    }
  }

  /**
   * Generate Bash/Zsh environment statement
   */
  private generateBashStatement(
    name: string,
    operation: EnvOperation,
    value: string | undefined,
    separator: string
  ): string {
    switch (operation) {
      case "set":
        return `export ${name}="${value ?? ""}"`;
      case "prepend":
        return `export ${name}="${value ?? ""}${separator}$${name}"`;
      case "append":
        return `export ${name}="$${name}${separator}${value ?? ""}"`;
      case "unset":
        return `unset ${name}`;
    }
  }

  /**
   * Generate Fish shell environment statement
   */
  private generateFishStatement(
    name: string,
    operation: EnvOperation,
    value: string | undefined,
    separator: string
  ): string {
    switch (operation) {
      case "set":
        return `set -gx ${name} "${value ?? ""}"`;
      case "prepend":
        // Fish uses space-separated paths
        if (name === "PATH") {
          return `set -gx PATH "${value ?? ""}" $PATH`;
        }
        return `set -gx ${name} "${value ?? ""}${separator}$${name}"`;
      case "append":
        if (name === "PATH") {
          return `set -gx PATH $PATH "${value ?? ""}"`;
        }
        return `set -gx ${name} "$${name}${separator}${value ?? ""}"`;
      case "unset":
        return `set -e ${name}`;
    }
  }

  /**
   * Generate PowerShell environment statement
   */
  private generatePowerShellStatement(
    name: string,
    operation: EnvOperation,
    value: string | undefined,
    separator: string
  ): string {
    switch (operation) {
      case "set":
        return `$env:${name} = "${value ?? ""}"`;
      case "prepend":
        return `$env:${name} = "${value ?? ""}${separator}$env:${name}"`;
      case "append":
        return `$env:${name} = "$env:${name}${separator}${value ?? ""}"`;
      case "unset":
        return `Remove-Item Env:\\${name} -ErrorAction SilentlyContinue`;
    }
  }

  /**
   * Generate CMD environment statement
   */
  private generateCmdStatement(
    name: string,
    operation: EnvOperation,
    value: string | undefined,
    separator: string
  ): string {
    switch (operation) {
      case "set":
        return `set ${name}=${value ?? ""}`;
      case "prepend":
        return `set ${name}=${value ?? ""}${separator}%${name}%`;
      case "append":
        return `set ${name}=%${name}%${separator}${value ?? ""}`;
      case "unset":
        return `set ${name}=`;
    }
  }
}

/**
 * Create a preconfigured EnvironmentManager for Vellum
 *
 * @param vellumBinPath - Path to Vellum binary
 * @returns Configured EnvironmentManager
 */
export function createEnvironmentManager(vellumBinPath?: string): EnvironmentManager {
  const manager = new EnvironmentManager(vellumBinPath);
  manager.addPatch(manager.createVellumPatch());
  return manager;
}

/**
 * Generate environment setup script for a shell
 *
 * @param shell - Target shell type
 * @param vellumBinPath - Path to Vellum binary
 * @returns Shell script content
 */
export function generateEnvScript(shell: ShellType, vellumBinPath?: string): string {
  const manager = createEnvironmentManager(vellumBinPath);
  return manager.generateScript(shell);
}
