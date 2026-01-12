# Rules Directory

Global rules that apply to all Vellum sessions. Rules are always included in the system prompt.

## Structure

```
rules/
├── *.md               # Global rules (all modes)
└── rules-{mode}/      # Mode-specific rules
    └── *.md
```

## Mode-Specific Rules

Create subdirectories for mode-specific rules:

```
rules/
├── coding-standards.md       # All modes
├── rules-vibe/
│   └── fast-iteration.md     # Vibe mode only
├── rules-plan/
│   └── documentation.md      # Plan mode only
└── rules-spec/
    └── formal-review.md      # Spec mode only
```

## File Format

Rules use simple markdown:

```markdown
---
id: no-console-log
name: No Console Logs
priority: 100
enabled: true
---

## Rule: No Console Logs in Production

Never leave `console.log()` statements in production code.

### Instead

- Use a logging library like `pino` or `winston`
- Remove debug logs before committing
- Use conditional logging for development
```

## Frontmatter Options

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (required) |
| `name` | string | Display name |
| `priority` | number | Load order (lower = first) |
| `enabled` | boolean | Whether rule is active |

## Documentation

See [Vellum Rules Documentation](https://vellum.dev/docs/rules) for more details.
