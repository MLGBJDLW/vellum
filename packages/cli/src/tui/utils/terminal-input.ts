import { StringDecoder } from "node:string_decoder";
import { PASTE_END, PASTE_START } from "./bracketedPaste.js";
import { parseEnhancedKey } from "./kitty-keyboard-protocol.js";
import { type MouseEvent, parseMouseEvent } from "./mouse-parser.js";

type Frame = { type: "key" | "paste" | "mouse"; data: string };
export interface TerminalInputListener {
  onMouse?: (event: MouseEvent) => void;
  onPaste?: (content: string) => void;
  onPasteState?: (active: boolean) => void;
}

// Ink consumes stdin.read(), not data events. Keep framing and protocol routing
// at that boundary so mouse, paste and keyboard consumers cannot race each other.
// Like pi-tui's StdinBuffer, retain split escape sequences until complete.
class TerminalInput {
  readonly listeners = new Set<TerminalInputListener>();
  readonly originalRead: NodeJS.ReadStream["read"];
  readonly decoder = new StringDecoder("utf8");
  readonly frames: Frame[] = [];
  private frameIndex = 0;
  currentKey = "";
  private pending = "";
  private paste: string[] | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pasteTimer: ReturnType<typeof setTimeout> | undefined;
  private yieldAfterSubmit = false;
  private resumeTimer: ReturnType<typeof setImmediate> | undefined;

  constructor(
    readonly stdin: NodeJS.ReadStream,
    public pasteTimeout: number
  ) {
    this.originalRead = stdin.read;
    stdin.read = this.read;
  }

  private pasteState(active: boolean) {
    for (const listener of this.listeners) listener.onPasteState?.(active);
  }

  private finishPaste(content: string) {
    this.frames.push({ type: "paste", data: content });
    this.paste = undefined;
    if (this.pasteTimer) clearTimeout(this.pasteTimer);
    this.pasteTimer = undefined;
    this.pasteState(false);
  }

