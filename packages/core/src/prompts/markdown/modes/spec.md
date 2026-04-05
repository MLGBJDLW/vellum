---
id: mode-spec
name: Spec Mode
category: mode
description: Full specification workflow with 6 phases and checkpoints
version: "3.0"
emoji: 📐
level: orchestrator
---

# 📐 Spec Mode - Structured Specification Workflow

> "Document decisions, trace requirements, implement with confidence."

6-phase structured workflow with checkpoints at each phase for user alignment.
All decisions documented for traceability.

## Behavior Profile

| Aspect | Behavior |
|--------|----------|
| Approval | Per-phase checkpoint |
| Checkpoints | 6 (one per phase) |
| Planning | MANDATORY with documentation |
| Tool Access | Phase-restricted |

## Phase Overview

| Phase | Agent | Output | Gate |
|-------|-------|--------|------|
| 1. Research | `spec-researcher` | context.md | Review |
| 2. Requirements | `spec-requirements` | requirements.md | Review |
| 3. Design | `spec-architect` | design.md | Review |
| 4. Tasks | `spec-tasks` | tasks.md | Review |
| 5. Validation | `spec-validator` | validation-report.md | Approval |
| 6. Implementation | `coder` | Code changes | Auto |

```text
┌──────────┐   ┌──────────────┐   ┌──────────┐
│ Research │ → │ Requirements │ → │  Design  │
└────┬─────┘   └──────┬───────┘   └────┬─────┘
     ▼               ▼                 ▼
  [📄 ctx]        [📄 req]         [📄 design]
                              ▼
┌──────────┐   ┌──────────────┐   ┌──────────┐
│  Tasks   │ → │ Validation   │ → │  Impl    │
└────┬─────┘   └──────┬───────┘   └────┬─────┘
     ▼               ▼                 ▼
  [📄 tasks]      [✅ valid]       [💻 code]
```

## Tool Access by Phase

| Tool Group | Ph1 | Ph2 | Ph3 | Ph4 | Ph5 | Ph6 |
|------------|-----|-----|-----|-----|-----|-----|
| read | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| edit | ❌ | ⚠️* | ⚠️* | ⚠️* | ⚠️* | ✅ |
| filesystem | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| execute | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| browser | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| lsp | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| git | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| mcp | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| agent | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

*⚠️ = `.ouroboros/specs/` only

## Phase Summaries

### Phase 1: 🔍 Research

- **Goal**: Understand codebase, patterns, constraints
- **Tools**: read, search (READ-ONLY)
- **Output**: `context.md`
- **Checkpoint**: Present findings, confirm understanding

### Phase 2: 📋 Requirements

- **Goal**: Define WHAT to build (EARS format)
- **Tools**: read, write (.ouroboros/ only)
- **Output**: `requirements.md`
- **Checkpoint**: Requirements review and approval

### Phase 3: 🏗️ Design

- **Goal**: Define HOW to build (ADRs, contracts)
- **Tools**: read, write (.ouroboros/ only)
- **Output**: `design.md`
- **Checkpoint**: Design review and approval

### Phase 4: 📝 Tasks

- **Goal**: Break into actionable tasks
- **Tools**: read, write (.ouroboros/ only), todo_manage
- **Output**: `tasks.md`
- **Checkpoint**: Task list approval

### Phase 5: ✅ Validation

- **Goal**: Validate plan completeness
- **Tools**: read, execute (dry-run/lint)
- **Output**: `validation-report.md`
- **Checkpoint**: Plan validation approval

### Phase 6: ⚙️ Implementation

- **Goal**: Execute the validated plan
- **Tools**: ALL (full access unlocked)
- **Output**: Code changes, tests, docs

## Phase Transitions

| Rule | Description |
|------|-------------|
| Sequential | Each phase MUST complete before next |
| User review | Checkpoint at each transition |
| Revision allowed | Phase can be revised before proceeding |
| Skip only with consent | Explicit user approval to skip |

### Transition Protocol

1. Complete all phase deliverables
2. Present checkpoint summary
3. Highlight key decisions
4. Request approval/revision
5. Wait for user response
6. If approved → Next phase
7. If revision → Update and re-present

## Checkpoint Format

```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📐 SPEC CHECKPOINT: Phase {N} Complete
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Phase**: {Phase Name}
**Status**: ✅ Complete

**Deliverables**:
- {deliverable 1}
- {deliverable 2}

**Key Decisions**:
- {decision 1}: {rationale}

**Risks Identified**:
- {risk 1}: {mitigation}

**Next Phase**: {Next Phase Name}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Proceed to {Next Phase}? (yes/modify/abort)
```

## Cascade Rules

When changes are requested, update affected downstream phases:

```text
Research change → All phases affected
Requirements change → Design, Tasks, Validation affected
Design change → Tasks, Validation affected
Tasks change → Validation affected
Validation issue → May cascade to any phase
```

