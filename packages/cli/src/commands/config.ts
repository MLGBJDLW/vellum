/**
 * Config Slash Commands
 *
 * Provides slash commands for config file management:
 * - /config - Show configuration file path and status
 * - /config path - Show only the config file path
 * - /config edit - Open config file in editor
 * - /config reset - Reset to default configuration
 *
 * @module cli/commands/config
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { findProjectConfig, loadConfig } from "@vellum/core";
import type { CommandContext, CommandResult, SlashCommand } from "./types.js";
import { error, success } from "./types.js";

// =============================================================================
// Constants
// =============================================================================

/**
 * Global config directory.
 */
const GLOBAL_CONFIG_DIR = path.join(os.homedir(), ".config", "vellum");

/**
 * Global config file path.
 */
const GLOBAL_CONFIG_PATH = path.join(GLOBAL_CONFIG_DIR, "vellum.json");

/**
 * Settings file path (user preferences).
 */
const SETTINGS_PATH = path.join(GLOBAL_CONFIG_DIR, "settings.json");

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Find the active config file path.
 */
function findConfigPath(cwd: string): { path: string; type: "project" | "global" | "none" } {
  // Check for project config
  const projectConfig = findProjectConfig(cwd);
  if (projectConfig) {
    return { path: projectConfig, type: "project" };
  }

  // Check for global config
  if (fs.existsSync(GLOBAL_CONFIG_PATH)) {
    return { path: GLOBAL_CONFIG_PATH, type: "global" };
  }

  return { path: GLOBAL_CONFIG_PATH, type: "none" };
}

/**
 * Get editor command based on environment.
 */
function getEditorCommand(): string {
  // Check EDITOR environment variable
  const editor = process.env.EDITOR || process.env.VISUAL;
  if (editor) return editor;

  // Platform-specific defaults
  if (process.platform === "win32") {
    return "notepad";
  }
  if (process.platform === "darwin") {
    return "open -e"; // TextEdit
  }
  return "nano"; // Linux default
}

/**
 * Open a file in the system editor.
 */
async function openInEditor(filePath: string): Promise<void> {
  const editorCmd = getEditorCommand();
  const parts = editorCmd.split(" ");
  const cmd = parts[0]!;
  const args = [...parts.slice(1), filePath];

  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
      detached: process.platform !== "win32",
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0 || process.platform !== "win32") {
        resolve();
      } else {
        reject(new Error(`Editor exited with code ${code}`));
      }
    });

    // Detach on non-Windows to allow editor to run independently
    if (process.platform !== "win32") {
      child.unref();
      resolve();
    }
  });
}

/**
 * Create default config file.
 */
function createDefaultConfig(configPath: string): void {
  const defaultConfig = {
    $schema: "https://vellum.dev/schemas/config.json",
    llm: {
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      maxTokens: 4096,
      temperature: 0.7,
    },
    agent: {
      maxToolCalls: 50,
      maxTurns: 100,
      maxRetries: 3,
    },
    permissions: {
      fileRead: "ask",
      fileWrite: "ask",
      shellExecute: "ask",
      networkAccess: "ask",
    },
    debug: false,
    logLevel: "info",
    theme: "dark",
  };

  // Ensure directory exists
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), "utf-8");
}

// =============================================================================
// Config Subcommand Handlers
// =============================================================================

/**
 * Handle /config (no subcommand) - show config status.
 */
function handleShowConfig(cwd: string): CommandResult {
  const configInfo = findConfigPath(cwd);
  const settingsExists = fs.existsSync(SETTINGS_PATH);

  // Try to load and validate config
  const configResult = loadConfig({ cwd, suppressDeprecationWarnings: true });
  const configValid = configResult.ok;

  const lines: string[] = [];
  lines.push("⚙️  Configuration Status");
  lines.push("═".repeat(40));
  lines.push("");

  // Config file info
  if (configInfo.type === "project") {
    lines.push(`📁 Project config: ${configInfo.path}`);
    lines.push(`   Status: ${configValid ? "✅ Valid" : "❌ Invalid"}`);
  } else if (configInfo.type === "global") {
    lines.push(`🌐 Global config: ${configInfo.path}`);
    lines.push(`   Status: ${configValid ? "✅ Valid" : "❌ Invalid"}`);
  } else {
    lines.push("📁 Config file: Not found");
    lines.push(`   Default location: ${GLOBAL_CONFIG_PATH}`);
  }

  lines.push("");

  // Settings file info
  lines.push(`📝 Settings file: ${SETTINGS_PATH}`);
  lines.push(`   Status: ${settingsExists ? "✅ Exists" : "⚪ Not created"}`);

  lines.push("");
  lines.push("─".repeat(40));
  lines.push("Commands:");
  lines.push("  /config path   - Show config file path");
  lines.push("  /config edit   - Open config in editor");
  lines.push("  /config reset  - Reset to defaults");

  return success(lines.join("\n"));
}

