---
"@butlerw/vellum": minor
"@vellum/core": patch
"@vellum/provider": minor
---

Repair terminal mouse reports leaking into the composer and restore Backspace,
Delete, paste, modifier shortcuts, and rapid editing through one ordered terminal
input path. Keep large model catalogs within the terminal viewport, preserve
current values when submitting forms, and remove conflicting persistence shortcuts.

Refresh supported provider catalogs and discovery, preserve current model
capabilities and reasoning transport, and share catalog updates with adapter
model lists. Discover native local model capabilities without dropping tools or
configured authentication, and retain SDK request timeouts for long reasoning.
Remove implicit per-role worker limits while retaining explicit
budgets, task deadlines, cancellation, and repetition detection.

Upgrade the dependency graph and terminal runtime, remove obsolete dependencies
and CI caches, and require Node.js 22.22.1+ or 24.11.0+ on their respective release
lines. Release jobs publish and tag the exact reviewed merge commit.
