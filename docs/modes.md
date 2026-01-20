# Coding Modes

> Three modes for different coding styles and workflows

Vellum provides three coding modes that control agent behavior, tool access, and approval requirements. Choose the mode that best fits your current task's complexity and risk level.

## Overview

| Mode | Level | Approval | Sandbox | Checkpoints | Best For |
|------|-------|----------|---------|-------------|----------|
| **⚡ vibe** | Worker | Full-auto | Full access | 0 | Quick fixes, trusted tasks |
| **📋 plan** | Workflow | Auto-edit | Workspace write | 1 | Complex tasks, moderate oversight |
| **📐 spec** | Orchestrator | Suggest | Workspace read | 6 | Large features, high quality |

## Mode Details

### ⚡ Vibe Mode

Fast autonomous coding with full tool access.

**Characteristics:**
- **Level:** Worker (leaf-level executor)
- **Approval:** `full-auto` - no user confirmations required
- **Sandbox:** `full-access` - maximum file system access
- **Checkpoints:** 0 - no approval gates

**When to use:**
- Quick bug fixes
- Small refactorings
- Trusted environments
- Rapid prototyping
- Tasks you fully understand

**Example:**
```bash
vellum --mode=vibe "fix the typo in README.md"
```markdown

### 📋 Plan Mode

Plan-then-execute workflow with one checkpoint.

**Characteristics:**
- **Level:** Workflow (mid-level manager)
- **Approval:** `auto-edit` - file edits auto-approved, commands ask
- **Sandbox:** `workspace-write` - read/write within workspace
- **Checkpoints:** 1 - approval before execution phase

**When to use:**
- Multi-file changes
- Tasks requiring analysis first
- Moderate complexity features
- When you want to review the plan

**Example:**
```bash
vellum --mode=plan "add input validation to all API endpoints"
```markdown

### 📐 Spec Mode

6-phase structured workflow with checkpoints at each phase.

**Characteristics:**
- **Level:** Orchestrator (top-level coordinator)
- **Approval:** `suggest` - all actions require confirmation
- **Sandbox:** `workspace-read` - read-only until implementation
- **Checkpoints:** 6 - one per phase

**6 Phases:**
1. **Research** - Gather project context and dependencies
2. **Requirements** - Define EARS requirements
3. **Design** - Create architecture and design decisions
4. **Tasks** - Break down into actionable items
5. **Implementation** - Execute with full tool access
6. **Validation** - Verify all deliverables

**When to use:**
- Large feature implementations
- New project scaffolding
- High-quality requirements
- Complex architectural changes
- When documentation matters

**Example:**
```bash
vellum --mode=spec "implement user authentication system"
```markdown

## CLI Flags

### `--mode`

Set the coding mode directly:

```bash
vellum --mode=vibe "quick task"
vellum --mode=plan "medium task"
vellum --mode=spec "large feature"
```markdown

### `--approval`

Override the approval policy:

```bash
# Override approval for any mode
vellum --mode=plan --approval=full-auto "trusted task"
vellum --mode=vibe --approval=suggest "careful task"
```text

Available policies:
- `full-auto` - No confirmations
- `auto-edit` - Auto-approve edits, ask for commands
- `suggest` - Ask for all actions

### `--sandbox`

Override the sandbox policy:

```bash
vellum --mode=vibe --sandbox=workspace-write "limited access"
```text

Available policies:
- `full-access` - No restrictions
- `workspace-write` - Read/write in workspace only
- `workspace-read` - Read-only access

### `--full-auto`

Shorthand for `--mode=vibe --approval=full-auto`:

```bash
vellum --full-auto "autonomous task"
```markdown

## Slash Commands

Switch modes during a session using slash commands:

| Command | Description |
|---------|-------------|
| `/mode` | Show current mode and options |
| `/mode vibe` | Switch to vibe mode |
| `/mode plan` | Switch to plan mode |
| `/mode spec` | Switch to spec mode |
| `/vibe` | Quick switch to vibe mode |
| `/plan` | Quick switch to plan mode |
| `/spec` | Quick switch to spec mode (with confirmation) |

**Example session:**
```
> /mode
Current mode: plan 📋
Available modes:
  ⚡ vibe - Fast autonomous coding
  📋 plan (current) - Plan-then-execute
  📐 spec - 6-phase workflow

> /vibe
Switched to vibe mode ⚡

> /spec
⚠️ Spec mode requires 6 checkpoints. Proceed? (y/n)
```markdown

## Keyboard Shortcuts

Quick mode switching with keyboard shortcuts:

| Shortcut | Mode | Description |
|----------|------|-------------|
| `Ctrl+1` | vibe | Fast autonomous coding |
| `Ctrl+2` | plan | Plan-then-execute |
| `Ctrl+3` | spec | 6-phase workflow |

Shortcuts work when the TUI is focused and not in text input mode.

## Legacy Mode Migration

> ⚠️ **Deprecation Notice:** The legacy 5-mode system is deprecated and will be removed in a future version.

The old modes are automatically mapped to new equivalents:

| Legacy Mode | New Mode | Notes |
|-------------|----------|-------|
| `code` | `vibe` | Direct mapping |
| `draft` | `vibe` | With temperature 0.8 |
| `debug` | `vibe` | With temperature 0.1 |
| `ask` | `plan` | Conversational planning |
| `plan` | `plan` | No change |

**Migration examples:**
```bash
# Old (deprecated)
vellum code "fix bug"
vellum draft "prototype idea"

# New (recommended)
vellum --mode=vibe "fix bug"
vellum --mode=vibe "prototype idea"
```text

Using legacy mode names will trigger a deprecation warning:
```
⚠️ 'code' is deprecated, use '--mode=vibe' instead
```markdown

## Configuration

Set default mode in your configuration:

```json
{
  "defaultMode": "plan",
  "defaultApproval": "auto-edit"
}
```text

Or via environment variables:

```bash
export VELLUM_MODE=plan
export VELLUM_APPROVAL=auto-edit
```

## Best Practices

1. **Start with plan mode** for unfamiliar codebases
2. **Use vibe mode** for quick, well-understood tasks
3. **Use spec mode** for features that need documentation
4. **Override approval** when you need more/less control
5. **Check mode before long tasks** with `/mode`

## Related Documentation

- [Configuration](./configuration.md) - Full configuration options
- [TUI Reference](./tui.md) - Terminal UI documentation
- [Session System](./session-system.md) - Session management
