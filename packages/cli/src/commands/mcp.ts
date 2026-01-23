/**
 * MCP Slash Commands (Phase 40)
 *
 * Provides slash commands for MCP (Model Context Protocol) server management:
 * - /mcp list - List configured MCP servers
 * - /mcp status - Show connection status and tool count
 * - /mcp add - Add a new MCP server (interactive)
 * - /mcp remove - Remove an MCP server
 * - /mcp tools - List available tools from MCP servers
 *
 * @module cli/commands/mcp
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { McpHub, McpServer, McpSettings, McpStdioConfig } from "@vellum/mcp";
import { ICONS } from "../utils/icons.js";
import type { CommandContext, CommandResult, SlashCommand } from "./types.js";
import { error, interactive, success } from "./types.js";

// =============================================================================
// Module State
// =============================================================================

/**
 * Reference to the active McpHub instance.
 * Set by the App component when initialized.
 */
let mcpHub: McpHub | null = null;

/**
 * Set the McpHub instance for MCP commands.
 * Called by the App component during initialization.
 *
 * @param hub - The McpHub instance to use
 */
export function setMcpCommandsHub(hub: McpHub | null): void {
  mcpHub = hub;
}

/**
 * Get the current McpHub instance.
 * Returns null if not yet initialized.
 */
export function getMcpCommandsHub(): McpHub | null {
  return mcpHub;
}

// =============================================================================
// Status Helpers
// =============================================================================

/**
 * Get text indicator for a server connection status.
 */
function getStatusIndicator(status: string): string {
  switch (status) {
    case "connected":
      return "[ON]";
    case "connecting":
      return "[...]";
    case "disconnected":
      return "[OFF]";
    case "disabled":
      return "[DIS]";
    case "failed":
      return ICONS.error;
    case "needs_auth":
      return "[Auth]";
    case "needs_client_registration":
      return "[Reg]";
    default:
      return "[?]";
  }
}

/**
 * Format server info for list display.
 */
function formatServerListItem(server: McpServer): string {
  const indicator = getStatusIndicator(server.statusInfo.status);
  const disabledTag = server.disabled ? " [disabled]" : "";
  return `  ${indicator} ${server.name}${disabledTag}`;
}

/**
 * Format detailed server status.
 */
function formatServerStatus(server: McpServer): string {
  const indicator = getStatusIndicator(server.statusInfo.status);
  const toolCount = server.tools?.length ?? 0;
  const resourceCount = server.resources?.length ?? 0;

  const lines = [`${indicator} ${server.name}`, `   Status: ${server.statusInfo.status}`];

  if (server.statusInfo.status === "failed" && "error" in server.statusInfo) {
    lines.push(`   Error: ${server.statusInfo.error}`);
  }

  if (server.statusInfo.status === "connected") {
    lines.push(`   Tools: ${toolCount}`);
    lines.push(`   Resources: ${resourceCount}`);
  }

  if (server.disabled) {
    lines.push("   Note: Server is disabled in config");
  }

  if (server.uid) {
    lines.push(`   UID: ${server.uid}`);
  }

  return lines.join("\n");
}

// =============================================================================
// Subcommand Handlers
// =============================================================================

/**
 * Handle /mcp list - List configured MCP servers
 */
async function handleList(_ctx: CommandContext): Promise<CommandResult> {
  if (!mcpHub) {
    return error("OPERATION_NOT_ALLOWED", "MCP hub not initialized. No MCP servers available.", [
      "/help mcp",
    ]);
  }

  const servers = mcpHub.getServers();

  if (servers.length === 0) {
    return success(
      "📡 No MCP servers configured.\n\n" + "Add servers to ~/.vellum/mcp.json or use /mcp add"
    );
  }

  const lines = [
    "📡 Configured MCP Servers",
    "",
    ...servers.map(formatServerListItem),
    "",
    `Total: ${servers.length} server(s)`,
    "",
    "Use /mcp status for detailed information.",
  ];

  return success(lines.join("\n"));
}

/**
 * Handle /mcp status - Show connection status and tool count
 */
