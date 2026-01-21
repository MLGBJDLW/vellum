import { Box } from "ink";

// Define props for the ChatView component based on what will be moved from app.tsx

export function ChatView() {
  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* MessageList and EnhancedCommandInput will be moved here */}
    </Box>
  );
}
