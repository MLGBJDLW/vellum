# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Context Compaction System** — LLM-powered 6-section summarization for context management
- **Multi-Model Fallback Chain** — Resilient summarization with automatic failover between models
- **DeepSeek Reasoning Block Support** — Synthetic `<thinking>` blocks for CoT models
- **Protected Tools Configuration** — Prevent pruning of critical tool outputs
- **Profile-Specific Compaction Thresholds** — `autoCondensePercent` for conservative/balanced/aggressive profiles
- **Token Counting Accuracy** — Integration with js-tiktoken for precise token counts
- **ContextGrowthValidator** — Prevents compression from increasing context size
- **CompactionError** — Typed errors with codes for compaction failures

### Changed

- `AutoContextManager` now tracks compaction count and emits warnings on repeated compressions
- Summary messages use structured 6-section format for better context preservation

### Fixed

- Tool pairs (tool_use/tool_result) now stay together during compression
- Image token calculation accuracy improved for all providers

## [0.1.0] - 2025-01-22

### Added

#### Core Architecture
- **Agent Loop** — Event-driven agent execution with streaming support
- **Multi-Agent Orchestration** — Task delegation, worker pools, and session management
- **Context Management** — Token-aware context window with automatic summarization
- **Error Recovery** — Graceful error handling with retry mechanisms

#### LLM Providers (17 providers)
- **Major Providers**: Anthropic (Claude), OpenAI (GPT), Google (Gemini)
- **Cloud Providers**: Groq, DeepSeek, Mistral, OpenRouter, xAI
- **China Providers**: Qwen, Yi, Zhipu, Baichuan, Moonshot, MiniMax
- **GitHub**: Copilot integration
- **Local**: Ollama, LMStudio support

#### Coding Modes
- **Vibe Mode** — Full-auto execution with no approval required
- **Plan Mode** — Semi-auto with plan approval before execution
- **Spec Mode** — Guided 6-phase workflow with checkpoints

#### Tool System
- **Built-in Tools**: File operations, Git, web browsing, code execution
- **Permission System**: Fine-grained tool access control
- **Sandbox Execution**: Secure code execution environment

#### MCP Integration
- **Dynamic MCP System** — Tool filtering and trust mode support
- **Server Management** — Start, stop, and configure MCP servers
- **Tool Discovery** — Automatic tool registration from MCP servers

#### Skills System
- **Skill Discovery** — Automatic skill loading from multiple sources
- **Skill Matching** — Context-aware skill activation
- **Plugin Skills** — Skills provided by plugins

#### Custom Agents
- **Agent Definition** — YAML/Markdown agent configuration
- **Agent Inheritance** — Extend and customize agent behaviors
- **Agent Routing** — Automatic agent selection based on context

#### Plugin System
- **Plugin Loader** — Load plugins from multiple directories
- **Plugin Trust** — Trust verification for plugin code
- **Plugin Hooks** — Lifecycle hooks for plugin integration

#### CLI & TUI
- **Interactive TUI** — Terminal UI with React/Ink
- **Command System** — Slash commands and user-defined commands
- **LSP Integration** — 26-language code intelligence
- **i18n Support** — English and Chinese localization

#### Session Management
- **Session Persistence** — Save and restore conversation sessions
- **Git Snapshots** — Automatic code state snapshots
- **Memory System** — Project-level memory storage

#### Security & Credentials
- **Keychain Storage** — System keychain for API keys
- **Credential Migration** — Migrate from environment variables
- **Path Trust** — Trusted path verification

#### Observability
- **Logging** — Structured logging with multiple transports
- **Telemetry** — Usage metrics and performance tracking
- **Cost Tracking** — Token usage and cost estimation
- **Rate Limiting** — API rate limit handling

### Internal

- Monorepo structure with pnpm workspaces
- TypeScript 5.x with strict mode
- Zod v4 for schema validation
- React 19 with Ink 6 for TUI
- Biome for linting and formatting
- Vitest for testing

---

[0.1.0]: https://github.com/nicepkg/vellum/releases/tag/v0.1.0
