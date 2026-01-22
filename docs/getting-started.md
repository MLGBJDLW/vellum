# Getting Started

Quick guide to installing and using Vellum.

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| **Node.js** | 20+ | Required for npm/pnpm installation |
| **Bun** | 1.1+ | Alternative runtime (optional) |

## Installation

### Using pnpm (recommended)

```bash
pnpm add -g @butlerw/vellum
```

### Using npm

```bash
npm install -g @butlerw/vellum
```

### Using Bun

```bash
bun add -g @butlerw/vellum
```

## First Run

### 1. Configure API credentials

```bash
# Add your API key
vellum credentials add anthropic

# Or set via environment variable
export ANTHROPIC_API_KEY=sk-...
```

### 2. Start Vellum

```bash
vellum
```

### 3. Start coding

Once in the TUI, type your request and press Enter:

```text
> Add input validation to the login form
```

## Basic Usage

### Command Line

```bash
# Start with a prompt
vellum "fix the bug in auth.ts"

# Use a specific mode
vellum --mode=plan "refactor the API layer"

# Continue a previous session
vellum --resume
```

### Interactive Commands

Inside the TUI, use slash commands:

| Command | Description |
|---------|-------------|
| `/mode vibe` | Switch to vibe mode |
| `/mode plan` | Switch to plan mode |
| `/mode spec` | Switch to spec mode |
| `/clear` | Clear conversation |
| `/help` | Show all commands |

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt+1` | Switch to vibe mode |
| `Alt+2` | Switch to plan mode |
| `Alt+3` | Switch to spec mode |
| `Ctrl+C` | Cancel current operation |
| `Esc` | Exit or cancel |

## Quick Mode Overview

| Mode | Best For | Approval Level |
|------|----------|----------------|
| **⚡ vibe** | Quick fixes, trusted tasks | Full-auto |
| **📋 plan** | Complex tasks with review | Auto-edit |
| **📐 spec** | Large features, documentation | Suggest |

Choose your mode based on task complexity and desired oversight level.

## Examples

### Quick Fix (Vibe Mode)

```bash
vellum --mode=vibe "fix the typo in README"
```

### Feature with Plan (Plan Mode)

```bash
vellum --mode=plan "add caching to the API endpoints"
```

### Large Feature (Spec Mode)

```bash
vellum --mode=spec "implement user authentication"
```

## Next Steps

- [Configuration](configuration.md) - Customize Vellum behavior
- [Modes](modes.md) - Detailed mode documentation
- [Credentials](credentials.md) - Secure credential management
- [MCP](mcp.md) - Connect external tools via MCP
