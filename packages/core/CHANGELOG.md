# @vellum/core

## 0.2.2

### Patch Changes

- Add shared search/fetch configuration, DeepSeek Search/Fetch and other configurable
  web services, with bounded requests and provider fallback that preserves filters,
  permissions and cancellation. Keep existing web tools compatible.
- Generate JSON Schema input definitions for tools, preserving numeric constraints
  and optional defaulted parameters across registry, container, and worker paths.
- Preserve original MCP schemas and restore tool identities after provider-safe
  name encoding. Carry typed provider failures through stream processing and retry
  decisions, so schema errors stop and transient failures retain bounded retries.
- Updated dependencies:
  - @vellum/provider@0.4.1

## 0.2.1

### Patch Changes

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
- Updated dependencies [[`29d57e4`](https://github.com/MLGBJDLW/vellum/commit/29d57e424fcd2c1561c116b661be69fe4030865b)]:
  - @vellum/provider@0.4.0

## 0.2.0

### Minor Changes

- [#85](https://github.com/MLGBJDLW/vellum/pull/85) [`3e393db`](https://github.com/MLGBJDLW/vellum/commit/3e393db36c44f6346d4d1e74232aefb8da940f69) Thanks [@MLGBJDLW](https://github.com/MLGBJDLW)! - Make orch the default personal assistant, with adaptive planning and working specialist delegation. Repair local credential discovery, masked key entry, and provider cache refresh. Update the verified model catalog and current provider protocols. Keep verification failures inside the repair loop, preserve explicit budgets and cancellation, and remove implicit long-task cutoffs. Improve terminal streaming, history scrolling, and sidebar focus without adding a second rendering or orchestration system.

### Patch Changes

- Updated dependencies [[`3e393db`](https://github.com/MLGBJDLW/vellum/commit/3e393db36c44f6346d4d1e74232aefb8da940f69)]:
  - @vellum/provider@0.3.0
  - @vellum/shared@0.1.1
  - @vellum/sandbox@0.1.1

## 0.1.15

### Patch Changes

- Updated dependencies [[`b9eee03`](https://github.com/MLGBJDLW/vellum/commit/b9eee03cbe78c884814703fd76823e6b64aeaa65)]:
  - @vellum/provider@0.2.0

## 0.1.14

### Minor Changes

- [#35](https://github.com/MLGBJDLW/vellum/pull/35) [`24d366c`](https://github.com/MLGBJDLW/vellum/commit/24d366c90b959f563d578f301203e832ebe51833) Thanks [@MLGBJDLW](https://github.com/MLGBJDLW)! - ### TUI Comprehensive Upgrade

  #### Role System

  - Multi-layer prompt loading (base + role + mode)
  - `--role` CLI parameter for specifying agent role
  - `/role` slash commands for runtime role switching
  - `RoleManager` class with Unicode icons in StatusBar

  #### UX Improvements

  - `Alt+Y` shortcut for theme toggle
  - ThinkingBlock typewriter effect for streaming content
  - ThinkingBlock header shimmer animation
  - Smooth scrolling with `useAnchorWithEffect` hook

  #### Code Quality

  - Remove deprecated `useScroll` export from ScrollContext
  - Remove deprecated `interval` prop from Spinner
  - ENV variable support for layout constants (7 new variables)
  - LSP tool guidance in base.md system prompt

## 0.1.1

### Patch Changes

- [#9](https://github.com/MLGBJDLW/vellum/pull/9) [`dc3472a`](https://github.com/MLGBJDLW/vellum/commit/dc3472a50181e6a4d49d5177e2030167191ff233) Thanks [@MLGBJDLW](https://github.com/MLGBJDLW)! - - include cache read/write + thinking tokens in usage tracking and UI breakdowns
  - stabilize agent file watching on Windows by honoring stop boundaries
