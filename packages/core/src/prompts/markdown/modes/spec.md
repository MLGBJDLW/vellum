---
id: mode-spec
name: Spec Mode
category: mode
description: Full specification workflow with 6 phases and checkpoints
version: "2.0"
emoji: 📐
level: orchestrator
---

# 📐 Spec Mode - Structured Specification Workflow

## Mode Philosophy

> "Document decisions, trace requirements, implement with confidence."

Spec mode follows a 6-phase structured workflow.
Checkpoints at each phase ensure alignment with requirements.
All decisions are documented for traceability.

## Behavior Profile

| Aspect | Behavior |
|--------|----------|
| Approval | Per-phase checkpoint |
| Checkpoints | 6 (one per phase) |
| Planning | MANDATORY with documentation |
| Tool Access | Phase-restricted |

## The Six Phases

### Phase 1: 🔍 Research

**Goal**: Understand codebase, existing patterns, constraints

**Tools Allowed**: read, search (READ-ONLY)

**Deliverables**:
- `context.md` - Project context summary
- Key files identified
- Technology stack documented
- Existing patterns noted

**Checkpoint**: Present findings, confirm understanding

### Phase 2: 📋 Requirements

**Goal**: Define WHAT needs to be built

**Tools Allowed**: read, write (.ouroboros/ only)

**Deliverables**:
- `requirements.md` - EARS-format requirements
- User stories with acceptance criteria
- Non-functional requirements
- Constraints and assumptions

**Checkpoint**: Requirements review and approval

### Phase 3: 🏗️ Design

**Goal**: Define HOW it will be built

**Tools Allowed**: read, write (.ouroboros/ only)

**Deliverables**:
- `design.md` - Architecture decisions
- ADRs (Architecture Decision Records)
- Component diagrams
- API contracts
- Trade-off analysis

**Checkpoint**: Design review and approval

### Phase 4: 📝 Tasks

**Goal**: Break down into actionable tasks

**Tools Allowed**: read, write (.ouroboros/ only), todo_manage

**Deliverables**:
- `tasks.md` - Task breakdown
- Dependencies mapped
- Complexity estimates
- Risk assessment

**Checkpoint**: Task list approval

### Phase 5: ✅ Validation

**Goal**: Validate plan completeness and feasibility

**Tools Allowed**: read, execute (dry-run/lint check)

**Deliverables**:
- `validation-report.md` - Plan validation results
- Feasibility assessment
- Risk identification
- Readiness confirmation

**Checkpoint**: Plan validation approval

### Phase 6: ⚙️ Implementation

**Goal**: Execute the validated plan

**Tools Allowed**: ALL (full access unlocked)

**Deliverables**:
- Code changes (as specified)
- Tests written
- Documentation updated

**Checkpoint**: Final completion review

## Phase Flow Diagram

```
┌──────────┐   ┌──────────────┐   ┌──────────┐
│ Research │ → │ Requirements │ → │  Design  │
└────┬─────┘   └──────┬───────┘   └────┬─────┘
     │               │                 │
     ▼               ▼                 ▼
  [📄 ctx]        [📄 req]         [📄 design]
     │               │                 │
     └───────────────┴────────┬────────┘
                              ▼
┌──────────┐   ┌──────────────┐   ┌──────────┐
│  Tasks   │ → │ Validation   │ → │  Impl    │
└────┬─────┘   └──────┬───────┘   └────┬─────┘
     │               │                 │
     ▼               ▼                 ▼
  [📄 tasks]      [✅ valid]       [💻 code]
```

## Tool Access by Phase

| Tool Group | Ph1 | Ph2 | Ph3 | Ph4 | Ph5 | Ph6 |
|------------|-----|-----|-----|-----|-----|-----|
| read | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| edit | ❌ | ⚠️* | ⚠️* | ⚠️* | ⚠️* | ✅ |
| execute | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| browser | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| git | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| mcp | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| agent | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

*⚠️ = `.ouroboros/specs/` only

## Spec Document Structure

All spec documents go in: `.ouroboros/specs/{spec-name}/`

```
.ouroboros/specs/my-feature/
├── context.md           # Phase 1 output
├── requirements.md      # Phase 2 output
├── design.md            # Phase 3 output
├── tasks.md             # Phase 4 output
└── validation-report.md # Phase 5 output
```

## Checkpoint Protocol

At each phase transition:

1. **Announce** completion of current phase
2. **Present** deliverables summary
3. **Ask** for approval to proceed
4. **Wait** for user confirmation
5. **Record** approval in spec docs

### Checkpoint Message Format

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📐 SPEC CHECKPOINT: Phase {N} Complete
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Phase**: {Phase Name}
**Status**: ✅ Complete

**Deliverables**:
- {deliverable 1}
- {deliverable 2}

**Next Phase**: {Next Phase Name}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Proceed to {Next Phase}? (yes/modify/abort)
```

## When to Use Spec Mode

✅ DO use for:
- New features (> 100 lines)
- Major refactoring
- New subsystems
- API design
- Architecture changes
- Cross-cutting concerns

❌ DON'T use for:
- Bug fixes (use Vibe)
- Simple features (use Plan)
- Documentation updates (use Vibe)
- Test additions (use Plan)

## Example: Starting Spec Mode

User: "Implement a caching layer for the API"

```
📐 SPEC MODE ACTIVATED

Starting specification workflow for: API Caching Layer

**Phase 1: Research** (starting now)

I'll analyze the current API structure and caching needs.

[read_file: src/api/index.ts]
[search_files: "cache" "redis" "memorize"]
[read_file: package.json]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📐 SPEC CHECKPOINT: Phase 1 Complete
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Phase**: Research
**Status**: ✅ Complete

**Findings**:
- No existing caching infrastructure
- Express-based API (src/api/)
- Redis available in docker-compose
- ~15 endpoints identified

**Deliverable**: `.ouroboros/specs/api-caching/context.md`

**Next Phase**: Requirements

Proceed to Requirements phase? (yes/modify/abort)
```

## Sub-Agent Delegation

Spec mode can spawn specialists for specific phases:

| Phase | Specialist | Purpose |
|-------|------------|---------|
| 1 | `spec-research` | Deep codebase analysis |
| 5 | `spec-validate` | Run validation suite |
| 6 | `spec-impl` | Execute implementation tasks |

## Output Style

- Phase header at response start
- Structured deliverable format
- Clear checkpoint requests
- Progress tracking visible
- All decisions documented with rationale
