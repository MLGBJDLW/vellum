import type { CodingMode } from "@vellum/core";
import { Box, Text } from "ink";
import { ModeIndicator } from "../tui/components/ModeIndicator.js";

interface HeaderProps {
  model: string;
  provider: string;
  /** Current coding mode (T056) */
  mode?: CodingMode;
  /** Current spec phase for spec mode (T056) */
  specPhase?: number;
}

export function Header({ model, provider, mode, specPhase }: HeaderProps) {
  return (
    <Box borderStyle="round" paddingX={1} marginBottom={1}>
      <Text bold color="cyan">
        🌀 Vellum
      </Text>
      <Text> | </Text>
      <Text color="yellow">{provider}</Text>
      <Text>/</Text>
      <Text color="green">{model}</Text>
      {mode && (
        <>
          <Text> | </Text>
          <ModeIndicator mode={mode} specPhase={specPhase} compact />
        </>
      )}
    </Box>
  );
}
