# TUI continuity and accounting audit — 2026-11-03

## Scope and baseline

The clean local checkout was fast-forwarded to `origin/main` (`398ece4`) before creating `feature/tui-continuity-0.6.1`. This is one patch release from 0.6.0. Existing immediate Enter steering, cancellation, tool receipts, context compaction, and the iterative agent driver are reused.

## Upstream source comparison

- [Pi agent loop](https://github.com/earendil-works/pi/blob/main/packages/agent/src/agent-loop.ts): consume queued steering around preparation and tool boundaries in one driver.
- [Codex composer](https://github.com/openai/codex/blob/main/codex-rs/tui/src/bottom_pane/chat_composer.rs): distinguish accepting/editing input from submitting it. Vellum uses Tab for accepting a ghost draft and Enter for submission, including steering while busy.
- [Hermes terminal tool](https://github.com/NousResearch/hermes-agent/blob/main/tools/terminal_tool.py): retain command progress and isolate process output. Vellum retains its existing executor and bounds installer diagnostics instead of introducing another process manager.
- [DeepSeek Harness driver](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent-loop/src/agent.ts): explicit ownership of cancellation and pending work. Output-limit continuation uses Vellum's existing driver and termination guards.
- [Zed configuration controls](https://github.com/zed-industries/zed/blob/main/crates/agent_ui/src/config_options.rs): reasoning choices change with model capabilities. Vellum uses its catalog for both the effort menu and request validation.

## Confirmed defects and implementation

The LSP installer inherited stdout/stderr, allowing npm/pip output to corrupt Ink's frame. Both pipes are now drained privately; only the final 8 KiB of diagnostic text is retained. Shell previews decode serialized output and strip terminal control sequences instead of displaying escaped JSON. Reasoning-only messages do not show an empty-body placeholder. Missing embedded persistence/tip translations are restored.

The thinking indicator had a component-local clock, so hiding/remounting it restarted elapsed time. The parent now owns the task start timestamp, and elapsed time is derived from the clock instead of counting interval callbacks.

The old enabled/budget/priority controls conflicted with reasoning effort. The CLI now has one request control: model-aware effort, including explicit `none` only on models that support it. Display controls remain separate, and saving effort preserves those preferences. Removed controls and their obsolete tests are deleted. Migration details are in [the TUI guide](../tui.md#conversation-continuity-061).

Output-token exhaustion was treated as normal task completion. The stream handler now preserves the provider's stop reason; the driver continues a nonempty, progressing truncated response while checking existing resource, step, repetition and cancellation guards. It does not add another execution loop or remove user-specified limits.

## Accounting contracts

- [Anthropic cache usage](https://platform.claude.com/docs/en/build-with-claude/prompt-caching): cache read/write tokens are separate from uncached input. Total prompt occupancy includes all three.
- [DeepSeek cache usage](https://api-docs.deepseek.com/guides/kv_cache/), [OpenRouter response usage](https://openrouter.ai/docs/api/reference/overview), and [Gemini usage](https://ai.google.dev/gemini-api/docs/caching): cache counts must not be billed twice within prompt totals. Google thoughts are separate from candidate tokens; OpenAI reasoning is included in output tokens.
- Footer totals use provider reports and normalize these differences. Cache hit percentage uses reads divided by total prompt tokens. Costs use the existing detailed calculator, include cache/reasoning and context tiers, and carry an estimate marker. Unknown prices remain unknown. Streams without usage do not fabricate zero-token reports.
- Sidebar context is the last main-agent request's input occupancy, not cumulative session spend. Compaction measurements are labeled estimates. Clearing sessions or switching models invalidates old measurements. Unknown discovered capacities are explicitly marked instead of presenting an internal fallback as provider metadata. Compact terminals include the context row too.

## Provider inventory recheck

The prior [17-adapter audit](provider-model-audit.md) was rechecked against primary sources. Catalog membership is not a guarantee of account access; no paid inference was performed.

| Provider | Source and result |
| --- | --- |
| OpenAI | [Models](https://developers.openai.com/api/docs/models): current GPT-6 Astra / GPT-6.1 Sol and Terra remain the current catalog families. Explicit `none` now survives into the Responses request. |
| Anthropic | [Overview](https://platform.claude.com/docs/en/models/overview): Fable 5.1 and Claude 5.5 families retained. |
| Google | [Models](https://ai.google.dev/gemini-api/docs/models): Argon and current Flash families retained. |
| DeepSeek | [Pricing](https://api-docs.deepseek.com/quick_start/pricing/): direct IDs remain separate from gateway-specific IDs. |
| Qwen | [Lifecycle updates](https://www.alibabacloud.com/help/en/model-studio/newly-released-models): retain current Qwen text/tool families; do not add non-chat modalities to this transport. |
| Groq | [Models](https://console.groq.com/docs/models): production/preview and account restrictions remain distinct. |
| xAI | [Models](https://docs.x.ai/developers/models): retain public Grok routes; no private product inferred as a public endpoint. |
| OpenRouter | Live [model endpoint](https://openrouter.ai/api/v1/models) returned 451 records; 44 current-family entries retained in the offline shortlist. Added the returned GLM-5.3-FlashX-Legal route and refreshed advertised prices/output limits. |
| Zhipu | [GLM-5.3](https://docs.bigmodel.cn/cn/guide/models/text/glm-5.3): retain documented direct routes; gateway availability is not treated as proof of a direct API ID. |
| Moonshot | [Models](https://platform.kimi.ai/docs/models): K3.1/K3 and eligible K2 families retained. |
| MiniMax | [API](https://platform.minimax.io/docs/api-reference/text-openai-api): current compatible text routes retained. |
| Mistral | [Models](https://docs.mistral.ai/models): current text/tool routes retained. |
| Doubao | [Ark model list](https://docs.volcengine.com/docs/ark/model-list?lang=zh) returned a JavaScript shell without a model table. Retain previously verified routes; no new retirement claim. |
| Yi | [Portal](https://platform.lingyiwanwu.com/docs) timed out. Retain prior deployment IDs; current account availability remains unverified. |
| Baichuan | [API portal](https://platform.baichuan-ai.com/docs-v2/api) exposes general/medical API navigation without a complete public inventory. No unsupported removal. |
| Ollama | [Installed-model API](https://docs.ollama.com/api/tags) remains authoritative for each local machine. |
| LM Studio | [Model metadata](https://lmstudio.ai/docs/developer/rest/list) remains authoritative for installed capabilities and limits; absent capacity is shown as unknown. |

## Validation and review

Focused regressions cover installer stdio, ghost acceptance, elapsed-time remounts, shell previews, cache ratios, all 17 accounting adapters, actual serialized reasoning effort, output continuation and explicit step limits. The existing full suite passed 494 files and 13,571 tests before final review repairs; final results belong to the PR. No CI job or dependency was added. Old toggle/budget UI tests were removed or updated.

A Windows terminal run of the built CLI used the existing local HTTP fixture and an isolated profile. Enter steering interrupted an unfinished reasoning request after about 21 seconds; the corrected request completed all 140 output lines, and the process exited with code 0. No release download or paid model request was used.

Review round one found a P1 explicit-step-budget bypass in output continuation, plus P2 effort serialization, context invalidation/provenance, compact context visibility and display-preference persistence issues. These were repaired with focused verification; the second review checks closure.
