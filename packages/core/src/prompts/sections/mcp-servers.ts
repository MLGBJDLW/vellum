// ============================================
// MCP Servers Prompt Section Generator
// ============================================

/**
 * Generates MCP server sections for system prompts.
 * Lists connected servers, their tools, and resources in a format
 * suitable for LLM consumption.
 *
 * @module @butlerw/core/prompts/sections/mcp-servers
 */

// =============================================================================
// Types
// =============================================================================

/**
 * JSON Schema representation for tool input parameters.
 */
export interface McpToolInputSchema {
  type?: string;
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
}

/**
 * MCP Tool definition for prompt section generation.
 */
export interface McpToolInfo {
  /** Tool name (used in `mcp:{server}:{tool}` format) */
  name: string;
  /** Human-readable description of the tool */
  description?: string;
  /** JSON Schema for input parameters */
  inputSchema?: McpToolInputSchema;
}

/**
 * MCP Resource definition for prompt section generation.
 */
export interface McpResourceInfo {
  /** Resource URI (e.g., `file:///path` or `resource://name`) */
  uri: string;
  /** Human-readable name */
  name?: string;
  /** Description of the resource */
  description?: string;
  /** MIME type of the resource content */
  mimeType?: string;
}

/**
 * MCP Resource Template for dynamic resource generation.
 */
export interface McpResourceTemplateInfo {
  /** URI template with placeholders (e.g., `file://{path}`) */
  uriTemplate: string;
  /** Human-readable name */
  name?: string;
  /** Description of the template */
  description?: string;
}

/**
 * MCP Server connection status.
 */
export type McpServerStatus = "connected" | "connecting" | "disconnected" | "error" | "disabled";

/**
 * Represents an MCP server with its available capabilities.
 */
export interface McpServer {
  /** Unique identifier for short tool naming */
  uid: string;
  /** Display name of the server */
  name: string;
  /** Current connection status */
  status: McpServerStatus;
  /** Error message if status is 'error' */
  error?: string;
  /** Available tools from this server */
  tools?: McpToolInfo[];
  /** Available resources from this server */
  resources?: McpResourceInfo[];
  /** Resource templates for dynamic resource access */
  resourceTemplates?: McpResourceTemplateInfo[];
  /** Whether this server is trusted (skip confirmation) */
  trusted?: boolean;
}

/**
 * Options for generating the MCP servers section.
 */