  private frame(chunk: string) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.pending += chunk;
    while (this.pending) {
      if (this.paste) {
        const end = this.pending.indexOf(PASTE_END);
        if (end >= 0) {
          this.paste.push(this.pending.slice(0, end));
          const content = this.paste.join("");
          this.pending = this.pending.slice(end + PASTE_END.length);
          this.finishPaste(content);
          continue;
        }
        // Retain only a possible split end marker; append the rest once.
        let keep = Math.min(PASTE_END.length - 1, this.pending.length);
        while (keep && !PASTE_END.startsWith(this.pending.slice(-keep))) keep--;
        this.paste.push(this.pending.slice(0, this.pending.length - keep));
        this.pending = keep ? this.pending.slice(-keep) : "";
        return;
      }

      if (this.pending.startsWith(PASTE_START)) {
        this.pending = this.pending.slice(PASTE_START.length);
        this.paste = [];
        this.pasteState(true);
        this.pasteTimer = setTimeout(() => {
          const content = (this.paste ?? []).join("") + this.pending;
          this.pending = "";
          this.finishPaste(content);
          this.stdin.emit("readable");
        }, this.pasteTimeout);
        this.pasteTimer.unref?.();
        continue;
      }

      let length = 1;
      const first = this.pending.charCodeAt(0);
      if (first === 0x1b) {
        if (this.pending.length === 1) break;
        const second = this.pending[1];
        if (second === "[") {
          if (this.pending.startsWith("\x1b[M")) {
            if (this.pending.length < 6) break;
            length = 6;
          } else {
            // CSI parameters/intermediates end at the first final byte.
            const final = this.pending.slice(2).search(/[@-~]/);
            if (final < 0) {
              // Bound malformed protocol fragments, never ordinary user text.
              if (this.pending.length > 256) this.pending = "";
              break;
            }
            length = final + 3;
          }
        } else if (second === "]" || second === "P" || second === "_") {
          // biome-ignore lint/suspicious/noControlCharactersInRegex: terminal string terminators
          const end = this.pending.slice(2).search(/\x07|\x1b\\/);
          if (end < 0) {
            if (this.pending.length > 4096) this.pending = "";
            break;
          }
          const index = end + 2;
          this.pending = this.pending.slice(index + (this.pending[index] === "\x07" ? 1 : 2));
          continue;
        } else if (second === "O") {
          if (this.pending.length < 3) break;
          length = 3;
        } else {
          length = second === "\x1b" ? 1 : 2;
        }
      } else if (first >= 0x20 && first !== 0x7f) {
        // biome-ignore lint/suspicious/noControlCharactersInRegex: frame control keys separately from text
        const control = this.pending.search(/[\x00-\x1f\x7f]/);
        length = control < 0 ? this.pending.length : control;
      }

      const data = this.pending.slice(0, length);
      this.pending = this.pending.slice(length);
      if (data.startsWith("\x1b[<") || data.startsWith("\x1b[M")) {
        this.frames.push({ type: "mouse", data });
      } else if (
        data !== PASTE_END &&
        !data.startsWith("\x1b[?") &&
        !data.startsWith("\x1b[>") &&
        data !== "\x1b[I" &&
        data !== "\x1b[O"
      ) {
        this.frames.push({ type: "key", data });
      }
    }
    if (this.pending && !this.paste) {
      // Once a mouse report is identified, a slow transport must not turn its
      // remaining coordinates into text after the Escape-key ambiguity timeout.
      if (this.pending.startsWith("\x1b[<") || this.pending.startsWith("\x1b[M")) return;
      this.timer = setTimeout(() => {
        // A lone ESC is a key; an unfinished report must never become text.
        if (this.pending === "\x1b") this.frames.push({ type: "key", data: this.pending });
        this.pending = "";
        this.timer = undefined;
        this.stdin.emit("readable");
      }, 50);
      this.timer.unref?.();
    }
  }

  readonly read: NodeJS.ReadStream["read"] = (size?: number) => {
    // Node may call read(0) internally to refill the stream. Preserve that probe.
    if (size === 0) return this.originalRead.call(this.stdin, size);
    if (this.yieldAfterSubmit) {
      if (!this.resumeTimer) {
        // A submission can clear a controlled input or replace the active form.
        // Let React commit that change before delivering the remaining keys.
        this.resumeTimer = setImmediate(() => {
          this.resumeTimer = undefined;
          this.yieldAfterSubmit = false;
          this.stdin.emit("readable");
        });
      }
      return null;
    }
    while (true) {
      const frame = this.frames[this.frameIndex++];
      if (frame) {
        if (frame.type === "key") {
          this.currentKey = frame.data;
          // Ink conflates DEL (terminal Backspace) and CSI 3~ (Delete).
          // Normalize only the former before Ink discards the original bytes.
          if (frame.data === "\x7f") return "\b";
          if (frame.data === "\x1b\x7f") return "\x1b\b";
          const enhanced = frame.data.endsWith("u") ? parseEnhancedKey(frame.data) : undefined;
          if (enhanced?.eventType === 3) continue;
          if (frame.data === "\r" || enhanced?.keyCode === 13) this.yieldAfterSubmit = true;
          if (enhanced) {
            // Ink's own exit handler sees these bytes before React consumers.
            // Never turn Ctrl+Shift+C/Alt+Ctrl+C into a bare Ctrl+C there.
            if (enhanced.shift || enhanced.alt || enhanced.super) return frame.data;
            let key = enhanced.char;
            if (enhanced.keyCode === 127 || enhanced.keyCode === 8) key = "\b";
            if (enhanced.keyCode === 13) key = "\r";
            if (enhanced.keyCode === 9) key = "\t";
            if (enhanced.keyCode === 27) key = "\x1b";
            if (enhanced.ctrl && key && /^[a-z]$/i.test(key)) {
              key = String.fromCharCode(key.toUpperCase().charCodeAt(0) - 64);
            }
            if (key) return enhanced.alt ? `\x1b${key}` : key;
          }
          return frame.data;
        }
        if (frame.type === "paste") {
          for (const listener of this.listeners) listener.onPaste?.(frame.data);
        } else {
          const event = parseMouseEvent(frame.data);
          if (event) for (const listener of this.listeners) listener.onMouse?.(event);
        }
        continue;
      }
      this.frames.length = 0;
      this.frameIndex = 0;
      const chunk: unknown = this.originalRead.call(this.stdin, size);
      if (chunk === null) return null;
      this.frame(typeof chunk === "string" ? chunk : this.decoder.write(chunk as Buffer));
    }
  };

  dispose() {
    if (this.timer) clearTimeout(this.timer);
    if (this.pasteTimer) clearTimeout(this.pasteTimer);
    if (this.resumeTimer) clearImmediate(this.resumeTimer);
    if (this.stdin.read === this.read) this.stdin.read = this.originalRead;
    this.frames.length = 0;
    this.pending = "";
    this.paste = undefined;
  }
}

const inputs = new WeakMap<NodeJS.ReadStream, TerminalInput>();

/** Share one protocol reader between the existing keyboard, mouse and paste owners. */
export function subscribeTerminalInput(
  stdin: NodeJS.ReadStream,
  listener: TerminalInputListener = {},
  pasteTimeout?: number
): () => void {
  let input = inputs.get(stdin);
  if (!input) {
    input = new TerminalInput(stdin, pasteTimeout ?? 30_000);
    inputs.set(stdin, input);
  }
  if (pasteTimeout !== undefined) input.pasteTimeout = pasteTimeout;
  input.listeners.add(listener);
  const current = input;
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    current.listeners.delete(listener);
    if (current.listeners.size === 0) {
      current.dispose();
      inputs.delete(stdin);
    }
  };
}

export function getCurrentTerminalKey(stdin: NodeJS.ReadStream): string | undefined {
  return inputs.get(stdin)?.currentKey;
}
