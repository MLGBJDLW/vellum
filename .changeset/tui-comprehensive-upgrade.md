---
"@butlerw/vellum": minor
"@vellum/core": minor
---

### TUI Comprehensive Upgrade

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