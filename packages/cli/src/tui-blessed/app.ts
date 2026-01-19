import blessed from "neo-blessed";
import type { AppComponents } from "./types.js";

export function createApp(): AppComponents {
  const screen = blessed.screen({
    smartCSR: true,
    fullUnicode: true,
    title: "Vellum CLI (blessed POC)",
  });

  // Layout constants
  const HEADER_HEIGHT = 1;
  const STATUS_HEIGHT = 2;
  const INPUT_HEIGHT = 3;

  const header = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: "100%",
    height: HEADER_HEIGHT,
    content: " 🐍 Vellum CLI | Model: claude-3.5-sonnet ",
    style: { fg: "white", bg: "blue" },
  });

  const messageLog = blessed.log({
    parent: screen,
    top: HEADER_HEIGHT,
    left: 0,
    width: "100%",
    height: `100%-${HEADER_HEIGHT + STATUS_HEIGHT + INPUT_HEIGHT}`,
    tags: true, // Enable {color-fg} tags
    keys: true,
    vi: true,
    mouse: true,
    scrollable: true,
    alwaysScroll: true,
    scrollbar: {
      ch: "│",
      track: { bg: "black" },
      style: { bg: "gray" },
    },
    scrollback: 3000,
    border: { type: "line" },
    style: { border: { fg: "gray" } },
  });

  const statusBar = blessed.box({
    parent: screen,
    bottom: INPUT_HEIGHT,
    left: 0,
    width: "100%",
    height: STATUS_HEIGHT,
    content: " Status: Ready | Tokens: 0/0 ",
    style: { fg: "gray" },
    border: { type: "line" },
  });

  const input = blessed.textbox({
    parent: screen,
    bottom: 0,
    left: 0,
    width: "100%",
    height: INPUT_HEIGHT,
    inputOnFocus: true,
    border: { type: "line" },
    style: {
      fg: "white",
      border: { fg: "cyan" },
    },
    label: " Input ",
  });

  // Global keybindings
  screen.key(["C-c", "C-q"], () => {
    screen.destroy();
    process.exit(0);
  });

  screen.key(["pageup"], () => {
    messageLog.scroll(-Math.floor((messageLog.height as number) / 2));
    screen.render();
  });

  screen.key(["pagedown"], () => {
    messageLog.scroll(Math.floor((messageLog.height as number) / 2));
    screen.render();
  });

  screen.key(["home"], () => {
    messageLog.setScrollPerc(0);
    screen.render();
  });

  screen.key(["end"], () => {
    messageLog.setScrollPerc(100);
    screen.render();
  });

  // Escape returns to input
  screen.key(["escape"], () => {
    input.focus();
    screen.render();
  });

  // Input handling
  input.on("submit", (value: string) => {
    const text = String(value ?? "").trim();
    if (text) {
      addMessage(messageLog, { role: "user", content: text });
      // Simulate assistant response
      setTimeout(() => {
        addMessage(messageLog, {
          role: "assistant",
          content: "This is a simulated response. 中文测试 🎉 Emoji test!",
        });
        screen.render();
      }, 500);
    }
    input.clearValue();
    screen.render();
    input.focus();
  });

  input.focus();
  screen.render();

  return { screen, header, messageLog, input, statusBar };
}

function addMessage(
  log: ReturnType<typeof blessed.log>,
  message: { role: string; content: string }
) {
  const roleColors: Record<string, string> = {
    user: "cyan",
    assistant: "green",
    system: "yellow",
    tool: "magenta",
  };
  const color = roleColors[message.role] || "white";
  const prefix = message.role === "user" ? "You" : "Assistant";
  log.add(`{${color}-fg}${prefix}:{/${color}-fg} ${message.content}`);
}

export function addMessageToLog(
  log: ReturnType<typeof blessed.log>,
  role: "user" | "assistant" | "system" | "tool",
  content: string
) {
  const roleColors: Record<string, string> = {
    user: "cyan",
    assistant: "green",
    system: "yellow",
    tool: "magenta",
  };
  const color = roleColors[role];
  const prefix = role === "user" ? "You" : role.charAt(0).toUpperCase() + role.slice(1);
  log.add(`{${color}-fg}${prefix}:{/${color}-fg} ${content}`);
}
