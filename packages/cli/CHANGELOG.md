# @butlerw/vellum

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
