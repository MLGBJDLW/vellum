---
"@butlerw/vellum": patch
---

### refactor(tui)
- MessageList V2: Simplified API with always-virtualized rendering
- Deprecated legacy props (historyMessages, pendingMessage, isLoading, etc.)
- New streamlined props interface (messages, isStreaming, isFocused)

### fix(tui)
- Fixed message duplication bug during streaming→stable transition
- Fixed alignToBottom behavior for short content in VirtualizedList
- Added exhaustive switch default cases for type safety

### chore(tui)
- Removed unused useModeController hook
- Removed unused slidingWindow module
