# Agent awareness and terminal UX research — 2026-11-06

## Scope

This audit compares current primary-source implementations in Pi, Codex, Hermes,
DeepSeek Harness, and Zed. The clean Vellum checkout was fast-forwarded to
`origin/main` (`bbd91e4`, v0.6.1) before `feature/agent-awareness-ui` was created.
Recommendations below describe intended Vellum adaptations, not claims that every
upstream feature has been ported. No upstream package or second agent loop is needed.

## Sources inspected

| Project | Source revision | Relevant behavior |
| --- | --- | --- |
| Pi (the old `badlogic/pi-mono` repository now redirects) | `earendil-works/pi` at `2a32a605a9f18a5f0191f65358a2e764b2f69fc7` | [Footer](https://github.com/earendil-works/pi/blob/2a32a605a9f18a5f0191f65358a2e764b2f69fc7/packages/coding-agent/src/modes/interactive/components/footer.ts) computes context occupancy separately from cumulative spend, shows unknown occupancy as `?`, uses warning above 70% and error above 90%, and constrains output to terminal width. [Agent loop](https://github.com/earendil-works/pi/blob/2a32a605a9f18a5f0191f65358a2e764b2f69fc7/packages/agent/src/agent-loop.ts) collects steering before requests and again after potentially long preparation. |
| Codex | `b3c5a494589ccedc1232bf219edb4103a50fd357` | [Streaming UI](https://github.com/openai/codex/blob/b3c5a494589ccedc1232bf219edb4103a50fd357/codex-rs/tui/src/chatwidget/streaming.rs) derives an activity header from the latest nonempty reasoning summary line, removes heading/bold markup, and keeps the previous header when no usable line arrives. Tool waiting, compaction, and pending review take priority. [Shell detection](https://github.com/openai/codex/blob/b3c5a494589ccedc1232bf219edb4103a50fd357/codex-rs/shell-command/src/shell_detect.rs) chooses PowerShell on Windows and a discovered user shell with platform fallbacks on POSIX. |
| Hermes | `57cc40f4699fec61361780a6e6836068eff271a2` | [Local environment](https://github.com/NousResearch/hermes-agent/blob/57cc40f4699fec61361780a6e6836068eff271a2/tools/environments/local.py) explicitly identifies Windows, normalizes Windows/MSYS paths, discovers its supported shell, and uses compatible invocation conventions. Hermes intentionally requires Bash, including Git Bash on Windows; that is a product choice, not evidence that Vellum should try Bash first. |
| DeepSeek Harness | `fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159` | The official repository is `deepseek-ai/deepseek-harness`. Its [base composition](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/bundle/base/cordis.patch.yml) enables Bash components on POSIX and PowerShell twins on Windows. Its [PowerShell executor](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/shell/pwsh-local/src/index.ts) resolves the executable once, passes the command as one argv value, sets UTF-8 output, and bounds in-memory output. |
| Zed | `4a6121bb0f10c6e8037b741b7dc0a4cd639ae289` | [Configuration controls](https://github.com/zed-industries/zed/blob/4a6121bb0f10c6e8037b741b7dc0a4cd639ae289/crates/agent_ui/src/config_options.rs) build selectors from session configuration IDs and refresh them when capabilities change, including reasoning choices after a model switch. This supports one authoritative control for each setting. |

## Recommended Vellum adaptations

### Useful activity text without another model request

Use an existing model-provided summary or concise line from the active response as
the Thinking detail. Prefer a completed heading or sentence, strip terminal control
characters and Markdown decoration, and keep it short enough for one terminal row.
Do not fabricate the model's intended next action when no such text exists; use a
neutral state label until useful content arrives.

Codex's approach supplies the interaction pattern, but Vellum should inspect only a
bounded suffix or cache parsed text so a long reasoning response does not require a
full-buffer scan on every token. Reset activity on a new task/session and preserve
the higher-priority actual tool, compaction, waiting, or approval state. This is an
additional UX improvement to the requested summary: the user sees what is blocking
or executing now, instead of stale thinking text. Source: [Codex streaming UI](https://github.com/openai/codex/blob/b3c5a494589ccedc1232bf219edb4103a50fd357/codex-rs/tui/src/chatwidget/streaming.rs).

### Context pressure that remains honest

Render the existing latest main-agent request occupancy as a fixed-width bar with
the numeric percentage. Reuse the theme's normal, warning, and error colors so the
bar has a consistent meaning. Preserve the existing estimated marker after local
compaction. Unknown model capacity or unknown usage must remain unknown, not become
an empty green bar. Clamp only the visual fill; an over-capacity numeric value is
still useful evidence. Source: [Pi footer](https://github.com/earendil-works/pi/blob/2a32a605a9f18a5f0191f65358a2e764b2f69fc7/packages/coding-agent/src/modes/interactive/components/footer.ts).

Make the bar adapt to the narrow sidebar too, and keep the percentage readable
without color. This is a small accessibility and compact-layout improvement rather
than a new settings surface.

### One mode control

Retain one discoverable L0–L2 selector and its existing keyboard route. Remove the
duplicate rendering rather than maintaining two independently updated displays.
Reasoning effort and execution mode are distinct concepts and should not be merged
as a side effect. Zed supplies the useful structural pattern: a selector binds to
one authoritative configuration ID, and available values follow current session
capabilities. Source: [Zed config options](https://github.com/zed-industries/zed/blob/4a6121bb0f10c6e8037b741b7dc0a4cd639ae289/crates/agent_ui/src/config_options.rs).

### Identify the execution environment before generation

Resolve the runtime OS, selected executable, shell dialect, and working directory
before the first request, then put the same facts into the model-visible prompt and
the actual shell tool. Codex's [environment context](https://github.com/openai/codex/blob/b3c5a494589ccedc1232bf219edb4103a50fd357/codex-rs/core/src/context/world_state/environment.rs)
renders detected shell and cwd, with cached optional PowerShell version detection.
DeepSeek's [shell architecture](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/shell/README.md)
keeps exactly one selected executor behind the tools. Together these support fixing
Vellum's prompt/executor agreement without maintaining duplicate execution systems.

On native Windows, choose the available PowerShell implementation and explain its
command syntax. An explicitly selected shell should remain an intentional override.
WSL is a Linux execution environment; its commands must not receive Windows-native
PowerShell guidance merely because the machine hosting WSL is Windows. Bound any
executable probe and reuse the result. Do not scan arbitrary user environment values
or include credentials in the model context.

### Long tasks and performance

Vellum already defaults the agent iteration count to infinity and makes elapsed,
step, and token budgets opt-in (`packages/core/src/agent/loop.ts` and
`packages/core/src/agent/termination.ts`). This audit found no reason to add a new
global limit or to remove explicit user budgets, cancellation, or repetition guards.

DeepSeek's [agent driver](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/core/agent-loop/src/agent.ts)
uses one phase-owned driver, an abort controller per activity, cancellation checks
at async/stream boundaries, and durable settlement of interrupted output. Pi's
[loop](https://github.com/earendil-works/pi/blob/2a32a605a9f18a5f0191f65358a2e764b2f69fc7/packages/agent/src/agent-loop.ts)
rechecks steering after preparation. Preserve Vellum's existing equivalent lifecycle
and improve bounded rendering and startup probes around it. A visual change should
not add another polling loop, per-token network call, unbounded retained buffer, or
parallel task owner.

## Validation boundaries

Source inspection confirms the upstream mechanisms above, not account availability,
provider quality, or a universal UX ranking. Vellum should verify its own request
prompt, actual Windows shell invocation, live activity updates, narrow layouts,
unknown context values, and mode navigation. Reuse existing targeted test suites and
the current CI matrix; no additional CI jobs or upstream dependencies are warranted
by this research. Provider inventories and retirement evidence are tracked in the
separate provider catalog audit.

## Local acceptance

The first-request regression originally received only the mode prompt; it now
receives the working directory, OS, and actual execution shell with both default
and custom prompts. A native Windows PowerShell 5.1 pipeline round-tripped `中`
through a Node child process after setting the child process's UTF-8 encodings.

An isolated Windows terminal session ran the built CLI against a loopback HTTP
fixture. Its single model request included the Windows environment and did not
advertise `bash`. The collapsed header updated as the fixture supplied new intent
sentences, the footer showed one `orch·L0` control, and the narrow sidebar showed
`12%` and `120K/1.0M tokens` for the reported request. The fixture completed all
20 output lines and `/exit` returned code 0. No provider inference or release
download was used for this check.
