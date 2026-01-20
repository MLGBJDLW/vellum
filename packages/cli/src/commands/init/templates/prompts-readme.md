# Prompts Directory

Custom prompt files for Vellum. Place your `.md` files here to extend or override built-in prompts.

## Structure

```text
prompts/
├── roles/          # Role definitions (e.g., coder, architect)
├── providers/      # Provider-specific prompts
├── spec/           # Spec workflow phases
├── workers/        # Worker agent prompts
└── custom/         # Custom prompts
```

## File Format

Each prompt file uses YAML frontmatter:

```markdown
---
id: my-prompt
name: My Custom Prompt
category: custom
description: A brief description
version: "1.0.0"
---

Your prompt content here.

## Variables

Use `{{variable}}` syntax for interpolation:
- `{{os}}` - Operating system
- `{{shell}}` - Default shell
- `{{cwd}}` - Current directory
- `{{date}}` - Current date
- `{{mode}}` - Current coding mode
- `{{provider}}` - LLM provider
- `{{model}}` - Model name
```

## Priority

Prompts in this directory take precedence over:
1. User prompts (`~/.vellum/prompts/`)
2. Legacy paths (`.github/prompts/`, `.claude/prompts/`, etc.)
3. Built-in prompts

## Documentation

See [Vellum Prompts Documentation](https://vellum.dev/docs/prompts) for more details.
