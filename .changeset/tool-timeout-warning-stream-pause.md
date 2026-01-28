---
"@butlerw/vellum": patch
---

### feat(core): add tool timeout warning mechanism
- Add `toolTimeoutWarning` event definition
- ToolExecutor emits warning at 80% of timeout threshold
- Include 6 unit tests for timeout warning behavior

### feat(core): add stream pause/resume functionality
- Add PauseSignal class for pause state management
- AgentStreamHandler supports pause checking during streaming
- AgentLoop exposes pause()/resume()/isPaused() API
- Include 26 unit tests for pause/resume behavior

### feat(tui): add timeout and pause UI components
- Add ToolTimeoutContext and ToolTimeoutIndicator for timeout warnings
- Add usePauseShortcut hook (Space key binding)
- Add PauseIndicator component for visual feedback
