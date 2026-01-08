import type { TodoItem } from "@vellum/tool";
import { Box, Text } from "ink";

interface TodoPanelProps {
  items: TodoItem[];
  showProgress?: boolean;
  compact?: boolean;
}

function getStatusLabel(status: TodoItem["status"]): string {
  switch (status) {
    case "done":
      return "[x]";
    case "skipped":
      return "[-]";
    default:
      return "[ ]";
  }
}

function formatProgress(items: TodoItem[]): string {
  const total = items.length;
  const done = items.filter((item) => item.status === "done").length;
  return `${done}/${total}`;
}

export function TodoPanel({
  items,
  showProgress = true,
  compact = false,
}: TodoPanelProps): React.JSX.Element {
  const header = showProgress ? `TODOs (${formatProgress(items)})` : "TODOs";

  if (compact) {
    return (
      <Box>
        <Text>{header}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Text>{header}</Text>
      {items.length === 0 ? (
        <Text dimColor>No todos yet.</Text>
      ) : (
        items.map((item) => (
          <Box key={item.id}>
            <Text>{getStatusLabel(item.status)} </Text>
            <Text>{item.title}</Text>
          </Box>
        ))
      )}
    </Box>
  );
}
