/**
 * Bracketed Paste Hook
 *
 * React hook that enables bracketed paste mode when mounted and ensures
 * proper cleanup on unmount or process exit.
 *
 * @module tui/hooks/useBracketedPaste
 */

import { useEffect } from "react";
import { disableBracketedPaste, enableBracketedPaste } from "../utils/bracketedPaste.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Options for the useBracketedPaste hook
 */
export interface UseBracketedPasteOptions {
  /**
   * Whether bracketed paste mode should be enabled.
   * @default true
   */
  readonly enabled?: boolean;
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook to manage bracketed paste mode lifecycle.
 *
 * Enables bracketed paste mode when the component mounts and disables it
 * on unmount. Also handles process signals (SIGINT, SIGTERM) and beforeExit
 * to ensure the terminal state is properly restored.
 *
 * @example
 * ```tsx
 * function App() {
 *   // Enable bracketed paste for the entire app
 *   useBracketedPaste();
 *
 *   return <MyComponents />;
 * }
 * ```
 *
 * @example
 * ```tsx
 * function ConditionalPaste() {
 *   const [pasteEnabled, setPasteEnabled] = useState(true);
 *
 *   // Conditionally enable/disable
 *   useBracketedPaste({ enabled: pasteEnabled });
 *
 *   return <MyComponents />;
 * }
 * ```
 */
export function useBracketedPaste(options: UseBracketedPasteOptions = {}): void {
  const { enabled = true } = options;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    // Enable bracketed paste mode
    enableBracketedPaste();

    // Cleanup function for graceful shutdown
    const cleanup = () => {
      disableBracketedPaste();
    };

    // Handle various exit scenarios
    const handleSignal = () => {
      cleanup();
      // Let the signal propagate
    };

    const handleExit = () => {
      cleanup();
    };

    // Register cleanup handlers
    process.on("SIGINT", handleSignal);
    process.on("SIGTERM", handleSignal);
    process.on("beforeExit", handleExit);
    process.on("exit", handleExit);

    // Cleanup on unmount or when disabled
    return () => {
      cleanup();

      // Remove event listeners
      process.off("SIGINT", handleSignal);
      process.off("SIGTERM", handleSignal);
      process.off("beforeExit", handleExit);
      process.off("exit", handleExit);
    };
  }, [enabled]);
}
