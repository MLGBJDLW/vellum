# Commands Directory

Custom slash commands that extend Vellum's functionality.

## Structure

```
commands/
├── {command-name}.md    # Command definition
└── README.md
```

## File Format

```markdown
---
name: review
description: Request code review for current changes
category: tools
aliases:
  - cr
  - codereview
---

# /review Command

Review the current changes and provide feedback.

## Instructions

When this command is invoked:

1. Examine the current git diff
2. Look for potential issues:
   - Code style violations
   - Performance concerns
   - Security vulnerabilities
   - Missing error handling
3. Provide structured feedback

## Output Format

Format your review as:

### Summary
Brief overview of changes

### Issues Found
- [ ] Issue 1
- [ ] Issue 2

### Suggestions
Improvement recommendations
```

## Frontmatter Options

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Command name without slash (required) |
| `description` | string | Help text (required) |
| `category` | string | Grouping: system, auth, session, navigation, tools, config, debug |
| `aliases` | string[] | Alternative command names |
| `enabled` | boolean | Whether command is active |

## Usage

After creating a command file:

```bash
# Use the command
/review

# Or use an alias
/cr
```

## Documentation

See [Vellum Commands Documentation](https://vellum.dev/docs/commands) for more details.
