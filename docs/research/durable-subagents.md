# Durable subagents and task visibility

Source review: November 13, 2026. Vellum keeps one orchestrator, worker loop and
workspace task store. This comparison informs specific behavior; it does not
claim feature parity or measured superiority over upstream projects.

| Project | Inspected primary source | Applied decision |
| --- | --- | --- |
| Pi | [Session manager](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/session-manager.ts) records messages, parent links, model changes and compaction entries. | Persist real conversation state and model identity, not just task status. Preserve existing context compaction. |
| Codex | [Agent control](https://github.com/openai/codex/blob/main/codex-rs/core/src/agent/control.rs) separates agent ownership, resumed history, status subscriptions and shutdown. | The runtime owns worker snapshots; UI subscribes without becoming a second scheduler. Reuse parent permissions and budgets on recovery. |
| Hermes | [Delegation tool](https://github.com/NousResearch/hermes-agent/blob/main/tools/delegate_tool.py) isolates child context and reports progress, failure and interruption. | Show actual worker lifecycle and partial results, distinguish cancellation from successful completion, and preserve cancellation fan-out. |
| DeepSeek Harness | [Agent loop contract](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/core/agent-loop/README.md) covers durable history, resumed sessions and explicit recovery receipts. | Save receipt-complete iterations before the next model request; resume explicitly and stop on storage failure. Keep user-requested budgets without hidden default task deadlines. |
| Zed | [Subagent card](https://github.com/zed-industries/zed/blob/main/crates/agent_ui/src/conversation_view/subagent_card.rs) and [thread runtime](https://github.com/zed-industries/zed/blob/main/crates/agent/src/thread.rs) connect nested activity to thread lifecycle. | Put compact worker cards inside Tasks, with live activity and expandable details. Keep failures visible and retain independent cancellation ownership. |

## Runtime and recovery

Delegations save versioned checkpoints to the existing `.vellum/tasks` directory.
Each checkpoint contains the task plan, dependency groups, worker transcripts,
completed results, model route and explicit turn budget. Files are validated,
written through a private temporary file, synced and atomically replaced. Saves
for one task are serialized; an exclusive owner lock prevents overlapping runs
across processes. A confirmed exited local owner can be recovered. Unknown or
foreign lock owners are never assumed dead.

`vellum delegate <agent> <task>` now executes the real worker through the same
parent permission and budget owners used by chat. `vellum resume` lists unfinished
work; `vellum resume <taskId>` continues its stored plan in the original workspace.
`--instruction` supplies a continuation. Chat can use `delegate_agent` with a
`resumeId`. Completed steps are reused; unfinished workers restore saved history.
Legacy status-only files remain on disk but are not reported as recoverable.

Recovery is explicit. It does not provide exactly-once external side effects:
an abrupt process or machine failure between a tool effect and its durable receipt
can leave an uncertain outcome. Resumed workers are instructed to inspect the
workspace before repeating uncertain operations. No background daemon or second
goal engine is introduced. Credentials and approval grants are not checkpointed;
conversation/tool contents retain the same sensitivity as session history.

## Visibility and resource use

The nested Tasks panel displays queued, running, waiting, completed, failed and
cancelled work, latest activity, turns, tokens and model route. Keyboard and mouse
navigation expose all retained entries. Narrow terminals clip by display width,
including CJK; short terminals switch between Tasks and Subagents. Streaming
activity is batched locally instead of repainting the whole app on every chunk.
Runtime history remains bounded without imposing a lifetime execution limit.

The old status-only resumption implementation and duplicate UI task listeners
were removed. Existing platform CI remains unchanged. Tests cover durable restart,
receipt reuse, storage failure, ownership, cancellation, explicit budgets,
dependency failures, event batching, navigation and narrow layouts. Provider
validation is documented in the [complete provider audit](provider-catalog-2026-11-13.md).
