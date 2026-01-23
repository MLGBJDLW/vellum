/**
 * Sandbox Commands
 * @module cli/commands/sandbox
 */

import { platform } from "node:os";
import { detectSandboxBackend, type SandboxBackend } from "@vellum/sandbox";
import type { CommandContext, CommandResult, SlashCommand } from "../types.js";
import { error, success } from "../types.js";

export type SandboxSubcommand = "enable" | "disable" | "status";

export interface SandboxStatusJson {
  enabled: boolean;
  backend: SandboxBackend;
  platform: NodeJS.Platform;
  platformSupported: boolean;
}

export interface StatusOptions {
  json?: boolean;
}

export type EnableableBackend = "subprocess" | "platform" | "container";

export interface EnableOptions {
  backend?: EnableableBackend;
  force?: boolean;
}

export interface EnableResult {
  success: boolean;
  message?: string;
  backend?: EnableableBackend;
}

// =============================================================================
// Module State
// =============================================================================

/**
 * Whether sandbox mode is enabled (persists in memory for this session).
 * TODO: Persist this to config file for cross-session persistence.
 */
let sandboxEnabled = false;

/**
 * Detected sandbox backend
 */
let detectedBackend: SandboxBackend | null = null;

/**
 * Detect platform support for sandbox
 */
function detectPlatformSupport(): { backend: SandboxBackend; supported: boolean } {
  if (!detectedBackend) {
    detectedBackend = detectSandboxBackend();
  }
  return {
    backend: detectedBackend,
    supported: detectedBackend === "platform",
  };
}

// =============================================================================
// Subcommand Handlers
// =============================================================================

/**
 * Handle /sandbox status
 */
async function handleStatus(options?: StatusOptions): Promise<CommandResult> {
  const { backend, supported } = detectPlatformSupport();
  const os = platform();

  const statusJson: SandboxStatusJson = {
    enabled: sandboxEnabled,
    backend,
    platform: os,
    platformSupported: supported,
  };

  if (options?.json) {
    return success(JSON.stringify(statusJson, null, 2));
  }

  const statusIcon = sandboxEnabled ? "✅" : "❌";
  const supportIcon = supported ? "✅" : "⚠️";
  const backendDisplay = backend === "platform" ? `platform (${os})` : backend;

  const lines = [
    "🔒 Sandbox Status",
    "",
    `  Status:    ${statusIcon} ${sandboxEnabled ? "Enabled" : "Disabled"}`,
    `  Backend:   ${backendDisplay}`,
    `  Platform:  ${supportIcon} ${supported ? "Fully supported" : "Limited (subprocess only)"}`,
    "",
    supported
      ? "Platform sandboxing available for enhanced security."
      : "Note: Full platform sandboxing not available on this OS.",
  ];

  return success(lines.join("\n"));
}

/**
 * Handle /sandbox enable
 */
async function handleEnable(options?: EnableOptions): Promise<CommandResult> {
  const { backend, supported } = detectPlatformSupport();

  if (!supported && !options?.force) {
    return error(
      "OPERATION_NOT_ALLOWED",
      "Platform sandboxing not available. Use --force to enable subprocess-only mode.",
      ["/sandbox enable --force", "/sandbox status"]
    );
  }

  sandboxEnabled = true;
  const backendUsed = options?.backend ?? backend;

  return success(
    `🔒 Sandbox mode enabled\n\n` +
      `  Backend: ${backendUsed}\n` +
      `  Commands will execute in sandboxed environment.\n\n` +
      `Use /sandbox status to check current state.`
  );
}

/**
 * Handle /sandbox disable
 */
async function handleDisable(): Promise<CommandResult> {
  sandboxEnabled = false;
  return success(
    "🔓 Sandbox mode disabled\n\n" +
      "Commands will execute without sandboxing.\n\n" +
      "Use /sandbox enable to re-enable."
  );
}

// =============================================================================
// Command Definitions
// =============================================================================

/**
 * Sandbox command
 */