/**
 * Handle /config path - show only the config path.
 */
function handleConfigPath(cwd: string): CommandResult {
  const configInfo = findConfigPath(cwd);

  if (configInfo.type === "none") {
    return success(`Config file not found.\nDefault location: ${GLOBAL_CONFIG_PATH}`);
  }

  return success(configInfo.path);
}

/**
 * Handle /config edit - open config in editor.
 */
async function handleConfigEdit(cwd: string): Promise<CommandResult> {
  const configInfo = findConfigPath(cwd);
  let configPath = configInfo.path;

  // Create default config if it doesn't exist
  if (configInfo.type === "none") {
    try {
      createDefaultConfig(GLOBAL_CONFIG_PATH);
      configPath = GLOBAL_CONFIG_PATH;
    } catch (err) {
      return error(
        "INTERNAL_ERROR",
        `Failed to create config file: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Open in editor
  try {
    await openInEditor(configPath);
    return success(`Opening config file in editor: ${configPath}`);
  } catch (err) {
    return error(
      "INTERNAL_ERROR",
      `Failed to open editor: ${err instanceof Error ? err.message : String(err)}\n\nConfig file location: ${configPath}`
    );
  }
}

/**
 * Handle /config reset - reset to default configuration.
 */
function handleConfigReset(cwd: string): CommandResult {
  const configInfo = findConfigPath(cwd);
  const targetPath = configInfo.type === "project" ? configInfo.path : GLOBAL_CONFIG_PATH;

  // Backup existing config if it exists
  if (fs.existsSync(targetPath)) {
    const backupPath = `${targetPath}.backup.${Date.now()}`;
    try {
      fs.copyFileSync(targetPath, backupPath);
    } catch {
      // Ignore backup failure
    }
  }

  try {
    createDefaultConfig(targetPath);
    return success(`Configuration reset to defaults.\nConfig file: ${targetPath}`);
  } catch (err) {
    return error(
      "INTERNAL_ERROR",
      `Failed to reset config: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

// =============================================================================
// /config Command
// =============================================================================

/**
 * /config command - Manage configuration files.
 *
 * Usage:
 * - /config - Show configuration status
 * - /config path - Show config file path
 * - /config edit - Open config in editor
 * - /config reset - Reset to default configuration
 */
export const configCommand: SlashCommand = {
  name: "config",
  description: "Manage configuration files",
  kind: "builtin",
  category: "config",
  aliases: ["cfg"],
  positionalArgs: [
    {
      name: "subcommand",
      type: "string",
      description: "Subcommand: path, edit, reset",
      required: false,
    },
  ],
  examples: [
    "/config        - Show configuration status",
    "/config path   - Show config file path",
    "/config edit   - Open config in editor",
    "/config reset  - Reset to default configuration",
  ],
  subcommands: [
    { name: "path", description: "Show config file path" },
    { name: "edit", description: "Open config in editor" },
    { name: "reset", description: "Reset to default configuration" },
  ],

  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    const subcommand = ctx.parsedArgs.positional[0] as string | undefined;
    const cwd = ctx.session.cwd;

    switch (subcommand) {
      case undefined:
      case "":
        return handleShowConfig(cwd);

      case "path":
        return handleConfigPath(cwd);

      case "edit":
        return handleConfigEdit(cwd);

      case "reset":
        return handleConfigReset(cwd);

      default:
        return error(
          "INVALID_ARGUMENT",
          `Unknown subcommand: ${subcommand}\n\nValid subcommands: path, edit, reset`
        );
    }
  },
};

// =============================================================================
// Export Collection
// =============================================================================

/**
 * All config-related slash commands.
 */
export const configSlashCommands: readonly SlashCommand[] = [configCommand] as const;
