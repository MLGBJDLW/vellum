# Assistant workflows

Vellum starts in `orch`, a personal assistant for research, writing, analysis,
organization, and coding. The user supplies an objective; the assistant chooses
how much planning, execution, and delegation the objective needs.

## Default behavior

`orch` uses the existing ModeManager and AgentLoop. It can act directly, create a
plan, use the specification workflow when appropriate, and delegate independent
work to existing specialist agents. There is no second orchestration engine.
The default `auto-edit` approval policy and `workspace-write` sandbox are separate
from the planning strategy. A plan or subagent never grants additional access.

For work with a runnable acceptance check, `attempt_completion` runs the check.
A failed check returns its result to the assistant so it can repair the work in
the same loop. Simple conversations use ordinary final replies. Completion
claims must match observed evidence.

Long tasks no longer end merely because they reached an implicit iteration or
elapsed-time default. Explicit limits, cancellation, resource concurrency, and
repeated-action detection still apply. If one stops execution, the result must
explain the stop and preserve progress instead of claiming the work succeeded.

## Controls

```bash
vellum
vellum chat --approval auto-edit --sandbox workspace-write
vellum run "Review and summarize the files in this folder"
```

Inside Vellum, `/mode` shows the current workflow; `/orch` or Alt+0 returns to the
personal assistant. Permissions can be set explicitly at startup. `--full-auto`
changes approval behavior without silently changing the chosen workflow.

## Existing sessions and scripts

The old workflows remain explicit compatibility overrides:

| Override | Behavior |
| --- | --- |
| `vibe` | Direct worker, full-auto approval and full-access sandbox |
| `plan` | Existing plan/approval workflow |
| `spec` | Existing six-phase specification workflow |

Use `--mode <name>` or `/mode <name>` only when that specific older behavior is
needed. Existing sessions preserve their saved workflow. New onboarding goes
straight to `orch`; it does not require selecting one of these coding workflows.

`code`, `draft`, `debug`, and `ask` retain their existing legacy mappings. Custom
skills, prompts, agents, and tool permissions continue to use their existing
owners. Coding remains supported, but the default identity and task routing are
not limited to software work.
