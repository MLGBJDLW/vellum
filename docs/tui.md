# Vellum TUI Documentation

> Terminal User Interface components and hooks for the Vellum CLI

## Overview

The Vellum TUI is a React-based terminal interface built with [Ink](https://github.com/vadimdemedes/ink). It provides a modular, themeable, and accessible interface for interacting with the AI agent.

## Troubleshooting: Windows VS Code terminal flicker/tearing (Windows + VS Code 集成终端闪屏/撕裂)

### Symptoms (症状)

- On Windows, when running Vellum in VS Code’s Integrated Terminal (TTY), the screen may **flicker** or **tear** during rapid UI updates.

### Fix (解决)

- Vellum now enables **DEC 2026 Synchronized Output** (buffered stdout) by default in supported TTY terminals. In most cases, this removes flicker/tearing **without requiring any VS Code setting changes**.

### PowerShell/ConPTY 默认策略

- 在 PowerShell + ConPTY 环境下，Vellum **默认关闭** alternate buffer，以避免消息满屏时的清屏闪烁问题。
- 如需强制开启，可在 `~/.vellum/settings.json` 中设置：
  - `ui.alternateBuffer: true`

### If the issue still happens (若仍有问题)

- As a temporary workaround, you can disable ConPTY in VS Code:
  - `terminal.integrated.windowsEnableConpty=false`

### Trade-offs (副作用)

- Disabling ConPTY can reduce ANSI/colour capabilities in the integrated terminal (e.g. truecolor / 256-color may degrade).

## Table of Contents

- [Architecture](#architecture)
- [Components](#components)
- [Quick keybindings](#quick-keybindings)
- [Context Providers](#context-providers)
- [Hooks](#hooks)
- [Themes](#themes)
- [Usage Examples](#usage-examples)

---

## Quick keybindings

Vellum’s sidebar panels are designed to be discoverable via keyboard. When the TUI is focused, these shortcuts jump directly to common panels:

| Shortcut | Action |
|---|---|
| `Ctrl+\` | Toggle sidebar |
| `Ctrl+G` | Open **Tools** panel |
| `Ctrl+O` | Open **MCP** panel |
| `Ctrl+P` | Open **Memory** panel |
| `Ctrl+T` | Open **Todo** panel |
| `Ctrl+S` | Open **Sessions** picker |

## Architecture

```text
packages/cli/src/tui/
├── adapters/          # External service adapters
├── components/        # UI components
│   ├── Input/         # Text input components
│   ├── Messages/      # Message display
│   ├── StatusBar/     # Status indicators
│   ├── Tools/         # Tool approval UI
│   └── session/       # Session management
├── context/           # React context providers
├── hooks/             # Custom React hooks
├── i18n/              # Internationalization
└── theme/             # Theming system
```

---

## Components

### RootProvider

The root provider composes all context providers in the correct order.

```tsx
import { RootProvider } from "@vellum/cli";

<RootProvider
  theme="dark"                           // Theme preset or custom theme
  initialAppState={{ vimMode: true }}    // Initial app state
  initialMessages={[]}                   // Initial messages
>
  <App />
</RootProvider>
```markdown

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `theme` | `ThemePreset \| VellumTheme` | `"dark"` | Theme configuration |
| `initialAppState` | `Partial<AppState>` | `{}` | Initial application state |
| `initialMessages` | `Message[]` | `[]` | Initial conversation messages |

---

### Layout

Main application layout with configurable regions.

```tsx
import { Layout } from "@vellum/cli";

<Layout
  header={<StatusBar />}
  footer={<TextInput />}
  sidebar={<Sidebar />}
  showSidebar={true}
  compactMode={false}
>
  <MessageList messages={messages} />
</Layout>
```markdown

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `header` | `ReactNode` | - | Header region content |
| `footer` | `ReactNode` | - | Footer region content |
| `sidebar` | `ReactNode` | - | Sidebar region content |
| `showSidebar` | `boolean` | `true` | Show/hide sidebar |
| `compactMode` | `boolean` | auto | Force compact mode |

**Features:**
- Auto-detects compact mode for narrow terminals (< 80 columns)
- Responsive sidebar width (25% of terminal, 20-40 columns)
- Theme-aware border styling

---

### TextInput

Multiline text input with keyboard handling.

```tsx
import { TextInput } from "@vellum/cli";

<TextInput
  value={value}
  onChange={setValue}
  onSubmit={handleSubmit}
  placeholder="Type a message..."
  multiline={true}
  maxLength={4000}
/>
```markdown

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `value` | `string` | required | Current input value |
| `onChange` | `(value: string) => void` | required | Value change handler |
| `onSubmit` | `(value: string) => void` | - | Submit handler |
| `placeholder` | `string` | - | Placeholder text |
| `multiline` | `boolean` | `false` | Enable multiline mode |
| `disabled` | `boolean` | `false` | Disable input |
| `maxLength` | `number` | - | Maximum character length |
| `focused` | `boolean` | `true` | Enable keyboard handling |

**Keyboard Shortcuts:**

| Key | Single-line | Multiline |
|-----|-------------|-----------|
| `Enter` | Submit | New line |
| `Shift+Enter` | - | New line |
| `Ctrl+Enter` | - | Submit |
| `Arrow keys` | Navigate | Navigate |
| `Backspace` | Delete | Delete |

---

### MessageList

Displays conversation messages with auto-scroll.

```tsx
import { MessageList } from "@vellum/cli";

<MessageList
  messages={messages}
  autoScroll={true}
  maxHeight={20}
  onScrollChange={(isAtBottom) => setShowNewIndicator(!isAtBottom)}
/>
```markdown

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `messages` | `Message[]` | required | Messages to display |
| `autoScroll` | `boolean` | `true` | Auto-scroll on new messages |
| `maxHeight` | `number` | - | Maximum height in lines |
| `onScrollChange` | `(isAtBottom: boolean) => void` | - | Scroll position callback |

**Message Structure:**

```typescript
interface Message {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  toolCalls?: ToolCallInfo[];
}
```text

---

### StatusBar

Displays model, tokens, trust mode, and thinking status.

```tsx
import { StatusBar } from "@vellum/cli";

<StatusBar
  model={{ provider: "anthropic", model: "claude-3-opus" }}
  tokens={{ current: 5000, max: 100000 }}
  trustMode="auto"
  thinking={{ active: true, budget: 10000, used: 2500 }}
  showBorder={true}
/>
```markdown

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `model` | `ModelIndicatorProps` | - | Model information |
| `tokens` | `TokenCounterProps` | - | Token usage |
| `trustMode` | `"ask" \| "auto" \| "full"` | - | Trust mode |
| `thinking` | `ThinkingModeIndicatorProps` | - | Thinking status |
| `showBorder` | `boolean` | `false` | Show border |

---

### PermissionDialog

Tool approval dialog with risk assessment.

```tsx
import { PermissionDialog } from "@vellum/cli";

<PermissionDialog
  execution={toolExecution}
  riskLevel="medium"
  onApprove={handleApprove}
  onReject={handleReject}
  onApproveAlways={handleAlwaysAllow}
/>
```markdown

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `execution` | `ToolExecution` | required | Tool execution details |
| `riskLevel` | `"low" \| "medium" \| "high" \| "critical"` | required | Risk assessment |
| `onApprove` | `() => void` | required | Approve handler |
| `onReject` | `() => void` | required | Reject handler |
| `onApproveAlways` | `() => void` | - | Always allow handler |
| `isFocused` | `boolean` | `true` | Enable keyboard |

**Risk Level Colors:**

| Level | Color | Icon |
|-------|-------|------|
| `low` | Green | ● |
| `medium` | Yellow | ▲ |
| `high` | Orange | ◆ |
| `critical` | Red | ⬢ |

---

## Context Providers

### AppContext

Manages global application state.

```tsx
import { useApp } from "@vellum/cli";

function MyComponent() {
  const { state, setMode, setError, toggleVimMode, setFocusedArea } = useApp();

  return (
    <Box>
      <Text>Mode: {state.mode}</Text>
      <Text>Vim: {state.vimMode ? "ON" : "OFF"}</Text>
    </Box>
  );
}
```markdown

**State Shape:**

```typescript
interface AppState {
  mode: "idle" | "loading" | "streaming" | "waiting" | "error";
  loading: boolean;
  error: Error | null;
  vimMode: boolean;
  focusedArea: "input" | "messages" | "tools" | "status";
}
```text

---

### MessagesContext

Manages conversation messages.

```tsx
import { useMessages } from "@vellum/cli";

function MyComponent() {
  const { state, addMessage, updateMessage, clearMessages } = useMessages();

  const sendMessage = () => {
    addMessage({
      id: crypto.randomUUID(),
      role: "user",
      content: "Hello!",
      timestamp: new Date(),
    });
  };

  return <MessageList messages={state.messages} />;
}
```markdown

**Actions:**

| Action | Description |
|--------|-------------|
| `addMessage` | Add a new message |
| `updateMessage` | Update existing message |
| `deleteMessage` | Remove a message |
| `clearMessages` | Clear all messages |
| `setStreaming` | Set streaming state |

---

### ToolsContext

Manages tool execution state and approvals.

```tsx
import { useTools } from "@vellum/cli";

function MyComponent() {
  const { state, addExecution, approveExecution, rejectExecution } = useTools();

  return (
    <Box>
      {state.pendingApproval.map((exec) => (
        <PermissionDialog
          key={exec.id}
          execution={exec}
          onApprove={() => approveExecution(exec.id)}
          onReject={() => rejectExecution(exec.id)}
        />
      ))}
    </Box>
  );
}
```markdown

**State Shape:**

```typescript
interface ToolsState {
  executions: ToolExecution[];
  pendingApproval: ToolExecution[];
}

interface ToolExecution {
  id: string;
  toolName: string;
  params: Record<string, unknown>;
  status: "pending" | "approved" | "rejected" | "running" | "complete" | "error";
  result?: unknown;
  error?: Error;
}
```text

---

## Hooks

### useVim

Vim modal editing mode hook.

```tsx
import { useVim } from "@vellum/cli";

function Editor() {
  const vim = useVim();

  const handleKeyPress = (key: string) => {
    const action = vim.handleKey(key);

    if (action?.type === "motion") {
      moveCursor(action.direction);
    } else if (action?.type === "mode") {
      // Mode changed automatically
    }
  };

  return (
    <Box>
      <Text color={vim.mode === "INSERT" ? "green" : "blue"}>
        -- {vim.mode} --
      </Text>
    </Box>
  );
}
```markdown

**Return Value:**

```typescript
interface UseVimReturn {
  enabled: boolean;
  mode: "NORMAL" | "INSERT" | "VISUAL" | "COMMAND";
  toggle: () => void;
  setMode: (mode: VimMode) => void;
  handleKey: (key: string, modifiers?: KeyModifiers) => VimAction | null;
}
```markdown

**Key Mappings:**

| Key | NORMAL Mode Action |
|-----|-------------------|
| `h/j/k/l` | Move left/down/up/right |
| `w/b/e` | Word forward/backward/end |
| `0/$` | Line start/end |
| `i/a/o` | Enter INSERT mode |
| `v/V` | Enter VISUAL mode |
| `:` | Enter COMMAND mode |
| `d/y/p` | Delete/yank/paste |
| `Escape` | Return to NORMAL |

---

### useHotkeys

Keyboard shortcut management.

```tsx
import { useHotkeys } from "@vellum/cli";

function MyComponent() {
  useHotkeys([
    {
      key: "c",
      ctrl: true,
      handler: () => handleCopy(),
      description: "Copy selection",
      scope: "global",
    },
    {
      key: "l",
      ctrl: true,
      handler: () => clearScreen(),
      description: "Clear screen",
    },
    {
      key: "escape",
      handler: () => cancelOperation(),
      scope: "input",
    },
  ]);

  return <Box>...</Box>;
}
```markdown

**Hotkey Definition:**

```typescript
interface HotkeyDefinition {
  key: string;           // Key to match
  ctrl?: boolean;        // Require Ctrl
  shift?: boolean;       // Require Shift
  alt?: boolean;         // Require Alt
  handler: () => void;   // Handler function
  description?: string;  // Help text
  scope?: "global" | "input" | "messages" | "tools";
}
```text

---

### useCopyMode

Visual text selection and clipboard copy.

```tsx
import { useCopyMode } from "@vellum/cli";

function MessageViewer() {
  const copyMode = useCopyMode();
  const content = [["H", "e", "l", "l", "o"], ["W", "o", "r", "l", "d"]];

  const handleKey = (key: string) => {
    if (key === "v") {
      copyMode.enterCopyMode();
    } else if (copyMode.state.active) {
      if (key === "j") copyMode.expandSelection("down");
      if (key === "k") copyMode.expandSelection("up");
      if (key === "y") copyMode.copySelection(content);
      if (key === "escape") copyMode.exitCopyMode();
    }
  };

  return (
    <Box>
      {content.map((line, lineIdx) => (
        <Text key={lineIdx}>
          {line.map((char, colIdx) => (
            <Text
              key={colIdx}
              inverse={copyMode.isInSelection(lineIdx, colIdx)}
            >
              {char}
            </Text>
          ))}
        </Text>
      ))}
    </Box>
  );
}
```markdown

**Return Value:**

```typescript
interface UseCopyModeReturn {
  state: CopyModeState;
  enterCopyMode: () => void;
  exitCopyMode: () => void;
  expandSelection: (direction: "up" | "down" | "left" | "right") => void;
  copySelection: (content: string[][]) => Promise<void>;
  isInSelection: (line: number, col: number) => boolean;
}
```markdown

**Platform Support:**
- macOS: `pbcopy`
- Windows: PowerShell `Set-Clipboard`
- Linux: `xclip` or `xsel`
- Fallback: OSC 52 escape sequence

---

## Themes

### Built-in Themes

| Theme | Description |
|-------|-------------|
| `dark` | Default dark theme |
| `light` | Light theme |
| `dracula` | Dracula color scheme |
| `nord` | Nord color scheme |
| `solarized` | Solarized dark |

### Using Themes

```tsx
import { RootProvider, useTheme } from "@vellum/cli";

// With preset
<RootProvider theme="dracula">
  <App />
</RootProvider>

// Access theme in components
function MyComponent() {
  const { theme, setTheme, availableThemes } = useTheme();

  return (
    <Box borderColor={theme.colors.primary}>
      <Text color={theme.colors.text}>Hello</Text>
    </Box>
  );
}
```markdown

### Custom Themes

```typescript
import type { VellumTheme } from "@vellum/shared";

const customTheme: VellumTheme = {
  colors: {
    primary: "#6366f1",
    secondary: "#8b5cf6",
    background: "#0f0f0f",
    surface: "#1a1a1a",
    text: "#ffffff",
    textMuted: "#a3a3a3",
    border: "#333333",
    error: "#ef4444",
    warning: "#f59e0b",
    success: "#10b981",
    info: "#3b82f6",
  },
};

<RootProvider theme={customTheme}>
  <App />
</RootProvider>
```text

---

## Usage Examples

### Complete Application

```tsx
import {
  RootProvider,
  Layout,
  TextInput,
  MessageList,
  StatusBar,
  useApp,
  useMessages,
  useVim,
} from "@vellum/cli";

function App() {
  const [input, setInput] = useState("");
  const { state: appState } = useApp();
  const { state: messagesState, addMessage } = useMessages();
  const vim = useVim();

  const handleSubmit = (value: string) => {
    addMessage({
      id: crypto.randomUUID(),
      role: "user",
      content: value,
      timestamp: new Date(),
    });
    setInput("");
  };

  return (
    <Layout
      header={
        <StatusBar
          model={{ provider: "anthropic", model: "claude-3" }}
          tokens={{ current: 1000, max: 100000 }}
        />
      }
      footer={
        <TextInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          placeholder="Type a message..."
          multiline
        />
      }
    >
      <MessageList
        messages={messagesState.messages}
        autoScroll
      />
    </Layout>
  );
}

// Entry point
render(
  <RootProvider theme="dark" initialAppState={{ vimMode: false }}>
    <App />
  </RootProvider>
);
```markdown

### Tool Approval Flow

```tsx
import { useTools, PermissionDialog, ApprovalQueue } from "@vellum/cli";

function ToolApprovalManager() {
  const { state, approveExecution, rejectExecution } = useTools();

  if (state.pendingApproval.length === 0) {
    return null;
  }

  const current = state.pendingApproval[0];

  return (
    <PermissionDialog
      execution={current}
      riskLevel={assessRisk(current.toolName)}
      onApprove={() => approveExecution(current.id)}
      onReject={() => rejectExecution(current.id)}
    />
  );
}
```markdown

### Vim Mode Integration

```tsx
import { useVim, useApp } from "@vellum/cli";

function VimEditor() {
  const vim = useVim();
  const { toggleVimMode } = useApp();

  useHotkeys([
    {
      key: "escape",
      handler: () => {
        if (vim.mode !== "NORMAL") {
          vim.setMode("NORMAL");
        }
      },
    },
  ]);

  return (
    <Box flexDirection="column">
      <Text dimColor>
        Vim: {vim.enabled ? vim.mode : "OFF"} | Press Ctrl+V to toggle
      </Text>
      <TextInput
        value={value}
        onChange={setValue}
        onKeyPress={(key) => {
          if (vim.enabled) {
            const action = vim.handleKey(key);
            // Handle action...
          }
        }}
      />
    </Box>
  );
}
```text

---

## Accessibility

The TUI includes accessibility features:

- **Screen Reader Support**: `ScreenReaderLayout` and `AdaptiveLayout` components
- **Keyboard Navigation**: Full keyboard support for all interactions
- **Focus Management**: Proper focus trapping in dialogs
- **High Contrast**: Themes designed for readability

```tsx
import { AdaptiveLayout, ScreenReaderLayout } from "@vellum/cli";

// Auto-detects screen reader
<AdaptiveLayout>
  <App />
</AdaptiveLayout>

// Force screen reader mode
<ScreenReaderLayout>
  <App />
</ScreenReaderLayout>
```text

---

## Internationalization

The TUI supports multiple languages via i18n:

```tsx
import { useTranslation } from "@vellum/cli";

function MyComponent() {
  const { t } = useTranslation();

  return <Text>{t("messages.welcome")}</Text>;
}
```

Locale files are located in `locales/{lang}/tui.json`.

---

## Best Practices

1. **Use Context Providers**: Always wrap your app in `RootProvider`
2. **Theme Consistency**: Use `useTheme()` for colors instead of hardcoding
3. **Keyboard First**: Ensure all actions are keyboard-accessible
4. **State Management**: Use provided contexts instead of local state for shared data
5. **Error Handling**: Use `useApp().setError()` for consistent error display

---

## API Reference

For complete TypeScript types and API documentation, see the source files in `packages/cli/src/tui/`.
