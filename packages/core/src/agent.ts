import type { Message } from "@vellum/shared";
import type { AgentOptions } from "./types.js";
// Note: For new implementations, use Message from "./types/index.js" instead
// of @vellum/shared. The new Message type provides typed content parts.
// See migration helpers in "./migration/index.js" for converting legacy messages.

export class Agent {
  private _options: AgentOptions;
  private messages: Message[] = [];

  constructor(options: AgentOptions) {
    this._options = options;
  }

  get options(): AgentOptions {
    return this._options;
  }

  async chat(input: string): Promise<string> {
    // TODO: Implement agent loop
    return `[Agent] Received: ${input}`;
  }

  getMessages(): Message[] {
    return [...this.messages];
  }
}
