---
"@butlerw/vellum": patch
---

### feat(lsp): Add LSP Auto-Mode for automatic language detection and server lifecycle management

- Implement `AutoModeController` state machine for managing LSP server lifecycle with three modes:
  - `auto`: Automatically install and start servers without user intervention
  - `semi-auto`: Request user confirmation before install/start actions  
  - `manual`: Only detect languages, no automatic actions
- Add `LanguageDetector` for workspace scanning with efficient directory traversal
- Create confirmation UI components (`LspConfirmDialog`, `useLspConfirmation` hook)
- Add auto-mode state tracking in sidebar `SystemStatusPanel` with enhanced status indicators
- Implement `LspHub.enableServer()` and `disableServer()` APIs with config persistence
- Add `/lsp enable <server>` and `/lsp disable <server>` slash commands with async operation support

### fix(lsp): Improve Windows compatibility and error handling

- Fix `LanguageClient` spawn with `shell: true` on Windows platform
- Add early exit detection to prevent write-after-destroy race condition
- Capture stderr for better error messages during server startup failures
- Enhance InitFailedError with early exit information

### chore(cli): Improve development workflow

- Update `scripts/dev.mjs` to build and watch `@vellum/lsp` package alongside core
- Add separate log file for LSP dev output (`dev-lsp.log`)

### refactor(core): Code quality improvements

- Fix type import for `Stats` in file-management tool
- Remove unnecessary constructor in test mock classes
- Fix non-null assertion warnings in controller integration tests
