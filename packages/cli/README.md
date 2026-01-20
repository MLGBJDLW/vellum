# @vellum/cli

> Command-line interface for the Vellum AI coding agent

## Installation

```bash
pnpm add @vellum/cli
```markdown

## Usage

```bash
# Start interactive mode
vellum

# Run with a specific prompt
vellum "Create a React component"

# Run with a configuration file
vellum --config vellum.config.json
```markdown

## TUI System

The CLI provides a rich Terminal User Interface (TUI) built with React Ink. The TUI system is modular and customizable.

### Architecture

```
tui/
├── components/    # UI components
├── context/       # React context providers
├── hooks/         # Custom hooks
├── theme/         # Theming system
├── adapters/      # External integrations
└── i18n/          # Internationalization
```markdown

### Quick Start

```tsx
import { RootProvider, Layout, TextInput, MessageList, StatusBar } from "@vellum/cli";

function App() {
  return (
    <RootProvider theme="dark">
      <Layout
        header={<StatusBar model={{ provider: "anthropic", model: "claude-3" }} />}
        footer={<TextInput value={input} onChange={setInput} />}
      >
        <MessageList messages={messages} />
      </Layout>
    </RootProvider>
  );
}
```markdown

### Core Components

| Component | Description |
|-----------|-------------|
| `RootProvider` | Composes all context providers |
| `Layout` | Main application layout with header/footer/sidebar |
| `TextInput` | Multiline text input with keyboard handling |
| `MessageList` | Message display with auto-scroll |
| `StatusBar` | Model, tokens, and mode indicators |
| `PermissionDialog` | Tool approval dialog |

### Hooks

| Hook | Description |
|------|-------------|
| `useVim` | Vim modal editing mode |
| `useHotkeys` | Keyboard shortcut management |
| `useCopyMode` | Visual text selection and copy |
| `useApp` | Application state access |
| `useMessages` | Message state management |
| `useTools` | Tool execution state |
| `useTheme` | Theme access and switching |

### Themes

Built-in themes: `dark`, `light`, `dracula`, `nord`, `solarized`

```tsx
// Use a preset theme
<RootProvider theme="dracula">

// Or provide a custom theme
<RootProvider theme={customTheme}>
```text

For detailed documentation, see [docs/tui.md](../../docs/tui.md).

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `theme` | `string` | `"dark"` | Color theme |
| `vimMode` | `boolean` | `false` | Enable Vim keybindings |
| `trustMode` | `string` | `"ask"` | Tool approval mode |

## Slash Commands

The CLI provides a powerful slash command system for quick actions and configuration.

### Available Commands

| Command | Aliases | Description |
|---------|---------|-------------|
| `/help [topic]` | `/h`, `/?` | Show help for commands or categories |
| `/clear` | `/cls` | Clear the terminal screen |
| `/exit [--force]` | `/quit`, `/q` | Exit the application |
| `/login [provider]` | `/signin` | Add credential for a provider |
| `/logout [provider]` | `/signout` | Remove credential for a provider |
| `/credentials` | | Show credential status |
| `/language [code]` | `/lang` | Show or change UI language |

### Command Syntax

```bash
# Basic command
/help

# Command with positional argument
/login anthropic

# Command with flags
/exit --force
/exit -f

# Command with flag and value
/login anthropic --store keychain
/login anthropic -s keychain

# Mixed positional and named arguments
/config theme --value dark --global
```markdown

## AGENTS.md Commands

The CLI provides commands for managing AGENTS.md configuration files, which control AI assistant behavior.

### `vellum init`

Create a new AGENTS.md file in the current directory.

```bash
# Interactive wizard (default)
vellum init

# Skip wizard, use minimal defaults
vellum init --minimal

# Overwrite existing file
vellum init --force

# Non-interactive mode for CI
vellum init --non-interactive
```markdown

**Options:**

| Flag | Description |
|------|-------------|
| `--minimal` | Skip prompts, create minimal template |
| `--force`, `-f` | Overwrite existing AGENTS.md |
| `--non-interactive` | Disable interactive prompts (for CI) |

### `vellum agents show`

Display the merged AGENTS.md configuration.

```bash
# Show current configuration
vellum agents show

# Output as JSON
vellum agents show --json

# Show all details including sources
vellum agents show --verbose

# Show config for specific scope
vellum agents show --scope ./src
```markdown

**Options:**

