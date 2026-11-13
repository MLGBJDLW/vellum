# @vellum/sandbox

## 0.1.2

### Patch Changes

- Prevent non-interactive commands from hanging on open stdin, preserve UTF-8 output
  across stream boundaries, and retain the available prefix when sandbox output exceeds
  its byte limit. Cancel complete subprocess trees through one shared implementation,
  correctly distinguish cancellation from timeout, and avoid blocking the Windows
  event loop during process cleanup. Handle background startup failures without
  unhandled process errors and preserve captured output when display callbacks fail.
  Resolve Windows termination tools from the system directory without relying on
  PATH, report cleanup failures with a direct-child fallback, and honor cancellation
  that arrives before background startup is acknowledged.

## 0.1.1

### Patch Changes

- Updated dependencies [[`3e393db`](https://github.com/MLGBJDLW/vellum/commit/3e393db36c44f6346d4d1e74232aefb8da940f69)]:
  - @vellum/shared@0.1.1
