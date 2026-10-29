import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Box } from "ink";
import { cleanup, render } from "ink-testing-library";
import type React from "react";
import { act } from "react";
import stringWidth from "string-width";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mouseCommand } from "../../../../commands/mouse.js";
import type { CommandContext } from "../../../../commands/types.js";
import { MouseInteractionScope, MouseProvider } from "../../../context/MouseContext.js";
import { useMouseScroll } from "../../../hooks/useMouseScroll.js";
import { ThemeProvider } from "../../../theme/index.js";
import { globalClickRegistry } from "../../../utils/click-region.js";
import { Autocomplete } from "../Autocomplete.js";
import { EnhancedCommandInput } from "../EnhancedCommandInput.js";
import { MentionAutocomplete } from "../MentionAutocomplete.js";

vi.mock("../../../utils/mouse-parser.js", async (original) => ({
  ...(await original<typeof import("../../../utils/mouse-parser.js")>()),
  enableMouseTracking: vi.fn(),
  disableMouseTracking: vi.fn(),
}));

let originalTTY: PropertyDescriptor | undefined;
beforeEach(async () => {
  originalTTY = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
  Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
  vi.stubEnv("TERM", "xterm-256color");
  vi.stubEnv("VELLUM_DISABLE_MOUSE", "0");
  vi.stubEnv("VELLUM_DISABLE_MOUSE_CLICKS", "0");
  await mouseCommand.execute({ parsedArgs: { positional: ["on"] } } as unknown as CommandContext);
});
afterEach(async () => {
  await act(async () => cleanup());
  globalClickRegistry.clear();
  if (originalTTY) Object.defineProperty(process.stdout, "isTTY", originalTTY);
  else Reflect.deleteProperty(process.stdout, "isTTY");
  vi.unstubAllEnvs();
});

function wrap(element: React.ReactNode, active = true, hidden = false, left = 4) {
  return (
    <ThemeProvider>
      <MouseProvider>
        <MouseInteractionScope enabled={active}>
          <Box width={90} marginTop={2} marginLeft={left} display={hidden ? "none" : "flex"}>
            {element}
          </Box>
        </MouseInteractionScope>
      </MouseProvider>
    </ThemeProvider>
  );
}

function position(screen: ReturnType<typeof render>, label: string) {
  const lines = (screen.lastFrame() ?? "").split("\n");
  const row = lines.findIndex((line) => line.includes(label));
  expect(row, `Missing rendered label: ${label}`).toBeGreaterThanOrEqual(0);
  const line = lines[row] ?? "";
  return { col: stringWidth(line.slice(0, line.indexOf(label))) + 1, row: row + 1 };
}

