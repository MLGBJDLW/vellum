import { Box, useApp, useInput } from "ink";
import { useCallback, useEffect, useRef, useState } from "react";
import { Header } from "./components/header.js";
import { Input } from "./components/input.js";
import { MessageList } from "./components/message-list.js";
import { StatusBar } from "./components/status-bar.js";
import { setShutdownCleanup } from "./index.js";

interface AppProps {
  model: string;
  provider: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

/**
 * Cancellation controller for the current agent operation.
 * Used to wire Ctrl+C and ESC to cancel running operations.
 */
interface CancellationController {
  cancel: (reason?: string) => void;
  isCancelled: boolean;
}

export function App({ model, provider }: AppProps) {
  const { exit } = useApp();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Ref to track current cancellation controller (T031)
  const cancellationRef = useRef<CancellationController | null>(null);

  // Register shutdown cleanup on mount (T030)
  useEffect(() => {
    setShutdownCleanup(() => {
      if (cancellationRef.current) {
        cancellationRef.current.cancel("shutdown");
      }
    });

    return () => {
      setShutdownCleanup(null);
    };
  }, []);

  // Handle Ctrl+C and ESC for cancellation (T031)
  useInput((inputChar, key) => {
    // ESC - cancel operation or exit
    if (key.escape) {
      if (isLoading && cancellationRef.current) {
        // Cancel running operation
        cancellationRef.current.cancel("user_escape");
        setIsLoading(false);
        setMessages((prev) => [...prev, { role: "assistant", content: "[Operation cancelled]" }]);
      } else {
        // No operation running, exit app
        exit();
      }
      return;
    }

    // Ctrl+C - cancel operation (doesn't exit when operation is running)
    if (key.ctrl && inputChar === "c") {
      if (isLoading && cancellationRef.current) {
        cancellationRef.current.cancel("user_ctrl_c");
        setIsLoading(false);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "[Operation cancelled by Ctrl+C]" },
        ]);
      }
      // Note: If not loading, let the default Ctrl+C behavior (exit) happen
      return;
    }
  });

  const handleSubmit = useCallback(async (text: string) => {
    if (!text.trim()) return;

    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
    setIsLoading(true);

    // Create a simple cancellation controller for this operation
    let cancelled = false;
    cancellationRef.current = {
      cancel: (reason) => {
        cancelled = true;
        console.log(`[Cancel] ${reason ?? "user request"}`);
      },
      get isCancelled() {
        return cancelled;
      },
    };

    // TODO: Replace with actual Agent integration
    // When integrated with Agent class:
    // const agent = new Agent({ provider, model });
    // cancellationRef.current = { cancel: agent.cancel.bind(agent), ... };
    // const response = await agent.chat(text);

    // Simulated response (with cancellation check)
    await new Promise<void>((resolve) => {
      const timeoutId = setTimeout(() => {
        if (!cancelled) {
          setMessages((prev) => [...prev, { role: "assistant", content: `[Echo] ${text}` }]);
        }
        resolve();
      }, 500);

      // Check for cancellation
      const checkInterval = setInterval(() => {
        if (cancelled) {
          clearTimeout(timeoutId);
          clearInterval(checkInterval);
          resolve();
        }
      }, 50);
    });

    setIsLoading(false);
    cancellationRef.current = null;
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
