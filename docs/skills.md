# Skills System

> Extensible prompt injection system for specialized agent behaviors

## Overview

The Skills System enables Vellum to adapt its behavior based on context. Skills are modular prompt fragments that activate automatically when certain conditions are met, providing specialized knowledge, best practices, and rules for specific domains.

### Key Concepts

- **Skill**: A self-contained unit of specialized knowledge with activation triggers
- **SKILL.md**: The manifest file defining a skill's metadata, triggers, and content
- **Progressive Loading**: Skills load data incrementally (L1 → L2 → L3) to minimize token usage
- **Source Priority**: Skills from higher-priority sources override lower-priority ones

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Agent Loop                              │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ SkillLoader │→ │SkillMatcher │→ │   SkillManager      │  │
│  │   (L1→L3)   │  │  (Scoring)  │  │ (Prompt Injection)  │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## SKILL.md File Format

Each skill is defined by a `SKILL.md` file in its directory:

```
skills/
└── python-testing/
    ├── SKILL.md           # Required: manifest file
    ├── scripts/           # Optional: executable scripts
    ├── references/        # Optional: additional docs
    └── assets/            # Optional: templates, data
```

### Frontmatter (YAML)

```yaml
---
name: python-testing
description: Python testing best practices with pytest
version: "1.0.0"
author: "Your Name"
priority: 50

triggers:
  - type: keyword
    pattern: "pytest|test|unittest"
  - type: file_pattern
    pattern: "**/*_test.py"

dependencies:
  - python-core

compatibility:
  vellum: ">=1.0.0"
  tools:
    - read_file
    - write_file
  denyTools:
    - execute_command

tags:
  - testing
  - python
---
```

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Unique identifier (lowercase alphanumeric + hyphens, max 100 chars) |
| `description` | string | Brief description (max 2048 chars) |
| `triggers` | array | At least one trigger pattern |

### Optional Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `version` | string | - | Semver format (e.g., "1.0.0") |
| `author` | string | - | Skill author |
| `priority` | number | 50 | Activation priority (1-100, higher = more priority) |
| `dependencies` | string[] | [] | Other skills required first |
| `compatibility.vellum` | string | - | Minimum Vellum version (semver range) |
| `compatibility.tools` | string[] | - | Allowlist of tools to enable |
| `compatibility.denyTools` | string[] | - | Denylist of tools to disable |
| `tags` | string[] | [] | Categorization tags |

### Body Sections (Markdown)

After the YAML frontmatter, include these Markdown sections:

```markdown
## Rules

Mandatory instructions the agent must follow.
Injected with highest priority.

- Always use pytest fixtures
- Never use `unittest.mock` directly

## Patterns

Recommended patterns and best practices.
Injected after Rules.

- Use `conftest.py` for shared fixtures
- Group related tests in classes

## Anti-Patterns

Common mistakes to avoid.
Injected with high priority.

- Avoid hardcoded test data
- Don't test implementation details

## Examples

Code examples demonstrating proper usage.

```python
def test_example(client):
    response = client.get("/api/users")
    assert response.status_code == 200
```

## References

Links to external documentation.

- [Pytest Documentation](https://docs.pytest.org/)
- [Testing Best Practices](https://example.com/testing)
```

---

## Discovery Sources

Skills are discovered from multiple sources with priority-based override:

| Source | Path | Priority | Description |
|--------|------|----------|-------------|
| Workspace | `.vellum/skills/` | 100 | Project-specific skills |
| User | `~/.vellum/skills/` | 75 | User's global skills |
| Global | `.github/skills/` | 50 | Claude/GitHub compatible |
| Builtin | (internal) | 25 | Vellum's built-in skills |

### Override Behavior

When the same skill name exists in multiple sources:
- **Higher priority wins**: Workspace skill overrides User skill
- **No merging**: The entire skill is replaced, not merged
- **Source tracking**: Original source is recorded for debugging

### Mode-Specific Skills

Skills can be scoped to specific agent modes:

```
.vellum/
├── skills/           # General skills
│   └── typescript/
└── skills-code/      # Only active in "code" mode
    └── react/
```

