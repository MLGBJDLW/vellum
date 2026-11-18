---
"@butlerw/vellum": patch
"@vellum/provider": minor
"@vellum/core": patch
---

Refresh the model catalog across all 17 adapters. Add current GPT-6.2, Qwen, GLM and Grok routes, correct legacy identifiers, and use native discovery where the provider exposes an account or local inventory. Request visible Claude adaptive thinking summaries when enabled. Preserve the previous local inventory on discovery failure and clear removed models after a successful empty response.