async function handleStatus(ctx: CommandContext): Promise<CommandResult> {
  if (!mcpHub) {
    return error("OPERATION_NOT_ALLOWED", "MCP hub not initialized. No MCP servers available.", [
      "/help mcp",
    ]);
  }

  const serverName = ctx.parsedArgs.positional[1] as string | undefined;
  const servers = mcpHub.getServers();

  if (servers.length === 0) {
    return success("📡 No MCP servers configured.");
  }

  // If specific server requested
  if (serverName) {
    const server = servers.find((s) => s.name === serverName);
    if (!server) {
      return error("RESOURCE_NOT_FOUND", `Server "${serverName}" not found.`, [
        `Available servers: ${servers.map((s) => s.name).join(", ")}`,
      ]);
    }
    return success(formatServerStatus(server));
  }

  // Show all servers
  const connectedCount = servers.filter((s) => s.statusInfo.status === "connected").length;
  const totalTools = servers.reduce((sum, s) => sum + (s.tools?.length ?? 0), 0);

  const lines = [
    "📡 MCP Server Status",
    "",
    ...servers.map(formatServerStatus),
    "",
    "─".repeat(40),
    `Connected: ${connectedCount}/${servers.length}`,
    `Total Tools: ${totalTools}`,
  ];

  return success(lines.join("\n"));
}

// =============================================================================
// Config File Helpers
// =============================================================================

/**
 * Get the global MCP config file path.
 * Uses ~/.vellum/mcp.json on all platforms.
 */
function getGlobalMcpConfigPath(): string {
  return path.join(os.homedir(), ".vellum", "mcp.json");
}

/**
 * Get the project-level MCP config file path.
 */
function getProjectMcpConfigPath(): string {
  return path.join(process.cwd(), ".vellum", "mcp.json");
}

/**
 * Read existing MCP config file or return empty config.
 */
async function readMcpConfig(configPath: string): Promise<McpSettings> {
  try {
    const content = await fs.readFile(configPath, "utf-8");
    return JSON.parse(content) as McpSettings;
  } catch {
    // File doesn't exist or invalid JSON - return empty config
    return { mcpServers: {} };
  }
}

/**
 * Write MCP config to file, creating directories if needed.
 */
async function writeMcpConfig(configPath: string, config: McpSettings): Promise<void> {
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
}

/**
 * Handle /mcp add - Add a new MCP server (interactive)
 */
async function handleAdd(_ctx: CommandContext): Promise<CommandResult> {
  if (!mcpHub) {
    return error("OPERATION_NOT_ALLOWED", "MCP hub not initialized.", ["/help mcp"]);
  }

  // Interactive flow: collect server name
  return interactive({
    inputType: "text",
    message: "[MCP] Enter server name:",
    placeholder: "my-mcp-server",
    handler: async (serverName: string): Promise<CommandResult> => {
      if (!serverName.trim()) {
        return error("INVALID_ARGUMENT", "Server name cannot be empty.", []);
      }

      // Check if server already exists
      const existing = mcpHub?.getServer(serverName);
      if (existing) {
        return error("INVALID_ARGUMENT", `Server "${serverName}" already exists.`, [
          `/mcp remove ${serverName}`,
        ]);
      }

      // Collect command
      return interactive({
        inputType: "text",
        message: `${ICONS.package} Enter command to run:`,
        placeholder: "npx -y @my-org/mcp-server",
        handler: async (command: string): Promise<CommandResult> => {
          if (!command.trim()) {
            return error("INVALID_ARGUMENT", "Command cannot be empty.", []);
          }

          // Parse command into parts
          const parts = command.trim().split(/\s+/);
          const cmd = parts[0] ?? "";
          const args = parts.slice(1);

          const serverConfig: McpStdioConfig = {
            command: cmd,
            args: args.length > 0 ? args : undefined,
          };

          // Ask where to save
          return interactive({
            inputType: "select",
            message: "Where do you want to save this configuration?",
            options: [
              "Save to global config (~/.vellum/mcp.json)",
              "Save to project config (.vellum/mcp.json)",
              "Just show me the JSON (manual)",
            ],
            handler: async (choice: string): Promise<CommandResult> => {
              // Determine save location based on selection
              const isGlobal = choice.includes("global");
              const isProject = choice.includes("project");
              const isManual = choice.includes("manual") || choice.includes("JSON");

              // Manual mode - just output JSON (backward compatible)
              if (isManual) {
                const configDisplay = {
                  [serverName]: serverConfig,
                };
                const configJson = JSON.stringify(configDisplay, null, 2);

                return success(
                  `${ICONS.success} Server configuration ready!\n\n` +
                    "Add this to your ~/.vellum/mcp.json:\n\n" +
                    "```json\n" +
                    `"mcpServers": ${configJson}\n` +
                    "```\n\n" +
                    "After adding, the server will be auto-detected.\n" +
                    "Or restart Vellum to connect."
                );
              }

              // Determine config path
              const configPath = isGlobal
                ? getGlobalMcpConfigPath()
                : isProject
                  ? getProjectMcpConfigPath()
                  : getGlobalMcpConfigPath(); // Default to global

              try {
                // Read existing config
                const existingConfig = await readMcpConfig(configPath);

                // Merge new server
                existingConfig.mcpServers = {
                  ...existingConfig.mcpServers,
                  [serverName]: serverConfig,
                };

                // Write back
                await writeMcpConfig(configPath, existingConfig);

                return success(
                  `${ICONS.success} Server "${serverName}" added to ${configPath}\n\n` +
                    "The server will be auto-detected.\n" +
                    "Use /mcp status to check connection status."
                );
              } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return error("INTERNAL_ERROR", `Failed to write config file: ${message}`, [
                  "Check file permissions",
                  "Try the manual option instead",
                ]);
              }
            },
            onCancel: () => success("Server addition cancelled."),
          });
        },
        onCancel: () => success("Server addition cancelled."),
      });
    },
    onCancel: () => success("Server addition cancelled."),
  });
}