Mode directories follow the pattern `skills-{mode}/`.

### Discovery Rules

- Directories starting with `.` or `_` are skipped
- Symbolic links are followed
- Invalid skills are logged and skipped
- Skills must have a valid `SKILL.md` file

---

## Trigger Types

Skills activate based on trigger patterns matched against context:

### keyword

Regex pattern matched against the user's request text.

```yaml
triggers:
  - type: keyword
    pattern: "test|pytest|unittest"
```

**Score Multiplier**: 10

### file_pattern

Glob pattern matched against files in context.

```yaml
triggers:
  - type: file_pattern
    pattern: "**/*.test.ts"
```

**Score Multiplier**: 5

### command

Exact match on slash commands.

```yaml
triggers:
  - type: command
    pattern: "/test"
```

**Score Multiplier**: 100 (highest priority)

### context

Key:value match on project context metadata.

```yaml
triggers:
  - type: context
    pattern: "framework:react"
```

**Score Multiplier**: 3

### always

Always activates (use sparingly).

```yaml
triggers:
  - type: always
```

**Score Multiplier**: 1 (lowest priority)

### Scoring Formula

```
score = skill.priority × trigger_type_multiplier
```

Skills are sorted by score descending. Higher scores activate first.

---

## Progressive Loading

Skills use three loading levels to optimize token usage:

### L1: Scan (~50-100 tokens)

Lightweight metadata loaded for all discovered skills:
- name, description, triggers, dependencies
- Used for trigger matching and skill listing

### L2: Load (~500-2000 tokens)

Full SKILL.md content loaded when skill activates:
- Complete frontmatter
- Parsed sections (Rules, Patterns, Anti-Patterns, Examples, References)
- Raw markdown content

### L3: Access (variable)

Resource metadata loaded on-demand:
- scripts/ directory contents
- references/ directory contents
- assets/ directory contents
- File sizes and paths (content loaded separately)

---

## CLI Commands

### List Skills

Display all discovered skills:

```bash
# Table format (default)
vellum skill list

# Filter by source
vellum skill list --source workspace

# JSON output
vellum skill list --format json

# Verbose with full descriptions
vellum skill list --verbose
```

**Output columns**: Name, Source, Version, Triggers

### Show Skill Details

Display detailed information about a skill:

```bash
# Basic info
vellum skill show python-testing

# Include full SKILL.md content
vellum skill show python-testing --content
```

### Create New Skill

Interactive skill creation:

```bash
vellum skill create my-skill
```

This will:
1. Prompt for location (workspace, user, or global)
2. Create directory structure
3. Generate SKILL.md from template
4. Create optional subdirectories (scripts/, references/)

### Validate Skills

Check skills for errors:

```bash
# Validate all discovered skills
vellum skill validate

# Validate single skill
vellum skill validate --skill python-testing

# Strict mode (warnings become errors)
vellum skill validate --strict
```

**Output**: ✓ Valid / ✗ Invalid for each skill

---

## Integration

### Agent Loop Integration

The skill system integrates with the agent loop:

1. **Discovery**: SkillLoader scans all source directories
2. **Matching**: SkillMatcher evaluates triggers against current context
3. **Injection**: SkillManager builds prompt sections from active skills

### Prompt Injection

Active skills inject content with priority ordering:

| Section | Priority | Content |
|---------|----------|---------|
| Rules | 100 | Mandatory instructions |
| Anti-Patterns | 90 | Mistakes to avoid |
| Patterns | 50 | Best practices |
| Examples | 40 | Code samples |
| References | 30 | External links |

### Tool Restrictions

Skills can restrict available tools:

```yaml
compatibility:
  tools:           # Allowlist: only these tools enabled
    - read_file
    - write_file
  denyTools:       # Denylist: these tools disabled
    - execute_command
```

When multiple skills are active:
- **Allowlist**: Intersection of all tool allowlists
- **Denylist**: Union of all tool denylists

### Permissions

Skill loading respects permission configuration:

