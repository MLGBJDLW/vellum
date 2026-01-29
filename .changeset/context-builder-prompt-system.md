---
"@butlerw/vellum": patch
---

### feat(prompts)
- Added `ContextBuilder` class for formatting session context (active file, git status, tasks, errors) into prompt-friendly markdown
- Added `PromptBuilder` with fluent API for layered prompt construction (base → role → mode → context)
- Added variable substitution with `{{KEY}}` syntax and size validation (200K char limit)
- Added `PromptLoader` with LRU caching and multi-source discovery
- Added `PromptWatcher` for hot-reload via filesystem watching
- Added `sanitizeVariable()` and `containsDangerousContent()` for prompt injection protection

### feat(prompts/externalized)
- Added externalized role prompts: orchestrator, coder, qa, writer, analyst, architect
- Added externalized mode prompts: vibe, plan, spec
- Added support for MCP, tools, and worker prompt templates

### chore(lint)
- Fixed lint errors and warnings across codebase (143 files)
- Auto-fix format and import organization issues
- Manual fixes: useLiteralKeys, useTemplate, noNonNullAssertion, noUnusedVariables

### fix(tui)
- Fix ThinkingBlock collapsed preview not rendering Markdown (bold text, inline code)