/**
 * Handle /mcp remove - Remove an MCP server
 */
async function handleRemove(ctx: CommandContext): Promise<CommandResult> {
  if (!mcpHub) {
    return error("OPERATION_NOT_ALLOWED", "MCP hub not initialized.", ["/help mcp"]);
  }

  const serverName = ctx.parsedArgs.positional[1] as string | undefined;

  if (!serverName) {
    const servers = mcpHub.getServers();
    if (servers.length === 0) {
      return error("RESOURCE_NOT_FOUND", "No MCP servers configured.", []);
    }

    return error("MISSING_ARGUMENT", "Please specify a server name to remove.", [
      `Usage: /mcp remove <server-name>`,
      `Available: ${servers.map((s) => s.name).join(", ")}`,
    ]);
  }

  const server = mcpHub.getServer(serverName);
  if (!server) {
    return error("RESOURCE_NOT_FOUND", `Server "${serverName}" not found.`, [
      `Use /mcp list to see available servers.`,
    ]);
  }

  // Confirm removal
  return interactive({
    inputType: "confirm",
    message: `${ICONS.warning} Remove server "${serverName}"? This will disconnect it.`,
    defaultValue: "n",
    handler: async (value: string): Promise<CommandResult> => {
      const confirmed = value.toLowerCase() === "y" || value.toLowerCase() === "yes";
      if (!confirmed) {
        return success("Removal cancelled.");
      }

      // Try to remove from both global and project config
      const globalPath = getGlobalMcpConfigPath();
      const projectPath = getProjectMcpConfigPath();
      let removed = false;
      const removedFrom: string[] = [];

      // Try global config
      try {
        const globalConfig = await readMcpConfig(globalPath);
        if (globalConfig.mcpServers && serverName in globalConfig.mcpServers) {
          delete globalConfig.mcpServers[serverName];
          await writeMcpConfig(globalPath, globalConfig);
          removed = true;
          removedFrom.push("global (~/.vellum/mcp.json)");
        }
      } catch {
        // Ignore errors reading global config
      }

      // Try project config
      try {
        const projectConfig = await readMcpConfig(projectPath);
        if (projectConfig.mcpServers && serverName in projectConfig.mcpServers) {
          delete projectConfig.mcpServers[serverName];
          await writeMcpConfig(projectPath, projectConfig);
          removed = true;
          removedFrom.push("project (.vellum/mcp.json)");
        }
      } catch {
        // Ignore errors reading project config
      }

      if (removed) {
        return success(
          `${ICONS.success} Server "${serverName}" removed from ${removedFrom.join(" and ")}.\n\n` +
            "The server has been disconnected.\n" +
            "Restart Vellum to apply changes."
        );
      }

      return error(
        "RESOURCE_NOT_FOUND",
        `Server "${serverName}" not found in configuration files.`,
        ["The server may be configured elsewhere", "Check ~/.vellum/mcp.json manually"]
      );
    },
    onCancel: () => success("Removal cancelled."),
  });
}

/**
 * Handle /mcp tools - List available tools from MCP servers
 */
