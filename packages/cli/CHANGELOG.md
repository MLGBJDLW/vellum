# @butlerw/vellum

## 0.1.20

### Patch Changes

- [#50](https://github.com/MLGBJDLW/vellum/pull/50) [`dd0bf6f`](https://github.com/MLGBJDLW/vellum/commit/dd0bf6f95ff9c653f43da65b8f7ffab3e8d93887) Thanks [@MLGBJDLW](https://github.com/MLGBJDLW)! - ### fix(tui)
  - Prevented the header separator from rendering a bare numeric node that could crash Ink.

## 0.2.0

### Minor Changes

- [#48](https://github.com/MLGBJDLW/vellum/pull/48) [`6501547`](https://github.com/MLGBJDLW/vellum/commit/6501547ec3b9c23acde2aaccb644e46ab9b5b805) Thanks [@MLGBJDLW](https://github.com/MLGBJDLW)! - ### feat(tui)

  - Added Git line statistics display (+xxx -xxx) after changed files count in HeaderBar
  - Line stats use semantic colors: additions in green, deletions in red
  - Added version number display to StatusBar

  ### fix(tui)

  - Wired checkUpdateOnStartup() to setUpdateAvailable state for update notifications

## 0.1.18

### Patch Changes

- [#45](https://github.com/MLGBJDLW/vellum/pull/45) [`4c2f539`](https://github.com/MLGBJDLW/vellum/commit/4c2f539686cd51cc0d4ec2409269462d0c10e86a) Thanks [@MLGBJDLW](https://github.com/MLGBJDLW)! - ### feat(cli)

  - Added `/lsp` slash command with subcommands: status, install, detect, start, stop, restart, config, enable, disable, update, export, import
  - Added `LspSetupPanel.tsx` interactive UI with batch install and project detection
  - Enhanced autocomplete with 3-level support (command → subcommand → argument)
  - Added `Alt+L` keyboard shortcut to open LSP panel

  ### feat(core)

  - Added file management tools: `move_file`, `copy_file`, `delete_file`, `create_directory`
  - Updated base.md and mode prompts with new tool groups (filesystem, lsp)

  ### fix(core)

  - Fixed markdown linting issues in prompt files (MD022, MD025, MD031, MD032, MD036, MD040, MD041, MD058)

  ### feat(lsp)

  - Added `lsp_rename` tool for symbol renaming via LSP
  - Changed `autoInstall` from boolean to `"auto" | "prompt" | "never"` enum with backward compatibility
  - Added pending install management with callbacks for "prompt" mode

- [#45](https://github.com/MLGBJDLW/vellum/pull/45) [`def325a`](https://github.com/MLGBJDLW/vellum/commit/def325ae8d54ae3db957265a116090d9478c392c) Thanks [@MLGBJDLW](https://github.com/MLGBJDLW)! - ### feat(lsp): Add LSP Auto-Mode for automatic language detection and server lifecycle management

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

## 0.1.17

### Patch Changes

- [#41](https://github.com/MLGBJDLW/vellum/pull/41) [`23fa287`](https://github.com/MLGBJDLW/vellum/commit/23fa287dd8f46211a7accc656cd47220de6452b5) Thanks [@MLGBJDLW](https://github.com/MLGBJDLW)! - Disable Ink Static message rendering to keep history inside the layout and prevent scrollback bleed in the TUI, and make several related improvements:

  - Update translations and branding (Assistant → Vellum).
  - Remove unused UI components (ChatView, status-bar, message-list, input, header).
  - Remove the unused `useScrollEventBatcher` hook.
  - Enhance the mode controller with message count thresholds and hysteresis.
  - Improve input history storage with `localStorage` plus a file-based fallback.
  - Add comprehensive tests for session, agent, and integration controllers.
  - Add responsive overlay positioning logic for better TUI layout behavior.

## 0.1.16

### Patch Changes

- [#39](https://github.com/MLGBJDLW/vellum/pull/39) [`620cb4d`](https://github.com/MLGBJDLW/vellum/commit/620cb4dc0182c49b518bc6cdb94c991c040485c7) Thanks [@MLGBJDLW](https://github.com/MLGBJDLW)! - Fix CodeBlock copy button tests to use translated labels and quiet CLI bundle warnings during build.

## 0.1.15

### Patch Changes

- [#37](https://github.com/MLGBJDLW/vellum/pull/37) [`11be22c`](https://github.com/MLGBJDLW/vellum/commit/11be22c4b0ce19553cfc2eeb9023f15feb9070b0) Thanks [@MLGBJDLW](https://github.com/MLGBJDLW)! - Context management improvements and bug fixes

  ### Context Management Improvements (packages/core)

  - Add SummaryQualityValidator (P0-1): Validates compression quality to ensure summaries retain critical information
  - Add TruncationStateManager (P0-2): Manages truncation state with support for restoring truncated messages
  - Add CrossSessionInheritanceResolver (P1-1): Enables cross-session context inheritance
  - Add SummaryProtectionFilter (P1-2): Protects summary messages from cascading compression
  - Add DiskCheckpointPersistence (P2-1): Disk-based checkpoint persistence with crash recovery support
  - Add CompactionStatsTracker (P2-2): Tracks compaction statistics for monitoring compression efficiency
  - 16 new files in `packages/core/src/context/improvements/`
  - 173 new tests, all passing

  ### Slash Command Menu Selection Fix (packages/cli)

  - Fix incorrect command selection when choosing from `/` menu
  - `onSelectionChange` callback now passes the actual selected option
  - Use `selectedOption` directly to get the selected item

  ### OpenTelemetry Fix (packages/core)

  - Fix `@opentelemetry/resources` v2.x breaking change: `Resource` → `resourceFromAttributes`

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

## 0.1.13

### Patch Changes

- [#33](https://github.com/MLGBJDLW/vellum/pull/33) [`7e30609`](https://github.com/MLGBJDLW/vellum/commit/7e306099be2ef74b0b73d7afc222ba411e630f90) Thanks [@MLGBJDLW](https://github.com/MLGBJDLW)! - ### Virtual Scroll Optimization

  Complete implementation of virtual scroll optimization for the TUI message list, delivering smooth 60fps scrolling even with large conversation histories.

  #### Key Features

  **Performance Architecture**

  - O(1) anchor compensation using block sums for instant scroll position recalculation
  - Render budget monitoring with automatic quality degradation under pressure
  - Incremental markdown parsing to avoid blocking the main thread

  **Scroll Behavior**

  - 3-state follow mode FSM: `auto` (tracks new content), `locked` (manual position), `off` (disabled)
  - Terminal-specific scroll normalization handling differences between VS Code, ConPTY, and native terminals
  - Smooth scroll animation with configurable easing curves
  - Scroll past end with rubberband effect for natural feel

  **UX Improvements**

  - Streaming message separation keeping partial content visually distinct
  - New messages banner when scrolled up with unread content below
  - Nested scroll focus regions for code blocks and tool outputs

  This is an internal performance improvement with no API changes.

## 0.2.0

### Minor Changes

- [#31](https://github.com/MLGBJDLW/vellum/pull/31) [`c6d3af8`](https://github.com/MLGBJDLW/vellum/commit/c6d3af8578b7a8002619adae313e6858708337a5) Thanks [@MLGBJDLW](https://github.com/MLGBJDLW)! - feat(tui): comprehensive TUI upgrade

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

- [#31](https://github.com/MLGBJDLW/vellum/pull/31) [`961c7be`](https://github.com/MLGBJDLW/vellum/commit/961c7bec16622c66c71e25c8e0971a4a2be152d7) Thanks [@MLGBJDLW](https://github.com/MLGBJDLW)! - chore(telemetry): upgrade OpenTelemetry SDK to latest

  - Upgrade @opentelemetry/sdk-node from 0.46.0 to 0.211.0
  - Upgrade @opentelemetry/api from 1.7.0 to 1.9.0
  - Upgrade @opentelemetry/resources from 1.18.0 to 2.0.0
  - Migrate from deprecated Resource class to resourceFromAttributes function

### Patch Changes

- [#31](https://github.com/MLGBJDLW/vellum/pull/31) [`d662bcf`](https://github.com/MLGBJDLW/vellum/commit/d662bcfcb3fee0b7d236efb8ebb1671a7e1274fb) Thanks [@MLGBJDLW](https://github.com/MLGBJDLW)! - fix(tui): resolve critical rendering and scroll issues

  - Fix thinking block not auto-collapsing after streaming ends
  - Fix header duplication/flickering with tighter render batching
  - Fix virtual scroll follow mode losing sticky-to-bottom state
  - Add LRU eviction to collapsible storage (max 100 entries)
  - Add React.memo to 4 components for render optimization

- [#31](https://github.com/MLGBJDLW/vellum/pull/31) [`c23b7d2`](https://github.com/MLGBJDLW/vellum/commit/c23b7d2c6b94c234153bb4030bfa9969fdd0a11f) Thanks [@MLGBJDLW](https://github.com/MLGBJDLW)! - fix(tui): memory and performance improvements

  - Fix abort listener memory leak in permission handler
  - Optimize shell output updates with O(1) lookup
  - Clear tool call tracking map on execution clear

- [#31](https://github.com/MLGBJDLW/vellum/pull/31) [`7907da8`](https://github.com/MLGBJDLW/vellum/commit/7907da83af34a35bfcfd1220c0f5d74c65c349dd) Thanks [@MLGBJDLW](https://github.com/MLGBJDLW)! - chore(lint): fix biome lint errors across 5 files

  - Update biome.json schema version from 2.3.10 to 2.3.12
  - Fix React hook dependencies in PromptInput.tsx
  - Fix React hook dependencies in ChatView.tsx
  - Fix React hook dependencies in MessageRenderer.tsx
  - Fix dependency array formatting in MessageList.tsx

## 0.2.0

### Minor Changes

- [#27](https://github.com/MLGBJDLW/vellum/pull/27) [`3fadc78`](https://github.com/MLGBJDLW/vellum/commit/3fadc782ca69000e4784ca46a936cb16be8bc995) Thanks [@MLGBJDLW](https://github.com/MLGBJDLW)! - fix(credentials): resolve keytar missing package error in npm install

  - Add `keytar` as optionalDependency in cli package to ensure it's available at runtime
  - Switch from explicit KeychainStore to HybridCredentialStore for automatic fallback
  - When keytar is unavailable (e.g., missing build tools), gracefully fall back to encrypted file storage
  - Fixes "Cannot find package 'keytar'" error when running global npm install

## 0.1.10

### Patch Changes

- [#25](https://github.com/MLGBJDLW/vellum/pull/25) [`8c96136`](https://github.com/MLGBJDLW/vellum/commit/8c961369c2340a943408b3fbd312c11f4994a0b8) Thanks [@MLGBJDLW](https://github.com/MLGBJDLW)! - ### fix(release)

  - Fixed release.yml regex patterns for changelog categorization by adding `^- ` prefix to match git log output format

  ### chore(cleanup)

  - Removed orphaned `RateLimitIndicator.tsx` component (never integrated into TUI)
  - Removed deprecated `LoopEvent` type from `packages/core/src/types.ts` (inlined into agent.ts)
  - Removed deprecated type files from `packages/shared/src/types/`:
    - `agent.ts`, `message.ts`, `provider.ts`, `tool.ts`
  - Updated barrel exports in `packages/shared/src/index.ts` and `packages/core/src/index.ts`

## 0.1.9

### Patch Changes

- [#23](https://github.com/MLGBJDLW/vellum/pull/23) [`f8f8d11`](https://github.com/MLGBJDLW/vellum/commit/f8f8d11d832704de5e5b16b5394da2cfebb9573e) Thanks [@MLGBJDLW](https://github.com/MLGBJDLW)! - Fix slash commands broken chains and complete implementations

  - Connect 7 groups of broken command chains to registry (agent, trust, mcp, workflow, copy, open, commit)
  - Fix 8 additional unregistered commands (status, usage, spec-workflow, env, sandbox, init-prompts, validate-prompts, migrate-prompts)
  - Resolve /spec naming conflict by renaming workflow spec to /spec-workflow
  - Connect WIP commands (progress, install, uninstall) to their backends
  - Implement sandbox commands (status, enable, disable) connecting to @vellum/sandbox
  - Implement /env command for environment variable display with sensitive value filtering
  - Implement /session list connecting to SessionListService
  - Complete /mcp remove with auto-delete from config
  - Add /metrics export functionality
  - Fix /tutorial stop subcommand
  - Remove unused subcommand definitions (/custom-agents edit, /tutorial prev, /tutorial demo)
  - Delete redundant setup.ts (already covered by /onboard alias)

## 0.1.8

### Patch Changes

- [`ac0d8f8`](https://github.com/MLGBJDLW/vellum/commit/ac0d8f829f32d40f7559f3c946edf9dfa6e9e351) Thanks [@MLGBJDLW](https://github.com/MLGBJDLW)! - fix(ci): improve release workflow zip creation and title formatting

  - Recursively exclude all node_modules directories from release zip (fixes 592MB bloat)
  - Exclude build artifacts, logs, and temporary files from zip
  - Fix release notes title to show "vellum v0.1.7" instead of "@butlerw/vellum @butlerw/vellum@0.1.7"

## 0.1.7

### Patch Changes

- [`b290aeb`](https://github.com/MLGBJDLW/vellum/commit/b290aebd8759996278f82cb82d6294acbe9ced9f) Thanks [@MLGBJDLW](https://github.com/MLGBJDLW)! - Generate GitHub release notes from commit history with grouped sections and bot filtering.

- [`7ad5b3c`](https://github.com/MLGBJDLW/vellum/commit/7ad5b3c9cbaee0557ec1a86fe11a4a911bf9794c) Thanks [@MLGBJDLW](https://github.com/MLGBJDLW)! - Ensure onboarding runs when config is missing and align CLI onboarding checks.

## 0.1.6

### Patch Changes

- [`c7c4670`](https://github.com/MLGBJDLW/vellum/commit/c7c4670c45b896ef7fe5ab96cdc6ad62084cadc8) Thanks [@MLGBJDLW](https://github.com/MLGBJDLW)! - Fix CLI runtime issues:
  - Include prompt files in npm package (fixes "Prompt base not found" error)
  - Remove debug console.log statements from production build
  - Silence deprecation warnings in StatusBar component

## 0.1.5

### Patch Changes

- [`7ef0f35`](https://github.com/MLGBJDLW/vellum/commit/7ef0f351090fafef6ec65feb658b2dbdb8d36392) Thanks [@MLGBJDLW](https://github.com/MLGBJDLW)! - Fix ESM module loading error when running CLI globally

  Changes build output from CJS to ESM format with CJS compatibility banner to properly handle ESM-only dependencies (ink, shiki, etc.) that use top-level await.

## 0.1.4

### Patch Changes

- [`20a1a99`](https://github.com/MLGBJDLW/vellum/commit/20a1a99d0fcf23b2f48ddb8bcc474488264b8835) Thanks [@MLGBJDLW](https://github.com/MLGBJDLW)! - Fix CI release workflow to properly detect new tags and skip GitHub release creation when no new packages are published.

## 0.1.3

### Patch Changes

- [`1c71975`](https://github.com/MLGBJDLW/vellum/commit/1c71975798a89f9f9265561b682eb98c9f4711cd) Thanks [@MLGBJDLW](https://github.com/MLGBJDLW)! - Fix CLI build output to CJS to avoid dynamic require errors on Node.js 22.

## 0.1.2

### Patch Changes

- [`b346219`](https://github.com/MLGBJDLW/vellum/commit/b3462190e71f6162973f51b2a66fb56cd2591f49) Thanks [@MLGBJDLW](https://github.com/MLGBJDLW)! - fix: exclude Node.js built-in modules from bundle

- [#9](https://github.com/MLGBJDLW/vellum/pull/9) [`dc3472a`](https://github.com/MLGBJDLW/vellum/commit/dc3472a50181e6a4d49d5177e2030167191ff233) Thanks [@MLGBJDLW](https://github.com/MLGBJDLW)! - - include cache read/write + thinking tokens in usage tracking and UI breakdowns
  - stabilize agent file watching on Windows by honoring stop boundaries

## 0.1.1

### Patch Changes

- [#2](https://github.com/MLGBJDLW/vellum/pull/2) [`5d11888`](https://github.com/MLGBJDLW/vellum/commit/5d118888be6c8e165c01ea5df2f9fc423d9ca5c8) Thanks [@MLGBJDLW](https://github.com/MLGBJDLW)! - ## New Features

  ### LSP Integration

  - LSP tools now exposed to AI Agent (12 tools: diagnostics, hover, definition, references, etc.)
  - Added textDocument/implementation support for finding interface implementations
  - Added 150ms diagnostic debounce to reduce frequent updates
  - Event-driven status updates (replaces polling)
  - 30 integration tests for LSP hub lifecycle

  ### Tool Enhancements

  - read_file: Added lineRange param ("100-250" format) and pagination hints
  - search*files: Added fileGlob param for file type filtering (*.ts, \_.py)
  - list_dir: Added ignorePatterns and tree format output

  ### UX Improvements

  - Removed ESC key program exit (use Ctrl+C or /exit instead)

  ### Publishing Fix

  - Fixed npm publishing with tsup bundling configuration
