---
"@butlerw/vellum": patch
---

Update model catalog with latest provider models; add session control plane commands and metrics lifecycle tracking

**Provider model updates (`@vellum/provider`):**

- Google: add Gemini 3.1 series (`gemini-3.1-pro-preview`, `gemini-3.1-flash-preview`, `gemini-3.1-flash-lite-preview`, `gemini-3.1-flash-live-preview`); deprecate `gemini-3-pro-preview` (removed March 26 2026); update default to `gemini-3.1-flash-preview`
- Anthropic: add Claude 4.6 (`claude-opus-4-6`, `claude-sonnet-4-6`) and `claude-haiku-4-5-20251001`
- OpenAI: add GPT-5.4 series (flagship/mini/nano/pro) and `gpt-5.3-codex`, `gpt-5.2-codex`; deprecate `gpt-4.1`/`gpt-4o` (retired Feb–Apr 2026)
- DeepSeek: add `deepseek-v4` (1T MoE, 1M context, multimodal, $0.30/$0.50); update R1 pricing
- Qwen: add `qwen3.6-plus`, `qwen3.5-plus-02-15`, `qwen3.5-flash`
- xAI: add `grok-4.20`; fix `grok-4.1-fast` pricing ($0.20/$0.50)
- Zhipu: add `glm-5` (744B, frontier coding) and `glm-4.7-flash` (free)
- MiniMax: add `MiniMax-M2.5` and `MiniMax-M2.7`

**CLI changes (`@butlerw/vellum`):**

- Add session archive command and shared session utilities
- Enhance session commands (list, show, delete, export) with control-plane integration
- Add tool lifecycle metrics aggregation (`attachToolLifecycleMetrics`)
