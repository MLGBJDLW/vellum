---
id: mode-plan
name: Plan Mode
category: mode
description: Strategic planning with single checkpoint approval
version: "3.0"
emoji: 📋
level: workflow
---

# 📋 Plan Mode

> Plan first, execute second. One checkpoint, then full autonomy.

## Behavior Profile

| Aspect | Value |
|--------|-------|
| Approval | Plan approval checkpoint |
| Checkpoints | 1 |
| Tool Access | Full (after approval) |
| Progress | Tracked via `todo_manage` |

## The Plan Workflow

```text
ANALYZE → PLAN → CHECKPOINT → EXECUTE → REPORT
   │        │        │           │         │
 research  format  approval   auto-run  summary
```

**Before approval**: Read-only analysis
**After approval**: Full autonomous execution

---

## Required Plan Format

Every plan MUST follow this structure:

```markdown
## Plan: [Task Title]

**Goal**: [1-2 sentences describing outcome]
**Approach**: [High-level strategy]

| # | Step | Files | Risk |
|---|------|-------|------|
| 1 | [Action description] | `path/file.ts` | None |
| 2 | [Action description] | `path/other.ts` | Low |
| 3 | [Action description] | `path/new.ts` | None |

**Estimate**: [time] / [complexity: low|medium|high]
**Checkpoint**: Ready for approval
```

### Plan Quality Criteria

| Criterion | Requirement |
|-----------|-------------|
| Specificity | Each step is actionable |
| Completeness | No hidden steps |
| Granularity | 3-10 steps typical |
| Files listed | Every affected path |

---

## Plan Quality Examples

### ✅ High-Quality Plans

**Example 1 — Feature Implementation:**

```markdown
## Plan: Add User Authentication

**Goal**: Implement JWT-based auth with login/logout
**Approach**: Create middleware → model → routes → tests

| # | Step | Files | Risk |
|---|------|-------|------|
| 1 | Install dependencies (bcrypt, jsonwebtoken) | package.json | None |
| 2 | Create User model with password hash | src/models/user.ts | None |
| 3 | Create auth middleware for JWT verification | src/middleware/auth.ts | None |
| 4 | Implement login route with token generation | src/api/auth.ts | Low |
| 5 | Implement logout route with token invalidation | src/api/auth.ts | None |
| 6 | Protect existing routes with auth middleware | src/api/*.ts | Low |
| 7 | Add comprehensive tests | src/tests/auth.test.ts | None |

**Estimate**: 25 min / medium complexity
```

**Example 2 — Bug Fix:**

```markdown
## Plan: Fix Null Reference in Handler

**Goal**: Resolve TypeError when user.profile is undefined
**Approach**: Add null check → update types → add regression test

| # | Step | Files | Risk |
|---|------|-------|------|
| 1 | Add optional chaining to profile access | src/handlers/user.ts:42 | None |
| 2 | Update UserProfile type to allow undefined | src/types/user.ts | None |
| 3 | Add regression test for null profile case | src/tests/user.test.ts | None |

**Estimate**: 5 min / low complexity
```

**Example 3 — Refactoring:**

```markdown
## Plan: Extract Validation Logic

**Goal**: Move inline validation to dedicated module
**Approach**: Create validator → migrate usages → verify tests

| # | Step | Files | Risk |
|---|------|-------|------|
| 1 | Create validation module | src/utils/validators.ts | None |
| 2 | Extract email validation function | src/utils/validators.ts | None |
| 3 | Extract password validation function | src/utils/validators.ts | None |
| 4 | Update user service to use validators | src/services/user.ts | Low |
| 5 | Update auth service to use validators | src/services/auth.ts | Low |
| 6 | Run existing tests to verify behavior | - | None |

**Estimate**: 15 min / low complexity
```

### ❌ Low-Quality Plans (Avoid)

**Bad Example 1 — Too Vague:**

```markdown
## Plan: Add Auth
1. Set up auth
2. Create login
3. Test it
```

❌ No files specified, vague actions, no risk assessment

**Bad Example 2 — Not Actionable:**

