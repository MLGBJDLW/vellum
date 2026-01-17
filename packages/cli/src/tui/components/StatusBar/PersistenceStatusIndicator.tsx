/**
 * PersistenceStatusIndicator Component
 *
 * Status indicator for session persistence state.
 * Displays save status, unsaved message count, and timing info.
 *
 * @module tui/components/StatusBar/PersistenceStatusIndicator
 */

import { getIcons } from "@vellum/shared";
import { Box, Text } from "ink";
import type React from "react";
import { useMemo } from "react";
import type { PersistenceStatus } from "../../hooks/usePersistence.js";
import { useTUITranslation } from "../../i18n/index.js";
import { useTheme } from "../../theme/index.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the PersistenceStatusIndicator component
 */
export interface PersistenceStatusIndicatorProps {
  /** Current persistence status */
  readonly status: PersistenceStatus;
  /** Number of unsaved messages */
  readonly unsavedCount?: number;
  /** Timestamp of last successful save */
  readonly lastSavedAt?: Date | null;
  /** Whether to use compact display mode */
  readonly compact?: boolean;
  /** Whether the indicator is visible */
  readonly visible?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Get icon for a persistence status using the theme icon system.
 */
function getStatusIcon(status: PersistenceStatus): string {
  const icons = getIcons();
  switch (status) {
    case "idle":
      return icons.check; // All good, nothing to save
    case "saving":
      return icons.running; // In progress
    case "saved":
      return icons.success; // Just saved successfully
    case "error":
      return icons.error; // Save failed
  }
}

/**
 * Icon suffix for unsaved state
 */
const UNSAVED_SUFFIX = "•";

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Format relative time from a date.
 *
 * @param date - Date to format
 * @returns Human-readable relative time string
 */
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);

  if (diffSecs < 10) {
    return "just now";
  }
  if (diffSecs < 60) {
    return `${diffSecs}s ago`;
  }
  if (diffMins < 60) {
    return `${diffMins}min ago`;
  }
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  return date.toLocaleDateString();
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * PersistenceStatusIndicator displays the current session save state.
 *
 * Status Icons (using theme icons):
 * - ✔/✦  (green)  - Saved, no unsaved changes
 * - ✔•   (yellow) - Unsaved changes present
 * - ⟳    (blue)   - Save in progress
 * - ✘    (red)    - Save failed
 *
 * Display Modes:
 * - Normal: "✔ saved 2min ago" or "✔• unsaved: 3"
 * - Compact: "✔" or "✔•3"
 *
 * @example
 * ```tsx
 * <PersistenceStatusIndicator
 *   status="idle"
 *   unsavedCount={3}
 *   lastSavedAt={new Date()}
 * />
 * ```
 */
export function PersistenceStatusIndicator({
  status,
  unsavedCount = 0,
  lastSavedAt = null,
  compact = false,
  visible = true,
}: PersistenceStatusIndicatorProps): React.JSX.Element | null {
  const { theme } = useTheme();
  const { t } = useTUITranslation();

  // Determine effective status based on unsaved count
  const effectiveStatus = useMemo((): PersistenceStatus => {
    if (status === "saving" || status === "error") {
      return status;
    }
    if (unsavedCount > 0) {
      return "idle";
    }
    return "saved";
  }, [status, unsavedCount]);

  // Get icon based on status
  const icon = useMemo((): string => {
    const baseIcon = getStatusIcon(effectiveStatus);
    if (effectiveStatus === "idle" && unsavedCount > 0) {
      return `${getStatusIcon("idle")}${UNSAVED_SUFFIX}`;
    }
    return baseIcon;
  }, [effectiveStatus, unsavedCount]);

  // Determine color based on status
  const color = useMemo((): string => {
    switch (effectiveStatus) {
      case "saved":
        return theme.colors.success;
      case "saving":
        return theme.colors.info;
      case "error":
        return theme.colors.error;
      case "idle":
        return unsavedCount > 0 ? theme.colors.warning : theme.semantic.text.muted;
    }
  }, [effectiveStatus, unsavedCount, theme]);

  // Build display text
  const displayText = useMemo((): string => {
    if (compact) {
      // Compact mode: just icon and count if unsaved
      if (unsavedCount > 0 && effectiveStatus !== "saving") {
        return `${icon}${unsavedCount}`;
      }
      return icon;
    }

    // Full mode
    switch (effectiveStatus) {
      case "saving":
        return `${icon} ${t("persistence.saving")}`;
      case "saved":
        if (lastSavedAt) {
          return `${icon} ${t("persistence.saved")} ${formatRelativeTime(lastSavedAt)}`;
        }
        return `${icon} ${t("persistence.saved")}`;
      case "error":
        return `${icon} ${t("persistence.saveError")}`;
      case "idle":
        if (unsavedCount > 0) {
          return `${icon} ${t("persistence.unsaved")}: ${unsavedCount}`;
        }
        return `${icon} ${t("persistence.saved")}`;
    }
  }, [compact, effectiveStatus, unsavedCount, lastSavedAt, icon, t]);

  if (!visible) {
    return null;
  }

  return (
    <Box>
      <Text color={color}>{displayText}</Text>
    </Box>
  );
}

// =============================================================================
// Exports
// =============================================================================

export default PersistenceStatusIndicator;
