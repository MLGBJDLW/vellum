# Getting started

Install Node.js 22.22.1+ or 24.11.0+, then install Vellum:

```bash
npm install -g @butlerw/vellum
vellum
```

In the terminal interface, use `/model` to choose a provider and model. Vellum
checks local credential sources and opens a masked API-key form when needed.
You can configure credentials directly with `/auth set <provider>` or:

```bash
vellum credentials add anthropic
vellum credentials list
```

Existing provider environment variables are supported, including aliases such
as `DASHSCOPE_API_KEY`, `ZAI_API_KEY`, and `ARK_API_KEY`. Ollama and LM Studio
can use local endpoints without cloud credentials. Never paste a secret into a
normal chat message or an unmasked command argument.

Vellum starts as your `orch` personal assistant. Describe your objective and
constraints: research, writing, file organization, analysis, and coding all use
the same entry point. It chooses when to plan, delegate, execute, and verify.

```bash
# Run a task without the interactive interface
vellum run "Summarize the project documents"

# Choose a provider; its current catalog default is selected
vellum chat --provider openai

# Choose an exact model ID
vellum chat --provider anthropic --model claude-opus-4-7
```

Useful interactive commands:

| Command | Purpose |
| --- | --- |
| `/model` | Choose a provider/model and configure a missing key |
| `/auth status` | Inspect credential status without revealing secrets |
| `/auth set <provider>` | Open masked credential input |
| `/orch` | Return to the personal assistant |
| `/mode` | Inspect the workflow and compatibility overrides |
| `/help` | Show available commands |
| `/clear` | Clear the current conversation view |

Use Esc or Ctrl+C to interrupt work. Tool approval and sandbox settings remain
under your control; see [workflows](modes.md), [credentials](credentials.md), and
[configuration](configuration.md) for details.