async function handleTools(ctx: CommandContext): Promise<CommandResult> {
  if (!mcpHub) {
    return error("OPERATION_NOT_ALLOWED", "MCP hub not initialized.", ["/help mcp"]);
  }

  const serverName = ctx.parsedArgs.positional[1] as string | undefined;
  const servers = mcpHub.getServers();

  if (servers.length === 0) {
    return success("📡 No MCP servers configured. No tools available.");
  }

  // If specific server requested
  if (serverName) {
    const server = servers.find((s) => s.name === serverName);
    if (!server) {
      return error("RESOURCE_NOT_FOUND", `Server "${serverName}" not found.`, [
        `Available servers: ${servers.map((s) => s.name).join(", ")}`,
      ]);
    }

    if (server.statusInfo.status !== "connected") {
      return error(
        "OPERATION_NOT_ALLOWED",
        `Server "${serverName}" is not connected (status: ${server.statusInfo.status}).`,
        ["/mcp status"]
      );
    }

    const tools = server.tools ?? [];
    if (tools.length === 0) {
      return success(`[MCP] ${serverName} - No tools available.`);
    }

    const lines = [
      `${ICONS.tools} Tools from ${serverName}`,
      "",
      ...tools.map((t) => `  - ${t.name}${t.description ? ` - ${t.description}` : ""}`),
      "",
      `Total: ${tools.length} tool(s)`,
    ];

    return success(lines.join("\n"));
  }

  // Show tools from all connected servers
  const allTools = mcpHub.getAllTools();

  if (allTools.length === 0) {
    return success(`${ICONS.tools} No tools available from connected MCP servers.`);
  }

  // Group by server
  const toolsByServer = new Map<string, typeof allTools>();
  for (const tool of allTools) {
    const existing = toolsByServer.get(tool.serverName) ?? [];
    existing.push(tool);
    toolsByServer.set(tool.serverName, existing);
  }

  const lines = [`${ICONS.tools} Available MCP Tools`, ""];

  for (const [server, tools] of toolsByServer) {
    lines.push(`[MCP] ${server}:`);
    for (const tool of tools) {
      lines.push(`  - ${tool.name}${tool.description ? ` - ${tool.description}` : ""}`);
    }
    lines.push("");
  }

  lines.push(`Total: ${allTools.length} tool(s) from ${toolsByServer.size} server(s)`);

  return success(lines.join("\n"));
}

/**
 * Show help for /mcp command
 */
function showHelp(): CommandResult {
  const lines = [
    "[MCP] Server Management",
    "",
    "Subcommands:",
    "  list    - List configured MCP servers",
    "  status  - Show connection status and tool count",
    "  add     - Add a new MCP server (interactive)",
    "  remove  - Remove an MCP server",
    "  tools   - List available tools from MCP servers",
    "",
    "Examples:",
    "  /mcp list",
    "  /mcp status",
    "  /mcp status my-server",
    "  /mcp tools",
    "  /mcp tools my-server",
    "  /mcp add",
    "  /mcp remove my-server",
  ];

  return success(lines.join("\n"));
}

// =============================================================================
// /mcp Command - MCP Server Management
// =============================================================================

/**
 * /mcp command - Manage MCP (Model Context Protocol) servers.
 *
 * Provides subcommands for listing, inspecting, adding, and removing
 * MCP servers configured in ~/.vellum/mcp.json.
 */
export const mcpCommand: SlashCommand = {
  name: "mcp",
  description: "Manage MCP (Model Context Protocol) servers",
  kind: "builtin",
  category: "tools",
  aliases: [],
  positionalArgs: [
    {
      name: "subcommand",
      type: "string",
      description: "Subcommand (list, status, add, remove, tools)",
      required: false,
    },
    {
      name: "server",
      type: "string",
      description: "Server name (for status, remove, tools)",
      required: false,
    },
  ],
  examples: [
    "/mcp           - Show help",
    "/mcp list      - List configured servers",
    "/mcp status    - Show all server status",
    "/mcp tools     - List all available tools",
    "/mcp add       - Add a new server",
    "/mcp remove X  - Remove server X",
  ],
  subcommands: [
    { name: "list", description: "List configured MCP servers" },
    { name: "status", description: "Show connection status and tool count" },
    { name: "add", description: "Add a new MCP server" },
    { name: "remove", description: "Remove an MCP server" },
    { name: "tools", description: "List available tools from MCP servers" },
  ],

  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    const subcommand = ctx.parsedArgs.positional[0] as string | undefined;

    switch (subcommand) {
      case "list":
        return handleList(ctx);
      case "status":
        return handleStatus(ctx);
      case "add":
        return handleAdd(ctx);
      case "remove":
        return handleRemove(ctx);
      case "tools":
        return handleTools(ctx);
      default:
        return showHelp();
    }
  },
};

// =============================================================================
// Export All MCP Commands
// =============================================================================

/**
 * All MCP-related slash commands for registration.
 */
export const mcpSlashCommands: SlashCommand[] = [mcpCommand];
