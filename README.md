# Vellum

Your personal AI assistant for the terminal. Vellum helps with research, writing,
analysis, organization, and software work through one adaptive `orch` entry point.

## Get started

Requires Node.js 22.22.1+ or 24.11.0+.

```bash
npm install -g @butlerw/vellum
vellum
```

Choose a model with `/model`. Vellum checks environment variables and local
credential storage. If a cloud provider has no key, a masked input form opens;
the model changes only after the key is saved. You can also configure a key with
`/auth set <provider>` or `vellum credentials add <provider>`. Local Ollama and
LM Studio do not require a cloud API key. A stored key is not proof of provider
access: account permissions, endpoint availability, and model access still apply.

Describe the result you need in ordinary language:

- “Compare these research notes and write a concise brief.”
- “Organize the files in this workspace and explain your changes.”
- “Plan and implement the next step, then check the result.”

For a non-interactive task:

```bash
vellum run "Summarize the Markdown files in this directory"
vellum run --provider openai "Find and fix the failing test"
```

## One assistant, adaptive work

`orch` chooses direct execution, planning, a specification, or specialist
delegation as needed. It reuses the same agent loop, tools, permissions, context
management, and session history. Verification failures return to the task for
repair. Simple questions do not require a plan or a delegate.

The default approval policy is `auto-edit`, with a `workspace-write` sandbox.
Use explicit `--approval` and `--sandbox` options to change them. Delegates inherit
the parent tool permission checker. Cancellation, repeated-action detection,
concurrency controls, and explicit resource budgets remain active.

Legacy `vibe`, `plan`, and `spec` overrides are retained for existing workflows;
new sessions and onboarding use `orch`. Use `/orch` or Alt+0 to return to it.
See [workflow and migration details](docs/modes.md).

## Providers

Vellum includes adapters for Anthropic, OpenAI, Google, DeepSeek, Groq, xAI, Qwen,
OpenRouter, Mistral, Moonshot, Zhipu, MiniMax, Doubao, Yi, Baichuan, Ollama, and
LM Studio. Model defaults and capabilities come from one shared catalog.

See the [provider audit](docs/research/provider-model-audit.md) for exact models,
official sources, retired-model removals, protocol adaptations, and vendors whose
public catalogs could not be verified. Unknown pricing is not treated as free.
Local and aggregator availability depends on the configured endpoint.

## Capabilities

- Streaming terminal interface with scrollable history and a task sidebar
- Specialist agents and cancellation-aware delegation
- Skills, custom prompts, and local memory
- MCP tools and optional language-server tools for software work
- Environment, system keychain, and encrypted-file credential storage
- Persistent sessions with context management
- English and Chinese interface text

## Documentation

- [Getting started](docs/getting-started.md)
- [Credentials](docs/credentials.md)
- [Configuration](docs/configuration.md)
- [Workflows](docs/modes.md)
- [Skills](docs/skills.md) and [custom agents](docs/custom-agents.md)
- [MCP](docs/mcp.md), [LSP](docs/lsp.md), and [terminal UI](docs/tui.md)
- [Harness source comparison](docs/research/agent-harness.md)

## Development

```bash
git clone https://github.com/MLGBJDLW/vellum.git
cd vellum
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm lint
pnpm test:run
```

The monorepo keeps CLI/UI in `packages/cli`, runtime in `packages/core`, model
adapters in `packages/provider`, and shared integrations in the other workspace
packages. See [Contributing](CONTRIBUTING.md) for standards and changesets.

[MIT](LICENSE)
