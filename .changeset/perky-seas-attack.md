---
"@butlerw/vellum": minor
---

feat(tui): comprehensive TUI upgrade

- **Security**: Fixed 5 vulnerabilities via pnpm update, added hono>=4.11.4 override
- **Cleanup**: Removed 8 unused packages (neo-blessed, ora, ink-text-input, etc.) and tui-blessed folder
- **Kitty Keyboard Protocol**: Enhanced terminal input with modifier key detection
- **Async Fuzzy Search**: Non-blocking `fuzzySearchAsync()` with AbortSignal support
- **Shimmer Effects**: Added visual feedback to InlineToolCall and PermissionDialog
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
