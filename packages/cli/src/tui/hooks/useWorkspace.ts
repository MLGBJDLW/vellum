/**
 * useWorkspace Hook
 *
 * Provides current workspace (working directory) information.
 * Returns the directory name and full path for display in the header bar.
 *
 * @module tui/hooks/useWorkspace
 */

import * as path from "node:path";
import { useMemo } from "react";

// =============================================================================
// Types
// =============================================================================

/**
 * Workspace information returned by the hook.
 */
export interface WorkspaceInfo {
  /** Short name of the workspace directory */
  readonly name: string;
  /** Full absolute path to the workspace */
  readonly path: string;
}

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * Hook to get current workspace information.
 *
 * Uses process.cwd() to determine the current working directory.
 * Memoized to avoid recalculation on every render.
 *
 * @returns WorkspaceInfo with name and path
 *
 * @example
 * ```tsx
 * function Header() {
 *   const { name, path } = useWorkspace();
 *   return <Text>{ name}</Text>;
 * }
 * ```
 */
export function useWorkspace(): WorkspaceInfo {
  return useMemo(() => {
    const cwd = process.cwd();
    const name = path.basename(cwd);
    return {
      name,
      path: cwd,
    };
  }, []);
}
