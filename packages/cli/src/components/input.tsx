/**
 * Input Component
 * @module cli/components/input
 */

import { Box, Text } from "ink";
import type { FC } from "react";

export interface InputProps {
  value?: string;
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export const Input: FC<InputProps> = ({ value = "", placeholder = ">" }) => {
  return (
    <Box>
      <Text>
        {placeholder} {value}
      </Text>
    </Box>
  );
};
