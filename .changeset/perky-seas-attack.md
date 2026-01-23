---
"@vellum/cli": minor
"@vellum/core": patch
---

### TUI Comprehensive Upgrade

#### Security

- Fixed 5 security vulnerabilities via pnpm update
- Added pnpm override for hono>=4.11.4

#### Code Cleanup

- Removed 8 unused packages (neo-blessed, ora, ink-text-input, @types/blessed, @types/react-test-renderer, sinon, @types/sinon, blessed)
- Deleted orphaned tui-blessed folder (5 files)

#### New Features

- **Kitty Keyboard Protocol**: Enhanced terminal input with modifier key detection
  - New: `kitty-keyboard-protocol.ts` utility
  - New: `useKittyKeyboard.ts` hook
  - Auto-enables in supported terminals (Kitty, WezTerm, iTerm2, VS Code)

- **Async Fuzzy Search**: Non-blocking search for large datasets
  - Added `fuzzySearchAsync()` with AbortSignal support
  - Added `searchMultiFieldAsync()` with chunked processing
  - CHUNK_SIZE=1000 for optimal responsiveness

- **Enhanced Shimmer Effects**: Visual feedback during operations
  - Added shimmer to InlineToolCall during "running" state
  - Added shimmer to PermissionDialog header and tool name
