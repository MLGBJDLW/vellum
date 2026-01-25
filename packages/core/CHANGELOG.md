# @vellum/core

## 0.2.0

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
