/**
 * usePermissionHandler Hook (T037)
 *
 * React hook that creates a PermissionAskHandler for use with the permission system.
 * This hook manages permission dialog state and provides a handler function
 * that can be passed to createDefaultPermissionChecker.
 *
 * @module @vellum/cli
 */

import type {
  AskContext,
  PermissionAskHandler,
  PermissionInfo,
  PermissionResponse,
} from "@vellum/core";
import { useCallback, useRef, useState } from "react";

/**
 * Pending permission request waiting for user response.
 */
export interface PendingPermission {
  /** Unique ID for this request */
  id: string;
  /** Permission info from the permission system */
  info: PermissionInfo;
  /** Context from the permission system */
  context: AskContext;
  /** Resolve function to return the user's response */
  resolve: (result: PermissionResponse | undefined) => void;
  /** Timestamp when the request was created */
  timestamp: number;
}

/**
 * Return value of usePermissionHandler hook.
 */
export interface UsePermissionHandlerReturn {
  /** Current pending permission request (if any) */
  pendingPermission: PendingPermission | null;
  /** Whether a permission dialog should be shown */
  isDialogVisible: boolean;
  /** Handler function to pass to the permission system */
  handler: PermissionAskHandler;
  /** Respond to the current permission request */
  respond: (response: PermissionResponse) => void;
}

let requestIdCounter = 0;

/**
 * Hook for managing permission prompts in the CLI.
 *
 * Creates a PermissionAskHandler that can be passed to the permission system.
 * When a permission check returns "ask", this handler is called and the hook
 * updates state to show a dialog.
 *
 * @example
 * ```tsx
 * function App() {
 *   const { pendingPermission, isDialogVisible, handler, respond } = usePermissionHandler();
 *
 *   // Pass handler to permission system
 *   useEffect(() => {
 *     const checker = createDefaultPermissionChecker({ askHandler: handler });
 *     // ... use checker with ToolExecutor
 *   }, [handler]);
 *
 *   return (
 *     <Box>
 *       {isDialogVisible && pendingPermission && (
 *         <PermissionDialog
 *           toolName={pendingPermission.info.toolName}
 *           onResponse={respond}
 *           isActive={true}
 *         />
 *       )}
 *     </Box>
 *   );
 * }
 * ```
 */
export function usePermissionHandler(): UsePermissionHandlerReturn {
  const [pendingPermission, setPendingPermission] = useState<PendingPermission | null>(null);
  const pendingRef = useRef<PendingPermission | null>(null);

  /**
   * Handler function for the permission system.
   * This is called when a permission check returns "ask".
   */
  const handler: PermissionAskHandler = useCallback(
    async (info: PermissionInfo, context: AskContext): Promise<PermissionResponse | undefined> => {
      return new Promise<PermissionResponse | undefined>((resolve) => {
        const id = `perm-${++requestIdCounter}`;
        const pending: PendingPermission = {
          id,
          info,
          context,
          resolve,
          timestamp: Date.now(),
        };

        pendingRef.current = pending;
        setPendingPermission(pending);

        // Handle timeout from the context signal
        context.signal.addEventListener("abort", () => {
          if (pendingRef.current?.id === id) {
            // Timeout - return undefined to let the service handle it
            resolve(undefined);
            pendingRef.current = null;
            setPendingPermission(null);
          }
        });
      });
    },
    []
  );

  /**
   * Respond to the current permission request.
   */
  const respond = useCallback((response: PermissionResponse) => {
    const pending = pendingRef.current;
    if (!pending) {
      console.warn("[usePermissionHandler] No pending permission to respond to");
      return;
    }

    // Resolve the promise with the response directly
    pending.resolve(response);

    // Clear state
    pendingRef.current = null;
    setPendingPermission(null);
  }, []);

  return {
    pendingPermission,
    isDialogVisible: pendingPermission !== null,
    handler,
    respond,
  };
}

export default usePermissionHandler;
