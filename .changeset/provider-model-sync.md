---
"@butlerw/vellum": patch
---

### fix(provider)
- Added DoubaoProvider implementation for ByteDance Doubao models
- Fixed registry to include all 17 provider cases (was missing doubao)

### fix(core)
- Synchronized ProviderNameSchema with ProviderType (17 providers)
- Removed unused providers from schema (azure-openai, gemini, vertex-ai, cohere, fireworks, together, perplexity, bedrock)
- Updated onboarding default models for doubao, minimax, moonshot to valid catalog models

### feat(cli)
- Added PROVIDER_KEY_HINTS for new providers: qwen, moonshot, zhipu, yi, baichuan, doubao, minimax, xai, lmstudio
- Updated ModelSelector PROVIDER_INFO with icons/names for all 17 providers
- Updated ModelIndicator PROVIDER_ICONS/NAMES for all providers

### chore(i18n)
- Added English and Chinese translations for new providers
