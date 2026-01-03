# 🌀 Vellum

> Next-generation AI coding agent

## Quick Start

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Start CLI
pnpm dev
```

## Project Structure

```
packages/
├── core/      # Agent engine
├── cli/       # CLI interface
├── provider/  # LLM providers
├── tool/      # Tool system
├── mcp/       # MCP integration
├── plugin/    # Plugin system
└── shared/    # Shared types
```

## Coding Modes

Vellum supports three coding modes that control agent behavior and autonomy:

| Mode | Description | Checkpoints |
|------|-------------|-------------|
| ⚡ **vibe** | Fast autonomous coding, full tool access | 0 |
| 📋 **plan** | Plan-then-execute with review checkpoint | 1 |
| 📐 **spec** | 6-phase structured workflow | 6 |

```bash
# Set mode via CLI flag
pnpm dev --mode=vibe "quick task"
pnpm dev --mode=plan "complex task"
pnpm dev --mode=spec "large feature"

# Switch modes during session
/mode plan
/vibe
/spec

# Keyboard shortcuts: Ctrl+1/2/3
```

See [docs/modes.md](docs/modes.md) for comprehensive documentation.

## Skills System

Vellum supports an extensible skills system for specialized agent behaviors. Skills are modular prompt fragments that activate based on context (keywords, file patterns, commands).

```bash
# List available skills
pnpm dev skill list

# Show skill details
pnpm dev skill show python-testing

# Create a new skill
pnpm dev skill create my-skill

# Validate skills
pnpm dev skill validate
```

See [docs/skills.md](docs/skills.md) for comprehensive documentation.

## Custom Agents

Create specialized AI agents with custom behaviors, restrictions, and activation triggers:

```bash
# Create a new agent
/custom-agents create my-agent

# Create from template
/custom-agents create my-agent --template=advanced

# List all agents
/custom-agents list

# Validate agents
/custom-agents validate
```

Built-in templates:
- **frontend** - React, Vue, CSS development
- **backend** - APIs, databases, server logic
- **security** - Security reviews and audits
- **docs** - Technical documentation
- **qa** - Testing and quality assurance
- **devops** - CI/CD, Docker, Kubernetes

See [docs/custom-agents.md](docs/custom-agents.md) for comprehensive documentation.

## Spec Workflow

The `spec` mode provides a 6-phase structured workflow for complex features:

```bash
# Start spec workflow
pnpm dev --mode=spec "implement user authentication"

# Resume from checkpoint
pnpm dev spec resume my-feature

# Show workflow status
pnpm dev spec status my-feature
```

**Phases:** Research → Requirements → Design → Tasks → Implementation → Validation

Each phase has a dedicated agent and checkpoint for user approval. See [docs/spec-workflow.md](docs/spec-workflow.md) for full documentation.

## Development

```bash
# Run tests
pnpm test

# Lint code
pnpm lint

# Format code
pnpm format

# Type check
pnpm typecheck
```

## License

MIT
