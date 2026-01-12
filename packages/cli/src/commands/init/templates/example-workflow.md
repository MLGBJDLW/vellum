---
name: bugfix
description: Structured workflow for fixing bugs
version: "1.0.0"
phases:
  - name: reproduce
    description: Reproduce and understand the bug
  - name: diagnose
    description: Find the root cause
  - name: fix
    description: Implement the fix
  - name: verify
    description: Verify the fix works
---

# Bugfix Workflow

A structured approach to fixing bugs safely and effectively.

## Phase 1: Reproduce

**Goal**: Understand and reliably reproduce the bug.

### Steps

1. Read the bug report/description carefully
2. Identify the expected vs actual behavior
3. Find or create a minimal reproduction case
4. Document reproduction steps

### Checklist

- [ ] Can reproduce the bug consistently
- [ ] Understand what behavior is expected
- [ ] Have a clear test case

## Phase 2: Diagnose

**Goal**: Find the root cause of the bug.

### Steps

1. Add logging/debugging to trace execution
2. Review recent changes to affected code
3. Check for similar issues in history
4. Identify the exact line(s) causing the issue

### Questions to Answer

- When was this introduced?
- What code path leads to the bug?
- Are there related issues?

### Checklist

- [ ] Root cause identified
- [ ] Understand why the bug occurs
- [ ] Know the scope of impact

## Phase 3: Fix

**Goal**: Implement a safe, minimal fix.

### Principles

1. **Minimal**: Change only what's necessary
2. **Safe**: Don't introduce new bugs
3. **Clear**: Make the fix easy to understand
4. **Tested**: Add regression test

### Steps

1. Write a failing test that reproduces the bug
2. Implement the fix
3. Verify the test passes
4. Review for side effects

### Checklist

- [ ] Test written first
- [ ] Fix implemented
- [ ] All tests pass
- [ ] No new warnings

## Phase 4: Verify

**Goal**: Confirm the fix works and doesn't break anything.

### Steps

1. Run the full test suite
2. Manually verify the original reproduction case
3. Check edge cases
4. Review the diff one more time

### Final Checklist

- [ ] Original bug is fixed
- [ ] No regressions introduced
- [ ] Tests pass
- [ ] Ready for review
