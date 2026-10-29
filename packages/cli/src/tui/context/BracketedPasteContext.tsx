/** Bracketed paste subscriptions, routed through the shared terminal reader. */
import { useStdin } from "ink";
import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { tuiConfig } from "../components/theme/tokens.js";
import { disableBracketedPaste, enableBracketedPaste } from "../utils/bracketedPaste.js";
import { subscribeTerminalInput } from "../utils/terminal-input.js";

export type PasteHandler = (content: string) => void;

interface BracketedPasteContextValue {
  subscribe: (handler: PasteHandler) => () => void;
  isPasting: boolean;
}

const BracketedPasteContext = createContext<BracketedPasteContextValue | null>(null);

interface BracketedPasteProviderProps {
  children: ReactNode;
  enabled?: boolean;
}

export function BracketedPasteProvider({ children, enabled = true }: BracketedPasteProviderProps) {
  const { stdin } = useStdin();
  const [isPasting, setIsPasting] = useState(false);
  const subscribersRef = useRef(new Set<PasteHandler>());
  const subscribe = useCallback((handler: PasteHandler) => {
    subscribersRef.current.add(handler);
    return () => {
      subscribersRef.current.delete(handler);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const unsubscribe = subscribeTerminalInput(
      stdin,
      {
        onPaste(content) {
          if (content) for (const handler of subscribersRef.current) handler(content);
        },
        onPasteState: setIsPasting,
      },
      tuiConfig.paste.timeoutMs
    );
    if (process.stdout.isTTY) enableBracketedPaste();
    const cleanup = () => {
      if (process.stdout.isTTY) disableBracketedPaste();
    };
    process.on("exit", cleanup);
    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
    return () => {
      unsubscribe();
      cleanup();
      process.off("exit", cleanup);
      process.off("SIGINT", cleanup);
      process.off("SIGTERM", cleanup);
    };
  }, [enabled, stdin]);

  const value = useMemo(() => ({ subscribe, isPasting }), [subscribe, isPasting]);
  return <BracketedPasteContext.Provider value={value}>{children}</BracketedPasteContext.Provider>;
}

export function useBracketedPasteContext(): BracketedPasteContextValue {
  const context = useContext(BracketedPasteContext);
  if (!context)
    throw new Error("useBracketedPasteContext must be used within BracketedPasteProvider");
  return context;
}

export function usePasteHandler(handler: PasteHandler): void {
  const context = useContext(BracketedPasteContext);
  useEffect(() => context?.subscribe(handler), [context, handler]);
}

export function useIsPasting(): boolean {
  return useContext(BracketedPasteContext)?.isPasting ?? false;
}
