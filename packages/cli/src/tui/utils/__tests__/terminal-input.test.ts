import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { subscribeTerminalInput } from "../terminal-input.js";

function stream() {
  return new PassThrough() as unknown as NodeJS.ReadStream;
}

function drain(stdin: NodeJS.ReadStream): string[] {
  const result: string[] = [];
  let chunk: string | null = stdin.read();
  while (chunk !== null) {
    result.push(chunk);
    chunk = stdin.read();
  }
  return result;
}

describe("terminal protocol reader", () => {
  it("keeps a recognized split mouse report out of text on a slow connection", () => {
    vi.useFakeTimers();
    try {
      const stdin = stream();
      const onMouse = vi.fn();
      const release = subscribeTerminalInput(stdin, { onMouse });
      stdin.push("\x1b[<0;6;");
      expect(drain(stdin)).toEqual([]);
      vi.advanceTimersByTime(1000);
      stdin.push("2Mtext");
      expect(drain(stdin)).toEqual(["text"]);
      expect(onMouse).toHaveBeenCalledTimes(1);
      release();
      stdin.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("routes every coalesced mouse report while preserving adjacent keyboard input", () => {
    const stdin = stream();
    const onMouse = vi.fn();
    const release = subscribeTerminalInput(stdin, { onMouse });
    stdin.push("a\x1b[<0;6;2M\x1b[<0;6;2m\x1b[M !!b");
    expect(drain(stdin)).toEqual(["a", "b"]);
    expect(onMouse.mock.calls.map(([event]) => [event.action, event.col, event.row])).toEqual([
      ["press", 6, 2],
      ["release", 6, 2],
      ["press", 1, 1],
    ]);
    release();
    stdin.destroy();
  });

  it("decodes UTF-8 split between byte chunks without replacement characters", () => {
    const stdin = stream();
    const release = subscribeTerminalInput(stdin);
    const encoded = Buffer.from("中文🙂");
    const output: string[] = [];
    for (const byte of encoded) {
      stdin.push(Buffer.from([byte]));
      output.push(...drain(stdin));
    }
    expect(output.join("")).toBe("中文🙂");
    release();
    stdin.destroy();
  });

  it("shares the reader and restores the exact original method after final unsubscribe", () => {
    const stdin = stream();
    const original = stdin.read;
    const releasePaste = subscribeTerminalInput(stdin, { onPaste: vi.fn() });
    const wrapped = stdin.read;
    const releaseMouse = subscribeTerminalInput(stdin, { onMouse: vi.fn() });
    expect(stdin.read).toBe(wrapped);
    releasePaste();
    expect(stdin.read).toBe(wrapped);
    releaseMouse();
    expect(stdin.read).toBe(original);
    expect(stdin.listenerCount("data")).toBe(0);
    stdin.destroy();
  });

  it("flushes an incomplete paste once and cancels the timeout on disposal", () => {
    vi.useFakeTimers();
    try {
      const stdin = stream();
      const onPaste = vi.fn();
      const release = subscribeTerminalInput(stdin, { onPaste }, 100);
      stdin.push("\x1b[200~unfinished");
      expect(drain(stdin)).toEqual([]);
      vi.advanceTimersByTime(100);
      drain(stdin);
      expect(onPaste).toHaveBeenCalledExactlyOnceWith("unfinished");
      stdin.push("\x1b[200~discard on exit");
      drain(stdin);
      release();
      vi.advanceTimersByTime(100);
      expect(onPaste).toHaveBeenCalledTimes(1);
      stdin.destroy();
    } finally {
      vi.useRealTimers();
    }
  });
});
