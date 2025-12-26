// AgentLoop - Core execution loop for agent conversations
// Note: For tool execution, use the new Tool interface from "./types/index.js"
// with ok() and fail() result helpers instead of raw string returns.
// See Events (./events/index.js) for event-driven architecture.

export class AgentLoop {
  private running = false;

  async start(): Promise<void> {
    this.running = true;
    // TODO: Implement main loop
  }

  stop(): void {
    this.running = false;
  }

  isRunning(): boolean {
    return this.running;
  }
}
