import type { CodingMode } from "@vellum/core";
import { getIcons } from "@vellum/shared";
import { Box, Text } from "ink";
import { useTheme } from "../theme/index.js";
import { ModeIndicator } from "./ModeIndicator.js";

interface HeaderProps {
  model: string;
  provider: string;
  /** Current coding mode (T056) */
  mode?: CodingMode;
  /** Current spec phase for spec mode (T056) */
  specPhase?: number;
}

export function Header({ model, provider, mode, specPhase }: HeaderProps) {
  const icons = getIcons();
  const { theme } = useTheme();

  // Use semantic colors for consistent theming
  const accentColor = theme.colors.accent;
  const secondaryTextColor = theme.semantic.text.secondary;
  const providerColor = theme.colors.warning;
  const modelColor = theme.colors.success;

  return (
    <Box borderStyle="round" paddingX={1} marginBottom={1}>
      <Text bold color={accentColor}>
        {icons.logo} Vellum
      </Text>
      <Text color={secondaryTextColor}> | </Text>
      <Text color={providerColor}>{provider}</Text>
      <Text color={secondaryTextColor}>/</Text>
      <Text color={modelColor}>{model}</Text>
      {mode && (
        <>
          <Text color={secondaryTextColor}> | </Text>
          <ModeIndicator mode={mode} specPhase={specPhase} compact />
        </>
      )}
    </Box>
  );
}