export interface McpServersSectionOptions {
  /** Include detailed tool input schemas (default: true) */
  includeInputSchemas?: boolean;
  /** Include resource templates (default: true) */
  includeResourceTemplates?: boolean;
  /** Only include connected servers (default: true) */
  connectedOnly?: boolean;
  /** Maximum tools to show per server before truncation (default: 50) */
  maxToolsPerServer?: number;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_OPTIONS: Required<McpServersSectionOptions> = {
  includeInputSchemas: true,
  includeResourceTemplates: true,
  connectedOnly: true,
  maxToolsPerServer: 50,
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Formats a JSON schema object into a compact string representation.
 *
 * @param schema - The input schema to format
 * @returns Formatted schema string
 */
function formatInputSchema(schema: McpToolInputSchema | undefined): string {
  if (!schema || !schema.properties) {
    return "No parameters";
  }

  const props = schema.properties;
  const required = new Set(schema.required || []);

  const entries = Object.entries(props).map(([key, value]) => {
    const propValue = value as { type?: string; description?: string };
    const type = propValue?.type || "any";
    const isRequired = required.has(key);
    return `${key}${isRequired ? "" : "?"}: ${type}`;
  });

  if (entries.length === 0) {
    return "No parameters";
  }

  return `{ ${entries.join(", ")} }`;
}

/**
 * Maps internal McpServerStatus to user-friendly display text.
 *
 * @param status - Server status
 * @returns Display text for the status
 */
function formatStatus(status: McpServerStatus): string {
  const statusMap: Record<McpServerStatus, string> = {
    connected: "✅ Connected",
    connecting: "🔄 Connecting...",
    disconnected: "⚪ Disconnected",
    error: "❌ Error",
    disabled: "⏸️ Disabled",
  };
  return statusMap[status] || status;
}

/**
 * Generates the tools section for a single server.
 *
 * @param tools - Array of tools to format
 * @param serverUid - Server UID for tool naming
 * @param options - Section generation options
 * @returns Formatted tools section string
 */
function formatToolsSection(
  tools: McpToolInfo[],
  serverUid: string,
  options: Required<McpServersSectionOptions>
): string {
  if (!tools.length) {
    return "";
  }

  const displayTools = tools.slice(0, options.maxToolsPerServer);
  const truncated = tools.length > options.maxToolsPerServer;

  const lines = ["### Available Tools", ""];

  for (const tool of displayTools) {
    const toolName = `mcp:${serverUid}/${tool.name}`;
    lines.push(`- \`${toolName}\`: ${tool.description || "No description"}`);

    if (options.includeInputSchemas && tool.inputSchema) {
      const schemaStr = formatInputSchema(tool.inputSchema);
      lines.push(`  - Input: \`${schemaStr}\``);
    }
  }

  if (truncated) {
    const remaining = tools.length - options.maxToolsPerServer;
    lines.push(`- ... and ${remaining} more tools`);
  }

  return lines.join("\n");
}

/**
 * Generates the resources section for a single server.
 *
 * @param resources - Array of resources to format
 * @returns Formatted resources section string
 */
function formatResourcesSection(resources: McpResourceInfo[]): string {
  if (!resources.length) {
    return "";
  }

  const lines = ["### Resources", ""];

  for (const resource of resources) {
    const name = resource.name || resource.uri;
    const description = resource.description ? ` - ${resource.description}` : "";
    const mimeType = resource.mimeType ? ` (${resource.mimeType})` : "";
    lines.push(`- \`${resource.uri}\`${mimeType}: ${name}${description}`);
  }

  return lines.join("\n");
}

/**
 * Generates the resource templates section for a single server.
 *
 * @param templates - Array of resource templates to format
 * @returns Formatted resource templates section string
 */
function formatResourceTemplatesSection(templates: McpResourceTemplateInfo[]): string {
  if (!templates.length) {
    return "";
  }

  const lines = ["### Resource Templates", ""];

  for (const template of templates) {
    const name = template.name || template.uriTemplate;
    const description = template.description ? ` - ${template.description}` : "";
    lines.push(`- \`${template.uriTemplate}\`: ${name}${description}`);
  }

  return lines.join("\n");
}

// =============================================================================
// Main Export
// =============================================================================

/**
 * Generates an MCP servers section for inclusion in system prompts.
 *
 * Creates a formatted markdown section listing all connected MCP servers,
 * their available tools, and resources. The format is optimized for
 * LLM consumption with clear tool naming conventions.
 *
 * @param servers - Array of MCP server objects
 * @param options - Configuration options for the section
 * @returns Formatted markdown string for the MCP servers section
 *
 * @example
 * ```typescript
 * const servers: McpServer[] = [{
 *   uid: 'fs01',
 *   name: 'filesystem',
 *   status: 'connected',
 *   tools: [{ name: 'read_file', description: 'Read file contents' }],
 * }];
 *
 * const section = getMcpServersSection(servers);
 * // Returns formatted markdown with tool listing
 * ```
 */
export function getMcpServersSection(
  servers: McpServer[],
  options: McpServersSectionOptions = {}
): string {
  const opts: Required<McpServersSectionOptions> = { ...DEFAULT_OPTIONS, ...options };

  // Filter servers based on options
  const filteredServers = opts.connectedOnly
    ? servers.filter((s) => s.status === "connected")
    : servers;

  if (filteredServers.length === 0) {
    return `# Connected MCP Servers

No MCP servers are currently connected.

To use MCP tools, configure servers in your \`~/.vellum/mcp.json\` or project \`.vellum/mcp.json\` file.`;
  }

  const sections: string[] = [
    "# Connected MCP Servers",
    "",
    "The following MCP (Model Context Protocol) servers are connected and provide additional tools and resources.",
    "",
    "## Tool Naming Convention",
    "",
    "MCP tools use the format: `mcp:{server-uid}/{tool-name}`",
    "",
    "For example: `mcp:fs01/read_file` calls the `read_file` tool on server with UID `fs01`.",
    "",
  ];

  for (const server of filteredServers) {
    // Server header
    const trustBadge = server.trusted ? " 🔓" : "";
    sections.push(`## ${server.name} (\`${server.uid}\`)${trustBadge}`);
    sections.push("");
    sections.push(`**Status**: ${formatStatus(server.status)}`);

    if (server.status === "error" && server.error) {
      sections.push(`**Error**: ${server.error}`);
    }

    sections.push("");

    // Tools section
    if (server.tools?.length) {
      sections.push(formatToolsSection(server.tools, server.uid, opts));
      sections.push("");
    }

    // Resources section
    if (server.resources?.length) {
      sections.push(formatResourcesSection(server.resources));
      sections.push("");
    }

    // Resource templates section
    if (opts.includeResourceTemplates && server.resourceTemplates?.length) {
      sections.push(formatResourceTemplatesSection(server.resourceTemplates));
      sections.push("");
    }
  }

  return sections.join("\n").trim();
}

/**
 * Converts internal McpServer status to simplified status type.
 *
 * @param statusInfo - Status info object from McpHub
 * @returns Simplified status string
 */
export function mapStatusFromHub(statusInfo: { status: string; error?: string }): McpServerStatus {
  switch (statusInfo.status) {
    case "connected":
      return "connected";
    case "connecting":
      return "connecting";
    case "disconnected":
      return "disconnected";
    case "disabled":
      return "disabled";
    case "failed":
    case "needs_auth":
    case "needs_client_registration":
      return "error";
    default:
      return "disconnected";
  }
}
