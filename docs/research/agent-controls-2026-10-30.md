# Agent controls and long tasks — 2026-10-30

## Requested behavior

1. Remove unnecessary execution deadlines and whole-task budgets while retaining cancellation, explicit user budgets, model limits and bounded memory.
2. Keep the composer available during thinking. A submitted steering message interrupts model generation immediately, preserves partial visible content, and continues the same task with the new instruction. An active tool finishes; undispatched tool calls receive skipped receipts.
3. Restore the composer to the available chat width.
4. Keep a visible, clickable sidebar opener after closing the sidebar, with its keyboard shortcut.
5. Put a model-aware effort picker immediately after Thinking; persist the preference and pass it to the actual provider request.
6. Recheck supported providers and model lifecycle, use English release notes, preserve the existing CI matrix, review the PR, release the validated commit, and remove temporary build artifacts.

## Upstream source comparison

- [Pi's loop](https://github.com/earendil-works/pi/blob/main/packages/agent/src/agent-loop.ts) consumes steering through the existing iterative driver. Vellum uses that ownership pattern; it additionally aborts the current model stream to meet the requested immediate steering behavior.
- [Codex unified execution](https://github.com/openai/codex/blob/main/codex-rs/core/src/unified_exec/mod.rs) separates process lifetime, cancellation and output buffering. Vellum keeps its existing shell executor, removes its implicit wall-clock deadline, and streams retained output to the existing output directory with backpressure.
- [Hermes terminal execution](https://github.com/NousResearch/hermes-agent/blob/main/tools/terminal_tool.py) promotes over-cap foreground jobs to managed background processes. The useful principle is preserving running work; Vellum does not add another process manager or copy Hermes' foreground cap.
- [DeepSeek Harness's driver](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent-loop/src/agent.ts) owns queued input, cancellation and tool recovery at the driver boundary. Vellum preserves tool call/result pairing when steering supersedes undispatched calls.
- [Zed configuration controls](https://github.com/zed-industries/zed/blob/main/crates/agent_ui/src/config_options.rs) refresh available reasoning choices after a model switch. Vellum derives its picker and request validation from the same provider catalog.

## Runtime findings

The outer tool executor still enforced 30 seconds for regular tools and two minutes for shell tools. Shell/bash also supplied a two-minute parameter default; verification commands supplied one minute. The outer timeout aborted a controller that the tool did not receive. These defaults are removed, and timeout/caller cancellation now reaches the executing tool. Zero means no application deadline. Network discovery, shutdown, retry, memory, context-window and explicit budget protections remain.

The shell's capped return buffer had an uncapped second copy of stdout/stderr. Output now streams to a unique file with backpressure; files are removed for small outputs and retained using the existing seven-day policy for truncated output. Disk-write failure does not grow an in-memory fallback or terminate the command.

MCP tool calls no longer have an application default deadline, and their cancellation signal reaches the SDK. The installed MCP SDK always installs a timer and has no public disabled-timeout setting: its native wait uses the largest safe Node timer (2,147,483,647 ms, about 24.9 days). Explicit server timeouts still apply. Provider/server limits remain outside Vellum's control.

The composer regression came from an intrinsic-width child inside the new mouse click wrapper. A rendering regression reproduces 40 columns inside a 90-column target before the fix, and 90 columns after it.

## Provider audit

The [October 29 catalog audit](provider-modernization-2026-10-29.md) is the starting snapshot. All 17 adapters were rechecked; static catalogs remain offline fallbacks, while `/model refresh <provider>` uses the existing dynamic discovery path. Availability in a public listing is not proof of access for a particular account. No paid model request was made.

| Provider | October 30 evidence and action |
| --- | --- |
| OpenAI | [Models](https://developers.openai.com/api/docs/models) and [reasoning](https://developers.openai.com/api/docs/guides/reasoning) confirm current GPT-6/6.1 routes and model-specific efforts. [Deprecations](https://developers.openai.com/api/docs/deprecations) distinguish announced future shutdowns from already unavailable models. |
| Anthropic | [Current models](https://platform.claude.com/docs/en/models/overview) retain Fable 5.1 and Claude 5.5. Added the missing retired Haiku 3 replacement from the [lifecycle table](https://platform.claude.com/docs/en/about-claude/model-deprecations). |
| Google | [Models](https://ai.google.dev/gemini-api/docs/models) retain Argon and current Flash families. Added missing retired Gemini 2.0 IDs to migration handling using the [shutdown table](https://ai.google.dev/gemini-api/docs/deprecations); 2.5 is still served to eligible existing users. |
| DeepSeek | [Direct API IDs](https://api-docs.deepseek.com/quick_start/pricing) remain `deepseek-flash` and `deepseek-v4-pro`; accepted aliases are not treated as dead endpoints. |
| Qwen | [Current lifecycle updates](https://www.alibabacloud.com/help/en/model-studio/newly-released-models) retain the current text families. Speech/video-only releases are outside this interactive text-agent transport. |
| Groq | [Supported models](https://console.groq.com/docs/models) retain the current production/preview catalog; account-specific enterprise restrictions remain documented. |
| xAI | [Models](https://docs.x.ai/developers/models) retain the Grok 4.7/4.6 API routes. |
| OpenRouter | Refreshed the public [models endpoint](https://openrouter.ai/api/v1/models): 456 records, 43 current-family offline entries. This refresh updates advertised gateway metadata without adding runtime polling. |
| Zhipu | [GLM-5.3](https://docs.bigmodel.cn/cn/guide/models/text/glm-5.3) remains current; existing native thinking mapping is retained. |
| Moonshot | [Current model list](https://platform.kimi.ai/docs/models) retains K3.1, K3 and eligible K2.7/K2.6 routes. New-account restrictions are not mistaken for general retirement. |
| MiniMax | [Compatible API](https://platform.minimax.io/docs/api-reference/text-openai-api) retains the M3.1/M3 contract. |
| Mistral | [Model list](https://docs.mistral.ai/models) confirms Large 4 and the hosted GLM/DeepSeek routes already in the catalog. |
| Doubao | The [Ark table](https://docs.volcengine.com/docs/ark/model-list?lang=zh) timed out on two fresh fetches. Keep the October 29 verified entries; no unsupported retirement or newer ID is claimed. |
| Yi | The [official portal](https://platform.lingyiwanwu.com/docs) does not expose a complete current model table. Existing deployment IDs remain; availability needs account confirmation. |
| Baichuan | The [official portal](https://platform.baichuan-ai.com/docs-v2/api) requires business access. No retirement is inferred from that access restriction. |
| Ollama | [Native discovery](https://docs.ollama.com/api/tags) remains the source for installed models, rather than assuming a fixed local inventory. |
| LM Studio | [Native model metadata](https://lmstudio.ai/docs/developer/rest/list) exposes `capabilities.reasoning.allowed_options` and its default. Discovery now reads these fields so local reasoning choices reach the same effort picker. |

## Validation boundaries

Focused tests cover immediate steering during unfinished thinking in both stream paths, tool-batch steering in sequential/parallel modes, ordering and single-run completion, explicit cancellation, default long tool execution, timeout propagation, shell output persistence, composer width, effort selection/persistence/request propagation, catalog discovery and model retirement. Existing provider and layout suites remain in use. No extra CI job or dependency is added.

Full checks and PR review are recorded in the pull request. Tests with fixture providers establish request/lifecycle behavior; they do not establish paid-account availability or real-model answer quality.
