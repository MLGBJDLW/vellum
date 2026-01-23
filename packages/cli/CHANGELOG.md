# @butlerw/vellum

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