export const sandboxCommand: SlashCommand = {
  name: "sandbox",
  description: "Manage sandbox mode for secure command execution",
  kind: "builtin",
  category: "system",
  positionalArgs: [
    {
      name: "subcommand",
      type: "string",
      description: "Subcommand: status, enable, disable",
      required: false,
    },
  ],
  namedArgs: [
    {
      name: "json",
      type: "boolean",
      description: "Output as JSON (for status)",
      required: false,
    },
    {
      name: "force",
      type: "boolean",
      description: "Force enable even if platform not supported",
      required: false,
    },
    {
      name: "backend",
      type: "string",
      description: "Sandbox backend to use",
      required: false,
    },
  ],
  subcommands: [
    { name: "status", description: "Show sandbox status" },
    { name: "enable", description: "Enable sandbox mode" },
    { name: "disable", description: "Disable sandbox mode" },
  ],
  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    const subcommand = (ctx.parsedArgs.positional[0] as string)?.toLowerCase() ?? "status";
    const json = ctx.parsedArgs.named?.json as boolean | undefined;
    const force = ctx.parsedArgs.named?.force as boolean | undefined;
    const backend = ctx.parsedArgs.named?.backend as EnableableBackend | undefined;

    switch (subcommand) {
      case "status":
        return handleStatus({ json });
      case "enable":
        return handleEnable({ backend, force });
      case "disable":
        return handleDisable();
      default:
        return error("INVALID_ARGUMENT", `Unknown subcommand: ${subcommand}`, [
          "/sandbox status",
          "/sandbox enable",
          "/sandbox disable",
        ]);
    }
  },
};

/**
 * Sandbox enable command (standalone)
 */
export const sandboxEnableCommand: SlashCommand = {
  name: "enable",
  description: "Enable sandbox mode",
  kind: "builtin",
  category: "system",
  execute: async (): Promise<CommandResult> => handleEnable(),
};

/**
 * Sandbox status command (standalone)
 */
export const sandboxStatusCommand: SlashCommand = {
  name: "status",
  description: "Show sandbox status",
  kind: "builtin",
  category: "system",
  execute: async (): Promise<CommandResult> => handleStatus(),
};

/**
 * Create sandbox command
 */
export function createSandboxCommand(): SlashCommand {
  return sandboxCommand;
}

/**
 * Handle sandbox enable (exported for testing)
 */
export async function handleSandboxEnable(options?: EnableOptions): Promise<CommandResult> {
  return handleEnable(options);
}

/**
 * Handle sandbox status (exported for testing)
 */
export async function handleSandboxStatus(options?: StatusOptions): Promise<CommandResult> {
  return handleStatus(options);
}

/**
 * Execute sandbox command
 */
export async function executeSandbox(
  subcommand: SandboxSubcommand,
  options?: EnableOptions | StatusOptions
): Promise<EnableResult | SandboxStatusJson> {
  switch (subcommand) {
    case "enable":
      return executeSandboxEnable(options as EnableOptions);
    case "status":
      return executeSandboxStatus(options as StatusOptions);
    case "disable":
      sandboxEnabled = false;
      return { success: true, message: "Sandbox disabled" };
    default:
      return { success: false, message: `Unknown sandbox subcommand: ${subcommand}` };
  }
}

/**
 * Execute sandbox enable command
 */
export async function executeSandboxEnable(options?: EnableOptions): Promise<EnableResult> {
  const { backend, supported } = detectPlatformSupport();
  if (!supported && !options?.force) {
    return { success: false, message: "Platform not supported. Use --force to override." };
  }
  sandboxEnabled = true;
  return { success: true, message: "Sandbox enabled", backend: options?.backend ?? backend };
}

/**
 * Execute sandbox status command
 */
export async function executeSandboxStatus(_options?: StatusOptions): Promise<SandboxStatusJson> {
  const { backend, supported } = detectPlatformSupport();
  return {
    enabled: sandboxEnabled,
    backend,
    platform: platform(),
    platformSupported: supported,
  };
}

/**
 * Check if sandbox is enabled
 */
export function isSandboxEnabled(): boolean {
  return sandboxEnabled;
}

/**
 * Get help text for sandbox commands
 */
export function getSandboxHelp(): string {
  return [
    "🔒 Sandbox Commands",
    "",
    "  /sandbox status   Show sandbox status and platform support",
    "  /sandbox enable   Enable sandbox mode for secure execution",
    "  /sandbox disable  Disable sandbox mode",
    "",
    "Options:",
    "  --json            Output status as JSON",
    "  --force           Enable even if platform not fully supported",
    "  --backend=X       Specify backend (subprocess, platform, container)",
  ].join("\n");
}
