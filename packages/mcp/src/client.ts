import type { MCPConfig, MCPTool } from "./types.js";

export class MCPClient {
  private _config: MCPConfig;
  private connected = false;

  constructor(config: MCPConfig) {
    this._config = config;
  }

  get config(): MCPConfig {
    return this._config;
  }

  async connect(): Promise<void> {
    // TODO: Implement MCP connection
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async listTools(): Promise<MCPTool[]> {
    // TODO: Implement tool listing
    return [];
  }

  async callTool(_name: string, _params: unknown): Promise<unknown> {
    // TODO: Implement tool calling
    return null;
  }

  isConnected(): boolean {
    return this.connected;
  }
}
