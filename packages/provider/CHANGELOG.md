# @vellum/provider

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
