# @vellum/eval

## 0.1.2

### Patch Changes

- Updated dependencies [[`29d57e4`](https://github.com/MLGBJDLW/vellum/commit/29d57e424fcd2c1561c116b661be69fe4030865b)]:
  - @vellum/core@0.2.1
  - @vellum/provider@0.4.0

## 0.1.1

### Patch Changes

- Updated dependencies [[`3e393db`](https://github.com/MLGBJDLW/vellum/commit/3e393db36c44f6346d4d1e74232aefb8da940f69)]:
  - @vellum/core@0.2.0
  - @vellum/provider@0.3.0
  - @vellum/shared@0.1.1

## 0.1.0

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

### Patch Changes

- Updated dependencies [[`b9eee03`](https://github.com/MLGBJDLW/vellum/commit/b9eee03cbe78c884814703fd76823e6b64aeaa65)]:
  - @vellum/provider@0.2.0
  - @vellum/core@0.1.15
