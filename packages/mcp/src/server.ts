export class MCPServer {
  private running = false;

  async start(): Promise<void> {
    // TODO: Implement MCP server
    this.running = true;
  }

  async stop(): Promise<void> {
    this.running = false;
  }

  isRunning(): boolean {
    return this.running;
  }
}
