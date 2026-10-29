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
}: {
  initialValue?: string;
  multiline?: boolean;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <ThemeProvider>
      <BracketedPasteProvider>
        <MouseProvider enabled={false}>
          <TextInput
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
