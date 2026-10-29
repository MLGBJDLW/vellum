# @vellum/provider

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
