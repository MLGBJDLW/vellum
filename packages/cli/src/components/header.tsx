/**
 * Header Component
 * @module cli/components/header
 */

import { Box, Text } from "ink";
import type { FC } from "react";

export interface HeaderProps {
  title?: string;
  model?: string;
  provider?: string;
}

export const Header: FC<HeaderProps> = ({ title = "Vellum", model, provider }) => {
  return (
    <Box borderStyle="single" paddingX={1}>
      <Text bold color="blue">
        {title}
      </Text>
      {model && <Text> | Model: {model}</Text>}
      {provider && <Text> | Provider: {provider}</Text>}
    </Box>
  );
};
