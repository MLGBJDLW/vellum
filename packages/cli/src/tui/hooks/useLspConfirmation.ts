/**
 * LSP Confirmation Queue Hook
 *
 * Manages a queue of LSP server confirmation requests for semi-auto mode.
 * Provides state for the current request and a method to respond.
 *
 * @module tui/hooks/useLspConfirmation
 */

import type { ConfirmationRequest } from "@vellum/lsp";
import { useCallback, useState } from "react";

// =============================================================================
// Types
// =============================================================================

/**
 * Result of useLspConfirmation hook
 */
export interface UseLspConfirmationResult {
  /** Current confirmation request being displayed (null if none) */
  readonly currentRequest: ConfirmationRequest | null;
  /** Respond to the current request */
  readonly respond: (approved: boolean) => void;
  /** Number of pending requests in queue */
  readonly queueLength: number;
  /**
   * Request confirmation from user.
   * This is called by LspHub when an action needs approval.
   */
  readonly requestConfirmation: (request: ConfirmationRequest) => Promise<boolean>;
}

/**
 * Options for useLspConfirmation hook
 */
export interface UseLspConfirmationOptions {
  /**
   * Callback invoked after user responds to a confirmation.
   * Can be used to notify external systems (e.g., LspHub.confirmAutoModeAction).
   */
  readonly onResponse?: (request: ConfirmationRequest, approved: boolean) => Promise<void>;
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook for managing LSP confirmation queue.
 *
 * Maintains a FIFO queue of confirmation requests. The first request in queue
 * is the current one being displayed. When user responds, the next request
 * (if any) becomes current.
 *
 * @param options - Hook options
 * @returns Confirmation state and methods
 *
 * @example
 * ```tsx
 * function App() {
 *   const { currentRequest, respond, requestConfirmation } = useLspConfirmation({
 *     onResponse: async (request, approved) => {
 *       await lspHub.confirmAutoModeAction(request, approved);
 *     },
 *   });
 *
 *   // Pass requestConfirmation to LspHub
 *   useEffect(() => {
 *     lspHub.setConfirmationHandler(requestConfirmation);
 *   }, [requestConfirmation]);
 *
 *   return currentRequest ? (
 *     <LspConfirmDialog request={currentRequest} onConfirm={respond} />
 *   ) : null;
 * }
 * ```
 */
export function useLspConfirmation(
  options: UseLspConfirmationOptions = {}
): UseLspConfirmationResult {
  const { onResponse } = options;

  const [queue, setQueue] = useState<ConfirmationRequest[]>([]);
  const [resolvers, setResolvers] = useState<Map<string, (approved: boolean) => void>>(new Map());

  /**
   * Add a confirmation request to the queue.
   * Returns a promise that resolves when the user responds.
   */
  const requestConfirmation = useCallback((request: ConfirmationRequest): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setQueue((q) => [...q, request]);
      setResolvers((r) => {
        const next = new Map(r);
        next.set(request.serverId, resolve);
        return next;
      });
    });
  }, []);

  /**
   * Respond to the current (first) request in queue.
   * Resolves its promise and removes it from queue.
   */
  const respond = useCallback(
    (approved: boolean) => {
      const current = queue[0];
      if (!current) return;

      // Resolve the pending promise
      const resolver = resolvers.get(current.serverId);
      if (resolver) {
        resolver(approved);
        setResolvers((r) => {
          const next = new Map(r);
          next.delete(current.serverId);
          return next;
        });
      }

      // Remove from queue
      setQueue((q) => q.slice(1));

      // Notify external handler
      void onResponse?.(current, approved);
    },
    [queue, resolvers, onResponse]
  );

  return {
    currentRequest: queue[0] ?? null,
    respond,
    queueLength: queue.length,
    requestConfirmation,
  };
}
