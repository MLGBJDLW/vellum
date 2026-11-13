import { Box, Text } from "ink";
import { cleanup, render } from "ink-testing-library";
import { act, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BracketedPasteProvider } from "../../../context/BracketedPasteContext.js";
import { MouseProvider } from "../../../context/MouseContext.js";
import { ThemeProvider } from "../../../theme/index.js";
import { TextInput } from "../TextInput.js";

afterEach(() => act(() => cleanup()));

function Harness({
  initialValue = "",
  onChange,
  onSubmit,
  multiline = false,
  showBorder = true,
}: {
  initialValue?: string;
  multiline?: boolean;
  showBorder?: boolean;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <ThemeProvider>
      <BracketedPasteProvider>
        <MouseProvider enabled={false}>
          <TextInput
            showBorder={showBorder}
            multiline={multiline}
            value={value}
            onSubmit={onSubmit}
            onChange={(next) => {
              setValue(next);
              onChange(next);
            }}
          />
        </MouseProvider>
      </BracketedPasteProvider>
    </ThemeProvider>
  );
}

function renderInput(element: React.ReactElement) {
  let result!: ReturnType<typeof render>;
  act(() => {
    result = render(element);
  });
  return result;
}

async function write(stdin: { write: (data: string) => void }, data: string) {
  await act(async () => {
    stdin.write(data);
    await new Promise((resolve) => setTimeout(resolve, 80));
  });
}

