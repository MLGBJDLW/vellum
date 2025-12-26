import { MCPClient } from "./client.js";
import type { MCPConfig } from "./types.js";

export class MCPRegistry {
  private clients = new Map<string, MCPClient>();

  async register(config: MCPConfig): Promise<MCPClient> {
    const client = new MCPClient(config);
    await client.connect();
    this.clients.set(config.name, client);
    return client;
  }

  get(name: string): MCPClient | undefined {
    return this.clients.get(name);
  }

  list(): MCPClient[] {
    return Array.from(this.clients.values());
  }

  async disconnectAll(): Promise<void> {
    for (const client of this.clients.values()) {
      await client.disconnect();
    }
    this.clients.clear();
  }
}
