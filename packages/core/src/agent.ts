import { AgentLoop, type AgentLoopConfig, type AgentLoopEvents } from "./agent/index.js";
import { type AgentMode, MODE_CONFIGS } from "./agent/modes.js";
import type { SessionMessage } from "./session/index.js";
import { createMessage, type Message, Parts } from "./types/index.js";

// Note: For new implementations, use Message from "./types/index.js" instead
// of @vellum/shared. The new Message type provides typed content parts.
// See migration helpers in "./migration/index.js" for converting legacy messages.

/**
 * @deprecated Legacy agent options interface.
 * For new implementations, use AgentLoop directly with AgentLoopConfig.
 */
export interface AgentOptions {
  model: string;
  provider: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  tools?: unknown[];
  onMessage?: (message: Message) => void;
  onToolCall?: (toolName: string, params: unknown) => void;
  onError?: (error: Error) => void;
}

/**
 * Extended agent options with mode support.
 */
export interface ExtendedAgentOptions extends AgentOptions {
  /** Agent mode (code, debug, plan, draft, ask) */
  mode?: AgentMode;
}

/**
 * High-level Agent class that wraps AgentLoop for simplified usage.
 *
 * Provides a simple chat() interface while internally using the full
 * AgentLoop state machine for robust execution.
 *
 * @example
 * ```typescript
 * const agent = new Agent({
 *   provider: 'anthropic',
 *   model: 'claude-sonnet-4-20250514',
 * });
 *
 * agent.on('text', (text) => process.stdout.write(text));
 * agent.on('toolStart', (id, name) => console.log(`Tool: ${name}`));
 *
 * const response = await agent.chat('Hello!');
 * ```
 */
export class Agent {
  private _options: ExtendedAgentOptions;
  private messages: Message[] = [];
  private loop: AgentLoop | null = null;
  private sessionId: string;

  constructor(options: ExtendedAgentOptions) {
    this._options = options;
    this.sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  get options(): ExtendedAgentOptions {
    return this._options;
  }

  /**
   * Returns the underlying AgentLoop instance.
   * Creates one if not already initialized.
   */
  getLoop(): AgentLoop {
    if (!this.loop) {
      this.loop = this.createLoop();
    }
    return this.loop;
  }

  /**
   * Creates an AgentLoop with current configuration.
   */
  private createLoop(): AgentLoop {
    const mode = this._options.mode ?? "code";
    const config: AgentLoopConfig = {
      sessionId: this.sessionId,
      mode: MODE_CONFIGS[mode],
      providerType: this._options.provider,
      model: this._options.model,
      cwd: process.cwd(),
    };

    const loop = new AgentLoop(config);

    // Wire loop events to legacy callbacks
    if (this._options.onMessage) {
      loop.on("message", (content) => {
        const message = createMessage("assistant", [Parts.text(content)]);
        this._options.onMessage?.(message);
      });
    }

    if (this._options.onToolCall) {
      loop.on("toolStart", (_id, name, input) => {
        this._options.onToolCall?.(name, input);
      });
    }

    if (this._options.onError) {
      loop.on("error", (error) => {
        this._options.onError?.(error);
      });
    }

    return loop;
  }

  /**
   * Sends a message and runs the agent loop.
   *
   * @param input - User message to process
   * @returns The assistant's text response
   */
  async chat(input: string): Promise<string> {
    // Store user message
    const userMessage = createMessage("user", [Parts.text(input)]);
    this.messages.push(userMessage);

    // Get or create loop
    const loop = this.getLoop();

    // Add message to loop using SessionMessage format
    const sessionMessage: SessionMessage = {
      id: userMessage.id,
      role: "user",
      parts: [{ type: "text", text: input }],
      metadata: {
        createdAt: Date.parse(userMessage.createdAt),
      },
    };
    loop.addMessage(sessionMessage);

    // Collect response text
    let responseText = "";
    const textHandler = (text: string) => {
      responseText += text;
    };
    loop.on("text", textHandler);

    try {
      // Run the loop
      await loop.run();

      // Store assistant message
      if (responseText) {
        const assistantMessage = createMessage("assistant", [Parts.text(responseText)]);
        this.messages.push(assistantMessage);
      }

      return responseText || "[No response]";
    } finally {
      // Remove handler to avoid accumulation
      loop.off("text", textHandler);
    }
  }

  /**
   * Cancels the current operation.
   *
   * @param reason - Optional reason for cancellation
   */
  cancel(reason?: string): void {
    this.loop?.cancel(reason);
  }

  /**
   * Registers an event listener on the underlying AgentLoop.
   *
   * @param event - Event name
   * @param listener - Event handler
   */
  on<K extends keyof AgentLoopEvents>(
    event: K,
    listener: (...args: AgentLoopEvents[K]) => void
  ): this {
    // @ts-expect-error - TypeScript has trouble inferring the exact listener type
    this.getLoop().on(event, listener);
    return this;
  }

  /**
   * Removes an event listener from the underlying AgentLoop.
   *
   * @param event - Event name
   * @param listener - Event handler
   */
  off<K extends keyof AgentLoopEvents>(
    event: K,
    listener: (...args: AgentLoopEvents[K]) => void
  ): this {
    // @ts-expect-error - TypeScript has trouble inferring the exact listener type
    this.getLoop().off(event, listener);
    return this;
  }

  getMessages(): Message[] {
    return [...this.messages];
  }

  /**
   * Returns the session ID.
   */
  getSessionId(): string {
    return this.sessionId;
  }
}