describe("TextInput terminal input", () => {
  it("expands an initially empty borderless prompt inside a horizontal form", async () => {
    const screen = renderInput(
      <Box width={40} flexDirection="row">
        <Text>Label: </Text>
        <Box flexGrow={1}>
          <Harness showBorder={false} onChange={vi.fn()} />
        </Box>
      </Box>
    );
    await write(screen.stdin, "abcdefghijk");
    expect(screen.lastFrame()).toContain("Label: ❯ abcdefghijk");
    expect(screen.lastFrame()?.split("\n")).toHaveLength(1);
  });

  it("reflows to a narrow parent and keeps the cursor and draft visible when resized", async () => {
    const draft = `START${"中文🙂ab".repeat(100)}END`;
    const change = vi.fn();
    const submit = vi.fn();
    const element = (width: number) => (
      <Box width={width} flexDirection="column">
        <Harness initialValue={draft} onChange={change} onSubmit={submit} />
      </Box>
    );
    const screen = renderInput(element(40));
    expect(screen.lastFrame()).toContain("END");
    await act(async () => screen.rerender(element(24)));
    expect(screen.lastFrame()).toContain("END");
    expect(screen.lastFrame()?.split("\n").length).toBeLessThanOrEqual(10);
    await write(screen.stdin, "\x01");
    expect(screen.lastFrame()).toContain("START");
    await write(screen.stdin, "\r");
    expect(submit).toHaveBeenCalledExactlyOnceWith(draft);
    expect(change).not.toHaveBeenCalled();
  });

  it("keeps long drafts in a cursor-following viewport and submits their complete content", async () => {
    const draft = `first-${"abcdef中文🙂".repeat(150)}-last`;
    const submit = vi.fn();
    const screen = renderInput(
      <Harness initialValue={draft} onChange={vi.fn()} onSubmit={submit} />
    );
    expect(screen.lastFrame()).toContain("-last");
    expect(screen.lastFrame()).not.toContain("first-");
    expect(screen.lastFrame()?.split("\n").length).toBeLessThanOrEqual(10);
    await write(screen.stdin, "\x01");
    expect(screen.lastFrame()).toContain("first-");
    expect(screen.lastFrame()).not.toContain("-last");
    await write(screen.stdin, "\r");
    expect(submit).toHaveBeenCalledExactlyOnceWith(draft);
  });

  it("browses multiline drafts without rendering every line or dropping pasted text", async () => {
    const draft = Array.from({ length: 200 }, (_, i) => `line-${i}`).join("\n");
    const submit = vi.fn();
    const screen = renderInput(<Harness multiline onChange={vi.fn()} onSubmit={submit} />);
    await write(screen.stdin, `\x1b[200~${draft}\x1b[201~`);
    expect(screen.lastFrame()).toContain("line-199");
    expect(screen.lastFrame()).not.toContain("line-0");
    expect(screen.lastFrame()?.split("\n").length).toBeLessThanOrEqual(10);
    await write(screen.stdin, "\x1b[A".repeat(15));
    expect(screen.lastFrame()).toContain("line-184");
    expect(screen.lastFrame()).not.toContain("line-199");
    await write(screen.stdin, "\x1b[13;5u");
    expect(submit).toHaveBeenCalledExactlyOnceWith(draft);
  });

  it("accepts a ghost draft with Tab and submits only on Enter", async () => {
    const submit = vi.fn();
    function Draft() {
      const [value, setValue] = useState("");
      return (
        <ThemeProvider>
          <BracketedPasteProvider>
            <MouseProvider enabled={false}>
              <TextInput
                value={value}
                onChange={setValue}
                onSubmit={submit}
                suggestion="Run the tests"
              />
            </MouseProvider>
          </BracketedPasteProvider>
        </ThemeProvider>
      );
    }
    const screen = renderInput(<Draft />);
    expect(screen.lastFrame()).toContain("Run the tests");
    await write(screen.stdin, "\t");
    expect(submit).not.toHaveBeenCalled();
    await write(screen.stdin, "\r");
    expect(submit).toHaveBeenCalledWith("Run the tests");
  });
  it.each([true, false])(
    "honors a parent's clear-on-submit policy (%s) before later keys",
    async (clear) => {
      const onSubmit = vi.fn();
      const onChange = vi.fn();
      function Form() {
        const [value, setValue] = useState("");
        return (
          <ThemeProvider>
            <TextInput
              value={value}
              onChange={(next) => {
                onChange(next);
                setValue(next);
              }}
              onSubmit={(submitted) => {
                onSubmit(submitted);
                if (clear) setValue("");
              }}
            />
          </ThemeProvider>
        );
      }
      const { stdin } = renderInput(<Form />);
      await act(async () => {
        stdin.write("abc\rxyz");
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      expect(onSubmit).toHaveBeenCalledExactlyOnceWith("abc");
      expect(onChange).toHaveBeenLastCalledWith(clear ? "xyz" : "abcxyz");
    }
  );

  it("does not insert mouse reports from a terminal click", async () => {
    const onChange = vi.fn();
    const { stdin } = renderInput(<Harness onChange={onChange} />);
    await write(stdin, "\x1b[<0;6;2M\x1b[<0;6;2m\x1b[<0;15;8M\x1b[<0;15;8m");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("deletes the preceding character for terminal DEL Backspace", async () => {
    const onChange = vi.fn();
    const { stdin } = renderInput(<Harness initialValue="hello" onChange={onChange} />);
    await write(stdin, "\x7f");
    expect(onChange).toHaveBeenLastCalledWith("hell");
  });
  it("preserves text, edits and submission coalesced in one stdin chunk", async () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();
    const { stdin } = renderInput(<Harness onChange={onChange} onSubmit={onSubmit} />);
    await write(stdin, "hello\x7f!\r");
    expect(onChange).toHaveBeenLastCalledWith("hell!");
    expect(onSubmit).toHaveBeenLastCalledWith("hell!");
  });

  it("keeps forward Delete separate from Backspace and supports Home/End", async () => {
    const onChange = vi.fn();
    const { stdin } = renderInput(<Harness initialValue="hello" onChange={onChange} />);
    await write(stdin, "\x1b[H\x1b[3~\x1b[F\x7f");
    expect(onChange).toHaveBeenLastCalledWith("ell");
  });

  it("reassembles split reports and paste markers without losing adjacent text", async () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();
    const { stdin } = renderInput(<Harness onChange={onChange} onSubmit={onSubmit} />);
    await act(async () => {
      for (const chunk of ["a\x1b", "[<0;6;", "2M\x1b[20", "0~[<0;6;2M ", "中文🙂\x1b[2", "01~b\r"])
        stdin.write(chunk);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(onSubmit).toHaveBeenLastCalledWith("a[<0;6;2M 中文🙂b");
  });

  it("ignores focus replies and keeps graphemes intact when deleting", async () => {
    const onChange = vi.fn();
    const { stdin } = renderInput(<Harness initialValue="中文👨‍👩‍👧‍👦é" onChange={onChange} />);
    await write(stdin, "\x1b[I\x1b[O\x7f\x7f");
    expect(onChange).toHaveBeenLastCalledWith("中文");
  });

  it("handles Kitty Backspace and ignores key release reports", async () => {
    const onChange = vi.fn();
    const { stdin } = renderInput(<Harness initialValue="hello" onChange={onChange} />);
    await write(stdin, "\x1b[127;1u\x1b[127;1:3u");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith("hell");
  });
  it("retains enhanced Enter and word-delete modifiers", async () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();
    const { stdin } = renderInput(
      <Harness multiline initialValue="first word" onChange={onChange} onSubmit={onSubmit} />
    );
    await write(stdin, "\x1b[127;5u\x1b[13;2uword\x1b[H\x1b[3;5~next\x1b[13;5u");
    expect(onSubmit).toHaveBeenLastCalledWith("first \nnext");
  });
});