| Flag | Description |
|------|-------------|
| `--json` | Output configuration as JSON |
| `--verbose`, `-v` | Show all details including merge config |
| `--scope <path>` | Show config for specific directory |

### `vellum agents validate`

Validate AGENTS.md files for syntax and structural errors.

```bash
# Validate all AGENTS.md files in project
vellum agents validate

# Validate specific file
vellum agents validate ./AGENTS.md

# JSON output (for CI)
vellum agents validate --json

# Verbose output with warnings
vellum agents validate --verbose
```markdown

**Options:**

| Flag | Description |
|------|-------------|
| `--json` | Output validation results as JSON |
| `--verbose`, `-v` | Show detailed validation info |

**Exit Codes:**

| Code | Meaning |
|------|---------|
| `0` | All files valid |
| `1` | Validation errors found |

### `vellum agents generate`

Generate an AGENTS.md file based on project analysis.

```bash
# Generate from project analysis
vellum agents generate

# Preview without writing file
vellum agents generate --dry-run

# Write to custom path
vellum agents generate --output ./config/AGENTS.md

# Merge with existing file
vellum agents generate --merge
```markdown

**Options:**

| Flag | Description |
|------|-------------|
| `--dry-run` | Preview generated content without writing |
| `--output <path>` | Custom output file path |
| `--merge` | Merge with existing AGENTS.md |

**Detection Features:**

- Project name and description from `package.json`
- Language detection (TypeScript, JavaScript, Python, etc.)
- Framework detection (React, Vue, Next.js, etc.)
- Build tool detection (Vite, Webpack, esbuild)
- Test framework detection (Vitest, Jest, Playwright)
- Package manager detection (npm, pnpm, yarn, bun)

### Autocomplete

The CLI provides intelligent autocomplete for slash commands:

- **Trigger**: Start typing `/` to activate autocomplete
- **Navigate**: Use `↑`/`↓` arrow keys to select candidates
- **Complete**: Press `Tab` to insert the selected command
- **Cancel**: Press `Escape` to dismiss autocomplete

Autocomplete uses fuzzy matching, so typing `/hel` will match both `/help` and `/hello`.

### Adding Custom Commands

You can extend the command system by registering custom commands:

```typescript
import { CommandRegistry, type SlashCommand } from "@vellum/cli";

const myCommand: SlashCommand = {
  name: "greet",
  description: "Send a greeting",
  kind: "user",
  category: "tools",
  positionalArgs: [
    {
      name: "name",
      type: "string",
      description: "Name to greet",
      required: false,
    },
  ],
  namedArgs: [
    {
      name: "loud",
      shorthand: "l",
      type: "boolean",
      description: "Use uppercase",
      required: false,
      default: false,
    },
  ],
  execute: async (ctx) => {
    const name = ctx.parsedArgs.positional[0] ?? "World";
    const loud = ctx.parsedArgs.named.loud;
    const message = `Hello, ${name}!`;
    
    return {
      kind: "success",
      message: loud ? message.toUpperCase() : message,
    };
  },
};

// Register with a CommandRegistry instance
registry.register(myCommand);
```markdown

### Command Result Types

Commands return one of four result types:

| Type | Description |
|------|-------------|
| `success` | Command completed successfully |
| `error` | Command failed with error code and message |
| `interactive` | Command needs user input to continue |
| `pending` | Command started an async operation |

## Internationalization (i18n)

The CLI supports multiple languages for UI text.

### Supported Languages

| Code | Language |
|------|----------|
| `en` | English (default) |
| `zh` | 中文 (Chinese) |

### Setting Language

**Using the `/language` command:**

```bash
# Show current language and available options
/language

# Switch to Chinese
/language zh

# Switch to English
/language en

# Clear preference (use auto-detection)
/language auto
```markdown

**Using the `--language` CLI flag:**

```bash
# Start with Chinese UI
vellum --language zh
vellum -l zh

# Start with English UI
vellum --language en
```markdown

**Using environment variable:**

```bash
# Set default language via environment
export VELLUM_LANGUAGE=zh
vellum
```markdown

### Language Priority

Language is resolved in the following order (highest priority first):

1. `--language` / `-l` CLI flag
2. `VELLUM_LANGUAGE` environment variable
3. Saved preference (from `/language` command)
4. System locale detection
5. Default (`en`)

## Development

```bash
# Run in development mode
pnpm dev

# Build
pnpm build

# Test
pnpm test

# Run benchmarks
pnpm exec vitest bench

# Type check
pnpm typecheck
```

## License

MIT
