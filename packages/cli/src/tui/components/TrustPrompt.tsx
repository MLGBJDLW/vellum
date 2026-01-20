/**
 * TrustPrompt TUI Component (T060)
 *
 * Displays a trust confirmation prompt for new directories or monorepos.
 * Uses keyboard navigation (Y/N/A/S) for quick interaction.
 *
 * @module tui/components/TrustPrompt
 */

import * as path from "node:path";
import type { TrustPromptInfo, TrustScope } from "@vellum/core";
import { Box, Text, useInput } from "ink";
import type React from "react";
import { useCallback, useState } from "react";
import { useTUITranslation } from "../i18n/index.js";
import { useTheme } from "../theme/index.js";

// =============================================================================
// Types
// =============================================================================

/**
 * User's trust decision
 */
export type TrustDecision = "yes" | "no" | "always" | "skip";

/**
 * Props for TrustPrompt component
 */
export interface TrustPromptProps {
  /** Trust prompt information from TrustManager */
  promptInfo: TrustPromptInfo;
  /** Callback when user makes a decision */
  onDecision: (decision: TrustDecision, scope?: TrustScope) => void;
  /** Optional: base path for relative display */
  basePath?: string;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Format path for display (show relative if possible)
 */
function formatPath(targetPath: string, basePath?: string): string {
  if (!basePath) return targetPath;

  try {
    const relative = path.relative(basePath, targetPath);
    // Only use relative if it's actually shorter and doesn't go up too many levels
    if (relative && !relative.startsWith("..\\..\\..") && !relative.startsWith("../../..")) {
      return relative || ".";
    }
  } catch {
    // Ignore errors
  }

  return targetPath;
}

/**
 * Get monorepo type display name
 */
function getMonorepoTypeName(type: string): string {
  const names: Record<string, string> = {
    npm: "npm workspaces",
    pnpm: "pnpm workspaces",
    yarn: "Yarn workspaces",
    turbo: "Turborepo",
    lerna: "Lerna",
  };
  return names[type] ?? type;
}

// =============================================================================
// Sub-components
// =============================================================================

/**
 * Option button component
 */
function OptionButton({
  label,
  shortcut,
  color,
  isSelected,
}: {
  label: string;
  shortcut: string;
  color: string;
  isSelected?: boolean;
}): React.ReactElement {
  const { theme } = useTheme();

  return (
    <Box marginRight={2}>
      <Text color={isSelected ? theme.colors.primary : color} bold={isSelected}>
        [{shortcut}] {label}
      </Text>
    </Box>
  );
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * TrustPrompt - Interactive trust confirmation dialog
 *
 * Shows detected information and allows user to make trust decision
 * using keyboard shortcuts.
 *
 * @example
 * ```tsx
 * <TrustPrompt
 *   promptInfo={promptInfo}
 *   onDecision={(decision) => handleDecision(decision)}
 * />
 * ```
 */
export function TrustPrompt({
  promptInfo,
  onDecision,
  basePath,
}: TrustPromptProps): React.ReactElement {
  const { theme } = useTheme();
  const { t } = useTUITranslation();
  const [selectedOption, setSelectedOption] = useState<TrustDecision | null>(null);

  // Handle keyboard input
  useInput(
    useCallback(
      (input: string, key) => {
        // Ignore if already selected
        if (selectedOption) return;

        const lowerInput = input.toLowerCase();

        switch (lowerInput) {
          case "y":
            setSelectedOption("yes");
            onDecision("yes", "session");
            break;
          case "n":
            setSelectedOption("no");
            onDecision("no");
            break;
          case "a":
            setSelectedOption("always");
            onDecision("always", "always");
            break;
          case "s":
            setSelectedOption("skip");
            onDecision("skip");
            break;
          default:
            // Enter defaults to "yes"
            if (key.return) {
              setSelectedOption("yes");
              onDecision("yes", "session");
            }
            break;
        }
      },
      [selectedOption, onDecision]
    )
  );

  const isMonorepo = promptInfo.reason === "monorepo";
  const rootDisplay = formatPath(promptInfo.rootPath, basePath);
  const currentDisplay = formatPath(promptInfo.currentPath, basePath);

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.colors.warning}
      paddingX={2}
      paddingY={1}
    >
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color={theme.colors.warning}>
          🔒 {isMonorepo ? t("trust.detected_monorepo") : t("trust.new_project")}
        </Text>
      </Box>

      {/* Info Section */}
      <Box flexDirection="column" marginBottom={1}>
        {isMonorepo && promptInfo.monorepoInfo && (
          <Box>
            <Text color={theme.colors.muted}>
              {t("trust.monorepo_type")}: {getMonorepoTypeName(promptInfo.monorepoInfo.type)}
            </Text>
          </Box>
        )}

        <Box>
          <Text color={theme.colors.info}>
            {t("trust.root_directory")}: <Text bold>{rootDisplay}</Text>
          </Text>
        </Box>

        {isMonorepo && promptInfo.currentPath !== promptInfo.rootPath && (
          <Box>
            <Text color={theme.colors.muted}>
              {t("trust.current_directory")}: {currentDisplay}
            </Text>
          </Box>
        )}

        {isMonorepo && promptInfo.monorepoInfo && promptInfo.monorepoInfo.workspaces.length > 0 && (
          <Box marginTop={1}>
            <Text color={theme.colors.muted}>
              {t("trust.workspaces")}: {promptInfo.monorepoInfo.workspaces.slice(0, 3).join(", ")}
              {promptInfo.monorepoInfo.workspaces.length > 3
                ? ` (+${promptInfo.monorepoInfo.workspaces.length - 3} more)`
                : ""}
            </Text>
          </Box>
        )}
      </Box>

      {/* Question */}
      <Box marginBottom={1}>
        <Text>{t("trust.prompt_trust")}</Text>
      </Box>

      {/* Options */}
      <Box>
        <OptionButton
          label={t("trust.option_yes")}
          shortcut="Y"
          color={theme.colors.success}
          isSelected={selectedOption === "yes"}
        />
        <OptionButton
          label={t("trust.option_no")}
          shortcut="N"
          color={theme.colors.error}
          isSelected={selectedOption === "no"}
        />
        <OptionButton
          label={t("trust.option_always")}
          shortcut="A"
          color={theme.colors.info}
          isSelected={selectedOption === "always"}
        />
        <OptionButton
          label={t("trust.option_skip")}
          shortcut="S"
          color={theme.colors.muted}
          isSelected={selectedOption === "skip"}
        />
      </Box>

      {/* Result indicator */}
      {selectedOption && (
        <Box marginTop={1}>
          {selectedOption === "yes" || selectedOption === "always" ? (
            <Text color={theme.colors.success}>✓ {t("trust.added")}</Text>
          ) : selectedOption === "no" ? (
            <Text color={theme.colors.error}>✗ {t("trust.denied")}</Text>
          ) : (
            <Text color={theme.colors.muted}>⊘ {t("trust.skipped")}</Text>
          )}
        </Box>
      )}
    </Box>
  );
}

// =============================================================================
// Exports
// =============================================================================

export default TrustPrompt;
