import { cleanup, render } from "ink-testing-library";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BracketedPasteProvider } from "../../../context/BracketedPasteContext.js";
import { MouseProvider } from "../../../context/MouseContext.js";
import { ThemeProvider } from "../../../theme/index.js";
import { EnhancedCommandInput } from "../EnhancedCommandInput.js";
import type { SlashCommand } from "../slash-command-utils.js";

afterEach(() => act(() => cleanup()));

function renderInput(onCommand: (command: SlashCommand) => void) {
  const onMessage = vi.fn();
  let screen!: ReturnType<typeof render>;
  act(() => {
    screen = render(
      <ThemeProvider>
        <BracketedPasteProvider>
          <MouseProvider enabled={false}>
            <EnhancedCommandInput
              commands={[{ name: "session" }, { name: "help", aliases: ["h"] }]}
              getSubcommands={(command) =>
                command === "session" ? [{ name: "list" }, { name: "new" }] : undefined
              }
              onCommand={onCommand}
              onMessage={onMessage}
              placeholder="Write a message"
              enableMentions={false}
            />
          </MouseProvider>
        </BracketedPasteProvider>
      </ThemeProvider>
    );
  });
  return { ...screen, onMessage };
}

async function write(stdin: { write: (data: string) => void }, data: string) {
  await act(async () => {
    stdin.write(data);
    await new Promise((resolve) => setTimeout(resolve, 40));
  });
}

describe("EnhancedCommandInput terminal submission", () => {
  it("restores the draft on the first Down and handles coalesced history keys and edits", async () => {
    const screen = renderInput(vi.fn());
    await write(screen.stdin, "first\rsecond\r");
    await write(screen.stdin, "unfinished");
    await write(screen.stdin, "\x1b[A\x1b[A\x1b[B\x1b[B!");
    expect(screen.lastFrame()).toContain("unfinished!");
    await write(screen.stdin, "\r");
    expect(screen.onMessage).toHaveBeenLastCalledWith("unfinished!");
    await write(screen.stdin, "\x1b[A\x1b[B");
    expect(screen.lastFrame()).toContain("Write a message");
  });

  it.each(["/session list", "/help", "/h", "/seesion", "/seesion list"])(
    "submits and clears a fully typed command %s with one Enter",
    async (command) => {
      const onCommand = vi.fn();
      const screen = renderInput(onCommand);
      await write(screen.stdin, command);
      await write(screen.stdin, "\r");
      expect(onCommand).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ raw: command }));
      expect(screen.lastFrame()).toContain("Write a message");
      expect(screen.lastFrame()).not.toContain(command);
    }
  );

  it("completes partial commands with Enter and exact commands with Tab without submitting", async () => {
    const onCommand = vi.fn();
    const screen = renderInput(onCommand);
    await write(screen.stdin, "/sess");
    await write(screen.stdin, "\r");
    expect(onCommand).not.toHaveBeenCalled();
    expect(screen.lastFrame()).toContain("/session ");
    await write(screen.stdin, "list");
    await write(screen.stdin, "\t");
    expect(onCommand).not.toHaveBeenCalled();
    expect(screen.lastFrame()).toContain("/session list ");
    await write(screen.stdin, "\r");
    expect(onCommand).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ raw: "/session list" })
    );
    expect(screen.lastFrame()).toContain("Write a message");
  });

  it("clears a submitted command before accepting text from the same input chunk", async () => {
    const onCommand = vi.fn();
    const screen = renderInput(onCommand);
    await write(screen.stdin, "/session list");
    await write(screen.stdin, "\rnext draft\r");
    expect(onCommand).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ raw: "/session list" })
    );
    expect(screen.onMessage).toHaveBeenCalledExactlyOnceWith("next draft");
    expect(screen.lastFrame()).toContain("Write a message");
  });

  it("uses the current editor text when typing and Enter arrive before the completion menu updates", async () => {
    const onCommand = vi.fn();
    const screen = renderInput(onCommand);
    await write(screen.stdin, "/sess");
    await write(screen.stdin, "ion list\r");
    expect(onCommand).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ raw: "/session list" })
    );
    expect(screen.lastFrame()).toContain("Write a message");
  });

  it("keeps submitted commands in history without restoring the preceding draft", async () => {
    const onCommand = vi.fn();
    const screen = renderInput(onCommand);
    await write(screen.stdin, "/session list");
    await write(screen.stdin, "\r");
    await write(screen.stdin, "old draft");
    await write(screen.stdin, "\x1b[A");
    expect(screen.lastFrame()).toContain("/session list");
    await write(screen.stdin, "\r");
    expect(onCommand).toHaveBeenCalledTimes(2);
    expect(screen.lastFrame()).toContain("Write a message");
    await write(screen.stdin, "next draft");
    await write(screen.stdin, "\x1b[B");
    expect(screen.lastFrame()).toContain("next draft");
  });

  it("keeps the next draft while an asynchronous command is running and after it finishes", async () => {
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const onCommand = vi.fn(() => pending);
    const screen = renderInput(onCommand);
    await write(screen.stdin, "/session list");
    await write(screen.stdin, "\r");
    expect(screen.lastFrame()).toContain("Write a message");
    await write(screen.stdin, "next draft");
    await act(async () => {
      finish();
      await pending;
    });
    expect(screen.lastFrame()).toContain("next draft");
    await write(screen.stdin, "\r");
    expect(screen.onMessage).toHaveBeenCalledExactlyOnceWith("next draft");
    expect(onCommand).toHaveBeenCalledTimes(1);
  });
});
