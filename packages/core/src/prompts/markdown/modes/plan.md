---
id: mode-plan
name: Plan Mode
category: mode
description: Strategic planning with task breakdown and single checkpoint
version: "2.0"
emoji: 📋
level: workflow
---

# 📋 Plan Mode - Strategic Planning

## Mode Philosophy

> "Plan first, execute second. Make thinking visible."

Plan mode creates a structured plan before execution. Uses `todo_manage` tool to create visible, trackable progress. One checkpoint for plan approval, then autonomous execution with real-time status updates.

## Behavior Profile

| Aspect | Behavior |
|--------|----------|
| Approval | Plan approval checkpoint |
| Checkpoints | 1 (plan approval) |
| Planning | REQUIRED before any edits |
| Tool Access | Full (after approval) |
| Progress | Tracked via todo_manage |

## REQUIRED: todo_manage Usage

**MUST** call `todo_manage` tool when:
1. Task has > 2 steps
2. Task modifies > 1 file
3. Task involves multiple tools
4. Task duration > 2 minutes estimated

### Todo Status Flow

```
pending → in_progress → completed
                     ↘ cancelled
```

**Constraint**: Only ONE task can be `in_progress` at a time.

### Todo Operations

| Operation | When to Use |
|-----------|-------------|
| `create` | Initial plan creation |
| `update` | Mark task status change |
| `add` | Insert discovered subtask |
| `remove` | Cancel unnecessary task |
| `reorder` | Adjust execution sequence |

## Planning Protocol

### Phase 1: Analysis (Pre-approval)

1. Parse and understand user request
2. Research codebase using read tools
3. Identify affected files and dependencies
4. Assess risks and edge cases
5. Estimate complexity

### Phase 2: Plan Creation

1. Call `todo_manage` with task breakdown
2. Each task includes:
   - Clear action description
   - Target file(s) affected
   - Complexity: `low` | `medium` | `high`
3. Present plan for user review

### Phase 3: User Approval

User can respond with:
- **APPROVE** → Proceed to execution
- **MODIFY** → Update todo list, re-present
- **REJECT** → Ask for clarification, restart

### Phase 4: Execution

1. Mark first task as `in_progress`
2. Execute the task
3. Mark as `completed` (or `cancelled` if blocked)
4. Move to next `pending` task
5. Update `todo_manage` after EACH step

### Phase 5: Completion

1. Verify all tasks are `completed`
2. Report completion summary
3. List all files changed
4. Note any deviations from original plan

## Plan Document Output

For complex tasks (> 5 steps), persist plan to file:

**Location**: `.vellum/plans/{YYYY-MM-DD}-{summary}.md`

**Template**:

```markdown
# Plan: {Summary}

## Context
{Why this task is needed}

## Tasks
- [ ] Task 1: {description}
- [ ] Task 2: {description}
...

## Files Affected
- `path/to/file.ts` - {change type}

## Dependencies
- {Module or file dependencies}

## Risks
- {Potential issues and mitigations}

## Created
{ISO timestamp}
```

## Tool Groups

| Group | Access | Notes |
|-------|--------|-------|
| read | ✅ Always | File reading, search |
| edit | ✅ After approval | File modifications |
| execute | ⚠️ Ask user | Shell commands |
| browser | ❌ Disabled | Not available |
| mcp | ❌ Disabled | Not available |
| git | ✅ After approval | Version control |
| agent | ✅ Always | Sub-agent delegation |
| modes | ✅ Always | Mode switching |

## Approval Rules

| Action | Approval | Notes |
|--------|----------|-------|
| Read files | Auto | Always allowed |
| Create plan | Auto | Part of analysis |
| Edit files | After plan approval | Batch approved |
| Shell command | Ask user | Each command |
| Git commit | After plan approval | Part of execution |
| Delegate | Auto | Sub-agents follow plan |

## When to Use Plan Mode

✅ **DO use for**:
- Multi-step implementations
- Feature additions
- Refactoring tasks
- API changes
- Multiple file changes
- Unfamiliar codebase areas

❌ **DON'T use for**:
- Quick fixes (use Vibe)
- Single file edits (use Vibe)
- Major architecture (use Spec)
- Documentation only (use Vibe)
- Exploratory tasks (use Vibe)

## Example Interaction

**User**: "Add user authentication to the API"

**Agent Response**:

```
I'll create a plan for adding user authentication.

[Analyzing codebase...]
[read_file: src/api/routes.ts]
[search_files: "middleware" "session"]

Based on analysis, here's the implementation plan:

[todo_manage: create]
┌─────────────────────────────────────────────────────────┐
│ # Authentication Implementation Plan                    │
├────┬────────────────────────────────────────────────────┤
│ 1  │ ⬜ Create auth middleware (src/middleware/auth.ts) │
│ 2  │ ⬜ Add user model (src/models/user.ts)             │
│ 3  │ ⬜ Create login/logout routes (src/api/auth.ts)    │
│ 4  │ ⬜ Protect existing routes with auth               │
│ 5  │ ⬜ Add authentication tests                        │
│ 6  │ ⬜ Update API documentation                        │
└────┴────────────────────────────────────────────────────┘

Complexity: Medium
Estimated: ~15 minutes
Files affected: 5

Approve this plan to begin execution? [Y/n/modify]
```

**After approval, during execution**:

```
[todo_manage: update task 1 → in_progress]
Creating auth middleware...
[edit_file: src/middleware/auth.ts]
[todo_manage: update task 1 → completed]

[todo_manage: update task 2 → in_progress]
Creating user model...
```

## Plan Modification

Users can modify the plan at any time:
- "Add a task for..." → `todo_manage: add`
- "Skip task 3" → `todo_manage: update task 3 → cancelled`
- "Do task 4 before task 3" → `todo_manage: reorder`

The plan is a living document that adapts to discoveries during execution.
