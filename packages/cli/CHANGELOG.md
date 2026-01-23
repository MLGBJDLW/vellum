# @butlerw/vellum

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
