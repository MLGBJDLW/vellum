import type { ApprovalPolicy, CodingMode, SandboxPolicy } from "@vellum/core";
import { Box, useApp, useInput } from "ink";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CommandExecutor,
  CommandRegistry,
  clearCommand,
  createTestContextProvider,
  enhancedAuthCommands,
  exitCommand,
  helpCommand,
  setHelpRegistry,
} from "./commands/index.js";
import { modeSlashCommands } from "./commands/mode.js";
import { Header } from "./components/header.js";
import { Input } from "./components/input.js";
import { MessageList } from "./components/message-list.js";
import { StatusBar } from "./components/status-bar.js";
import { setShutdownCleanup } from "./index.js";
import { RootProvider } from "./tui/context/RootProvider.js";

/**
 * Props for the App component.
 * Extended with coding mode options (T037-T040).
 */
interface AppProps {
  /** Model to use for AI responses */
  model: string;
  /** Provider to use (anthropic, openai, etc.) */
  provider: string;
  /** Initial coding mode (T037) */
  mode?: CodingMode;
  /** Approval policy override (T038) */
  approval?: ApprovalPolicy;
  /** Sandbox policy override (T039) */
  sandbox?: SandboxPolicy;
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

// =============================================================================
// T036: Command Registry Initialization
// =============================================================================

/**
 * Create and initialize the command registry with all builtin commands
 */
function createCommandRegistry(): CommandRegistry {
  const registry = new CommandRegistry();

  // Register core system commands
  registry.register(helpCommand);
  registry.register(clearCommand);
  registry.register(exitCommand);

  // Register auth commands
  for (const cmd of enhancedAuthCommands) {
    registry.register(cmd);
  }

  // T041: Register mode slash commands
  for (const cmd of modeSlashCommands) {
    registry.register(cmd);
  }

  // T041: Plugin commands will be registered by PluginManager
  // at runtime after discovery (kind: 'plugin')

  // Wire up help command to access registry
  setHelpRegistry(registry);

  return registry;
}

export function App({
  model,
  provider,
  mode: _mode = "vibe",
  approval: _approval,
  sandbox: _sandbox,
}: AppProps) {
  const { exit } = useApp();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Ref to track current cancellation controller (T031)
  const cancellationRef = useRef<CancellationController | null>(null);

  // T036: Initialize command registry once on mount
  const commandRegistry = useMemo(() => createCommandRegistry(), []);

  // T036: Create command executor with context provider
  const commandExecutor = useMemo(() => {
    const contextProvider = createTestContextProvider({
      session: {
        id: `session-${Date.now()}`,
        provider,
        cwd: process.cwd(),
      },
      emit: (event, _data) => {
        // Handle app events
        if (event === "app:exit") {
          exit();
        }
        // Log other events for debugging
        // console.log(`[Event] ${event}`, _data);
      },
    });
    return new CommandExecutor(commandRegistry, contextProvider);
  }, [commandRegistry, provider, exit]);

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

  // T038: Handle slash command detection and execution
  const handleSlashCommand = useCallback(
    async (text: string): Promise<boolean> => {
      if (!text.trim().startsWith("/")) {
        return false; // Not a slash command
      }

      // Execute command
      const result = await commandExecutor.execute(text);

      // Handle result
      switch (result.kind) {
        case "success":
          if (result.message) {
            setMessages((prev) => [
              ...prev,
              { role: "assistant" as const, content: result.message ?? "" },
            ]);
          }
          if (result.clearScreen) {
            setMessages([]);
          }
          break;

        case "error":
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `❌ ${result.message}${result.suggestions ? `\n   Did you mean: ${result.suggestions.join(", ")}?` : ""}`,
            },
          ]);
          break;

        case "interactive":
          // For now, show the prompt message - full interactive handling to be added
          setMessages((prev) => [...prev, { role: "assistant", content: result.prompt.message }]);
          break;

        case "pending":
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: result.operation.message },
          ]);
          break;
      }

      return true; // Was a slash command
    },
    [commandExecutor]
  );

  const handleSubmit = useCallback(
    async (text: string) => {
      if (!text.trim()) return;

      setMessages((prev) => [...prev, { role: "user", content: text }]);
      setInput("");

      // T038: Check for slash command first
      const wasCommand = await handleSlashCommand(text);
      if (wasCommand) {
        return; // Command handled, don't continue to agent
      }

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
    },
    [handleSlashCommand]
  );

  return (
    <RootProvider theme="dark">
      <Box flexDirection="column" padding={1}>
        <Header model={model} provider={provider} mode={_mode} />
        <MessageList messages={messages} />
        <Input value={input} onChange={setInput} onSubmit={handleSubmit} isLoading={isLoading} />
        <StatusBar isLoading={isLoading} />
      </Box>
    </RootProvider>
  );
}
