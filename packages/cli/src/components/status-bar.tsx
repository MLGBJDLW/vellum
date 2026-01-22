/**
 * Status Bar Component
 * @module cli/components/status-bar
 */

import { Box, Text } from "ink";
import type { FC } from "react";

export interface StatusBarProps {
  status?: string;
  model?: string;
  tokens?: number;
}

export const StatusBar: FC<StatusBarProps> = ({ status = "Ready", model, tokens }) => {
  return (
    <Box borderStyle="single" paddingX={1}>
      <Text color="gray">{status}</Text>
      {model && <Text> | {model}</Text>}
      {tokens !== undefined && <Text> | Tokens: {tokens}</Text>}
    </Box>
  );
};
