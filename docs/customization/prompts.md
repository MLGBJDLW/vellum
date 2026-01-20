# Prompt Customization

> Customize Vellum's behavior through externalized prompts, rules, and commands

## Overview

Vellum externalizes its AI prompts into Markdown files that you can customize. This enables:

- **Role customization**: Modify how the agent behaves in different roles
- **Project rules**: Add project-specific coding standards and guidelines
- **Custom commands**: Create your own slash commands
- **Workflows**: Define multi-step procedures the agent can follow

## Directory Structure

### Project-Level (`.vellum/`)

Create a `.vellum/` directory in your project root:

```text
.vellum/
├── prompts/                      # Prompt overrides
│   ├── roles/                    # Override role prompts
│   │   └── coder.md              # Custom coder behavior
│   ├── workers/                  # Override worker prompts
│   └── spec/                     # Override spec prompts
├── rules/                        # Global rules (always loaded)
│   └── code-style.md
├── rules-vibe/                   # Vibe-mode rules only
├── rules-plan/                   # Plan-mode rules only
├── rules-spec/                   # Spec-mode rules only
├── skills/                       # Project-level skills
│   └── my-skill/
│       └── SKILL.md
├── commands/                     # Custom slash commands
│   └── review.md                 # /review command
└── workflows/                    # Workflow instructions
    └── deploy.md                 # /workflow deploy
```

### User Global (`~/.vellum/`)

Global customizations apply to all projects:

```text
~/.vellum/
├── prompts/                      # Global prompt overrides
├── rules/                        # Global rules
├── skills/                       # Global skills
├── commands/                     # Global custom commands
└── config.yaml                   # Global configuration
```

---

## Priority Order

Prompts are discovered from multiple sources with priority-based override:

| Priority | Source | Path | Description |
|----------|--------|------|-------------|
| 100 | Project | `.vellum/` | Project-specific customizations |
| 90 | GitHub | `.github/` | GitHub-style skills |
| 80 | Claude | `.claude/` | Claude Code compatibility |
| 70 | Roo | `.roo/` | Roo Code compatibility |
| 60 | Kilocode | `.kilocode/` | Kilocode compatibility |
| 50 | User Global | `~/.vellum/` | User-wide defaults |
| 10 | Built-in | (bundled) | Vellum defaults |

**Higher priority overrides lower priority.** If you define `.vellum/prompts/roles/coder.md`, it completely replaces the built-in coder prompt.

---

## Frontmatter Format

Prompt files use YAML frontmatter followed by Markdown content:

```markdown
---
name: coder
description: "Custom coder role with project-specific guidelines"
version: "1.0.0"
priority: 50
extends: base
mode: vibe
---

# Coder Instructions

Your custom instructions here...
```markdown

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Unique identifier (lowercase alphanumeric + hyphens, max 64 chars) |

### Optional Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `description` | string | - | Brief description (max 500 chars) |
| `version` | string | `1.0.0` | Semantic version |
| `priority` | number | 50 | Override priority (0-100) |
| `extends` | string | - | Base prompt to inherit from |
| `mode` | string | - | Mode this prompt applies to (`vibe`, `plan`, `spec`) |
| `modes` | string[] | - | Multiple modes this prompt applies to |
| `level` | number | - | Agent level (0=orchestrator, 1=workflow, 2=worker) |
| `role` | string | - | Agent role (`orchestrator`, `coder`, `qa`, `writer`, `analyst`, `architect`) |
| `tags` | string[] | - | Categorization tags |

### Triggers (Optional)

For skills and rules that should activate conditionally:

```yaml
triggers:
  - type: keyword
    pattern: "pytest|test|unittest"
  - type: file_pattern
    pattern: "**/*_test.py"
  - type: mode
    pattern: "vibe"
  - type: always
    pattern: "*"
```text

---

## Built-in Variables

Vellum provides 7 variables that are automatically interpolated in your prompts:

| Variable | Description | Example Value |
|----------|-------------|---------------|
| `{{workspace}}` | Absolute path to workspace | `/home/user/my-project` |
| `{{mode}}` | Current coding mode | `vibe`, `plan`, `spec` |
| `{{language}}` | UI language code | `en`, `zh` |
| `{{shell}}` | Shell type | `pwsh`, `bash`, `zsh` |
| `{{os}}` | Operating system | `Windows`, `macOS`, `Linux` |
| `{{date}}` | Current date | `2026-01-10` |
| `{{username}}` | Current user | `john` |

### Example Usage

```markdown
---
name: project-setup
description: "Project setup instructions"
---

# Project Setup

You are working in {{workspace}} on {{os}}.

Today is {{date}}.

When running commands, use {{shell}} syntax.
The user's language preference is {{language}}.

Current mode: {{mode}}
```text

---

## Creating Custom Commands

Custom commands extend Vellum with project-specific slash commands.

### Location

Place command files in:
- `.vellum/commands/` (project-level)
- `~/.vellum/commands/` (global)

### Format

