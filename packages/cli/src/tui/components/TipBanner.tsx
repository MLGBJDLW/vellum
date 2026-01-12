/**
 * TipBanner Component
 *
 * React Ink component for displaying contextual tips.
 * Shows a dismissible banner with tip information.
 *
 * @module tui/components/TipBanner
 */

import { Box, Text, useInput } from "ink";
import type React from "react";
import type { Tip } from "../../onboarding/index.js";
import { useTUITranslation } from "../i18n/index.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the TipBanner component
 */
export interface TipBannerProps {
  /** The tip to display (null to hide) */
  readonly tip: Tip | null;
  /** Callback when the banner is dismissed */
  readonly onDismiss: () => void;
  /** Whether to show in compact mode */
  readonly compact?: boolean;
}

// =============================================================================
// Component
// =============================================================================

/**
 * TipBanner displays contextual tips to help users discover features.
 *
 * @example
 * ```tsx
 * <TipBanner
 *   tip={currentTip}
 *   onDismiss={dismissTip}
 * />
 * ```
 */
export const TipBanner: React.FC<TipBannerProps> = ({ tip, onDismiss, compact = false }) => {
  const { t } = useTUITranslation();

  // Handle dismiss key press
  useInput(
    (input, key) => {
      if (input === "d" || input === "D" || key.escape) {
        onDismiss();
      }
    },
    { isActive: tip !== null }
  );

  // Don't render if no tip
  if (!tip) {
    return null;
  }

  // Compact mode - single line
  if (compact) {
    return (
      <Box>
        <Text color="cyan">
          {tip.icon ?? "💡"} {tip.title}: {tip.content}
          <Text color="gray"> [d] {t("tip.dismiss")}</Text>
        </Text>
      </Box>
    );
  }

  // Full mode - bordered box
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
      marginBottom={1}
    >
      <Box>
        <Text color="cyan" bold>
          {tip.icon ?? "💡"} {tip.title}
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text>{tip.content}</Text>
      </Box>

      {tip.relatedLessonId && (
        <Box marginTop={1}>
          <Text color="gray" dimColor>
            {t("tip.relatedLesson")}: /tutorial {tip.relatedLessonId}
          </Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text color="gray" dimColor>
          [d] {t("tip.dismiss")} | [Esc] {t("tip.dismiss")}
        </Text>
      </Box>
    </Box>
  );
};