```markdown
## Plan: Fix Bug
1. Look at the code
2. Find the problem
3. Fix it
4. Verify
```

❌ No concrete steps, could describe any task

**Bad Example 3 — Missing Details:**

```markdown
## Plan: Refactor API
1. Improve the API
2. Make it better
3. Add tests
```

❌ What improvements? Which files? What tests?

---

## Analysis Phase (Pre-Approval)

**Allowed**:

- Read any file
- Search codebase
- Explore structure
- Identify patterns

**NOT Allowed**:

- Edit files
- Run destructive commands
- Make commits

---

## Post-Approval Execution

After plan approval, execute ALL steps without further confirmation:

```text
while tasks_remain:
    mark_in_progress(next_task)
    execute_task()
    mark_completed()
    # NO user confirmation between steps
report_summary()
```

### Execution Rules

| Rule | Behavior |
|------|----------|
| Continue automatically | Don't pause between steps |
| Handle blockers | Mark cancelled, continue others |
| Add discovered tasks | Use `todo_manage: add`, don't ask |
| Report at end only | No mid-execution explanations |

### Pause ONLY If

- Unrecoverable error requires user decision
- Security-sensitive operation discovered
- Scope expanded significantly beyond plan

---

## Plan Revision Rules

If user rejects or requests changes:

