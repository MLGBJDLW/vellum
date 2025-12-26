import { Box, Text } from "ink";

interface StatusBarProps {
  isLoading: boolean;
}

export function StatusBar({ isLoading }: StatusBarProps) {
  return (
    <Box marginTop={1}>
      <Text dimColor>{isLoading ? "⏳ Processing..." : "Press ESC to exit | Enter to send"}</Text>
    </Box>
  );
}
