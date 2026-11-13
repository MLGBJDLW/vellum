# Provider and model audit — 2026-11-13

This audit covers every adapter in `ProviderType` and `MODEL_CATALOG`: **17 providers**,
including 15 cloud providers and two local servers. The offline catalog contains
189 records, with 175 selectable records. It is a selection aid, not a claim that
one account can access every listed model. Existing explicit `/model refresh <provider>`
discovers account/server inventory; custom IDs remain supported. No startup polling,
second registry, dependency, or CI job was added. No paid inference was performed.

## Coverage and decisions

| Provider | Records / selectable | Official evidence and audit result |
| --- | --- | --- |
| Anthropic | 15 / 14 | [Model overview](https://platform.claude.com/docs/en/models/overview), [lifecycle](https://platform.claude.com/docs/en/about-claude/model-deprecations), and [Fable 5.2](https://platform.claude.com/docs/en/models/fable-5-2/overview): add the November 9 Fable release with always-on adaptive thinking, 1M context, 128K output, five effort levels and endpoint-specific cache rates. Existing models remain active except the already-deprecated Sonnet 4.5. Mythos 5/5.1/5.2 require verified-organization access; authenticated discovery/custom IDs cover these restricted models without advertising universal availability. |
| OpenAI | 26 / 15 | [Catalog](https://developers.openai.com/api/docs/models/all) and [retirements](https://developers.openai.com/api/docs/deprecations): GPT-6 Astra, 6.1 Sol/Terra, 6 Sol/Luna and supported GPT-5 families remain current. Close retirement-filter gaps for dated retired snapshots and discontinued ChatGPT/deep-research routes. Still-callable deprecated routes retain metadata. Restricted Cyber/Rosalind offerings are not assumed available to every account. Media-generation, Realtime and Decisions products use different protocols. |
| Google | 12 / 10 | [Models](https://aistudio.google.com/docs/models.md), [lifecycle](https://aistudio.google.com/docs/deprecations.md), [thinking](https://aistudio.google.com/docs/thinking.md), and [pricing](https://aistudio.google.com/docs/pricing.md): add Carbon and Hydrogen. Hydrogen accepts `xhigh` with `high` default; Carbon accepts low/medium/high with medium default. Keep the 65,536 synchronous output ceiling; 1M long decode needs a separate workflow. Carbon pricing is promotional through November 30. |
| DeepSeek | 2 / 2 | [Models/pricing](https://api-docs.deepseek.com/quick_start/pricing/): `deepseek-flash` still maps to V4.1 Flash 1017; `deepseek-v4-pro` remains available. Existing context, output, thinking and reasoning replay contracts are retained. |
| Qwen | 20 / 20 | [Current models](https://www.alibabacloud.com/help/en/model-studio/text-generation-model/), [Qwen4 preview](https://www.alibabacloud.com/help/en/model-studio/qwen4-max-preview), [Chat API](https://www.alibabacloud.com/help/en/model-studio/qwen-api-via-openai-chat-completions), and [Coder](https://www.alibabacloud.com/help/en/model-studio/qwen-coder): add Qwen4-Max-Preview for Token Plan endpoints; expose current effort controls and avoid mutually exclusive effort/budget fields. Correct Coder Flash tool support and remove unverified zero prices for Coder Flash and Qwen3.6 Plus. Broader open-weight, snapshot and regional routes remain discoverable. |
| Groq | 7 / 7 | [Models](https://console.groq.com/docs/models) and [retirements](https://console.groq.com/docs/deprecations): all seven chat entries remain documented. Llama and limited Muse/MiniMax routes require enterprise access. Compound remains retired; speech and moderation products are excluded. |
| xAI | 2 / 2 | [Models](https://docs.x.ai/developers/models): retain Grok 4.7/4.6 and existing Responses transport/replay. No media-only model is added to chat selection. |
| OpenRouter | 47 / 47 | The public [model endpoint](https://openrouter.ai/api/v1/models) returned 472 records during this audit. Regenerate the existing shortlist, adding Fable 5.2 and Gemini Carbon/Hydrogen with gateway-specific metadata. Full explicit discovery covers the remaining interactive text routes. Declared non-chat endpoints are filtered even if their ID lacks a `:batch` suffix. Direct-provider retirement dates do not remove gateway routes. |
| Zhipu / BigModel | 12 / 12 | [GLM-5.3](https://docs.bigmodel.cn/cn/guide/models/text/glm-5.3) and [Flash/FlashX](https://docs.z.ai/guides/vlm/glm-5.3-flash): current GLM families and required thinking are already covered. BigModel and international Z.ai access, IDs and prices remain distinct. |
| Moonshot / Kimi | 6 / 6 | [Model inventory](https://platform.kimi.ai/docs/models): K3.1 Pro/Highspeed and K3 remain current. K2.6/2.7 are restricted to users registered before November 1 and expected to retire in late December; they remain explicitly available to those users. No premature retirement. |
| MiniMax | 2 / 2 | [OpenAI-compatible API](https://platform.minimax.io/docs/api-reference/text-openai-api): M3.1 Flash and M3 remain the listed text models. Preserve root request fields and original `reasoning_content` during tool continuation. |
| Mistral | 11 / 11 | [Model catalog](https://docs.mistral.ai/models): Large 4, Small 4, hosted GLM/DeepSeek and legacy coding/generalist routes remain covered. Discovery distinguishes chat from embedding/audio/OCR products. Hosted limits remain specific to Mistral. |
| Doubao / Ark | 17 / 17 | [Chinese model table](https://docs.volcengine.com/docs/ark/model-list?lang=zh): all bundled text/tool IDs remain listed, including Seed Evolving, Seed 2.1/LTS, character models and hosted GLM/Kimi/DeepSeek. Do not add soon-to-close routes or substitute direct-provider limits. |
| Yi | 5 / 5 | [Official portal](https://platform.lingyiwanwu.com/docs): readable navigation still does not establish a complete current inventory. Retain existing deployment IDs; availability remains unverified rather than inferring retirement from missing public content. |
| Baichuan | 5 / 5 | [Official portal](https://platform.baichuan-ai.com/docs-v2/api): business-access instructions do not expose a complete public model table. Existing IDs remain available for configured deployments; no unsupported additions or retirement claims. |
| Ollama | dynamic | [Installed model API](https://docs.ollama.com/api/tags): installed-server discovery remains authoritative, with capability enrichment from the existing local adapter. No preinstalled model is assumed. |
| LM Studio | dynamic | [Native model API](https://lmstudio.ai/docs/developer/rest/list): keep loaded-instance context and capability discovery. Embedding and decision models remain outside this chat transport. |

## Compatibility details

Qwen4-Max-Preview requires a Token Plan key and the dedicated
`https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1` base URL;
the existing provider `baseUrl` option handles it. It is not available through the
default pay-as-you-go endpoint. Its announced preview ends November 25, 2026
(UTC+8), so availability must be checked before use after that date. Token Plan
credits are not represented as free USD inference. See the official
[integration guide](https://www.alibabacloud.com/help/en/model-studio/more-tools).

Qwen 3.8/4 reject requests containing both `reasoning_effort` and
`thinking_budget`. An explicit budget now takes precedence; disabling thinking
removes both controls. With no explicit toggle, current effort-capable models keep
their documented thinking default. Original reasoning remains in the existing
provider-scoped assistant metadata, including through tool turns. The same
request construction is exercised for streamed and non-streamed calls.

The Google SDK currently lacks an `XHIGH` enum member. Its serializer accepts the
documented wire value, so the adapter supplies it only after model capability
resolution. Unsupported efforts on Carbon/Argon still resolve to their documented
default. This does not add the separate Interactions long-decode workflow.

The OpenAI retirement lookup recognizes ISO-dated snapshots only when their
rolling model is known to be retired, after checking exact IDs. For example,
`gpt-4o-2024-05-13` remains excluded while `gpt-4o-2024-08-06` is not accidentally
removed. Sparse gateway inventories remain supported when no endpoint list is
provided; an explicit endpoint list must include chat completions.

## Validation boundary

Focused provider tests cover new-model request serialization, Gemini effort
selection, Qwen budget/effort exclusivity and replay, exact retirement filtering,
gateway transport filtering, catalog schema consistency, and existing provider
contracts. They use local fixtures and do not certify account permissions,
regional deployment access, inference quality, or every vendor's live availability.
Full repository checks and release status are recorded in the parent PR.
