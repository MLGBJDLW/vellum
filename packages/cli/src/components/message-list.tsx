/**
 * Message List Component
 * @module cli/components/message-list
 */

import { Box, Text } from "ink";
import type { FC } from "react";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface MessageListProps {
  messages?: Message[];
}

export const MessageList: FC<MessageListProps> = ({ messages = [] }) => {
  return (
    <Box flexDirection="column">
      {messages.map((msg, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: Messages don't have stable IDs
        <Box key={i} marginBottom={1}>
          <Text color={msg.role === "user" ? "green" : "blue"}>
            {msg.role === "user" ? "You: " : "Assistant: "}
          </Text>
          <Text>{msg.content}</Text>
        </Box>
      ))}
    </Box>
  );
};
