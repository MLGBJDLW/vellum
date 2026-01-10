import type { CodingMode } from "@vellum/core";
import { getIcons } from "@vellum/shared";
import { Box, Text } from "ink";
import { interpolateColor, useShimmer } from "./Banner/index.js";

// =============================================================================
// Constants
// =============================================================================

/** Goldenrod brand color */
const BRAND_COLOR = "#DAA520";

/** Parchment gradient colors for shimmer effect */
const PARCHMENT_COLORS = {
  dark: "#8B4513", // Saddle Brown
  light: "#FFD700", // Gold
};

// =============================================================================
// Types
// =============================================================================

interface HeaderProps {
  /** Current coding mode (T056) */
  mode?: CodingMode;
  /** Current spec phase for spec mode (T056) */
  specPhase?: number;
  /** Whether shimmer animation is enabled (default: true) */
  animated?: boolean;
}

// =============================================================================
// Main Component
// =============================================================================

export function Header({ mode: _mode, specPhase: _specPhase, animated = true }: HeaderProps) {
  const icons = getIcons();
  const { position } = useShimmer({
    cycleDuration: 3000,
    enabled: animated,
  });

  // Calculate color based on shimmer position
  // position 0-0.5: dark → light, position 0.5-1: light → dark
  // Using sine wave for smooth transition
  const color = animated
    ? interpolateColor(PARCHMENT_COLORS.dark, PARCHMENT_COLORS.light, Math.sin(position * Math.PI))
    : BRAND_COLOR;

  // Mode badge removed - now displayed in StatusBar footer instead
  // Props kept for API compatibility

  return (
    <Box flexDirection="row" justifyContent="space-between" width="100%">
      {/* Left: Logo */}
      <Box>
        <Text bold color={color}>
          {icons.logo} Vellum
        </Text>
      </Box>

      {/* Right: Empty - mode indicator moved to StatusBar */}
      <Box />
    </Box>
  );
}