```yaml
# In vellum.yaml
skills:
  defaultPermission: allow  # allow | ask | deny
  permissions:
    - pattern: "workspace/*"
      permission: allow
    - pattern: "untrusted-*"
      permission: deny
```

---

## Examples

### Basic Testing Skill

```yaml
---
name: jest-testing
description: Jest testing patterns for TypeScript projects
version: "1.0.0"
priority: 50

triggers:
  - type: keyword
    pattern: "jest|test|spec"
  - type: file_pattern
    pattern: "**/*.test.ts"

tags:
  - testing
  - typescript
---

## Rules

- Use `describe` blocks to group related tests
- Use meaningful test names that describe behavior
- Always clean up after async tests

## Patterns

- Use `beforeEach` for common setup
- Mock external dependencies
- Test edge cases and error conditions

## Anti-Patterns

- Don't test implementation details
- Avoid snapshot tests for dynamic content
- Never skip tests without documentation
```

### Framework-Specific Skill

```yaml
---
name: nextjs-app-router
description: Next.js App Router patterns and best practices
version: "1.0.0"
priority: 60

triggers:
  - type: context
    pattern: "framework:nextjs"
  - type: file_pattern
    pattern: "app/**/*.tsx"
  - type: keyword
    pattern: "server component|client component|app router"

dependencies:
  - react-core
  - typescript-core

compatibility:
  vellum: ">=1.0.0"
  tools:
    - read_file
    - write_file
    - list_directory

tags:
  - nextjs
  - react
  - typescript
---

## Rules

- Mark client components with 'use client' directive
- Keep server components as default
- Use server actions for mutations

## Patterns

- Co-locate loading.tsx and error.tsx with page.tsx
- Use route groups for layout organization
- Implement streaming with Suspense boundaries
```

### Claude-Compatible Aliases

For compatibility with Claude's skill format, you can use aliases:

```yaml
---
name: python-core
desc: Core Python development patterns  # alias for description
when:                                    # alias for triggers
  - type: file_pattern
    pattern: "**/*.py"
requires:                                # alias for dependencies
  - code-style
---
```

---

## Troubleshooting

### Skill Not Activating

1. **Check triggers**: Run `vellum skill show <name>` to verify trigger patterns
2. **Check priority**: Higher-priority sources may be overriding
3. **Check permissions**: Ensure skill is allowed in configuration
4. **Validate syntax**: Run `vellum skill validate --skill <name>`

### Duplicate Skills

When the same skill exists in multiple sources:
- Check source with `vellum skill list --verbose`
- Higher-priority source wins (workspace > user > global > builtin)
- Rename or remove conflicting skill

### Parse Errors

If a skill fails to parse:
- Validate YAML syntax in frontmatter
- Ensure required fields (name, description, triggers) are present
- Check trigger patterns are non-empty (except for `always` type)
- Run `vellum skill validate --skill <name> --strict`

---

## API Reference

### SkillLoader

```typescript
import { SkillLoader } from '@vellum/core';

const loader = new SkillLoader({
  sources: ['workspace', 'user', 'global', 'builtin'],
  workspacePath: '/path/to/project',
});

await loader.initialize();

// L1: Get all skill metadata
const skills = await loader.getAllScans();

// L2: Load full skill content
const skill = await loader.loadL2('python-testing');

// L3: Access skill resources
const accessed = await loader.accessL3('python-testing');
```

### SkillMatcher

```typescript
import { SkillMatcher } from '@vellum/core';

const matcher = new SkillMatcher();

const matches = matcher.matchAll(skills, {
  request: 'Write a pytest test',
  files: ['test_example.py'],
  command: null,
  projectContext: { framework: 'pytest' },
});

// Returns SkillMatch[] sorted by score
```

### SkillManager

```typescript
import { SkillManager } from '@vellum/core';

const manager = new SkillManager({ loader, matcher, config });

await manager.initialize();

// Get active skills for context
const active = await manager.getActiveSkills(context);

// Build prompt sections
const sections = manager.buildPromptSections(active);

// Get tool restrictions
const restrictions = manager.getToolRestrictions(active);
```
