/**
 * UpdateBanner Component (Phase 39)
 *
 * React Ink component for displaying update availability notifications.
 * Shows a dismissible banner when a new version is available.
 *
 * @module tui/components/UpdateBanner
 */

import { Box, Text } from "ink";
import type React from "react";
import { useCallback, useId, useRef, useState } from "react";
import { useInput } from "../hooks/useTerminalInput.js";
import { useTUITranslation } from "../i18n/index.js";
import { Clickable } from "./common/Clickable.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the UpdateBanner component
 */
export interface UpdateBannerProps {
  /** Current installed version */
  readonly currentVersion: string;
  /** Latest available version */
  readonly latestVersion: string;
  /** Release notes URL (optional) */
  readonly releaseNotesUrl?: string;
  /** Whether the banner can be dismissed */
  readonly dismissible?: boolean;
  /** Callback when banner is dismissed */
  readonly onDismiss?: () => void;
  /** Whether to show in compact mode */
  readonly compact?: boolean;
}

// =============================================================================
// Component
// =============================================================================

/**
 * UpdateBanner displays a notification when a new version is available.
 *
 * @example
 * ```tsx
 * <UpdateBanner
 *   currentVersion="0.1.0"
 *   latestVersion="0.2.0"
 *   releaseNotesUrl="https://github.com/..."
 *   dismissible
 * />
 * ```
 */
export const UpdateBanner: React.FC<UpdateBannerProps> = ({
  currentVersion,
  latestVersion,
  releaseNotesUrl,
  dismissible = true,
  onDismiss,
  compact = false,
}) => {
  const { t } = useTUITranslation();
  const [dismissed, setDismissed] = useState(false);
  const bannerId = useId();
  const dismissedRef = useRef(false);
  const dismiss = useCallback(() => {
    if (!dismissible || dismissedRef.current) return;
    dismissedRef.current = true;
    setDismissed(true);
    onDismiss?.();
  }, [dismissible, onDismiss]);

  // Handle dismiss key press
  useInput(
    (input, key) => {
      if (dismissible && (input === "d" || input === "D" || key.escape)) {
        dismiss();
      }
    },
    { isActive: dismissible && !dismissed }
  );

  // Don't render if dismissed
  if (dismissed) {
    return null;
  }

  // Compact mode - single line
  if (compact) {
    return (
      <Box>
        <Text color="yellow">⬆ v{latestVersion} available</Text>
        {dismissible && (
          <Clickable id={`${bannerId}-dismiss`} width="auto" onClick={dismiss}>
            <Text color="gray"> {t("update.dismissHint")}</Text>
          </Clickable>
        )}
      </Box>
    );
  }

  // Full mode - bordered box
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1} marginY={1}>
      <Box>
        <Text color="yellow" bold>
          ⬆ {t("update.available")}
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text>
          <Text color="gray">{t("update.current")}</Text>
          <Text>v{currentVersion}</Text>
          <Text color="gray"> → </Text>
          <Text color="green" bold>
            v{latestVersion}
          </Text>
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text color="cyan">{t("update.upgradeHint")}</Text>
      </Box>

      {releaseNotesUrl && (
        <Box marginTop={1}>
          <Text color="gray" dimColor>
            Release notes: {releaseNotesUrl}
          </Text>
        </Box>
      )}

      {dismissible && (
        <Box marginTop={1}>
          <Clickable id={`${bannerId}-dismiss`} width="auto" onClick={dismiss}>
            <Text color="gray" dimColor>
              {t("update.dismissInstructions")}
            </Text>
          </Clickable>
        </Box>
      )}
    </Box>
  );
};

// =============================================================================
// Inline Banner Variant
// =============================================================================

/**
 * Props for the UpdateBannerInline component
 */
export interface UpdateBannerInlineProps {
  /** Latest available version */
  readonly latestVersion: string;
}

/**
 * Inline update banner for use in status bars or headers.
 * Non-dismissible, minimal styling.
 *
 * @example
 * ```tsx
 * <UpdateBannerInline latestVersion="0.2.0" />
 * ```
 */
export const UpdateBannerInline: React.FC<UpdateBannerInlineProps> = ({ latestVersion }) => {
  return (
    <Box>
      <Text backgroundColor="yellow" color="black">
        {" "}
        ⬆ v{latestVersion}{" "}
      </Text>
    </Box>
  );
};
