# @vellum/cli

> Command-line interface for the Vellum AI coding agent

## Installation

```bash
pnpm add @vellum/cli
```

## Usage

```bash
# Start interactive mode
vellum

# Run with a specific prompt
vellum "Create a React component"

# Run with a configuration file
vellum --config vellum.config.json
```

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
```

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
```

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
```

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
```

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
```

### Command Result Types

Commands return one of four result types:

| Type | Description |
|------|-------------|
| `success` | Command completed successfully |
| `error` | Command failed with error code and message |
| `interactive` | Command needs user input to continue |
| `pending` | Command started an async operation |

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
