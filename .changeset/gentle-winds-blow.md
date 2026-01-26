---
"@butlerw/vellum": patch
---

### feat(cli)
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
