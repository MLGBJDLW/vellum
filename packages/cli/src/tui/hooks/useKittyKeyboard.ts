/**
 * Kitty Keyboard Protocol Hook
 *
 * React hook that manages the Kitty keyboard protocol lifecycle.
 * Detects support on mount, enables enhanced key reporting,
 * and cleans up on unmount.
 *
 * @module tui/hooks/useKittyKeyboard
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  detectKittyKeyboardProtocol,
  disableKittyKeyboardProtocol,
  enableKittyKeyboardProtocol,
  isKittyKeyboardEnabled,
  isKittyKeyboardSupported,
  reEnableKittyProtocol,
} from "../utils/kitty-keyboard-protocol.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Options for the useKittyKeyboard hook.
 */
export interface UseKittyKeyboardOptions {
  /**
   * Whether to enable Kitty keyboard protocol.
   * When false, detection still runs but protocol is not enabled.
   * @default true
   */
  readonly enabled?: boolean;

  /**
   * Whether to log debug information.
   * @default false
   */
  readonly debug?: boolean;
}

/**
 * Return type for the useKittyKeyboard hook.
 */
export interface UseKittyKeyboardReturn {
  /**
   * Whether the terminal supports Kitty keyboard protocol.
   * null while detection is in progress.
   */
  readonly isSupported: boolean | null;

  /**
   * Whether Kitty keyboard protocol is currently enabled.
   */
  readonly isEnabled: boolean;

  /**
   * Manually enable Kitty keyboard protocol.
   * Useful after returning from external processes.
   */
  readonly enable: () => void;

  /**
   * Manually disable Kitty keyboard protocol.
   * Useful before spawning external processes.
   */
  readonly disable: () => void;

  /**
   * Re-enable protocol if supported but currently disabled.
   * Convenience method for restoring state after external processes.
   */
  readonly restore: () => void;
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook to manage Kitty keyboard protocol lifecycle.
 *
 * Detects Kitty keyboard protocol support on mount, enables it if supported,
 * and properly cleans up on unmount. Also handles process exit signals.
 *
 * @example
 * ```tsx
 * function App() {
 *   const { isSupported, isEnabled, restore } = useKittyKeyboard();
 *
 *   // Log status for debugging
 *   useEffect(() => {
 *     if (isSupported !== null) {
 *       console.debug(`Kitty protocol: supported=${isSupported}, enabled=${isEnabled}`);
 *     }
 *   }, [isSupported, isEnabled]);
 *
 *   // Restore after spawning editor
 *   const handleEditorExit = () => {
 *     restore();
 *   };
 *
 *   return <MyComponents />;
 * }
 * ```
 *
 * @param options - Configuration options
 * @returns Hook state and control functions
 */
export function useKittyKeyboard(options: UseKittyKeyboardOptions = {}): UseKittyKeyboardReturn {
  const { enabled = true, debug = false } = options;

  // State
  const [isSupported, setIsSupported] = useState<boolean | null>(null);
  const [isEnabled, setIsEnabled] = useState(false);

  // Track if cleanup handlers are registered
  const cleanupRegisteredRef = useRef(false);

  // Debug logger
  const log = useCallback(
    (message: string) => {
      if (debug) {
        console.debug(`[kitty-keyboard] ${message}`);
      }
    },
    [debug]
  );

  // Enable handler
  const enable = useCallback(() => {
    if (isKittyKeyboardSupported() && !isKittyKeyboardEnabled()) {
      enableKittyKeyboardProtocol();
      setIsEnabled(true);
      log("Enabled");
    }
  }, [log]);

  // Disable handler
  const disable = useCallback(() => {
    if (isKittyKeyboardEnabled()) {
      disableKittyKeyboardProtocol();
      setIsEnabled(false);
      log("Disabled");
    }
  }, [log]);

  // Restore handler (re-enable if supported)
  const restore = useCallback(() => {
    reEnableKittyProtocol();
    setIsEnabled(isKittyKeyboardEnabled());
    log("Restored");
  }, [log]);

  // Detection and initialization effect
  useEffect(() => {
    let cancelled = false;

    const init = async (): Promise<void> => {
      log("Detecting protocol support...");

      const supported = await detectKittyKeyboardProtocol();

      if (cancelled) {
        return;
      }

      setIsSupported(supported);
      log(`Detection complete: supported=${supported}`);

      if (supported && enabled) {
        enableKittyKeyboardProtocol();
        setIsEnabled(true);
        log("Enabled after detection");
      }
    };

    void init();

    return () => {
      cancelled = true;
    };
  }, [enabled, log]);

  // Cleanup handlers effect
  useEffect(() => {
    if (!isSupported || cleanupRegisteredRef.current) {
      return;
    }

    const cleanup = (): void => {
      try {
        disableKittyKeyboardProtocol();
      } catch {
        // Ignore errors during cleanup
      }
    };

    // Handle various exit scenarios
    const handleSignal = (): void => {
      cleanup();
    };

    const handleExit = (): void => {
      cleanup();
    };

    // Register cleanup handlers
    process.on("SIGINT", handleSignal);
    process.on("SIGTERM", handleSignal);
    process.on("beforeExit", handleExit);
    process.on("exit", handleExit);

    cleanupRegisteredRef.current = true;

    return () => {
      // Disable protocol on unmount
      cleanup();

      // Remove event listeners
      process.off("SIGINT", handleSignal);
      process.off("SIGTERM", handleSignal);
      process.off("beforeExit", handleExit);
      process.off("exit", handleExit);

      cleanupRegisteredRef.current = false;
    };
  }, [isSupported]);

  // Sync enabled state from module
  useEffect(() => {
    setIsEnabled(isKittyKeyboardEnabled());
  }, []);

  return {
    isSupported,
    isEnabled,
    enable,
    disable,
    restore,
  };
}