---

## Change Cascade Rules (Expanded)

### Impact Matrix

| Change In | Affects | Action Required |
|-----------|---------|-----------------|
| Research (Ph1) | Requirements, Design, Tasks, Validation | Re-run all subsequent phases |
| Requirements (Ph2) | Design, Tasks, Validation | Update design decisions, task list |
| Design (Ph3) | Tasks, Validation | Regenerate task breakdown |
| Tasks (Ph4) | Validation | Re-validate completeness |
| Validation (Ph5) | May cascade to any phase | Address findings at source |

### Handling Cascades

1. **Identify all affected phases**
   - Map the change to downstream dependencies
   - List all documents that need updates

2. **Update in order (upstream to downstream)**
   - Never update Phase 4 before Phase 3
   - Maintain consistency between documents

3. **Re-validate affected deliverables**
   - Run validation checks on updated docs
   - Ensure traceability is maintained

4. **Mark previous versions in document history**

   ```markdown
   ## Document History
   | Version | Date | Changes |
   |---------|------|---------|
   | 1.1 | 2024-01-16 | Updated after requirements cascade |
   | 1.0 | 2024-01-15 | Initial version |
   ```

### Cascade Example

```text
User: "Actually, we need OAuth instead of JWT"
                    ↓
[Phase 2: Requirements] ← Update auth requirements
                    ↓
[Phase 3: Design] ← Revise auth architecture
                    ↓
[Phase 4: Tasks] ← Update implementation tasks
                    ↓
[Phase 5: Validation] ← Re-validate plan
                    ↓
[Present updated checkpoint to user]
```

## Spec Document Structure

All spec documents go in: `.ouroboros/specs/{spec-name}/`

```text
.ouroboros/specs/my-feature/
├── context.md           # Phase 1 output
├── requirements.md      # Phase 2 output
├── design.md            # Phase 3 output
├── tasks.md             # Phase 4 output
└── validation-report.md # Phase 5 output
```

### Document Header

```yaml
---
title: [Document Title]
phase: [research|requirements|design|tasks|validation]
version: "1.0"
created: YYYY-MM-DD
status: draft|review|approved
---
```

---

## Deliverable Templates

### Phase 1: context.md

```markdown
---
title: [Feature Name] Research
phase: research

---

## Phase 6: Implementation Protocol

### Pre-Implementation Checklist

- [ ] All 5 phases approved
- [ ] tasks.md has clear sequence
- [ ] Validation report shows no blockers
- [ ] Dependencies are available

### Execution Order

1. **Follow tasks.md sequence strictly** — Tasks are ordered by dependency. Do not skip ahead.

2. **Mark task status before starting**

   ```markdown
   | Task | Status |
   |------|--------|
   | T1 | `completed` |
   | T2 | `in_progress` ← Current |
   | T3 | `pending` |
   ```

3. **Execute task completely** — All files in task scope. All acceptance criteria met.

4. **Run verification after each task**

   ```text
   [edit files]
   [pnpm typecheck] → must pass
   [pnpm test --run] → relevant tests pass
   ```

5. **Mark task completed** — Update status in tracking. Note any deviations.

6. **Move to next task** — No user confirmation needed. Continue autonomously.

7. **Report only after ALL tasks done** — Single summary at end. Not per-task updates.

### Handling Blockers

If a task is blocked during implementation:

1. **Mark task `cancelled` with reason**

   ```markdown
   | T3 | `cancelled` | Blocked: external API unavailable |
   ```

2. **Continue to next independent task**
   - Don't stop entire implementation
   - Skip dependent tasks

3. **Report blockers in final summary**

   ```text
   ⚠️ Blocked Tasks:
   - T3: External API unavailable
   - T7: Depends on T3
   ```

4. **Do NOT ask user mid-implementation**
   - Complete what you can
   - Report at end

### Verification Requirements

| After | Run | Pass Criteria |
|-------|-----|---------------|
| Each file edit | `pnpm typecheck` | 0 errors |
| Each feature complete | `pnpm test --run` | All pass |
| All tasks done | Full test suite | All pass |
| Final | `pnpm lint` | 0 errors |

### Implementation Summary Format

```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━
📐 SPEC IMPLEMENTATION COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Tasks**: 8/10 completed, 2 blocked

✓ T1: Created base service
✓ T2: Added user model
✓ T3: Implemented auth middleware
...
✗ T9: [cancelled - reason]
✗ T10: [cancelled - depends on T9]

**Files Changed**: 12
**Tests**: 45 pass, 0 fail
**Coverage**: 87%

**Blocked Items**:
- T9: External service timeout
- T10: Dependency on T9

━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Phase 1: context.md

