import { Box, Text } from "ink";
import { useTheme } from "../../theme/index.js";

/**
 * SplashScreen component displayed during application initialization.
 * Shows a branded ASCII art logo with loading indicator.
 */
export function SplashScreen() {
  const { theme } = useTheme();

  return (
    <Box flexDirection="column" alignItems="center" justifyContent="center" height="100%">
      <Text bold color={theme.colors.primary}>
        {`
╔═══════════════════════════════════════╗
║                                       ║
║   ◇  V E L L U M                      ║
║                                       ║
║   AI-Powered Coding Assistant         ║
║                                       ║
╚═══════════════════════════════════════╝
`}
      </Text>
      <Text color="gray">Initializing...</Text>
    </Box>
  );
}
