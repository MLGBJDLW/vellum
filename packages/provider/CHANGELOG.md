# @vellum/provider

## 0.4.1

### Patch Changes

- Repair JSON Schema compatibility for tool parameters, including numeric bounds
  and nested schemas. Preserve provider-specific reasoning and streamed tool calls
  across tool-result continuations.
- Use Google's native JSON Schema field, including tuple and reference preservation,
  and honor endpoint, header, and timeout settings in inference and credential checks.
- Apply Mistral/local message rules to actual requests; retain DeepSeek cache and
  reasoning usage, supported low effort, and its 393216-token output limit.
- Reject invalid tool arguments and incomplete/interrupted streams. Credential
  probes use the configured provider endpoint and its own default model.
- Keep environment credentials and account headers scoped to their provider.
  Normalize legacy tuples without breaking references and require real completion
  markers from Chat, Responses, Anthropic and Google streaming APIs.

## 0.4.0

### Minor Changes

- [#87](https://github.com/MLGBJDLW/vellum/pull/87) [`29d57e4`](https://github.com/MLGBJDLW/vellum/commit/29d57e424fcd2c1561c116b661be69fe4030865b) Thanks [@MLGBJDLW](https://github.com/MLGBJDLW)! - Repair terminal mouse reports leaking into the composer and restore Backspace,
  Delete, paste, modifier shortcuts, and rapid editing through one ordered terminal
  input path. Keep large model catalogs within the terminal viewport, preserve
  current values when submitting forms, and remove conflicting persistence shortcuts.
  Paint dialogs above the conversation, restore Escape dismissal, and hydrate saved
  session timestamps before rendering the session manager.
  
  Refresh supported provider catalogs and discovery, preserve current model
  capabilities and reasoning transport, and share catalog updates with adapter
  model lists. Discover native local model capabilities without dropping tools or
  configured authentication, and retain SDK request timeouts for long reasoning.
  Remove implicit per-role worker limits while retaining explicit
  budgets, task deadlines, cancellation, and repetition detection.
  
  Upgrade the dependency graph and terminal runtime, remove obsolete dependencies
  and CI caches, and require Node.js 22.22.1+ or 24.11.0+ on their respective release
  lines. Release jobs publish and tag the exact reviewed merge commit.

## 0.3.0

### Minor Changes

- [#85](https://github.com/MLGBJDLW/vellum/pull/85) [`3e393db`](https://github.com/MLGBJDLW/vellum/commit/3e393db36c44f6346d4d1e74232aefb8da940f69) Thanks [@MLGBJDLW](https://github.com/MLGBJDLW)! - Make orch the default personal assistant, with adaptive planning and working specialist delegation. Repair local credential discovery, masked key entry, and provider cache refresh. Update the verified model catalog and current provider protocols. Keep verification failures inside the repair loop, preserve explicit budgets and cancellation, and remove implicit long-task cutoffs. Improve terminal streaming, history scrolling, and sidebar focus without adding a second rendering or orchestration system.

### Patch Changes

- Updated dependencies [[`3e393db`](https://github.com/MLGBJDLW/vellum/commit/3e393db36c44f6346d4d1e74232aefb8da940f69)]:
  - @vellum/shared@0.1.1

## 0.2.0

### Minor Changes

- [`b9eee03`](https://github.com/MLGBJDLW/vellum/commit/b9eee03cbe78c884814703fd76823e6b64aeaa65) Thanks [@MLGBJDLW](https://github.com/MLGBJDLW)! - ### feat(eval)

  - New @vellum/eval package: Agent Evaluation Framework V3
  - Task definition and loading with Zod schema validation
  - EvalHarness for isolated evaluation environments
  - ResultChecker with V3 fixes: weighted scores, LLM Judge support
  - Reporter with pass@K metrics and regression detection
  - Token and cost tracking per evaluation run
  - Progress events for TUI integration

  ### feat(provider)

  - Added MockProvider for deterministic testing and evaluation

  ### feat(cli)

  - New `eval` command with full options: --task, --model, --temperature, --samples
  - Three example tasks included: easy, medium, hard difficulty levels
