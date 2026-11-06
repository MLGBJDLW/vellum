# Provider catalog and transport audit — 2026-11-06

All 17 existing adapters were checked: 13 cloud providers with readable current
documentation or a public model endpoint, two cloud providers with incomplete
public inventory (Yi and Baichuan), and two local providers whose installed-server
inventory is authoritative. This audit does not certify account entitlements,
regional deployments, or successful paid inference. No paid completion was sent.

The offline catalog now contains 182 records, of which 168 are selectable; local
catalogs intentionally contain no preinstalled-model claims. Nineteen documented
routes were added and eight shut-down routes were removed. Ten additional records
are marked deprecated but retained for explicit configuration and metadata lookup.
Provider-scoped explicit refresh remains the source for broader account-specific
inventory. No startup network polling, dependency, CI job, or second catalog was
introduced.

## Inventory decisions

| Provider | Records / selectable | Evidence and result |
| --- | --- | --- |
| OpenAI | 26 / 15 | [Current models](https://developers.openai.com/api/docs/models/all) and [retirements](https://developers.openai.com/api/docs/deprecations): remove shut-down GPT-5-Codex, GPT-5.1-Codex/Max/Mini, GPT-5.2-Codex and o4-mini. Their exact documented replacements are available to existing configuration migration. Mark GPT-5, Mini/Nano, GPT-5.1, GPT-5.3-Codex, GPT-5.4-Nano, o3 and GPT-4o-Mini deprecated; do not force-migrate these still-callable endpoints. Add GPT-5.5, GPT-5.5-Pro and GPT-5.2-Pro. Current GPT-6/6.1 and GPT-5.6 families remain. |
| Anthropic | 14 / 13 | [Lifecycle table](https://platform.claude.com/docs/en/about-claude/model-deprecations) and current [overview](https://platform.claude.com/docs/en/models/overview): retain 5.5 and Fable 5.1, add active legacy Opus/Sonnet/Fable 5, retain Sonnet 4.5 metadata as deprecated. Restricted Mythos availability is not inferred from the public flagship catalog; authorized discovery and custom IDs remain available. |
| Google | 10 / 8 | [Models](https://aistudio.google.com/docs/models.md) and [deprecations](https://aistudio.google.com/docs/deprecations.md): Argon and current Flash routes remain. Gemini 2.5 Pro/Flash are deprecated, with existing-user access and routing changes scheduled December 1; 2.5 Flash-Lite is not deprecated. Add the documented 3.7-to-3.8 and 3.5-to-3.6 Flash aliases without duplicate picker rows. Image generation, Live, transcription and video-only products are outside this text/tool transport. |
| DeepSeek | 2 / 2 | [Models/pricing](https://api-docs.deepseek.com/quick_start/pricing/): direct IDs remain `deepseek-flash` and `deepseek-v4-pro`; Flash aliases still route to V4.1 Flash 1017. Vision, 1M context and 384K output flags remain consistent. Direct and gateway IDs are not conflated. |
| Qwen | 19 / 19 | [Text models](https://www.alibabacloud.com/help/en/model-studio/text-generation-model/) and [release inventory](https://www.alibabacloud.com/help/en/model-studio/newly-released-models): Qwen3.8 Max/Flash and Qwen3.7 families remain current. Regional deployment availability and prices are not borrowed from another region. Explicit discovery/custom IDs cover broader deployments. |
| Groq | 7 / 7 | [Models](https://console.groq.com/docs/models) and [retirements](https://console.groq.com/docs/deprecations): Compound/Compound Mini shut down September 21 and are removed without inventing an equivalent replacement. Enterprise Llama routes remain because their retirement notice exempts committed-spend enterprise customers. GPT-OSS, Qwen3.8 and enterprise previews remain distinct. |
| xAI | 2 / 2 | [Models](https://docs.x.ai/developers/models): keep public Grok 4.7/4.6 routes and Responses replay. The November Imagine image-quality change does not affect the text/tool adapter. No private Fast model or media endpoint is presented as a chat model. |
| OpenRouter | 44 / 44 | The live [models endpoint](https://openrouter.ai/api/v1/models) returned 454 records. Regenerated the existing 44-entry current-family shortlist with the existing script, including advertised pricing, sampling capabilities and known capacity. Full explicit refresh still discovers the broader text catalog. Direct-provider retirement rules never remove a gateway route merely because its name resembles a direct model. |
| Zhipu | 12 / 12 | [GLM-5.3](https://docs.bigmodel.cn/cn/guide/models/text/glm-5.3) and [Flash](https://docs.z.ai/guides/llm/glm-5.3-flash): current GLM family retained; required reasoning and direct-provider IDs remain explicit. BigModel and international deployment pricing are not assumed equal. |
| Moonshot | 6 / 6 | [Model inventory](https://platform.kimi.ai/docs/models): keep K3.1 Pro/Highspeed, K3 and existing-user K2.6/2.7 routes. Planned future retirement is not treated as an already-failed endpoint. |
| MiniMax | 2 / 2 | [OpenAI-compatible API](https://platform.minimax.io/docs/api-reference/text-openai-api): M3.1 Flash and M3 remain the supported direct text/vision routes. Required thinking, reasoning split and original reasoning replay remain intact. |
| Mistral | 11 / 11 | [Catalog](https://docs.mistral.ai/models) and [hosted DeepSeek V4.1 Flash](https://docs.mistral.ai/models/deepseek-v4-flash-1017): existing Large 4, GLM and DeepSeek routes already cover the new lineup. Correct the hosted DeepSeek vision flag; keep its Mistral-specific 128K output ceiling and prices. |
| Doubao / Ark | 17 / 17 | The readable [Chinese model table](https://docs.volcengine.com/docs/ark/model-list?lang=zh) supplements the English JavaScript shell. Add 13 published tool-capable routes: supported Seed/LTS/character models, GLM 5.3 Flash/5.2, Kimi K3.1 Pro and DeepSeek V4.1/GA variants. Preserve Ark IDs, context and output limits instead of copying direct-provider metadata. Do not invent missing prices or add entries marked for imminent shutdown. |
| Yi | 5 / 5 | The [official portal](https://platform.lingyiwanwu.com/docs) exposes navigation but no readable complete current inventory. Retain existing deployment IDs and explicitly leave access unverified; absence from the shell is not retirement evidence. |
| Baichuan | 5 / 5 | The [official API portal](https://platform.baichuan-ai.com/docs-v2/api) exposes general/medical navigation and business-access instructions without a complete public inventory. Keep existing deployment IDs; no unverified addition or retirement. |
| Ollama | dynamic | [Installed-model listing](https://docs.ollama.com/api/tags) is authoritative per machine; existing native discovery keeps local capabilities and configured context. |
| LM Studio | dynamic | [Native listing](https://lmstudio.ai/docs/developer/rest/list) reports model type, loaded instances, context and reasoning options. Keep installed-server discovery and conservative unknown-capability behavior. |

## Request compatibility and metadata

The installed Anthropic SDK sends API version `2026-10-21`. The vendor's
[parameter retirement table](https://platform.claude.com/docs/en/about-claude/model-deprecations)
removes sampling parameters for every model on this version. The adapter previously
sent `temperature = 1` when enabling legacy budget thinking, and user sampling
values when thinking was off. Both now omit removed fields while preserving the
budget or adaptive thinking protocol. A request-level regression failed on both
old branches before the fix. Claude 4.6 effort metadata also includes documented
`max` support from the [effort reference](https://platform.claude.com/docs/en/build-with-claude/effort).

[GPT-5.5 Pro](https://developers.openai.com/api/docs/models/gpt-5.5-pro) does not
support streaming. The existing completion fallback is reused for any model that
reports `supportsStreaming: false`, including Responses routes. It now carries
tool arguments, usage and provider-scoped reasoning replay into the normal event
pipeline. Streaming-capable routes retain their streaming transport. Sparse model
discovery preserves the known non-streaming flag rather than turning streaming
back on after refresh.

The direct OpenAI adapter opts into public [reasoning summaries](https://developers.openai.com/api/docs/guides/reasoning#reasoning-summaries)
for supported reasoning models. Explicit `none`, disabled thinking, unknown models
and other Responses-compatible providers do not opt in. An account that can invoke
a model but is denied summaries gets a single retry without that optional field,
only for a summary-specific 400/403 rejection before any output. The initialized
client remembers the denial for that model. Other errors propagate normally.

Discovery now builds one metadata index per provider instead of repeatedly
filtering/scanning the entire catalog. Sparse responses preserve known capacity,
aliases and deprecation state. An explicit active lifecycle can reactivate a
deprecated entry; confirmed shutdown IDs remain excluded. Deprecated records keep
metadata for explicit selection without reappearing in the default picker.

Pricing corrections use the model's owning endpoint: [GPT-5.4 and Pro](https://developers.openai.com/api/docs/models/gpt-5.4-pro)
have 1.05M context, Pro costs $30/$180 per million input/output tokens and only
accepts medium/high/xhigh effort; [GPT-5.2 Pro](https://developers.openai.com/api/docs/models/gpt-5.2-pro)
has 400K context. Current GPT-6 cache rates are taken from the individual
[Astra](https://developers.openai.com/api/docs/models/gpt-6-astra),
[Terra](https://developers.openai.com/api/docs/models/gpt-6.1-terra),
[Sol](https://developers.openai.com/api/docs/models/gpt-6-sol) and
[Luna](https://developers.openai.com/api/docs/models/gpt-6-luna) pages.
[Gemini pricing](https://aistudio.google.com/docs/pricing.md) corrects 2.5 Flash's
standard text rates and cache reads. Prices remain estimates: long-context,
storage, service-tier, regional and promotional adjustments are not comprehensively
modeled by this change, and catalog descriptions disclose relevant surcharges.

## Verification

Provider type checking and Biome checks pass. The provider suite covers request
serialization, non-streaming tool/replay continuity, deprecated versus retired
discovery, provider isolation, aliases, defaults and schema validity. It uses local
fixtures; account entitlements and actual inference remain untested. Full-repository
validation and release status are recorded by the parent PR workflow.
