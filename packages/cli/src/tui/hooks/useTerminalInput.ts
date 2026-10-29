import { useInput as useInkInput, useStdin } from "ink";
import { useCallback, useEffect } from "react";
import { parseEnhancedKey } from "../utils/kitty-keyboard-protocol.js";
import { getCurrentTerminalKey, subscribeTerminalInput } from "../utils/terminal-input.js";

/** Keep terminal key identity intact for every editor and global shortcut. */
export function useInput(
  handler: Parameters<typeof useInkInput>[0],
  options?: Parameters<typeof useInkInput>[1]
): void {
  const { stdin } = useStdin();
  useEffect(() => {
    if (options?.isActive === false) return;
    return subscribeTerminalInput(stdin);
  }, [stdin, options?.isActive]);

  useInkInput(
    useCallback(
      (input, key) => {
        const raw = getCurrentTerminalKey(stdin);
        const enhanced = raw?.endsWith("u") ? parseEnhancedKey(raw) : undefined;
        if (enhanced) {
          if (enhanced.eventType === 3) return;
          const code = enhanced.keyCode;
          const backspace = code === 127 || code === 8;
          const special = backspace || code === 13 || code === 9 || code === 27;
          input = special ? "" : (enhanced.char ?? "");
          if (enhanced.ctrl) input = input.toLowerCase();
          key = {
            ...key,
            ctrl: enhanced.ctrl,
            shift: enhanced.shift,
            meta: enhanced.alt || enhanced.super,
            return: code === 13,
            tab: code === 9,
            escape: code === 27,
            backspace,
          };
        }
        handler(input, key);
      },
      [stdin, handler]
    ),
    options
  );
}
