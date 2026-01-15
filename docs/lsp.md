# Language Server Protocol (LSP) Integration

Vellum provides built-in Language Server Protocol support for intelligent code assistance across 26 programming languages. LSP enables features like diagnostics, code completion, hover documentation, go-to-definition, and more.

---

## Table of Contents

- [Overview](#overview)
- [Supported Languages](#supported-languages)
- [Zero Configuration Usage](#zero-configuration-usage)
- [Auto-Install](#auto-install)
- [Configuration](#configuration)
  - [Configuration Files](#configuration-files)
  - [Configuration Priority](#configuration-priority)
  - [Configuration Schema](#configuration-schema)
  - [Common Configurations](#common-configurations)
- [LSP Tools](#lsp-tools)
- [Troubleshooting](#troubleshooting)

---

## Overview

Vellum's LSP integration provides the AI assistant with deep understanding of your codebase by connecting to language servers. This enables:

| Feature | Description |
|---------|-------------|
| **Diagnostics** | Real-time error and warning detection |
| **Hover** | Type information and documentation on hover |
| **Go to Definition** | Navigate to symbol definitions |
| **Find References** | Locate all usages of a symbol |
| **Code Completion** | Intelligent autocomplete suggestions |
| **Code Actions** | Quick fixes and refactoring suggestions |
| **Formatting** | Auto-format code using language standards |
| **Call Hierarchy** | Trace incoming and outgoing function calls |
| **Document Symbols** | Outline view of file structure |

---

## Supported Languages

Vellum includes 26 pre-configured language servers with auto-install capability:

### Core Languages

| Language | Server | Command | Install Method |
|----------|--------|---------|----------------|
| TypeScript/JavaScript | TypeScript Language Server | `typescript-language-server` | npm |
| Python | Pyright | `pyright-langserver` | npm |
| Go | gopls | `gopls` | system |
| Rust | rust-analyzer | `rust-analyzer` | system |

### JavaScript/TypeScript Ecosystem

| Language | Server | Command | Install Method |
|----------|--------|---------|----------------|
| Vue | Vue Language Server | `vue-language-server` | npm |
| Svelte | Svelte Language Server | `svelteserver` | npm |
| Astro | Astro Language Server | `astro-ls` | npm |
| Deno | Deno LSP | `deno lsp` | system |

### Linters/Formatters

| Tool | Server | Command | Install Method |
|------|--------|---------|----------------|
| ESLint | ESLint Language Server | `vscode-eslint-language-server` | npm |
| Biome | Biome Language Server | `biome lsp-proxy` | npm |

### Web Technologies

| Language | Server | Command | Install Method |
|----------|--------|---------|----------------|
| HTML | HTML Language Server | `vscode-html-language-server` | npm |
| CSS/SCSS/Less | CSS Language Server | `vscode-css-language-server` | npm |
| JSON | JSON Language Server | `vscode-json-language-server` | npm |

### Backend Languages

| Language | Server | Command | Install Method |
|----------|--------|---------|----------------|
| Java | Eclipse JDTLS | `jdtls` | system |
| C# | csharp-ls | `csharp-ls` | system |
| PHP | Intelephense | `intelephense` | npm |
| Ruby | RuboCop LSP | `rubocop --lsp` | system |
| Elixir | Elixir Language Server | `elixir-ls` | system |
| Kotlin | Kotlin Language Server | `kotlin-language-server` | system |

### Systems Programming

| Language | Server | Command | Install Method |
|----------|--------|---------|----------------|
| Zig | ZLS | `zls` | system |

### Scripting

| Language | Server | Command | Install Method |
|----------|--------|---------|----------------|
| Lua | Lua Language Server | `lua-language-server` | system |
| Bash/Shell | Bash Language Server | `bash-language-server` | npm |

### DevOps/Config

| Language | Server | Command | Install Method |
|----------|--------|---------|----------------|
| YAML | YAML Language Server | `yaml-language-server` | npm |
| Dockerfile | Dockerfile Language Server | `docker-langserver` | npm |

### Data

| Language | Server | Command | Install Method |
|----------|--------|---------|----------------|
| SQL | sqls | `sqls` | system |

---

## Zero Configuration Usage

LSP support works **out of the box** with no configuration required. Vellum:

1. **Detects project type** using root patterns (e.g., `package.json`, `Cargo.toml`, `go.mod`)
2. **Activates appropriate servers** based on file extensions you're working with
3. **Auto-installs missing servers** when needed (if enabled)

**Example:** Opening a TypeScript project automatically:
- Detects `tsconfig.json` or `package.json`
- Starts `typescript-language-server`
- Provides full IntelliSense capabilities

---

## Auto-Install

When a language server is not found on your system, Vellum can automatically install it.

### How It Works

1. You open a file (e.g., `.py` file)
2. Vellum detects Python server is needed
3. If `pyright-langserver` is not found, Vellum runs:
   ```bash
   npm install -g pyright
   ```
4. Server starts automatically after installation

### Install Methods

| Method | Description | Example |
|--------|-------------|---------|
| `npm` | Node package manager (global install) | TypeScript, ESLint, Pyright |
| `pip` | Python package manager | Python tools |
| `cargo` | Rust package manager | Rust tools |
| `system` | Requires manual installation | Go, Java, Rust |

> **Note:** Servers with `system` install method require manual installation via your OS package manager, official installers, or language-specific tooling.

### Disabling Auto-Install

To disable automatic installation globally:

**Global** (`~/.vellum/lsp.json`):
```json
{
  "autoInstall": false
}
```

**Per-project** (`.vellum/lsp.json`):
```json
{
  "autoInstall": false
}
```

---

## Configuration

### Configuration Files

| Location | Scope | Purpose |
|----------|-------|---------|
| `~/.vellum/lsp.json` | Global | User-wide defaults |
| `.vellum/lsp.json` | Project | Project-specific overrides |

### Configuration Priority

Configuration is merged in the following order (later wins):

1. **Built-in defaults** — Vellum's 26 pre-configured servers
2. **Global config** — `~/.vellum/lsp.json`
3. **Project config** — `.vellum/lsp.json`

Values are deep-merged, so you only need to specify what you want to change.

### Configuration Schema

```json
{
  "$schema": "https://vellum.dev/schemas/lsp-config.json",
  "version": "1.0",
  "autoInstall": true,
  "maxConcurrentServers": 5,
  "requestTimeoutMs": 30000,
  "disabled": [],
  "cache": {
    "maxSize": 100,
    "ttlSeconds": 300
  },
  "servers": {
    "<server-id>": {
      "enabled": true,
      "name": "Display Name",
      "command": "server-command",
      "args": ["--stdio"],
      "transport": "stdio",
      "rootPatterns": ["package.json"],
      "fileExtensions": [".ts", ".js"],
      "filePatterns": [],
      "languageId": "typescript",
      "initializationOptions": {},
      "settings": {},
      "env": {},
      "cwd": "/path/to/working/dir",
      "install": {
        "method": "npm",
        "package": "package-name",
        "args": ["-g"]
      }
    }
  }
}
```

#### Top-Level Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `version` | string | `"1.0"` | Config schema version |
| `autoInstall` | boolean | `true` | Auto-install missing servers |
| `maxConcurrentServers` | number | `5` | Maximum simultaneous servers |
| `requestTimeoutMs` | number | `30000` | LSP request timeout (ms) |
| `disabled` | string[] | `[]` | List of server IDs to disable |
| `cache.maxSize` | number | `100` | Maximum cached responses |
| `cache.ttlSeconds` | number | `300` | Cache time-to-live |

#### Server Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `enabled` | boolean | No | Enable/disable this server (default: `true`) |
| `name` | string | No | Display name for the server |
| `command` | string | **Yes** | Executable command |
| `args` | string[] | No | Command-line arguments |
| `transport` | `"stdio"` \| `"socket"` \| `"ipc"` | No | Communication method (default: `"stdio"`) |
| `rootPatterns` | string[] | No | Files that indicate project root |
| `fileExtensions` | string[] | No | File extensions this server handles |
| `filePatterns` | string[] | No | Glob patterns for matching files |
| `languageId` | string | No | LSP language identifier |
| `initializationOptions` | object | No | Options sent on initialize |
| `settings` | object | No | Server-specific settings |
| `env` | object | No | Environment variables |
| `cwd` | string | No | Working directory |
| `install.method` | `"npm"` \| `"pip"` \| `"cargo"` \| `"system"` | No | Install method |
| `install.package` | string | No | Package name to install |
| `install.args` | string[] | No | Additional install arguments |

### Common Configurations

#### Disable a Server

Disable ESLint server globally:

```json
{
  "disabled": ["eslint"]
}
```

Disable multiple servers:

```json
{
  "disabled": ["eslint", "biome", "deno"]
}
```

#### Disable a Server Conditionally

Disable via server config (keeps the server registered but inactive):

```json
{
  "servers": {
    "eslint": {
      "enabled": false
    }
  }
}
```

#### Custom Server Command

Use a different Python language server:

```json
{
  "servers": {
    "python": {
      "command": "pylsp",
      "args": [],
      "install": {
        "method": "pip",
        "package": "python-lsp-server"
      }
    }
  }
}
```

Use project-local TypeScript server:

```json
{
  "servers": {
    "typescript": {
      "command": "./node_modules/.bin/typescript-language-server",
      "args": ["--stdio"]
    }
  }
}
```

#### Add Custom Server

Add support for a language not included by default:

```json
{
  "servers": {
    "terraform": {
      "name": "Terraform Language Server",
      "command": "terraform-ls",
      "args": ["serve"],
      "transport": "stdio",
      "rootPatterns": ["*.tf", "terraform.tfstate"],
      "fileExtensions": [".tf", ".tfvars"],
      "languageId": "terraform",
      "install": {
        "method": "system",
        "package": "terraform-ls"
      }
    }
  }
}
```

#### Configure Server Settings

Pass settings to the TypeScript server:

```json
{
  "servers": {
    "typescript": {
      "settings": {
        "typescript.preferences.importModuleSpecifier": "relative",
        "typescript.format.semicolons": "insert"
      }
    }
  }
}
```

Configure Pyright settings:

```json
{
  "servers": {
    "python": {
      "initializationOptions": {
        "python.analysis.typeCheckingMode": "strict"
      }
    }
  }
}
```

#### Environment Variables

Set environment variables for a server:

```json
{
  "servers": {
    "rust": {
      "env": {
        "RUST_BACKTRACE": "1",
        "CARGO_TARGET_DIR": "/tmp/cargo-target"
      }
    }
  }
}
```

#### Adjust Performance

Reduce resource usage:

```json
{
  "maxConcurrentServers": 3,
  "requestTimeoutMs": 60000,
  "cache": {
    "maxSize": 50,
    "ttlSeconds": 600
  }
}
```

---

## LSP Tools

Vellum exposes LSP capabilities through the following tools:

| Tool | Description |
|------|-------------|
| `lsp_diagnostics` | Get errors and warnings for a file |
| `lsp_hover` | Get type info and documentation at a position |
| `lsp_definition` | Jump to symbol definition |
| `lsp_references` | Find all references to a symbol |
| `lsp_completion` | Get code completion suggestions |
| `lsp_code_actions` | Get available code actions (quick fixes) |
| `lsp_format` | Format a document or selection |
| `lsp_document_symbols` | Get outline of symbols in a file |
| `lsp_workspace_symbols` | Search for symbols across workspace |
| `lsp_incoming_calls` | Get functions that call a given function |
| `lsp_outgoing_calls` | Get functions called by a given function |

These tools are automatically available to the AI assistant when LSP servers are active.

---

## Troubleshooting

### Server Not Starting

**Symptoms:** LSP features not working, no diagnostics appearing.

**Diagnosis:**
1. Check if the server command exists:
   ```bash
   which typescript-language-server  # macOS/Linux
   where typescript-language-server  # Windows
   ```

2. Verify the server can start:
   ```bash
   typescript-language-server --stdio
   ```

**Solutions:**

| Issue | Solution |
|-------|----------|
| Command not found | Install the server manually or enable `autoInstall` |
| Server crashes on start | Check server logs, update to latest version |
| Wrong Node version | Some servers require specific Node.js versions |
| Permission denied | Check file permissions on the executable |

### Auto-Install Failed

**Symptoms:** "Installation failed" error, server still not available.

**Common causes:**

| Cause | Solution |
|-------|----------|
| No `npm` installed | Install Node.js and npm |
| Permission denied | Use `npm config set prefix ~/.npm-global` or run with proper permissions |
| Network issues | Check internet connection, proxy settings |
| Package not found | Verify package name is correct |
| Timeout | Increase timeout or install manually |

**Manual installation for system packages:**

```bash
# Go
go install golang.org/x/tools/gopls@latest

# Rust
rustup component add rust-analyzer

# Java (varies by OS)
brew install jdtls  # macOS
scoop install jdtls # Windows
```

### Performance Issues

**Symptoms:** Slow responses, high CPU usage, memory consumption.

**Solutions:**

1. **Reduce concurrent servers:**
   ```json
   { "maxConcurrentServers": 3 }
   ```

2. **Disable unused servers:**
   ```json
   { "disabled": ["eslint", "biome"] }
   ```

3. **Adjust cache settings:**
   ```json
   {
     "cache": {
       "maxSize": 50,
       "ttlSeconds": 600
     }
   }
   ```

4. **Check for conflicting servers:**
   - ESLint and Biome can conflict
   - TypeScript and Deno can conflict
   - Disable one if both are enabled

### Server Conflicts

**Problem:** Two servers handling the same files.

**Example:** Both TypeScript and Deno servers active for `.ts` files.

**Solution:** Disable one in project config:

```json
{
  "disabled": ["deno"]
}
```

Or disable TypeScript for Deno projects:

```json
{
  "disabled": ["typescript", "eslint"]
}
```

### Root Detection Issues

**Symptoms:** Server starts but doesn't find project configuration.

**Cause:** Working in a subdirectory, server can't find root config files.

**Solution:** Add custom root patterns:

```json
{
  "servers": {
    "typescript": {
      "rootPatterns": ["tsconfig.json", "jsconfig.json", "package.json", ".git"]
    }
  }
}
```

### Debug Mode

For detailed troubleshooting, enable debug logging:

```bash
DEBUG=vellum:lsp* vellum
```

This will show:
- Server startup/shutdown events
- LSP request/response details
- Installation progress
- Error details

---

## Examples

### Minimal TypeScript Project

No configuration needed. Just create a project with `tsconfig.json`.

### Python with Strict Type Checking

`.vellum/lsp.json`:
```json
{
  "servers": {
    "python": {
      "initializationOptions": {
        "python.analysis.typeCheckingMode": "strict",
        "python.analysis.autoImportCompletions": true
      }
    }
  }
}
```

### Monorepo with Multiple Languages

`.vellum/lsp.json`:
```json
{
  "maxConcurrentServers": 8,
  "disabled": ["biome"],
  "servers": {
    "typescript": {
      "rootPatterns": ["tsconfig.json", "package.json"]
    },
    "python": {
      "rootPatterns": ["pyproject.toml", "setup.py"]
    },
    "go": {
      "rootPatterns": ["go.mod", "go.work"]
    }
  }
}
```

### Deno Project

`.vellum/lsp.json`:
```json
{
  "disabled": ["typescript", "eslint"],
  "servers": {
    "deno": {
      "enabled": true,
      "initializationOptions": {
        "enable": true,
        "lint": true,
        "unstable": false
      }
    }
  }
}
```
