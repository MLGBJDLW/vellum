# Skills Directory

Skills are reusable prompt modules with specialized knowledge. They can be activated on-demand or automatically based on context.

## Structure

```text
skills/
├── {skill-name}/
│   ├── SKILL.md           # Main skill definition (required)
│   ├── scripts/           # Helper scripts (optional)
│   ├── references/        # Reference documents (optional)
│   └── assets/            # Additional assets (optional)
└── README.md
```

## SKILL.md Format

```markdown
---
name: typescript-testing
description: Expert knowledge for testing TypeScript applications
version: "1.0.0"
triggers:
  - "test"
  - "testing"
  - "vitest"
  - "jest"
tags:
  - typescript
  - testing
  - vitest
---

# TypeScript Testing Skill

## Overview

This skill provides expert guidance for testing TypeScript applications.

## Best Practices

1. Use `vitest` for unit tests
2. Follow the AAA pattern (Arrange, Act, Assert)
3. Mock external dependencies

## Examples

### Basic Test

\`\`\`typescript
import { describe, it, expect } from 'vitest';

describe('MyFunction', () => {
  it('should return expected value', () => {
    const result = myFunction();
    expect(result).toBe(expected);
  });
});
\`\`\`
```

## Frontmatter Options

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Skill identifier (required) |
| `description` | string | Brief description (required) |
| `version` | string | Semantic version |
| `triggers` | string[] | Keywords that activate this skill |
| `tags` | string[] | Categorization tags |
| `priority` | number | Load order when multiple skills match |

## Activation

Skills can be:
- **Auto-activated**: When trigger keywords are detected
- **Manual**: Via `/skill {name}` command
- **Context-aware**: Based on file types or project structure

## Documentation

See [Vellum Skills Documentation](https://vellum.dev/docs/skills) for more details.
