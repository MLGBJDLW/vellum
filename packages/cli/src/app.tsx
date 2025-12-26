import { Box, useApp, useInput } from "ink";
import { useCallback, useState } from "react";
import { Header } from "./components/header.js";
import { Input } from "./components/input.js";
import { MessageList } from "./components/message-list.js";
import { StatusBar } from "./components/status-bar.js";

interface AppProps {
  model: string;
  provider: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

export function App({ model, provider }: AppProps) {
  const { exit } = useApp();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useInput((_, key) => {
    if (key.escape) {
      exit();
    }
  });

  const handleSubmit = useCallback(async (text: string) => {
    if (!text.trim()) return;

    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
    setIsLoading(true);

    // TODO: Integrate with Agent
    setTimeout(() => {
      setMessages((prev) => [...prev, { role: "assistant", content: `[Echo] ${text}` }]);
      setIsLoading(false);
    }, 500);
  }, []);

  return (
    <Box flexDirection="column" padding={1}>
      <Header model={model} provider={provider} />
      <MessageList messages={messages} />
      <Input value={input} onChange={setInput} onSubmit={handleSubmit} isLoading={isLoading} />
      <StatusBar isLoading={isLoading} />
    </Box>
  );
}
