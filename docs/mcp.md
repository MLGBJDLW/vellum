# MCP Integration

Connect external tools and services to Vellum using the Model Context Protocol (MCP).

## What is MCP?

MCP (Model Context Protocol) is an open protocol that enables AI assistants to connect with external data sources and tools. Vellum supports MCP servers, allowing you to:

- Access databases, APIs, and file systems
- Run custom tools and scripts
- Integrate with third-party services
- Extend Vellum's capabilities

## Configuration

### Config File Location

MCP servers are configured in `~/.vellum/mcp.json`:

| Platform | Path |
|----------|------|
| **Windows** | `%USERPROFILE%\.vellum\mcp.json` |
| **macOS** | `~/.vellum/mcp.json` |
| **Linux** | `~/.vellum/mcp.json` |

### Project-Level Config

You can also add a project-specific config at `.vellum/mcp.json` in your project root. Project configs are merged with the global config.

## Adding Servers

### Basic Server Configuration

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/dir"],
      "env": {}
    }
  }
}
```

### Server with Environment Variables

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    }
  }
}
```

Environment variables use `${VAR_NAME}` syntax and are resolved at runtime.

### Multiple Servers

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "./"],
      "env": {}
    },
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres"],
      "env": {
        "DATABASE_URL": "${DATABASE_URL}"
      }
    },
    "brave-search": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-brave-search"],
      "env": {
        "BRAVE_API_KEY": "${BRAVE_API_KEY}"
      }
    }
  }
}
```

## Tool Naming Convention

MCP tools are prefixed with the server name to avoid conflicts:

| Server Name | Tool Name | Full Tool Name |
|-------------|-----------|----------------|
| `filesystem` | `read_file` | `mcp_filesystem_read_file` |
| `github` | `create_issue` | `mcp_github_create_issue` |
| `postgres` | `query` | `mcp_postgres_query` |

## OAuth Setup

For servers requiring OAuth authentication (GitHub, Google, etc.):

### 1. Configure OAuth credentials

```json
{
  "mcpServers": {
    "google-drive": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-gdrive"],
      "oauth": {
        "clientId": "${GOOGLE_CLIENT_ID}",
        "clientSecret": "${GOOGLE_CLIENT_SECRET}",
        "scopes": ["https://www.googleapis.com/auth/drive.readonly"]
      }
    }
  }
}
```

### 2. Authenticate

On first use, Vellum will:

1. Open your browser to the OAuth authorization page
2. Wait for you to authorize the application
3. Store the tokens securely in the credential manager

Tokens are automatically refreshed when expired.

## Server Timeout

Configure server connection timeout:

```json
{
  "mcpServers": {
    "slow-server": {
      "command": "node",
      "args": ["./my-server.js"],
      "timeout": 60
    }
  }
}
```

Default timeout is 30 seconds.

## Troubleshooting

### Server Not Starting

1. **Check the command exists**:

   ```bash
   which npx  # or: where npx (Windows)
   ```

2. **Test manually**:

   ```bash
   npx -y @modelcontextprotocol/server-filesystem ./
   ```

3. **Check logs**:
   - Enable debug logging: `DEBUG=vellum:mcp* vellum`
   - Check `~/.vellum/logs/` for error details

### Tools Not Appearing

1. **Verify server is connected**: Use `/mcp status` in TUI
2. **Check tool list**: Use `/mcp tools <server-name>`
3. **Restart server**: Use `/mcp restart <server-name>`

### Authentication Errors

1. **Re-authenticate**: Delete cached tokens and restart
2. **Check credentials**: Verify environment variables are set
3. **Verify scopes**: Ensure OAuth scopes match server requirements

### Environment Variable Issues

1. **Check expansion**: Variables must use `${VAR_NAME}` syntax
2. **Verify values**: Run `echo $VAR_NAME` to check
3. **Restart Vellum**: Environment changes require restart

## Popular MCP Servers

| Server | Package | Description |
|--------|---------|-------------|
| Filesystem | `@modelcontextprotocol/server-filesystem` | File operations |
| GitHub | `@modelcontextprotocol/server-github` | GitHub API |
| PostgreSQL | `@modelcontextprotocol/server-postgres` | Database queries |
| Brave Search | `@modelcontextprotocol/server-brave-search` | Web search |
| Memory | `@modelcontextprotocol/server-memory` | Persistent memory |

See [MCP Servers](https://github.com/modelcontextprotocol/servers) for the full list.
