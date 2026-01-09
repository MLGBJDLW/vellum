import type { CodingMode } from "@vellum/core";
import { getIcons } from "@vellum/shared";
import { Box, Text } from "ink";
import { useTheme } from "../theme/index.js";

// =============================================================================
// Constants
// =============================================================================

/** Goldenrod brand color */
const BRAND_COLOR = "#DAA520";

/** Mode icons for the badge */
const MODE_ICONS: Record<CodingMode, string> = {
  vibe: "◐",
  plan: "◇",
  spec: "◈",
};

// =============================================================================
// Types
// =============================================================================

interface HeaderProps {
  /** Current coding mode (T056) */
  mode?: CodingMode;
  /** Current spec phase for spec mode (T056) */
  specPhase?: number;
}

// =============================================================================
// Main Component
// =============================================================================

export function Header({ mode, specPhase }: HeaderProps) {
  const icons = getIcons();
  const { theme } = useTheme();

  // Get mode badge content
  const modeIcon = mode ? MODE_ICONS[mode] : "◐";
  const modeName = mode ?? "vibe";
  const phaseDisplay = mode === "spec" && specPhase ? ` ${specPhase}/6` : "";

  return (
    <Box flexDirection="row" justifyContent="space-between" width="100%">
      {/* Left: Logo */}
      <Box>
        <Text bold color={BRAND_COLOR}>
          {icons.logo} Vellum
        </Text>
      </Box>

      {/* Right: Mode Badge */}
      <Box>
        <Text color={theme.semantic.text.muted}>[</Text>
        <Text color={BRAND_COLOR}>
          {modeIcon} {modeName}
        </Text>
        {phaseDisplay && <Text color={theme.semantic.text.secondary}>{phaseDisplay}</Text>}
        <Text color={theme.semantic.text.muted}>]</Text>
      </Box>
    </Box>
  );
}
