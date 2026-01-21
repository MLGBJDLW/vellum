# MCP Tool Integration

## Overview

The Model Context Protocol (MCP) extends your capabilities by connecting to external servers that provide additional tools and resources. MCP servers can run locally (stdio) or remotely (HTTP/SSE).

## Tool Naming Convention

MCP tools follow the naming pattern:

```text
mcp:{server-uid}/{tool-name}
```

**Examples:**

- `mcp:fs01/read_file` - Read file tool from filesystem server
- `mcp:gh01/create_issue` - Create issue tool from GitHub server
- `mcp:db01/query` - Query tool from database server

The server UID is a short identifier (e.g., `fs01`, `gh01`) assigned to each connected server.

## When to Use MCP Tools

### Prefer MCP Tools When

1. **Domain-specific operations** - MCP servers often provide specialized tools (e.g., database queries, API integrations)
2. **External service access** - Interacting with third-party services configured by the user
3. **User-configured capabilities** - Tools the user has explicitly added via MCP

### Prefer Built-in Tools When

1. **Standard file operations** - Use built-in `read_file`, `write_file` for local filesystem
2. **Shell commands** - Use built-in `execute_command` for terminal operations
3. **Core functionality** - Built-in tools are optimized and don't require external server

## Tool Discovery

Connected MCP servers and their tools are listed in the system prompt under "Connected MCP Servers". Each server section includes:

- **Server name and UID** - Identifier for tool calls
- **Status** - Connection state (connected, error, etc.)
- **Available Tools** - List of tools with descriptions and input schemas
- **Resources** - Static data resources the server provides
- **Resource Templates** - Dynamic resource patterns

## Usage Best Practices

1. **Check available tools** - Review the connected servers section before attempting MCP tool calls
2. **Use correct naming** - Always use the full `mcp:{uid}/{tool}` format
3. **Handle errors gracefully** - MCP servers may disconnect; fall back to alternatives if needed
4. **Respect trust levels** - Some servers are marked as trusted; others may require user confirmation

## Trust Levels

Servers can be configured with trust levels:

- **Trusted servers** (🔓) - Tool calls execute without user confirmation
- **Untrusted servers** - Each tool call requires explicit user approval

Trust is configured per-server in the MCP configuration file.

## Configuration

MCP servers are configured in:

- Global: `~/.vellum/mcp.json`
- Project: `.vellum/mcp.json` (overrides global)

Example configuration:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"],
      "trusted": true
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "${GITHUB_TOKEN}" },
      "includeTools": ["create_issue", "list_issues"],
      "trusted": false
    }
  }
}
```

## Error Handling

If an MCP tool call fails:

1. Check if the server is still connected
2. Verify the tool name and parameters
3. Review any error messages in the response
4. Consider using an alternative approach or built-in tool