async function send(screen: ReturnType<typeof render>, data: string) {
  await act(async () => {
    screen.stdin.write(data);
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

function click({ col, row }: { col: number; row: number }) {
  return `\x1b[<0;${col};${row}M\x1b[<0;${col};${row}m`;
}

function wheel({ col, row }: { col: number; row: number }, count = 1) {
  return `\x1b[<65;${col};${row}M`.repeat(count);
}

function BackgroundWheel({ onScroll }: { onScroll: (delta: number) => void }) {
  useMouseScroll({ onScroll, priority: 0 });
  return null;
}

describe("autocomplete terminal mouse interaction", () => {
  it("activates the rendered grouped option once on release and never its category header", async () => {
    const onSelect = vi.fn();
    let screen!: ReturnType<typeof render>;
    await act(async () => {
      screen = render(
        wrap(
          <Autocomplete
            input=""
            grouped
            options={[
              { name: "help", category: "System" },
              { name: "clear", category: "Session" },
            ]}
            categoryOrder={["System", "Session"]}
            onSelect={onSelect}
            onCancel={vi.fn()}
          />
        )
      );
    });
    await send(screen, click(position(screen, "─── Session")));
    expect(onSelect).not.toHaveBeenCalled();
    const target = position(screen, "clear");
    await send(screen, `\x1b[<0;${target.col};${target.row}M`);
    expect(onSelect).not.toHaveBeenCalled();
    await send(screen, `\x1b[<0;${target.col};${target.row}m`);
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("clear");
  });

  it("clicks a mention directory or file using its complete path", async () => {
    const onSelect = vi.fn();
    let screen!: ReturnType<typeof render>;
    await act(async () => {
      screen = render(
        wrap(
          <MentionAutocomplete
            input=""
            mode="value"
            mentionType="file"
            fileSuggestions={[
              { name: "nested", path: "src/nested", isDirectory: true },
              { name: "file.ts", path: "src/file.ts", isDirectory: false },
            ]}
            onSelect={onSelect}
            onCancel={vi.fn()}
          />
        )
      );
    });
    await send(screen, click(position(screen, "nested")));
    expect(onSelect).toHaveBeenLastCalledWith("src/nested", "value");
    await send(screen, click(position(screen, "file.ts")));
    expect(onSelect).toHaveBeenLastCalledWith("src/file.ts", "value");
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it("scrolls only within the live menu bounds and clicks the correct windowed grouped result", async () => {
    const onSelect = vi.fn();
    const onSelectionChange = vi.fn();
    const props = {
      input: "",
      grouped: true,
      maxVisible: 3,
      options: Array.from({ length: 8 }, (_, index) => ({
        name: `item${index}`,
        category: index < 2 ? "First" : "Second",
      })),
      categoryOrder: ["First", "Second"],
      onSelect,
      onSelectionChange,
      onCancel: vi.fn(),
    };
    let screen!: ReturnType<typeof render>;
    await act(async () => {
      screen = render(wrap(<Autocomplete {...props} />));
    });
    const target = position(screen, "item0");
    await send(screen, wheel({ col: 1, row: 1 }, 3));
    expect(onSelectionChange).toHaveBeenLastCalledWith(0, true, props.options[0]);
    await send(screen, wheel(target, 5));
    expect(onSelectionChange).toHaveBeenLastCalledWith(5, true, props.options[5]);
    expect(screen.lastFrame()).toContain("item5");
    expect(screen.lastFrame()).not.toContain("item0");
    await send(screen, click(position(screen, "item4")));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("item4");
    await act(async () => {
      screen.rerender(wrap(<Autocomplete {...props} />, true, false, 20));
    });
    await send(screen, wheel(target, 3));
    expect(onSelectionChange).toHaveBeenLastCalledWith(4, true, props.options[4]);
    await send(screen, wheel(position(screen, "item4")));
    expect(onSelectionChange).toHaveBeenLastCalledWith(5, true, props.options[5]);
  });

  it.each(["inactive", "hidden", "scope", "invisible"])(
    "ignores clicks and wheel when %s",
    async (guard) => {
      const onSelect = vi.fn();
      const onSelectionChange = vi.fn();
      const props = {
        input: "",
        options: ["first", "second"],
        onSelect,
        onSelectionChange,
        onCancel: vi.fn(),
      };
      let screen!: ReturnType<typeof render>;
      await act(async () => {
        screen = render(wrap(<Autocomplete {...props} />));
      });
      const target = position(screen, "second");
      await send(screen, `\x1b[<0;${target.col};${target.row}M`);
      await act(async () => {
        screen.rerender(
          wrap(
            <Autocomplete
              {...props}
              active={guard !== "inactive"}
              visible={guard !== "invisible"}
            />,
            guard !== "scope",
            guard === "hidden"
          )
        );
      });
      onSelectionChange.mockClear();
      await send(screen, `\x1b[<0;${target.col};${target.row}m${click(target)}${wheel(target)}`);
      expect(onSelect).not.toHaveBeenCalled();
      expect(onSelectionChange).not.toHaveBeenCalled();
    }
  );

  it("resets selection immediately when a different same-sized submenu replaces the list", async () => {
    const onSelect = vi.fn();
    const onSelectionChange = vi.fn();
    let screen!: ReturnType<typeof render>;
    const tree = (options: string[]) =>
      wrap(
        <Autocomplete
          input=""
          options={options}
          onSelect={onSelect}
          onSelectionChange={onSelectionChange}
          onCancel={vi.fn()}
        />
      );
    await act(async () => {
      screen = render(tree(["one", "two"]));
    });
    await send(screen, wheel(position(screen, "one")));
    expect(onSelectionChange).toHaveBeenLastCalledWith(1, true, { name: "two" });
    const oldTarget = position(screen, "two");
    await send(screen, `\x1b[<0;${oldTarget.col};${oldTarget.row}M`);
    onSelectionChange.mockClear();
    await act(async () => {
      screen.rerender(tree(["apple", "banana"]));
    });
    expect(onSelectionChange).toHaveBeenLastCalledWith(0, true, { name: "apple" });
    expect(onSelectionChange.mock.calls.every(([index]) => index === 0)).toBe(true);
    await send(screen, `\x1b[<0;${oldTarget.col};${oldTarget.row}m`);
    expect(onSelect).not.toHaveBeenCalled();
    await send(screen, click(position(screen, "banana")));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("banana");
  });

  it("navigates nested mention paths and shares coalesced wheel/Tab selection", async () => {
    const onSelect = vi.fn();
    const suggestions = Array.from({ length: 8 }, (_, index) => ({
      name: `file${index}.ts`,
      path: `src/file${index}.ts`,
      isDirectory: false,
    }));
    let screen!: ReturnType<typeof render>;
    await act(async () => {
      screen = render(
        wrap(
          <MentionAutocomplete
            input="src/fi"
            mode="value"
            mentionType="file"
            maxVisible={3}
            fileSuggestions={suggestions}
            onSelect={onSelect}
            onCancel={vi.fn()}
          />
        )
      );
    });
    await send(screen, wheel(position(screen, "file0.ts"), 4));
    expect(screen.lastFrame()).toContain("file4.ts");
    await send(screen, `${wheel(position(screen, "file4.ts"))}\t`);
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("src/file5.ts", "value");
  });

  it("completes all slash levels through the parent without executing until explicit Enter", async () => {
    const onCommand = vi.fn();
    const onMessage = vi.fn();
    let screen!: ReturnType<typeof render>;
    await act(async () => {
      screen = render(
        wrap(
          <EnhancedCommandInput
            onCommand={onCommand}
            onMessage={onMessage}
            commands={["auth", "clear", "quit"]}
            getSubcommands={(command) =>
              command === "auth" ? [{ name: "set" }, { name: "status" }] : undefined
            }
            getLevel3Items={(command, arg1) =>
              command === "auth" && arg1 === "set"
                ? [{ name: "anthropic" }, { name: "openai" }]
                : undefined
            }
          />
        )
      );
    });
    await send(screen, "/");
    await send(screen, click(position(screen, "auth")));
    expect(screen.lastFrame()).toContain("/auth ");
    await send(screen, click(position(screen, "set")));
    expect(screen.lastFrame()).toContain("/auth set ");
    await send(screen, click(position(screen, "openai")));
    expect(screen.lastFrame()).toContain("/auth set openai ");
    expect(onCommand).not.toHaveBeenCalled();
    expect(onMessage).not.toHaveBeenCalled();
    await send(screen, "\r");
    expect(onCommand).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ name: "auth", args: ["set", "openai"] })
    );
  });

  it.each(["disabled", "unfocused"])("does not complete parent menus while %s", async (guard) => {
    const onCommand = vi.fn();
    const props = { onCommand, onMessage: vi.fn(), commands: ["clear", "quit"] };
    let screen!: ReturnType<typeof render>;
    await act(async () => {
      screen = render(wrap(<EnhancedCommandInput {...props} />));
    });
    await send(screen, "/");
    const target = position(screen, "quit");
    await act(async () => {
      screen.rerender(
        wrap(
          <EnhancedCommandInput
            {...props}
            disabled={guard === "disabled"}
            focused={guard !== "unfocused"}
          />
        )
      );
    });
    await send(screen, `${click(target)}${wheel(target)}\t`);
    expect(screen.lastFrame()).not.toContain("/quit");
    expect(onCommand).not.toHaveBeenCalled();
  });

  it("preserves a mouse completion followed immediately by Chinese text in the same terminal chunk", async () => {
    const onCommand = vi.fn();
    let screen!: ReturnType<typeof render>;
    await act(async () => {
      screen = render(
        wrap(<EnhancedCommandInput onCommand={onCommand} onMessage={vi.fn()} commands={["help"]} />)
      );
    });
    await send(screen, "/");
    await send(screen, `${click(position(screen, "help"))}中文🙂`);
    expect(screen.lastFrame()).toContain("/help 中文🙂");
    expect(onCommand).not.toHaveBeenCalled();
  });

  it("preserves a coalesced arrow and Tab through the parent completion callback", async () => {
    const onCommand = vi.fn();
    let screen!: ReturnType<typeof render>;
    await act(async () => {
      screen = render(
        wrap(
          <EnhancedCommandInput
            onCommand={onCommand}
            onMessage={vi.fn()}
            commands={["clear", "help", "quit"]}
          />
        )
      );
    });
    await send(screen, "/");
    await send(screen, "\x1b[B\x1b[B\t");
    expect(screen.lastFrame()).toContain("/quit ");
    expect(onCommand).not.toHaveBeenCalled();
  });

  it("preserves Tab completion and subsequent cursor edits without a deferred cursor reset", async () => {
    const onCommand = vi.fn();
    let screen!: ReturnType<typeof render>;
    await act(async () => {
      screen = render(
        wrap(<EnhancedCommandInput onCommand={onCommand} onMessage={vi.fn()} commands={["help"]} />)
      );
    });
    await send(screen, "/");
    await send(screen, "\t中文🙂\x1b[D!");
    expect(screen.lastFrame()).toContain("/help 中文!🙂");
    await send(screen, "?");
    expect(screen.lastFrame()).toContain("/help 中文!?🙂");
    expect(onCommand).not.toHaveBeenCalled();
  });

  it("dismisses autocomplete with Escape and reopens after editing without moving input focus", async () => {
    let screen!: ReturnType<typeof render>;
    await act(async () => {
      screen = render(
        wrap(
          <EnhancedCommandInput
            onCommand={vi.fn()}
            onMessage={vi.fn()}
            commands={["help", "quit"]}
          />
        )
      );
    });
    await send(screen, "/");
    expect(screen.lastFrame()).toContain("quit");
    await send(screen, "\x1b");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
    });
    expect(screen.lastFrame()).not.toContain("quit");
    await send(screen, "h");
    expect(screen.lastFrame()).toContain("help");
  });

  it("completes mention type, nested directory and file through the real parent hook", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "vellum-mention-mouse-"));
    try {
      await mkdir(path.join(cwd, "nested"));
      await writeFile(path.join(cwd, "nested", "example.ts"), "export {};\n");
      const onMessage = vi.fn();
      let screen!: ReturnType<typeof render>;
      await act(async () => {
        screen = render(
          wrap(<EnhancedCommandInput cwd={cwd} onCommand={vi.fn()} onMessage={onMessage} />)
        );
      });
      await send(screen, "Read @fi");
      await send(screen, click(position(screen, "file")));
      expect(screen.lastFrame()).toContain("Read @file:");
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
      });
      await send(screen, click(position(screen, "nested")));
      expect(screen.lastFrame()).toContain("Read @file:nested/");
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
      });
      await send(screen, click(position(screen, "example.ts")));
      expect(screen.lastFrame()).toContain("Read @file:nested/example.ts ");
      expect(onMessage).not.toHaveBeenCalled();
      await send(screen, "\r");
      expect(onMessage).toHaveBeenCalledExactlyOnceWith("Read @file:nested/example.ts");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("consumes wheel input over menus even at their edge instead of scrolling background history", async () => {
    const backgroundScroll = vi.fn();
    let screen!: ReturnType<typeof render>;
    await act(async () => {
      screen = render(
        wrap(
          <>
            <BackgroundWheel onScroll={backgroundScroll} />
            <Autocomplete input="" options={["only"]} onSelect={vi.fn()} onCancel={vi.fn()} />
          </>
        )
      );
    });
    await send(screen, wheel(position(screen, "only"), 4));
    expect(backgroundScroll).not.toHaveBeenCalled();
    await send(screen, wheel({ col: 1, row: 1 }));
    expect(backgroundScroll).toHaveBeenCalledExactlyOnceWith(3);
  });

  it.each(["inactive", "hidden", "scope", "invisible"])(
    "guards mention mouse gestures while %s",
    async (guard) => {
      const onSelect = vi.fn();
      const onSelectionChange = vi.fn();
      const props = {
        input: "",
        mode: "type" as const,
        onSelect,
        onSelectionChange,
        onCancel: vi.fn(),
      };
      let screen!: ReturnType<typeof render>;
      await act(async () => {
        screen = render(wrap(<MentionAutocomplete {...props} />));
      });
      const target = position(screen, "file");
      await send(screen, `\x1b[<0;${target.col};${target.row}M`);
      await act(async () => {
        screen.rerender(
          wrap(
            <MentionAutocomplete
              {...props}
              active={guard !== "inactive"}
              visible={guard !== "invisible"}
            />,
            guard !== "scope",
            guard === "hidden"
          )
        );
      });
      onSelectionChange.mockClear();
      await send(screen, `\x1b[<0;${target.col};${target.row}m${click(target)}${wheel(target)}`);
      expect(onSelect).not.toHaveBeenCalled();
      expect(onSelectionChange).not.toHaveBeenCalled();
    }
  );

  it("hides stale directory suggestions and resets after an asynchronous same-sized replacement", async () => {
    const onSelect = vi.fn();
    const onSelectionChange = vi.fn();
    let screen!: ReturnType<typeof render>;
    const previous = [
      { name: "a", path: "a", isDirectory: true },
      { name: "b", path: "b", isDirectory: true },
    ];
    const next = [
      { name: "a.ts", path: "src/a.ts", isDirectory: false },
      { name: "b.ts", path: "src/b.ts", isDirectory: false },
    ];
    const tree = (input: string, fileSuggestions: typeof previous) =>
      wrap(
        <MentionAutocomplete
          input={input}
          mode="value"
          mentionType="file"
          fileSuggestions={fileSuggestions}
          onSelect={onSelect}
          onSelectionChange={onSelectionChange}
          onCancel={vi.fn()}
        />
      );
    await act(async () => {
      screen = render(tree("", previous));
    });
    await send(screen, wheel(position(screen, "a/")));
    expect(onSelectionChange).toHaveBeenLastCalledWith(1, true);
    await act(async () => {
      screen.rerender(tree("src/", previous));
    });
    expect(screen.lastFrame()?.trim()).toBe("");
    await act(async () => {
      screen.rerender(tree("src/", next));
    });
    expect(onSelectionChange).toHaveBeenLastCalledWith(0, true);
    await send(screen, click(position(screen, "b.ts")));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("src/b.ts", "value");
  });
});
