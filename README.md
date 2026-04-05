<div align="center">

<pre>
██╗   ██╗███████╗██╗     ██╗     ██╗   ██╗███╗   ███╗
██║   ██║██╔════╝██║     ██║     ██║   ██║████╗ ████║
██║   ██║█████╗  ██║     ██║     ██║   ██║██╔████╔██║
╚██╗ ██╔╝██╔══╝  ██║     ██║     ██║   ██║██║╚██╔╝██║
 ╚████╔╝ ███████╗███████╗███████╗╚██████╔╝██║ ╚═╝ ██║
  ╚═══╝  ╚══════╝╚══════╝╚══════╝ ╚═════╝ ╚═╝     ╚═╝
</pre>

<h3>Next-generation AI coding assistant for the terminal</h3>

*Write code with AI — powered by 17+ LLM providers, intelligent LSP, and extensible skills*

</div>

<p align="center">

[![npm version](https://img.shields.io/npm/v/@butlerw/vellum?style=for-the-badge&logo=npm&color=CB3837)](https://www.npmjs.com/package/@butlerw/vellum) [![License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)](LICENSE) [![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/) [![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=for-the-badge)](CONTRIBUTING.md)

</p>

<p align="center">

[Getting Started](#-quick-start) | [Features](#-features) | [Modes](#-coding-modes) | [Documentation](docs/) | [Contributing](CONTRIBUTING.md)

</p>

---

## ✨ Features

- **17 LLM Providers** — Anthropic, OpenAI, Google, and 14 more
- **26-Language LSP** — Intelligent code analysis across languages
- **3 Coding Modes** — vibe, plan, spec for different workflows
- **MCP Protocol** — Model Context Protocol integration
- **Skills System** — Extensible domain-specific knowledge
- **Custom Agents** — Define your own AI personas
- **Secure Credentials** — System keychain storage
- **i18n Support** — English and Chinese (中文)

## 📦 Installation

```bash
# npm
npm install -g @butlerw/vellum

# pnpm
pnpm add -g @butlerw/vellum

# bun
bun add -g @butlerw/vellum
```

## 🚀 Quick Start

```bash
# Start interactive session
vellum

# Quick task (vibe mode)
vellum "fix the type error in src/index.ts"

# Plan mode for complex tasks
vellum plan "add user authentication"

# Spec mode for large features
vellum spec "redesign the payment system"
```

## 🎯 Coding Modes

| Mode | Style | Approval | Use Case |
|------|-------|----------|----------|
| ⚡ **vibe** | Full-auto | None | Quick fixes, trusted tasks |
| 📋 **plan** | Semi-auto | Plan approval | Complex tasks |
| 📐 **spec** | Guided | 6 checkpoints | Large features |

Switch modes anytime with `/vibe`, `/plan`, or `/spec`.

## 🤖 Supported Providers

| Category | Providers |
|----------|-----------|
| **Major** | Anthropic (Claude), OpenAI (GPT), Google (Gemini) |
| **Cloud** | Groq, DeepSeek, Mistral, OpenRouter, xAI |
| **China** | Qwen, Yi, Zhipu, Baichuan, Moonshot, MiniMax |
| **Local** | Ollama, LMStudio |

Configure your provider:

```bash
vellum config set provider anthropic
vellum config set api-key YOUR_API_KEY
```

## 🔧 Key Features

### Skills System

Extend Vellum with domain-specific knowledge:

```markdown
~/.vellum/skills/
├── backend-development/
├── frontend-design/
└── code-refactoring/
```

See [Skills Documentation](docs/skills.md)

### Custom Agents

Create specialized AI personas:

```markdown
~/.vellum/agents/
├── code-reviewer.md
├── architect.md
└── debugger.md
```

See [Custom Agents Guide](docs/custom-agents.md)

### MCP Integration

Connect external tools via Model Context Protocol:

```json
{
  "mcpServers": {
    "filesystem": { "command": "npx", "args": ["-y", "@anthropic/mcp-server-filesystem"] }
  }
}
```

See [MCP Configuration](docs/mcp.md)

## 📚 Documentation

| Topic | Description |
|-------|-------------|
| [Getting Started](docs/getting-started.md) | First steps with Vellum |
| [Configuration](docs/configuration.md) | Settings and customization |
| [Credentials](docs/credentials.md) | API key management |
| [Modes](docs/modes.md) | vibe, plan, spec workflows |
| [Skills](docs/skills.md) | Extending with skills |
| [Custom Agents](docs/custom-agents.md) | Creating AI personas |
| [MCP](docs/mcp.md) | Model Context Protocol |
| [LSP](docs/lsp.md) | Language server support |
| [TUI](docs/tui.md) | Terminal interface |
| [Session System](docs/session-system.md) | Managing sessions |

## 🛠️ Development

```bash
# Clone
git clone https://github.com/nicepkg/vellum.git
cd vellum

# Install dependencies
pnpm install

# Development mode
pnpm dev

# Build
pnpm build

# Test
pnpm test

# Lint
pnpm lint
```

### Project Structure

```markdown
packages/
├── cli/       # CLI entry point
├── core/      # Agent loop, orchestration
├── provider/  # LLM provider adapters
├── tools/     # Built-in tools
├── lsp/       # Language server client
├── mcp/       # MCP integration
└── shared/    # Shared utilities
```

## 📄 License

[MIT](LICENSE) © 2025-present