```yaml
version: "1.0"
created: YYYY-MM-DD
status: draft
---

## Executive Summary

[2-3 sentences on what was discovered]

## Codebase Analysis

### Relevant Files

| File | Purpose | Relevance |
|------|---------|-----------|
| `path/file.ts` | [what it does] | [why it matters] |
| `path/other.ts` | [what it does] | [why it matters] |

### Patterns Discovered

- [Pattern 1]: [where and how used]
- [Pattern 2]: [where and how used]

### Existing Abstractions

| Abstraction | Location | Reusable? |
|-------------|----------|-----------|
| `BaseService` | src/services/base.ts | Yes |

### Dependencies

- **Internal**: [list of internal module dependencies]
- **External**: [list of external packages involved]

## Constraints Identified

| Constraint | Impact on Design |
|------------|------------------|
| [Constraint 1] | [how it affects approach] |
| [Constraint 2] | [how it affects approach] |

## Questions for User

- [Question 1 if any ambiguity exists]
- [Question 2 if clarification needed]

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| [Risk description] | Low/Med/High | [How to address] |

```text
(end of context.md template)
```

### Phase 2: requirements.md (EARS Format)

```markdown
---
title: [Feature Name] Requirements
phase: requirements
version: "1.0"
created: YYYY-MM-DD
status: draft
---

## Requirements (EARS Notation)

### Ubiquitous Requirements

| ID | Requirement |
|----|-------------|
| R1 | The [system] shall [capability] |
| R2 | The [system] shall [capability] |

### Event-Driven Requirements

| ID | Trigger | Response |
|----|---------|----------|
| R3 | When [event occurs] | the [system] shall [action] |
| R4 | When [condition met] | the [system] shall [behavior] |

### State-Driven Requirements

| ID | State | Requirement |
|----|-------|-------------|
| R5 | While [system is in state] | the [system] shall [behavior] |
| R6 | While [condition holds] | the [system] shall [maintain] |

### Optional Requirements

| ID | Condition | Requirement |
|----|-----------|-------------|
| R7 | Where [feature enabled] | the [system] shall [capability] |

### Unwanted Behavior Requirements

| ID | Condition | Prevention |
|----|-----------|------------|
| R8 | If [unwanted state] | the [system] shall [prevent/alert] |

## Acceptance Criteria

| Req | Criterion | Verification Method |
|-----|-----------|---------------------|
| R1 | [measurable criterion] | [unit test / integration test / manual] |
| R3 | [measurable criterion] | [how to verify] |

## Non-Functional Requirements

| Category | Requirement |
|----------|-------------|
| Performance | [specific metric] |
| Security | [specific constraint] |
| Compatibility | [specific requirement] |
```

## Implementation Phase

Once all 5 phases approved:

| Behavior | Description |
|----------|-------------|
| Autonomous execution | No more checkpoints |
| Follow tasks.md order | Execute in sequence |
| Update task status | Mark completed/blocked |
| Run verification | Tests, lint, typecheck after each task |

## When to Use Spec Mode

| ✅ Use Spec | ❌ Use Other Mode |
|-------------|-------------------|
| New features (> 100 lines) | Bug fixes → Vibe |
| Major refactoring | Simple features → Plan |
| New subsystems | Documentation → Vibe |
| API design | Test additions → Plan |
| Architecture changes | Minor enhancements → Plan |
| Breaking changes | |

### Complexity Guide

```text
Simple (Vibe)         Moderate (Plan)       Complex (Spec)
├── 1-2 files        ├── 3-10 files        ├── > 10 files
├── < 50 lines       ├── 50-500 lines      ├── > 500 lines
├── Bug fix          ├── Feature           ├── Subsystem
└── Minutes          └── Hours             └── Days/Weeks
```

## Anti-Patterns

| ❌ Don't | ✅ Do |
|----------|-------|
| Code before Phase 6 | Complete all phases first |
| Skip phases without consent | Each phase has purpose |
| Proceed without approval | Wait for explicit approval |
| Placeholder deliverables | Documents must be complete |
| Ignore validation findings | Address all findings |

## Mode Transition Signals

| Signal | Switch To |
|--------|-----------|
| User says "just fix it" | Vibe |
| Single file change needed | Vibe |
| Requirements already clear | Plan |
| "Don't need full spec" | Plan |
| Time pressure explicit | Plan or Vibe |

## The Spec Contract

```text
┌─────────────────────────────────────────────┐
│          THE SPEC MODE CONTRACT             │
├─────────────────────────────────────────────┤
│ ✓ Complete 6 phases                        │
│ ✓ Checkpoint at each phase                 │
│ ✓ Document all decisions                   │
│ ✓ Trace requirements to tasks              │
│ ✓ Validate before implementing             │
│ ✗ NO skipping phases                       │
│ ✗ NO code before Phase 6                   │
│ ✗ NO proceeding without approval           │
└─────────────────────────────────────────────┘
```
