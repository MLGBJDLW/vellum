# Changeset Template

When creating a changeset for `@butlerw/vellum`, use this format:

## File Location
`.changeset/[descriptive-name].md`

## Format
```markdown
---
"@butlerw/vellum": patch | minor | major
---

### type(scope)
- Description of change

### type(scope)
- Another change
```

## Version Levels
| Level | When to Use |
|-------|-------------|
| `patch` | Bug fixes, cleanup, refactoring, docs |
| `minor` | New features (backward compatible) |
| `major` | Breaking changes |

## Conventional Commit Types
| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `chore` | Maintenance, cleanup |
| `refactor` | Code restructuring |
| `docs` | Documentation |
| `perf` | Performance improvement |
| `test` | Test changes |

## Example
```markdown
---
"@butlerw/vellum": minor
---

### feat(tui)
- Added new StatusBar component with mode indicator

### fix(provider)
- Fixed rate limit retry logic for Anthropic provider
```
