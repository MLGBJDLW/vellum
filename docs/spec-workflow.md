# Spec Workflow

> 6-phase structured workflow for complex features

The spec workflow provides precision coding through structured planning phases. Each phase produces documented artifacts, has a dedicated agent, and requires user approval before proceeding.

## Overview

| Phase | Agent | Output | Purpose |
|-------|-------|--------|---------|
| 1. Research | `spec-researcher` | `research.md` | Analyze codebase, gather context |
| 2. Requirements | `spec-requirements` | `requirements.md` | EARS-format requirements |
| 3. Design | `spec-architect` | `design.md`, ADRs | Architecture decisions |
| 4. Tasks | `spec-tasks` | `tasks.md` | Actionable implementation tasks |
| 5. Implementation | `coder` | Source code | Execute tasks with full tool access |
| 6. Validation | `spec-validator` | `validation.md` | Verify deliverables |

## Quick Start

```bash
# Start new spec workflow
vellum --mode=spec "implement user authentication"

# Or use the spec subcommand
vellum spec start "add payment processing" --name=payments

# Resume from checkpoint
vellum spec resume payments

# Check status
vellum spec status payments
```

## Phases

### Phase 1: Research

The `spec-researcher` agent analyzes your codebase to gather context:
- Project structure and conventions
- Existing patterns and dependencies
- Related code that may be affected

**Output:** `.vellum/specs/{name}/research.md`

### Phase 2: Requirements

The `spec-requirements` agent produces EARS-format requirements:
- Ubiquitous requirements (system-wide)
- Event-driven requirements (when X, system shall Y)
- State-driven requirements (while X, system shall Y)
- Acceptance criteria for each requirement

**Output:** `.vellum/specs/{name}/requirements.md`

### Phase 3: Design

The `spec-architect` agent creates the technical design:
- Component architecture
- Interface definitions
- Data flow diagrams
- Architecture Decision Records (ADRs)

**Output:** `.vellum/specs/{name}/design.md`, `.vellum/specs/{name}/adr/`

### Phase 4: Tasks

The `spec-tasks` agent breaks down the design into actionable tasks:
- Ordered by dependency
- Sized (S/M/L) with effort estimates
- Clear "done when" criteria
- File paths and function signatures

**Output:** `.vellum/specs/{name}/tasks.md`

### Phase 5: Implementation

Hands off to the `coder` agent with full tool access:
- Executes tasks in order
- Creates/modifies source files
- Runs tests as specified
- Reports progress per task

### Phase 6: Validation

The `spec-validator` agent verifies the implementation:
- All requirements satisfied
- Tests pass
- Code follows project conventions
- Documentation updated

**Output:** `.vellum/specs/{name}/validation.md`

## Checkpoint System

Each phase boundary is a checkpoint where:

1. **State is saved** — Full workflow state persisted to `.vellum/specs/{name}/checkpoints/`
2. **User approval required** — Review phase output before proceeding
3. **Resume supported** — Can pause and resume from any checkpoint

### Checkpoint Commands

```bash
# List checkpoints for a spec
vellum spec checkpoints payments

# Resume from specific phase
vellum spec resume payments --from=design

# Skip a phase (if allowed)
vellum spec skip payments requirements
```

### Skippable Phases

- ✅ Research — Skip if you provide context manually
- ✅ Requirements — Skip for small changes
- ❌ Design — Required for implementation
- ❌ Tasks — Required for implementation
- ❌ Implementation — Core phase
- ❌ Validation — Final verification

## Agent Roles

### spec-researcher

**Level:** Worker (Level 2)  
**Purpose:** Codebase analysis and context gathering  
**Tools:** File read, grep, semantic search  
**Template:** `.vellum/specs/templates/research-template.md`

### spec-requirements

**Level:** Worker (Level 2)  
**Purpose:** EARS requirements specification  
**Tools:** File read, template validation  
**Template:** `.vellum/specs/templates/requirements-template.md`

### spec-architect

**Level:** Worker (Level 2)  
**Purpose:** Architecture and design decisions  
**Tools:** File read, diagram generation  
**Template:** `.vellum/specs/templates/design-template.md`

### spec-tasks

**Level:** Worker (Level 2)  
**Purpose:** Task decomposition and planning  
**Tools:** File read, dependency analysis  
**Template:** `.vellum/specs/templates/tasks-template.md`

### spec-validator

**Level:** Worker (Level 2)  
**Purpose:** Implementation verification  
**Tools:** File read, test runner, validation checks  
**Template:** `.vellum/specs/templates/validation-template.md`

## CLI Reference

### `vellum spec start`

Start a new spec workflow:

```bash
vellum spec start "description" [options]

Options:
  --name, -n     Spec name (default: auto-generated from description)
  --skip         Phases to skip (comma-separated)
  --template     Custom template directory
```

### `vellum spec resume`

Resume an existing workflow:

```bash
vellum spec resume <name> [options]

Options:
  --from         Resume from specific phase
  --force        Skip checkpoint approval
```

### `vellum spec status`

Show workflow status:

```bash
vellum spec status <name>

Output:
  - Current phase
  - Completed phases with timestamps
  - Pending phases
  - Last checkpoint
```

### `vellum spec list`

List all specs:

```bash
vellum spec list [options]

Options:
  --status       Filter by status (active, complete, abandoned)
  --json         Output as JSON
```

## File Structure

```
.vellum/
└── specs/
    ├── templates/           # Phase templates
    │   ├── research-template.md
    │   ├── requirements-template.md
    │   ├── design-template.md
    │   ├── tasks-template.md
    │   └── validation-template.md
    └── {spec-name}/         # Spec artifacts
        ├── research.md
        ├── requirements.md
        ├── design.md
        ├── tasks.md
        ├── validation.md
        ├── adr/             # Architecture decisions
        └── checkpoints/     # Workflow state
```

## Configuration

Configure spec workflow in `vellum.config.ts`:

```typescript
export default {
  spec: {
    // Default template directory
    templateDir: '.vellum/specs/templates',
    
    // Checkpoint retention
    keepCheckpoints: 5,
    
    // Auto-skip phases for small tasks
    autoSkipThreshold: 'small',
    
    // Require approval at each checkpoint
    requireApproval: true,
  }
}
```

## Best Practices

1. **Use for complex features** — Spec mode adds overhead; use `vibe` or `plan` for simpler tasks
2. **Review each checkpoint** — The approval gates exist for quality control
3. **Keep specs focused** — One feature per spec; split large features into multiple specs
4. **Reference previous specs** — Reuse patterns from successful past specs
5. **Update templates** — Customize templates to match your project's conventions

## Troubleshooting

### Workflow stuck at checkpoint

```bash
# Check status
vellum spec status my-feature

# Force proceed (use with caution)
vellum spec resume my-feature --force
```

### Template validation failed

The agent will retry with feedback. If persistent:
1. Check template requirements in `.vellum/specs/templates/`
2. Manually fix the output file
3. Resume from current phase

### Agent spawn failed

```bash
# Check agent configuration
vellum agents list

# Verify spec agents exist
ls packages/core/src/agents/spec/
```

## See Also

- [modes.md](modes.md) — All coding modes
- [custom-agents.md](custom-agents.md) — Creating custom agents
- [session-system.md](session-system.md) — Session management
