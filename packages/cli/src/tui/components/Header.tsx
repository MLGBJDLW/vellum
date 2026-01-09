import type { CodingMode } from "@vellum/core";
import { getIcons } from "@vellum/shared";
import { Box, Text } from "ink";
import { useTheme } from "../theme/index.js";
import { ModeIndicator } from "./ModeIndicator.js";

// =============================================================================
// Constants
// =============================================================================

/** Goldenrod brand color */
const BRAND_COLOR = "#DAA520";

// =============================================================================
// Types
// =============================================================================

interface HeaderProps {
  model: string;
  provider: string;
  /** Current coding mode (T056) */
  mode?: CodingMode;
  /** Current spec phase for spec mode (T056) */
  specPhase?: number;
}

// =============================================================================
// Main Component
// =============================================================================

export function Header({ model, provider, mode, specPhase }: HeaderProps) {
  const icons = getIcons();
  const { theme } = useTheme();

  // Use semantic colors for consistent theming
  const secondaryTextColor = theme.semantic.text.secondary;
  const providerColor = theme.colors.warning;
  const modelColor = theme.colors.success;

  return (
    <Box borderStyle="round" borderColor={BRAND_COLOR} paddingX={1}>
      <Text bold color={BRAND_COLOR}>
        {icons.logo} Vellum
      </Text>
      <Text color={secondaryTextColor}> │ </Text>
      <Text color={providerColor}>{provider}</Text>
      <Text color={secondaryTextColor}>/</Text>
      <Text color={modelColor}>{model}</Text>
      {mode && (
        <>
          <Text color={secondaryTextColor}> │ </Text>
          <ModeIndicator mode={mode} specPhase={specPhase} compact />
        </>
      )}
    </Box>
  );
}
