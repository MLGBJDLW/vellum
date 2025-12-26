import { Box, Text } from "ink";
import TextInput from "ink-text-input";

interface InputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  isLoading: boolean;
}

export function Input({ value, onChange, onSubmit, isLoading }: InputProps) {
  return (
    <Box>
      <Text color="cyan">&gt; </Text>
      <TextInput
        value={value}
        onChange={onChange}
        onSubmit={onSubmit}
        placeholder={isLoading ? "Thinking..." : "Type a message..."}
      />
    </Box>
  );
}
