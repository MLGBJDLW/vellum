# One assistant, one execution loop

Source audit: 2026-10-29. The comparison uses upstream source code and first-party documentation. It is a design reference, not a claim that Vellum implements every capability of these projects.

## Upstream findings

| Project and inspected revision | Relevant implementation | Application to Vellum |
| --- | --- | --- |
| Pi — `e65b3b88c08412bb8ffbd21fb5dc5756064a6e5a` | Its agent loop has an inner tool/steering loop and an outer follow-up decision. Turn preparation and completion callbacks share the same context and cancellation signal. [Source](https://github.com/earendil-works/pi/blob/e65b3b88c08412bb8ffbd21fb5dc5756064a6e5a/packages/agent/src/agent-loop.ts) | Use one iterative pump for model calls, tool observations, retries and verification feedback. A successful tool batch requests the next iteration without retaining a recursive promise chain. |
| Codex — `2e764743a651907fa3c4a4ad76c796cac4572bb8` | The regular session task passes cancellation into the turn driver. The turn loop owns pending user input, automatic compaction and turn-stop hooks. Agent control has separate ownership for spawning, completion delivery and shutdown. [Turn source](https://github.com/openai/codex/blob/2e764743a651907fa3c4a4ad76c796cac4572bb8/codex-rs/core/src/session/turn.rs), [task source](https://github.com/openai/codex/blob/2e764743a651907fa3c4a4ad76c796cac4572bb8/codex-rs/core/src/tasks/regular.rs), [agent control](https://github.com/openai/codex/blob/2e764743a651907fa3c4a4ad76c796cac4572bb8/codex-rs/core/src/agent/control.rs) | Keep context and delegation in their existing owners. Forward cancellation and tool approvals to workers; return actual worker receipts and failures, not a synthetic success handle. |
| Hermes — `eaf03cb4dca1da0ad132150b7579948e5a81a8df` | The conversation loop handles interruptions, compression, retries and repetition detection. Its iteration budget explicitly distinguishes parent and child counters, with refunds for work that should not consume an iteration. [Conversation loop](https://github.com/NousResearch/hermes-agent/blob/eaf03cb4dca1da0ad132150b7579948e5a81a8df/agent/conversation_loop.py), [budget source](https://github.com/NousResearch/hermes-agent/blob/eaf03cb4dca1da0ad132150b7579948e5a81a8df/agent/iteration_budget.py) | Distinguish explicit budgets from completion. Remove silent default turn ceilings, retain requested budgets, and report an incomplete result when a budget stops work. Keep repetition detection tied to observed tool results. |
| DeepSeek Harness — `f3803c96974ad4a94195fb97e5c637e9c2a3afe3` | This refers to the official `deepseek-ai/deepseek-harness`, not an unofficial wrapper or the model's internal reasoning. Its standard agent driver uses sequential turns and steps, a shared tool executor, cancellation and a turn-stopping hook. Its documentation describes recovery receipts for undispatched/unanswered calls and has no built-in turn budget. Durable goals and automatic round continuation are separate packages. [Driver source](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/core/agent-loop/src/agent.ts), [driver contract](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/core/agent-loop/README.md), [goal packages](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/goal/README.md) | Keep partial output and call/result pairs on cancellation. Use the existing completion tool as the verification/repair seam. Do not add a second goal scheduler or plugin framework merely to reproduce the upstream architecture. |
| Zed — `02d47bf64fcece0edc5b849d25e3a60a67d01c83` | Its thread owns model completion, bounded retry strategies, pending tool work and references used to propagate cancellation to subagents. Cancelled tool results are represented explicitly in history. [Thread source](https://github.com/zed-industries/zed/blob/02d47bf64fcece0edc5b849d25e3a60a67d01c83/crates/agent/src/thread.rs) | Preserve bounded retries and cancellation even when whole-task time/turn defaults are removed. Release per-iteration cancellation listeners and completed worker resources. |

Pi's former `badlogic/pi-mono` URL redirects to `earendil-works/pi`; the link above uses the canonical repository observed during this audit.

## Problems reproduced in Vellum

- Useful tool work silently stopped at 50 iterations. The final tool batch emitted completion without the configured-limit event.
- Repeated identical tool calls continued until that ceiling because the existing termination checker was not called by the execution path.
- `attempt_completion` accepted a failed verification command, discarded its diagnostic output and stopped the task. The tool was also disabled/filtered from the interactive workflow.
- Delegation could create no subsession, perform no worker execution and still report success. The parent discarded actual aggregated output and manufactured a completed handle.
- Automatic context conversion reused original message parts after pruning, counted request-wide input usage as one message's size, and lost summary linkage across rounds.
- Model selection changed presentation state without changing the loop's provider/model. The runtime now has an idle-only update operation that preserves history and accumulated usage.

## Implemented lifecycle

The `orch` entry point chooses direct execution, planning, specification or delegation using the current task. It shares the existing `AgentLoop`, `ModeManager`, `ToolExecutor`, context manager and orchestrator. Legacy explicit workflows remain available for compatibility.

The loop executes a model turn, records actual tool receipts, applies progress/resource guards, then either continues or ends with an explicit outcome. For work with an executable acceptance check, `attempt_completion` returns failed verification evidence to the same loop. Verification must run alone after other tool actions so it checks the final state. Ordinary conversation does not require an artificial test command.

Workers use the same live tool container through a read-only registry view, with level-specific filtering and the caller's permission checker. They inherit the selected provider/model and working directory, receive cancellation, and return actual results. Each concurrent delegation owns its result aggregation. Missing runtime configuration and budget exhaustion are failures, not success.

Explicit session request, cost and token budgets include delegated work. Concurrent workers reserve requests through the parent's existing budget owner before dispatch, and their usage is recorded once with the actual provider/model. Cancelling a shared budget approval stops the waiting child. An unknown price cannot silently count as zero against an explicit dollar limit.

Automatic context management is enabled for primary and worker loops. Conversion retains actual trimmed content, tool pairing, summary links and provider reasoning metadata. Exact Google replay metadata is dropped if its assistant content is rewritten; unchanged assistant tool messages retain provider metadata. Model changes update the catalog-derived context window and pricing attribution in existing owners.

## Validation and limits

Focused integration tests exercise more than 50 useful turns, repeated unchanged tool results, explicit iteration/request budgets, verification failure feedback, real worker execution with mocked model streams, parent permissions, cancellation, concurrent result isolation, live model switching, synchronous prompt replies, and context round trips. These tests do not make paid provider calls and do not establish live-provider quality or a benchmark improvement. Release and complete repository checks are tracked separately in the PR.

This change does not add background scheduling, autonomous self-modification, a new durable goal service, or a second context store. The improvement is the execution and verification lifecycle inside the existing assistant session.

## Terminal modernization follow-up

The direct built-in worker entry points still supplied a second set of implicit
15–25 turn and three-to-five-minute limits after the main loop was modernized.
A regression through the real `coderWorker.execute` path reproduced incomplete
work when reviewing 26 distinct files. Those per-role defaults are now removed;
explicit executor limits and task-packet deadlines remain active. Worker model
defaults and generated CLI configuration now use the existing shared provider
catalog rather than a stale hardcoded Claude model.

This follows the existing DeepSeek Harness driver contract (no built-in turn
budget, cancellation owned by the driver) without adopting its plugin framework.
The Hermes comparison remains useful for distinguishing explicit budgets from
natural completion, but Hermes itself does have default iteration caps. The
source revisions linked above were re-read for this follow-up. Focused runtime
tests cover useful work past the former cap and explicit deadline cancellation;
they do not establish live model quality.
