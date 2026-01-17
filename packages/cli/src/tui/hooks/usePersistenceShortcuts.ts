/**
 * usePersistenceShortcuts Hook
 *
 * React hook for handling keyboard shortcuts for persistence operations.
 * Provides Ctrl+S, Ctrl+Shift+C, and Ctrl+Z shortcuts for save,
 * checkpoint, and rollback panel operations.
 *
 * @module tui/hooks/usePersistenceShortcuts
 */

import { useInput } from "ink";
import { useCallback, useRef } from "react";
import type { UsePersistenceReturn } from "./usePersistence.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Options for the usePersistenceShortcuts hook
 */
export interface UsePersistenceShortcutsOptions {
  /** Persistence hook instance */
  readonly persistence: UsePersistenceReturn | null;
  /** Whether shortcuts are enabled */
  readonly enabled?: boolean;
  /** Callback when save is triggered */
  readonly onSave?: () => void;
  /** Callback when checkpoint is created */
  readonly onCheckpointCreated?: (checkpointId: string) => void;
  /** Callback to open checkpoint panel */
  readonly onOpenCheckpointPanel?: () => void;
  /** Callback when an error occurs */
  readonly onError?: (error: string) => void;
}

/**
 * Return value of the usePersistenceShortcuts hook
 */
export interface UsePersistenceShortcutsReturn {
  /** Manually trigger a save */
  readonly triggerSave: () => Promise<void>;
  /** Manually trigger checkpoint creation */
  readonly triggerCheckpoint: (description?: string) => Promise<string | null>;
  /** Manually open checkpoint/rollback panel */
  readonly openCheckpointPanel: () => void;
  /** Whether shortcuts are currently active */
  readonly isActive: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Keyboard shortcut descriptions for help display
 */
export const PERSISTENCE_SHORTCUTS = {
  save: "Ctrl+S",
  checkpoint: "Ctrl+Shift+C",
  rollbackPanel: "Ctrl+Shift+Z",
} as const;

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * usePersistenceShortcuts - Hook for persistence keyboard shortcuts.
 *
 * Shortcuts:
 * - Ctrl+S: Save session immediately
 * - Ctrl+Shift+C: Create a new checkpoint
 * - Ctrl+Z: Open checkpoint/rollback panel
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const persistence = usePersistence({ ... });
 *   const [showPanel, setShowPanel] = useState(false);
 *
 *   const { isActive } = usePersistenceShortcuts({
 *     persistence,
 *     onSave: () => console.log('Saved'),
 *     onCheckpointCreated: (id) => console.log('Checkpoint:', id),
 *     onOpenCheckpointPanel: () => setShowPanel(true),
 *   });
 *
 *   return (
 *     <Box>
 *       <Text>Shortcuts active: {isActive ? 'Yes' : 'No'}</Text>
 *     </Box>
 *   );
 * }
 * ```
 */
export function usePersistenceShortcuts({
  persistence,
  enabled = true,
  onSave,
  onCheckpointCreated,
  onOpenCheckpointPanel,
  onError,
}: UsePersistenceShortcutsOptions): UsePersistenceShortcutsReturn {
  // Prevent concurrent operations
  const isOperatingRef = useRef(false);

  // Check if shortcuts are active
  const isActive = enabled && persistence !== null;

  /**
   * Trigger a save operation
   */
  const triggerSave = useCallback(async (): Promise<void> => {
    if (!persistence || isOperatingRef.current) {
      return;
    }

    isOperatingRef.current = true;

    try {
      await persistence.forceSave();
      onSave?.();
    } catch (error) {
      onError?.(error instanceof Error ? error.message : "Save failed");
    } finally {
      isOperatingRef.current = false;
    }
  }, [persistence, onSave, onError]);

  /**
   * Trigger checkpoint creation
   */
  const triggerCheckpoint = useCallback(
    async (description?: string): Promise<string | null> => {
      if (!persistence || isOperatingRef.current) {
        return null;
      }

      if (!persistence.isAdvancedEnabled) {
        onError?.("Checkpoints require advanced persistence mode");
        return null;
      }

      isOperatingRef.current = true;

      try {
        const checkpointId = await persistence.createCheckpoint(description);
        if (checkpointId) {
          onCheckpointCreated?.(checkpointId);
        } else {
          onError?.("Failed to create checkpoint");
        }
        return checkpointId;
      } catch (error) {
        onError?.(error instanceof Error ? error.message : "Checkpoint creation failed");
        return null;
      } finally {
        isOperatingRef.current = false;
      }
    },
    [persistence, onCheckpointCreated, onError]
  );

  /**
   * Open the checkpoint/rollback panel
   */
  const openCheckpointPanel = useCallback((): void => {
    if (!persistence) {
      return;
    }

    if (!persistence.isAdvancedEnabled) {
      onError?.("Checkpoints require advanced persistence mode");
      return;
    }

    onOpenCheckpointPanel?.();
  }, [persistence, onOpenCheckpointPanel, onError]);

  /**
   * Handle keyboard input
   */
  useInput(
    (input, key) => {
      if (!isActive || isOperatingRef.current) {
        return;
      }

      // Ctrl+S: Save
      if (key.ctrl && input === "s") {
        void triggerSave();
        return;
      }

      // Ctrl+Shift+C: Create checkpoint
      // Note: In terminal, Ctrl+Shift+C might be captured as just 'C' with ctrl
      if (key.ctrl && key.shift && (input === "c" || input === "C")) {
        void triggerCheckpoint();
        return;
      }

      // Ctrl+Shift+Z: Open rollback panel
      // Changed from Ctrl+Z to avoid conflict with undo shortcut
      // Only trigger if advanced persistence is enabled
      if (
        key.ctrl &&
        key.shift &&
        (input === "z" || input === "Z") &&
        persistence?.isAdvancedEnabled
      ) {
        openCheckpointPanel();
        return;
      }
    },
    { isActive }
  );

  return {
    triggerSave,
    triggerCheckpoint,
    openCheckpointPanel,
    isActive,
  };
}
