import { Box, Text } from "ink";

interface HeaderProps {
  model: string;
  provider: string;
}

export function Header({ model, provider }: HeaderProps) {
  return (
    <Box borderStyle="round" paddingX={1} marginBottom={1}>
      <Text bold color="cyan">
        🌀 Vellum
      </Text>
      <Text> | </Text>
      <Text color="yellow">{provider}</Text>
      <Text>/</Text>
      <Text color="green">{model}</Text>
    </Box>
  );
}
