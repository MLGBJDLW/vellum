/** Return to the single personal-assistant entry; legacy workflows remain explicit overrides. */
import { BUILTIN_CODING_MODES, type CodingMode } from "@vellum/core";
import { Box, Text, useInput } from "ink";
import type React from "react";
import { useTUITranslation } from "../i18n/index.js";
import { useTheme } from "../theme/index.js";

export interface ModeSelectorProps {
  readonly currentMode: CodingMode;
  readonly onSelect: (mode: CodingMode) => void;
  readonly isActive?: boolean;
  readonly showDescriptions?: boolean;
}

export function ModeSelector({
  currentMode,
  onSelect,
  isActive = true,
  showDescriptions = true,
}: ModeSelectorProps): React.ReactElement {
  const { theme } = useTheme();
  const { t } = useTUITranslation();
  useInput(
    (input, key) => {
      if (key.return || input === "1") onSelect("orch");
    },
    { isActive }
  );

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold>{t("modeSelector.title")}</Text>
      <Text color={theme.colors.primary}>
        {isActive ? "❯ " : "  "}[1] orch
        {currentMode === "orch" ? ` ${t("modeSelector.current")}` : ""}
      </Text>
      {showDescriptions && <Text dimColor>{BUILTIN_CODING_MODES.orch.description}</Text>}
      <Text dimColor>{t("modeSelector.keybindings")}</Text>
    </Box>
  );
}

export type { CodingMode };