```markdown
---
name: review
description: "Run code review checklist"
aliases:
  - cr
  - codereview
---

# Code Review Command

When the user runs /review, perform the following:

1. Check for obvious bugs and logic errors
2. Verify error handling is complete
3. Review naming conventions
4. Check for code duplication
5. Verify tests exist for new functionality

## Checklist Output

Present findings as:

- ✅ Passing checks
- ⚠️ Warnings  
- ❌ Issues requiring attention
```markdown

### Using Custom Commands

```bash
# In Vellum TUI
/review                    # Run the review command
/review src/api.ts         # Review specific file
```text

---

## Creating Workflows

Workflows define multi-step procedures for complex tasks.

### Location

Place workflow files in:
- `.vellum/workflows/` (project-level)
- `~/.vellum/workflows/` (global)

### Format

```markdown
---
name: deploy
description: "Production deployment workflow"
steps:
  - name: test
    required: true
  - name: build
    required: true
  - name: deploy
    required: true
---

# Deployment Workflow

## Step 1: Test

Run the full test suite:

```bash
pnpm test --run
```text

Verify all tests pass before proceeding.

## Step 2: Build

Create production build:

```bash
pnpm build
```text

Verify build completes without errors.

## Step 3: Deploy

Deploy to production:

```bash
./scripts/deploy.sh production
```text

Monitor deployment logs for any errors.

## Rollback

If deployment fails:

```bash
./scripts/rollback.sh
```text
```

### Running Workflows

```bash
# In Vellum TUI
/workflow deploy           # Start deployment workflow
/workflow deploy --step 2  # Resume from step 2
```text

---

## Rules

Rules are always-on instructions that guide agent behavior.

### Global Rules

Loaded for all modes. Place in `.vellum/rules/`:

```markdown
---
name: code-style
description: "Project coding standards"
---

# Code Style Rules

- Use TypeScript strict mode
- Prefer functional patterns over classes
- Use named exports, never default exports
- Maximum line length: 100 characters
```markdown

### Mode-Specific Rules

Loaded only for specific modes:

| Directory | Mode |
|-----------|------|
| `.vellum/rules-vibe/` | Vibe mode |
| `.vellum/rules-plan/` | Plan mode |
| `.vellum/rules-spec/` | Spec mode |

---

## Quick Start

### Initialize Structure

```bash
# Create .vellum/ directory structure
vellum init prompts

# Or with --force to overwrite existing
vellum init prompts --force
```text

This creates the directory structure with example files.

### Validate Prompts

```bash
# Check all prompts for errors
vellum prompt validate

# Auto-fix simple issues
vellum prompt validate --fix
```markdown

### Migrate from Other Tools

```bash
# Migrate from .github/skills/ to .vellum/skills/
vellum migrate prompts

# Preview changes without applying
vellum migrate prompts --dry-run
```text

---

## Examples

### Override Coder Behavior

Create `.vellum/prompts/roles/coder.md`:

```markdown
---
name: coder
description: "Custom coder with strict TypeScript rules"
extends: base
---

# Coder Role

You are an expert TypeScript developer.

## Strict Rules

1. NEVER use `any` type
2. ALWAYS use explicit return types
3. PREFER `readonly` properties
4. USE zod for runtime validation

## Code Style

- Use functional components with hooks
- Prefer composition over inheritance
- Keep functions under 50 lines
```markdown

### Add Project Rules

Create `.vellum/rules/api-guidelines.md`:

```markdown
---
name: api-guidelines
description: "REST API design guidelines"
---

# API Guidelines

When working with API endpoints:

1. Use RESTful naming conventions
2. Always include proper error responses
3. Document with OpenAPI/Swagger
4. Validate all inputs with zod schemas
5. Use consistent response format:

```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}
```text
```

### Create Testing Command

Create `.vellum/commands/test-coverage.md`:

```markdown
---
name: test-coverage
description: "Run tests with coverage report"
aliases: [tc, coverage]
---

# Test Coverage Command

When /test-coverage is invoked:

1. Run: `pnpm test --run --coverage`
2. Parse the coverage report
3. Highlight files below 80% coverage
4. Suggest tests for uncovered lines
```

---

## Hot Reload

Vellum automatically detects changes to prompt files and reloads them:

- **No restart required**: Edit files while Vellum is running
- **Debounced updates**: Changes are batched (100ms) to handle rapid edits
- **Next turn activation**: Updated prompts apply on the next message

---

## Troubleshooting

### Prompt Not Loading

1. **Check file location**: Ensure file is in correct directory
2. **Validate syntax**: Run `vellum prompt validate`
3. **Check priority**: Higher priority sources override lower ones
4. **Verify name**: File name should match `name` field in frontmatter

### Variables Not Interpolating

1. **Use double braces**: `{{variable}}` not `{variable}`
2. **Check variable name**: Must be one of the 7 built-in variables
3. **Verify no typos**: Variables are case-sensitive

### Command Not Found

1. **Check location**: Commands must be in `commands/` directory
2. **Verify frontmatter**: Must have `name` field
3. **Try aliases**: Check if command has aliases defined

---

## Reference

- [Skills System](../skills.md) - Detailed skills documentation
- [Custom Agents](../custom-agents.md) - Creating custom agent roles
- [Configuration](../configuration.md) - Global configuration options
- [Skills Migration](../migration/skills-migration.md) - Migrate from .github/skills/