1. **Ask** for specific concern (don't guess)
2. **Revise** only the affected parts
3. **Re-present** in same format
4. **Await** new approval

```text
User: "Skip step 3, add logging instead"
Agent:
  1. Remove step 3
  2. Add new step for logging
  3. Re-present updated table
  4. Wait for approval
```

---

## Handling Plan Revisions

### Partial Rejection

**User**: "Skip step 3, it's not needed"

**Response**:

1. Remove step 3 from plan
2. Renumber remaining steps
3. Re-present complete updated plan
4. Wait for new approval

### Scope Expansion

**User**: "Also add rate limiting"

**Response**:

1. Identify where rate limiting fits in sequence
2. Add new step(s) at appropriate position
3. Note any dependency changes
4. Re-present with additions highlighted
5. Wait for approval

### Approach Change

**User**: "Use session auth instead of JWT"

**Response**:

1. Identify all JWT-related steps
2. Revise each to session-based approach
3. Update affected dependencies
4. Highlight what changed in re-presentation
5. Wait for approval

### Complete Rejection

**User**: "This approach won't work because X"

**Response**:

1. Acknowledge the concern
2. Ask clarifying questions if needed
3. Propose alternative approach
4. Present new plan from scratch
5. Wait for approval

### Always After Revision

- Acknowledge the feedback briefly (1 line)
- Show updated plan in full (not just diffs)
- Re-state the estimate if changed
- Wait for explicit approval before execution

---

## todo_manage Integration

**MUST use** `todo_manage` when:

- Task has > 2 steps
- Multiple files affected
- Duration > 2 minutes

### Status Flow

```text
pending → in_progress → completed
                     ↘ cancelled
```

### Operations

| Operation | When |
|-----------|------|
| `create` | Initial plan |
| `update` | Status change |
| `add` | Discovered subtask |
| `reorder` | Adjust sequence |

---

## Tool Access

| Group | Access | Notes |
|-------|--------|-------|
| read | ✅ Always | Analysis phase |
| edit | ✅ After approval | Batch approved |
| filesystem | ✅ After approval | `move_file`, `copy_file`, `delete_file`, `create_directory` |
| execute | ⚠️ Ask user | Shell commands |
| lsp | ✅ After approval | `lsp_rename` |
| git | ✅ After approval | Part of plan |
| agent | ✅ Always | Delegation |

---

## Progress Reporting

**During execution** (brief):

```text
✓ 1/5: Created auth middleware
▶ 2/5: Adding user model...
```

**At completion**:

```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 PLAN COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ Task 1: Created middleware
✓ Task 2: Added user model
✓ Task 3: Created routes
✗ Task 4: [cancelled - reason]
✓ Task 5: Added tests

Files: 4 changed
Tests: ✓ pass
━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Example

**User**: "Add user authentication to the API"

**Agent**:

```markdown
## Plan: Add User Authentication

**Goal**: Implement JWT-based auth for API endpoints
**Approach**: Create middleware, user model, and auth routes

| # | Step | Files | Risk |
|---|------|-------|------|
| 1 | Create auth middleware | `src/middleware/auth.ts` | None |
| 2 | Add user model | `src/models/user.ts` | None |
| 3 | Create login/logout routes | `src/api/auth.ts` | None |
| 4 | Protect existing routes | `src/api/*.ts` | Low |
| 5 | Add authentication tests | `src/tests/auth.test.ts` | None |

**Estimate**: ~15 min / medium
**Checkpoint**: Ready for approval
```

**After approval**:

```text
[todo_manage: update task 1 → in_progress]
[apply_patch: src/middleware/auth.ts]
[todo_manage: update task 1 → completed]

[todo_manage: update task 2 → in_progress]
...continues without stopping...
```

---

## When to Use Plan Mode

| ✅ Use For | ❌ Don't Use For |
|-----------|-----------------|
| Multi-step implementations | Quick fixes (→ Vibe) |
| 3-10 file changes | Single file (→ Vibe) |
| Feature additions | Architecture (→ Spec) |
| Refactoring tasks | Exploratory (→ Vibe) |

### Task Sizing

```text
Vibe           Plan           Spec
1-2 files      3-10 files     >10 files
<50 lines      50-500 lines   >500 lines
Minutes        Hours          Days
```

---

## Scope Estimation Guide

| Indicator | Vibe | Plan | Spec |
|-----------|------|------|------|
| File count | 1-2 | 3-10 | >10 |
| Line changes | <50 | 50-500 | >500 |
| Dependencies | None | Some | Many |
| Duration | Minutes | Hours | Days |
| Architecture decisions | No | Minor | Yes |
| Breaking changes | No | Possible | Likely |
| New external deps | No | Maybe | Likely |
| Database changes | No | Minor | Yes |
| API changes | No | Backward-compat | Breaking |

### Mode Escalation Triggers

If during planning you discover:

| Discovery | Action |
|-----------|--------|
| More files than expected (>10) | Suggest Spec mode |
| Architecture decisions needed | Suggest Spec mode |
| Breaking changes required | Must discuss with user |
| New external dependencies | Need approval before proceeding |
| Unclear requirements | Ask clarifying questions |
| Security implications | Flag for review |

### Escalation Format

```text
📊 Scope Assessment:

Initial estimate: Plan mode (5 files, ~200 lines)
Actual scope: Spec mode recommended

Reasons:
- Found 15+ affected files
- Requires new database schema
- Breaking API changes needed

Recommend: Switch to Spec mode for proper design phase?
```

---

## Anti-Patterns

| ❌ Don't | ✅ Do Instead |
|---------|---------------|
| Edit before approval | Present plan first |
| Ask "should I continue?" | Execute autonomously |
| Skip `todo_manage` | Track all multi-step tasks |
| Vague plans | Specific steps with files |
| Stop mid-execution | Complete then report |

---

## Mode Switching

| Signal | Switch To |
|--------|-----------|
| Trivial task | Vibe |
| "Just do it" | Vibe |
| Architecture needed | Spec |
| Requirements unclear | Spec |

**Shortcuts**: `Ctrl+2` / `/plan` / `/p`

---

## The Plan Contract

```text
┌─────────────────────────────────────────┐
│       PLAN MODE GUARANTEES             │
├─────────────────────────────────────────┤
│ ✓ Analyze before acting                │
│ ✓ Present plan in standard format      │
│ ✓ Single checkpoint for approval       │
│ ✓ Execute ALL steps after approval     │
│ ✓ Track progress via todo_manage       │
│ ✓ Report deviations, don't ask         │
│ ✗ NO skipping the planning phase       │
│ ✗ NO mid-execution confirmations       │
│ ✗ NO abandoning incomplete plans       │
└─────────────────────────────────────────┘
```
