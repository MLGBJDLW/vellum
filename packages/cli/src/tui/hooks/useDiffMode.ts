/**
 * useDiffMode Hook
 *
 * React hook for subscribing to diff view mode changes.
 * Connects DiffView components to the global diff mode state.
 *
 * @module tui/hooks/useDiffMode
 */

import { useEffect, useMemo, useState } from "react";
import { getDiffMode, subscribeDiffMode } from "../../commands/diff-mode.js";
import type { DiffViewMode } from "../i18n/index.js";

/**
 * Hook return type for diff mode state.
 */
export interface UseDiffModeReturn {
  /** Current diff view mode */
  readonly mode: DiffViewMode;
}

/**
 * React hook for subscribing to diff view mode changes.
 *
 * @returns Current diff view mode that updates on change
 *
 * @example
 * ```tsx
 * function MyDiffComponent({ diff }: { diff: string }) {
 *   const { mode } = useDiffMode();
 *   return <DiffView diff={diff} mode={mode} />;
 * }
 * ```
 */
export function useDiffMode(): UseDiffModeReturn {
  const [mode, setMode] = useState<DiffViewMode>(getDiffMode());

  useEffect(() => {
    // Subscribe to mode changes and return unsubscribe function
    return subscribeDiffMode(setMode);
  }, []);

  return useMemo(() => ({ mode }), [mode]);
}
