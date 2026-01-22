/**
 * Bracketed Paste Context
 *
 * React context for managing bracketed paste mode state and providing
 * paste event callbacks to child components.
 *
 * @module tui/context/BracketedPasteContext
 */

import { useStdin } from "ink";
import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  disableBracketedPaste,
  enableBracketedPaste,
  PASTE_END,
  PASTE_START,
} from "../utils/bracketedPaste.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Handler function for paste events
 */
export type PasteHandler = (content: string) => void;

/**
 * Context value for bracketed paste
 */
interface BracketedPasteContextValue {
  /**
   * Register a paste event handler
   * @returns Unsubscribe function
   */
  subscribe: (handler: PasteHandler) => () => void;

  /**
   * Whether a paste operation is currently in progress
   */
  isPasting: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/** Timeout for incomplete paste sequences (30 seconds) */
const PASTE_TIMEOUT_MS = 30_000;

// =============================================================================
// Context
// =============================================================================

const BracketedPasteContext = createContext<BracketedPasteContextValue | null>(null);

// =============================================================================
// Provider
// =============================================================================

interface BracketedPasteProviderProps {
  children: ReactNode;
  /**
   * Whether bracketed paste should be enabled
   * @default true
   */
  enabled?: boolean;
}

/**
 * Provider component that enables bracketed paste mode and dispatches
 * paste events to subscribers.
 *
 * This provider intercepts stdin data events to detect paste sequences
 * before Ink's useInput processes them. When a paste is detected, the
 * content is buffered and dispatched as a single event to all subscribers.
 *
 * @example
 * ```tsx
 * function App() {
 *   return (
 *     <BracketedPasteProvider>
 *       <MyComponents />
 *     </BracketedPasteProvider>
 *   );
 * }
 * ```
 */
export function BracketedPasteProvider({ children, enabled = true }: BracketedPasteProviderProps) {
  const { stdin } = useStdin();
  const [isPasting, setIsPasting] = useState(false);

  // Subscribers for paste events
  const subscribersRef = useRef<Set<PasteHandler>>(new Set());

  // Buffer for accumulating paste content
  const pasteBufferRef = useRef<string>("");

  // Timeout handle for incomplete pastes
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track paste state without triggering re-renders (for emit override)
  const isPastingRef = useRef(false);

  /**
   * Subscribe to paste events
   */
  const subscribe = useCallback((handler: PasteHandler) => {
    subscribersRef.current.add(handler);
    return () => {
      subscribersRef.current.delete(handler);
    };
  }, []);

  /**
   * Dispatch paste content to all subscribers
   */
  const dispatchPaste = useCallback((content: string) => {
    if (content.length === 0) return;

    for (const handler of subscribersRef.current) {
      try {
        handler(content);
      } catch {
        // Ignore handler errors
      }
    }
  }, []);

  /**
   * Clear paste state
   */
  const clearPasteState = useCallback(() => {
    isPastingRef.current = false;
    setIsPasting(false);
    pasteBufferRef.current = "";
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  /**
   * Handle paste start sequence found in data
   */
  const handlePasteStart = useCallback(
    (afterStart: string) => {
      isPastingRef.current = true;
      setIsPasting(true);
      pasteBufferRef.current = "";

      // Set timeout for incomplete paste
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        if (pasteBufferRef.current.length > 0) {
          dispatchPaste(pasteBufferRef.current);
        }
        clearPasteState();
      }, PASTE_TIMEOUT_MS);

      // Check if paste end is in this chunk
      const endIdx = afterStart.indexOf(PASTE_END);
      if (endIdx !== -1) {
        // Complete paste in single data event
        dispatchPaste(afterStart.slice(0, endIdx));
        clearPasteState();
      } else {
        // Partial paste - buffer content
        pasteBufferRef.current = afterStart;
      }
    },
    [dispatchPaste, clearPasteState]
  );

  /**
   * Handle data while paste is in progress
   */
  const handlePasteInProgress = useCallback(
    (str: string) => {
      const endIdx = str.indexOf(PASTE_END);
      if (endIdx !== -1) {
        // Found end - complete the paste
        dispatchPaste(pasteBufferRef.current + str.slice(0, endIdx));
        clearPasteState();
      } else {
        // Still pasting - accumulate
        pasteBufferRef.current += str;
      }
    },
    [dispatchPaste, clearPasteState]
  );

  /**
   * Set up stdin listener for paste detection with emit override.
   * This intercepts data events BEFORE they reach Ink, preventing
   * paste sequences from triggering character-by-character rendering.
   *
   * In test environments (non-TTY), we fall back to prependListener which
   * is less complete but doesn't interfere with test mocks.
   */
  useEffect(() => {
    if (!enabled || !stdin) return;

    // Check if this is a real TTY (not a test mock)
    // In tests, stdin is often a mock that doesn't support emit override well
    const isRealTty = stdin.isTTY === true && typeof stdin.setRawMode === "function";

    // Enable bracketed paste mode (only for real TTYs)
    if (isRealTty) {
      enableBracketedPaste();
    }

    if (isRealTty) {
      // Real TTY: Use emit override for complete blocking
      const originalEmit = stdin.emit.bind(stdin);

      /**
       * Override emit to intercept and block paste data.
       * This ensures paste sequences never reach Ink's input handlers.
       */
      // biome-ignore lint/suspicious/noExplicitAny: stdin.emit has complex overloaded signature
      (stdin as any).emit = (event: string | symbol, ...args: unknown[]): boolean => {
        // Only intercept 'data' events
        if (event !== "data") {
          return originalEmit(event, ...args);
        }

        const data = args[0];
        const str = typeof data === "string" ? data : (data as Buffer).toString("utf8");

        // Check for paste start
        const startIdx = str.indexOf(PASTE_START);
        if (startIdx !== -1 && !isPastingRef.current) {
          // Found paste start - handle it and block from Ink
          // Extract any data before the paste sequence (let it through)
          const beforePaste = str.slice(0, startIdx);
          if (beforePaste.length > 0) {
            originalEmit("data", beforePaste);
          }
          // Process paste start (this sets isPastingRef.current = true)
          handlePasteStart(str.slice(startIdx + PASTE_START.length));
          // Block the paste data from reaching Ink
          return true;
        }

        // If we're in a paste, accumulate and block
        if (isPastingRef.current) {
          handlePasteInProgress(str);
          // Block paste data from reaching Ink
          return true;
        }

        // Normal data - pass through to Ink
        return originalEmit(event, ...args);
      };

      // Cleanup for real TTY
      return () => {
        // biome-ignore lint/suspicious/noExplicitAny: restoring original emit
        (stdin as any).emit = originalEmit;
        clearPasteState();
        disableBracketedPaste();
      };
    }

    // Test environment: Use prependListener (less complete but test-compatible)
    const handleData = (data: Buffer | string) => {
      const str = typeof data === "string" ? data : data.toString("utf8");

      // Check for paste start
      const startIdx = str.indexOf(PASTE_START);
      if (startIdx !== -1 && !isPastingRef.current) {
        handlePasteStart(str.slice(startIdx + PASTE_START.length));
        return;
      }

      // If we're in a paste, look for end or accumulate
      if (isPastingRef.current) {
        handlePasteInProgress(str);
      }
    };

    stdin.prependListener("data", handleData);

    return () => {
      stdin.removeListener("data", handleData);
      clearPasteState();
    };
  }, [enabled, stdin, handlePasteStart, handlePasteInProgress, clearPasteState]);

  // Handle process exit signals
  useEffect(() => {
    if (!enabled) return;

    const cleanup = () => {
      disableBracketedPaste();
    };

    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
    process.on("exit", cleanup);

    return () => {
      process.off("SIGINT", cleanup);
      process.off("SIGTERM", cleanup);
      process.off("exit", cleanup);
    };
  }, [enabled]);

  const value: BracketedPasteContextValue = {
    subscribe,
    isPasting,
  };

  return <BracketedPasteContext.Provider value={value}>{children}</BracketedPasteContext.Provider>;
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook to access the bracketed paste context.
 *
 * @throws Error if used outside of BracketedPasteProvider
 */
export function useBracketedPasteContext(): BracketedPasteContextValue {
  const context = useContext(BracketedPasteContext);
  if (!context) {
    throw new Error("useBracketedPasteContext must be used within BracketedPasteProvider");
  }
  return context;
}

/**
 * Hook to subscribe to paste events.
 *
 * The provided callback will be called whenever a paste operation completes.
 * The callback receives the full pasted content as a single string.
 *
 * @example
 * ```tsx
 * function MyInput({ value, onChange }) {
 *   // Handle paste events
 *   usePasteHandler((pastedText) => {
 *     onChange(value + pastedText);
 *   });
 *
 *   return <Text>{value}</Text>;
 * }
 * ```
 */
export function usePasteHandler(handler: PasteHandler): void {
  const context = useContext(BracketedPasteContext);

  useEffect(() => {
    if (!context) return;
    return context.subscribe(handler);
  }, [context, handler]);
}

/**
 * Hook to check if a paste operation is in progress.
 *
 * @returns true if paste is in progress, false otherwise, or undefined if outside provider
 */
export function useIsPasting(): boolean {
  const context = useContext(BracketedPasteContext);
  return context?.isPasting ?? false;
}
