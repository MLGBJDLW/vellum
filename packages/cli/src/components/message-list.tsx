import { Box, Text } from "ink";

interface Message {
  id?: string;
  role: "user" | "assistant";
  content: string;
}

interface MessageListProps {
  messages: Message[];
}

export function MessageList({ messages }: MessageListProps) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      {messages.map((msg, i) => (
        <Box key={msg.id ?? `msg-${i}`} marginBottom={1}>
          <Text color={msg.role === "user" ? "blue" : "green"}>
            {msg.role === "user" ? "You: " : "AI: "}
          </Text>
          <Text>{msg.content}</Text>
        </Box>
      ))}
    </Box>
  );
}
